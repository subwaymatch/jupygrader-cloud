import { getCourseAccess } from "@/lib/server/access";
import { badRequest, handle, notFound } from "@/lib/server/http";
import { getSessionUser } from "@/lib/server/session";
import { sharedSubmission } from "@/lib/server/share";
import { buildDownload, contentDisposition, INLINE_CSP, nbconvertDownload } from "@/lib/server/submissions";

/** Feedback downloads for students, through their link; `inline=1` shows one in the link's page. Originals and JSON aren't offered. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ token: string }> }) => {
  const { token } = await ctx.params;
  const shared = await sharedSubmission(token);
  if (!shared) throw notFound("This link is no longer active.");
  // Held for review: only course staff, previewing the student page, can load it.
  if (shared.held) {
    const me = await getSessionUser(req.headers);
    if (!me || !(await getCourseAccess(me, shared.course.id))) throw notFound("This feedback isn't ready yet.");
  }
  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "html";
  if (!["html", "ipynb", "txt", "src", "doc"].includes(format)) throw badRequest("Unknown format.");
  const f =
    (format === "html" && (await nbconvertDownload(shared.sub, shared.asg))) ||
    (await buildDownload(shared.sub, shared.asg, shared.course, format as "html", req));
  const headers: Record<string, string> = { "Content-Type": f.type, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };
  if (url.searchParams.get("inline") === "1") headers["Content-Security-Policy"] = INLINE_CSP;
  else headers["Content-Disposition"] = contentDisposition(f.name);
  return new Response(f.data as BodyInit, { headers });
});
