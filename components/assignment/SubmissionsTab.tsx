"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Controls";
import { useConfirm } from "@/components/ui/Dialog";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ActionMenu, type MenuEntry } from "@/components/ui/Menu";
import { Pager, pageSlice } from "@/components/ui/Pager";
import { toast } from "@/components/ui/Toast";
import { api, copyText, downloadUrl, errorMessage } from "@/lib/client/api";
import { STATUS, type FileKind } from "@/lib/shared/constants";
import { downloadFormats } from "@/lib/shared/document";
import { fmtScore, fmtTokens, fmtUsd, plural } from "@/lib/shared/format";
import type { AssignmentData, SubmissionListItem } from "@/lib/shared/types";
import { stageFiles, type Staged } from "./staging";
import { UploadDialog } from "./UploadDialog";
import type { useSubmissions } from "./useSubmissions";

type Tab = "all" | "progress" | "graded" | "review" | "failed" | "skipped";
type SortKey = "uploaded" | "file" | "status" | "grade";
type ReviewFilter = "needs" | "reviewed" | "unreviewed" | "edited" | "outdated";

export const needsReview = (s: SubmissionListItem) => s.status === "graded" && !s.reviewed && (s.confidence === "low" || !!s.nearOf);
const isActive = (s: SubmissionListItem) => s.status === "queued" || s.status === "grading";

export function reviewReason(s: SubmissionListItem): string {
  if (s.nearOf) return `${s.nearOf.pct}% similar to ${s.nearOf.file}. Check that the work is independent.`;
  return "The AI was not confident in this grade. " + (s.lowReason || "");
}

const TABS: { id: Tab; label: string; icon: IconName; test: (s: SubmissionListItem) => boolean }[] = [
  { id: "all", label: "All", icon: "layers", test: () => true },
  { id: "progress", label: "In progress", icon: "loader", test: isActive },
  { id: "graded", label: "Graded", icon: "checkCircle", test: (s) => s.status === "graded" },
  { id: "review", label: "Needs review", icon: "flag", test: needsReview },
  { id: "failed", label: "Failed", icon: "alertCircle", test: (s) => s.status === "failed" },
  { id: "skipped", label: "Duplicates", icon: "copy", test: (s) => s.status === "skipped" },
];

const KIND_LABEL: Record<FileKind, string> = { notebook: "Notebooks", code: "Code", doc: "Documents", data: "Data", image: "Images", other: "Other" };
const STATUS_ORDER = { grading: 0, queued: 1, failed: 2, graded: 3, skipped: 4, cancelled: 5 } as const;

function newBatchId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

type Pending = { key: string; name: string; error?: string };

