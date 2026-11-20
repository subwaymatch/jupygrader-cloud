import { needsReview } from "@/lib/shared/review";
import type { GradeResult } from "@/lib/shared/types";
import type { AssignmentRow, CourseRow, SubmissionRow } from "./access";
import { first, parseJson } from "./db";

export type Shared = {
  sub: SubmissionRow;
  asg: AssignmentRow;
  course: CourseRow;
  /**
   * The file is flagged for review and nobody has reviewed it, so students can't open the link yet.
   * Course staff can still preview it.
   */
  held: boolean;
};

/** Resolves a student link. Returns null when the link is unknown, turned off or not graded. */
export async function sharedSubmission(token: string): Promise<Shared | null> {
  if (!/^[A-Za-z0-9]{10,64}$/.test(token)) return null;
  const sub = await first<SubmissionRow>("select * from submission where share_token = ?", token);
  if (!sub || sub.share_off || sub.status !== "graded" || !sub.result) return null;
  const asg = await first<AssignmentRow>("select * from assignment where id = ?", sub.assignment_id);
  if (!asg) return null;
  const course = await first<CourseRow>("select * from course where id = ?", asg.course_id);
  if (!course) return null;
  const held = needsReview({
    status: sub.status,
    reviewed: !!sub.reviewed,
    confidence: parseJson<GradeResult | null>(sub.result, null)?.confidence ?? null,
    nearOf: sub.near_of,
  });
  return { sub, asg, course, held };
}
