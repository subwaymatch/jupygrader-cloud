// Canvas LMS REST API client. Each person connects with their own access token, so Canvas's own
// permissions decide what they can read and grade.
import { nextLink, type CanvasSubmissionInfo } from "@/lib/shared/canvas";
import { MAX_UPLOAD_BYTES } from "@/lib/shared/constants";
import type { CanvasStatus } from "@/lib/shared/types";
import { decryptSecret, encryptSecret } from "./crypto";
import { first, run } from "./db";
import { badRequest, HttpError } from "./http";
import { getSettings } from "./settings";

const TIMEOUT_MS = 30_000;
const MAX_PAGES = 50;
const MAX_REDIRECTS = 5;

/** The fields of Canvas API objects that Jupygrader uses. */
export type CanvasUser = { id: number; name: string; sortable_name?: string };
export type CanvasCourse = {
  id: number;
  name: string;
  course_code?: string;
  term?: { name?: string } | null;
  enrollments?: { type: string }[];
};
export type CanvasAssignment = {
  id: number;
  name: string;
  description: string | null;
  points_possible: number | null;
  due_at: string | null;
  published?: boolean;
  submission_types?: string[];
};
export type CanvasAttachment = { id: number; display_name: string; filename?: string; size: number; url: string; "content-type"?: string };
export type CanvasSubmission = {
  user_id: number;
  attempt: number | null;
  submitted_at: string | null;
  workflow_state: string;
  late?: boolean;
  attachments?: CanvasAttachment[];
  user?: CanvasUser;
};

/** Canvas rejected the token: it's wrong, expired or was deleted. */
export class CanvasTokenError extends HttpError {
  constructor() {
    super(400, "Canvas didn't accept your access token. It may have expired or been deleted. Connect your Canvas account again on the Account page.");
  }
}

function canvasError(status: number, body: string, what: string): HttpError {
  // Canvas also answers 401 when a valid token lacks permission.
  if (status === 401 && !/not authorized to perform/i.test(body)) return new CanvasTokenError();
  let msg = "";
  try {
    const j = JSON.parse(body) as { errors?: { message?: string }[] | Record<string, unknown>; message?: string };
    msg = (Array.isArray(j.errors) ? j.errors[0]?.message : "") || j.message || "";
  } catch {
    /* not JSON */
  }
  if (status === 403 && /rate limit/i.test(msg + body)) return new HttpError(429, "Canvas is limiting how fast requests can be made. Wait a minute and try again.");
  if (status === 401 || status === 403) return new HttpError(403, `Canvas says you don't have permission to ${what}.`);
  if (status === 404) return new HttpError(404, `Canvas couldn't find what's needed to ${what}. It may have been deleted, or you may not have access to it.`);
  return new HttpError(502, `Canvas couldn't ${what} (error ${status}${msg ? `: ${msg.slice(0, 200)}` : ""}). Try again.`);
}

export class Canvas {
  constructor(
    readonly base: string,
    private token: string,
  ) {}

