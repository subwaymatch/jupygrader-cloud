import { LINE_COMMENT, extOf, type FileKind } from "./constants";
import {
  insertNotebookFeedback,
  notebookForAI,
  notebookPlainText,
  notebookRefLabels,
  notebookViewCells,
  serializeNotebook,
  summaryMarkdown,
  type AiImage,
  type FeedbackHeader,
  type Notebook,
} from "./notebook";
import type { GradeResult, InlineComment, ViewCell } from "./types";

/** A submitted file, read into a structure the grader and the viewers share. */
export type SourceDoc =
  | { type: "notebook"; nb: Notebook }
  | { type: "lines"; lines: string[]; ext: string; truncated: boolean }
  | { type: "paras"; paras: string[]; ext: string; markdown: boolean }
  | { type: "image"; mime: string; data: string }
  | { type: "unsupported"; reason: string };

const MAX_LINES = 4000;

export function linesDoc(text: string, ext: string): SourceDoc {
  const all = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
  return { type: "lines", lines: all.slice(0, MAX_LINES), ext, truncated: all.length > MAX_LINES };
}

export function parasDoc(text: string, ext: string, markdown = false): SourceDoc {
  const paras = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return { type: "paras", paras, ext, markdown };
}

export function parseLineRef(ref: string): [number, number] | null {
  const m = /^L(\d+)(?:-(\d+))?$/.exec(ref.trim());
  if (!m) return null;
  const a = +m[1];
  const b = m[2] ? +m[2] : a;
  return [Math.min(a, b), Math.max(a, b)];
}

export function refLabels(doc: SourceDoc): Record<string, string> {
  if (doc.type === "notebook") return notebookRefLabels(doc.nb);
  if (doc.type === "paras") {
    const out: Record<string, string> = {};
    doc.paras.forEach((_, i) => (out["P" + (i + 1)] = "Paragraph " + (i + 1)));
    return out;
  }
  return {};
}

/** Display label for a reference such as C4, L10-14 or P3. */
export function labelFor(ref: string, labels: Record<string, string>): string {
  if (labels[ref]) return labels[ref];
  const l = parseLineRef(ref);
  if (l) return l[0] === l[1] ? "Line " + l[0] : `Lines ${l[0]}-${l[1]}`;
  const p = /^P(\d+)$/.exec(ref);
  if (p) return "Paragraph " + p[1];
  return ref;
}

export type AiDocument = { text: string; images: AiImage[]; refHelp: string };

/** `images` and `interactive` say whether notebook output images and interactive outputs are sent. A submitted image is always sent. */
export function docForAI(doc: SourceDoc, opts: { images: boolean; interactive: boolean }): AiDocument {
  if (doc.type === "notebook") {
    const r = notebookForAI(doc.nb, { maxImages: opts.images ? 6 : 0, interactive: opts.interactive });
    return {
      text: r.text,
      images: r.images,
      refHelp: 'Refer to cells by their marker, for example "C3". Comment only on cells that exist.',
    };
  }
  if (doc.type === "lines") {
    const w = String(doc.lines.length).length;
    let used = 0;
    const out: string[] = [];
    for (let i = 0; i < doc.lines.length; i++) {
      const line = String(i + 1).padStart(w) + " | " + doc.lines[i];
      used += line.length + 1;
      if (used > 120_000) {
        out.push(`[File cut off after line ${i} because it is too long.]`);
        break;
      }
      out.push(line);
    }
    if (doc.truncated) out.push(`[File cut off after line ${doc.lines.length}.]`);
    return {
      text: out.join("\n"),
      images: [],
      refHelp: 'Refer to line ranges, for example "L12-18" or "L7". Use the line numbers shown.',
    };
  }
  if (doc.type === "paras") {
    let used = 0;
    const out: string[] = [];
    for (let i = 0; i < doc.paras.length; i++) {
      const block = `[P${i + 1}] ${doc.paras[i]}`;
      used += block.length;
      if (used > 120_000) {
        out.push(`[Document cut off after paragraph ${i} because it is too long.]`);
        break;
      }
      out.push(block);
    }
    return {
      text: out.join("\n\n"),
      images: [],
      refHelp: 'Refer to paragraphs by their marker, for example "P4".',
    };
  }
  if (doc.type === "image") {
    return {
      text: "[The submission is the attached image 1.]",
      images: [{ mime: doc.mime, data: doc.data, label: "image 1 (the submission)" }],
      refHelp: 'There are no markers. For inline comments, use a short label for the part you mean, for example "Part (b)" or "Top of page".',
    };
  }
  return { text: "", images: [], refHelp: "" };
}

