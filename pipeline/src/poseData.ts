import { resolveFolderKey } from "./folderMatch.js";
import { resolveMolangValue } from "./molang.js";
import { readText, type ZipHandleCache } from "./zipUtil.js";

export interface PoseFileEntry {
  sourceId: string;
  path: string;
}

function normalizeFolderName(name: string): string {
  return name.replace(/^\d+_/, "").toLowerCase();
}

function buildFolderIndex(entries: PoseFileEntry[], folderSegment: string): Map<string, PoseFileEntry[]> {
  const index = new Map<string, PoseFileEntry[]>();
  for (const entry of entries) {
    const parts = entry.path.split("/");
    const idx = parts.indexOf(folderSegment);
    if (idx === -1 || idx + 1 >= parts.length) continue;
    const folder = normalizeFolderName(parts[idx + 1]);
    if (!index.has(folder)) index.set(folder, []);
    index.get(folder)!.push(entry);
  }
  return index;
}

export function buildPoserIndex(entries: PoseFileEntry[]): Map<string, PoseFileEntry[]> {
  return buildFolderIndex(entries, "posers");
}

export function buildAnimationIndex(entries: PoseFileEntry[]): Map<string, PoseFileEntry[]> {
  return buildFolderIndex(entries, "animations");
}

// A resting/idle "pose" is used for the Pokedex/summary-screen portrait in
// Cobblemon's own UI (poseTypes PROFILE/PORTRAIT) - matches what the user
// sees in the game's PC box, unlike the model's raw bind pose (often a stiff
// T-pose-ish rest state that only real animation folds into a natural stance).
const POSE_PRIORITY = ["PROFILE", "PORTRAIT", "STAND", "NONE"];

function pickBestPose(poser: any): any | null {
  const poses = poser?.poses;
  if (!poses || typeof poses !== "object") return null;
  for (const wanted of POSE_PRIORITY) {
    for (const pose of Object.values<any>(poses)) {
      if (Array.isArray(pose?.poseTypes) && pose.poseTypes.includes(wanted)) return pose;
    }
  }
  return Object.values<any>(poses)[0] ?? null;
}

function extractBedrockAnimNames(pose: any): string[] {
  const names: string[] = [];
  for (const anim of pose?.animations ?? []) {
    if (typeof anim !== "string") continue;
    const match = anim.match(/q\.bedrock(?:_stateful|_primary)?\(\s*'[^']*'\s*,\s*'([^']+)'/);
    if (match) names.push(match[1]);
  }
  return names;
}

type Vec3 = [number, number, number];

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/**
 * Resolves a "rest frame" (anim_time = 0) set of per-bone rotation offsets
 * from a species' idle/standing pose, so static renders show the same
 * natural stance as Cobblemon's own PC-box/summary-screen portrait instead
 * of the model's bare bind pose. Best-effort throughout: any missing poser,
 * animation, or bone data just means fewer/no offsets, never a thrown error.
 */
export class PoseResolver {
  private cache = new Map<string, Map<string, Vec3> | null>();

  constructor(
    private handles: ZipHandleCache,
    private poserIndex: Map<string, PoseFileEntry[]>,
    private animationIndex: Map<string, PoseFileEntry[]>
  ) {}

  resolve(identifier: string): Map<string, Vec3> | null {
    const id = identifier.toLowerCase();
    if (this.cache.has(id)) return this.cache.get(id)!;
    const result = this.computeUncached(id);
    this.cache.set(id, result);
    return result;
  }

  private readJson(entry: PoseFileEntry): any | null {
    const handle = this.handles.get(entry.sourceId);
    if (!handle) return null;
    const text = readText(handle, entry.path);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  private computeUncached(identifier: string): Map<string, Vec3> | null {
    const poserKey = resolveFolderKey(this.poserIndex, identifier);
    if (!poserKey) return null;
    // A folder can carry more than one poser (e.g. official Cobblemon ships a
    // "special/xxx-example.json" alongside the real one) - try each until one
    // yields a usable pose+animation combo.
    for (const poserEntry of this.poserIndex.get(poserKey) ?? []) {
      const poser = this.readJson(poserEntry);
      if (!poser) continue;
      const rootBone: string = poser.rootBone ?? identifier;
      const pose = pickBestPose(poser);
      if (!pose) continue;
      const animNames = extractBedrockAnimNames(pose);
      if (animNames.length === 0) continue;

      const animKey = resolveFolderKey(this.animationIndex, identifier);
      const animEntries = animKey ? this.animationIndex.get(animKey) ?? [] : [];
      let offsets: Map<string, Vec3> | null = null;
      for (const animEntry of animEntries) {
        const animJson = this.readJson(animEntry);
        if (!animJson?.animations) continue;
        for (const animName of animNames) {
          const anim = animJson.animations[`animation.${rootBone}.${animName}`];
          if (!anim?.bones) continue;
          offsets ??= new Map();
          for (const [boneName, boneData] of Object.entries<any>(anim.bones)) {
            const rotation = boneData?.rotation;
            if (!Array.isArray(rotation) || rotation.length !== 3) continue;
            const resolved: Vec3 = [
              resolveMolangValue(rotation[0]),
              resolveMolangValue(rotation[1]),
              resolveMolangValue(rotation[2]),
            ];
            const existing = offsets.get(boneName);
            offsets.set(boneName, existing ? addVec3(existing, resolved) : resolved);
          }
        }
      }
      if (offsets && offsets.size > 0) return offsets;
    }
    return null;
  }
}
