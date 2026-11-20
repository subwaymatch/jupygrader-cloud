import { requireAssignment } from "@/lib/server/access";
import { logActivity } from "@/lib/server/activity";
import { applyAnswerKeys, assignmentColumns, assignmentData, type AssignmentInput } from "@/lib/server/assignments";
import { ASSIGNMENT_DOC_COLUMNS, assignmentDocKeys, deleteUnusedDocs } from "@/lib/server/cleanup";
import { first, parseJson, run } from "@/lib/server/db";
import { handle, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { deletePrefix } from "@/lib/server/storage";
import type { StoredFile } from "@/lib/shared/types";

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
  // Documents this change replaced or removed are deleted, unless a copy of the assignment still uses them.
  const dropped = ASSIGNMENT_DOC_COLUMNS.filter((c) => cols[c] !== undefined).map((c) => parseJson<StoredFile | null>(asg[c], null)?.key);
  if (input.addAnswerKeys?.length || input.removeAnswerKeys?.length) dropped.push(...(await applyAnswerKeys(id, me.id, input.addAnswerKeys, input.removeAnswerKeys)));
  await deleteUnusedDocs(dropped).catch((err) => console.error("Could not delete replaced documents", id, err));
  const what: string[] = [];
  if (cols.title !== undefined && cols.title !== asg.title) what.push("title");
  if (input.taskText !== undefined || input.taskFileKey !== undefined) what.push("instructions");
  if (cols.rubric_rows !== undefined || cols.points !== undefined) what.push("rubric");
  if ([input.style, input.tone, input.length, input.notes, input.aiImages, input.aiInteractive].some((v) => v !== undefined)) what.push("grading settings");
  if (input.addAnswerKeys?.length || input.removeAnswerKeys?.length) what.push("answer key");
  if (cols.starter_file !== undefined) what.push("starter file");
  if (what.length) await logActivity({ type: "rubrics", user: me, courseId: course.id, text: `Updated the ${what.join(", ")} for ${cols.title ?? asg.title}` });
  const fresh = await first<typeof asg>("select * from assignment where id = ?", id);
  return Response.json(await assignmentData(fresh!));
});

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { asg, course } = await requireAssignment(me, id, "manage", true);
  const docs = await assignmentDocKeys("a.id = ?", id);
  await deletePrefix(`sub/${id}/`);
  await deletePrefix(`asg/${id}/`);
  await run("delete from assignment where id = ?", id);
  // Its instructions, rubric, starter file and answer keys, unless a copy of the assignment still uses them.
  await deleteUnusedDocs(docs).catch((err) => console.error("Could not delete the assignment's documents", id, err));
  await logActivity({ type: "rubrics", user: me, courseId: course.id, text: `Deleted the assignment ${asg.title}` });
  return Response.json({ ok: true });
});
