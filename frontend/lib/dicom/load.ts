import { DicomLoadError, parseDicomFile, type DicomFrame } from "./parse";
import { buildStudy, type DicomStudy } from "./study";

export interface DicomSource {
  name: string;
  read: () => Promise<ArrayBuffer>;
}

export interface SkippedFile {
  name: string;
  reason: string;
}

export interface LoadResult {
  study: DicomStudy | null;
  skipped: SkippedFile[];
}

export type LoadProgress = (done: number, total: number) => void;

const CONCURRENCY = 6;

export async function loadStudy(sources: DicomSource[], onProgress?: LoadProgress): Promise<LoadResult> {
  const frames: DicomFrame[] = [];
  const skipped: SkippedFile[] = [];
  let next = 0;
  let done = 0;
  onProgress?.(0, sources.length);

  async function worker() {
    while (next < sources.length) {
      const source = sources[next++];
      try {
        frames.push(...parseDicomFile(await source.read(), source.name));
      } catch (e) {
        skipped.push({
          name: source.name,
          reason: e instanceof DicomLoadError ? e.message : `Could not be read: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
      done++;
      onProgress?.(done, sources.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, sources.length) }, worker));
  skipped.sort((a, b) => a.name.localeCompare(b.name));
  return { study: buildStudy(frames), skipped };
}

export function readFileBytes(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export function fileSources(files: File[]): DicomSource[] {
  return files
    .filter((f) => !f.name.startsWith("."))
    .map((file) => ({ name: file.webkitRelativePath || file.name, read: () => readFileBytes(file) }));
}

type Entry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?: (ok: (f: File) => void, fail: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (entries: Entry[]) => void, fail: (e: unknown) => void) => void };
};

async function entryFiles(entry: Entry): Promise<File[]> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((ok, fail) => entry.file!(ok, fail));
    return [file];
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const all: File[] = [];
    // readEntries returns results in batches until it returns an empty array.
    for (;;) {
      const batch = await new Promise<Entry[]>((ok, fail) => reader.readEntries(ok, fail));
      if (batch.length === 0) break;
      for (const child of batch) all.push(...(await entryFiles(child)));
    }
    return all;
  }
  return [];
}

/** Files from a drop, recursing into dropped folders where the browser supports it. */
export async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items ?? []);
  const entries = items
    .map((item) => (item as unknown as { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.())
    .filter((e): e is Entry => Boolean(e));
  if (entries.length === 0) return Array.from(dt.files ?? []);
  const nested = await Promise.all(entries.map(entryFiles));
  return nested.flat();
}