  /** Sends a request to this Canvas. The token never goes to any other address. */
  private async request(path: string, what: string, init: RequestInit = {}): Promise<Response> {
    const url = /^https?:\/\//.test(path) ? path : `${this.base}/api/v1${path}`;
    if (new URL(url).origin !== this.base) throw new HttpError(502, `Canvas sent a link to another site while trying to ${what}.`);
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { Accept: "application/json", Authorization: `Bearer ${this.token}`, ...(init.headers as Record<string, string>) },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new HttpError(502, `Couldn't reach Canvas at ${this.base}. Try again, or ask an admin to check the Canvas address in Settings.`);
    }
    if (!res.ok) throw canvasError(res.status, await res.text().catch(() => ""), what);
    return res;
  }

  private async get<T>(path: string, what: string): Promise<T> {
    return (await this.request(path, what)).json() as Promise<T>;
  }

  /** Every page of a list endpoint. */
  private async list<T>(path: string, what: string): Promise<T[]> {
    const out: T[] = [];
    let next: string | null = path;
    for (let page = 0; next && page < MAX_PAGES; page++) {
      const res = await this.request(next, what);
      out.push(...((await res.json()) as T[]));
      next = nextLink(res.headers.get("Link"));
    }
    return out;
  }

  private async send<T>(method: string, path: string, body: unknown, what: string): Promise<T> {
    const res = await this.request(path, what, { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
    return res.json() as Promise<T>;
  }

  self() {
    return this.get<CanvasUser>("/users/self", "check your account");
  }

  /** Courses where the person teaches or is a TA, including unpublished and concluded ones. */
  async teachingCourses(): Promise<CanvasCourse[]> {
    const all = await this.list<CanvasCourse>(
      "/courses?per_page=100&include[]=term&state[]=available&state[]=unpublished&state[]=completed",
      "list your courses",
    );
    return all.filter((c) => c.name && c.enrollments?.some((e) => e.type === "teacher" || e.type === "ta"));
  }

  course(courseId: string) {
    return this.get<CanvasCourse>(`/courses/${enc(courseId)}`, "open this course");
  }

  assignments(courseId: string) {
    return this.list<CanvasAssignment>(`/courses/${enc(courseId)}/assignments?per_page=100&order_by=position`, "list this course's assignments");
  }

  assignment(courseId: string, assignmentId: string) {
    return this.get<CanvasAssignment>(`/courses/${enc(courseId)}/assignments/${enc(assignmentId)}`, "open this assignment");
  }

  submissions(courseId: string, assignmentId: string) {
    return this.list<CanvasSubmission>(
      `/courses/${enc(courseId)}/assignments/${enc(assignmentId)}/submissions?per_page=100&include[]=user`,
      "read this assignment's submissions",
    );
  }

  submission(courseId: string, assignmentId: string, userId: string) {
    return this.get<CanvasSubmission>(
      `/courses/${enc(courseId)}/assignments/${enc(assignmentId)}/submissions/${enc(userId)}?include[]=user`,
      "read this student's submission",
    );
  }

  /**
   * Downloads a submitted file. Canvas file links redirect to its file storage, which may be on
   * another domain, so redirects are followed by hand and the token is sent only to Canvas.
   */
  async download(url: string): Promise<Uint8Array> {
    let next = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const same = new URL(next).origin === this.base;
      let res: Response;
      try {
        res = await fetch(next, {
          redirect: "manual",
          headers: same ? { Authorization: `Bearer ${this.token}` } : {},
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        throw new HttpError(502, "Couldn't download a file from Canvas. Try again.");
      }
      const loc = res.headers.get("Location");
      if (res.status >= 300 && res.status < 400 && loc) {
        await res.body?.cancel();
        next = new URL(loc, next).href;
        if (!/^https?:/.test(next)) break;
        continue;
      }
      if (!res.ok) throw canvasError(res.status, await res.text().catch(() => ""), "download a submitted file");
      if (Number(res.headers.get("Content-Length") || 0) > MAX_UPLOAD_BYTES) {
        await res.body?.cancel();
        throw badRequest("This file is larger than 25 MB.");
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > MAX_UPLOAD_BYTES) throw badRequest("This file is larger than 25 MB.");
      return bytes;
    }
    throw new HttpError(502, "Canvas redirected too many times while downloading a file.");
  }

  /**
   * Uploads a file to attach to a submission comment, in Canvas's three steps: ask for an upload
   * address, send the file there, then confirm it. Returns the Canvas file id.
   */
  async uploadCommentFile(courseId: string, assignmentId: string, userId: string, file: { name: string; data: Uint8Array; type: string }): Promise<number> {
    const what = "attach the feedback file";
    const slot = await this.send<{ upload_url: string; upload_params: Record<string, unknown>; file_param?: string }>(
      "POST",
      `/courses/${enc(courseId)}/assignments/${enc(assignmentId)}/submissions/${enc(userId)}/comments/files`,
      { name: file.name, size: file.data.length, content_type: file.type, on_duplicate: "rename" },
      what,
    );
    const form = new FormData();
    for (const [k, v] of Object.entries(slot.upload_params || {})) form.append(k, String(v));
    // The file has to come last.
    form.append(slot.file_param || "file", new Blob([file.data as BlobPart], { type: file.type }), file.name);
    let res: Response;
    try {
      // The upload address carries its own credentials, so the token isn't sent there.
      res = await fetch(slot.upload_url, { method: "POST", body: form, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new HttpError(502, "Couldn't upload the feedback file to Canvas. Try again.");
    }
    const loc = res.headers.get("Location");
    if (res.status >= 300 && res.status < 400 && loc) {
      await res.body?.cancel();
      return (await this.get<{ id: number }>(new URL(loc, slot.upload_url).href, what)).id;
    }
    if (!res.ok) throw canvasError(res.status, await res.text().catch(() => ""), what);
    const body = (await res.json().catch(() => null)) as { id?: number; location?: string } | null;
    if (body?.id) return body.id;
    const confirm = loc || body?.location;
    if (!confirm) throw new HttpError(502, "Canvas didn't confirm the feedback file upload. Try again.");
    return (await this.get<{ id: number }>(new URL(confirm, slot.upload_url).href, what)).id;
  }

  /** Sets a student's grade, with an optional comment and attached files. */
  postGrade(courseId: string, assignmentId: string, userId: string, o: { grade: string; comment?: string; fileIds?: number[] }) {
    const body: Record<string, unknown> = { submission: { posted_grade: o.grade } };
    if (o.comment || o.fileIds?.length) body.comment = { text_comment: o.comment || "", ...(o.fileIds?.length ? { file_ids: o.fileIds } : {}) };
    return this.send<CanvasSubmission>("PUT", `/courses/${enc(courseId)}/assignments/${enc(assignmentId)}/submissions/${enc(userId)}`, body, "post this grade");
  }
}

const enc = (id: string) => encodeURIComponent(id);

export function submissionInfo(s: CanvasSubmission): CanvasSubmissionInfo {
  const name = s.user?.name || `Canvas user ${s.user_id}`;
  return {
    userId: String(s.user_id),
    name,
    sortableName: s.user?.sortable_name || name,
    attempt: s.attempt ?? null,
    submittedAt: s.submitted_at,
    late: !!s.late,
    workflowState: s.workflow_state,
    attachments: (s.attachments || []).map((a) => ({ id: String(a.id), name: a.display_name || a.filename || "file", size: a.size || 0 })),
  };
}

// ---------- Connected accounts ----------

export async function canvasStatus(userId: string): Promise<CanvasStatus> {
  const url = (await getSettings()).canvasUrl;
  if (!url) return { enabled: false, url: "", connected: false };
  const row = await first<{ base_url: string }>("select base_url from canvas_token where user_id = ?", userId);
  return { enabled: true, url, connected: row?.base_url === url };
}

/** The Canvas account a person connected, if it's for the site's current Canvas address. */
export async function canvasAccount(userId: string): Promise<{ name: string; connectedAt: string } | null> {
  const url = (await getSettings()).canvasUrl;
  const row = await first<{ base_url: string; canvas_name: string; created_at: string }>(
    "select base_url, canvas_name, created_at from canvas_token where user_id = ?",
    userId,
  );
  return url && row?.base_url === url ? { name: row.canvas_name, connectedAt: row.created_at } : null;
}

/** Checks a token with Canvas and stores it, encrypted. */
export async function connectCanvas(userId: string, token: string): Promise<{ name: string }> {
  const base = (await getSettings()).canvasUrl;
  if (!base) throw badRequest("Canvas isn't set up on this site. Ask an admin to add your school's Canvas address in Settings.");
  const t = token.trim();
  if (!t || t.length > 500 || /\s/.test(t)) throw badRequest("Paste the whole access token from Canvas, without spaces.");
  let me: CanvasUser;
  try {
    me = await new Canvas(base, t).self();
  } catch (err) {
    if (err instanceof CanvasTokenError) throw badRequest("Canvas didn't accept this access token. Check that you copied all of it and that it hasn't expired.");
    throw err;
  }
  await run(
    `insert into canvas_token (user_id, token, base_url, canvas_user_id, canvas_name, created_at) values (?, ?, ?, ?, ?, ?)
     on conflict(user_id) do update set token = excluded.token, base_url = excluded.base_url, canvas_user_id = excluded.canvas_user_id,
       canvas_name = excluded.canvas_name, created_at = excluded.created_at`,
    userId,
    await encryptSecret(t),
    base,
    String(me.id),
    me.name || "",
    new Date().toISOString(),
  );
  return { name: me.name || "" };
}

export async function disconnectCanvas(userId: string): Promise<void> {
  await run("delete from canvas_token where user_id = ?", userId);
}

/** A client that acts as the signed-in person, or an error telling them to connect first. */
export async function canvasFor(userId: string): Promise<Canvas> {
  const base = (await getSettings()).canvasUrl;
  if (!base) throw badRequest("Canvas isn't set up on this site. Ask an admin to add your school's Canvas address in Settings.");
  const row = await first<{ token: string; base_url: string }>("select token, base_url from canvas_token where user_id = ?", userId);
  const token = row && row.base_url === base ? await decryptSecret(row.token) : "";
  if (!token) throw badRequest("Connect your Canvas account on the Account page first.");
  return new Canvas(base, token);
}
