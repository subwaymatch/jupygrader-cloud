import { describe, expect, it } from "vitest";
import { effectiveTotal, parseRows, pointsMismatch, quickItemize, rowsTotal, rubricProblem, scaleRows, serializeRows } from "@/lib/shared/rubric";

describe("rubric parsing", () => {
  it("parses 'Name (N pts): description' lines, with indented continuations", () => {
    const rows = parseRows("1. Data loading (20 pts): Reads the csv\n  and handles NaNs\n- Plots (30 points)\nNo points here");
    expect(rows).toEqual([
      { name: "Data loading", pts: "20", desc: "Reads the csv\nand handles NaNs" },
      { name: "Plots", pts: "30", desc: "" },
    ]);
  });

  it("round-trips through serializeRows", () => {
    const rows = [
      { name: "A", pts: "10", desc: "First" },
      { name: "B", pts: "5.5", desc: "" },
    ];
    expect(parseRows(serializeRows(rows))).toEqual(rows);
  });

  it("quickItemize reads tab-separated tables and /N points", () => {
    expect(quickItemize("Correctness\t40 pts\tAll answers right\nStyle /10")).toEqual([
      { name: "Correctness", pts: "40", desc: "All answers right" },
      { name: "Style", pts: "10", desc: "" },
    ]);
    expect(quickItemize("Just a paragraph about grading")).toEqual([]);
  });
});

describe("points", () => {
  it("defaults the total to 100", () => {
    expect(effectiveTotal("")).toBe(100);
    expect(effectiveTotal("37.3")).toBe(37.5);
    expect(effectiveTotal("-4")).toBe(100);
  });

  it("scales items to a total in half points, fixing rounding on the largest item", () => {
    const rows = scaleRows(
      [
        { name: "a", pts: "1", desc: "" },
        { name: "b", pts: "1", desc: "" },
        { name: "c", pts: "1", desc: "" },
      ],
      10,
    );
    expect(rowsTotal(rows)).toBe(10);
    expect(rows.every((r) => (+r.pts * 2) % 1 === 0)).toBe(true);
  });

  it("detects mismatches and blocks unsaveable rubrics", () => {
    expect(pointsMismatch("manual", [{ name: "a", pts: "40", desc: "" }], "50")).toEqual({ sum: 40, tot: 50 });
    expect(pointsMismatch("none", [], "50")).toBeNull();
    expect(rubricProblem({ method: "manual", rows: [], points: "", hasSource: false })).toMatch(/at least one/);
    expect(rubricProblem({ method: "paste", rows: [], points: "", hasSource: true })).toMatch(/Itemize/);
    expect(rubricProblem({ method: "none", rows: [], points: "abc", hasSource: false })).toMatch(/greater than 0/);
    expect(rubricProblem({ method: "manual", rows: [{ name: "x", pts: "5", desc: "" }], points: "", hasSource: false })).toBe("");
  });
});
