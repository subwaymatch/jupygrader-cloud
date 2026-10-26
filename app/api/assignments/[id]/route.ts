import { requireAssignment } from "@/lib/server/access";
import { logActivity } from "@/lib/server/activity";
import { applyAnswerKeys, assignmentColumns, assignmentData, type AssignmentInput } from "@/lib/server/assignments";
import { first, run } from "@/lib/server/db";
import { handle, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { deletePrefix } from "@/lib/server/storage";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { asg } = await requireAssignment(me, id);
  return Response.json(await assignmentData(asg));
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { asg, course } = await requireAssignment(me, id, "manage", true);
  const input = await readJson<AssignmentInput>(req);
  const { cols, gradingChanged } = await assignmentColumns(input, me.id, asg);
  if (gradingChanged) cols.version = asg.version + 1;
  cols.updated_at = new Date().toISOString();
  const keys = Object.keys(cols);
  await run(`update assignment set ${keys.map((k) => `${k} = ?`).join(", ")} where id = ?`, ...keys.map((k) => cols[k]), id);
  if (input.addAnswerKeys?.length || input.removeAnswerKeys?.length) await applyAnswerKeys(id, me.id, input.addAnswerKeys, input.removeAnswerKeys);
  const what: string[] = [];
  if (cols.title !== undefined && cols.title !== asg.title) what.push("title");
  if (input.taskText !== undefined || input.taskFileKey !== undefined) what.push("instructions");
  if (cols.rubric_rows !== undefined || cols.points !== undefined) what.push("rubric");
  if (input.style !== undefined || input.tone !== undefined || input.length !== undefined || input.notes !== undefined) what.push("grading settings");
  if (input.addAnswerKeys?.length || input.removeAnswerKeys?.length) what.push("answer key");
  if (what.length) await logActivity({ type: "rubrics", user: me, courseId: course.id, text: `Updated the ${what.join(", ")} for ${cols.title ?? asg.title}` });
  const fresh = await first<typeof asg>("select * from assignment where id = ?", id);
  return Response.json(await assignmentData(fresh!));
});

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { asg, course } = await requireAssignment(me, id, "manage", true);
  await deletePrefix(`sub/${id}/`);
  await run("delete from assignment where id = ?", id);
  await logActivity({ type: "rubrics", user: me, courseId: course.id, text: `Deleted the assignment ${asg.title}` });
  return Response.json({ ok: true });
});
