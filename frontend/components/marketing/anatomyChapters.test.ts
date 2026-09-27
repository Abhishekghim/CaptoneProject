import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ANATOMY_CHAPTERS, BONE_NODES, ORGAN_NODES } from "./anatomyChapters";

function glbNodeNames(file: string): Set<string> {
  const buf = readFileSync(file);
  expect(buf.toString("ascii", 0, 4)).toBe("glTF");
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString("utf8", 20, 20 + jsonLength));
  return new Set((json.nodes as { name?: string }[]).map((n) => n.name).filter(Boolean) as string[]);
}

describe("anatomy chapters", () => {
  const modelNodes = glbNodeNames(path.resolve(__dirname, "../../../public/models/anatomy-bodyparts3d.glb"));

  it("references only parts that exist in the shipped model", () => {
    for (const name of [...BONE_NODES, ...ORGAN_NODES]) expect(modelNodes).toContain(name);
    for (const chapter of ANATOMY_CHAPTERS) {
      for (const name of [...chapter.highlight, ...chapter.organs, ...chapter.focus]) {
        expect(modelNodes, `${chapter.id} -> ${name}`).toContain(name);
      }
    }
  });

  it("only reveals organs a chapter also highlights", () => {
    for (const chapter of ANATOMY_CHAPTERS) {
      for (const organ of chapter.organs) expect(chapter.highlight).toContain(organ);
    }
  });

  it("has unique ids and non-empty copy", () => {
    expect(new Set(ANATOMY_CHAPTERS.map((c) => c.id)).size).toBe(ANATOMY_CHAPTERS.length);
    for (const chapter of ANATOMY_CHAPTERS) {
      expect(chapter.title.trim()).not.toBe("");
      expect(chapter.navLabel.trim()).not.toBe("");
      expect(chapter.paragraphs.length).toBeGreaterThan(0);
    }
  });
});
