import type { Role } from "@/lib/shared/constants";
import { todayIso } from "@/lib/shared/format";
import type { CourseSummary, Me } from "@/lib/shared/types";
import { all, first } from "./db";
import { forbidden, notFound } from "./http";

export type CourseRow = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string;
  auto_end: number;
  created_by: string | null;
  created_at: string;
  canvas_course_id: string | null;
  canvas_course_name: string | null;
};

export type AssignmentRow = {
  id: string;
  course_id: string;
  title: string;
  position: number;
  points: number;
  task_text: string;
  task_file: string | null;
  rubric_method: string;
  rubric_source: string;
  rubric_file: string | null;
  rubric_rows: string;
  style: string;
  tone: string;
  length: string;
  notes: string;
  /** JSON OutputPolicy, or null for the site's setting. */
  ai_images: string | null;
  ai_interactive: string | null;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  canvas_assignment_id: string | null;
  canvas_assignment_name: string | null;
  canvas_points: number | null;
};

export type SubmissionRow = {
  id: string;
  assignment_id: string;
  file_name: string;
  student: string;
  student_set: number;
  sha256: string;
  size: number;
  content_type: string;
  kind: string;
  r2_key: string | null;
  status: string;
  note: string;
  attempts: number;
  uploaded_by: string | null;
  uploaded_at: string;
  batch_id: string | null;
  queued_at: string | null;
  started_at: string | null;
  graded_at: string | null;
  score: number | null;
  ai_score: number | null;
  overridden: number;
  result: string | null;
  graded_meta: string | null;
  usage: string | null;
  cost_usd: number;
  near_of: string | null;
  minhash: string | null;
  reviewed: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  share_token: string | null;
  share_off: number;
  history: string;
  canvas_user_id: string | null;
  canvas_attachment_id: string | null;
  canvas_attempt: number | null;
  canvas_posted_at: string | null;
  canvas_posted_score: number | null;
};

export const isArchived = (c: Pick<CourseRow, "end_date">) => !!c.end_date && c.end_date < todayIso();

export type Need = "view" | "grade" | "manage";

export type CourseAccess = {
  course: CourseRow;
  /** The person's own role in the course, if any. */
  role: Role | null;
  canGrade: boolean;
  canManage: boolean;
  archived: boolean;
};

export async function getCourseAccess(user: Me, courseId: string): Promise<CourseAccess | null> {
  const course = await first<CourseRow>("select * from course where id = ?", courseId);
  if (!course) return null;
  const e = await first<{ role: Role }>("select role from enrollment where course_id = ? and user_id = ?", courseId, user.id);
  const role = e?.role ?? null;
  if (!role && !user.isAdmin) return null;
  const archived = isArchived(course);
  // Admins have Teacher access in every course.
  const canManage = user.isAdmin || role === "Teacher";
  return { course, role, canGrade: canManage || role === "Grader", canManage, archived };
}

function check(access: CourseAccess, need: Need, write: boolean) {
  if (need === "grade" && !access.canGrade) throw forbidden();
  if (need === "manage" && !access.canManage) throw forbidden("Only Teachers can do that.");
  if (write && access.archived) throw forbidden("This course is archived and read-only.");
}

export async function requireCourse(user: Me, courseId: string, need: Need = "view", write = false) {
  const access = await getCourseAccess(user, courseId);
  if (!access) throw notFound("Course not found.");
  check(access, need, write);
  return access;
}

export async function requireAssignment(user: Me, assignmentId: string, need: Need = "view", write = false) {
  const asg = await first<AssignmentRow>("select * from assignment where id = ?", assignmentId);
  if (!asg) throw notFound("Assignment not found.");
  const access = await requireCourse(user, asg.course_id, need, write);
  return { ...access, asg };
}

export async function requireSubmission(user: Me, submissionId: string, need: Need = "view", write = false) {
  const sub = await first<SubmissionRow>("select * from submission where id = ?", submissionId);
  if (!sub) throw notFound("File not found.");
  const r = await requireAssignment(user, sub.assignment_id, need, write);
  return { ...r, sub };
}

/** Courses the user can open, with assignment titles for the sidebar. */
export async function userCourses(user: Me): Promise<CourseSummary[]> {
  const courses = user.isAdmin
    ? await all<CourseRow & { role: Role | null }>(
        `select c.*, e.role from course c left join enrollment e on e.course_id = c.id and e.user_id = ? order by c.created_at desc`,
        user.id,
      )
    : await all<CourseRow & { role: Role | null }>(
        `select c.*, e.role from course c join enrollment e on e.course_id = c.id where e.user_id = ? order by c.created_at desc`,
        user.id,
      );
  if (!courses.length) return [];
  const asgs = await all<{ id: string; title: string; course_id: string }>(
    `select id, title, course_id from assignment where course_id in (${courses.map(() => "?").join(",")}) order by position, created_at`,
    ...courses.map((c) => c.id),
  );
  return courses.map((c) => ({
    id: c.id,
    name: c.name,
    role: (c.role ?? "Teacher") as Role,
    enrolled: !!c.role,
    startDate: c.start_date,
    endDate: c.end_date,
    autoEnd: !!c.auto_end,
    archived: isArchived(c),
    assignments: asgs.filter((a) => a.course_id === c.id).map((a) => ({ id: a.id, title: a.title })),
  }));
}
