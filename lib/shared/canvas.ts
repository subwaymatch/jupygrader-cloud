// Canvas LMS helpers shared by the server and the browser. No network calls here.
import { MAX_UPLOAD_BYTES } from "./constants";
import { fmtScore } from "./format";
import type { GradeResult, SubmissionListItem } from "./types";

/**
 * The Canvas address an admin enters, as an origin: "canvas.example.edu/courses" becomes
 * "https://canvas.example.edu". Null when it isn't a usable address. Only HTTPS, except for
 * localhost, which is allowed for testing.
 */
export function canvasOrigin(input: string): string | null {
  let s = (input || "").trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "https://" + s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return null;
  if (u.username || u.password || (!u.hostname.includes(".") && !local)) return null;
  return u.origin;
}

/** The next page's URL from a Canvas `Link` header, or null on the last page. */
export function nextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const m = /<([^>]+)>\s*;\s*rel="?next"?/i.exec(part);
    if (m) return m[1];
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Plain text from the HTML of a Canvas assignment description, keeping paragraphs and list items. */
export function htmlToText(html: string): string {
  return (html || "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    // Each <li> starts its own line, so its closing tag adds none.
    .replace(/<\/(p|div|h[1-6]|ul|ol|pre|blockquote|tr)>/gi, "\n")
    .replace(/<(p|div|h[1-6]|ul|ol|pre|blockquote|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, e: string) => {
      if (e[0] === "#") {
        const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all;
      }
      return ENTITIES[e.toLowerCase()] ?? all;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+(?!- )/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The grade sent to Canvas for a Jupygrader score: scaled to the Canvas assignment's points
 * ("8.5" for 85 of 100 on a 10-point assignment), or a percentage when it has none.
 */
export function canvasGrade(score: number, points: number, canvasPoints: number | null): string {
  const frac = points > 0 ? score / points : 0;
  if (canvasPoints && canvasPoints > 0) return String(round2(frac * canvasPoints));
  return round2(frac * 100) + "%";
}

/** "lovelaceada_1234_hw3.ipynb", the way Canvas names files in its own bulk downloads. */
export function importedFileName(sortableName: string, canvasUserId: string, name: string): string {
  const slug =
    (sortableName || "")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "student";
  return `${slug}_${canvasUserId}_${(name || "file").split("/").pop()}`.slice(0, 200);
}

/** The submission comment posted with a grade: the score, the summary and each rubric line. */
export function canvasComment(o: { score: number; points: number; result: GradeResult; attached: boolean; studentLink: string | null }): string {
  const lines = [`Score: ${fmtScore(o.score)} / ${o.points}`, "", o.result.summary.trim()];
  if (o.result.criteria.length) {
    lines.push("", "Rubric");
    for (const c of o.result.criteria) lines.push(`- ${c.name}: ${fmtScore(c.earned)} / ${c.pts}${c.comment.trim() ? `. ${c.comment.trim()}` : ""}`);
  }
  lines.push("");
  if (o.attached) lines.push("The attached file has the feedback next to your work.");
  if (o.studentLink) lines.push(`Full feedback: ${o.studentLink}`);
  lines.push("Feedback written with AI. Ask your instructor if something looks wrong.");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

// ---------- Importing ----------

export type CanvasSubmissionInfo = {
  userId: string;
  name: string;
  sortableName: string;
  attempt: number | null;
  submittedAt: string | null;
  late: boolean;
  /** "unsubmitted", "submitted", "graded" or "pending_review". */
  workflowState: string;
  attachments: { id: string; name: string; size: number }[];
};

export type ImportState = "new" | "new-attempt" | "imported" | "too-large" | "no-file" | "not-submitted";

export type ImportRow = Omit<CanvasSubmissionInfo, "attachments"> & {
  state: ImportState;
  files: { id: string; name: string; size: number; state: "new" | "imported" | "too-large" }[];
};

/** Already imported files, as stored on Jupygrader submissions. */
export type ImportedRef = { canvasUserId: string; attachmentId: string | null };

/** What importing would do for each student: which files are new, already imported or can't be imported. */
export function planImport(subs: CanvasSubmissionInfo[], imported: ImportedRef[]): ImportRow[] {
  const done = new Set(imported.map((r) => r.attachmentId).filter(Boolean));
  const students = new Set(imported.map((r) => r.canvasUserId));
  return subs
    .map(({ attachments, ...s }): ImportRow => {
      const files = attachments.map((a) => ({ ...a, state: done.has(a.id) ? ("imported" as const) : a.size > MAX_UPLOAD_BYTES ? ("too-large" as const) : ("new" as const) }));
      let state: ImportState;
      if (!files.length) state = s.workflowState === "unsubmitted" || !s.submittedAt ? "not-submitted" : "no-file";
      else if (files.some((f) => f.state === "new")) state = students.has(s.userId) ? "new-attempt" : "new";
      else state = files.some((f) => f.state === "imported") ? "imported" : "too-large";
      return { ...s, files, state };
    })
    .sort((a, b) => a.sortableName.localeCompare(b.sortableName));
}

// ---------- Posting grades ----------

export type PostState = "ready" | "changed" | "posted" | "not-graded" | "several-files";

export type PostRow = {
  canvasUserId: string;
  student: string;
  /** The file whose grade is posted: the one from the student's latest imported attempt. */
  item: SubmissionListItem;
  state: PostState;
};

/**
 * One row per student imported from Canvas, for their latest attempt. A grade is posted only when
 * that attempt has exactly one graded file; "changed" means the score changed after it was posted.
 */
export function planPosting(items: SubmissionListItem[]): PostRow[] {
  const byUser = new Map<string, SubmissionListItem[]>();
  for (const s of items) {
    if (!s.canvas || s.status === "cancelled") continue;
    byUser.set(s.canvas.userId, [...(byUser.get(s.canvas.userId) ?? []), s]);
  }
  const rows: PostRow[] = [];
  for (const [canvasUserId, list] of byUser) {
    const latest = Math.max(...list.map((s) => s.canvas!.attempt ?? 0));
    const attempt = list.filter((s) => (s.canvas!.attempt ?? 0) === latest);
    // Skipped duplicates aren't graded, so they don't count as a second file.
    const files = attempt.filter((s) => s.status !== "skipped");
    const item = files[0] ?? attempt[0];
    let state: PostState;
    if (files.length > 1) state = "several-files";
    else if (item.status !== "graded" || item.score === null) state = "not-graded";
    else if (!item.canvas!.postedAt) state = "ready";
    else state = item.canvas!.postedScore === item.score ? "posted" : "changed";
    rows.push({ canvasUserId, student: item.student || item.file, item, state });
  }
  return rows.sort((a, b) => a.student.localeCompare(b.student));
}
