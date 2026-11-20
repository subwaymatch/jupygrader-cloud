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
  | { action: "deactivate" }
  | { action: "reactivate" }
  | { action: "remove" }
  | { action: "enroll"; courseId: string; role: "Teacher" | "Grader" }
  | { action: "unenroll"; courseId: string };

/** A site always keeps at least one administrator who can sign in. */
async function requireAnotherAdmin(exceptId: string) {
  const others = (await first<{ n: number }>(`select count(*) n from "user" where isAdmin = 1 and status = 'active' and id != ?`, exceptId))?.n ?? 0;
  if (!others) throw badRequest("This is the only administrator. Make someone else an administrator first.");
}

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
      if (user.status !== "pending") throw badRequest("Only pending requests can be approved.");
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
    case "deactivate": {
      if (id === me.id) throw badRequest("You can't deactivate your own account.");
      if (user.status !== "active") throw badRequest("Only an active account can be deactivated.");
      if (user.isAdmin) await requireAnotherAdmin(id);
      // Signed out everywhere at once. Course roles stay, so reactivating restores the account as it was.
      await run(`update "user" set status = 'disabled', "updatedAt" = ? where id = ?`, new Date().toISOString(), id);
      await run("delete from session where userId = ?", id);
      await logActivity({ type: "people", user: me, text: `Deactivated the account of ${user.name} (${user.email})` });
      break;
    }
    case "reactivate": {
      if (user.status !== "disabled") throw badRequest("This account isn't deactivated.");
      await run(`update "user" set status = 'active', "updatedAt" = ? where id = ?`, new Date().toISOString(), id);
      await logActivity({ type: "people", user: me, text: `Reactivated the account of ${user.name} (${user.email})` });
      break;
    }
    case "remove": {
      if (id === me.id) throw badRequest("Delete your own account from the Account page.");
      if (user.isAdmin && user.status === "active") await requireAnotherAdmin(id);
      const sole = await first<{ name: string }>(
        `select c.name from enrollment e join course c on c.id = e.course_id
          where e.user_id = ? and e.role = 'Teacher'
            and (select count(*) from enrollment x where x.course_id = e.course_id and x.role = 'Teacher') = 1 limit 1`,
        id,
      );
      if (sole) throw badRequest(`${user.name} is the only Teacher in ${sole.name}. Add another Teacher or delete the course first.`);
      // Sessions, course roles and the Canvas connection go with the account. Grades and files stay with their courses.
      await run('delete from "user" where id = ?', id);
      await logActivity({ type: "people", user: me, text: `Deleted the account of ${user.name} (${user.email})` });
      break;
    }
    case "setAdmin": {
      if (id === me.id && !body.value) throw badRequest("You can't remove your own admin access.");
      if (body.value && user.status !== "active") throw badRequest("Only an active account can be an administrator.");
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
