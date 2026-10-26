import type { AssignmentRow, CourseRow, SubmissionRow } from "./access";
import { first } from "./db";

/** Resolves a student link. Returns null when the link is unknown, turned off or not graded. */
export async function sharedSubmission(token: string) {
  if (!/^[A-Za-z0-9]{10,64}$/.test(token)) return null;
  const sub = await first<SubmissionRow>("select * from submission where share_token = ?", token);
  if (!sub || sub.share_off || sub.status !== "graded" || !sub.result) return null;
  const asg = await first<AssignmentRow>("select * from assignment where id = ?", sub.assignment_id);
  if (!asg) return null;
  const course = await first<CourseRow>("select * from course where id = ?", asg.course_id);
  if (!course) return null;
  return { sub, asg, course };
}
