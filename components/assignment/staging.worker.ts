// Runs readFiles off the main thread and reports progress to staging.ts.
import { readFiles, type ReadFile } from "./readFiles";

export type StageMessage =
  | { type: "progress"; done: number; total: number; zip?: string }
  | { type: "done"; files: ReadFile[] }
  | { type: "error"; message: string };

addEventListener("message", async (e: MessageEvent<File[]>) => {
  try {
    const files = await readFiles(e.data, (done, total, zip) => postMessage({ type: "progress", done, total, zip } satisfies StageMessage));
    postMessage({ type: "done", files } satisfies StageMessage);
  } catch (err) {
    postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) } satisfies StageMessage);
  }
});
