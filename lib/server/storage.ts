import { extOf } from "@/lib/shared/constants";
import type { SourceDoc } from "@/lib/shared/document";
import { getEnv } from "./env";
import { loadSourceDoc } from "./extract";

export function safeName(name: string): string {
  return (name.split("/").pop() || "file").replace(/[^\w.\- ()+]/g, "_").slice(-120) || "file";
}

export const submissionKey = (assignmentId: string, submissionId: string, fileName: string) =>
  `sub/${assignmentId}/${submissionId}/${safeName(fileName)}`;

export const assignmentFileKey = (assignmentId: string, kind: "task" | "rubric" | "key", id: string, fileName: string) =>
  `asg/${assignmentId}/${kind}/${id}-${safeName(fileName)}`;

export async function putFile(key: string, data: ArrayBuffer | Uint8Array | string, contentType: string) {
  await getEnv().FILES.put(key, data, { httpMetadata: { contentType } });
}

export async function getBytes(key: string): Promise<Uint8Array | null> {
  const obj = await getEnv().FILES.get(key);
  if (!obj) return null;
  return new Uint8Array(await obj.arrayBuffer());
}

export async function deleteFiles(keys: string[]) {
  const list = keys.filter(Boolean);
  for (let i = 0; i < list.length; i += 1000) await getEnv().FILES.delete(list.slice(i, i + 1000));
}

export async function deletePrefix(prefix: string) {
  const bucket = getEnv().FILES;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    if (page.objects.length) await bucket.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

/**
 * Loads a submission's file as a SourceDoc. Text extracted from PDFs and Word
 * files is cached next to the file so viewers don't redo the work.
 */
export async function submissionDoc(sub: { r2_key: string | null; file_name: string; content_type: string }): Promise<SourceDoc> {
  if (!sub.r2_key) return { type: "unsupported", reason: "The file has been deleted." };
  const ext = extOf(sub.file_name);
  const cached = ext === "pdf" || ext === "docx";
  const cacheKey = sub.r2_key + ".paras.json";
  if (cached) {
    const c = await getEnv().FILES.get(cacheKey);
    if (c) {
      try {
        const paras = (await c.json()) as string[];
        return { type: "paras", paras, ext, markdown: false };
      } catch {
        /* fall through and re-extract */
      }
    }
  }
  const bytes = await getBytes(sub.r2_key);
  if (!bytes) return { type: "unsupported", reason: "The file is missing from storage." };
  const doc = await loadSourceDoc(sub.file_name, bytes, sub.content_type);
  if (cached && doc.type === "paras") await putFile(cacheKey, JSON.stringify(doc.paras), "application/json");
  return doc;
}

