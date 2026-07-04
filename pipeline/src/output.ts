import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { OUTPUT_DIR } from "./config.js";

export function resetOutputDir() {
  if (existsSync(OUTPUT_DIR)) rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(resolve(OUTPUT_DIR, "pokemon"), { recursive: true });
}

export function writeJson(relativePath: string, data: any) {
  const full = resolve(OUTPUT_DIR, relativePath);
  mkdirSync(resolve(full, ".."), { recursive: true });
  writeFileSync(full, JSON.stringify(data, null, 2), "utf-8");
}
