import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaceMembers } from "@/lib/db/schema";
import { generatePresignedUploadUrl, getRawS3Key } from "@/lib/aws/s3";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { PresignRequest, PresignResponse } from "@/types";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: PresignRequest = await req.json();
  const { workspaceId, filename, contentType } = body;

  if (!workspaceId || !filename || !contentType) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!filename.endsWith(".ipynb")) {
    return NextResponse.json({ error: "Only .ipynb files are allowed" }, { status: 400 });
  }

  // Verify the user is a member of this workspace
  const member = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, session.user.id)
    ),
  });

  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const submissionId = uuidv4();
  const s3Key = getRawS3Key(workspaceId, submissionId);
  const presignedUrl = await generatePresignedUploadUrl(s3Key, contentType);

  const response: PresignResponse = { presignedUrl, s3Key, submissionId };
  return NextResponse.json(response);
}
