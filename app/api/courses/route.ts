import { inviteToCourse } from "@/lib/server/accounts";
import { logActivity } from "@/lib/server/activity";
import { resolveCourseDates, validateCourseName } from "@/lib/server/courses";
import { batch, stmt } from "@/lib/server/db";
import { handle, readJson } from "@/lib/server/http";
import { newId } from "@/lib/server/ids";
import { requireUser } from "@/lib/server/session";
import type { Role } from "@/lib/shared/constants";

export const POST = handle(async (req: Request) => {
  const me = await requireUser(req);
  const body = await readJson<{ name?: string; start?: string; end?: string; invites?: { email: string; role: Role }[]; message?: string }>(req);
  const name = validateCourseName(body.name);
  const d = resolveCourseDates(body.start, body.end);
  const id = newId();
  const now = new Date().toISOString();
  await batch([
    stmt(
      "insert into course (id, name, start_date, end_date, auto_end, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      name,
      d.start,
      d.end,
      d.autoEnd,
      me.id,
      now,
      now,
    ),
    stmt("insert into enrollment (course_id, user_id, role, created_at) values (?, ?, 'Teacher', ?)", id, me.id, now),
  ]);
  await logActivity({ type: "rubrics", user: me, courseId: id, text: `Created the course ${name}` });
  const invites = (body.invites || []).filter((i) => i.email?.trim());
  let result = null;
  for (const role of ["Teacher", "Grader"] as Role[]) {
    const emails = invites.filter((i) => (i.role === "Teacher" ? "Teacher" : "Grader") === role).map((i) => i.email);
    if (emails.length) {
      const r = await inviteToCourse({ emails, courseId: id, courseName: name, role, message: String(body.message || "").trim(), by: me });
      result = result ? { added: [...result.added, ...r.added], invited: [...result.invited, ...r.invited], skipped: [...result.skipped, ...r.skipped] } : r;
    }
  }
  return Response.json({ id, invites: result });
});
