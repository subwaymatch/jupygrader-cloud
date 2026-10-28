import { waitUntil } from "cloudflare:workers";
import { baseName, extOf, kindOf, type FileKind, type SubmissionStatus } from "@/lib/shared/constants";
import {
  annotateParas,
  annotateSource,
  annotatedNotebook,
  docViewCells,
  htmlNotebook,
  refLabels,
  type DownloadFormat,
  type SourceDoc,
} from "@/lib/shared/document";
import { feedbackHtml, feedbackJson, feedbackTxt, type ExportContext } from "@/lib/shared/exports";
import { parseNotebook, notebookPlainText, type FeedbackHeader } from "@/lib/shared/notebook";
import type {
  GradeResult,
  GradedMeta,
  HistoryEntry,
  NearOf,
  SubmissionDetail,
  SubmissionListItem,
  Usage,
} from "@/lib/shared/types";
import type { AssignmentRow, CourseRow, SubmissionRow } from "./access";
import { all, first, parseJson, run } from "./db";
import { appUrl, getEnv } from "./env";
import { badRequest } from "./http";
import { newId, newShareToken, sha256Hex } from "./ids";
import { hasNbconvert, nbconvertHtml } from "./nbconvert";
import { NEAR_THRESHOLD, minhash, similarity } from "./similarity";
import { getBytes, notebookHtmlKey, putFile, submissionDoc, submissionKey } from "./storage";

export function isOutdated(row: Pick<SubmissionRow, "graded_meta">, asg: Pick<AssignmentRow, "version" | "style">, model?: string) {
  const g = parseJson<GradedMeta | null>(row.graded_meta, null);
  if (!g) return false;
  return g.rubricVersion !== asg.version || g.style !== asg.style || (!!model && g.model !== model);
}

export function toListItem(row: SubmissionRow, asg: AssignmentRow, model?: string): SubmissionListItem {
  const result = parseJson<GradeResult | null>(row.result, null);
  const usage = parseJson<Usage | null>(row.usage, null);
  const graded = row.status === "graded";
  return {
    id: row.id,
    file: row.file_name,
    student: row.student,
    status: row.status as SubmissionStatus,
    note: row.note,
    kind: row.kind as FileKind,
    sha256: row.sha256,
    size: row.size,
    score: graded ? row.score : null,
    aiScore: graded ? row.ai_score : null,
    overridden: !!row.overridden,
    confidence: graded ? (result?.confidence ?? null) : null,
    lowReason: result?.lowReason ?? "",
    nearOf: parseJson<NearOf | null>(row.near_of, null),
    reviewed: !!row.reviewed,
    reviewedBy: row.reviewed_by,
    outdated: graded && isOutdated(row, asg, model),
    uploadedAt: row.uploaded_at,
    gradedAt: row.graded_at,
    shareOn: graded && !row.share_off && !!row.share_token,
    shareToken: graded && !row.share_off ? row.share_token : null,
    crit: graded && result ? result.criteria.map((c) => c.earned) : null,
    tokens: usage ? usage.input + usage.output : 0,
    costUsd: row.cost_usd || 0,
  };
}

export async function toDetail(row: SubmissionRow, asg: AssignmentRow, model?: string): Promise<SubmissionDetail> {
  const doc = await submissionDoc(row);
  const result = parseJson<GradeResult | null>(row.result, null);
  return {
    ...toListItem(row, asg, model),
    assignmentId: asg.id,
    points: asg.points,
    result,
    graded: parseJson<GradedMeta | null>(row.graded_meta, null),
    usage: parseJson<Usage | null>(row.usage, null),
    history: parseJson<HistoryEntry[]>(row.history, []),
    studentSet: !!row.student_set,
    cells: docViewCells(doc, result?.comments ?? []),
    refLabels: refLabels(doc),
    htmlUrl: await notebookHtmlUrl(row, asg),
  };
}

