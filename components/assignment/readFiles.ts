// Expands .zip files and hashes every file before an upload. Runs in a worker
// (staging.worker.ts), so a large upload doesn't freeze the page.
import { unzipSync, type UnzipFileInfo, type Unzipped } from "fflate";
import { MAX_UPLOAD_BYTES } from "@/lib/shared/constants";

export type ReadFile = {
  file: File;
  name: string;
  /** Name of the .zip it came from, if any. */
  zip?: string;
  sha256: string;
  status: "ok" | "skip" | "error";
  msg: string;
};

const JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini|\.ipynb_checkpoints)(\/|$)|(^|\/)\._/;

const MIME: Record<string, string> = {
  ipynb: "application/x-ipynb+json",
  py: "text/x-python",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  csv: "text/csv",
  md: "text/markdown",
  txt: "text/plain",
  json: "application/json",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// Entries are decompressed in batches of about this many bytes, so memory use stays
// close to the size of the .zip instead of the size of everything in it.
const BATCH_BYTES = 32 * 1024 * 1024;

const TOO_LARGE = "Larger than 25 MB, so it can't be uploaded.";

async function sha256(data: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function zipError(err: unknown): string {
  if (err instanceof RangeError) return "This .zip is too large to open in the browser. Split it into smaller .zip files.";
  return "This .zip couldn't be opened. It may be incomplete or damaged; try downloading it again.";
}

/** Why a .zip entry won't be uploaded, decided before reading it, or null to read it. */
function entryCheck(info: UnzipFileInfo, base: string): Pick<ReadFile, "status" | "msg"> | null {
  if (/\.html?$/i.test(base)) return { status: "skip", msg: "HTML files in a .zip aren't uploaded." };
  if (info.originalSize > MAX_UPLOAD_BYTES) return { status: "error", msg: TOO_LARGE };
  if (info.compression !== 0 && info.compression !== 8)
    return { status: "error", msg: "This file uses a compression method the browser can't read. Re-create the .zip with your computer's built-in zip tool." };
  return null;
}

/** Expands .zip files (skipping .html files inside them), checks sizes and computes each file's SHA-256. */
export async function readFiles(input: File[], progress: (done: number, total: number) => void): Promise<ReadFile[]> {
  const errors: ReadFile[] = [];
  const out: ReadFile[] = [];
  const loose = input.filter((f) => !/\.zip$/i.test(f.name) && !JUNK.test(f.name));
  let total = loose.length;
  let done = 0;
  const tick = () => progress(++done, total);

  for (const f of loose) {
    if (!f.size) out.push({ file: f, name: f.name, sha256: "", status: "error", msg: "This file is empty." });
    else if (f.size > MAX_UPLOAD_BYTES) out.push({ file: f, name: f.name, sha256: "", status: "error", msg: TOO_LARGE });
    else out.push({ file: f, name: f.name, sha256: await sha256(await f.arrayBuffer()), status: "ok", msg: "" });
    tick();
  }

  for (const f of input.filter((f) => /\.zip$/i.test(f.name))) {
    let buf: Uint8Array;
    const entries: UnzipFileInfo[] = [];
    try {
      buf = new Uint8Array(await f.arrayBuffer());
      unzipSync(buf, {
        filter: (info) => {
          entries.push(info);
          return false;
        },
      });
    } catch (err) {
      errors.push({ file: f, name: f.name, sha256: "", status: "error", msg: zipError(err) });
      continue;
    }

    // Rows stay in archive order; entries that need reading fill in their row below.
    const rows: ReadFile[] = [];
    const wanted: { info: UnzipFileInfo; i: number }[] = [];
    for (const info of entries) {
      const base = info.name.split("/").pop() || info.name;
      if (info.name.endsWith("/") || JUNK.test(info.name) || !info.originalSize || base.startsWith(".")) continue;
      const check = entryCheck(info, base);
      rows.push({ file: new File([], base), name: base, zip: f.name, sha256: "", status: "error", msg: "", ...check });
      if (check) done++;
      else wanted.push({ info, i: rows.length - 1 });
    }
    total += rows.length;
    progress(done, total);

    for (let start = 0; start < wanted.length; ) {
      let end = start;
      let bytes = 0;
      while (end < wanted.length && (end === start || bytes + wanted[end].info.originalSize <= BATCH_BYTES)) bytes += wanted[end++].info.originalSize;
      const batch = wanted.slice(start, end);
      start = end;
      const names = new Set(batch.map((b) => b.info.name));
      let data: Unzipped = {};
      try {
        data = unzipSync(buf, { filter: (info) => names.has(info.name) });
      } catch {
        // One damaged entry fails the whole batch, so read the entries one at a time to find it.
        for (const name of names) {
          try {
            Object.assign(data, unzipSync(buf, { filter: (info) => info.name === name }));
          } catch {
            /* reported below */
          }
        }
      }
      for (const { info, i } of batch) {
        const row = rows[i];
        const bytesOf = data[info.name];
        if (!bytesOf) row.msg = "This file couldn't be read from the .zip. It may be damaged or password-protected.";
        else {
          const ext = row.name.split(".").pop()?.toLowerCase() || "";
          rows[i] = { ...row, file: new File([bytesOf as BlobPart], row.name, { type: MIME[ext] || "application/octet-stream" }), sha256: await sha256(bytesOf as BufferSource), status: "ok" };
        }
        tick();
      }
    }
    out.push(...rows);
  }
  return [...errors, ...out];
}
