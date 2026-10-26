import { describe, expect, it } from "vitest";
import { annotateParas, annotateSource, docViewCells, linesDoc, parasDoc } from "@/lib/shared/document";
import { insertNotebookFeedback, notebookForAI, notebookRefLabels, parseNotebook, serializeNotebook } from "@/lib/shared/notebook";
import type { GradeResult } from "@/lib/shared/types";

const raw = JSON.stringify({
  nbformat: 4,
  nbformat_minor: 5,
  metadata: { language_info: { name: "python" } },
  cells: [
    { id: "m1", cell_type: "markdown", metadata: {}, source: ["# Title\n", "Intro"] },
    { id: "c1", cell_type: "code", metadata: {}, execution_count: 3, outputs: [{ output_type: "stream", name: "stdout", text: ["hello\n"] }], source: ["print('hello')"] },
    {
      id: "c2",
      cell_type: "code",
      metadata: {},
      execution_count: 4,
      outputs: [{ output_type: "display_data", metadata: {}, data: { "image/png": "iVBORw0KGgo=", "text/plain": "<Figure>" } }],
      source: "plot()",
    },
    { id: "c3", cell_type: "code", metadata: {}, execution_count: null, outputs: [], source: [] },
  ],
});

const result: GradeResult = {
  criteria: [{ name: "Correctness", pts: 10, earned: 7.5, aiEarned: 7.5, comment: "Mostly right.", refs: ["C2"] }],
  comments: [
    { ref: "C2", comment: "Good print." },
    { ref: "C3", comment: "Label the axes.\nAnd add a title." },
  ],
  summary: "Nice work.",
  confidence: "high",
  lowReason: "",
};

describe("notebooks", () => {
  it("renders cells with markers and attaches images for the AI", () => {
    const nb = parseNotebook(raw);
    const ai = notebookForAI(nb);
    expect(ai.text).toContain("[C1] markdown cell");
    expect(ai.text).toContain("[C2] code cell, In [3]");
    expect(ai.text).toContain("Output of C2:\nhello");
    expect(ai.text).toContain("[image output: attached as image 1]");
    expect(ai.text).toContain("(C4 was not run)");
    expect(ai.images).toHaveLength(1);
    expect(notebookRefLabels(nb)).toMatchObject({ C2: "In [3]", C4: "Cell 4" });
  });

  it("replaces images with a note when they aren't sent", () => {
    const ai = notebookForAI(parseNotebook(raw), { maxImages: 0 });
    expect(ai.text).toContain("[image output, not shown to you: <Figure>]");
    expect(ai.images).toEqual([]);
  });

  it("replaces interactive outputs with a note unless they are sent", () => {
    const nb = parseNotebook(
      JSON.stringify({
        nbformat: 4,
        nbformat_minor: 5,
        metadata: {},
        cells: [
          {
            cell_type: "code",
            metadata: {},
            execution_count: 1,
            source: "fig.show()",
            outputs: [
              { output_type: "display_data", metadata: {}, data: { "application/vnd.plotly.v1+json": { data: [] }, "text/plain": "Figure({'data': [...]})" } },
              { output_type: "display_data", metadata: {}, data: { "text/html": "<div id='map'></div><script>L.map('map')</script>" } },
              { output_type: "execute_result", metadata: {}, execution_count: 1, data: { "text/plain": "   a  b\n0  1  2" } },
            ],
          },
        ],
      }),
    );
    const off = notebookForAI(nb).text;
    expect(off).toContain("[Plotly chart, not shown to you]");
    expect(off).toContain("[interactive HTML output, not shown to you]");
    expect(off).not.toContain("Figure({");
    expect(off).toContain("0  1  2");
    expect(notebookForAI(nb, { interactive: true }).text).toContain("Figure({'data': [...]})");
  });

  it("inserts a summary cell and feedback cells, keeping the original cells", () => {
    const nb = parseNotebook(raw);
    const out = insertNotebookFeedback(nb, result, { title: "HW", score: 7.5, points: 10 });
    expect(out.cells).toHaveLength(nb.cells.length + 3);
    expect(out.cells[0].metadata?.jupygrader).toEqual({ type: "summary" });
    expect((out.cells[0].source as string[]).join("")).toContain("## Feedback: 7.5 / 10");
    const fbAfterC2 = out.cells[3];
    expect(out.cells[2].id).toBe("c1");
    expect(fbAfterC2.metadata?.jupygrader).toEqual({ type: "feedback", ref: "C2" });
    expect((fbAfterC2.source as string[]).join("")).toBe("> **Feedback:** Good print.");
    expect((out.cells[5].source as string[]).join("")).toBe("> **Feedback:** Label the axes.\n> And add a title.");
    expect(out.cells.every((c) => typeof c.id === "string")).toBe(true);
    expect(out.metadata.jupygrader).toMatchObject({ score: 7.5, points: 10 });
    // Original outputs are untouched.
    expect(out.cells.find((c) => c.id === "c2")?.outputs?.[0].data?.["image/png"]).toBe("iVBORw0KGgo=");
  });

  it("regrading a graded notebook replaces old feedback instead of stacking it", () => {
    const once = insertNotebookFeedback(parseNotebook(raw), result, { title: "HW", score: 7.5, points: 10 });
    const twice = insertNotebookFeedback(parseNotebook(serializeNotebook(once)), result, { title: "HW", score: 7.5, points: 10 });
    expect(twice.cells).toHaveLength(once.cells.length);
  });

  it("omits cell ids for older nbformat minors", () => {
    const old = JSON.parse(raw);
    old.nbformat_minor = 4;
    old.cells.forEach((c: { id?: string }) => delete c.id);
    const out = insertNotebookFeedback(parseNotebook(JSON.stringify(old)), result, { title: "HW", score: 7.5, points: 10 });
    expect(out.cells.some((c) => "id" in c)).toBe(false);
  });

  it("rejects files that aren't notebooks", () => {
    expect(() => parseNotebook("not json")).toThrow(/valid JSON/);
    expect(() => parseNotebook("{}")).toThrow(/no cells/);
  });
});

describe("other file types", () => {
  it("annotates source files with line comments after the commented range", () => {
    const doc = linesDoc("import x\n\ndef f():\n    return 1\n", "py") as Extract<ReturnType<typeof linesDoc>, { type: "lines" }>;
    const r: GradeResult = { ...result, comments: [{ ref: "L3-4", comment: "Name this better." }] };
    const out = annotateSource(doc, r, { title: "HW", score: 7.5, points: 10 });
    expect(out.startsWith("# Jupygrader feedback: 7.5 / 10")).toBe(true);
    expect(out).toContain("    return 1\n    # Feedback: Name this better.");
    const cells = docViewCells(doc, r.comments);
    expect(cells[0]).toMatchObject({ t: "code", prompt: "1-4", fb: "Name this better." });
  });

  it("annotates markdown documents by paragraph", () => {
    const doc = parasDoc("First para.\n\nSecond para.", "md", true) as Extract<ReturnType<typeof parasDoc>, { type: "paras" }>;
    const out = annotateParas(doc, { ...result, comments: [{ ref: "P2", comment: "Expand this." }] }, { title: "HW", score: 7.5, points: 10 });
    expect(out).toContain("Second para.\n\n> **Feedback:** Expand this.");
  });
});
