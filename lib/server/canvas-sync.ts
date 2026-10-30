// Moving files and grades between a Jupygrader assignment and the Canvas assignment it's linked to.
import { unzipSync } from "fflate";
import { canvasComment, canvasGrade, importedFileName, planPosting } from "@/lib/shared/canvas";
import { MAX_UPLOAD_BYTES } from "@/lib/shared/constants";
import type { GradeResult, HistoryEntry, Me } from "@/lib/shared/types";
import type { AssignmentRow, CourseRow, SubmissionRow } from "./access";
import { CanvasTokenError, type Canvas } from "./canvas";
import { all, first, parseJson, run } from "./db";
import { badRequest, HttpError } from "./http";
import { buildDownload, createSubmission, preferredFormat, shareUrl, toListItem } from "./submissions";

export type Linked = { canvasCourseId: string; canvasAssignmentId: string };

/** The Canvas course and assignment ids, or an error saying what to link first. */
export function linkedIds(course: CourseRow, asg: AssignmentRow): Linked {
  if (!course.canvas_course_id) throw badRequest("Link this course to a Canvas course first, in Course settings.");
  if (!asg.canvas_assignment_id) throw badRequest("Link this assignment to a Canvas assignment first.");
  return { canvasCourseId: course.canvas_course_id, canvasAssignmentId: asg.canvas_assignment_id };
}

/**
 * Links a Jupygrader assignment to an assignment in the course's Canvas course, after checking it
 * exists and isn't linked to another Jupygrader assignment. Null unlinks it.
 */
export async function linkAssignment(canvas: Canvas | null, course: CourseRow, assignmentId: string, canvasAssignmentId: string | null) {
  if (!canvasAssignmentId) {
    await run("update assignment set canvas_assignment_id = null, canvas_assignment_name = null, canvas_points = null where id = ?", assignmentId);
    return null;
  }
  if (!course.canvas_course_id || !canvas) throw badRequest("Link this course to a Canvas course first, in Course settings.");
  const other = await first<{ title: string }>(
    "select title from assignment where course_id = ? and canvas_assignment_id = ? and id != ?",
    course.id,
    canvasAssignmentId,
    assignmentId,
  );
  if (other) throw badRequest(`That Canvas assignment is already linked to ${other.title}.`);
  const a = await canvas.assignment(course.canvas_course_id, canvasAssignmentId);
  await run(
    "update assignment set canvas_assignment_id = ?, canvas_assignment_name = ?, canvas_points = ? where id = ?",
    String(a.id),
    a.name,
    a.points_possible,
    assignmentId,
  );
  return a;
}

const JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini|\.ipynb_checkpoints)(\/|$)|(^|\/)\._/;

/** The files in a submitted .zip, skipping folders, system files, HTML and anything too large, as an upload does. */
function unzipFiles(bytes: Uint8Array, skipped: { file: string; reason: string }[], zipName: string): { name: string; data: Uint8Array }[] {
  const out: { name: string; data: Uint8Array }[] = [];
  let data: Record<string, Uint8Array>;
  try {
    data = unzipSync(bytes, {
      filter: (info) => {
        const base = info.name.split("/").pop() || "";
        if (info.name.endsWith("/") || JUNK.test(info.name) || !base || base.startsWith(".") || !info.originalSize) return false;
        if (/\.html?$/i.test(base)) return false;
        if (info.originalSize > MAX_UPLOAD_BYTES) {
          skipped.push({ file: base, reason: "Larger than 25 MB." });
          return false;
        }
        return true;
      },
    });
  } catch {
    skipped.push({ file: zipName, reason: "This .zip couldn't be opened. It may be damaged." });
    return out;
  }
  for (const [name, d] of Object.entries(data)) out.push({ name: name.split("/").pop()!, data: d });
  return out;
}

export type ImportResult = { userId: string; imported: number; skipped: { file: string; reason: string }[]; error?: string };

/**
 * Imports the latest submitted files of the given Canvas students. Files already imported are
 * left alone, so running it again only adds new attempts. Returns the ids queued for grading.
 */
