import { requireSubmission } from "@/lib/server/access";
import { logActivity } from "@/lib/server/activity";
import { first, parseJson, run } from "@/lib/server/db";
import { scoreFrom } from "@/lib/server/grading";
import { badRequest, handle, readJson } from "@/lib/server/http";
import { newShareToken } from "@/lib/server/ids";
import { requireUser } from "@/lib/server/session";
import { getSettings } from "@/lib/server/settings";
import { toDetail } from "@/lib/server/submissions";
import { fmtScore } from "@/lib/shared/format";
import type { GradeResult, HistoryEntry } from "@/lib/shared/types";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { sub, asg } = await requireSubmission(me, id, "view");
  const settings = await getSettings();
  return Response.json(await toDetail(sub, asg, settings.model));
});

type Patch =
  | { action: "review"; reviewed: boolean }
  | { action: "criterion"; index: number; earned: number; comment?: string; reason?: string }
  | { action: "override"; score: number | null }
  | { action: "student"; name: string }
  | { action: "share"; on: boolean }
  | { action: "resetLink" };

const half = (n: number) => Math.round(n * 2) / 2;

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { sub, asg, course } = await requireSubmission(me, id, "grade", true);
  const body = await readJson<Patch>(req);
  const now = new Date().toISOString();
  const history = parseJson<HistoryEntry[]>(sub.history, []);
  const push = (text: string) => history.push({ who: me.name, at: now, text });

  switch (body.action) {
    case "review": {
      if (sub.status !== "graded") throw badRequest("Only graded files can be reviewed.");
      push(body.reviewed ? "Marked reviewed" : "Marked as not reviewed");
      await run(
        "update submission set reviewed = ?, reviewed_by = ?, reviewed_at = ?, history = ? where id = ?",
        body.reviewed,
        body.reviewed ? me.name : null,
        body.reviewed ? now : null,
        JSON.stringify(history),
        id,
      );
      await logActivity({ type: "grades", user: me, courseId: course.id, text: `${body.reviewed ? "Marked reviewed" : "Unmarked reviewed"}: ${sub.file_name}` });
      break;
    }
    case "criterion": {
      const result = parseJson<GradeResult | null>(sub.result, null);
      const c = result?.criteria[body.index];
      if (!result || !c) throw badRequest("That rubric line doesn't exist.");
      const earned = half(Number(body.earned));
      if (!(earned >= 0 && earned <= c.pts)) throw badRequest(`Enter a score from 0 to ${c.pts}.`);
      const old = c.earned;
      c.earned = earned;
      if (body.comment !== undefined) c.comment = String(body.comment).slice(0, 4000);
      const score = scoreFrom(result.criteria, asg.points);
      const reason = String(body.reason || "").trim();
      push(`Changed "${c.name}" from ${old} to ${earned}${reason ? ". Reason: " + reason : ""}`);
      // A person has now looked at this file, so it no longer needs review.
      await run(
        "update submission set result = ?, score = ?, overridden = ?, reviewed = 1, reviewed_by = ?, reviewed_at = ?, history = ? where id = ?",
        JSON.stringify(result),
        score,
        score !== sub.ai_score || result.criteria.some((x) => x.earned !== x.aiEarned),
        me.name,
        now,
        JSON.stringify(history),
        id,
      );
      await logActivity({ type: "grades", user: me, courseId: course.id, text: `Changed a rubric line on ${sub.file_name}${reason ? ". Reason: " + reason : ""}` });
      break;
    }
    case "override": {
      if (sub.status !== "graded") throw badRequest("Only graded files have a score.");
      const result = parseJson<GradeResult | null>(sub.result, null);
      const sum = result ? scoreFrom(result.criteria, asg.points) : sub.ai_score;
      const score = body.score === null ? sum : half(Number(body.score));
      if (score === null || !(score >= 0 && score <= asg.points)) throw badRequest(`Enter a score from 0 to ${asg.points}.`);
      push(body.score === null ? `Reset the total to the rubric sum, ${score}` : `Changed the total from ${fmtScore(sub.score)} to ${score}`);
      await run(
        "update submission set score = ?, overridden = ?, reviewed = 1, reviewed_by = ?, reviewed_at = ?, history = ? where id = ?",
        score,
        score !== sub.ai_score,
        me.name,
        now,
        JSON.stringify(history),
        id,
      );
      await logActivity({ type: "grades", user: me, courseId: course.id, text: `Changed the grade of ${sub.file_name} from ${fmtScore(sub.score)} to ${score}` });
      break;
    }
    case "student": {
      const name = String(body.name || "").trim().slice(0, 120);
      push(name ? `Set the student to ${name}` : "Cleared the student name");
      await run("update submission set student = ?, student_set = 1, history = ? where id = ?", name, JSON.stringify(history), id);
      break;
    }
    case "share": {
      push(body.on ? "Turned on the student link" : "Turned off the student link");
      await run(
        "update submission set share_off = ?, share_token = coalesce(share_token, ?), history = ? where id = ?",
        !body.on,
        newShareToken(),
        JSON.stringify(history),
        id,
      );
      await logActivity({ type: "sharing", user: me, courseId: course.id, text: `Turned ${body.on ? "on" : "off"} the student link for ${sub.file_name}` });
      break;
    }
    case "resetLink": {
      push("Made a new student link");
      await run("update submission set share_token = ?, share_off = 0, history = ? where id = ?", newShareToken(), JSON.stringify(history), id);
      await logActivity({ type: "sharing", user: me, courseId: course.id, text: `Made a new student link for ${sub.file_name}` });
      break;
    }
    default:
      throw badRequest("Unknown action.");
  }
  const fresh = await first<typeof sub>("select * from submission where id = ?", id);
  const settings = await getSettings();
  return Response.json(await toDetail(fresh!, asg, settings.model));
});
