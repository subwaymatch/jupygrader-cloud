import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import type { QueueMessage } from "@/types";

const sqs = new SQSClient({ region: process.env.AWS_REGION ?? "us-east-1" });

/**
 * Sends a grading job message to SQS.
 * Each message triggers one Lambda invocation to grade one submission.
 */
export async function enqueueGradingJob(message: QueueMessage): Promise<void> {
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: process.env.SQS_QUEUE_URL!,
      MessageBody: JSON.stringify(message),
    })
  );
}