/** Guesses the student from a file name such as "lastfirst_12345_hw3.ipynb". */
export function studentFromFile(file: string): string {
  const stem = baseName(file);
  const first = stem.split(/[_\s]+/)[0];
  return (stem.includes("_") ? first : stem).slice(0, 80);
}

export function shareUrl(token: string | null, req?: Request): string | null {
  return token ? `${appUrl(req)}/r/${token}` : null;
}

export type DuplicateInfo = { file: string } | null;

/** Finds an earlier file with the same SHA-256 in the assignment, including deleted ones. */
export async function findDuplicate(assignmentId: string, sha256: string): Promise<DuplicateInfo> {
  const s = await first<{ file_name: string }>(
    "select file_name from submission where assignment_id = ? and sha256 = ? and status != 'cancelled' order by uploaded_at limit 1",
    assignmentId,
    sha256,
  );
  if (s) return { file: s.file_name };
  const r = await first<{ file_name: string }>("select file_name from retained_hash where assignment_id = ? and sha256 = ?", assignmentId, sha256);
  return r ? { file: r.file_name } : null;
}

function fingerprintText(file: string, bytes: Uint8Array): string {
  const kind = kindOf(file);
  if (kind === "notebook") {
    try {
      const nb = parseNotebook(new TextDecoder().decode(bytes));
      // Code only: shared template text in markdown would make every notebook look alike.
      const code = nb.cells
        .filter((c) => c.cell_type === "code")
        .map((c) => (Array.isArray(c.source) ? c.source.join("") : c.source))
        .join("\n");
      return code.length > 200 ? code : notebookPlainText(nb);
    } catch {
      return "";
    }
  }
  if (kind === "code" || (kind === "doc" && ["md", "txt", "tex"].includes(extOf(file)))) return new TextDecoder().decode(bytes);
  return "";
}

