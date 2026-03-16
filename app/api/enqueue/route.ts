import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { submissions, workspaceMembers } from "@/lib/db/schema";
import { enqueueGradingJob } from "@/lib/aws/sqs";
import { eq, and, inArray } from "drizzle-orm";
import type { EnqueueRequest, EnqueueResponse } from "@/types";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: EnqueueRequest = await req.json();
  const { submissionIds, workspaceId } = body;

  if (!workspaceId || !submissionIds?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Verify workspace membership
  const member = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, session.user.id)
    ),
  });

  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch only "uploaded" submissions belonging to this workspace
  const rows = await db.query.submissions.findMany({
    where: and(
      inArray(submissions.id, submissionIds),
      eq(submissions.workspaceId, workspaceId),
      eq(submissions.status, "uploaded")
    ),
  });

  const queued: string[] = [];
  const failed: string[] = [];

  for (const sub of rows) {
    try {
      await enqueueGradingJob({
        submissionId: sub.id,
        workspaceId: sub.workspaceId,
        s3Key: sub.s3Key,
        userId: sub.uploadedBy,
      });

      await db
        .update(submissions)
        .set({ status: "queued", updatedAt: new Date() })
        .where(eq(submissions.id, sub.id));

      queued.push(sub.id);
    } catch {
      failed.push(sub.id);
    }
  }

  const response: EnqueueResponse = { queued: queued.length, failed };
  return NextResponse.json(response);
}
