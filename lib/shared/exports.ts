import { escapeHtml as esc, renderMarkdown } from "./markdown";
import { labelFor } from "./document";
import type { GradeResult, GradedMeta, Usage, ViewCell } from "./types";

export type ExportContext = {
  courseName: string;
  assignmentTitle: string;
  file: string;
  student: string;
  sha256: string;
  points: number;
  score: number;
  aiScore: number | null;
  result: GradeResult;
  graded: GradedMeta | null;
  refLabels: Record<string, string>;
  studentLink?: string | null;
  reviewed?: boolean;
  reviewedBy?: string | null;
  usage?: Usage | null;
  costUsd?: number;
};

const CSS = `
body{font:15px/1.65 Geist,system-ui,-apple-system,"Segoe UI",sans-serif;color:#111827;background:#f9fafb;margin:0}
main{max-width:880px;margin:0 auto;padding:32px 20px 64px}
.m{color:#64748B;font-size:14px}
.grade{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-bottom:28px}
.score{font-size:44px;font-weight:600;letter-spacing:-.02em;line-height:1.1;margin:10px 0 6px}
.score span{font-size:18px;color:#64748B;font-weight:400}
table{width:100%;border-collapse:collapse;margin-top:16px}
td{border-top:1px solid #e5e7eb;padding:10px 0;vertical-align:top}
td.n{text-align:right;white-space:nowrap;padding-left:16px;font-variant-numeric:tabular-nums}
.row{display:flex;gap:12px;margin:6px 0}
.row>.p{flex:none;width:76px;text-align:right;font:13px/1.6 "JetBrains Mono",ui-monospace,monospace;color:#0878DD;padding-top:10px}
.row>.p.o{color:#A35200}
.body{flex:1;min-width:0}
pre{margin:0;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;font:13px/1.6 "JetBrains Mono",ui-monospace,monospace;white-space:pre-wrap;word-break:break-word;overflow-x:auto}
pre.out{background:transparent;border:0;padding:4px 12px}
pre.err{background:#FFEDEC;border-color:#FFC2BF}
.md{padding:4px 0}.md h1,.md h2,.md h3{letter-spacing:-.01em;line-height:1.3}
.md table td,.md table th{border:1px solid #e5e7eb;padding:4px 8px}
img.out{max-width:100%;height:auto;background:#fff}
.fb{background:#E8F2FF;border:1px solid #AED3FF;border-radius:6px;padding:10px 14px;margin:8px 0 14px;white-space:pre-wrap}
.fb b{color:#0878DD}
footer{margin-top:40px;color:#64748B;font-size:14px}
@media (max-width:640px){.row{flex-direction:column;gap:2px}.row>.p{width:auto;text-align:left;padding:0}}
`;

function cellHtml(c: ViewCell): string {
  let o = "";
  if (c.t === "md") {
    if (c.text) o += `<div class="row"><span class="p">${esc(c.prompt || "")}</span><div class="body md">${c.plain ? `<p>${esc(c.text).replace(/\n/g, "<br>")}</p>` : renderMarkdown(c.text)}</div></div>`;
    else if (c.prompt && c.fb) o += `<div class="row"><span class="p">${esc(c.prompt)}</span><div class="body"></div></div>`;
  } else if (c.t === "code") {
    o += `<div class="row"><span class="p">${esc(c.prompt || "")}</span><div class="body"><pre>${esc(c.src)}</pre></div></div>`;
    for (const out of c.outputs || []) {
      if (out.t === "text") o += `<div class="row"><span class="p o"></span><div class="body"><pre class="out${out.error ? " err" : ""}">${esc(out.text)}</pre></div></div>`;
      else if (out.t === "image") o += `<div class="row"><span class="p"></span><div class="body"><img class="out" alt="Output" src="data:${esc(out.mime)};base64,${esc(out.data)}"></div></div>`;
    }
  } else if (c.t === "image") {
    o += `<div class="row"><span class="p"></span><div class="body"><img class="out" alt="${esc(c.alt)}" src="${esc(c.src)}"></div></div>`;
  } else if (c.t === "note") {
    o += `<div class="row"><span class="p"></span><div class="body m">${esc(c.text)}</div></div>`;
  }
  if ("fb" in c && c.fb) o += `<div class="row"><span class="p"></span><div class="body"><div class="fb"><b>Feedback</b> ${esc(c.fb)}</div></div></div>`;
  return o;
}

