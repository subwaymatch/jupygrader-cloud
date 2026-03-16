import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });

/**
 * Returns the S3 key for a raw (ungraded) notebook upload.
 * Pattern: submissions/{workspaceId}/raw/{submissionId}.ipynb
 */
export function getRawS3Key(workspaceId: string, submissionId: string): string {
  return `submissions/${workspaceId}/raw/${submissionId}.ipynb`;
}

/**
 * Generates a presigned PUT URL that allows the browser to upload directly to S3.
 * The URL expires in `expiresIn` seconds (default 5 minutes).
 */
export async function generatePresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 300
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn });
}
