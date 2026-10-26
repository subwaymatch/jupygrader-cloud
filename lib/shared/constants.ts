export const ROLES = ["Teacher", "Grader"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_INFO: Record<Role, string> = {
  Teacher:
    "Full control of the course. Creates assignments and rubrics, grades, changes scores and manages people.",
  Grader:
    "Uploads files for grading, reviews the AI feedback and changes scores. Cannot edit assignments or manage people.",
};

export const STYLES = [
  { id: "lenient", name: "Lenient", desc: "Gives partial credit generously. Focuses on whether the main idea is right." },
  { id: "balanced", name: "Balanced", desc: "Follows the rubric closely and gives partial credit for a correct approach." },
  { id: "strict", name: "Strict", desc: "Expects every requirement to be met exactly. Small mistakes lose points." },
] as const;
export type GradingStyle = (typeof STYLES)[number]["id"];

export const TONES = [
  { id: "encouraging", name: "Encouraging" },
  { id: "neutral", name: "Neutral" },
  { id: "direct", name: "Direct" },
] as const;
export type Tone = (typeof TONES)[number]["id"];

export const LENGTHS = [
  { id: "brief", name: "Brief" },
  { id: "standard", name: "Standard" },
  { id: "detailed", name: "Detailed" },
] as const;
export type FeedbackLength = (typeof LENGTHS)[number]["id"];

export const STATUS = {
  queued: { label: "Queued", color: "var(--c-muted-dot)" },
  grading: { label: "Grading", color: "var(--c-primary)" },
  graded: { label: "Graded", color: "var(--c-success)" },
  failed: { label: "Failed", color: "var(--c-danger)" },
  skipped: { label: "Duplicate", color: "var(--c-warning)" },
  cancelled: { label: "Cancelled", color: "var(--c-muted)" },
} as const;
export type SubmissionStatus = keyof typeof STATUS;

export const ACTIVITY_TYPES = {
  grading: "Grading",
  grades: "Grade changes",
  rubrics: "Assignments",
  people: "People",
  exports: "Exports",
  sharing: "Sharing",
  settings: "Settings",
} as const;
export type ActivityType = keyof typeof ACTIVITY_TYPES;

export const RETENTION_OPTIONS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
] as const;

export function retentionLabel(days: number): string {
  return RETENTION_OPTIONS.find((o) => o.days === days)?.label ?? `${days} days`;
}

export type FileKind = "notebook" | "code" | "doc" | "data" | "image" | "other";

const KIND_RE: [FileKind, RegExp][] = [
  ["notebook", /\.ipynb$/i],
  ["code", /\.(py|r|rmd|qmd|js|mjs|ts|jsx|tsx|java|c|cc|cpp|h|hpp|cs|go|rs|rb|php|swift|kt|scala|m|jl|sql|sh|html|css|hs|lua|pl)$/i],
  ["doc", /\.(pdf|docx|md|txt|tex|rtf)$/i],
  ["data", /\.(csv|tsv|json|xml|ya?ml)$/i],
  ["image", /\.(png|jpe?g|gif|webp)$/i],
];

export function kindOf(file: string): FileKind {
  return KIND_RE.find(([, re]) => re.test(file))?.[0] ?? "other";
}

export function extOf(file: string): string {
  const m = /\.([^./]+)$/.exec(file || "");
  return m ? m[1].toLowerCase() : "";
}

export function baseName(file: string): string {
  return (file.split("/").pop() || file).replace(/\.[^./]+$/, "");
}

/** Comment syntax for annotating source files with feedback. */
export const LINE_COMMENT: Record<string, [string, string]> = (() => {
  const m: Record<string, [string, string]> = {};
  "py r rmd qmd jl sh rb pl".split(" ").forEach((e) => (m[e] = ["# ", ""]));
  "js mjs ts jsx tsx java c cc cpp h hpp cs go rs swift kt scala php".split(" ").forEach((e) => (m[e] = ["// ", ""]));
  "sql hs lua".split(" ").forEach((e) => (m[e] = ["-- ", ""]));
  m.m = ["% ", ""];
  m.html = ["<!-- ", " -->"];
  m.css = ["/* ", " */"];
  return m;
})();

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_DOC_BYTES = 15 * 1024 * 1024;

/** Accepted types for instructions and rubric documents. */
export const DOC_ACCEPT = ".pdf,.docx,.md,.txt";