export function feedbackHtml(ctx: ExportContext, cells: ViewCell[]): string {
  const r = ctx.result;
  const crit = r.criteria
    .map((c) => `<tr><td>${esc(c.name)}<div class="m">${esc(c.comment)}</div></td><td class="n">${c.earned} / ${c.pts}</td></tr>`)
    .join("");
  const when = ctx.graded?.gradedAt ? new Date(ctx.graded.gradedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(ctx.file)}: feedback</title><style>${CSS}</style></head><body><main>
<section class="grade"><div class="m">${esc(ctx.courseName)} · ${esc(ctx.assignmentTitle)}</div><div class="m">${esc(ctx.file)}</div>
<div class="score">${ctx.score} <span>/ ${ctx.points}</span></div><p>${esc(r.summary)}</p><table>${crit}</table></section>
${cells.map(cellHtml).join("\n")}
<footer>Graded with AI${when ? " on " + esc(when) : ""}. Ask your instructor if something looks wrong.</footer>
</main></body></html>`;
}

export function feedbackTxt(ctx: ExportContext, cells: ViewCell[]): string {
  const W = (t: string, n = 76) => wrapText(t, n).join("\n");
  const rule = "-".repeat(60);
  const P: string[] = [];
  P.push(
    (ctx.courseName ? ctx.courseName + "\n" : "") + ctx.assignmentTitle,
    "File: " + ctx.file,
    ...(ctx.student ? ["Student: " + ctx.student] : []),
    "Score: " + ctx.score + " / " + ctx.points + (ctx.aiScore !== null && ctx.aiScore !== ctx.score ? ` (changed from ${ctx.aiScore} by a grader)` : ""),
    rule,
    "SUMMARY",
    W(ctx.result.summary || ""),
    rule,
    "RUBRIC",
  );
  for (const c of ctx.result.criteria)
    P.push(c.name + "  " + c.earned + " / " + c.pts + (c.comment ? "\n" + wrapText(c.comment, 72).map((l) => "  " + l).join("\n") : ""));
  const withFb = cells.filter((c) => "fb" in c && c.fb) as (ViewCell & { fb: string; ref?: string })[];
  if (withFb.length) {
    P.push(rule, "COMMENTS IN YOUR WORK");
    for (const c of withFb) {
      const where = c.ref ? labelFor(c.ref, ctx.refLabels) : "Note";
      P.push(where + "\n" + wrapText(c.fb, 72).map((l) => "  " + l).join("\n"));
    }
  }
  const when = ctx.graded?.gradedAt ? new Date(ctx.graded.gradedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
  P.push(rule, "Graded with AI" + (when ? " on " + when : "") + ". Ask your instructor if something looks wrong.");
  return P.join("\n\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

export function feedbackJson(ctx: ExportContext): string {
  const g = ctx.graded;
  const u = ctx.usage;
  return JSON.stringify(
    {
      file: ctx.file,
      student: ctx.student || null,
      sha256: ctx.sha256,
      course: ctx.courseName,
      assignment: ctx.assignmentTitle,
      score: ctx.score,
      aiScore: ctx.aiScore,
      points: ctx.points,
      gradedAt: g?.gradedAt ?? null,
      gradingSettings: g ? { rubricVersion: g.rubricVersion, style: g.style, tone: g.tone, length: g.length, model: g.model } : null,
      studentLink: ctx.studentLink ?? null,
      summary: ctx.result.summary,
      confidence: ctx.result.confidence,
      lowConfidenceReason: ctx.result.lowReason || null,
      reviewed: !!ctx.reviewed,
      reviewedBy: ctx.reviewedBy ?? null,
      criteria: ctx.result.criteria.map((c) => ({
        name: c.name,
        points: c.pts,
        earned: c.earned,
        aiEarned: c.aiEarned,
        comment: c.comment,
        basedOn: c.refs.map((r) => labelFor(r, ctx.refLabels)),
      })),
      inlineComments: ctx.result.comments.map((c) => ({ where: labelFor(c.ref, ctx.refLabels), ref: c.ref, comment: c.comment })),
      usage: u
        ? { inputTokens: u.input, cachedTokens: u.cached, outputTokens: u.output, reasoningTokens: u.reasoning, estimatedCostUsd: +(ctx.costUsd ?? 0).toFixed(5) }
        : null,
    },
    null,
    2,
  );
}

export function wrapText(text: string, n: number): string[] {
  const out: string[] = [];
  String(text)
    .split("\n")
    .forEach((p) => {
      let s = p;
      while (s.length > n) {
        let k = s.lastIndexOf(" ", n);
        if (k < 20) k = n;
        out.push(s.slice(0, k));
        s = s.slice(k).replace(/^ +/, "");
      }
      out.push(s);
    });
  return out;
}

export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