export function plainText(doc: SourceDoc): string {
  if (doc.type === "notebook") return notebookPlainText(doc.nb);
  if (doc.type === "lines") return doc.lines.join("\n");
  if (doc.type === "paras") return doc.paras.join("\n\n");
  return "";
}

function commentsByRef(comments: InlineComment[]) {
  const m = new Map<string, string>();
  for (const c of comments) {
    if (!c.comment?.trim()) continue;
    m.set(c.ref, m.has(c.ref) ? m.get(c.ref) + "\n\n" + c.comment : c.comment);
  }
  return m;
}

/** For code files: line ranges that carry comments, sorted by end line. */
function lineAnchors(comments: InlineComment[], max: number) {
  const anchors: { a: number; b: number; ref: string; text: string }[] = [];
  for (const [ref, text] of commentsByRef(comments)) {
    const r = parseLineRef(ref);
    if (!r) continue;
    anchors.push({ a: Math.max(1, r[0]), b: Math.min(max, r[1]), ref, text });
  }
  return anchors.sort((x, y) => x.b - y.b || x.a - y.a);
}

export function docViewCells(doc: SourceDoc, comments: InlineComment[] = []): ViewCell[] {
  if (doc.type === "notebook") return notebookViewCells(doc.nb, comments);
  if (doc.type === "lines") {
    const anchors = lineAnchors(comments, doc.lines.length);
    const cells: ViewCell[] = [];
    let start = 1;
    for (const an of anchors) {
      if (an.b >= start) {
        cells.push({ t: "code", src: doc.lines.slice(start - 1, an.b).join("\n"), prompt: `${start}-${an.b}`, ref: an.ref, fb: an.text, lang: doc.ext });
        start = an.b + 1;
      } else {
        // Overlapping range: attach to the previous block.
        const prev = cells[cells.length - 1];
        if (prev && prev.t === "code") prev.fb = (prev.fb ? prev.fb + "\n\n" : "") + an.text;
      }
    }
    if (start <= doc.lines.length) {
      cells.push({ t: "code", src: doc.lines.slice(start - 1).join("\n"), prompt: `${start}-${doc.lines.length}`, lang: doc.ext });
    }
    if (doc.truncated) cells.push({ t: "note", text: "The file is longer than shown here." });
    // Comments that don't point at lines (e.g. "Overall") go at the end.
    const other = [...commentsByRef(comments)].filter(([ref]) => !parseLineRef(ref));
    for (const [ref, text] of other) cells.push({ t: "md", text: "", prompt: ref, fb: text, ref });
    return cells;
  }
  if (doc.type === "paras") {
    const fb = commentsByRef(comments);
    const cells: ViewCell[] = doc.paras.map((p, i) => ({
      t: "md",
      text: p,
      ref: "P" + (i + 1),
      prompt: "¶" + (i + 1),
      fb: fb.get("P" + (i + 1)),
      plain: !doc.markdown,
    }));
    for (const [ref, text] of fb) if (!/^P\d+$/.test(ref)) cells.push({ t: "md", text: "", prompt: ref, fb: text, ref });
    return cells;
  }
  if (doc.type === "image") {
    const cells: ViewCell[] = [{ t: "image", src: `data:${doc.mime};base64,${doc.data}`, alt: "Submitted image" }];
    for (const [ref, text] of commentsByRef(comments)) cells.push({ t: "md", text: "", prompt: ref, fb: text, ref });
    return cells;
  }
  return [{ t: "note", text: doc.reason }];
}

