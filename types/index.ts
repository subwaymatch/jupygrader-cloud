import type { InferSelectModel } from "drizzle-orm";
import type {
  users,
  workspaces,
  workspaceMembers,
  submissions,
} from "@/lib/db/schema";

// ─── Database model types (inferred from Drizzle schema) ──────────────────────

export type User = InferSelectModel<typeof users>;
export type Workspace = InferSelectModel<typeof workspaces>;
export type WorkspaceMember = InferSelectModel<typeof workspaceMembers>;
export type Submission = InferSelectModel<typeof submissions>;

// ─── Enums ────────────────────────────────────────────────────────────────────

export type WorkspaceRole = "owner" | "grader";

export type SubmissionStatus =
  | "uploaded"
  | "queued"
  | "processing"
  | "completed"
  | "failed";

// ─── SQS Message ──────────────────────────────────────────────────────────────

export interface QueueMessage {
  submissionId: string;
  workspaceId: string;
  s3Key: string;
  userId: string;
}

// ─── API Request / Response shapes ───────────────────────────────────────────

export interface PresignRequest {
  workspaceId: string;
  /** Original filename — must end with .ipynb */
  filename: string;
  contentType: string;
}

export interface PresignResponse {
  presignedUrl: string;
  s3Key: string;
  /** Pre-generated UUID so the client can reference this submission */
  submissionId: string;
}

export interface EnqueueRequest {
  submissionIds: string[];
  workspaceId: string;
}

export interface EnqueueResponse {
  queued: number;
  /** submissionIds that failed to enqueue */
  failed: string[];
}

// ─── Server Action return shapes ─────────────────────────────────────────────

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Enriched types for UI ────────────────────────────────────────────────────

export type WorkspaceWithRole = Workspace & {
  userRole: WorkspaceRole;
  memberCount: number;
  submissionCount: number;
};

export type SubmissionWithUploader = Submission & {
  uploader: Pick<User, "id" | "name" | "email">;
};

// ─── Upload flow client-side tracking ────────────────────────────────────────

export type UploadState = "idle" | "uploading" | "done" | "error";

export interface PendingFile {
  file: File;
  state: UploadState;
  /** Assigned after presign response */
  submissionId?: string;
  /** Assigned after presign response */
  s3Key?: string;
  error?: string;
}
