// People, courses and files for tests that need a whole site, and a stand-in for the session.
import { vi } from "vitest";
import { first, run } from "@/lib/server/db";
import { HttpError } from "@/lib/server/http";
import type { Me } from "@/lib/shared/types";

const now = () => new Date().toISOString();

export async function addUser(id: string, opts: { admin?: boolean; status?: string; verified?: boolean } = {}) {
  await run(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", isAdmin, status, "notifyEmail") values (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    id,
    id[0].toUpperCase() + id.slice(1),
    `${id}@school.test`,
    opts.verified ?? true,
    now(),
    now(),
    !!opts.admin,
    opts.status ?? "active",
  );
}

export async function addCourse(id: string, members: Record<string, "Teacher" | "Grader">, endDate = "2099-12-31") {
  await run("insert into course (id, name, end_date, created_at, updated_at) values (?, ?, ?, ?, ?)", id, "Course " + id, endDate, now(), now());
  for (const [user, role] of Object.entries(members)) await run("insert into enrollment (course_id, user_id, role, created_at) values (?, ?, ?, ?)", id, user, role, now());
}

export async function addAssignment(id: string, courseId: string) {
  await run("insert into assignment (id, course_id, title, points, created_at, updated_at) values (?, ?, ?, 20, ?, ?)", id, courseId, "Assignment " + id, now(), now());
}

/** The student link token a seeded file gets. */
export const tokenOf = (id: string) => ("tok" + id + "Q").padEnd(16, "0");

const RESULT = {
  criteria: [{ name: "Overall", pts: 20, earned: 15, aiEarned: 15, comment: "Fine.", refs: [] }],
  comments: [],
  summary: "Good work.",
  confidence: "high",
  lowReason: "",
};

export async function addSubmission(id: string, assignmentId: string, opts: Partial<{ status: string; confidence: "high" | "low"; nearOf: string; reviewed: boolean; uploadedAt: string; r2Key: string; shareOff: boolean }> = {}) {
  const graded = (opts.status ?? "graded") === "graded";
  await run(
    `insert into submission (id, assignment_id, file_name, sha256, size, kind, r2_key, status, uploaded_at, queued_at, graded_at, score, ai_score, result, graded_meta,
       near_of, reviewed, share_token, share_off, history)
     values (?, ?, ?, ?, 10, 'code', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')`,
    id,
    assignmentId,
    id + ".py",
    "sha-" + id,
    opts.r2Key ?? null,
    opts.status ?? "graded",
    opts.uploadedAt ?? now(),
    opts.uploadedAt ?? now(),
    graded ? now() : null,
    graded ? 15 : null,
    graded ? 15 : null,
    graded ? JSON.stringify({ ...RESULT, confidence: opts.confidence ?? "high" }) : null,
    graded ? JSON.stringify({ rubricVersion: 1, style: "balanced", tone: "neutral", length: "standard", model: "m", gradedAt: now() }) : null,
    opts.nearOf ? JSON.stringify({ id: opts.nearOf, file: opts.nearOf + ".py", pct: 95 }) : null,
    !!opts.reviewed,
    tokenOf(id),
    !!opts.shareOff,
  );
}

/**
 * What vi.mock("@/lib/server/session") returns in these tests: the signed-in person is whoever the
 * request's x-test-user header names, looked up the way the real module does, so a pending or
 * deactivated account is signed out here too.
 */
export function sessionMock() {
  const getSessionUser = async (h: Headers): Promise<Me | null> => {
    const id = h.get("x-test-user");
    if (!id) return null;
    const u = await first<{ id: string; name: string; email: string; isAdmin: number; status: string; notifyEmail: number; emailVerified: number }>(
      'select id, name, email, isAdmin, status, "notifyEmail", "emailVerified" from "user" where id = ?',
      id,
    );
    if (!u || u.status !== "active") return null;
    return { id: u.id, name: u.name, email: u.email, isAdmin: !!u.isAdmin, notifyEmail: !!u.notifyEmail, emailVerified: !!u.emailVerified };
  };
  const requireUser = async (req: Request) => {
    const u = await getSessionUser(req.headers);
    if (!u) throw new HttpError(401, "Sign in to continue.");
    return u;
  };
  return {
    getSessionUser,
    requireUser,
    requireAdmin: async (req: Request) => {
      const u = await requireUser(req);
      if (!u.isAdmin) throw new HttpError(403, "Only administrators can do that.");
      return u;
    },
    currentUser: vi.fn(async () => null),
    pageUser: vi.fn(),
    pageAdmin: vi.fn(),
  };
}

/** A request from `user` (or nobody). */
export function request(user: string | null, method: string, path: string, body?: unknown): Request {
  const headers: Record<string, string> = {};
  if (user) headers["x-test-user"] = user;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request("https://grader.test" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

export const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