function wrap(text: string, n: number): string[] {
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

/** Source code with the score and comments added as code comments. */
export function annotateSource(doc: Extract<SourceDoc, { type: "lines" }>, result: GradeResult, h: FeedbackHeader): string {
  const [open, close] = LINE_COMMENT[doc.ext] || ["# ", ""];
  const c = (t: string) =>
    wrap(t, 76)
      .map((l) => open + l + close)
      .join("\n");
  const head = [
    c(`Jupygrader feedback: ${h.score} / ${h.points}`),
    c(result.summary),
    ...result.criteria.map((x) => c(`${x.name}: ${x.earned} / ${x.pts}. ${x.comment}`)),
    c("Graded with AI. Ask your instructor if something looks wrong."),
  ].join("\n");
  const anchors = lineAnchors(result.comments, doc.lines.length);
  const after = new Map<number, string[]>();
  for (const an of anchors) after.set(an.b, [...(after.get(an.b) || []), an.text]);
  const body: string[] = [];
  doc.lines.forEach((line, i) => {
    body.push(line);
    const notes = after.get(i + 1);
    if (notes) {
      const indent = /^\s*/.exec(line)?.[0] ?? "";
      for (const n of notes)
        body.push(
          wrap("Feedback: " + n, 72)
            .map((l) => indent + open + l + close)
            .join("\n"),
        );
    }
  });
  return head + "\n\n" + body.join("\n") + "\n";
}

/** Markdown or text documents with feedback after each commented paragraph. */
export function annotateParas(doc: Extract<SourceDoc, { type: "paras" }>, result: GradeResult, h: FeedbackHeader): string {
  const md = doc.markdown || doc.ext === "md";
  const fb = commentsByRef(result.comments);
  const head = md
    ? summaryMarkdown(result, h)
    : [
        `Feedback: ${h.score} / ${h.points}`,
        "",
        result.summary,
        "",
        ...result.criteria.map((c) => `- ${c.name}, ${c.earned} / ${c.pts}. ${c.comment}`),
      ].join("\n");
  const body = doc.paras
    .map((p, i) => {
      const note = fb.get("P" + (i + 1));
      if (!note) return p;
      return p + "\n\n" + (md ? "> **Feedback:** " + note.replace(/\n/g, "\n> ") : "[Feedback] " + note);
    })
    .join("\n\n");
  return head + "\n\n" + (md ? "---" : "----------") + "\n\n" + body + "\n";
}

export type DownloadFormat = "html" | "txt" | "ipynb" | "src" | "doc" | "json" | "original";

export function downloadFormats(file: string, kind: FileKind): { id: DownloadFormat; label: string; ext: string }[] {
  const x = extOf(file);
  const list: { id: DownloadFormat; label: string; ext: string }[] = [
    { id: "html", label: kind === "notebook" ? "Notebook as HTML" : "File as HTML", ext: ".html" },
  ];
  if (kind === "notebook") list.push({ id: "ipynb", label: "Notebook with feedback", ext: ".ipynb" });
  else if (kind === "code" && LINE_COMMENT[x]) list.push({ id: "src", label: "Code with feedback comments", ext: "." + x });
  else if (kind === "doc" && (x === "md" || x === "txt")) list.push({ id: "doc", label: "Document with feedback", ext: "." + x });
  list.push({ id: "txt", label: "Feedback summary", ext: ".txt" });
  list.push({ id: "json", label: "Feedback data", ext: ".json" });
  return list;
}

export function annotatedNotebook(doc: Extract<SourceDoc, { type: "notebook" }>, result: GradeResult, h: FeedbackHeader) {
  return serializeNotebook(insertNotebookFeedback(doc.nb, result, h));
}
