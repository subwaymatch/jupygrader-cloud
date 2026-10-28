"use client";

import { api } from "@/lib/client/api";
import type { ReadFile } from "./readFiles";
import type { StageMessage } from "./staging.worker";

export type Staged = Omit<ReadFile, "status"> & { status: ReadFile["status"] | "dup" };

/** What staging is doing now: opening a .zip, reading files, or asking the server about duplicates. */
export type StageProgress = { step: "open"; zip: string } | { step: "read"; done: number; total: number } | { step: "check" };

type StageOptions = { signal?: AbortSignal; onProgress?: (p: StageProgress) => void };

/** Expands .zip files and hashes every file in a worker, so the page stays responsive. */
function readInWorker(input: File[], { signal, onProgress }: StageOptions): Promise<ReadFile[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./staging.worker.ts", import.meta.url), { type: "module" });
    const stop = () => {
      worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      stop();
      reject(signal?.reason);
    };
    const fail = (message: string) => {
      stop();
      reject(new Error(message));
    };
    signal?.addEventListener("abort", abort);
    worker.onmessage = (e: MessageEvent<StageMessage>) => {
      const m = e.data;
      if (m.type === "progress") onProgress?.(m.zip ? { step: "open", zip: m.zip } : { step: "read", done: m.done, total: m.total });
      else if (m.type === "done") {
        stop();
        resolve(m.files);
      } else fail(m.message);
    };
    worker.onerror = () => fail("The files couldn't be read. Try again, or split a large .zip into smaller ones.");
    worker.postMessage(input);
  });
}

/** Expands .zip files, computes SHA-256 hashes and asks the server which files are duplicates. Aborting `signal` stops the worker. */
export async function stageFiles(assignmentId: string, input: File[], opts: StageOptions = {}): Promise<Staged[]> {
  const staged: Staged[] = await readInWorker(input, opts);
  const ok = staged.filter((s) => s.status === "ok");
  if (ok.length) {
    opts.onProgress?.({ step: "check" });
    const res = await api<{ files: { name: string; sha256: string; duplicateOf: string | null }[] }>(`/api/assignments/${assignmentId}/check`, {
      body: { files: ok.map((s) => ({ name: s.name, sha256: s.sha256 })) },
      signal: opts.signal,
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
  return staged;
}
