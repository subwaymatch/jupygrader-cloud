import type { FeedbackLength, FileKind, GradingStyle, OutputPolicy, Role, SubmissionStatus, Tone } from "./constants";

export type RubricRow = { name: string; pts: string; desc: string };

export type StoredFile = { key: string; name: string; size: number; type: string; text?: string };

export type Criterion = {
  name: string;
  pts: number;
  earned: number;
  aiEarned: number;
  comment: string;
  refs: string[];
};

export type InlineComment = { ref: string; comment: string };

export type GradeResult = {
  criteria: Criterion[];
  comments: InlineComment[];
  summary: string;
  confidence: "high" | "low";
  lowReason: string;
};

export type GradedMeta = {
  rubricVersion: number;
  style: GradingStyle;
  tone: Tone;
  length: FeedbackLength;
  model: string;
  gradedAt: string;
};

/** Token counts. `input` includes the cached tokens and, on the Anthropic API, the tokens written to the cache (`cacheWrite`). */
export type Usage = { input: number; cached: number; cacheWrite?: number; output: number; reasoning: number };

export type HistoryEntry = { who: string; at: string; text: string };

export type NearOf = { id: string; file: string; pct: number };

/** One row of the submissions table, as returned by the list API. */
export type SubmissionListItem = {
  id: string;
  file: string;
  student: string;
  status: SubmissionStatus;
  note: string;
  kind: FileKind;
  sha256: string;
  size: number;
  score: number | null;
  aiScore: number | null;
  overridden: boolean;
  confidence: "high" | "low" | null;
  lowReason: string;
  nearOf: NearOf | null;
  reviewed: boolean;
  reviewedBy: string | null;
  outdated: boolean;
  uploadedAt: string;
  gradedAt: string | null;
  shareOn: boolean;
  shareToken: string | null;
  /** Earned points per rubric line, in rubric order (graded files only). */
  crit: number[] | null;
  tokens: number;
  costUsd: number;
  /** For files imported from Canvas: the student's Canvas user, the attempt, and the score last posted back. */
  canvas: { userId: string; attempt: number | null; postedAt: string | null; postedScore: number | null } | null;
};

export type AssignmentData = {
  id: string;
  courseId: string;
  title: string;
  points: number;
  taskText: string;
  taskFile: StoredFile | null;
  rubricMethod: "none" | "paste" | "manual";
  rubricSource: string;
  rubricFile: StoredFile | null;
  rubricRows: RubricRow[];
  style: GradingStyle;
  tone: Tone;
  length: FeedbackLength;
  notes: string;
  /** Null uses the site's setting. */
  aiImages: OutputPolicy | null;
  aiInteractive: OutputPolicy | null;
  version: number;
  answerKeys: { id: string; name: string; size: number }[];
  /** The Canvas assignment this one is linked to. */
  canvas: CanvasAssignmentLink | null;
};

export type CanvasAssignmentLink = { id: string; name: string; points: number | null };

/** What the signed-in person can do with Canvas on a page. */
export type CanvasStatus = {
  /** An admin has set the Canvas address. */
  enabled: boolean;
  /** The address, such as https://canvas.example.edu. */
  url: string;
  /** The person has connected their Canvas account. */
  connected: boolean;
};

export type CourseSummary = {
  id: string;
  name: string;
  role: Role;
  /** False when an admin sees a course they aren't a member of. */
  enrolled: boolean;
  startDate: string | null;
  endDate: string;
  autoEnd: boolean;
  archived: boolean;
  assignments: { id: string; title: string }[];
};

export type Me = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  notifyEmail: boolean;
};

/** A rendered cell of a submitted file, for the split view, previews and the student page. */
export type ViewCell =
  | { t: "md"; text: string; ref?: string; prompt?: string; fb?: string; plain?: boolean }
  | {
      t: "code";
      src: string;
      ref?: string;
      prompt?: string;
      outputs?: ViewOutput[];
      fb?: string;
      lang?: string;
    }
  | { t: "image"; src: string; alt: string; fb?: string; ref?: string }
  | { t: "note"; text: string };

export type ViewOutput =
  | { t: "text"; text: string; error?: boolean }
  | { t: "image"; mime: string; data: string }
  | { t: "html"; text: string };

export type SubmissionDetail = SubmissionListItem & {
  assignmentId: string;
  points: number;
  result: GradeResult | null;
  graded: GradedMeta | null;
  usage: Usage | null;
  history: HistoryEntry[];
  studentSet: boolean;
  cells: ViewCell[];
  refLabels: Record<string, string>;
  /** The graded notebook as nbconvert HTML, for the feedback page; null shows `cells` instead. */
  htmlUrl: string | null;
};
