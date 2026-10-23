import { requireCourse } from "@/lib/server/access";
import { AiError } from "@/lib/server/ai";
import { ownsDocKey } from "@/lib/server/assignments";
import { getEnv } from "@/lib/server/env";
import { badRequest, handle, readJson } from "@/lib/server/http";
import { draftRubric, itemizeRubric } from "@/lib/server/rubric-ai";
import { requireUser } from "@/lib/server/session";
import { effectiveTotal } from "@/lib/shared/rubric";

/** Turns rubric text or a document into items, or drafts items from the instructions. */
export const POST = handle(async (req: Request) => {
  const me = await requireUser(req);
  const body = await readJson<{ mode?: "itemize" | "draft"; text?: string; fileKey?: string; points?: string | number; courseId?: string; assignmentId?: string }>(req);
  if (!body.courseId) throw badRequest("Missing course.");
  await requireCourse(me, body.courseId, "manage");
  let text = String(body.text || "");
  if (body.fileKey) {
    if (!ownsDocKey(body.fileKey, me.id)) throw badRequest("Upload the document again.");
    const t = await getEnv().FILES.get(body.fileKey + ".txt");
    text = t ? await t.text() : "";
    if (!text.trim()) throw badRequest("No text could be read from this document. Paste the text instead.");
  }
  if (!text.trim()) throw badRequest(body.mode === "draft" ? "Add assignment instructions first." : "Paste or upload a rubric first.");
  const total = effectiveTotal(body.points);
  try {
    const ctx = { courseId: body.courseId, assignmentId: body.assignmentId };
    const r = body.mode === "draft" ? await draftRubric(text, total, ctx) : await itemizeRubric(text, total, ctx);
    if (!r.rows.length) throw badRequest("The AI couldn't find rubric items in this text. Try Build it yourself.");
    return Response.json(r);
  } catch (err) {
    if (err instanceof AiError) throw badRequest(err.message);
    throw err;
  }
});