export async function createSubmission(opts: {
  asg: AssignmentRow;
  file: File;
  bytes: Uint8Array;
  userId: string;
  batchId: string | null;
  regradeDuplicates: boolean;
}): Promise<{ row: SubmissionRow; queued: boolean }> {
  const { asg, file, bytes } = opts;
  const fileName = (file.name || "file").split("/").pop()!.slice(0, 200);
  const sha = await sha256Hex(bytes);
  const dup = await findDuplicate(asg.id, sha);
  const id = newId();
  const key = submissionKey(asg.id, id, fileName);
  const contentType = file.type || "application/octet-stream";
  await putFile(key, bytes, contentType);

  const sig = minhash(fingerprintText(fileName, bytes));
  let nearOf: NearOf | null = null;
  if (sig && !dup) {
    const others = await all<{ id: string; file_name: string; minhash: string }>(
      "select id, file_name, minhash from submission where assignment_id = ? and minhash is not null and sha256 != ? and status != 'cancelled'",
      asg.id,
      sha,
    );
    let best = 0;
    for (const o of others) {
      const sim = similarity(sig, parseJson<number[]>(o.minhash, []));
      if (sim > best) {
        best = sim;
        if (sim >= NEAR_THRESHOLD) nearOf = { id: o.id, file: o.file_name, pct: Math.round(sim * 100) };
      }
    }
  }

  const status: SubmissionStatus = dup && !opts.regradeDuplicates ? "skipped" : "queued";
  const now = new Date().toISOString();
  const history: HistoryEntry[] = [{ who: "", at: now, text: "Uploaded" }];
  await run(
    `insert into submission (id, assignment_id, file_name, student, sha256, size, content_type, kind, r2_key, status, note,
       uploaded_by, uploaded_at, batch_id, queued_at, near_of, minhash, share_token, history)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    asg.id,
    fileName,
    studentFromFile(fileName),
    sha,
    bytes.length,
    contentType,
    kindOf(fileName),
    key,
    status,
    status === "skipped" ? `Same as ${dup!.file}` : "",
    opts.userId,
    now,
    opts.batchId,
    status === "queued" ? now : null,
    nearOf ? JSON.stringify(nearOf) : null,
    sig ? JSON.stringify(sig) : null,
    newShareToken(),
    JSON.stringify(history),
  );
  const row = (await first<SubmissionRow>("select * from submission where id = ?", id))!;
  return { row, queued: status === "queued" };
}

export function exportContext(row: SubmissionRow, asg: AssignmentRow, course: CourseRow, doc: SourceDoc, req?: Request): ExportContext {
  const result = parseJson<GradeResult | null>(row.result, null);
  if (!result || row.score === null) throw badRequest("This file hasn't been graded yet.");
  return {
    courseName: course.name,
    assignmentTitle: asg.title,
    file: row.file_name,
    student: row.student,
    sha256: row.sha256,
    points: asg.points,
    score: row.score,
    aiScore: row.ai_score,
    result,
    graded: parseJson<GradedMeta | null>(row.graded_meta, null),
    refLabels: refLabels(doc),
    studentLink: row.share_off ? null : shareUrl(row.share_token, req),
    reviewed: !!row.reviewed,
    reviewedBy: row.reviewed_by,
    usage: parseJson<Usage | null>(row.usage, null),
    costUsd: row.cost_usd,
  };
}

export type DownloadFile = { name: string; data: string | Uint8Array; type: string };

function feedbackHeader(row: SubmissionRow, asg: AssignmentRow): FeedbackHeader {
  const graded = parseJson<GradedMeta | null>(row.graded_meta, null);
  return { title: asg.title, score: row.score ?? 0, points: asg.points, gradedAt: graded?.gradedAt, sha256: row.sha256 };
}

// Graded notebooks are rendered with nbconvert once, when grading finishes, and the HTML is
// stored next to the file, so "Notebook as HTML" downloads and the feedback page don't wait
// for the container. A stored copy is used only while its fingerprint matches the submission.

// Bump when the notebook sent to nbconvert changes, so stored copies are made again.
const NOTEBOOK_HTML_VERSION = 1;

const rendersHtml = (row: SubmissionRow) => row.kind === "notebook" && !!row.r2_key && !!row.result && row.score !== null;

/** Changes whenever the HTML would: a different file, grade, feedback, assignment title or points. */
function notebookHtmlFingerprint(row: SubmissionRow, asg: AssignmentRow): Promise<string> {
  return sha256Hex(JSON.stringify([NOTEBOOK_HTML_VERSION, asg.title, asg.points, row.file_name, row.sha256, row.score, row.graded_meta, row.result]));
}

/** The stored nbconvert HTML of a graded notebook, or null when there is none or it's out of date. */
export async function storedNotebookHtml(row: SubmissionRow, asg: AssignmentRow): Promise<ReadableStream<Uint8Array> | null> {
  if (!rendersHtml(row)) return null;
  const obj = await getEnv().FILES.get(notebookHtmlKey(row.r2_key!));
  if (!obj) return null;
  if (obj.customMetadata?.fp === (await notebookHtmlFingerprint(row, asg))) return obj.body;
  await obj.body.cancel();
  return null;
}

/**
 * Renders a graded notebook, feedback cells included, with nbconvert (lib/server/nbconvert.ts)
 * and stores the HTML next to the file. Null when the file isn't a graded notebook or nbconvert
 * isn't available; callers then use buildDownload's built-in HTML.
 */
export async function renderNotebookHtml(row: SubmissionRow, asg: AssignmentRow): Promise<Uint8Array | null> {
  const result = parseJson<GradeResult | null>(row.result, null);
  if (!rendersHtml(row) || !result || !hasNbconvert()) return null;
  const doc = await submissionDoc(row);
  if (doc.type !== "notebook") return null;
  const fp = await notebookHtmlFingerprint(row, asg);
  const stream = await nbconvertHtml(htmlNotebook(doc, result, feedbackHeader(row, asg)), `${asg.title}: ${row.file_name}`);
  if (!stream) return null;
  let html: Uint8Array;
  try {
    html = new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (err) {
    console.error("nbconvert response failed", row.id, err);
    return null;
  }
  await putFile(notebookHtmlKey(row.r2_key!), html, "text/html; charset=utf-8", { fp });
  return html;
}

/**
 * URL of the notebook's HTML for the feedback page, or null when none is stored yet. A missing
 * or out-of-date copy is made in the background, for downloads and the next visit.
 */
async function notebookHtmlUrl(row: SubmissionRow, asg: AssignmentRow): Promise<string | null> {
  if (!rendersHtml(row) || row.status !== "graded") return null;
  const [stored, fp] = await Promise.all([getEnv().FILES.head(notebookHtmlKey(row.r2_key!)), notebookHtmlFingerprint(row, asg)]);
  if (stored?.customMetadata?.fp !== fp) waitUntil(renderNotebookHtml(row, asg).catch((err) => console.error("nbconvert render failed", row.id, err)));
  // The fingerprint reloads the frame when the grade changes; the download route makes a stale copy again.
  return stored ? `/api/submissions/${row.id}/download?format=html&inline=1&v=${fp.slice(0, 16)}` : null;
}

/** "Notebook as HTML": the stored copy, or a fresh one from nbconvert. Null when neither is available. */
export async function nbconvertDownload(
  row: SubmissionRow,
  asg: AssignmentRow,
): Promise<{ name: string; data: ReadableStream<Uint8Array> | Uint8Array; type: string } | null> {
  const html = (await storedNotebookHtml(row, asg)) ?? (await renderNotebookHtml(row, asg));
  return html && { name: `${baseName(row.file_name)}_graded.html`, data: html, type: "text/html; charset=utf-8" };
}

export async function buildDownload(
  row: SubmissionRow,
  asg: AssignmentRow,
  course: CourseRow,
  format: DownloadFormat,
  req?: Request,
): Promise<DownloadFile> {
  const b = baseName(row.file_name);
  const x = extOf(row.file_name);
  if (format === "original") {
    const bytes = row.r2_key ? await getBytes(row.r2_key) : null;
    if (!bytes) throw badRequest("The original file is no longer stored.");
    return { name: row.file_name, data: bytes, type: row.content_type || "application/octet-stream" };
  }
  const doc = await submissionDoc(row);
  const ctx = exportContext(row, asg, course, doc, req);
  const h = feedbackHeader(row, asg);
  const cells = () => docViewCells(doc, ctx.result.comments);
  switch (format) {
    case "html":
      return { name: `${b}_graded.html`, data: feedbackHtml(ctx, cells()), type: "text/html; charset=utf-8" };
    case "txt":
      return { name: `${b}_feedback.txt`, data: feedbackTxt(ctx, cells()), type: "text/plain; charset=utf-8" };
    case "json":
      return { name: `${b}_feedback.json`, data: feedbackJson(ctx), type: "application/json" };
    case "ipynb":
      if (doc.type !== "notebook") throw badRequest("Only notebooks can be downloaded as .ipynb.");
      return { name: `${b}_graded.ipynb`, data: annotatedNotebook(doc, ctx.result, h), type: "application/x-ipynb+json" };
    case "src":
      if (doc.type !== "lines") throw badRequest("This format is only for code files.");
      return { name: `${b}_graded.${x}`, data: annotateSource(doc, ctx.result, h), type: "text/plain; charset=utf-8" };
    case "doc":
      if (doc.type !== "paras") throw badRequest("This format is only for text documents.");
      return { name: `${b}_graded.${x}`, data: annotateParas(doc, ctx.result, h), type: x === "md" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8" };
    default:
      throw badRequest("Unknown format.");
  }
}

/** The best feedback file for a submission: annotated original when possible, otherwise HTML. */
export function preferredFormat(kind: string, file: string): DownloadFormat {
  const x = extOf(file);
  if (kind === "notebook") return "ipynb";
  if (kind === "code") return "src";
  if (kind === "doc" && (x === "md" || x === "txt")) return "doc";
  return "html";
}

export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

