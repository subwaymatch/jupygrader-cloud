/// <reference path="../.sst/platform/config.d.ts" />
import { gradingQueue } from "./queue";
import { notebookBucket } from "./storage";

/**
 * Dockerized Python Lambda that processes grading jobs from SQS.
 *
 * Concurrency is capped at 50 to prevent runaway OpenAI API costs.
 * Each invocation handles exactly one submission (batchSize: 1).
 */
gradingQueue.subscribe(
  {
    handler: "worker/handler.handler",
    // Use a Docker image instead of the default zip deployment
    image: {
      dockerfile: "worker/Dockerfile",
    },
    // Link the S3 bucket so the Lambda can read/write objects
    link: [notebookBucket],
    // Cap at 50 concurrent Lambda executions
    concurrency: {
      reserved: 50,
    },
    timeout: "15 minutes",
    memory: "1 GB",
    environment: {
      DATABASE_URL: new sst.Secret("DatabaseUrl").value,
      OPENAI_API_KEY: new sst.Secret("OpenAIApiKey").value,
      S3_BUCKET_NAME: notebookBucket.name,
    },
  },
  {
    // Process one message at a time — each Lambda handles one submission
    batch: {
      size: 1,
      // Report individual message failures to avoid re-processing successful items
      partialResponses: true,
    },
  }
);
