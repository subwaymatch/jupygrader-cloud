"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaces, workspaceMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { ActionResult, Workspace } from "@/types";

/**
 * Creates a new workspace and adds the creator as an owner.
 */
export async function createWorkspace(
  title: string,
  description?: string,
  gradingPrompt?: string
): Promise<ActionResult<Workspace>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Not authenticated" };

  try {
    const [workspace] = await db
      .insert(workspaces)
      .values({ title, description, gradingPrompt })
      .returning();

    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: session.user.id,
      role: "owner",
    });

    revalidatePath("/dashboard");
    return { success: true, data: workspace };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Updates workspace settings. Only owners may call this.
 */
export async function updateWorkspace(
  workspaceId: string,
  updates: Partial<Pick<Workspace, "title" | "description" | "gradingPrompt" | "sampleSolutionS3Key">>
): Promise<ActionResult<Workspace>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Not authenticated" };

  // Only owners can update workspace settings
  const member = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, session.user.id),
      eq(workspaceMembers.role, "owner")
    ),
  });
  if (!member) return { success: false, error: "Forbidden: owners only" };

  try {
    const [updated] = await db
      .update(workspaces)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning();

    revalidatePath(`/workspaces/${workspaceId}/settings`);
    return { success: true, data: updated };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Invites a user to a workspace. Only owners may invite members.
 */
export async function inviteMember(
  workspaceId: string,
  userId: string,
  role: "owner" | "grader" = "grader"
): Promise<ActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Not authenticated" };

  const caller = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, session.user.id),
      eq(workspaceMembers.role, "owner")
    ),
  });
  if (!caller) return { success: false, error: "Forbidden: owners only" };

  try {
    await db.insert(workspaceMembers).values({ workspaceId, userId, role });
    revalidatePath(`/workspaces/${workspaceId}/settings`);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Removes a member from a workspace. Only owners may remove members.
 * An owner cannot remove themselves if they are the last owner.
 */
export async function removeMember(
  workspaceId: string,
  targetUserId: string
): Promise<ActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Not authenticated" };

  const caller = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, session.user.id),
      eq(workspaceMembers.role, "owner")
    ),
  });
  if (!caller) return { success: false, error: "Forbidden: owners only" };

  try {
    await db
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, targetUserId)
        )
      );

    revalidatePath(`/workspaces/${workspaceId}/settings`);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
