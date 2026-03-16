import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, FileText, Settings } from "lucide-react";
import type { WorkspaceWithRole } from "@/types";

interface WorkspaceCardProps {
  workspace: WorkspaceWithRole;
}

export function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight">
            <Link
              href={`/workspaces/${workspace.id}`}
              className="hover:underline"
            >
              {workspace.title}
            </Link>
          </CardTitle>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={workspace.userRole === "owner" ? "default" : "secondary"}>
              {workspace.userRole}
            </Badge>
            {workspace.userRole === "owner" && (
              <Link href={`/workspaces/${workspace.id}/settings`}>
                <Settings className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
              </Link>
            )}
          </div>
        </div>
        {workspace.description && (
          <CardDescription className="line-clamp-2">
            {workspace.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {workspace.memberCount} member{workspace.memberCount !== 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            {workspace.submissionCount} submission{workspace.submissionCount !== 1 ? "s" : ""}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
