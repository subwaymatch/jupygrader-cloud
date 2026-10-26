import { logActivity } from "@/lib/server/activity";
import { all, first, run } from "@/lib/server/db";
import { sendEmail } from "@/lib/server/email";
import { appUrl } from "@/lib/server/env";
import { badRequest, handle, notFound, readJson } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/session";

type Body =
  | { action: "approve" }
  | { action: "decline" }
  | { action: "setAdmin"; value: boolean }
  | { action: "enroll"; courseId: string; role: "Teacher" | "Grader" }
  | { action: "unenroll"; courseId: string };

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireAdmin(req);
  const { id } = await ctx.params;
  const user = await first<{ id: string; name: string; email: string; status: string; isAdmin: number }>(
    'select id, name, email, status, isAdmin from "user" where id = ?',
    id,
  );
  if (!user) throw notFound("User not found.");
  const body = await readJson<Body>(req);
  switch (body.action) {
    case "approve": {
      await run(`update "user" set status = 'active' where id = ?`, id);
      await logActivity({ type: "people", user: me, text: `Approved the instructor account for ${user.email}` });
      await sendEmail({
        to: user.email,
        subject: "Your Jupygrader account is ready",
        text: `Hi ${user.name},\n\nAn administrator approved your instructor account. You can sign in and create your first course now.`,
        action: { label: "Sign in", url: `${appUrl(req)}/login` },
      });
      break;
    }
    case "decline": {
      if (user.status !== "pending") throw badRequest("Only pending requests can be declined.");
      await run('delete from "user" where id = ?', id);
      await logActivity({ type: "people", user: me, text: `Declined the instructor account request from ${user.email}` });
      break;
    }
    case "setAdmin": {
      if (id === me.id && !body.value) throw badRequest("You can't remove your own admin access.");
      await run(`update "user" set isAdmin = ? where id = ?`, !!body.value, id);
      await logActivity({ type: "people", user: me, text: `${body.value ? "Made" : "Removed"} ${user.name} ${body.value ? "an administrator" : "as an administrator"}` });
      break;
    }
    case "enroll": {
      const role = body.role === "Teacher" ? "Teacher" : "Grader";
      const course = await first<{ name: string }>("select name from course where id = ?", body.courseId);
      if (!course) throw notFound("Course not found.");
      await run(
        "insert into enrollment (course_id, user_id, role, created_at) values (?, ?, ?, ?) on conflict(course_id, user_id) do update set role = excluded.role",
        body.courseId,
        id,
        role,
        new Date().toISOString(),
      );
      await logActivity({ type: "people", user: me, courseId: body.courseId, text: `Set ${user.name}'s role in ${course.name} to ${role}` });
      break;
    }
    case "unenroll": {
      const course = await first<{ name: string }>("select name from course where id = ?", body.courseId);
      const teachers = await all<{ user_id: string }>("select user_id from enrollment where course_id = ? and role = 'Teacher'", body.courseId);
      if (teachers.length === 1 && teachers[0].user_id === id) throw badRequest("A course needs at least one Teacher. Add another Teacher first.");
      await run("delete from enrollment where course_id = ? and user_id = ?", body.courseId, id);
      await logActivity({ type: "people", user: me, courseId: body.courseId, text: `Removed ${user.name} from ${course?.name ?? "a course"}` });
      break;
    }
    default:
      throw badRequest("Unknown action.");
  }
  return Response.json({ ok: true });
});
