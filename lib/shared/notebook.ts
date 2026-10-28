import type { GradeResult, InlineComment, ViewCell, ViewOutput } from "./types";

export type NbOutput = {
  output_type: "stream" | "execute_result" | "display_data" | "error" | string;
  name?: string;
  text?: string | string[];
  data?: Record<string, string | string[] | unknown>;
  metadata?: Record<string, unknown>;
  execution_count?: number | null;
  ename?: string;
  evalue?: string;
  traceback?: string[];
};

export type NbCell = {
  cell_type: "code" | "markdown" | "raw" | string;
  id?: string;
  source: string | string[];
  metadata?: Record<string, unknown>;
  outputs?: NbOutput[];
  execution_count?: number | null;
  attachments?: Record<string, unknown>;
};

export type Notebook = {
  cells: NbCell[];
  metadata: Record<string, unknown>;
  nbformat: number;
  nbformat_minor: number;
};

export class NotebookError extends Error {}

export function joinText(s: string | string[] | undefined | unknown): string {
  if (Array.isArray(s)) return s.join("");
  return typeof s === "string" ? s : "";
}

/** nbformat stores multi-line strings as arrays of lines that keep their newlines. */
export function splitLines(text: string): string[] {
  if (!text) return [];
  return text.split(/(?<=\n)/);
}

export function parseNotebook(raw: string): Notebook {
  let nb: unknown;
  try {
    nb = JSON.parse(raw.replace(/^﻿/, ""));
  } catch {
    throw new NotebookError("This .ipynb file isn't valid JSON, so it can't be read as a notebook.");
  }
  const n = nb as Partial<Notebook> & { worksheets?: { cells: unknown[] }[] };
  if (!n || typeof n !== "object") throw new NotebookError("This file isn't a Jupyter notebook.");
  if (n.nbformat === 3 && Array.isArray(n.worksheets)) return upgradeV3(n);
  if (!Array.isArray(n.cells)) throw new NotebookError("This file isn't a Jupyter notebook (no cells found).");
  return {
    cells: n.cells as NbCell[],
    metadata: (n.metadata as Record<string, unknown>) || {},
    nbformat: n.nbformat || 4,
    nbformat_minor: n.nbformat_minor ?? 4,
  };
}

/** Minimal nbformat 3 to 4 conversion, enough to read and annotate old notebooks. */
function upgradeV3(n: { worksheets?: { cells: unknown[] }[]; metadata?: unknown }): Notebook {
  const cells: NbCell[] = [];
  for (const ws of n.worksheets || []) {
    for (const c of (ws.cells || []) as Record<string, unknown>[]) {
      if (c.cell_type === "code") {
        cells.push({
          cell_type: "code",
          source: joinText(c.input),
          metadata: {},
          execution_count: (c.prompt_number as number) ?? null,
          outputs: ((c.outputs as Record<string, unknown>[]) || []).map((o) => ({
            output_type: o.output_type === "pyout" ? "execute_result" : o.output_type === "pyerr" ? "error" : String(o.output_type),
            name: o.stream as string,
            text: joinText(o.text),
            data: o.text ? { "text/plain": joinText(o.text) } : undefined,
            ename: o.ename as string,
            evalue: o.evalue as string,
            traceback: o.traceback as string[],
          })),
        });
      } else if (c.cell_type === "heading") {
        cells.push({ cell_type: "markdown", source: "#".repeat((c.level as number) || 1) + " " + joinText(c.source), metadata: {} });
      } else {
        cells.push({ cell_type: String(c.cell_type || "markdown"), source: joinText(c.source), metadata: {} });
      }
    }
  }
  return { cells, metadata: (n.metadata as Record<string, unknown>) || {}, nbformat: 4, nbformat_minor: 4 };
}

export function isFeedbackCell(c: NbCell): boolean {
  const m = c.metadata as { jupygrader?: unknown; tags?: string[] } | undefined;
  return !!m?.jupygrader || !!m?.tags?.includes("jupygrader-feedback");
}

/** The notebook without feedback cells from an earlier Jupygrader run. */
export function originalCells(nb: Notebook): NbCell[] {
  return nb.cells.filter((c) => !isFeedbackCell(c));
}

export function cellRef(index: number): string {
  return "C" + (index + 1);
}

export function cellLabel(c: NbCell, index: number): string {
  if (c.cell_type === "code" && typeof c.execution_count === "number") return "In [" + c.execution_count + "]";
  return "Cell " + (index + 1);
}

