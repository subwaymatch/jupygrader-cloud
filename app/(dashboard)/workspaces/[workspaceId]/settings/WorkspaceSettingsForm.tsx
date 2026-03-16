"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateWorkspace, inviteMember, removeMember } from "@/actions/workspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserMinus, UserPlus } from "lucide-react";
import type { Workspace, WorkspaceMember, User } from "@/types";

interface Member {
  member: WorkspaceMember;
  user: User;
}

interface WorkspaceSettingsFormProps {
  workspace: Workspace;
  members: Member[];
}

export function WorkspaceSettingsForm({
  workspace,
  members: initialMembers,
}: WorkspaceSettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [members, setMembers] = useState(initialMembers);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await updateWorkspace(workspace.id, {
        title: formData.get("title") as string,
        description: (formData.get("description") as string) || undefined,
        gradingPrompt: (formData.get("gradingPrompt") as string) || undefined,
      });

      if (result.success) {
        setSuccess("Settings saved.");
        router.refresh();
      } else {
        setError(result.error ?? "Failed to save.");
      }
    });
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Find user by email (simplified — a real app would look up user by email)
    startTransition(async () => {
      // NOTE: In production, add an endpoint to look up userId by email.
      // For now this shows the UI pattern; wire up the userId lookup.
      setError("Invite by email requires a user lookup endpoint.");
    });
  }

  async function handleRemove(userId: string) {
    startTransition(async () => {
      const result = await removeMember(workspace.id, userId);
      if (result.success) {
        setMembers((prev) => prev.filter((m) => m.user.id !== userId));
      } else {
        setError(result.error ?? "Failed to remove member.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Workspace details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                name="title"
                defaultValue={workspace.title}
                required
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                name="description"
                defaultValue={workspace.description ?? ""}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gradingPrompt">Grading Prompt</Label>
              <Textarea
                id="gradingPrompt"
                name="gradingPrompt"
                defaultValue={workspace.gradingPrompt ?? ""}
                rows={5}
                disabled={isPending}
                placeholder="Instructions for the AI grader…"
              />
              <p className="text-xs text-muted-foreground">
                This text is included verbatim in the OpenAI grading prompt.
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="divide-y">
            {members.map(({ member, user }) => (
              <li
                key={user.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="text-sm font-medium">{user.name || user.email}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={member.role === "owner" ? "default" : "secondary"}>
                    {member.role}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(user.id)}
                    disabled={isPending}
                  >
                    <UserMinus className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          {/* Invite form (placeholder — requires userId lookup in production) */}
          <form onSubmit={handleInvite} className="flex gap-2">
            <Input
              placeholder="Email address to invite"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              disabled={isPending}
            />
            <Button type="submit" variant="outline" disabled={isPending}>
              <UserPlus className="mr-2 h-4 w-4" />
              Invite
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
