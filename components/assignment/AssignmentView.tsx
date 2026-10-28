"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ActionMenu } from "@/components/ui/Menu";
import { toast } from "@/components/ui/Toast";
import { api, copyText, downloadUrl, errorMessage } from "@/lib/client/api";
import { saveOrder } from "@/lib/client/sync";
import { STYLES } from "@/lib/shared/constants";
import { plural } from "@/lib/shared/format";
import type { AssignmentData, SubmissionListItem } from "@/lib/shared/types";
import type { AiDefaults } from "@/components/assignments/Fields";
import { InstructionsTab, RubricTab, SettingsTab } from "./EditTabs";
import { SubmissionsTab } from "./SubmissionsTab";
import { useSubmissions, type ListResponse } from "./useSubmissions";

type Tab = "submissions" | "instructions" | "rubric" | "settings";

function notifyDone(title: string, items: SubmissionListItem[]) {
  try {
    if (localStorage.getItem("jg-browser-notify") !== "1" || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;
    const graded = items.filter((s) => s.status === "graded").length;
    const failed = items.filter((s) => s.status === "failed").length;
    new Notification(`Grading finished: ${title}`, { body: `${graded} graded${failed ? `, ${failed} failed` : ""}.`, icon: "/logo.svg" });
  } catch {
    /* notifications unavailable */
  }
}

export function AssignmentView({
  initialAsg,
  courseId,
  courseName,
  canGrade,
  canManage,
  archived,
  model,
  aiDefaults,
  initialList,
}: {
  initialAsg: AssignmentData;
  courseId: string;
  courseName: string;
  canGrade: boolean;
  canManage: boolean;
  archived: boolean;
  model: string;
  aiDefaults: AiDefaults;
  initialList: ListResponse;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const confirm = useConfirm();
  const [asg, setAsg] = useState(initialAsg);
  const tab = (params.get("tab") as Tab) || "submissions";
  const list = useSubmissions(asg.id, initialList, (items) => notifyDone(asg.title, items));
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropped, setDropped] = useState<File[] | null>(null);
  const items = list.data.items;
  const canEdit = canManage && !archived;
  const canUpload = canGrade && !archived;

  useEffect(() => setAsg(initialAsg), [initialAsg]);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const p = new URLSearchParams(params.toString());
      if (value === null) p.delete(key);
      else p.set(key, value);
      const qs = p.toString();
      router.replace(pathname + (qs ? "?" + qs : ""), { scroll: false });
    },
    [params, pathname, router],
  );

  const goTab = (t: Tab) => setParam("tab", t === "submissions" ? null : t);
  // Feedback pages follow the table's order for J and K.
  const onOrderChange = useCallback((ids: string[]) => saveOrder(asg.id, ids), [asg.id]);

  async function rename() {
    if (renaming === null) return;
    const t = renaming.trim();
    if (!t) return toast("Give the assignment a title.", { error: true });
    try {
      const r = await api<AssignmentData>(`/api/assignments/${asg.id}`, { method: "PATCH", body: { title: t } });
      setAsg(r);
      setRenaming(null);
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), { error: true });
    }
  }

  const graded = items.filter((s) => s.status === "graded");
  const outdated = items.filter((s) => s.outdated);
  const failed = items.filter((s) => s.status === "failed");
  const skipped = items.filter((s) => s.status === "skipped");
  const linked = items.filter((s) => s.shareToken);
  const rubricN = asg.rubricMethod === "none" ? 0 : asg.rubricRows.filter((r) => r.name.trim()).length;

  async function bulk(action: "regrade" | "retry" | "gradeAnyway", ids: string[], msg: string) {
    try {
      await api(`/api/assignments/${asg.id}/actions`, { body: { action, ids } });
      toast(msg);
      list.refresh();
    } catch (err) {
      toast(errorMessage(err), { error: true });
    }
  }

  const onDragOver = (e: React.DragEvent) => {
    if (!canUpload || tab !== "submissions" || !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    if (!dragging) setDragging(true);
  };

  return (
    <div
      className="page"
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!canUpload || tab !== "submissions" || !e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        setDropped([...e.dataTransfer.files]);
      }}
    >
      <title>{asg.title + " · Jupygrader"}</title>
      <Link href={`/courses/${courseId}`} className="back-link">
        <Icon name="arrowLeft" size={14} />
        Back to {courseName}
      </Link>
      <div className="asg-head" style={{ marginTop: 6 }}>
        <div className="asg-head__main">
          {renaming === null ? (
            <div className="title-edit">
              <h1 className="h1" title={asg.title}>
                {asg.title}
              </h1>
              {canEdit && <IconButton icon="pencil" label="Rename assignment" size={15} onClick={() => setRenaming(asg.title)} />}
            </div>
          ) : (
            <div className="title-edit">
              <Input
                value={renaming}
                autoFocus
                aria-label="Assignment title"
                onChange={(e) => setRenaming(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") rename();
                  if (e.key === "Escape") setRenaming(null);
                }}
              />
              <IconButton icon="check" label="Save (Enter)" onClick={rename} />
              <IconButton icon="x" label="Cancel (Esc)" onClick={() => setRenaming(null)} />
            </div>
          )}
          <div className="meta-line">
            <button className="meta-btn row" style={{ gap: 6 }} onClick={() => goTab("rubric")}>
              <Icon name="target" size={14} />
              {asg.points} points
            </button>
            <button className="meta-btn row" style={{ gap: 6 }} onClick={() => goTab("rubric")}>
              <Icon name="listChecks" size={14} />
              {rubricN ? `${rubricN}-part rubric` : "No rubric"}
            </button>
            <button className="meta-btn row" style={{ gap: 6 }} onClick={() => goTab("settings")}>
              <Icon name="gauge" size={14} />
              {STYLES.find((s) => s.id === asg.style)?.name ?? "Balanced"} grading
            </button>
            {archived && (
              <span className="chip chip--warn">
                <Icon name="archive" size={12} />
                Archived, read-only
              </span>
            )}
          </div>
        </div>
        {canGrade && (
          <div className="row">
            <ActionMenu
              trigger={
                <button className="btn btn--secondary">
                  <Icon name="download" size={15} />
                  Download
                  <Icon name="chevronDown" size={13} />
                </button>
              }
              items={[
                { label: "Grades", icon: "table", hint: ".csv", onClick: () => downloadUrl(`/api/assignments/${asg.id}/grades`) },
                items.length > 0 && { type: "heading", label: "Original" },
                items.length > 0 && { label: "Original files", icon: "file", hint: ".zip", onClick: () => downloadUrl(`/api/assignments/${asg.id}/download?format=original`) },
                graded.length > 0 && { type: "heading", label: `With feedback (${graded.length} graded)` },
                graded.length > 0 && { label: "Feedback files", icon: "notebook", hint: ".zip", onClick: () => downloadUrl(`/api/assignments/${asg.id}/download?format=best`) },
                graded.length > 0 && { label: "Files as HTML", icon: "globe", hint: ".zip", onClick: () => downloadUrl(`/api/assignments/${asg.id}/download?format=html`) },
                graded.length > 0 && { label: "Feedback summaries", icon: "fileText", hint: ".zip", onClick: () => downloadUrl(`/api/assignments/${asg.id}/download?format=txt`) },
                graded.length > 0 && { label: "Feedback data", icon: "braces", hint: ".zip", onClick: () => downloadUrl(`/api/assignments/${asg.id}/download?format=json`) },
              ]}
            />
            <ActionMenu
              trigger={
                <button className="btn btn--secondary btn--icon" aria-label="More actions">
                  <Icon name="more" size={16} />
                </button>
              }
              items={[
                canUpload && outdated.length > 0 && {
                  label: `Regrade with current setup (${outdated.length})`,
                  icon: "refresh",
                  onClick: () => bulk("regrade", outdated.map((s) => s.id), `${plural(outdated.length, "file")} queued for regrading`),
                },
                canUpload && failed.length > 0 && {
                  label: `Retry failed (${failed.length})`,
                  icon: "rotate",
                  onClick: () => bulk("retry", failed.map((s) => s.id), `${plural(failed.length, "file")} queued for retry`),
                },
                canUpload && skipped.length > 0 && {
                  label: `Grade skipped duplicates (${skipped.length})`,
                  icon: "copy",
                  onClick: () => bulk("gradeAnyway", skipped.map((s) => s.id), `${plural(skipped.length, "duplicate")} queued`),
                },
                linked.length > 0 && {
                  label: `Copy student links (${linked.length})`,
                  icon: "link",
                  onClick: async () => {
                    const ok = await copyText(linked.map((s) => `${s.student || s.file}\t${location.origin}/r/${s.shareToken}`).join("\n"));
                    toast(ok ? `${plural(linked.length, "student link")} copied` : "Couldn't copy");
                  },
                },
                canUpload && {
                  label: "Duplicate assignment",
                  icon: "files",
                  onClick: async () => {
                    try {
                      const r = await api<{ id: string }>(`/api/assignments/${asg.id}/duplicate`, { method: "POST" });
                      toast(`Duplicated ${asg.title}`);
                      router.push(`/courses/${courseId}/assignments/${r.id}?tab=rubric`);
                      router.refresh();
                    } catch (err) {
                      toast(errorMessage(err), { error: true });
                    }
                  },
                },
                canEdit && { type: "separator" },
                canEdit && {
                  label: "Delete assignment",
                  icon: "trash",
                  danger: true,
                  onClick: async () => {
                    const ok = await confirm({
                      title: `Delete ${asg.title}?`,
                      body: `This deletes the assignment and ${plural(items.length, "file")} with their grades and student links. It can't be undone.`,
                      cta: "Delete assignment",
                      danger: true,
                    });
                    if (!ok) return;
                    try {
                      await api(`/api/assignments/${asg.id}`, { method: "DELETE" });
                      toast(`Deleted ${asg.title}`);
                      router.push(`/courses/${courseId}`);
                      router.refresh();
                    } catch (err) {
                      toast(errorMessage(err), { error: true });
                    }
                  },
                },
              ]}
            />
          </div>
        )}
      </div>

      <div className="tabs asg-tabs" role="tablist" aria-label="Assignment">
        {(
          [
            ["submissions", "Submissions", "files"],
            ["instructions", "Instructions", "fileText"],
            ["rubric", "Rubric", "listChecks"],
            ["settings", "Settings", "sliders"],
          ] as [Tab, string, "files"][]
        ).map(([id, label, icon]) => (
          <button key={id} role="tab" className="tab" aria-selected={tab === id} onClick={() => goTab(id)}>
            <Icon name={icon} size={15} />
            {label}
            {id === "submissions" && <span className="count">{items.length}</span>}
          </button>
        ))}
      </div>

      {tab === "submissions" && (
        <>
          {!canGrade && <p className="callout" style={{ marginTop: 24 }}>You can view this assignment, but only Teachers and Graders can upload or grade files.</p>}
          <SubmissionsTab
            asg={asg}
            canGrade={canUpload}
            list={list}
            dragging={dragging}
            setDragging={setDragging}
            droppedFiles={dropped}
            clearDropped={() => setDropped(null)}
            onOrderChange={onOrderChange}
          />
        </>
      )}
      {tab === "instructions" && <InstructionsTab asg={asg} canEdit={canEdit} onSaved={(a) => (setAsg(a), router.refresh())} />}
      {tab === "rubric" && <RubricTab asg={asg} canEdit={canEdit} onSaved={(a) => (setAsg(a), list.refresh(), router.refresh())} />}
      {tab === "settings" && <SettingsTab asg={asg} canEdit={canEdit} model={model} aiDefaults={aiDefaults} onSaved={(a) => (setAsg(a), list.refresh())} />}

      {dragging && items.length > 0 && tab === "submissions" && <div className="drop-overlay">Release to upload to {asg.title}</div>}
    </div>
  );
}
