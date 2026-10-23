import handler from "vinext/server/fetch-handler";
import { cronTick, processSubmission, retentionSweep } from "@/lib/server/grading";

type GradingMessage = { submissionId: string };

export default {
  fetch: handler.fetch,

  /** Grading jobs. Each message is one submission; busy or paused jobs are retried later. */
  async queue(batch: MessageBatch<GradingMessage>) {
    for (const msg of batch.messages) {
      const id = msg.body?.submissionId;
      if (!id) {
        msg.ack();
        continue;
      }
      try {
        const outcome = await processSubmission(id);
        if (outcome === "busy") msg.retry({ delaySeconds: 10 + Math.floor(Math.random() * 10) });
        // Stay under the cron's 10-minute "lost message" threshold so paused jobs aren't resent.
        else if (outcome === "paused") msg.retry({ delaySeconds: 300 });
        else if (outcome === "retry") msg.retry({ delaySeconds: 30 * Math.min(4, msg.attempts) });
        else msg.ack();
      } catch (err) {
        console.error("queue job failed", id, err);
        msg.retry({ delaySeconds: 60 });
      }
    }
  },

  async scheduled(controller: ScheduledController, _env: unknown, ctx: ExecutionContext) {
    if (controller.cron === "17 3 * * *") ctx.waitUntil(retentionSweep().then(() => undefined));
    else ctx.waitUntil(cronTick());
  },
} satisfies ExportedHandler<Cloudflare.Env, GradingMessage>;
