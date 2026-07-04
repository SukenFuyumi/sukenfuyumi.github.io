import { resolve } from "node:path";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { loadImage } from "@napi-rs/canvas";
import { readText, ZipHandleCache } from "./zipUtil.js";
import { parseGeoModel } from "./bedrockModel.js";
import { renderModel } from "./render.js";
import type { ModelFileEntry } from "./ingest.js";

export class ModelRenderer {
  private written = new Set<string>();
  private failures = 0;
  private successes = 0;

  constructor(private handles: ZipHandleCache, private outputDir: string) {
    if (existsSync(this.outputDir)) rmSync(this.outputDir, { recursive: true, force: true });
    mkdirSync(this.outputDir, { recursive: true });
  }

  get stats() {
    return { successes: this.successes, failures: this.failures };
  }

  async render(modelEntry: ModelFileEntry, textureBytes: Buffer, slug: string): Promise<string | null> {
    const fileName = `${slug}.png`;
    if (this.written.has(fileName)) return `/renders/${fileName}`;

    try {
      const handle = this.handles.get(modelEntry.sourceId);
      if (!handle) return null;
      const geoText = readText(handle, modelEntry.path);
      if (!geoText) return null;
      const model = parseGeoModel(JSON.parse(geoText));
      if (!model) return null;

      const image = await loadImage(textureBytes);
      const png = renderModel(model, image, 256);
      if (!png) {
        this.failures++;
        return null;
      }

      writeFileSync(resolve(this.outputDir, fileName), png);
      this.written.add(fileName);
      this.successes++;
      return `/renders/${fileName}`;
    } catch {
      this.failures++;
      return null;
    }
  }
}
