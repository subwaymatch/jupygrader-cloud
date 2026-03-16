import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaceMembers, workspaces, submissions } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { WorkspaceDashboard } from "@/components/workspace/WorkspaceDashboard";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Settings, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  params: Promise<{ workspaceId: string }>;
}

export default async function WorkspacePage({ params }: Props) {
  const { workspaceId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  // Verify membership
  const member = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, session.user.id)
    ),
  });

  if (!member) notFound();

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  if (!workspace) notFound();

  const initialSubmissions = await db.query.submissions.findMany({
    where: eq(submissions.workspaceId, workspaceId),
    orderBy: [desc(submissions.createdAt)],
  });

  return (
    <div className="space-y-6">
      {/* Breadcrumb + header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground flex items-center gap-1">
              <ChevronLeft className="h-3.5 w-3.5" />
              Workspaces
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{workspace.title}</h1>
            <Badge variant={member.role === "owner" ? "default" : "secondary"}>
              {member.role}
            </Badge>
          </div>
          {workspace.description && (
            <p className="text-muted-foreground">{workspace.description}</p>
          )}
        </div>

        {member.role === "owner" && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/workspaces/${workspaceId}/settings`}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Link>
          </Button>
        )}
      </div>

      <WorkspaceDashboard
        workspace={workspace}
        initialSubmissions={initialSubmissions}
      />
    </div>
  );
}
