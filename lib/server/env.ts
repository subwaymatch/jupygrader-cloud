import { env as workerEnv } from "cloudflare:workers";

declare global {
  namespace Cloudflare {
    interface Env {
      RESEND_API_KEY?: string;
      EMAIL_FROM?: string;
      AI_PROVIDER?: string;
      AI_BASE_URL?: string;
      AI_API_KEY?: string;
      AI_MODEL?: string;
    }
  }
}

export type AppEnv = Cloudflare.Env & {
  // The queue is optional: without it, the every-minute cron grades queued files.
  GRADING_QUEUE?: Queue;
};

export function getEnv(): AppEnv {
  return workerEnv as AppEnv;
}

// Worker Previews have no APP_URL (their address depends on the branch), so links built outside a
// request, such as in emails, use the address the Worker was last reached at.
let servedOrigin: string | null = null;

export function noteServedOrigin(req: Request): void {
  if (!getEnv().APP_URL) servedOrigin = new URL(req.url).origin;
}

/** Public base URL without a trailing slash. */
export function appUrl(req?: Request): string {
  const configured = getEnv().APP_URL?.replace(/\/+$/, "");
  if (req) {
    const origin = new URL(req.url).origin;
    if (!configured || configured.includes("localhost")) return origin;
  }
  return configured || servedOrigin || "http://localhost:5173";
}
