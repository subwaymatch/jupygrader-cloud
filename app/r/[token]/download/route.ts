import { badRequest, handle, notFound } from "@/lib/server/http";
import { sharedSubmission } from "@/lib/server/share";
import { buildDownload, contentDisposition, nbconvertDownload } from "@/lib/server/submissions";

/** Feedback downloads for students, through their link. Originals and JSON aren't offered. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ token: string }> }) => {
  const { token } = await ctx.params;
  const shared = await sharedSubmission(token);
  if (!shared) throw notFound("This link is no longer active.");
  const format = new URL(req.url).searchParams.get("format") || "html";
  if (!["html", "ipynb", "txt", "src", "doc"].includes(format)) throw badRequest("Unknown format.");
  const f =
    (format === "html" && (await nbconvertDownload(shared.sub, shared.asg))) ||
    (await buildDownload(shared.sub, shared.asg, shared.course, format as "html", req));
  return new Response(f.data as BodyInit, {
    headers: { "Content-Type": f.type, "Content-Disposition": contentDisposition(f.name), "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });
});
