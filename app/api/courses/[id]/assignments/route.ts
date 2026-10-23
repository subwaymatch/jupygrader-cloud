import { requireCourse } from "@/lib/server/access";
import { logActivity } from "@/lib/server/activity";
import { applyAnswerKeys, assignmentColumns, nextPosition, type AssignmentInput } from "@/lib/server/assignments";
import { run } from "@/lib/server/db";
import { handle, readJson } from "@/lib/server/http";
import { newId } from "@/lib/server/ids";
import { requireUser } from "@/lib/server/session";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireUser(req);
  const { id: courseId } = await ctx.params;
  await requireCourse(me, courseId, "manage", true);
  const input = await readJson<AssignmentInput>(req);
  const { cols } = await assignmentColumns(input, me.id, null);
  const id = newId();
  const now = new Date().toISOString();
  const all = { ...cols, id, course_id: courseId, position: await nextPosition(courseId), created_by: me.id, created_at: now, updated_at: now };
  const keys = Object.keys(all);
  await run(`insert into assignment (${keys.join(", ")}) values (${keys.map(() => "?").join(", ")})`, ...keys.map((k) => (all as Record<string, string | number | null>)[k]));
  await applyAnswerKeys(id, me.id, input.addAnswerKeys || []);
  await logActivity({ type: "rubrics", user: me, courseId, text: `Created the assignment ${cols.title}` });
  return Response.json({ id });
});
