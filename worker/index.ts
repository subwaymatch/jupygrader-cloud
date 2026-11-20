import handler from "vinext/server/fetch-handler";
import { noteServedOrigin } from "@/lib/server/env";
import { pruneOldRecords, sweepOrphanDocs } from "@/lib/server/cleanup";
import { pruneEmailTokens } from "@/lib/server/email-confirm";
import { cronTick, gradeNext, kickGrading, retentionSweep } from "@/lib/server/grading";
import { pruneRateLimits } from "@/lib/server/rate-limit";
import { withSecurityHeaders } from "@/lib/server/security-headers";

// Durable Object that runs nbconvert in a container, for "Notebook as HTML" downloads.
export { Nbconvert } from "./nbconvert";

// Wake-ups carry nothing. Messages sent before this design named a file, which is now ignored.
type GradingMessage = { submissionId?: string };

function logFailures(results: PromiseSettledResult<unknown>[]) {
  for (const r of results) if (r.status === "rejected") console.error("nightly job failed", r.reason);
}

// True under `npm run dev`, where Vite's dev server needs a looser content policy.
const DEV = !!(import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV;

export default {
  async fetch(request, env, ctx) {
    noteServedOrigin(request);
    return withSecurityHeaders(request, await handler.fetch(request, env, ctx), DEV);
  },

  /**
   * Grading. A message is a wake-up, not a job: its consumer grades the file that has waited longest, if a
   * slot is free, and then wakes the next consumer. See "How files move through grading" in lib/server/grading.ts.
   */
  async queue(batch: MessageBatch<GradingMessage>) {
    for (const msg of batch.messages) {
      try {
        const outcome = await gradeNext();
        // A slot just came free: pass it on. The every-minute cron does the same if this is lost.
        if (outcome === "done" || outcome === "failed" || outcome === "retry") await kickGrading();
        msg.ack();
      } catch (err) {
        console.error("grading wake-up failed", err);
        msg.retry({ delaySeconds: 60 });
      }
    }
  },

  async scheduled(controller: ScheduledController, _env: unknown, ctx: ExecutionContext) {
    if (controller.cron === "17 3 * * *") ctx.waitUntil(Promise.allSettled([retentionSweep(), pruneRateLimits(), pruneEmailTokens(), sweepOrphanDocs(), pruneOldRecords()]).then(logFailures));
    else ctx.waitUntil(cronTick());
  },
} satisfies ExportedHandler<Cloudflare.Env, GradingMessage>;
