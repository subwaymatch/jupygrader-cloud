import { describe, expect, it } from "vitest";
import { canvasComment, canvasGrade, canvasOrigin, htmlToText, importedFileName, nextLink, planImport, planPosting } from "@/lib/shared/canvas";
import type { SubmissionListItem } from "@/lib/shared/types";

describe("canvasOrigin", () => {
  it("keeps only the origin and adds https", () => {
    expect(canvasOrigin("canvas.example.edu/courses/12")).toBe("https://canvas.example.edu");
    expect(canvasOrigin(" https://canvas.example.edu/ ")).toBe("https://canvas.example.edu");
  });

  it("rejects plain http except on localhost, and anything that isn't an address", () => {
    expect(canvasOrigin("http://canvas.example.edu")).toBeNull();
    expect(canvasOrigin("http://localhost:4100")).toBe("http://localhost:4100");
    expect(canvasOrigin("canvas")).toBeNull();
    expect(canvasOrigin("https://user:pw@canvas.example.edu")).toBeNull();
    expect(canvasOrigin("")).toBeNull();
  });
});

describe("nextLink", () => {
  it("finds the next page in a Canvas Link header", () => {
    const h =
      '<https://c.edu/api/v1/courses?page=1&per_page=100>; rel="current",<https://c.edu/api/v1/courses?page=2&per_page=100>; rel="next",<https://c.edu/api/v1/courses?page=1&per_page=100>; rel="first"';
    expect(nextLink(h)).toBe("https://c.edu/api/v1/courses?page=2&per_page=100");
    expect(nextLink('<https://c.edu/a?page=3>; rel="last"')).toBeNull();
    expect(nextLink(null)).toBeNull();
  });
});

describe("htmlToText", () => {
  it("keeps paragraphs and list items, drops tags and scripts, and decodes entities", () => {
    const html = "<p>Load the <strong>data</strong> &amp; plot it.</p><ul><li>Use pandas</li><li>Label axes</li></ul><script>alert(1)</script><p>Due&nbsp;Friday &#8212; good luck</p>";
    expect(htmlToText(html)).toBe("Load the data & plot it.\n\n- Use pandas\n- Label axes\n\nDue Friday — good luck");
  });
});

describe("canvasGrade", () => {
  it("scales to the Canvas assignment's points, or sends a percentage without them", () => {
    expect(canvasGrade(85, 100, 10)).toBe("8.5");
    expect(canvasGrade(17, 20, 20)).toBe("17");
    expect(canvasGrade(2, 3, 10)).toBe("6.67");
    expect(canvasGrade(85, 100, null)).toBe("85%");
    expect(canvasGrade(85, 100, 0)).toBe("85%");
  });
});

describe("importedFileName", () => {
  it("names files the way Canvas's bulk download does", () => {
    expect(importedFileName("Lovelace, Ada", "1234", "hw3.ipynb")).toBe("lovelaceada_1234_hw3.ipynb");
    expect(importedFileName("Ñúñez, José", "7", "a/b/lab.py")).toBe("nunezjose_7_lab.py");
    expect(importedFileName("", "7", "lab.py")).toBe("student_7_lab.py");
  });
});

describe("canvasComment", () => {
  it("has the score, summary and rubric lines, and says what's attached", () => {
    const text = canvasComment({
      score: 17.5,
      points: 20,
      attached: true,
      studentLink: "https://grader.example.edu/r/abc",
      result: {
        summary: "Clear work.",
        confidence: "high",
        lowReason: "",
        comments: [],
        criteria: [
          { name: "Loading", pts: 10, earned: 10, aiEarned: 10, comment: "", refs: [] },
          { name: "Plots", pts: 10, earned: 7.5, aiEarned: 7.5, comment: "Label the axes.", refs: [] },
        ],
      },
    });
    expect(text).toContain("Score: 17.5 / 20");
    expect(text).toContain("Clear work.");
    expect(text).toContain("- Loading: 10 / 10\n- Plots: 7.5 / 10. Label the axes.");
    expect(text).toContain("The attached file has the feedback");
    expect(text).toContain("Full feedback: https://grader.example.edu/r/abc");
  });
});

describe("planImport", () => {
  const sub = (userId: string, name: string, attachments: { id: string; name: string; size: number }[], state = "submitted") => ({
    userId,
    name,
    sortableName: name,
    attempt: 1,
    submittedAt: state === "unsubmitted" ? null : "2026-10-01T10:00:00Z",
    late: false,
    workflowState: state,
    attachments,
  });

  it("marks new files, new attempts, already imported, too large and missing files", () => {
    const rows = planImport(
      [
        sub("1", "Ada", [{ id: "a1", name: "hw.ipynb", size: 100 }]),
        sub("2", "Bea", [{ id: "b2", name: "hw.ipynb", size: 100 }]),
        sub("3", "Cy", [{ id: "c1", name: "hw.ipynb", size: 100 }]),
        sub("4", "Dee", [{ id: "d1", name: "huge.zip", size: 30 * 1024 * 1024 }]),
        sub("5", "Eve", [], "unsubmitted"),
        sub("6", "Fay", []),
      ],
      [
        { canvasUserId: "2", attachmentId: "b1" },
        { canvasUserId: "3", attachmentId: "c1" },
      ],
    );
    expect(rows.map((r) => [r.name, r.state])).toEqual([
      ["Ada", "new"],
      ["Bea", "new-attempt"],
      ["Cy", "imported"],
      ["Dee", "too-large"],
      ["Eve", "not-submitted"],
      ["Fay", "no-file"],
    ]);
  });
});

describe("planPosting", () => {
  let n = 0;
  const item = (userId: string, attempt: number, o: Partial<SubmissionListItem> = {}, posted?: { score: number }): SubmissionListItem =>
    ({
      id: "s" + ++n,
      file: `f${n}.ipynb`,
      student: "Student " + userId,
      status: "graded",
      score: 80,
      reviewed: false,
      confidence: "high",
      nearOf: null,
      canvas: { userId, attempt, postedAt: posted ? "2026-10-02T00:00:00Z" : null, postedScore: posted?.score ?? null },
      ...o,
    }) as SubmissionListItem;

  it("posts each student's latest attempt and says why others can't be posted", () => {
    const old = item("1", 1, { score: 50 });
    const latest = item("1", 2);
    const rows = planPosting([
      old,
      latest,
      item("2", 1, {}, { score: 80 }),
      item("3", 1, { score: 90 }, { score: 80 }),
      item("4", 1, { status: "queued", score: null }),
      item("5", 1),
      item("5", 1),
      item("6", 1, { status: "skipped", score: null }),
      item("7", 1, {}, undefined),
      { ...item("8", 1), canvas: null },
    ]);
    const byUser = Object.fromEntries(rows.map((r) => [r.canvasUserId, r]));
    expect(byUser["1"].item.id).toBe(latest.id);
    expect(byUser["1"].state).toBe("ready");
    expect(byUser["2"].state).toBe("posted");
    expect(byUser["3"].state).toBe("changed");
    expect(byUser["4"].state).toBe("not-graded");
    expect(byUser["5"].state).toBe("several-files");
    // A skipped duplicate isn't graded, so its student can't be posted from an older file.
    expect(byUser["6"].state).toBe("not-graded");
    expect(byUser["8"]).toBeUndefined();
  });
});
