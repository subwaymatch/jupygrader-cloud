import type { RubricRow } from "./types";

export const EXAMPLE_RUBRIC = [
  "Data loading & cleaning (20 pts): Reads the data file, handles missing values and dtypes.",
  "Exploratory analysis (30 pts): Summary statistics and at least three grouped comparisons.",
  "Visualizations (25 pts): Labeled plots that support each claim.",
  "Written interpretation (15 pts): Clear markdown answers to each question.",
  "Code quality (10 pts): Runs top to bottom without errors.",
].join("\n");

const half = (n: number) => Math.round(n * 2) / 2;

/** Splits rubric text into logical lines; indented lines continue the previous item. */
function rubricLines(text: string): string[] {
  const out: string[] = [];
  String(text || "")
    .split("\n")
    .forEach((line) => {
      if (/^[ \t]{2,}\S/.test(line) && out.length) out[out.length - 1] += "\n" + line.replace(/^[ \t]+/, "");
      else out.push(line);
    });
  return out;
}

/** Parses lines written as "Name (20 pts): description". */
export function parseRows(text: string): RubricRow[] {
  return rubricLines(text)
    .map((line) => {
      const m = line.match(
        /^\s*(?:\d+[.)]|[-*•])?\s*([\s\S]*?)\s*\((\d+(?:\.\d+)?)\s*(?:pts?|points?)\)\s*:?\s*([\s\S]*)$/i,
      );
      return m && m[1] ? { name: m[1].trim(), pts: m[2], desc: (m[3] || "").trim() } : null;
    })
    .filter((r): r is RubricRow => !!r);
}

export function serializeRows(rows: RubricRow[]): string {
  const indent = (s: string) => s.trim().replace(/\n[ \t]*/g, "\n  ");
  return rows
    .filter((r) => (r.name || "").trim())
    .map((r) => indent(r.name) + " (" + (+r.pts || 0) + " pts)" + ((r.desc || "").trim() ? ": " + indent(r.desc) : ""))
    .join("\n");
}

export function namedRows(rows: RubricRow[]): RubricRow[] {
  return (rows || []).filter((r) => (r.name || "").trim());
}

export function rowsTotal(rows: RubricRow[]): number {
  return half(namedRows(rows).reduce((a, r) => a + (+r.pts || 0), 0));
}

/** The assignment total; a blank or invalid value means 100. */
export function effectiveTotal(points: string | number | null | undefined): number {
  const v = +String(points ?? "").trim();
  return v > 0 ? half(v) : 100;
}

/** Scales item points so they add up to `total`, keeping half-point steps. */
export function scaleRows(rows: RubricRow[], total: number): RubricRow[] {
  const sum = rowsTotal(rows);
  if (!sum || !(total > 0) || sum === total) return rows;
  const out = rows.map((r) => ({ ...r, pts: String(half(((+r.pts || 0) * total) / sum)) }));
  const diff = half(total - rowsTotal(out));
  if (diff) {
    let k = -1;
    out.forEach((r, i) => {
      if ((r.name || "").trim() && (k < 0 || (+r.pts || 0) > (+out[k].pts || 0))) k = i;
    });
    if (k >= 0) out[k] = { ...out[k], pts: String(half((+out[k].pts || 0) + diff)) };
  }
  return out;
}

export type RubricMethod = "none" | "paste" | "manual";

export function pointsMismatch(method: RubricMethod, rows: RubricRow[], points: string | number) {
  if (method === "none") return null;
  const sum = rowsTotal(rows);
  const tot = effectiveTotal(points);
  return sum > 0 && sum !== tot ? { sum, tot } : null;
}

/** Returns a message if the rubric can't be saved yet, or "" if it can. */
export function rubricProblem(opts: {
  method: RubricMethod;
  rows: RubricRow[];
  points: string;
  hasSource: boolean;
}): string {
  const v = String(opts.points ?? "").trim();
  if (v && !(+v > 0)) return "Total points must be a number greater than 0.";
  if (opts.method === "none") return "";
  const rows = namedRows(opts.rows);
  if (!rows.length) {
    if (opts.method === "manual") return "Add at least one rubric item, or choose No rubric.";
    return opts.hasSource ? "Itemize the rubric with AI first, so each item has points." : "Paste or upload a rubric, or choose No rubric.";
  }
  if (!rowsTotal(rows)) return "Give the rubric items points.";
  return "";
}

/**
 * Best-effort itemizing without the AI, for rubrics that already list points.
 * Returns [] when the text doesn't look like a list of scored items.
 */
export function quickItemize(text: string): RubricRow[] {
  const parsed = parseRows(text);
  if (parsed.length) return parsed;
  const clean = (x: string) => x.replace(/^[\s,:;.\-|]+|[\s,:;\-|]+$/g, "").replace(/\s{2,}/g, " ");
  const cap = (x: string) => (x ? x.charAt(0).toUpperCase() + x.slice(1) : x);
  const lines = text
    .split(/\n/)
    .map((l) =>
      l
        .replace(/^\s*(?:\d+[.)]|[-*•]|[a-z][.)])\s+/i, "")
        .replace(/\t+/g, " | ")
        .trim(),
    )
    .filter((l) => l.length > 2)
    .slice(0, 20);
  const items = lines.map((l) => {
    const m =
      l.match(/\(?\s*(\d+(?:\.\d+)?)\s*(?:pts?|points?|marks?)\s*\)?/i) || l.match(/\/\s*(\d+(?:\.\d+)?)\b/);
    if (!m || m.index === undefined) return null;
    const rest = l.slice(0, m.index) + " | " + l.slice(m.index + m[0].length);
    const parts = rest
      .split(/\s*(?:\||:|\s-\s|\.\s)\s*/)
      .map(clean)
      .filter(Boolean);
    let name = parts[0] || "Item";
    let desc = parts.slice(1).join(", ");
    if (!desc && name.split(/\s+/).length > 6) {
      desc = name;
      name = name.split(/\s+/).slice(0, 5).join(" ");
    }
    return { name: cap(clean(name)), pts: m[1], desc: cap(desc) };
  });
  if (!items.length || items.some((i) => !i)) return [];
  return items as RubricRow[];
}

export function emptyRow(): RubricRow {
  return { name: "", pts: "", desc: "" };
}
