"use client";

import { useEffect, useRef } from "react";
import { StatusBadge } from "./StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Submission } from "@/types";

interface SubmissionListProps {
  submissions: Submission[];
  workspaceId: string;
  onRefresh: (submissions: Submission[]) => void;
}

const POLLING_INTERVAL_MS = 5000;
const ACTIVE_STATUSES = new Set(["queued", "processing"]);

export function SubmissionList({
  submissions,
  workspaceId,
  onRefresh,
}: SubmissionListProps) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchSubmissions() {
    try {
      const res = await fetch(`/api/submissions/${workspaceId}`);
      if (res.ok) {
        const data: Submission[] = await res.json();
        onRefresh(data);
      }
    } catch {
      // silently ignore polling errors
    }
  }

  // Poll while any submission is in an active state
  useEffect(() => {
    const hasActive = submissions.some((s) => ACTIVE_STATUSES.has(s.status));

    if (hasActive) {
      timerRef.current = setInterval(fetchSubmissions, POLLING_INTERVAL_MS);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions]);

  if (submissions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No submissions yet.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Drop .ipynb files above to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">
          Submissions ({submissions.length})
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={fetchSubmissions}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {submissions.map((sub) => (
            <SubmissionRow key={sub.id} submission={sub} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SubmissionRow({ submission }: { submission: Submission }) {
  const date = new Date(submission.createdAt).toLocaleString();

  return (
    <div className="flex items-center justify-between px-6 py-3 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {submission.originalFilename}
          </p>
          <p className="text-xs text-muted-foreground">{date}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 ml-4">
        {submission.score && (
          <span className="text-sm font-semibold text-foreground">
            {submission.score}
          </span>
        )}
        <StatusBadge status={submission.status} />
        {submission.gradedHtmlKey && (
          <a
            href={`/api/graded/${submission.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            View
          </a>
        )}
      </div>
    </div>
  );
}
