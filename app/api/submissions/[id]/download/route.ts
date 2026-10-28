import { requireSubmission } from "@/lib/server/access";
import { logActivity } from "@/lib/server/activity";
import { badRequest, handle } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { buildDownload, contentDisposition, INLINE_CSP, nbconvertDownload } from "@/lib/server/submissions";
import type { DownloadFormat } from "@/lib/shared/document";

const FORMATS: DownloadFormat[] = ["html", "txt", "ipynb", "src", "doc", "json", "original"];

export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { sub, asg, course } = await requireSubmission(me, id, "grade");
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") || "html") as DownloadFormat;
  if (!FORMATS.includes(format)) throw badRequest("Unknown format.");
  const f = (format === "html" && (await nbconvertDownload(sub, asg))) || (await buildDownload(sub, asg, course, format, req));
  if (url.searchParams.get("inline") !== "1")
    await logActivity({ type: "exports", user: me, courseId: course.id, text: `Downloaded ${format === "original" ? "the original of" : "feedback for"} ${sub.file_name}` });
  const headers: Record<string, string> = { "Content-Type": f.type, "Cache-Control": "private, no-store" };
  if (url.searchParams.get("inline") !== "1") headers["Content-Disposition"] = contentDisposition(f.name);
  // Shown in a frame on the feedback page.
  else headers["Content-Security-Policy"] = INLINE_CSP;
  return new Response(f.data as BodyInit, { headers });
});
