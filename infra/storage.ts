/// <reference path="../.sst/platform/config.d.ts" />

/**
 * S3 bucket for storing raw notebooks and graded artifacts.
 * CORS is configured to allow direct browser uploads via presigned PUT URLs.
 */
export const notebookBucket = new sst.aws.Bucket("NotebookBucket", {
  cors: [
    {
      allowedHeaders: ["*"],
      allowedMethods: ["GET", "PUT", "POST", "HEAD"],
      allowedOrigins: [process.env.NEXT_PUBLIC_APP_URL ?? "*"],
      maxAge: 3000,
    },
  ],
});
