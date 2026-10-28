import type { Role } from "@/lib/shared/constants";
import { addYears, todayIso } from "@/lib/shared/format";
import type { Me, StoredFile } from "@/lib/shared/types";
import { isArchived, type AssignmentRow, type CourseRow } from "./access";
import { all, first, parseJson, run } from "./db";
import { badRequest } from "./http";
import { deleteFiles, deletePrefix } from "./storage";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates course dates. A blank end date means one year after the start (or today). */
export function resolveCourseDates(start: string | null | undefined, end: string | null | undefined) {
  const s = (start || "").trim() || null;
  const e = (end || "").trim() || null;
  if (s && !DAY_RE.test(s)) throw badRequest("Enter the start date as a date.");
  if (e && !DAY_RE.test(e)) throw badRequest("Enter the end date as a date.");
  if (s && e && e < s) throw badRequest("The end date must be after the start date.");
  const from = s || todayIso();
  const maxEnd = addYears(from, 1);
  if (e && e > maxEnd) throw badRequest("A course can last up to one year. Choose an earlier end date.");
  return { start: s, end: e || maxEnd, autoEnd: !e };
}

export function validateCourseName(name: unknown): string {
  const n = String(name || "").trim();
  if (!n) throw badRequest("Give the course a name.");
  if (n.length > 120) throw badRequest("Course names can be up to 120 characters.");
  return n;
}

export type MemberView = {
  id: string;
  kind: "member" | "invite";
  name: string;
  email: string;
  role: Role;
  isMe?: boolean;
  isAdmin?: boolean;
  sentAt?: string;
  expired?: boolean;
};

export async function courseMembers(courseId: string, me: Me): Promise<MemberView[]> {
  const members = await all<{ id: string; name: string; email: string; role: Role; isAdmin: number }>(
    `select u.id, u.name, u.email, e.role, u.isAdmin from enrollment e join "user" u on u.id = e.user_id
      where e.course_id = ? order by case e.role when 'Teacher' then 0 else 1 end, u.name collate nocase`,
    courseId,
  );
  const invites = await all<{ id: string; email: string; role: Role; sent_at: string; expires_at: string }>(
    "select id, email, role, sent_at, expires_at from invitation where course_id = ? and status = 'pending' order by sent_at desc",
    courseId,
  );
  const now = new Date().toISOString();
  return [
    ...members.map((m) => ({ id: m.id, kind: "member" as const, name: m.name, email: m.email, role: m.role, isMe: m.id === me.id, isAdmin: !!m.isAdmin })),
    ...invites.map((i) => ({ id: i.id, kind: "invite" as const, name: i.email, email: i.email, role: i.role, sentAt: i.sent_at, expired: i.expires_at < now })),
  ];
}

export type AssignmentCard = {
  id: string;
  title: string;
  points: number;
  rubricItems: number;
  rubricMethod: string;
  total: number;
  graded: number;
  inProgress: number;
  failed: number;
  needsReview: number;
};

export async function courseAssignments(courseId: string): Promise<AssignmentCard[]> {
  const asgs = await all<AssignmentRow>("select * from assignment where course_id = ? order by position, created_at", courseId);
  if (!asgs.length) return [];
  const stats = await all<{ assignment_id: string; status: string; n: number; review: number }>(
    `select assignment_id, status, count(*) n,
            sum(case when status = 'graded' and reviewed = 0 and (near_of is not null or json_extract(result, '$.confidence') = 'low') then 1 else 0 end) review
       from submission where assignment_id in (${asgs.map(() => "?").join(",")}) group by assignment_id, status`,
    ...asgs.map((a) => a.id),
  );
  return asgs.map((a) => {
    const s = stats.filter((x) => x.assignment_id === a.id);
    const n = (st: string) => s.find((x) => x.status === st)?.n ?? 0;
    const rows = parseJson<{ name: string }[]>(a.rubric_rows, []).filter((r) => r.name?.trim());
    return {
      id: a.id,
      title: a.title,
      points: a.points,
      rubricItems: a.rubric_method === "none" ? 0 : rows.length,
      rubricMethod: a.rubric_method,
      // Duplicates and cancelled files aren't counted, so "x of y graded" adds up.
      total: n("graded") + n("queued") + n("grading") + n("failed"),
      graded: n("graded"),
      inProgress: n("queued") + n("grading"),
      failed: n("failed"),
      needsReview: s.reduce((acc, x) => acc + (x.review || 0), 0),
    };
  });
}

export async function courseContents(courseId: string): Promise<{ assignments: number; submissions: number }> {
  const r = await first<{ assignments: number; submissions: number }>(
    `select (select count(*) from assignment where course_id = ?1) assignments,
            (select count(*) from submission s join assignment a on a.id = s.assignment_id where a.course_id = ?1) submissions`,
    courseId,
  );
  return { assignments: r?.assignments ?? 0, submissions: r?.submissions ?? 0 };
}

/**
 * Empties a course: deletes every assignment with its submissions, grades, student links and
 * stored files, including its uploaded instructions, rubric and answer keys. The course, its
 * people and invitations, the activity log and AI usage records stay.
 */
export async function resetCourse(courseId: string) {
  const contents = await courseContents(courseId);
  const asgs = await all<{ id: string; task_file: string | null; rubric_file: string | null }>(
    "select id, task_file, rubric_file from assignment where course_id = ?",
    courseId,
  );
  const keys = await all<{ r2_key: string }>("select k.r2_key from answer_key k join assignment a on a.id = k.assignment_id where a.course_id = ?", courseId);
  // Uploaded documents live under docs/<uploader>/, and copies of an assignment share them, so keep any that another course still uses.
  const docs = new Set([
    ...keys.map((k) => k.r2_key),
    ...asgs.flatMap((a) => [a.task_file, a.rubric_file].map((f) => parseJson<StoredFile | null>(f, null)?.key ?? "")),
  ]);
  const elsewhere = await all<{ k: string | null }>(
    `select k.r2_key k from answer_key k join assignment a on a.id = k.assignment_id where a.course_id != ?1
     union select json_extract(task_file, '$.key') from assignment where course_id != ?1
     union select json_extract(rubric_file, '$.key') from assignment where course_id != ?1`,
    courseId,
  );
  for (const e of elsewhere) docs.delete(e.k ?? "");
  docs.delete("");
  // Files first: if this stops part-way, the rows are still there to try again.
  for (const a of asgs) {
    await deletePrefix(`sub/${a.id}/`);
    await deletePrefix(`asg/${a.id}/`);
  }
  // Extracted text sits next to each document.
  await deleteFiles([...docs].flatMap((k) => [k, k + ".txt"]));
  // Answer keys, submissions and kept hashes go with their assignment (on delete cascade).
  await run("delete from assignment where course_id = ?", courseId);
  return contents;
}

export function courseView(c: CourseRow) {
  return { id: c.id, name: c.name, startDate: c.start_date, endDate: c.end_date, autoEnd: !!c.auto_end, archived: isArchived(c) };
}
export type CourseView = ReturnType<typeof courseView>;
