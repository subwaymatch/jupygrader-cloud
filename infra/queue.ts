/// <reference path="../.sst/platform/config.d.ts" />

/**
 * SQS queue for grading jobs.
 * Standard queue (not FIFO) is sufficient since each submission ID is unique.
 * Messages have a 15-minute visibility timeout to match Lambda's max execution time.
 */
export const gradingQueue = new sst.aws.Queue("GradingQueue", {
  visibilityTimeout: "15 minutes",
});
