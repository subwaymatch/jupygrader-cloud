import { requireCourse } from "@/lib/server/access";
import { inviteToCourse } from "@/lib/server/accounts";
import { badRequest, handle, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import type { Role } from "@/lib/shared/constants";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { course } = await requireCourse(me, id, "manage", true);
  const body = await readJson<{ emails?: string | string[]; role?: Role; message?: string }>(req);
  const emails = (Array.isArray(body.emails) ? body.emails : String(body.emails || "").split(/[\s,;]+/)).map((e) => e.trim()).filter(Boolean);
  if (!emails.length) throw badRequest("Enter at least one email address.");
  if (emails.length > 200) throw badRequest("Invite up to 200 people at a time.");
  const role: Role = body.role === "Teacher" ? "Teacher" : "Grader";
  const result = await inviteToCourse({ emails, courseId: id, courseName: course.name, role, message: String(body.message || "").trim().slice(0, 1000), by: me });
  return Response.json(result);
});
