"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { submissions, workspaceMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { ActionResult } from "@/types";

interface PendingUpload {
  submissionId: string;
  s3Key: string;
  originalFilename: string;
}

/**
 * Creates Submission records in Postgres for files that have already been
 * uploaded to S3. Called after all presigned-URL uploads complete.
 */
export async function createSubmissions(
  workspaceId: string,
  uploads: PendingUpload[]
): Promise<ActionResult<{ submissionIds: string[] }>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Not authenticated" };

  // Verify workspace membership
  const member = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, session.user.id)
    ),
  });
  if (!member) return { success: false, error: "Forbidden" };

  try {
    const rows = uploads.map((u) => ({
      id: u.submissionId,
      workspaceId,
      uploadedBy: session.user.id,
      originalFilename: u.originalFilename,
      s3Key: u.s3Key,
      status: "uploaded" as const,
    }));

    await db.insert(submissions).values(rows);

    return {
      success: true,
      data: { submissionIds: rows.map((r) => r.id) },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
