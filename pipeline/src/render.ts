import { createCanvas, type Image } from "@napi-rs/canvas";
import type { FlatCube, ParsedModel } from "./bedrockModel.js";

type Vec3 = [number, number, number];

function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

function rotateX([x, y, z]: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [x, y * c - z * s, y * s + z * c];
}
function rotateY([x, y, z]: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c + z * s, y, -x * s + z * c];
}
function rotateZ([x, y, z]: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c, z];
}
function rotateXYZ(v: Vec3, rx: number, ry: number, rz: number): Vec3 {
  return rotateZ(rotateY(rotateX(v, rx), ry), rz);
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

interface UVRect {
  u: number;
  v: number;
  w: number;
  h: number;
}

// Classic Minecraft "box UV" auto-layout (same as Blockbench's Box UV mode).
function boxUvFace(face: string, u: number, v: number, w: number, h: number, d: number): UVRect {
  switch (face) {
    case "up":
      return { u: u + d, v, w, h: d };
    case "down":
      return { u: u + d + w, v, w, h: d };
    case "east":
      return { u, v: v + d, w: d, h };
    case "north":
      return { u: u + d, v: v + d, w, h };
    case "west":
      return { u: u + d + w, v: v + d, w: d, h };
    case "south":
      return { u: u + d + w + d, v: v + d, w, h };
    default:
      return { u, v, w, h };
  }
}

interface ProjectedFace {
  corners: [number, number][]; // TL, TR, BL in screen space (px, before centering)
  uv: UVRect;
  mirror: boolean;
  depth: number;
}

const FACE_NORMALS: Record<string, Vec3> = {
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
  south: [0, 0, 1],
  north: [0, 0, -1],
};

// For each face: the 3 corners (TL, TR, BL) as fractional offsets within the box (0..1 per axis).
const FACE_CORNERS: Record<string, [Vec3, Vec3, Vec3]> = {
  up: [[0, 1, 0], [1, 1, 0], [0, 1, 1]],
  down: [[0, 0, 1], [1, 0, 1], [0, 0, 0]],
  north: [[1, 1, 0], [0, 1, 0], [1, 0, 0]],
  south: [[0, 1, 1], [1, 1, 1], [0, 0, 1]],
  east: [[1, 1, 1], [1, 1, 0], [1, 0, 1]],
  west: [[0, 1, 0], [0, 1, 1], [0, 0, 0]],
};

const CAMERA_YAW = deg2rad(35 + 180);
const CAMERA_PITCH = deg2rad(-22);

function projectCube(cube: FlatCube, tw: number, th: number): ProjectedFace[] {
  const [ox, oy, oz] = cube.origin;
  const [sx, sy, sz] = cube.size;
  const faces: ProjectedFace[] = [];

  for (const faceName of Object.keys(FACE_CORNERS)) {
    const normal = FACE_NORMALS[faceName];
    const [tlF, trF, blF] = FACE_CORNERS[faceName];

    const toModelSpace = (frac: Vec3): Vec3 => {
      let p: Vec3 = [ox + frac[0] * sx, oy + frac[1] * sy, oz + frac[2] * sz];
      for (const step of cube.transformChain) {
        const [rx, ry, rz] = step.rotation;
        p = add(rotateXYZ(sub(p, step.pivot), deg2rad(rx), deg2rad(ry), deg2rad(rz)), step.pivot);
      }
      // Fixed camera: yaw around Y, then pitch around X.
      p = rotateX(rotateY(p, CAMERA_YAW), CAMERA_PITCH);
      return p;
    };

    const tl = toModelSpace(tlF);
    const tr = toModelSpace(trF);
    const bl = toModelSpace(blF);

    // Backface cull using the rotated normal.
    let n = normal;
    for (const step of cube.transformChain) {
      const [rx, ry, rz] = step.rotation;
      n = rotateXYZ(n, deg2rad(rx), deg2rad(ry), deg2rad(rz));
    }
    n = rotateX(rotateY(n, CAMERA_YAW), CAMERA_PITCH);
    if (n[2] <= 0.02) continue; // camera looks down +Z toward the model in view space

    let uv: UVRect;
    if (cube.uv && Array.isArray(cube.uv)) {
      uv = boxUvFace(faceName, cube.uv[0], cube.uv[1], sx, sy, sz);
    } else if (cube.uv && typeof cube.uv === "object" && cube.uv[faceName]) {
      const f = cube.uv[faceName];
      uv = { u: f.uv[0], v: f.uv[1], w: f.uv_size?.[0] ?? sx, h: f.uv_size?.[1] ?? sy };
    } else {
      continue;
    }
    if (Math.abs(uv.w) < 0.01 || Math.abs(uv.h) < 0.01) continue;

    const depth = (tl[2] + tr[2] + bl[2]) / 3;
    faces.push({
      corners: [
        [tl[0], -tl[1]],
        [tr[0], -tr[1]],
        [bl[0], -bl[1]],
      ],
      uv,
      mirror: cube.mirror,
      depth,
    });
  }
  return faces;
}

export function renderModel(model: ParsedModel, texture: Image, canvasSize = 256): Buffer | null {
  const allFaces: ProjectedFace[] = [];
  for (const cube of model.cubes) {
    allFaces.push(...projectCube(cube, model.textureWidth, model.textureHeight));
  }
  if (allFaces.length === 0) return null;

  // Fit the whole model into the canvas.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of allFaces) {
    for (const [x, y] of f.corners) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const modelW = Math.max(maxX - minX, 0.01);
  const modelH = Math.max(maxY - minY, 0.01);
  const margin = 0.12;
  const scale = Math.min((canvasSize * (1 - margin * 2)) / modelW, (canvasSize * (1 - margin * 2)) / modelH);
  const offsetX = canvasSize / 2 - ((minX + maxX) / 2) * scale;
  const offsetY = canvasSize / 2 - ((minY + maxY) / 2) * scale;

  allFaces.sort((a, b) => a.depth - b.depth);

  const canvas = createCanvas(canvasSize, canvasSize);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  for (const face of allFaces) {
    const [tl, tr, bl] = face.corners;
    const x0 = tl[0] * scale + offsetX, y0 = tl[1] * scale + offsetY;
    const x1 = tr[0] * scale + offsetX, y1 = tr[1] * scale + offsetY;
    const x2 = bl[0] * scale + offsetX, y2 = bl[1] * scale + offsetY;

    let { u, v, w, h } = face.uv;
    if (face.mirror) u = u + w; // mirrored box UV reads the face right-to-left

    ctx.save();
    ctx.setTransform((x1 - x0) / w, (y1 - y0) / w, (x2 - x0) / h, (y2 - y0) / h, x0, y0);
    try {
      ctx.drawImage(texture as any, u, v, face.mirror ? -w : w, h, 0, 0, w, h);
    } catch {
      // Out-of-bounds UV on a malformed/edge-case model - skip this face rather than fail the whole render.
    }
    ctx.restore();
  }

  return canvas.toBuffer("image/png");
}
