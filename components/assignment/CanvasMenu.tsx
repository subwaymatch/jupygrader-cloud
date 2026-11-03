"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Controls";
import { Modal } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Mascot } from "@/components/ui/Mascot";
import { ActionMenu, type MenuEntry } from "@/components/ui/Menu";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/client/api";
import { canvasGrade, planPosting, type ImportRow, type ImportState, type PostRow, type PostState } from "@/lib/shared/canvas";
import { fmtAt, fmtDay, fmtScore, plural } from "@/lib/shared/format";
import type { AssignmentData, CanvasAssignmentLink, CanvasStatus, SubmissionListItem } from "@/lib/shared/types";
import { needsReview } from "./SubmissionsTab";

export type CanvasContext = { status: CanvasStatus; course: { id: string; name: string } | null };

/** A ref that always holds the latest callback, so effects can call it without re-running when it changes. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

type Mode = null | "link" | "import" | "post";

/** The assignment page's Canvas button: link to a Canvas assignment, import submissions, post grades. */
export function CanvasMenu({
  asg,
  onLinked,
  items,
  refresh,
  canEdit,
  canUpload,
  courseId,
  canvas,
}: {
  asg: AssignmentData;
  onLinked: (link: CanvasAssignmentLink | null) => void;
  items: SubmissionListItem[];
  refresh: () => void;
  canEdit: boolean;
  canUpload: boolean;
  courseId: string;
  canvas: CanvasContext;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const { status, course } = canvas;
  const imported = items.some((s) => s.canvas);

  const entries: MenuEntry[] = !status.connected
    ? [{ label: "Connect your Canvas account", icon: "link", onClick: () => router.push("/app/account#canvas") }]
    : !course
      ? [
          canEdit
            ? { label: "Link this course in Course settings", icon: "settings", onClick: () => router.push(`/app/courses/${courseId}/settings`) }
            : { label: "A Teacher needs to link this course", icon: "info", disabled: true, onClick: () => {} },
        ]
      : !asg.canvas
        ? [
            canEdit
              ? { label: "Link to a Canvas assignment…", icon: "link", onClick: () => setMode("link") }
              : { label: "A Teacher needs to link this assignment", icon: "info", disabled: true, onClick: () => {} },
          ]
        : [
            { type: "heading", label: `Linked to ${asg.canvas.name}` },
            { label: "Import submissions…", icon: "download", disabled: !canUpload, onClick: () => setMode("import") },
            { label: "Post grades…", icon: "send", disabled: !canUpload || !imported, onClick: () => setMode("post") },
            {
              label: "Open in Canvas",
              icon: "externalLink",
              onClick: () => window.open(`${status.url}/courses/${course.id}/assignments/${asg.canvas!.id}`, "_blank", "noopener"),
            },
            ...(canEdit ? [{ type: "separator" as const }, { label: "Change link…", icon: "link" as const, onClick: () => setMode("link") }] : []),
          ];

  return (
    <>
      <ActionMenu
        trigger={
          <button className="btn btn--secondary">
            <Icon name="link" size={15} />
            Canvas
            <Icon name="chevronDown" size={13} />
          </button>
        }
        items={entries}
      />
      {mode === "link" && course && <LinkDialog asg={asg} courseId={courseId} courseName={course.name} onClose={() => setMode(null)} onLinked={onLinked} />}
      {mode === "import" && asg.canvas && <ImportDialog asg={asg} onClose={() => setMode(null)} onDone={refresh} onLinked={onLinked} />}
      {mode === "post" && asg.canvas && <PostDialog asg={asg} link={asg.canvas} items={items} onClose={() => setMode(null)} onDone={refresh} />}
    </>
  );
}

// ---------- Linking ----------

type CanvasOption = { id: string; name: string; points: number | null; dueAt: string | null; published: boolean; uploads: boolean; linkedTo: { id: string; title: string } | null };

function LinkDialog({
  asg,
  courseId,
  courseName,
  onClose,
  onLinked,
}: {
  asg: AssignmentData;
  courseId: string;
  courseName: string;
  onClose: () => void;
  onLinked: (link: CanvasAssignmentLink | null) => void;
}) {
  const [options, setOptions] = useState<CanvasOption[] | null>(null);
  const [choice, setChoice] = useState<string | null>(asg.canvas?.id ?? null);
  const [busy, setBusy] = useState(false);
  const close = useLatest(onClose);

  useEffect(() => {
    api<{ assignments: CanvasOption[] }>(`/api/courses/${courseId}/canvas`)
      .then((r) => setOptions(r.assignments.filter((a) => !a.linkedTo || a.linkedTo.id === asg.id)))
      .catch((err) => {
        toast(errorMessage(err), { error: true });
        close.current();
      });
  }, [courseId, asg.id, close]);

  async function save(id: string | null) {
    setBusy(true);
    try {
      const r = await api<{ canvas: CanvasAssignmentLink | null }>(`/api/assignments/${asg.id}/canvas`, { method: "PUT", body: { canvasAssignmentId: id } });
      onLinked(r.canvas);
      toast(r.canvas ? `Linked to ${r.canvas.name}` : "Unlinked from Canvas");
      onClose();
    } catch (err) {
      toast(errorMessage(err), { error: true });
      setBusy(false);
    }
  }

  const picked = options?.find((o) => o.id === choice);
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Link to a Canvas assignment"
      description={`Choose the assignment in ${courseName} that students submitted to. Grades are posted back to it.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => choice && save(choice)} loading={busy} disabled={!choice || choice === asg.canvas?.id}>
            Link assignment
          </Button>
        </>
      }
    >
      {!options ? (
        <div className="row muted">
          <Icon name="loader" size={15} className="spin" />
          Loading Canvas assignments…
        </div>
      ) : (
        <>
          <Select
            value={choice}
            onChange={setChoice}
            ariaLabel="Canvas assignment"
            placeholder={options.length ? "Choose a Canvas assignment" : "No Canvas assignments to link"}
            disabled={!options.length}
            options={options.map((a) => ({ value: a.id, label: [a.name, a.points ? `${a.points} points` : "", a.published ? "" : "unpublished"].filter(Boolean).join(" · ") }))}
          />
          {picked && !picked.uploads && (
            <p className="callout callout--warn">
              <Icon name="alertTriangle" size={15} />
              <span>This Canvas assignment doesn&apos;t take file uploads, so there may be no files to import. Grades can still be posted.</span>
            </p>
          )}
          {picked && picked.points !== null && picked.points !== asg.points && (
            <p className="callout">
              <Icon name="info" size={15} />
              <span>
                It&apos;s worth {picked.points} points in Canvas and {asg.points} here. Grades are scaled when they&apos;re posted: {fmtScore(asg.points * 0.85)} /{" "}
                {asg.points} is posted as {canvasGrade(asg.points * 0.85, asg.points, picked.points)}.
              </span>
            </p>
          )}
          {/* In the body, after the picker, so it never has focus when the dialog opens. */}
          {asg.canvas && (
            <div>
              <Button variant="link" size="sm" onClick={() => save(null)} disabled={busy}>
                Unlink from {asg.canvas.name}
              </Button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

// ---------- Importing ----------

const IMPORT_LABEL: Record<ImportState, string> = {
  new: "New",
  "new-attempt": "New attempt",
  imported: "Imported",
  "too-large": "Too large",
  "no-file": "No file",
  "not-submitted": "Not submitted",
};

/** Students sent per request; the server takes up to 5. */
const IMPORT_BATCH = 5;

function ImportDialog({
  asg,
  onClose,
  onDone,
  onLinked,
}: {
  asg: AssignmentData;
  onClose: () => void;
  onDone: () => void;
  onLinked: (link: CanvasAssignmentLink | null) => void;
}) {
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<{ imported: number; problems: string[] } | null>(null);
  const linked = useLatest(onLinked);
  const close = useLatest(onClose);

  useEffect(() => {
    api<{ canvas: CanvasAssignmentLink; rows: ImportRow[] }>(`/api/assignments/${asg.id}/canvas`)
      .then((r) => {
        setRows(r.rows);
        linked.current(r.canvas);
      })
      .catch((err) => {
        toast(errorMessage(err), { error: true });
        close.current();
      });
  }, [asg.id, linked, close]);

  const todo = (rows ?? []).filter((r) => r.state === "new" || r.state === "new-attempt");
  const files = todo.reduce((n, r) => n + r.files.filter((f) => f.state === "new").length, 0);
  const count = (s: ImportState) => (rows ?? []).filter((r) => r.state === s).length;

  async function run() {
    const ids = todo.map((r) => r.userId);
    const batchId = "canvas-" + Date.now().toString(36);
    let imported = 0;
    const problems: string[] = [];
    setProgress({ done: 0, total: ids.length });
    for (let i = 0; i < ids.length; i += IMPORT_BATCH) {
      const chunk = ids.slice(i, i + IMPORT_BATCH);
      const last = i + IMPORT_BATCH >= ids.length;
      try {
        const r = await api<{ results: { userId: string; imported: number; skipped: { file: string; reason: string }[]; error?: string }[] }>(
          `/api/assignments/${asg.id}/canvas/import`,
          { body: { userIds: chunk, batchId, last, prior: imported } },
        );
        for (const x of r.results) {
          imported += x.imported;
          const who = rows!.find((row) => row.userId === x.userId)?.name ?? "A student";
          if (x.error) problems.push(`${who}: ${x.error}`);
          for (const s of x.skipped) problems.push(`${who}, ${s.file}: ${s.reason}`);
        }
      } catch (err) {
        problems.push(errorMessage(err));
        break;
      }
      setProgress({ done: Math.min(ids.length, i + chunk.length), total: ids.length });
    }
    setReport({ imported, problems });
    setProgress(null);
    onDone();
  }

  const working = !!progress;
  return (
    <Modal
      open
      wide
      onOpenChange={(o) => !o && !working && onClose()}
      title="Import submissions from Canvas"
      description={`Files students submitted to ${asg.canvas!.name}. Each one is graded in the background after it's imported.`}
      footer={
        report ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={working}>
              Cancel
            </Button>
            <Button variant="primary" icon="download" onClick={run} loading={working} disabled={!files}>
              {files ? `Import ${plural(files, "file")}` : "Nothing new to import"}
            </Button>
          </>
        )
      }
    >
      {!rows ? (
        <div className="row muted">
          <Icon name="loader" size={15} className="spin" />
          Reading submissions from Canvas…
        </div>
      ) : report ? (
        <div className="canvas-report">
          <Mascot pose="inbox" size={88} />
          <div className="stack" style={{ gap: 8, minWidth: 0 }}>
            <strong>{report.imported ? `Imported ${plural(report.imported, "file")}. Grading has started.` : "No files were imported."}</strong>
            {report.problems.length > 0 && (
              <ul className="canvas-problems">
                {report.problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="canvas-summary">
            <Mascot pose="sync" size={56} />
            <span>
              {plural(rows.length, "student")}: {todo.length ? `${todo.length} with new files` : "nothing new"}
              {count("imported") ? `, ${count("imported")} already imported` : ""}
              {count("not-submitted") ? `, ${count("not-submitted")} not submitted` : ""}
              {count("no-file") ? `, ${count("no-file")} without a file` : ""}.
            </span>
          </div>
          {progress && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="muted">
                Importing {progress.done} of {plural(progress.total, "student")}…
              </span>
              <div className="progress">
                <span style={{ width: (progress.done / Math.max(1, progress.total)) * 100 + "%" }} />
              </div>
            </div>
          )}
          <div className="canvas-rows" role="list">
            {rows.map((r) => (
              <div className="canvas-row" role="listitem" key={r.userId}>
                <div className="canvas-row__main">
                  <span className="truncate">{r.name}</span>
                  <span className="muted truncate">
                    {r.files.length ? r.files.map((f) => f.name).join(", ") : r.submittedAt ? "Submitted without a file" : "No submission"}
                  </span>
                </div>
                <span className="muted nowrap canvas-row__when">
                  {r.submittedAt ? fmtDay(r.submittedAt) : ""}
                  {r.late && <span className="chip chip--warn canvas-late">Late</span>}
                </span>
                <span className={"canvas-state canvas-state--" + r.state}>{IMPORT_LABEL[r.state]}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

// ---------- Posting ----------

const POST_LABEL: Record<PostState, string> = {
  ready: "Ready",
  changed: "Changed since posting",
  posted: "Posted",
  "not-graded": "Not graded yet",
  "several-files": "Several files",
};

const POST_BATCH = 5;

function PostDialog({
  asg,
  link,
  items,
  onClose,
  onDone,
}: {
  asg: AssignmentData;
  link: CanvasAssignmentLink;
  items: SubmissionListItem[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [onlyReviewed, setOnlyReviewed] = useState(false);
  const [again, setAgain] = useState(false);
  const [comment, setComment] = useState(true);
  const [attach, setAttach] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<{ posted: number; problems: string[] } | null>(null);
  // Fixed when the dialog opens, so rows don't move while grades are posted.
  const [plan] = useState(() => planPosting(items));

  const included = (p: PostRow) =>
    (p.state === "ready" || p.state === "changed" || (again && p.state === "posted")) && (!onlyReviewed || p.item.reviewed);
  const todo = plan.filter(included);
  const count = (s: PostState) => plan.filter((p) => p.state === s).length;
  const flagged = todo.filter((p) => needsReview(p.item)).length;
  const scaled = link.points !== null && link.points !== asg.points;

  async function run() {
    let posted = 0;
    const problems: string[] = [];
    setProgress({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length; i += POST_BATCH) {
      const chunk = todo.slice(i, i + POST_BATCH);
      const last = i + POST_BATCH >= todo.length;
      try {
        const r = await api<{ results: { id: string; ok: boolean; error?: string }[] }>(`/api/assignments/${asg.id}/canvas/post`, {
          body: { ids: chunk.map((p) => p.item.id), comment, attach, last, prior: posted },
        });
        for (const x of r.results) {
          if (x.ok) posted++;
          else problems.push(`${chunk.find((p) => p.item.id === x.id)?.student ?? "A student"}: ${x.error}`);
        }
      } catch (err) {
        problems.push(errorMessage(err));
        break;
      }
      setProgress({ done: Math.min(todo.length, i + chunk.length), total: todo.length });
    }
    setReport({ posted, problems });
    setProgress(null);
    onDone();
  }

  const working = !!progress;
  return (
    <Modal
      open
      wide
      onOpenChange={(o) => !o && !working && onClose()}
      title="Post grades to Canvas"
      description={`Sends each student's grade to ${link.name}. Students see it when Canvas releases grades for this assignment.`}
      footer={
        report ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={working}>
              Cancel
            </Button>
            <Button variant="primary" icon="send" onClick={run} loading={working} disabled={!todo.length}>
              {todo.length ? `Post ${plural(todo.length, "grade")}` : "Nothing to post"}
            </Button>
          </>
        )
      }
    >
      {report ? (
        <div className="canvas-report">
          <Mascot pose="stamp" size={88} />
          <div className="stack" style={{ gap: 8, minWidth: 0 }}>
            <strong>{report.posted ? `Posted ${plural(report.posted, "grade")} to Canvas.` : "No grades were posted."}</strong>
            {report.problems.length > 0 && (
              <ul className="canvas-problems">
                {report.problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="canvas-summary">
            <Mascot pose="sync" size={56} />
            <span>
              {plural(plan.length, "student")} imported from Canvas: {count("ready")} ready
              {count("changed") ? `, ${count("changed")} changed since posting` : ""}
              {count("posted") ? `, ${count("posted")} already posted` : ""}
              {count("not-graded") ? `, ${count("not-graded")} not graded yet` : ""}
              {count("several-files") ? `, ${count("several-files")} with several files` : ""}.
            </span>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            <Checkbox checked={comment} onChange={setComment} label="Add a comment with the feedback" description="The score, the summary and each rubric line with its comment." />
            <Checkbox
              checked={attach}
              onChange={setAttach}
              label="Attach the file with feedback"
              description="Notebooks get the feedback cells, code files comments, and other files an HTML page."
            />
            <Checkbox checked={onlyReviewed} onChange={setOnlyReviewed} label="Only files marked reviewed" />
            {count("posted") > 0 && (
              <Checkbox
                checked={again}
                onChange={setAgain}
                label="Post again for grades already posted"
                description="Comments and files are added again in Canvas."
              />
            )}
          </div>
          {scaled && (
            <p className="callout">
              <Icon name="info" size={15} />
              <span>
                Scores are scaled to the Canvas assignment&apos;s {link.points} points. {fmtScore(asg.points * 0.85)} / {asg.points} is posted as{" "}
                {canvasGrade(asg.points * 0.85, asg.points, link.points)}.
              </span>
            </p>
          )}
          {flagged > 0 && (
            <p className="callout callout--warn">
              <Icon name="flag" size={15} />
              <span>{plural(flagged, "grade")} still need{flagged === 1 ? "s" : ""} review. Turn on &ldquo;Only files marked reviewed&rdquo; to hold them back.</span>
            </p>
          )}
          {progress && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="muted">
                Posting {progress.done} of {plural(progress.total, "grade")}…
              </span>
              <div className="progress">
                <span style={{ width: (progress.done / Math.max(1, progress.total)) * 100 + "%" }} />
              </div>
            </div>
          )}
          <div className="canvas-rows" role="list">
            {plan.map((p) => {
              const on = included(p);
              const s = p.item;
              return (
                <div className={"canvas-row" + (on ? "" : " canvas-row--off")} role="listitem" key={p.canvasUserId}>
                  <div className="canvas-row__main">
                    <span className="truncate">{p.student}</span>
                    <span className="muted truncate">
                      {s.score !== null && s.status === "graded" ? `${fmtScore(s.score)} / ${asg.points}` : s.file}
                      {s.status === "graded" && s.score !== null && scaled && ` → ${canvasGrade(s.score, asg.points, link.points)} / ${link.points}`}
                      {needsReview(s) && " · needs review"}
                    </span>
                  </div>
                  <span className="muted nowrap canvas-row__when">{p.state === "posted" || p.state === "changed" ? fmtAt(s.canvas?.postedAt) : ""}</span>
                  <span className={"canvas-state canvas-state--" + p.state}>{POST_LABEL[p.state]}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}
