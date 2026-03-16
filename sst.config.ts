/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "jupygrader-cloud",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"],
      home: "aws",
    };
  },

  async run() {
    // ── Secrets ────────────────────────────────────────────────────────────
    // Set secrets via: sst secret set DatabaseUrl <value>
    const databaseUrl     = new sst.Secret("DatabaseUrl");
    const betterAuthSecret = new sst.Secret("BetterAuthSecret");
    const resendApiKey    = new sst.Secret("ResendApiKey");
    const openAIApiKey    = new sst.Secret("OpenAIApiKey");

    // ── Storage & Queue (imported for side-effects / exports) ──────────────
    const { notebookBucket } = await import("./infra/storage");
    const { gradingQueue }   = await import("./infra/queue");

    // ── Lambda worker (subscribes to the queue) ────────────────────────────
    await import("./infra/grader");

    // ── Next.js Application ────────────────────────────────────────────────
    const web = new sst.aws.Nextjs("JupygraderWeb", {
      link: [notebookBucket, gradingQueue],
      environment: {
        DATABASE_URL:        databaseUrl.value,
        BETTER_AUTH_SECRET:  betterAuthSecret.value,
        BETTER_AUTH_URL:     $app.stage === "production"
          ? "https://your-production-domain.com"
          : "http://localhost:3000",
        NEXT_PUBLIC_APP_URL: $app.stage === "production"
          ? "https://your-production-domain.com"
          : "http://localhost:3000",
        RESEND_API_KEY:      resendApiKey.value,
        EMAIL_FROM:          "noreply@your-domain.com",
        AWS_REGION:          "us-east-1",
        S3_BUCKET_NAME:      notebookBucket.name,
        SQS_QUEUE_URL:       gradingQueue.url,
      },
    });

    return {
      url:    web.url,
      bucket: notebookBucket.name,
      queue:  gradingQueue.url,
    };
  },
});
