// Lining up two submitted files to show what they share, for the comparison page.
import type { SourceDoc } from "./document";
import { cellLabel, joinText, originalCells } from "./notebook";

/** A stretch of a file: a notebook cell, or the whole of a code or text file. */
export type CompareBlock = { label: string; kind: "code" | "text"; lines: string[] };

export type MarkedLine = {
  text: string;
  /** same: the other file has this line too. starter: it comes from the starter file, so it shows nothing. */
  mark: "same" | "starter" | null;
};
export type MarkedBlock = { label: string; kind: "code" | "text"; lines: MarkedLine[] };

export function compareBlocks(doc: SourceDoc): CompareBlock[] {
  if (doc.type === "notebook")
    return originalCells(doc.nb)
      .map((c, i) => ({
        label: cellLabel(c, i),
        kind: c.cell_type === "code" ? ("code" as const) : ("text" as const),
        lines: joinText(c.source).replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n"),
      }))
      .filter((b) => b.lines.some((l) => l.trim()));
  if (doc.type === "lines") return [{ label: "", kind: "code", lines: doc.lines }];
  if (doc.type === "paras") return doc.paras.map((p, i) => ({ label: "¶" + (i + 1), kind: "text" as const, lines: p.split("\n") }));
  return [];
}

/** A line as it's compared: spacing doesn't count. */
const key = (line: string) => line.trim().replace(/\s+/g, " ");
/** Lines this short ("else:", "}") are in every file, so they say nothing about copying. */
const MIN_KEY = 6;
const counts = (k: string) => k.length >= MIN_KEY;

export function lineKeys(blocks: CompareBlock[]): Set<string> {
  const out = new Set<string>();
  for (const b of blocks) for (const l of b.lines) if (counts(key(l))) out.add(key(l));
  return out;
}

/**
 * Marks the lines of one file that the other file also has, setting aside the starter's. `own`
 * counts the lines the author wrote (long enough to mean something, and not from the starter)
 * and `shared` how many of those the other file has too.
 */
export function markShared(blocks: CompareBlock[], other: Set<string>, starter: Set<string>): { blocks: MarkedBlock[]; own: number; shared: number } {
  let own = 0;
  let shared = 0;
  const marked = blocks.map((b) => ({
    label: b.label,
    kind: b.kind,
    lines: b.lines.map((text): MarkedLine => {
      const k = key(text);
      if (!counts(k)) return { text, mark: null };
      if (starter.has(k)) return { text, mark: "starter" };
      own++;
      if (!other.has(k)) return { text, mark: null };
      shared++;
      return { text, mark: "same" };
    }),
  }));
  return { blocks: marked, own, shared };
}
