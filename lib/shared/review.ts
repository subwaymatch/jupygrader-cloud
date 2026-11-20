/**
 * A graded file someone should look at before its grade goes out: the AI wasn't confident, or the file
 * closely matches another one, and nobody has marked it reviewed yet. The student link for such a file
 * stays closed until it's reviewed (lib/server/share.ts).
 */
export function needsReview(f: { status: string; reviewed: boolean; confidence: string | null; nearOf: unknown }): boolean {
  return f.status === "graded" && !f.reviewed && (f.confidence === "low" || !!f.nearOf);
}
