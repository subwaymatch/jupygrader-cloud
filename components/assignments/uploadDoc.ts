"use client";

import { api } from "@/lib/client/api";
import { MAX_DOC_BYTES } from "@/lib/shared/constants";

export type UploadedDoc = { key: string; name: string; size: number; type?: string; hasText?: boolean; preview?: string };

export async function uploadDoc(file: File): Promise<UploadedDoc> {
  if (file.size > MAX_DOC_BYTES) throw new Error("Files can be up to 15 MB.");
  const form = new FormData();
  form.set("file", file);
  return api<UploadedDoc>("/api/uploads", { body: form });
}
