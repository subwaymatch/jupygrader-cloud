import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaceMembers, workspaces, submissions } from "@/lib/db/schema";
import { eq, count, sql } from "drizzle-orm";
import { WorkspaceCard } from "@/components/dashboard/WorkspaceCard";
import { CreateWorkspaceForm } from "@/components/dashboard/CreateWorkspaceForm";
import type { WorkspaceWithRole } from "@/types";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  // Fetch all workspaces the user belongs to, with member count and submission count
  const memberRows = await db
    .select({
      workspace: workspaces,
      role: workspaceMembers.role,
      memberCount: count(workspaceMembers.id).as("memberCount"),
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, session!.user.id))
    .groupBy(workspaces.id, workspaceMembers.role);

  // Get submission counts per workspace
  const subCounts = await db
    .select({
      workspaceId: submissions.workspaceId,
      count: count(submissions.id).as("count"),
    })
    .from(submissions)
    .where(
      sql`${submissions.workspaceId} IN (${sql.join(
        memberRows.map((r) => sql`${r.workspace.id}`),
        sql`, `
      )})`
    )
    .groupBy(submissions.workspaceId);

  const subCountMap = new Map(subCounts.map((r) => [r.workspaceId, r.count]));

  // We need member counts per workspace (separate query due to groupBy constraint)
  const memberCounts = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      count: count(workspaceMembers.id).as("count"),
    })
    .from(workspaceMembers)
    .where(
      sql`${workspaceMembers.workspaceId} IN (${sql.join(
        memberRows.map((r) => sql`${r.workspace.id}`),
        sql`, `
      )})`
    )
    .groupBy(workspaceMembers.workspaceId);

  const memberCountMap = new Map(memberCounts.map((r) => [r.workspaceId, r.count]));

  const workspacesWithRole: WorkspaceWithRole[] = memberRows.map((r) => ({
    ...r.workspace,
    userRole: r.role,
    memberCount: memberCountMap.get(r.workspace.id) ?? 0,
    submissionCount: subCountMap.get(r.workspace.id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workspaces</h1>
          <p className="text-muted-foreground mt-1">
            Manage your assignment workspaces and grade Jupyter notebooks.
          </p>
        </div>
        <CreateWorkspaceForm />
      </div>

      {workspacesWithRole.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-muted-foreground">No workspaces yet.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create a workspace to start grading notebooks.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workspacesWithRole.map((ws) => (
            <WorkspaceCard key={ws.id} workspace={ws} />
          ))}
        </div>
      )}
    </div>
  );
}
