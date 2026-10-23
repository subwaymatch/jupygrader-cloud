import { requireAssignment, type SubmissionRow } from "@/lib/server/access";
import { logActivity } from "@/lib/server/activity";
import { all, inList, parseJson } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { contentDisposition, shareUrl } from "@/lib/server/submissions";
import { toCsv } from "@/lib/shared/exports";
import type { GradeResult, GradedMeta } from "@/lib/shared/types";

/** Grades as CSV, one row per file, with a column per rubric item. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { asg, course } = await requireAssignment(me, id, "grade");
  const ids = (new URL(req.url).searchParams.get("ids") || "").split(",").filter(Boolean);
  const rows = ids.length
    ? await all<SubmissionRow>(`select * from submission where assignment_id = ? and id in (${inList(ids.length)}) order by file_name`, id, ...ids)
    : await all<SubmissionRow>("select * from submission where assignment_id = ? order by file_name", id);
  const crit: string[] = [];
  for (const r of rows) for (const c of parseJson<GradeResult | null>(r.result, null)?.criteria ?? []) if (!crit.includes(c.name)) crit.push(c.name);
  const out: unknown[][] = [["file", "student", "status", "score", "points", "ai_score", "reviewed", "needs_review", ...crit, "student_link", "sha256", "graded_at", "rubric_version", "grading_style", "model"]];
  for (const r of rows) {
    const res = parseJson<GradeResult | null>(r.result, null);
    const g = parseJson<GradedMeta | null>(r.graded_meta, null);
    const graded = r.status === "graded";
    const review = graded && !r.reviewed && (res?.confidence === "low" || !!r.near_of);
    out.push([
      r.file_name,
      r.student,
      r.status,
      graded ? r.score : "",
      asg.points,
      graded ? r.ai_score : "",
      r.reviewed ? "yes" : "no",
      review ? "yes" : "no",
      ...crit.map((n) => (graded ? (res?.criteria.find((c) => c.name === n)?.earned ?? "") : "")),
      graded && !r.share_off ? shareUrl(r.share_token, req) : "",
      r.sha256,
      r.graded_at ?? "",
      g?.rubricVersion ?? "",
      g?.style ?? "",
      g?.model ?? "",
    ]);
  }
  await logActivity({ type: "exports", user: me, courseId: course.id, text: `Exported grades for ${asg.title} as CSV` });
  const name = `${asg.title.replace(/[^\w]+/g, "_").replace(/^_|_$/g, "")}_grades.csv`;
  return new Response("﻿" + toCsv(out), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": contentDisposition(name) } });
});
