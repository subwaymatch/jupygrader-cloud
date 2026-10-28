import { requireAssignment } from "@/lib/server/access";
import { logActivity } from "@/lib/server/activity";
import { nextPosition } from "@/lib/server/assignments";
import { all, run } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { newId } from "@/lib/server/ids";
import { requireUser } from "@/lib/server/session";

/** Copies an assignment's setup (not its submissions). Graders can duplicate too. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { asg, course } = await requireAssignment(me, id, "grade", true);
  const nid = newId();
  const now = new Date().toISOString();
  await run(
    `insert into assignment (id, course_id, title, position, points, task_text, task_file, rubric_method, rubric_source, rubric_file, rubric_rows,
       style, tone, length, notes, ai_images, ai_interactive, version, created_by, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    nid,
    asg.course_id,
    (asg.title + " (copy)").slice(0, 200),
    await nextPosition(asg.course_id),
    asg.points,
    asg.task_text,
    asg.task_file,
    asg.rubric_method,
    asg.rubric_source,
    asg.rubric_file,
    asg.rubric_rows,
    asg.style,
    asg.tone,
    asg.length,
    asg.notes,
    asg.ai_images,
    asg.ai_interactive,
    me.id,
    now,
    now,
  );
  const keys = await all<{ name: string; size: number; content_type: string; r2_key: string; text_content: string | null }>(
    "select name, size, content_type, r2_key, text_content from answer_key where assignment_id = ?",
    id,
  );
  for (const k of keys)
    await run(
      "insert into answer_key (id, assignment_id, name, size, content_type, r2_key, text_content, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
      newId(),
      nid,
      k.name,
      k.size,
      k.content_type,
      k.r2_key,
      k.text_content,
      now,
    );
  await logActivity({ type: "rubrics", user: me, courseId: course.id, text: `Duplicated the assignment ${asg.title}` });
  return Response.json({ id: nid });
});
