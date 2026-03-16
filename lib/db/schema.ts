import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const workspaceRoleEnum = pgEnum("workspace_role", ["owner", "grader"]);

export const submissionStatusEnum = pgEnum("submission_status", [
  "uploaded",
  "queued",
  "processing",
  "completed",
  "failed",
]);

// ─── Users ────────────────────────────────────────────────────────────────────
// Better Auth manages this table; we declare it here for Drizzle relations and
// to keep migrations in sync. id is text (not uuid) because Better Auth
// generates its own string IDs.

export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Better Auth auxiliary tables ─────────────────────────────────────────────
// These must match Better Auth's expected schema exactly.

export const sessions = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verifications = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Workspaces ───────────────────────────────────────────────────────────────
// A workspace represents a single assignment. Owners configure it; graders
// upload notebooks to it.

export const workspaces = pgTable("workspace", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  gradingPrompt: text("grading_prompt"),
  sampleSolutionS3Key: text("sample_solution_s3_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Workspace Members ────────────────────────────────────────────────────────

export const workspaceMembers = pgTable(
  "workspace_member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRoleEnum("role").notNull().default("grader"),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("workspace_member_unique_idx").on(t.workspaceId, t.userId),
    index("workspace_member_workspace_idx").on(t.workspaceId),
    index("workspace_member_user_idx").on(t.userId),
  ]
);

// ─── Submissions ──────────────────────────────────────────────────────────────

export const submissions = pgTable(
  "submission",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => users.id),
    originalFilename: text("original_filename").notNull(),
    s3Key: text("s3_key").notNull(),
    gradedHtmlKey: text("graded_html_key"),
    resultsJsonKey: text("results_json_key"),
    summaryTxtKey: text("summary_txt_key"),
    status: submissionStatusEnum("status").notNull().default("uploaded"),
    errorMessage: text("error_message"),
    // score stored as text for flexibility: "A+", "87/100", "0.92", etc.
    score: text("score"),
    gradedAt: timestamp("graded_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("submission_workspace_idx").on(t.workspaceId),
    index("submission_status_idx").on(t.status),
    index("submission_workspace_status_idx").on(t.workspaceId, t.status),
  ]
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  workspaceMembers: many(workspaceMembers),
  submissions: many(submissions),
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  submissions: many(submissions),
}));

export const workspaceMembersRelations = relations(
  workspaceMembers,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceMembers.workspaceId],
      references: [workspaces.id],
    }),
    user: one(users, {
      fields: [workspaceMembers.userId],
      references: [users.id],
    }),
  })
);

export const submissionsRelations = relations(submissions, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [submissions.workspaceId],
    references: [workspaces.id],
  }),
  uploader: one(users, {
    fields: [submissions.uploadedBy],
    references: [users.id],
  }),
}));