export function notebookRefLabels(nb: Notebook): Record<string, string> {
  const out: Record<string, string> = {};
  originalCells(nb).forEach((c, i) => (out[cellRef(i)] = cellLabel(c, i)));
  return out;
}

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n… [${text.length - max} more characters not shown]`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h\d|li)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type AiImage = { mime: string; data: string; label: string };

/** Output formats that need a browser to show anything, and what to call them. */
const INTERACTIVE: [RegExp, string][] = [
  [/^application\/vnd\.jupyter\.widget-view\+json$/, "widget"],
  [/^application\/vnd\.plotly\./, "Plotly chart"],
  [/^application\/vnd\.bokehjs_/, "Bokeh plot"],
  [/^application\/vnd\.holoviews_/, "HoloViews plot"],
  [/^application\/vnd\.vega(lite)?\./, "Vega chart"],
  [/^(application|text)\/javascript$/, "JavaScript output"],
];

function interactiveKind(d: Record<string, unknown>): string | null {
  for (const mime of Object.keys(d)) for (const [re, kind] of INTERACTIVE) if (re.test(mime)) return kind;
  if (d["text/html"] && /<(script|iframe)\b/i.test(joinText(d["text/html"]))) return "interactive HTML output";
  return null;
}

/**
 * Text rendering of a notebook for the model, with a [C#] marker on every cell.
 * Images beyond the first `maxImages`, and interactive outputs beyond the first
 * `maxInteractive`, are replaced with a short note so they don't use up tokens.
 */
export function notebookForAI(
  nb: Notebook,
  opts: { maxChars?: number; maxImages?: number; maxInteractive?: number } = {},
): { text: string; images: AiImage[]; refs: Record<string, string> } {
  const maxChars = opts.maxChars ?? 120_000;
  const maxImages = opts.maxImages ?? 6;
  const maxInteractive = opts.maxInteractive ?? 0;
  let interactive = 0;
  const cells = originalCells(nb);
  const refs: Record<string, string> = {};
  const images: AiImage[] = [];
  const parts: string[] = [];
  let used = 0;
  let cut = false;
  cells.forEach((c, i) => {
    const ref = cellRef(i);
    const label = cellLabel(c, i);
    refs[ref] = label;
    if (cut) return;
    let block = "";
    const src = joinText(c.source).replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g, "[embedded image]");
    if (c.cell_type === "code") {
      block += `[${ref}] code cell, ${label}\n\`\`\`\n${truncate(src, 8000)}\n\`\`\`\n`;
      const outs: string[] = [];
      for (const o of c.outputs || []) {
        if (o.output_type === "stream") outs.push(truncate(joinText(o.text).replace(ANSI, ""), 2000));
        else if (o.output_type === "error") {
          const tb = (o.traceback || []).join("\n").replace(ANSI, "");
          outs.push(truncate(`${o.ename}: ${o.evalue}\n${tb}`, 2000));
        } else if (o.data) {
          const d = o.data as Record<string, unknown>;
          const img = ["image/png", "image/jpeg"].find((m) => typeof d[m] === "string" || Array.isArray(d[m]));
          const kind = interactiveKind(d);
          if (img && images.length < maxImages) {
            const n = images.length + 1;
            images.push({ mime: img, data: joinText(d[img]).replace(/\s+/g, ""), label: `image ${n} (output of ${ref})` });
            outs.push(`[image output: attached as image ${n}]`);
          } else if (kind && interactive >= maxInteractive) outs.push(`[${kind}, not shown to you]`);
          else if (img) {
            // A short repr such as "<Figure size 640x480 with 2 Axes>" still says what was drawn.
            const plain = joinText(d["text/plain"]).trim();
            outs.push(`[image output, not shown to you${plain && plain.length <= 200 ? `: ${plain}` : ""}]`);
          } else {
            // An interactive output that is sent goes as its text form.
            if (kind) interactive++;
            if (d["text/plain"]) outs.push(truncate(joinText(d["text/plain"]), 2000));
            else if (d["text/html"]) outs.push(truncate(stripHtml(joinText(d["text/html"])), 2000));
            else if (d["image/svg+xml"]) outs.push("[SVG image output, not shown to you]");
          }
        }
      }
      if (outs.length) block += `Output of ${ref}:\n${outs.join("\n")}\n`;
      else if (c.execution_count === null || c.execution_count === undefined) block += `(${ref} was not run)\n`;
    } else {
      block += `[${ref}] ${c.cell_type === "markdown" ? "markdown" : c.cell_type} cell\n${truncate(src, 8000)}\n`;
    }
    if (used + block.length > maxChars) {
      cut = true;
      parts.push(`[The rest of the notebook (from ${ref}) was cut off because it is too long.]`);
      return;
    }
    used += block.length;
    parts.push(block);
  });
  return { text: parts.join("\n"), images, refs };
}

/** Text of code and markdown cells only, used for near-duplicate fingerprints. */
export function notebookPlainText(nb: Notebook): string {
  return originalCells(nb)
    .map((c) => joinText(c.source))
    .join("\n");
}

