"use client";

import { useState, useCallback } from "react";
import { DropzoneUploader } from "./DropzoneUploader";
import { SubmissionList } from "./SubmissionList";
import { Button } from "@/components/ui/button";
import { createSubmissions } from "@/actions/submission";
import { Loader2, Play } from "lucide-react";
import type { Workspace, Submission, PendingFile } from "@/types";

interface WorkspaceDashboardProps {
  workspace: Workspace;
  initialSubmissions: Submission[];
}

export function WorkspaceDashboard({
  workspace,
  initialSubmissions,
}: WorkspaceDashboardProps) {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>(initialSubmissions);
  const [isGrading, setIsGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFilesAdded = useCallback((files: File[]) => {
    setPendingFiles((prev) => [
      ...prev,
      ...files.map((f) => ({ file: f, state: "idle" as const })),
    ]);
  }, []);

  const handleFileRemoved = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  async function handleStartGrading() {
    if (pendingFiles.length === 0 || isGrading) return;
    setIsGrading(true);
    setError(null);

    // Step 1: Get presigned URLs and upload each file directly to S3
    const updatedFiles = [...pendingFiles];
    const successfulUploads: { submissionId: string; s3Key: string; originalFilename: string }[] = [];

    for (let i = 0; i < updatedFiles.length; i++) {
      const pf = updatedFiles[i];
      updatedFiles[i] = { ...pf, state: "uploading" };
      setPendingFiles([...updatedFiles]);

      try {
        // Get presigned URL
        const presignRes = await fetch("/api/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: workspace.id,
            filename: pf.file.name,
            contentType: "application/json",
          }),
        });

        if (!presignRes.ok) {
          throw new Error(`Presign failed: ${presignRes.statusText}`);
        }

        const { presignedUrl, s3Key, submissionId } = await presignRes.json();

        // Upload directly to S3
        const uploadRes = await fetch(presignedUrl, {
          method: "PUT",
          body: pf.file,
          headers: { "Content-Type": "application/json" },
        });

        if (!uploadRes.ok) {
          throw new Error(`S3 upload failed: ${uploadRes.statusText}`);
        }

        updatedFiles[i] = { ...updatedFiles[i], state: "done", submissionId, s3Key };
        successfulUploads.push({ submissionId, s3Key, originalFilename: pf.file.name });
      } catch (err) {
        updatedFiles[i] = {
          ...updatedFiles[i],
          state: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        };
      }

      setPendingFiles([...updatedFiles]);
    }

    if (successfulUploads.length === 0) {
      setIsGrading(false);
      setError("All uploads failed. Please try again.");
      return;
    }

    // Step 2: Create submission records in Postgres
    const result = await createSubmissions(workspace.id, successfulUploads);
    if (!result.success) {
      setIsGrading(false);
      setError(result.error ?? "Failed to create submission records.");
      return;
    }

    const submissionIds = result.data!.submissionIds;

    // Step 3: Enqueue grading jobs via SQS
    const enqueueRes = await fetch("/api/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionIds, workspaceId: workspace.id }),
    });

    if (!enqueueRes.ok) {
      setIsGrading(false);
      setError("Failed to enqueue grading jobs.");
      return;
    }

    // Step 4: Refresh submission list and clear pending files
    const subRes = await fetch(`/api/submissions/${workspace.id}`);
    if (subRes.ok) {
      const fresh: Submission[] = await subRes.json();
      setSubmissions(fresh);
    }

    setPendingFiles([]);
    setIsGrading(false);
  }

  const idleCount = pendingFiles.filter((f) => f.state === "idle").length;

  return (
    <div className="space-y-6">
      <DropzoneUploader
        pendingFiles={pendingFiles}
        onFilesAdded={handleFilesAdded}
        onFileRemoved={handleFileRemoved}
        disabled={isGrading}
      />

      {pendingFiles.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {idleCount > 0
              ? `${idleCount} notebook${idleCount !== 1 ? "s" : ""} ready`
              : "Uploading…"}
          </p>
          <Button
            onClick={handleStartGrading}
            disabled={isGrading || idleCount === 0}
            size="lg"
          >
            {isGrading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Start Grading {pendingFiles.length} Notebook
                {pendingFiles.length !== 1 ? "s" : ""}
              </>
            )}
          </Button>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <SubmissionList
        submissions={submissions}
        workspaceId={workspace.id}
        onRefresh={setSubmissions}
      />
    </div>
  );
}
