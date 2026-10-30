import { requireCourse } from "@/lib/server/access";
import { logActivity } from "@/lib/server/activity";
import { applyAnswerKeys, assignmentColumns, nextPosition, type AssignmentInput } from "@/lib/server/assignments";
import { canvasFor } from "@/lib/server/canvas";
import { linkAssignment } from "@/lib/server/canvas-sync";
import { run } from "@/lib/server/db";
import { badRequest, handle, HttpError, readJson } from "@/lib/server/http";
import { newId } from "@/lib/server/ids";
import { requireUser } from "@/lib/server/session";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireUser(req);
  const { id: courseId } = await ctx.params;
  const { course } = await requireCourse(me, courseId, "manage", true);
  const input = await readJson<AssignmentInput>(req);
  const canvasId = input.canvasAssignmentId ? String(input.canvasAssignmentId) : null;
  if (canvasId && !/^\d+$/.test(canvasId)) throw badRequest("Choose a Canvas assignment.");
  // Checked first, so a Canvas problem doesn't leave a half-made assignment.
  const canvas = canvasId ? await canvasFor(me.id) : null;
  const { cols } = await assignmentColumns(input, me.id, null);
  const id = newId();
  const now = new Date().toISOString();
  const all = { ...cols, id, course_id: courseId, position: await nextPosition(courseId), created_by: me.id, created_at: now, updated_at: now };
  const keys = Object.keys(all);
  await run(`insert into assignment (${keys.join(", ")}) values (${keys.map(() => "?").join(", ")})`, ...keys.map((k) => (all as Record<string, string | number | null>)[k]));
  await applyAnswerKeys(id, me.id, input.addAnswerKeys || []);
  // The assignment is made either way; if linking fails, it can be linked again from its page.
  let canvasError: string | undefined;
  if (canvasId) {
    try {
      await linkAssignment(canvas, course, id, canvasId);
    } catch (err) {
      canvasError = err instanceof HttpError ? err.message : "Couldn't link it to Canvas.";
      if (!(err instanceof HttpError)) console.error("canvas link on create failed", id, err);
    }
  }
  await logActivity({ type: "rubrics", user: me, courseId, text: `Created the assignment ${cols.title}` });
  return Response.json({ id, canvasError });
});