function viewOutputs(c: NbCell): ViewOutput[] {
  const outs: ViewOutput[] = [];
  for (const o of c.outputs || []) {
    if (o.output_type === "stream") outs.push({ t: "text", text: truncate(joinText(o.text).replace(ANSI, ""), 6000) });
    else if (o.output_type === "error")
      outs.push({ t: "text", text: truncate(((o.traceback || []).join("\n") || `${o.ename}: ${o.evalue}`).replace(ANSI, ""), 6000), error: true });
    else if (o.data) {
      const d = o.data as Record<string, unknown>;
      const img = ["image/png", "image/jpeg", "image/gif"].find((m) => d[m]);
      if (img) outs.push({ t: "image", mime: img, data: joinText(d[img]).replace(/\s+/g, "") });
      else if (d["image/svg+xml"])
        outs.push({ t: "image", mime: "image/svg+xml", data: btoaUtf8(joinText(d["image/svg+xml"])) });
      else if (d["text/plain"]) outs.push({ t: "text", text: truncate(joinText(d["text/plain"]), 6000) });
      else if (d["text/html"]) outs.push({ t: "text", text: truncate(stripHtml(joinText(d["text/html"])), 6000) });
    }
  }
  return outs;
}

function btoaUtf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function commentMap(comments: InlineComment[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of comments) {
    if (!c.comment?.trim()) continue;
    m.set(c.ref, m.has(c.ref) ? m.get(c.ref) + "\n\n" + c.comment : c.comment);
  }
  return m;
}

export function notebookViewCells(nb: Notebook, comments: InlineComment[] = []): ViewCell[] {
  const fb = commentMap(comments);
  return originalCells(nb).map((c, i): ViewCell => {
    const ref = cellRef(i);
    const src = joinText(c.source);
    if (c.cell_type === "code") {
      const lang = (nb.metadata?.language_info as { name?: string } | undefined)?.name || "python";
      return {
        t: "code",
        ref,
        src,
        prompt: typeof c.execution_count === "number" ? `In [${c.execution_count}]:` : "In [ ]:",
        outputs: viewOutputs(c),
        fb: fb.get(ref),
        lang,
      };
    }
    return { t: "md", ref, text: src, fb: fb.get(ref), plain: c.cell_type === "raw" };
  });
}

function cellId(): string {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) s += a[b % a.length];
  return "jg-" + s;
}

export type FeedbackHeader = {
  title: string;
  score: number;
  points: number;
  gradedAt?: string;
  sha256?: string;
};

export function summaryMarkdown(result: GradeResult, h: FeedbackHeader): string {
  const lines = [
    `## Feedback: ${h.score} / ${h.points}`,
    "",
    result.summary,
    "",
    ...result.criteria.map((c) => `- **${c.name}**, ${c.earned} / ${c.pts}${c.comment ? ": " + c.comment : ""}`),
    "",
    "*Graded with AI by Jupygrader. Comments marked **Feedback** below point to specific cells. Ask your instructor if something looks wrong.*",
  ];
  return lines.join("\n");
}

/**
 * Returns a copy of the notebook with a feedback summary at the top and a
 * feedback cell after every cell the grader commented on. Original cells,
 * outputs and metadata are kept as they are.
 */
export function insertNotebookFeedback(nb: Notebook, result: GradeResult, h: FeedbackHeader): Notebook {
  const withIds = nb.nbformat > 4 || (nb.nbformat === 4 && nb.nbformat_minor >= 5);
  const mk = (source: string, type: "summary" | "feedback", ref?: string): NbCell => ({
    cell_type: "markdown",
    ...(withIds ? { id: cellId() } : {}),
    metadata: { jupygrader: ref ? { type, ref } : { type }, tags: ["jupygrader-feedback"] },
    source: splitLines(source),
  });
  const fb = commentMap(result.comments);
  const cells: NbCell[] = [mk(summaryMarkdown(result, h), "summary")];
  originalCells(nb).forEach((c, i) => {
    cells.push(c);
    const ref = cellRef(i);
    const text = fb.get(ref);
    if (text) cells.push(mk(text.split("\n").map((l, k) => (k === 0 ? "> **Feedback:** " + l : "> " + l)).join("\n"), "feedback", ref));
  });
  return {
    ...nb,
    metadata: {
      ...nb.metadata,
      jupygrader: { score: h.score, points: h.points, title: h.title, gradedAt: h.gradedAt, sha256: h.sha256 },
    },
    cells,
  };
}

/** The element id nbconvert's HTML gives the cell with a marker such as C4 (see notebookForHtml). */
export const htmlCellAnchor = (ref: string) => "cell-id=jg-" + ref;

/**
 * insertNotebookFeedback for rendering with nbconvert. Every cell gets an id, original cells
 * one made from their marker, and nbconvert writes the ids into the HTML (htmlCellAnchor), so
 * the feedback page can scroll to the cells a comment refers to.
 */
export function notebookForHtml(nb: Notebook, result: GradeResult, h: FeedbackHeader): Notebook {
  const out = insertNotebookFeedback(nb, result, h);
  let original = 0;
  let feedback = 0;
  return {
    ...out,
    // Cell ids are part of nbformat 4.5.
    nbformat_minor: Math.max(out.nbformat_minor, 5),
    cells: out.cells.map((c) => ({ ...c, id: isFeedbackCell(c) ? `jg-fb${++feedback}` : "jg-" + cellRef(original++) })),
  };
}

export function serializeNotebook(nb: Notebook): string {
  return JSON.stringify(nb, null, 1) + "\n";
}
