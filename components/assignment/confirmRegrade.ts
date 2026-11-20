import { plural } from "@/lib/shared/format";

/**
 * What to ask before regrading, or null when there's nothing to ask: one file whose score nobody
 * changed. Regrading several files spends AI credit in one click, and regrading a file a grader
 * changed replaces their work with a new AI score.
 */
export function regradeConfirm(files: { status: string; overridden: boolean }[]) {
  const edited = files.filter((f) => f.status === "graded" && f.overridden).length;
  if (files.length < 2 && !edited) return null;
  const many = files.length > 1;
  return {
    title: many ? `Regrade ${files.length} files?` : "Regrade this file?",
    body:
      `The AI grades ${many ? "them" : "it"} again, which uses AI credit, and the new ${many ? "scores replace the current ones" : "score replaces the current one"}.` +
      (edited
        ? many
          ? ` ${edited === 1 ? "One has a score" : `${edited} have scores`} that a grader changed. Those changes are replaced too.`
          : " A grader changed this file's score. That change is replaced too."
        : ""),
    cta: many ? `Regrade ${plural(files.length, "file")}` : "Regrade",
  };
}
