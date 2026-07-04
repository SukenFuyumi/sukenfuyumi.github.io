import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SourcesManifest } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = resolve(__dirname, "..");

export function loadManifest(): { manifest: SourcesManifest; sourceRoot: string } {
  const manifestPath = resolve(PIPELINE_ROOT, "sources.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as SourcesManifest;
  const sourceRoot = resolve(PIPELINE_ROOT, manifest.sourceRoot);
  return { manifest, sourceRoot };
}

export const OUTPUT_DIR = resolve(PIPELINE_ROOT, "..", "site", "src", "data", "generated");
export const PUBLIC_DIR = resolve(PIPELINE_ROOT, "..", "site", "public");
export const PUBLIC_TEXTURES_DIR = resolve(PIPELINE_ROOT, "..", "site", "public", "textures");
export const PUBLIC_RENDERS_DIR = resolve(PIPELINE_ROOT, "..", "site", "public", "renders");
export { PIPELINE_ROOT };
