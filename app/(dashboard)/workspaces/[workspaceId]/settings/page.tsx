import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaceMembers, workspaces, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { WorkspaceSettingsForm } from "./WorkspaceSettingsForm";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface Props {
  params: Promise<{ workspaceId: string }>;
}

export default async function WorkspaceSettingsPage({ params }: Props) {
  const { workspaceId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  // Only owners can access settings
  const member = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, session.user.id),
      eq(workspaceMembers.role, "owner")
    ),
  });

  if (!member) notFound();

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  if (!workspace) notFound();

  const members = await db
    .select({ member: workspaceMembers, user: users })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            href={`/workspaces/${workspaceId}`}
            className="hover:text-foreground flex items-center gap-1"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {workspace.title}
          </Link>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      </div>

      <WorkspaceSettingsForm workspace={workspace} members={members} />
    </div>
  );
}
