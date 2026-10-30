"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Mascot } from "@/components/ui/Mascot";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/client/api";
import type { CanvasStatus } from "@/lib/shared/types";

type CanvasCourseOption = { id: string; name: string; code: string; term: string };

/** Course settings: link the course to a Canvas course, so its assignments can be linked too. */
export function CanvasCourseLink({
  courseId,
  status,
  linked,
  canEdit,
}: {
  courseId: string;
  status: CanvasStatus;
  linked: { id: string; name: string } | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [options, setOptions] = useState<CanvasCourseOption[] | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "load" | "save">("");

  async function load() {
    setBusy("load");
    try {
      const r = await api<{ courses: CanvasCourseOption[] }>("/api/canvas/courses");
      setOptions(r.courses);
      setChoice(r.courses.some((c) => c.id === linked?.id) ? linked!.id : null);
      if (!r.courses.length) toast("Canvas lists no courses where you're a teacher or TA.", { error: true });
    } catch (err) {
      toast(errorMessage(err), { error: true });
    } finally {
      setBusy("");
    }
  }

  async function save(canvasCourseId: string | null) {
    if (linked && canvasCourseId !== linked.id) {
      const ok = await confirm({
        title: canvasCourseId ? "Link to a different Canvas course?" : `Unlink from ${linked.name}?`,
        body: "Assignments in this course lose their links to Canvas assignments. Imported files and grades stay.",
        cta: canvasCourseId ? "Change course" : "Unlink",
      });
      if (!ok) return;
    }
    setBusy("save");
    try {
      const r = await api<{ id: string | null; name: string | null }>(`/api/courses/${courseId}/canvas`, { method: "PUT", body: { canvasCourseId } });
      toast(r.id ? `Linked to ${r.name}` : "Unlinked from Canvas");
      setOptions(null);
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), { error: true });
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="settings-section" style={{ marginTop: 24 }}>
      <div className="canvas-head">
        <Mascot pose="connect" size={64} />
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="h2">Canvas</h2>
          <p className="muted">Link this course to its Canvas course. Then each assignment can import students&apos; submissions and post grades back.</p>
        </div>
      </div>
      {linked && (
        <div className="canvas-connected">
          <Icon name="checkCircle" size={16} />
          <span className="grow">
            Linked to{" "}
            <a href={`${status.url}/courses/${linked.id}`} target="_blank" rel="noreferrer">
              {linked.name}
            </a>
          </span>
          {canEdit && status.connected && !options && (
            <Button variant="ghost" size="sm" onClick={load} loading={busy === "load"}>
              Change
            </Button>
          )}
          {canEdit && (
            <Button variant="secondary" size="sm" onClick={() => save(null)} loading={busy === "save" && !options}>
              Unlink
            </Button>
          )}
        </div>
      )}
      {!status.connected ? (
        <p className="callout">
          <Icon name="info" size={15} />
          <span>
            <Link href="/app/account#canvas">Connect your Canvas account</Link> to {linked ? "change the link" : "link this course"}.
          </span>
        </p>
      ) : !canEdit ? null : options ? (
        <div className="canvas-pick">
          <Select
            value={choice}
            onChange={setChoice}
            ariaLabel="Canvas course"
            placeholder="Choose a Canvas course"
            options={options.map((c) => ({ value: c.id, label: [c.name, c.term].filter(Boolean).join(" · ") }))}
          />
          <Button variant="ghost" onClick={() => setOptions(null)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => choice && save(choice)} disabled={!choice || choice === linked?.id} loading={busy === "save"}>
            Link course
          </Button>
        </div>
      ) : (
        !linked && (
          <div>
            <Button variant="secondary" icon="link" onClick={load} loading={busy === "load"}>
              Link to a Canvas course
            </Button>
          </div>
        )
      )}
    </section>
  );
}
