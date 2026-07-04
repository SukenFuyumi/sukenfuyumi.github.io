// Minimal Bedrock entity geometry (.geo.json) reader, scoped to what we need
// for a static "resting pose" render: cube shapes with box-UV or per-face UV.
// Bones fold parts of the model (wings, tails, limbs) into their rest position
// via a baked-in rotation around the bone's own pivot, so a cube's true
// resting position requires walking the whole bone chain up to the root -
// not just the cube's own local rotation.

export interface TransformStep {
  pivot: [number, number, number];
  rotation: [number, number, number];
}

export interface FlatCube {
  origin: [number, number, number];
  size: [number, number, number];
  mirror: boolean;
  uv: any;
  // Innermost (the cube's own rotation, if any) first, root bone last.
  transformChain: TransformStep[];
}

export interface ParsedModel {
  textureWidth: number;
  textureHeight: number;
  cubes: FlatCube[];
}

export function parseGeoModel(json: any, poseOffsets?: Map<string, [number, number, number]> | null): ParsedModel | null {
  const geo = json?.["minecraft:geometry"]?.[0];
  if (!geo) return null;
  const textureWidth = geo.description?.texture_width ?? 64;
  const textureHeight = geo.description?.texture_height ?? 64;
  const cubes: FlatCube[] = [];

  const bonesByName = new Map<string, any>();
  for (const bone of geo.bones ?? []) {
    if (bone?.name) bonesByName.set(bone.name, bone);
  }

  // A bone's effective rest rotation is its bind-pose rotation (from the
  // model file, if any) plus whatever the resolved idle/standing pose
  // contributes for that bone name (if any) - this is what turns a stiff
  // bind-pose "T-pose" render into the natural stance Cobblemon's own UI
  // shows, without needing a full runtime animation system.
  function effectiveRotation(bone: any): [number, number, number] | null {
    const base: [number, number, number] = Array.isArray(bone.rotation) ? bone.rotation : [0, 0, 0];
    const offset = bone.name ? poseOffsets?.get(bone.name) : null;
    if (!offset) return Array.isArray(bone.rotation) ? base : null;
    return [base[0] + offset[0], base[1] + offset[1], base[2] + offset[2]];
  }

  function boneChain(bone: any): TransformStep[] {
    const chain: TransformStep[] = [];
    let current = bone;
    let guard = 0;
    while (current && guard++ < 32) {
      if (Array.isArray(current.pivot)) {
        const rotation = effectiveRotation(current);
        if (rotation) chain.push({ pivot: current.pivot, rotation });
      }
      current = current.parent ? bonesByName.get(current.parent) : null;
    }
    return chain;
  }

  for (const bone of geo.bones ?? []) {
    if (!Array.isArray(bone.cubes)) continue;
    const ancestorChain = boneChain(bone.parent ? bonesByName.get(bone.parent) : null);
    for (const cube of bone.cubes) {
      if (!Array.isArray(cube.origin) || !Array.isArray(cube.size)) continue;
      const transformChain: TransformStep[] = [];
      const cubePivot = cube.pivot ?? bone.pivot;
      if (Array.isArray(cube.rotation) && Array.isArray(cubePivot)) {
        transformChain.push({ pivot: cubePivot, rotation: cube.rotation });
      }
      if (Array.isArray(bone.pivot)) {
        const rotation = effectiveRotation(bone);
        if (rotation) transformChain.push({ pivot: bone.pivot, rotation });
      }
      transformChain.push(...ancestorChain);
      cubes.push({
        origin: cube.origin,
        size: cube.size,
        mirror: !!(cube.mirror ?? bone.mirror),
        uv: cube.uv,
        transformChain,
      });
    }
  }

  if (cubes.length === 0) return null;
  return { textureWidth, textureHeight, cubes: dropOutlierCubes(cubes) };
}

function applyChain(p: [number, number, number], chain: TransformStep[]): [number, number, number] {
  let [x, y, z] = p;
  for (const step of chain) {
    const [px, py, pz] = step.pivot;
    const [rx, ry, rz] = step.rotation.map((d) => (d * Math.PI) / 180);
    let dx = x - px, dy = y - py, dz = z - pz;
    // X
    let cy = Math.cos(rx), sy = Math.sin(rx);
    [dy, dz] = [dy * cy - dz * sy, dy * sy + dz * cy];
    // Y
    let cyy = Math.cos(ry), syy = Math.sin(ry);
    [dx, dz] = [dx * cyy + dz * syy, -dx * syy + dz * cyy];
    // Z
    let cz = Math.cos(rz), sz = Math.sin(rz);
    [dx, dy] = [dx * cz - dy * sz, dx * sz + dy * cz];
    x = dx + px;
    y = dy + py;
    z = dz + pz;
  }
  return [x, y, z];
}

function median(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// Some models keep long thin appendages (vines, wingtips, tails, chained
// segments) stretched out in their rest geometry - they're only folded into
// a natural pose by runtime animation, which this renderer doesn't
// implement. Define the model's "core" from its larger cubes (the main body
// is normally a handful of big cubes, while stray animated appendages are
// chains of many small ones) and drop anything whose resting position falls
// well outside that core, so a static render reads as "the Pokemon" rather
// than a thin limb dominating the frame.
function dropOutlierCubes(cubes: FlatCube[]): FlatCube[] {
  if (cubes.length < 6) return cubes;
  const centers = cubes.map((c) => {
    const mid: [number, number, number] = [c.origin[0] + c.size[0] / 2, c.origin[1] + c.size[1] / 2, c.origin[2] + c.size[2] / 2];
    return applyChain(mid, c.transformChain);
  });
  const volumes = cubes.map((c) => Math.abs(c.size[0] * c.size[1] * c.size[2]));
  const medianVolume = median(volumes);
  // Strictly greater-than: many models have >50% paper-thin/degenerate cubes
  // (volume 0, e.g. flat vine/wing segments), which would otherwise tie at
  // the median and make literally everything count as "core".
  let coreIdx = volumes.map((v, i) => (v > medianVolume ? i : -1)).filter((i) => i >= 0);
  if (coreIdx.length === 0) coreIdx = volumes.map((_, i) => i); // degenerate model (near-uniform volumes) - keep everything as core

  const coreMin: [number, number, number] = [Infinity, Infinity, Infinity];
  const coreMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const i of coreIdx) {
    for (let axis = 0; axis < 3; axis++) {
      coreMin[axis] = Math.min(coreMin[axis], centers[i][axis]);
      coreMax[axis] = Math.max(coreMax[axis], centers[i][axis]);
    }
  }
  const coreSize = [coreMax[0] - coreMin[0], coreMax[1] - coreMin[1], coreMax[2] - coreMin[2]].map((s) => Math.max(s, 4));
  const margin = 1.4;

  return cubes.filter((_, i) => {
    for (let axis = 0; axis < 3; axis++) {
      const m = coreSize[axis] * margin;
      if (centers[i][axis] < coreMin[axis] - m || centers[i][axis] > coreMax[axis] + m) return false;
    }
    return true;
  });
}