export function SubmissionsTab({
  asg,
  canGrade,
  list,
  openDrawer,
  dragging,
  setDragging,
  droppedFiles,
  clearDropped,
  onOrderChange,
}: {
  asg: AssignmentData;
  canGrade: boolean;
  list: ReturnType<typeof useSubmissions>;
  openDrawer: (id: string) => void;
  dragging: boolean;
  setDragging: (v: boolean) => void;
  droppedFiles: File[] | null;
  clearDropped: () => void;
  onOrderChange: (ids: string[]) => void;
}) {
  const confirm = useConfirm();
  const items = list.data.items;
  const queue = list.data.queue;
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "uploaded", dir: "desc" });
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [lo, setLo] = useState("");
  const [hi, setHi] = useState("");
  const [review, setReview] = useState<Set<ReviewFilter>>(new Set());
  const [kinds, setKinds] = useState<Set<FileKind>>(new Set());
  const [hash, setHash] = useState("");
  const [staged, setStaged] = useState<Staged[] | null>(null);
  const [regrade, setRegrade] = useState(false);
  const [staging, setStaging] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [resultsOpen, setResultsOpen] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, items.filter(t.test).length])) as Record<Tab, number>, [items]);
  const kindCounts = useMemo(() => {
    const m = new Map<FileKind, number>();
    items.forEach((s) => m.set(s.kind, (m.get(s.kind) || 0) + 1));
    return m;
  }, [items]);

  const activeFilterCount = (lo || hi ? 1 : 0) + review.size + kinds.size + (hash ? 1 : 0);

  const rows = useMemo(() => {
    const tf = TABS.find((t) => t.id === tab)!.test;
    const q = search.trim().toLowerCase();
    const loN = lo === "" ? null : +lo;
    const hiN = hi === "" ? null : +hi;
    const out = items.filter((s) => {
      if (!tf(s)) return false;
      if (q && !s.file.toLowerCase().includes(q) && !s.student.toLowerCase().includes(q) && !s.sha256.startsWith(q)) return false;
      if ((loN !== null || hiN !== null) && (s.score === null || (loN !== null && s.score < loN) || (hiN !== null && s.score > hiN))) return false;
      if (review.size) {
        const ok =
          (review.has("needs") && needsReview(s)) ||
          (review.has("reviewed") && s.reviewed) ||
          (review.has("unreviewed") && s.status === "graded" && !s.reviewed) ||
          (review.has("edited") && s.overridden) ||
          (review.has("outdated") && s.outdated);
        if (!ok) return false;
      }
      if (kinds.size && !kinds.has(s.kind)) return false;
      if (hash && !s.sha256.startsWith(hash.trim().toLowerCase())) return false;
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      if (sort.key === "file") return a.file.localeCompare(b.file) * dir;
      if (sort.key === "status") return (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) * dir;
      if (sort.key === "grade") return ((a.score ?? -1) - (b.score ?? -1)) * dir;
      return (a.uploadedAt < b.uploadedAt ? -1 : a.uploadedAt > b.uploadedAt ? 1 : a.file.localeCompare(b.file)) * dir;
    });
    return out;
  }, [items, tab, search, lo, hi, review, kinds, hash, sort]);

  const pg = pageSlice(rows, page, 25);
  useEffect(() => setPage(1), [tab, search, lo, hi, review, kinds, hash]);

  // Keep the drawer's J/K order in sync with the table.
  useEffect(() => {
    onOrderChange(rows.map((r) => r.id));
  }, [rows, onOrderChange]);

  const graded = items.filter((s) => s.status === "graded");
  const real = items.filter((s) => s.status !== "skipped" && s.status !== "cancelled").length;
  const dupN = counts.skipped;
  const avg = graded.length ? graded.reduce((a, s) => a + (s.score ?? 0), 0) / graded.length : null;
  const sorted = graded.map((s) => s.score ?? 0).sort((a, b) => a - b);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;

  // ----- Uploads -----
  async function handleFiles(files: File[]) {
    if (!files.length || !canGrade) return;
    setStaging(true);
    try {
      setRegrade(false);
      setStaged(await stageFiles(asg.id, files));
    } catch (err) {
      toast(errorMessage(err), { error: true });
    } finally {
      setStaging(false);
    }
  }
  useEffect(() => {
    if (droppedFiles?.length) {
      handleFiles(droppedFiles);
      clearDropped();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [droppedFiles]);

  async function confirmUpload() {
    const files = (staged || []).filter((s) => s.status === "ok" || s.status === "dup");
    setStaged(null);
    if (!files.length) return;
    const batchId = newBatchId();
    const keys = files.map((f, i) => ({ key: batchId + i, f }));
    setPending(keys.map(({ key, f }) => ({ key, name: f.name })));
    list.setUploading(files.length);
    let done = 0;
    let failed = 0;
    const queueList = [...keys];
    const worker = async () => {
      for (;;) {
        const job = queueList.shift();
        if (!job) return;
        const form = new FormData();
        form.set("file", job.f.file, job.f.name);
        form.set("batchId", batchId);
        form.set("regradeDuplicates", regrade ? "1" : "0");
        if (done + failed === files.length - 1) {
          form.set("last", "1");
          form.set("count", String(files.length));
        }
        try {
          const r = await api<{ item: SubmissionListItem }>(`/api/assignments/${asg.id}/submissions`, { body: form });
          list.upsert(r.item);
          setPending((p) => p.filter((x) => x.key !== job.key));
          done++;
        } catch (err) {
          failed++;
          setPending((p) => p.map((x) => (x.key === job.key ? { ...x, error: errorMessage(err) } : x)));
        }
        list.setUploading(files.length - done - failed);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    list.setUploading(0);
    await list.refresh();
    toast(failed ? `${done} uploaded, ${failed} failed` : `${plural(done, "file")} uploaded`, failed ? { error: true } : {});
    setTimeout(() => setPending((p) => p.filter((x) => !x.error)), 8000);
  }

  // ----- Actions -----
  async function act(action: "regrade" | "retry" | "gradeAnyway" | "cancel" | "remove", ids: string[], ok: (n: number) => string) {
    try {
      const r = await api<{ count: number }>(`/api/assignments/${asg.id}/actions`, { body: { action, ids } });
      toast(r.count ? ok(r.count) : "Nothing to do for those files");
      setSel(new Set());
      await list.refresh();
    } catch (err) {
      toast(errorMessage(err), { error: true });
    }
  }

  const studentLink = (s: SubmissionListItem) => (s.shareToken ? `${location.origin}/r/${s.shareToken}` : "");

  function downloadItems(s: SubmissionListItem): MenuEntry[] {
    const out: MenuEntry[] = [];
    if (s.status === "graded") {
      out.push({ type: "heading", label: "With feedback" });
      for (const f of downloadFormats(s.file, s.kind))
        out.push({ label: f.label, icon: f.id === "ipynb" ? "notebook" : f.id === "json" ? "braces" : f.id === "txt" ? "fileText" : f.id === "src" ? "code" : "globe", hint: f.ext, onClick: () => downloadUrl(`/api/submissions/${s.id}/download?format=${f.id}`) });
    }
    out.push({ type: "heading", label: "Original" });
    out.push({ label: "Original file", icon: "file", hint: "." + (s.file.split(".").pop() || "file"), onClick: () => downloadUrl(`/api/submissions/${s.id}/download?format=original`) });
    return out;
  }

  function rowMenu(s: SubmissionListItem): MenuEntry[] {
    const out: MenuEntry[] = [{ label: s.status === "graded" ? "Open feedback" : "Open file", icon: "eye", onClick: () => openDrawer(s.id) }];
    if (s.shareToken)
      out.push({ label: "Copy student link", icon: "link", onClick: async () => toast((await copyText(studentLink(s))) ? "Student link copied" : "Couldn't copy the link") });
    if (canGrade) {
      if (s.status === "graded" || s.status === "cancelled") out.push({ label: "Regrade", icon: "refresh", onClick: () => act("regrade", [s.id], () => "Queued for regrading") });
      if (s.status === "queued") out.push({ label: "Cancel", icon: "ban", onClick: () => act("cancel", [s.id], () => "Cancelled") });
    }
    out.push({ label: "Copy SHA-256", icon: "hash", onClick: async () => toast((await copyText(s.sha256)) ? "SHA-256 copied" : "Couldn't copy") });
    if (canGrade && s.status !== "grading") {
      out.push({ type: "separator" });
      out.push({
        label: "Remove",
        icon: "trash",
        danger: true,
        onClick: async () => {
          if (await confirm({ title: `Remove ${s.file}?`, body: "The file, its grade, feedback and student link are deleted.", cta: "Remove", danger: true }))
            act("remove", [s.id], () => "Removed");
        },
      });
    }
    return out;
  }

  // ----- Selection -----
  const pageIds = pg.rows.map((r) => r.id);
  const allOn = pageIds.length > 0 && pageIds.every((id) => sel.has(id));
  const someOn = pageIds.some((id) => sel.has(id)) && !allOn;
  const selected = items.filter((s) => sel.has(s.id));
  const selGraded = selected.filter((s) => s.status === "graded");
  const selRegrade = selected.filter((s) => !isActive(s));
  const toggle = (id: string) =>
    setSel((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const zipUrl = (format: string, ids: string[]) => `/api/assignments/${asg.id}/download?format=${format}${ids.length ? "&ids=" + ids.join(",") : ""}`;

  const sortBtn = (key: SortKey, label: string) => (
    <button
      className="sort-btn"
      onClick={() => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "grade" ? "desc" : "asc" }))}
      title={`Sort by ${label.toLowerCase()}`}
    >
      {label}
      <Icon name={sort.key === key ? (sort.dir === "asc" ? "chevronUp" : "chevronDown") : "chevronsUpDown"} size={12} />
    </button>
  );

  const toggleSet = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    apply(n);
  };

  const queueText = (() => {
    if (!queue.waiting && !queue.grading) return null;
    if (queue.paused === "nokey") return { paused: true, text: `Grading can't start: no AI API key is set. An admin can add one in Settings. ${plural(queue.waiting, "file")} waiting.` };
    if (queue.paused === "cap")
      return { paused: true, text: `Grading is paused because this month's AI spending reached the $${queue.cap} cap. ${queue.waiting} waiting. An admin can raise the cap in Settings.` };
    return { paused: false, text: `Grading ${queue.concurrency} at a time to stay within the API rate limit. ${queue.waiting ? queue.waiting + " waiting." : "None waiting."}` };
  })();

  return (
    <div className="asg-body">
      {canGrade && (
        <>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              handleFiles([...(e.target.files || [])]);
              e.target.value = "";
            }}
          />
          {items.length === 0 && !pending.length ? (
            <div
              className={"dropzone" + (dragging ? " dropzone--active" : "")}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
            >
              <Icon name="uploadCloud" size={28} style={{ color: "var(--c-muted)" }} />
              <span className="dropzone__title">{dragging ? "Release to upload" : "Drop files here"}</span>
              <span className="muted">Notebooks, code, documents or images. Archives (.zip) are unpacked.</span>
              <Button variant="secondary" icon="folderOpen" onClick={() => fileRef.current?.click()} loading={staging} style={{ marginTop: 6 }}>
                Browse files
              </Button>
            </div>
          ) : (
            <div className={"dropzone dropzone--compact" + (dragging ? " dropzone--active" : "")}>
              <span className="row" style={{ gap: 10 }}>
                <Icon name="uploadCloud" size={17} />
                <span>
                  <strong style={{ fontWeight: 500 }}>{dragging ? "Release to upload." : "Drop files anywhere on this tab to grade them."}</strong>{" "}
                  <span className="muted">Archives (.zip) are unpacked.</span>
                </span>
              </span>
              <Button variant="secondary" size="sm" icon="folderOpen" onClick={() => fileRef.current?.click()} loading={staging}>
                Browse files
              </Button>
            </div>
          )}
        </>
      )}

      {(items.length > 0 || pending.length > 0) && (
        <>
          {sel.size === 0 ? (
            <div className="stack" style={{ gap: 12 }}>
              <div className="pills" role="tablist" aria-label="Filter by status">
                {TABS.filter((t) => t.id === "all" || counts[t.id] > 0 || tab === t.id).map((t) => (
                  <button key={t.id} role="tab" className="pill" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                    <Icon name={t.icon} size={14} />
                    {t.label} <span className="count">{counts[t.id]}</span>
                  </button>
                ))}
              </div>
              <div className="toolbar">
                <div className="toolbar__stats">
                  <span>
                    <Icon name="checkCircle" size={14} />
                    {graded.length} of {real} graded{dupN ? `, ${plural(dupN, "duplicate")} skipped` : ""}
                  </span>
                  {avg !== null && (
                    <span>
                      <Icon name="barChart" size={14} />
                      Average {avg.toFixed(1)} / {asg.points}
                    </span>
                  )}
                  {median !== null && <span>Median {fmtScore(median)}</span>}
                  {graded.length > 0 && (
                    <a
                      href="#results"
                      onClick={(e) => {
                        e.preventDefault();
                        setResultsOpen(true);
                        document.getElementById("results")?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="row"
                      style={{ gap: 4 }}
                    >
                      Score breakdown <Icon name="arrowDown" size={13} />
                    </a>
                  )}
                </div>
                <div className="toolbar__right">
                  <Button variant={activeFilterCount ? "outline" : "secondary"} size="sm" icon="filter" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen}>
                    Filters{activeFilterCount ? <span className="badge">{activeFilterCount}</span> : null}
                  </Button>
                  <label className="search">
                    <Icon name="search" size={14} />
                    <input className="input input--sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files" aria-label="Search files" />
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="selbar">
              <span className="selbar__count">{sel.size} selected</span>
              <div className="act-group" role="group">
                <ActionMenu
                  align="start"
                  trigger={
                    <button className="act" disabled={!selected.length}>
                      <Icon name="download" size={15} />
                      Download
                    </button>
                  }
                  items={[
                    selGraded.length > 0 && { type: "heading", label: `With feedback (${selGraded.length} graded)` },
                    selGraded.length > 0 && { label: "Feedback files", icon: "notebook", hint: ".zip", onClick: () => downloadUrl(zipUrl("best", selGraded.map((s) => s.id))) },
                    selGraded.length > 0 && { label: "Files as HTML", icon: "globe", hint: ".zip", onClick: () => downloadUrl(zipUrl("html", selGraded.map((s) => s.id))) },
                    selGraded.length > 0 && { label: "Feedback summaries", icon: "fileText", hint: ".zip", onClick: () => downloadUrl(zipUrl("txt", selGraded.map((s) => s.id))) },
                    selGraded.length > 0 && { label: "Feedback data", icon: "braces", hint: ".zip", onClick: () => downloadUrl(zipUrl("json", selGraded.map((s) => s.id))) },
                    { type: "heading", label: "Original" },
                    { label: "Original files", icon: "file", hint: ".zip", onClick: () => downloadUrl(zipUrl("original", selected.map((s) => s.id))) },
                    { type: "separator" },
                    { label: "Grades", icon: "table", hint: ".csv", onClick: () => downloadUrl(`/api/assignments/${asg.id}/grades?ids=${selected.map((s) => s.id).join(",")}`) },
                  ]}
                />
                {canGrade && (
                  <>
                    <span className="sep" />
                    <button
                      className="act"
                      disabled={!selRegrade.length}
                      title={selRegrade.length ? "Send the selected files to the AI again" : "The selected files are already being graded"}
                      onClick={() => act("regrade", selRegrade.map((s) => s.id), (n) => `${plural(n, "file")} queued for regrading`)}
                    >
                      <Icon name="refresh" size={15} />
                      Regrade{selRegrade.length !== sel.size && selRegrade.length ? ` ${selRegrade.length}` : ""}
                    </button>
                  </>
                )}
                <span className="sep" />
                <button
                  className="act act--icon"
                  title="Copy SHA-256 hashes"
                  aria-label="Copy SHA-256 hashes"
                  onClick={async () => {
                    await copyText(selected.map((s) => `${s.sha256}  ${s.file}`).join("\n"));
                    toast(`${plural(selected.length, "hash", "hashes")} copied`);
                  }}
                >
                  <Icon name="hash" size={15} />
                </button>
                {canGrade && (
                  <>
                    <span className="sep" />
                    <button
                      className="act"
                      style={{ color: "var(--c-danger-text)" }}
                      onClick={async () => {
                        const n = selected.length;
                        if (await confirm({ title: `Remove ${plural(n, "submission")}?`, body: "Their files, grades, feedback and student links are deleted. Files that are grading right now are kept.", cta: `Remove ${n}`, danger: true }))
                          act("remove", selected.map((s) => s.id), (k) => `${plural(k, "submission")} removed`);
                      }}
                    >
                      <Icon name="trash" size={15} />
                      Remove
                    </button>
                  </>
                )}
              </div>
              <span className="spacer" />
              <Button variant="ghost" size="sm" icon="x" onClick={() => setSel(new Set())}>
                Clear
              </Button>
            </div>
          )}

          {queueText && (
            <div className={"queue-note" + (queueText.paused ? " queue-note--paused" : "")}>
              <Icon name={queueText.paused ? "alertTriangle" : "clock"} size={15} />
              <span>{queueText.text}</span>
            </div>
          )}

          {filtersOpen && (
            <div className="filters">
              <div className="filter-group">
                <span className="filter-group__label">Grade out of {asg.points}</span>
                <div className="range-row">
                  <input className="input input--sm" type="number" min={0} max={asg.points} step={0.5} value={lo} onChange={(e) => setLo(e.target.value)} aria-label="Minimum grade" placeholder="0" />
                  <span className="muted">to</span>
                  <input className="input input--sm" type="number" min={0} max={asg.points} step={0.5} value={hi} onChange={(e) => setHi(e.target.value)} aria-label="Maximum grade" placeholder={String(asg.points)} />
                </div>
                <div className="toggle-chips">
                  {[
                    ["Below 60%", 0, asg.points * 0.6 - 0.5],
                    ["60–80%", asg.points * 0.6, asg.points * 0.8 - 0.5],
                    ["80% and up", asg.points * 0.8, asg.points],
                  ].map(([label, a, b]) => {
                    const on = lo === String(a) && hi === String(b);
                    return (
                      <button key={String(label)} className="toggle-chip" aria-pressed={on} onClick={() => (on ? (setLo(""), setHi("")) : (setLo(String(a)), setHi(String(b))))}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="filter-group">
                <span className="filter-group__label">Review</span>
                <div className="toggle-chips">
                  {(
                    [
                      ["needs", "Needs review", items.filter(needsReview).length],
                      ["reviewed", "Reviewed", items.filter((s) => s.reviewed).length],
                      ["unreviewed", "Not reviewed", items.filter((s) => s.status === "graded" && !s.reviewed).length],
                      ["edited", "Changed by a grader", items.filter((s) => s.overridden).length],
                      ["outdated", "Graded with earlier settings", items.filter((s) => s.outdated).length],
                    ] as [ReviewFilter, string, number][]
                  ).map(([k, label, n]) => (
                    <button key={k} className="toggle-chip" aria-pressed={review.has(k)} disabled={!n && !review.has(k)} onClick={() => toggleSet(review, k, setReview)}>
                      {label} <span className="count">{n}</span>
                    </button>
                  ))}
                </div>
              </div>
              {kindCounts.size > 1 && (
                <div className="filter-group">
                  <span className="filter-group__label">File type</span>
                  <div className="toggle-chips">
                    {[...kindCounts.entries()].map(([k, n]) => (
                      <button key={k} className="toggle-chip" aria-pressed={kinds.has(k)} onClick={() => toggleSet(kinds, k, setKinds)}>
                        {KIND_LABEL[k]} <span className="count">{n}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="filter-group">
                <span className="filter-group__label">SHA-256</span>
                <input className="input input--sm input--mono" value={hash} onChange={(e) => setHash(e.target.value)} placeholder="Starts with" aria-label="SHA-256 starts with" />
              </div>
              <div className="row" style={{ gridColumn: "1 / -1", justifyContent: "space-between" }}>
                <span className="muted">
                  {rows.length} of {items.length} shown
                </span>
                {activeFilterCount > 0 && (
                  <Button
                    variant="link"
                    onClick={() => {
                      setLo("");
                      setHi("");
                      setReview(new Set());
                      setKinds(new Set());
                      setHash("");
                    }}
                  >
                    Clear all
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="subs" role="table" aria-label="Submissions">
            <div className="subs__head" role="row">
              <span role="columnheader">
                <Checkbox
                  checked={allOn}
                  indeterminate={someOn}
                  onChange={() =>
                    setSel((cur) => {
                      const n = new Set(cur);
                      if (allOn) pageIds.forEach((id) => n.delete(id));
                      else pageIds.forEach((id) => n.add(id));
                      return n;
                    })
                  }
                  ariaLabel="Select all on this page"
                />
              </span>
              <span role="columnheader">{sortBtn("file", "Submission")}</span>
              <span role="columnheader">{sortBtn("status", "Status")}</span>
              <span role="columnheader">{sortBtn("grade", "Grade")}</span>
              <span role="columnheader" className="sr-only">
                Actions
              </span>
            </div>
            {pending.map((p) => (
              <div className="subs__row" key={p.key} role="row" style={{ cursor: "default" }}>
                <span />
                <div className="subs__file">
                  <span className="subs__name">{p.name}</span>
                  {p.error && <span className="subs__note subs__note--danger">{p.error}</span>}
                </div>
                <span className="status subs__status">
                  {p.error ? (
                    <>
                      <span className="dot" style={{ background: "var(--c-danger)" }} />
                      Upload failed
                    </>
                  ) : (
                    <>
                      <Icon name="loader" size={12} className="spin" style={{ color: "var(--c-primary)" }} />
                      Uploading
                    </>
                  )}
                </span>
                <span className="subs__grade muted">-</span>
                <span />
              </div>
            ))}
            {pg.rows.map((s) => {
              const st = STATUS[s.status];
              const flagged = needsReview(s);
              const note = s.note || (s.outdated ? "Graded with earlier settings" : s.nearOf && s.status === "graded" ? `${s.nearOf.pct}% similar to ${s.nearOf.file}` : "");
              return (
                <div
                  key={s.id}
                  className="subs__row"
                  role="row"
                  data-selected={sel.has(s.id)}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button, a, input, [role=checkbox], [role=menu]")) return;
                    openDrawer(s.id);
                  }}
                >
                  <span onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={sel.has(s.id)} onChange={() => toggle(s.id)} ariaLabel={`Select ${s.file}`} />
                  </span>
                  <div className="subs__file">
                    <span className="subs__name" title={s.file}>
                      {s.file}
                    </span>
                    {note && (
                      <span
                        className={"subs__note" + (s.status === "failed" ? " subs__note--danger" : s.outdated && !s.note ? " subs__note--warn" : "")}
                        title={note}
                      >
                        {note}
                      </span>
                    )}
                  </div>
                  <span className={"status subs__status" + (s.status === "grading" ? " status--grading" : "")}>
                    {s.status === "grading" ? (
                      <Icon name="loader" size={12} className="spin" style={{ color: st.color }} />
                    ) : (
                      <span className="dot" style={{ background: st.color }} />
                    )}
                    <span className="label">{st.label}</span>
                  </span>
                  <span className="subs__grade">
                    {s.status === "graded" ? fmtScore(s.score) : <span className="muted">-</span>}
                    {flagged && (
                      <span title={"Needs review. " + reviewReason(s)} aria-label="Needs review">
                        <Icon name="flag" size={14} className="icon--flag" />
                      </span>
                    )}
                    {s.reviewed && (
                      <span title={`Reviewed by ${s.reviewedBy ?? "a grader"}`} aria-label="Reviewed">
                        <Icon name="checkCircle" size={14} className="icon--ok" />
                      </span>
                    )}
                  </span>
                  <div className="subs__acts">
                    <div className="act-group" role="group">
                      {s.status === "graded" && (
                        <>
                          <button className="act" onClick={() => openDrawer(s.id)}>
                            <Icon name="messageText" size={15} />
                            Feedback
                          </button>
                          <span className="sep" />
                        </>
                      )}
                      {canGrade && s.status === "failed" && (
                        <>
                          <button className="act" onClick={() => act("retry", [s.id], () => "Queued for retry")}>
                            <Icon name="rotate" size={15} />
                            Retry
                          </button>
                          <span className="sep" />
                        </>
                      )}
                      {canGrade && s.status === "skipped" && (
                        <>
                          <button className="act" onClick={() => act("gradeAnyway", [s.id], () => "Queued for grading")}>
                            <Icon name="play" size={14} />
                            Grade anyway
                          </button>
                          <span className="sep" />
                        </>
                      )}
                      <ActionMenu
                        trigger={
                          <button className="act act--icon" aria-label={`Download ${s.file}`} title="Download">
                            <Icon name="download" size={15} />
                          </button>
                        }
                        items={downloadItems(s)}
                      />
                      <span className="sep" />
                      <ActionMenu
                        trigger={
                          <button className="act act--icon" aria-label={`More actions for ${s.file}`} title="More actions">
                            <Icon name="more" size={15} />
                          </button>
                        }
                        items={rowMenu(s)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            {!pg.rows.length && !pending.length && <p className="empty">{items.length ? "No files match these filters." : "No files yet."}</p>}
          </div>
          <Pager page={pg.page} pages={pg.pages} total={rows.length} from={pg.from} to={pg.to} onPage={setPage} />
          {graded.length > 0 && <Results asg={asg} graded={graded} items={items} open={resultsOpen} setOpen={setResultsOpen} />}
        </>
      )}
      <UploadDialog staged={staged} regrade={regrade} onRegrade={setRegrade} onCancel={() => setStaged(null)} onConfirm={confirmUpload} />
    </div>
  );
}

function Results({
  asg,
  graded,
  items,
  open,
  setOpen,
}: {
  asg: AssignmentData;
  graded: SubmissionListItem[];
  items: SubmissionListItem[];
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const pts = asg.points;
  const scores = graded.map((s) => s.score ?? 0).sort((a, b) => a - b);
  const bins = Array(10).fill(0) as number[];
  scores.forEach((v) => bins[Math.min(9, Math.floor((v / pts) * 10))]++);
  const max = Math.max(...bins) || 1;
  const n = scores.length;
  const med = n % 2 ? scores[(n - 1) / 2] : (scores[n / 2 - 1] + scores[n / 2]) / 2;
  const avg = scores.reduce((a, b) => a + b, 0) / n;
  const rubric = asg.rubricMethod !== "none" ? asg.rubricRows.filter((r) => r.name.trim()) : [];
  const crit = rubric.map((r, i) => {
    const vals = graded.map((s) => s.crit?.[i]).filter((v): v is number => typeof v === "number");
    const a = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : 0;
    return { name: r.name, pts: +r.pts || 0, avg: a };
  });
  const tokens = items.reduce((a, s) => a + s.tokens, 0);
  const cost = items.reduce((a, s) => a + s.costUsd, 0);
  return (
    <section className="results" id="results">
      <div className="section-head">
        <h2 className="h2">Results</h2>
        <Button variant="ghost" size="sm" iconRight={open ? "chevronUp" : "chevronDown"} onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Hide" : "Show"}
        </Button>
      </div>
      {open && (
        <>
          <div className="results__grid" style={{ marginTop: 16 }}>
            <div>
              <span className="h3">Score distribution</span>
              <div className="histogram" style={{ marginTop: 14 }}>
                {bins.map((b, i) => (
                  <div
                    key={i}
                    style={{ height: (b / max) * 100 + "%", minHeight: b ? 3 : 0 }}
                    title={`${Math.round((i * pts) / 10)} to ${Math.round(((i + 1) * pts) / 10)}: ${plural(b, "file")}`}
                  />
                ))}
              </div>
              <div className="axis">
                <span>0</span>
                <span>{pts / 2}</span>
                <span>{pts}</span>
              </div>
              <div className="stat-trio">
                <div className="stat">
                  <span className="stat__label">Average</span>
                  <span className="stat__value">{avg.toFixed(1)}</span>
                </div>
                <div className="stat">
                  <span className="stat__label">Median</span>
                  <span className="stat__value">{fmtScore(med)}</span>
                </div>
                <div className="stat">
                  <span className="stat__label">Range</span>
                  <span className="stat__value">
                    {fmtScore(scores[0])} to {fmtScore(scores[n - 1])}
                  </span>
                </div>
              </div>
            </div>
            {crit.length > 0 && (
              <div>
                <span className="h3">Average by rubric line</span>
                <div style={{ marginTop: 14 }}>
                  {crit.map((c, i) => (
                    <div className="crit-bar" key={c.name + i}>
                      <div className="crit-bar__top">
                        <span className="truncate">{c.name}</span>
                        <span className="muted">
                          {c.avg.toFixed(1)} / {c.pts}
                        </span>
                      </div>
                      <div className="meter">
                        <span style={{ width: (c.pts ? Math.min(100, (c.avg / c.pts) * 100) : 0) + "%" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {tokens > 0 && (
            <p className="muted row" style={{ marginTop: 18, gap: 6 }}>
              <Icon name="coins" size={14} />
              {fmtTokens(tokens)} tokens used on this assignment, about {fmtUsd(cost)} (estimated)
            </p>
          )}
        </>
      )}
    </section>
  );
}