export async function importStudents(o: {
  canvas: Canvas;
  course: CourseRow;
  asg: AssignmentRow;
  userIds: string[];
  me: Me;
  batchId: string;
}): Promise<{ results: ImportResult[]; queued: string[] }> {
  const ids = linkedIds(o.course, o.asg);
  const results: ImportResult[] = [];
  const queued: string[] = [];
  for (const userId of o.userIds) {
    const r: ImportResult = { userId, imported: 0, skipped: [] };
    results.push(r);
    try {
      const sub = await o.canvas.submission(ids.canvasCourseId, ids.canvasAssignmentId, userId);
      const done = new Set(
        (
          await all<{ a: string }>(
            "select canvas_attachment_id a from submission where assignment_id = ? and canvas_user_id = ? and canvas_attachment_id is not null",
            o.asg.id,
            userId,
          )
        ).map((x) => x.a),
      );
      const name = sub.user?.name || `Canvas user ${userId}`;
      for (const att of sub.attachments || []) {
        const attName = att.display_name || att.filename || "file";
        if (done.has(String(att.id))) continue;
        if (att.size > MAX_UPLOAD_BYTES) {
          r.skipped.push({ file: attName, reason: "Larger than 25 MB." });
          continue;
        }
        const bytes = await o.canvas.download(att.url);
        const files = /\.zip$/i.test(attName) ? unzipFiles(bytes, r.skipped, attName) : [{ name: attName, data: bytes }];
        for (const f of files) {
          if (!f.data.length) {
            r.skipped.push({ file: f.name, reason: "This file is empty." });
            continue;
          }
          const fileName = importedFileName(sub.user?.sortable_name || name, userId, f.name);
          const type = files.length === 1 && f.name === attName ? att["content-type"] || "" : "";
          const { row, queued: q } = await createSubmission({
            asg: o.asg,
            file: new File([f.data as BlobPart], fileName, { type }),
            bytes: f.data,
            userId: o.me.id,
            batchId: o.batchId,
            regradeDuplicates: false,
            student: name,
            canvas: { userId, attachmentId: String(att.id), attempt: sub.attempt ?? null },
          });
          r.imported++;
          if (q) queued.push(row.id);
        }
      }
    } catch (err) {
      // A rejected token fails every student the same way, so stop and say so once.
      if (err instanceof CanvasTokenError) throw err;
      r.error = err instanceof HttpError ? err.message : "Couldn't import this student's files.";
      if (!(err instanceof HttpError)) console.error("canvas import failed", o.asg.id, userId, err);
    }
  }
  return { results, queued };
}

export type PostResult = { id: string; ok: boolean; grade?: string; error?: string };

/** The feedback file's name as the student uploaded it: "hw3_graded.ipynb", not "lovelaceada_1234_hw3_graded.ipynb". */
function studentFacingName(name: string, canvasUserId: string): string {
  const prefix = new RegExp(`^[a-z0-9]+_${canvasUserId.replace(/[^0-9a-z]/gi, "")}_`);
  return name.replace(prefix, "") || name;
}

/**
 * Posts grades for the given files to Canvas, each with an optional comment (the summary and
 * rubric) and the file with feedback attached. Only a student's latest attempt can be posted.
 */
export async function postGrades(o: {
  canvas: Canvas;
  course: CourseRow;
  asg: AssignmentRow;
  ids: string[];
  comment: boolean;
  attach: boolean;
  me: Me;
  req: Request;
}): Promise<PostResult[]> {
  const ids = linkedIds(o.course, o.asg);
  const rows = await all<SubmissionRow>("select * from submission where assignment_id = ?", o.asg.id);
  const postable = new Set(
    planPosting(rows.map((r) => toListItem(r, o.asg)))
      .filter((p) => p.state === "ready" || p.state === "changed" || p.state === "posted")
      .map((p) => p.item.id),
  );
  const results: PostResult[] = [];
  for (const id of o.ids) {
    const row = rows.find((r) => r.id === id);
    if (!row || !row.canvas_user_id || !postable.has(id) || row.score === null) {
      results.push({ id, ok: false, error: "Only a graded file from a student's latest Canvas attempt can be posted." });
      continue;
    }
    const grade = canvasGrade(row.score, o.asg.points, o.asg.canvas_points);
    try {
      const fileIds: number[] = [];
      if (o.attach) {
        const f = await buildDownload(row, o.asg, o.course, preferredFormat(row.kind, row.file_name), o.req);
        const data = typeof f.data === "string" ? new TextEncoder().encode(f.data) : f.data;
        fileIds.push(
          await o.canvas.uploadCommentFile(ids.canvasCourseId, ids.canvasAssignmentId, row.canvas_user_id, {
            name: studentFacingName(f.name, row.canvas_user_id),
            data,
            type: f.type,
          }),
        );
      }
      const result = parseJson<GradeResult | null>(row.result, null);
      const comment =
        o.comment && result
          ? canvasComment({
              score: row.score,
              points: o.asg.points,
              result,
              attached: fileIds.length > 0,
              studentLink: row.share_off ? null : shareUrl(row.share_token, o.req),
            })
          : "";
      await o.canvas.postGrade(ids.canvasCourseId, ids.canvasAssignmentId, row.canvas_user_id, { grade, comment, fileIds });
      const now = new Date().toISOString();
      const history = parseJson<HistoryEntry[]>(row.history, []);
      history.push({ who: o.me.name, at: now, text: `Posted ${grade}${o.asg.canvas_points ? ` / ${o.asg.canvas_points}` : ""} to Canvas` });
      await run(
        "update submission set canvas_posted_at = ?, canvas_posted_score = ?, history = ? where id = ?",
        now,
        row.score,
        JSON.stringify(history.slice(-100)),
        id,
      );
      results.push({ id, ok: true, grade });
    } catch (err) {
      if (err instanceof CanvasTokenError) throw err;
      results.push({ id, ok: false, error: err instanceof HttpError ? err.message : "Couldn't post this grade." });
      if (!(err instanceof HttpError)) console.error("canvas post failed", id, err);
    }
  }
  return results;
}
