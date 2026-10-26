"use client";

import { unzip, type Unzipped } from "fflate";
import { api, sha256OfFile } from "@/lib/client/api";
import { MAX_UPLOAD_BYTES } from "@/lib/shared/constants";

export type Staged = {
  file: File;
  name: string;
  /** Name of the .zip it came from, if any. */
  zip?: string;
  sha256: string;
  status: "ok" | "dup" | "error";
  msg: string;
};

const JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini|\.ipynb_checkpoints)(\/|$)|(^|\/)\._/;

function unzipAsync(buf: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => unzip(buf, (err, data) => (err ? reject(err) : resolve(data))));
}

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

/** Expands .zip files, computes SHA-256 hashes and asks the server which files are duplicates. */
export async function stageFiles(assignmentId: string, input: File[]): Promise<Staged[]> {
  const out: Omit<Staged, "sha256" | "status" | "msg">[] = [];
  const errors: Staged[] = [];
  for (const f of input) {
    if (/\.zip$/i.test(f.name)) {
      try {
        const entries = await unzipAsync(new Uint8Array(await f.arrayBuffer()));
        for (const [path, data] of Object.entries(entries)) {
          if (path.endsWith("/") || JUNK.test(path) || !data.length) continue;
          const base = path.split("/").pop() || path;
          if (base.startsWith(".")) continue;
          const ext = base.split(".").pop()?.toLowerCase() || "";
          out.push({ file: new File([data as BlobPart], base, { type: MIME[ext] || "application/octet-stream" }), name: base, zip: f.name });
        }
      } catch {
        errors.push({ file: f, name: f.name, sha256: "", status: "error", msg: "This .zip couldn't be opened." });
      }
    } else if (!JUNK.test(f.name)) {
      out.push({ file: f, name: f.name });
    }
  }
  const staged: Staged[] = [];
  for (const s of out) {
    if (!s.file.size) staged.push({ ...s, sha256: "", status: "error", msg: "This file is empty." });
    else if (s.file.size > MAX_UPLOAD_BYTES) staged.push({ ...s, sha256: "", status: "error", msg: "Larger than 25 MB, so it can't be uploaded." });
    else staged.push({ ...s, sha256: await sha256OfFile(s.file), status: "ok", msg: "" });
  }
  const ok = staged.filter((s) => s.status === "ok");
  if (ok.length) {
    const res = await api<{ files: { name: string; sha256: string; duplicateOf: string | null }[] }>(`/api/assignments/${assignmentId}/check`, {
      body: { files: ok.map((s) => ({ name: s.name, sha256: s.sha256 })) },
    });
    const seen = new Map<string, string>();
    ok.forEach((s, i) => {
      const dup = res.files[i]?.duplicateOf;
      if (dup) {
        s.status = "dup";
        s.msg = `Same as ${dup}, which is already here.`;
      } else if (seen.has(s.sha256)) {
        s.status = "dup";
        s.msg = `Same as ${seen.get(s.sha256)} in this upload.`;
      } else seen.set(s.sha256, s.name);
    });
  }
  return [...errors, ...staged];
}
