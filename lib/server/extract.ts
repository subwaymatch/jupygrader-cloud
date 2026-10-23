import { unzipSync, strFromU8 } from "fflate";
import { extOf, kindOf } from "@/lib/shared/constants";
import { linesDoc, parasDoc, type SourceDoc } from "@/lib/shared/document";
import { NotebookError, notebookForAI, parseNotebook } from "@/lib/shared/notebook";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^﻿/, "");
}

function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 8000);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return true;
  return false;
}

export function docxText(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  } catch {
    throw new Error("This .docx file couldn't be opened.");
  }
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("This .docx file has no document body.");
  const body = strFromU8(xml);
  return body
    .split(/<\/w:p>/)
    .map((p) =>
      p
        .replace(/<w:tab\/>/g, "\t")
        .replace(/<w:br[^>]*\/>/g, "\n")
        .replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g, "\u0000$1\u0000")
        .split("\u0000")
        .filter((_, i) => i % 2 === 1)
        .join("")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&"),
    )
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function pdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  // pdf.js returns lines; group them into paragraphs of a readable size.
  const paras: string[] = [];
  for (const page of pages) {
    let cur = "";
    for (const line of String(page).split("\n")) {
      const l = line.trim();
      if (!l) {
        if (cur) paras.push(cur), (cur = "");
        continue;
      }
      cur = cur ? cur + " " + l : l;
      if (cur.length > 500 && /[.?!:]$/.test(l)) paras.push(cur), (cur = "");
    }
    if (cur) paras.push(cur);
  }
  return paras.join("\n\n");
}

/** Reads a submitted file into a SourceDoc. Never throws: unreadable files become "unsupported". */
export async function loadSourceDoc(fileName: string, bytes: Uint8Array, contentType = ""): Promise<SourceDoc> {
  const kind = kindOf(fileName);
  const ext = extOf(fileName);
  try {
    if (kind === "notebook") return { type: "notebook", nb: parseNotebook(decodeText(bytes)) };
    if (kind === "image") {
      if (bytes.length > MAX_IMAGE_BYTES) return { type: "unsupported", reason: "This image is larger than 10 MB, so it can't be sent to the AI." };
      const mime = contentType.startsWith("image/") ? contentType : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
      return { type: "image", mime, data: toBase64(bytes) };
    }
    if (ext === "docx") return parasDoc(docxText(bytes), ext, false);
    if (ext === "pdf") {
      const text = await pdfText(bytes);
      if (text.replace(/\s/g, "").length < 20)
        return { type: "unsupported", reason: "This PDF has no selectable text (it may be a scan). Upload the images or a text version instead." };
      return parasDoc(text, ext, false);
    }
    if (kind === "doc") return parasDoc(decodeText(bytes), ext, ext === "md");
    if (kind === "code" || kind === "data") return linesDoc(decodeText(bytes), ext);
    if (!looksBinary(bytes)) return linesDoc(decodeText(bytes), ext);
    return { type: "unsupported", reason: `Files of this type (.${ext || "unknown"}) can't be read for grading.` };
  } catch (err) {
    const msg = err instanceof NotebookError || err instanceof Error ? err.message : "This file couldn't be read.";
    return { type: "unsupported", reason: msg };
  }
}

/** Text of an instructions, rubric or answer-key document, for the AI. */
export async function documentText(fileName: string, bytes: Uint8Array): Promise<string> {
  const ext = extOf(fileName);
  if (ext === "ipynb") {
    try {
      return notebookForAI(parseNotebook(decodeText(bytes)), { maxImages: 0, maxChars: 60_000 }).text;
    } catch {
      return "";
    }
  }
  if (ext === "docx") return docxText(bytes);
  if (ext === "pdf") return pdfText(bytes);
  if (looksBinary(bytes)) return "";
  return decodeText(bytes);
}
