import { describe, expect, it } from "vitest";
import { courseSpanLabel, courseTermLabel } from "@/lib/shared/format";

describe("course date labels", () => {
  it("shortens the start date when both dates are in the same year", () => {
    expect(courseSpanLabel("2026-08-25", "2026-12-12", false)).toBe("Aug 25 to Dec 12, 2026");
    expect(courseSpanLabel("2026-09-01", "2027-01-15", false)).toBe("Sep 1, 2026 to Jan 15, 2027");
  });

  it("shows only the end date without a start date or when the course ends automatically", () => {
    expect(courseSpanLabel(null, "2027-10-30", true)).toBe("Until Oct 30, 2027");
    expect(courseSpanLabel("2026-10-30", "2027-10-30", true)).toBe("Until Oct 30, 2027");
  });

  it("counts term weeks from the start date", () => {
    expect(courseTermLabel("2026-08-25", "2026-12-12", false, "2026-08-25")).toBe("Week 1 of 16");
    expect(courseTermLabel("2026-08-25", "2026-12-12", false, "2026-08-31")).toBe("Week 1 of 16");
    expect(courseTermLabel("2026-08-25", "2026-12-12", false, "2026-10-30")).toBe("Week 10 of 16");
    expect(courseTermLabel("2026-08-25", "2026-12-12", false, "2026-12-12")).toBe("Week 16 of 16");
    expect(courseTermLabel("2026-08-25", "2027-08-25", true, "2026-10-30")).toBe("Week 10");
  });

  it("says when a course starts, and nothing once it has ended or without a start date", () => {
    expect(courseTermLabel("2026-11-09", "2027-03-01", false, "2026-10-30")).toBe("Starts Nov 9");
    expect(courseTermLabel("2027-01-12", "2027-05-01", false, "2026-10-30")).toBe("Starts Jan 12, 2027");
    expect(courseTermLabel("2026-01-12", "2026-05-01", false, "2026-10-30")).toBeNull();
    expect(courseTermLabel(null, "2027-05-01", true, "2026-10-30")).toBeNull();
  });
});
