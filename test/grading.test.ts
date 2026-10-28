import { describe, expect, it } from "vitest";
import { linesDoc } from "@/lib/shared/document";
import { parseNotebook } from "@/lib/shared/notebook";
import type { ContentPart } from "@/lib/server/ai";
import { buildGradingMessages, normalizeGrade, scoreFrom } from "@/lib/server/grading";
import { cleanOutputPolicy, MAX_AI_IMAGES, outputCount } from "@/lib/shared/constants";
import { minhash, similarity } from "@/lib/server/similarity";

const nb = parseNotebook(
  JSON.stringify({ nbformat: 4, nbformat_minor: 4, metadata: {}, cells: [{ cell_type: "code", source: "x = 1", execution_count: 1, outputs: [], metadata: {} }] }),
);
const rows = [
  { name: "Correctness", pts: "6", desc: "" },
  { name: "Style", pts: "4", desc: "" },
];

describe("normalizeGrade", () => {
  it("clamps points, rounds to halves, drops unknown markers and scales to the total", () => {
    const { result, score } = normalizeGrade(
      {
        criteria: [
          { item: 1, name: "x", max_points: 6, points: 9, comment: "ok", refs: ["C1", "C9"] },
          { item: 2, name: "y", max_points: 4, points: 1.3, comment: "meh", refs: [] },
        ],
        comments: [
          { ref: "C1", comment: "Good" },
          { ref: "C5", comment: "Nope" },
          { ref: "C1", comment: "" },
        ],
        summary: "Fine",
        confidence: "high",
        low_confidence_reason: "",
      },
      rows,
      20,
      { type: "notebook", nb },
    );
    expect(result.criteria.map((c) => [c.name, c.earned])).toEqual([
      ["Correctness", 6],
      ["Style", 1.5],
    ]);
    expect(result.criteria[0].refs).toEqual(["C1"]);
    expect(result.comments).toEqual([{ ref: "C1", comment: "Good" }]);
    expect(score).toBe(15);
  });

  it("flags low confidence when rubric items are missing", () => {
    const { result } = normalizeGrade({ criteria: [{ item: 1, points: 3 }], comments: [], summary: "", confidence: "high" }, rows, 10, { type: "notebook", nb });
    expect(result.confidence).toBe("low");
    expect(result.criteria[1].earned).toBe(0);
    expect(result.summary).not.toBe("");
  });

  it("scales AI-proposed items to the total when there is no rubric", () => {
    const { result, score } = normalizeGrade(
      { criteria: [{ name: "A", max_points: 50, points: 25 }, { name: "B", max_points: 50, points: 50 }], comments: [], summary: "s", confidence: "high" },
      [],
      10,
      linesDoc("a\nb", "py"),
    );
    expect(result.criteria.map((c) => c.pts)).toEqual([5, 5]);
    expect(score).toBe(7.5);
  });

  it("scoreFrom handles an empty rubric", () => {
    expect(scoreFrom([], 10)).toBe(0);
  });
});

describe("prompt", () => {
  it("includes the rubric, keeps the answer key confidential and hides the file name", () => {
    const msgs = buildGradingMessages({
      asg: { title: "HW 1", points: 10, task_text: "Do it", notes: "Be kind", style: "strict", tone: "direct", length: "brief" },
      rows,
      answerKeys: [{ name: "key.py", text: "x = 42" }],
      doc: { type: "notebook", nb },
      fileExt: "ipynb",
      maxImages: 6,
      maxInteractive: 0,
    });
    const sys = msgs[0].content as string;
    const parts = msgs[1].content as ContentPart[];
    const user = parts.map((p) => (p.type === "text" ? p.text : "")).join("\n");
    expect(sys).toContain("Grading style: Strict");
    expect(sys).toContain("never quote it");
    expect(sys).toContain('"not shown to you"');
    expect(user).toContain("1. Correctness (6 pts)");
    expect(user).toContain("Answer key (confidential");
    expect(user).toContain("<submission>");
    expect(user).not.toContain("brownisla");
  });

  it("tells the AI to give full points for attempted work under the Completion style, and falls back to Balanced", () => {
    const sys = (style: string) =>
      buildGradingMessages({
        asg: { title: "HW 1", points: 10, task_text: "Do it", notes: "", style, tone: "neutral", length: "standard" },
        rows,
        answerKeys: [],
        doc: { type: "notebook", nb },
        fileExt: "ipynb",
        maxImages: 6,
        maxInteractive: 0,
      })[0].content as string;
    expect(sys("completion")).toContain("Grading style: Completion.");
    expect(sys("completion")).toContain("an item with no attempt gets 0");
    expect(sys("lenient")).not.toContain("an item with no attempt gets 0");
    expect(sys("unknown")).toContain("Grading style: Balanced.");
  });

  it("puts the assignment context, which is the same for every file, in its own cacheable part", () => {
    const msgs = buildGradingMessages({
      asg: { title: "HW 1", points: 10, task_text: "Do it", notes: "", style: "balanced", tone: "neutral", length: "standard" },
      rows,
      answerKeys: [],
      doc: { type: "notebook", nb },
      fileExt: "ipynb",
      maxImages: 0,
      maxInteractive: 0,
    });
    const [context, submission, ...rest] = msgs[1].content as ContentPart[];
    expect(context).toMatchObject({ type: "text", cache: true });
    expect(context.type === "text" && context.text).toContain("1. Correctness (6 pts)");
    expect(context.type === "text" && context.text).not.toContain("<submission>");
    expect(submission).toMatchObject({ type: "text" });
    expect(submission.type === "text" && submission.cache).toBeFalsy();
    expect(submission.type === "text" && submission.text).toContain("<submission>");
    expect(rest).toEqual([]);
  });
});

describe("near-duplicate fingerprints", () => {
  const base = Array.from({ length: 80 }, (_, i) => `value_${i} = compute(data, ${i})`).join("\n");
  it("rates near copies as similar and unrelated code as different", () => {
    const a = minhash(base)!;
    const b = minhash(base.replace("value_3 ", "renamed_3 "))!;
    const c = minhash(Array.from({ length: 80 }, (_, i) => `other${i * 7}.plot(kind='bar', x=${i})`).join("\n"))!;
    expect(similarity(a, b)).toBeGreaterThan(0.85);
    expect(similarity(a, c)).toBeLessThan(0.3);
  });
  it("ignores very short texts", () => {
    expect(minhash("x = 1")).toBeNull();
  });
});

describe("output policies", () => {
  it("validates settings for images and interactive outputs and counts what to send", () => {
    expect(cleanOutputPolicy({ mode: "limit", limit: 4 })).toEqual({ mode: "limit", limit: 4 });
    expect(cleanOutputPolicy({ mode: "limit", limit: 0 })).toBeNull();
    expect(cleanOutputPolicy({ mode: "limit", limit: MAX_AI_IMAGES + 1 })).toBeNull();
    expect(cleanOutputPolicy({ mode: "all" })).toEqual({ mode: "all", limit: 6 });
    expect(cleanOutputPolicy({ mode: "some" })).toBeNull();
    expect(cleanOutputPolicy(null)).toBeNull();
    expect(outputCount({ mode: "all", limit: 6 }, MAX_AI_IMAGES)).toBe(MAX_AI_IMAGES);
    expect(outputCount({ mode: "limit", limit: 3 }, MAX_AI_IMAGES)).toBe(3);
    expect(outputCount({ mode: "none", limit: 3 }, MAX_AI_IMAGES)).toBe(0);
  });
});
