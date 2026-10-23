import { zipSync, strToU8 } from "fflate";
import { requireAssignment, type SubmissionRow } from "@/lib/server/access";
import { logActivity } from "@/lib/server/activity";
import { all, inList } from "@/lib/server/db";
import { badRequest, handle } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { buildDownload, contentDisposition, preferredFormat } from "@/lib/server/submissions";
import type { DownloadFormat } from "@/lib/shared/document";

const FORMATS: DownloadFormat[] = ["html", "txt", "ipynb", "src", "doc", "json", "original"];

/** Zips feedback files or originals for several submissions: ?format=html|...|best&ids=a,b */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  const { asg, course } = await requireAssignment(me, id, "grade");
  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "best";
  if (format !== "best" && !FORMATS.includes(format as DownloadFormat)) throw badRequest("Unknown format.");
  const ids = (url.searchParams.get("ids") || "").split(",").filter(Boolean);
  const rows = ids.length
    ? await all<SubmissionRow>(`select * from submission where assignment_id = ? and id in (${inList(ids.length)})`, id, ...ids.slice(0, 500))
    : await all<SubmissionRow>("select * from submission where assignment_id = ? order by file_name", id);
  const list = format === "original" ? rows.filter((r) => r.r2_key) : rows.filter((r) => r.status === "graded");
  if (!list.length) throw badRequest(format === "original" ? "No files to download." : "None of these files are graded yet.");
  if (list.length > 500) throw badRequest("Download up to 500 files at a time.");

  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  for (const r of list) {
    let f: DownloadFormat = format === "best" ? preferredFormat(r.kind, r.file_name) : (format as DownloadFormat);
    if (f === "ipynb" && r.kind !== "notebook") f = "html";
    if (f === "src" && r.kind !== "code") f = "html";
    if (f === "doc" && preferredFormat(r.kind, r.file_name) !== "doc") f = "html";
    try {
      const d = await buildDownload(r, asg, course, f, req);
      let name = d.name;
      for (let k = 2; used.has(name); k++) name = d.name.replace(/(\.[^.]+)?$/, `_${k}$1`);
      used.add(name);
      files[name] = typeof d.data === "string" ? strToU8(d.data) : d.data;
    } catch (err) {
      console.error("download build failed", r.id, err);
    }
  }
  const zip = zipSync(files, { level: 6 });
  const label = format === "original" ? "original" : format === "best" ? "feedback" : format;
  await logActivity({ type: "exports", user: me, courseId: course.id, text: `Downloaded ${list.length} ${label} file${list.length === 1 ? "" : "s"} from ${asg.title}` });
  const name = `${asg.title.replace(/[^\w]+/g, "_").replace(/^_|_$/g, "")}_${label}.zip`;
  return new Response(zip, { headers: { "Content-Type": "application/zip", "Content-Disposition": contentDisposition(name) } });
});
