"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { cellDomId, NotebookView } from "@/components/notebook/NotebookView";
import { Button, IconButton } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/Dialog";
import { Input, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ActionMenu, type MenuEntry } from "@/components/ui/Menu";
import { toast } from "@/components/ui/Toast";
import { api, copyText, downloadUrl, errorMessage } from "@/lib/client/api";
import { STATUS, STYLES } from "@/lib/shared/constants";
import { downloadFormats, labelFor } from "@/lib/shared/document";
import { fmtAt, fmtScore, fmtTokens, fmtUsd } from "@/lib/shared/format";
import type { SubmissionDetail } from "@/lib/shared/types";
import { needsReview, reviewReason } from "./SubmissionsTab";

type CritDraft = { index: number; earned: string; comment: string; reason: string };

function flash(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("nb-cell--flash");
  setTimeout(() => el.classList.remove("nb-cell--flash"), 1400);
}

export function FeedbackDrawer({
  id,
  order,
  onNavigate,
  onClose,
  onChanged,
  canGrade,
  version,
  model,
}: {
  id: string | null;
  order: string[];
  onNavigate: (id: string) => void;
  onClose: () => void;
  onChanged: () => void;
  canGrade: boolean;
  version: number;
  model: string;
}) {
  const confirm = useConfirm();
  const [d, setD] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [split, setSplit] = useState(true);
  const [mobileTab, setMobileTab] = useState<"feedback" | "file">("feedback");
  const [editGrade, setEditGrade] = useState<string | null>(null);
  const [crit, setCrit] = useState<CritDraft | null>(null);
  const [student, setStudent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setSplit(localStorage.getItem("jg-split") !== "0");
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async (sid: string) => {
    setLoading(true);
    try {
      setD(await api<SubmissionDetail>(`/api/submissions/${sid}`));
    } catch (err) {
      toast(errorMessage(err), { error: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setEditGrade(null);
    setCrit(null);
    setStudent(null);
    setMobileTab("feedback");
    if (id) load(id);
    else setD(null);
    bodyRef.current?.scrollTo(0, 0);
  }, [id, load]);

  // Refresh while the file is still grading.
  useEffect(() => {
    if (!id || !d || (d.status !== "queued" && d.status !== "grading")) return;
    const t = setTimeout(() => load(id), 3000);
    return () => clearTimeout(t);
  }, [id, d, load]);

  const idx = id ? order.indexOf(id) : -1;
  const prev = idx > 0 ? order[idx - 1] : null;
  const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;

  async function patch(body: Record<string, unknown>, ok?: string) {
    if (!d) return;
    setBusy(true);
    try {
      setD(await api<SubmissionDetail>(`/api/submissions/${d.id}`, { method: "PATCH", body }));
      if (ok) toast(ok);
      onChanged();
      return true;
    } catch (err) {
      toast(errorMessage(err), { error: true });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function toggleReviewed() {
    if (!d || d.status !== "graded" || !canGrade) return;
    const ok = await patch({ action: "review", reviewed: !d.reviewed }, d.reviewed ? "Marked as not reviewed" : "Marked reviewed");
    if (ok && !d.reviewed && next) onNavigate(next);
  }

  async function act(action: "regrade" | "retry" | "gradeAnyway" | "remove") {
    if (!d) return;
    try {
      await api(`/api/assignments/${d.assignmentId}/actions`, { body: { action, ids: [d.id] } });
      toast(action === "remove" ? "Removed" : "Queued for grading");
      onChanged();
      if (action === "remove") onClose();
      else load(d.id);
    } catch (err) {
      toast(errorMessage(err), { error: true });
    }
  }

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" && next) (e.preventDefault(), onNavigate(next));
      else if (e.key === "k" && prev) (e.preventDefault(), onNavigate(prev));
      else if (e.key === "r") (e.preventDefault(), toggleReviewed());
      else if (e.key === "e" && d?.status === "graded" && canGrade) (e.preventDefault(), setEditGrade(String(d.score ?? "")));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toggleSplit = () => {
    setSplit((v) => {
      try {
        localStorage.setItem("jg-split", v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  };

  const showRef = (ref: string) => {
    if (window.matchMedia("(max-width: 720px)").matches) {
      setMobileTab("file");
      setTimeout(() => flash(cellDomId(ref, "mfile")), 60);
    } else {
      if (!split) toggleSplit();
      setTimeout(() => flash(cellDomId(ref, "pane")), 60);
    }
  };

  const graded = d?.status === "graded" && d.result;
  const r = d?.result;
  const critSum = r ? Math.round((r.criteria.reduce((a, c) => a + c.earned, 0) * (d!.points / (r.criteria.reduce((a, c) => a + c.pts, 0) || 1))) * 2) / 2 : 0;
  const shareUrl = d?.shareToken ? `${typeof location !== "undefined" ? location.origin : ""}/r/${d.shareToken}` : "";
  const flagged = d ? needsReview(d) : false;
  const g = d?.graded;
  const outdated = !!(g && (g.rubricVersion !== version || g.model !== model));

  const dlItems: MenuEntry[] = d
    ? [
        ...(graded
          ? [
              { type: "heading" as const, label: "With feedback" },
              ...downloadFormats(d.file, d.kind).map((f) => ({
                label: f.label,
                hint: f.ext,
                icon: (f.id === "ipynb" ? "notebook" : f.id === "json" ? "braces" : f.id === "txt" ? "fileText" : f.id === "src" ? "code" : "globe") as never,
                onClick: () => downloadUrl(`/api/submissions/${d.id}/download?format=${f.id}`),
              })),
            ]
          : []),
        { type: "heading" as const, label: "Original" },
        { label: "Original file", icon: "file", onClick: () => downloadUrl(`/api/submissions/${d.id}/download?format=original`) },
      ]
    : [];

  const file = d && (
    <NotebookView cells={d.cells} scope="pane" />
  );

  return (
    <Dialog.Root open={!!id} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="backdrop" />
        <Dialog.Popup className={"sheet fb-sheet" + (split ? " fb-sheet--split" : "")} aria-label="Feedback" initialFocus={bodyRef}>
          <Dialog.Title className="sr-only">{d?.file ?? "Feedback"}</Dialog.Title>
          {split && <section className="fb-pane" aria-label="Submitted file">{file}</section>}
          <div className={"fb-side" + (mobileTab === "file" ? " fb-side--file" : "")}>
            <div className="fb-head">
              <span className="fb-head__file" title={d?.file}>
                {d?.file ?? "Loading…"}
              </span>
              <div className="fb-head__nav">
                <Button variant="secondary" size="sm" onClick={toggleSplit} className="split-toggle" style={{ marginRight: 6 }}>
                  {split ? "Hide file" : "Show file"}
                </Button>
                {idx >= 0 && (
                  <span className="nowrap" style={{ marginRight: 4 }}>
                    {idx + 1} of {order.length}
                  </span>
                )}
                <IconButton icon="chevronUp" label="Previous file (K)" disabled={!prev} onClick={() => prev && onNavigate(prev)} />
                <IconButton icon="chevronDown" label="Next file (J)" disabled={!next} onClick={() => next && onNavigate(next)} />
                <IconButton icon="x" label="Close (Esc)" onClick={onClose} />
              </div>
            </div>
            <div className="fb-mobile-tabs">
              <div className="pills pills--fill" role="tablist">
                <button role="tab" className="pill" aria-selected={mobileTab === "feedback"} onClick={() => setMobileTab("feedback")}>
                  Feedback
                </button>
                <button role="tab" className="pill" aria-selected={mobileTab === "file"} onClick={() => setMobileTab("file")}>
                  File
                </button>
              </div>
            </div>
            <div className="fb-mobile-file">{d && <NotebookView cells={d.cells} scope="mfile" />}</div>
            <div className="fb-body" ref={bodyRef} aria-busy={loading} tabIndex={-1} style={{ outline: "none" }}>
              {!d ? (
                <div className="stack">
                  <div className="skeleton" style={{ height: 44, width: 120 }} />
                  <div className="skeleton" style={{ height: 16 }} />
                  <div className="skeleton" style={{ height: 16, width: "70%" }} />
                </div>
              ) : !graded ? (
                <NotGraded d={d} canGrade={canGrade} act={act} />
              ) : (
                <>
                  <div className="stack" style={{ gap: 12 }}>
                    <div className="fb-score">
                      {editGrade === null ? (
                        <>
                          <span className="fb-score__n">{fmtScore(d.score)}</span>
                          <span className="fb-score__of">/ {d.points}</span>
                          {canGrade && (
                            <Button variant="link" icon="pencil" onClick={() => setEditGrade(String(d.score ?? ""))} style={{ marginLeft: 8 }}>
                              Edit grade
                            </Button>
                          )}
                        </>
                      ) : (
                        <span className="row">
                          <Input
                            type="number"
                            step={0.5}
                            min={0}
                            max={d.points}
                            value={editGrade}
                            autoFocus
                            style={{ width: 110, fontSize: 18, height: 42 }}
                            onChange={(e) => setEditGrade(e.target.value)}
                            onKeyDown={async (e) => {
                              if (e.key === "Enter" && (await patch({ action: "override", score: +editGrade }, "Grade changed"))) setEditGrade(null);
                              if (e.key === "Escape") (e.stopPropagation(), setEditGrade(null));
                            }}
                          />
                          <span className="fb-score__of">/ {d.points}</span>
                          <Button variant="primary" size="sm" loading={busy} onClick={async () => (await patch({ action: "override", score: +editGrade }, "Grade changed")) && setEditGrade(null)}>
                            Save
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditGrade(null)}>
                            Cancel
                          </Button>
                        </span>
                      )}
                    </div>
                    {d.overridden && (
                      <span className="muted">
                        Changed by a grader. The AI&apos;s score was {fmtScore(d.aiScore)}.
                        {critSum !== d.score && (
                          <>
                            {" "}
                            The rubric lines add up to {critSum}.{" "}
                            {canGrade && (
                              <Button variant="link" onClick={() => patch({ action: "override", score: null }, "Total reset to the rubric sum")}>
                                Use {critSum}
                              </Button>
                            )}
                          </>
                        )}
                      </span>
                    )}
                    {flagged && (
                      <div className="callout callout--warn">
                        <Icon name="flag" size={15} />
                        <span>
                          <span className="callout__title">Needs review</span>
                          <br />
                          {reviewReason(d)}
                        </span>
                      </div>
                    )}
                    {d.reviewed && (
                      <div className="callout">
                        <Icon name="checkCircle" size={15} style={{ color: "var(--c-success-text)" }} />
                        <span>Reviewed by {d.reviewedBy ?? "a grader"}</span>
                      </div>
                    )}
                    <p style={{ lineHeight: 1.6 }}>{r!.summary}</p>
                    {g && (
                      <div className="stack" style={{ gap: 8 }}>
                        <span className="fb-section__title">Graded with</span>
                        <div className="row row--wrap" style={{ gap: 6 }}>
                          <span className="chip" title={`Rubric version ${g.rubricVersion}`}>
                            <Icon name="listChecks" size={13} />
                            {g.rubricVersion === version ? "Current rubric" : `Earlier rubric (v${g.rubricVersion})`}
                          </span>
                          <span className="chip">
                            <Icon name="gauge" size={13} />
                            {STYLES.find((s) => s.id === g.style)?.name ?? g.style}
                          </span>
                          <span className="chip">
                            <Icon name="bot" size={13} />
                            {g.model}
                          </span>
                        </div>
                        {(outdated || d.outdated) && (
                          <div className="callout callout--warn">
                            <Icon name="info" size={15} />
                            <span className="stack" style={{ gap: 6 }}>
                              <span>
                                {g.rubricVersion !== version
                                  ? "Graded with an earlier rubric. Regrade to use the current one."
                                  : "Graded with earlier settings. Regrade to use the current setup."}
                              </span>
                              {canGrade && (
                                <span>
                                  <Button variant="outline" size="sm" icon="refresh" onClick={() => act("regrade")}>
                                    Regrade
                                  </Button>
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <section className="fb-section">
                    <h3 className="fb-section__title">Rubric</h3>
                    <div>
                      {r!.criteria.map((c, i) => (
                        <div className="crit" key={i}>
                          <div className="crit__top">
                            <span className="crit__name">{c.name}</span>
                            <span className="crit__score">
                              {c.earned !== c.aiEarned && (
                                <span className="crit__ai" title="The AI's score">
                                  {c.aiEarned}
                                </span>
                              )}
                              <span>
                                {c.earned} / {c.pts}
                              </span>
                              {canGrade && (
                                <IconButton
                                  icon="pencil"
                                  label="Edit this score"
                                  size={14}
                                  onClick={() => setCrit({ index: i, earned: String(c.earned), comment: c.comment, reason: "" })}
                                />
                              )}
                            </span>
                          </div>
                          {crit?.index === i ? (
                            <div className="crit-edit">
                              <div className="row row--wrap">
                                <span className="affix" style={{ width: 150 }}>
                                  <input
                                    type="number"
                                    step={0.5}
                                    min={0}
                                    max={c.pts}
                                    value={crit.earned}
                                    autoFocus
                                    aria-label="Points"
                                    onChange={(e) => setCrit({ ...crit, earned: e.target.value })}
                                  />
                                  <span>/ {c.pts}</span>
                                </span>
                                <span className="muted">The AI gave {c.aiEarned}</span>
                              </div>
                              <Textarea rows={3} value={crit.comment} aria-label="Comment" onChange={(e) => setCrit({ ...crit, comment: e.target.value })} />
                              <Input value={crit.reason} placeholder="Reason for the change (saved in the history)" onChange={(e) => setCrit({ ...crit, reason: e.target.value })} />
                              <div className="row" style={{ justifyContent: "flex-end" }}>
                                <Button variant="ghost" size="sm" onClick={() => setCrit(null)}>
                                  Cancel
                                </Button>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  loading={busy}
                                  onClick={async () => {
                                    if (await patch({ action: "criterion", index: i, earned: +crit.earned, comment: crit.comment, reason: crit.reason }, "Score changed")) setCrit(null);
                                  }}
                                >
                                  Save
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {c.comment && <span className="crit__comment">{c.comment}</span>}
                              {c.refs.length > 0 && (
                                <div className="crit__chips">
                                  <span>Based on</span>
                                  {c.refs.map((ref) => (
                                    <button key={ref} className="chip chip--blue chip--mono" title="Show this in the file" onClick={() => showRef(ref)}>
                                      {labelFor(ref, d.refLabels)}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>

                  {r!.comments.length > 0 && (
                    <section className="fb-section">
                      <h3 className="fb-section__title">Inline comments</h3>
                      <div>
                        {r!.comments.map((c, i) => (
                          <div className="inline-cmt" key={i}>
                            <div className="row" style={{ justifyContent: "space-between" }}>
                              <button className="chip chip--blue chip--mono" onClick={() => showRef(c.ref)} title="Show this in the file">
                                {labelFor(c.ref, d.refLabels)}
                              </button>
                            </div>
                            <span className="crit__comment">{c.comment}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="fb-section">
                    <h3 className="fb-section__title">Student</h3>
                    {student === null ? (
                      <div className="row row--wrap">
                        <span style={{ fontWeight: 500 }}>{d.student || "Unknown"}</span>
                        <span className="muted">{d.studentSet ? "Set by a grader" : "Read from the file name"}</span>
                        {canGrade && (
                          <Button variant="link" onClick={() => setStudent(d.student)}>
                            Change
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="row">
                        <Input
                          value={student}
                          autoFocus
                          placeholder="Student name"
                          aria-label="Student name"
                          onChange={(e) => setStudent(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter" && (await patch({ action: "student", name: student }))) setStudent(null);
                            if (e.key === "Escape") (e.stopPropagation(), setStudent(null));
                          }}
                        />
                        <Button variant="primary" size="sm" onClick={async () => (await patch({ action: "student", name: student })) && setStudent(null)}>
                          Save
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setStudent(null)}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </section>

                  <section className="fb-section">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <h3 className="fb-section__title">Student link</h3>
                      {canGrade && (
                        <Button variant="link" onClick={() => patch({ action: "share", on: !d.shareOn }, d.shareOn ? "Student link turned off" : "Student link turned on")}>
                          {d.shareOn ? "Turn off" : "Turn on"}
                        </Button>
                      )}
                    </div>
                    {d.shareOn ? (
                      <>
                        <div className="share-row">
                          <Input value={shareUrl} readOnly mono aria-label="Student link" onFocus={(e) => e.currentTarget.select()} />
                          <Button variant="secondary" icon="copy" onClick={async () => toast((await copyText(shareUrl)) ? "Student link copied" : "Couldn't copy")}>
                            Copy
                          </Button>
                          <a className="btn btn--secondary btn--icon" href={`${shareUrl}?preview=1`} target="_blank" rel="noopener" title="See what the student sees" aria-label="Open student view">
                            <Icon name="externalLink" size={15} />
                          </a>
                        </div>
                        <span className="field__hint">
                          Anyone with this link can see the score and feedback without signing in. It always shows the latest grade.{" "}
                          {canGrade && (
                            <>
                              <Button variant="link" onClick={() => patch({ action: "resetLink" }, "New student link made. The old one no longer works.")}>
                                Make a new link
                              </Button>{" "}
                              to stop the old one working.
                            </>
                          )}
                        </span>
                      </>
                    ) : (
                      <span className="field__hint">The link is turned off. Anyone who opens it sees that it is no longer active.</span>
                    )}
                  </section>

                  {d.usage && (
                    <section className="fb-section">
                      <h3 className="fb-section__title">AI usage</h3>
                      <span className="muted">
                        {fmtTokens(d.usage.input)} input tokens ({fmtTokens(d.usage.cached)} cached), {fmtTokens(d.usage.output)} output
                        {d.usage.reasoning ? ` (${fmtTokens(d.usage.reasoning)} reasoning)` : ""}. About {fmtUsd(d.costUsd)}, estimated.
                      </span>
                    </section>
                  )}

                  <History d={d} />
                </>
              )}
            </div>
            <div className="fb-foot">
              <div className="fb-foot__row">
                <div className="act-group" role="group">
                  <ActionMenu
                    side="top"
                    align="start"
                    trigger={
                      <button className="act" disabled={!d}>
                        <Icon name="download" size={15} />
                        Download
                        <Icon name="chevronDown" size={13} />
                      </button>
                    }
                    items={dlItems}
                  />
                  <span className="sep" />
                  <ActionMenu
                    side="top"
                    align="start"
                    trigger={
                      <button className="act act--icon" aria-label="More actions" disabled={!d}>
                        <Icon name="more" size={15} />
                      </button>
                    }
                    items={[
                      canGrade && d && d.status !== "queued" && d.status !== "grading" && { label: "Regrade", icon: "refresh", onClick: () => act("regrade") },
                      d && { label: "Copy SHA-256", icon: "hash", onClick: async () => toast((await copyText(d.sha256)) ? "SHA-256 copied" : "Couldn't copy") },
                      canGrade && d && d.status !== "grading" && { type: "separator" as const },
                      canGrade &&
                        d &&
                        d.status !== "grading" && {
                          label: "Remove submission",
                          icon: "trash",
                          danger: true,
                          onClick: async () => {
                            if (await confirm({ title: `Remove ${d.file}?`, body: "The file, its grade, feedback and student link are deleted.", cta: "Remove", danger: true })) act("remove");
                          },
                        },
                    ]}
                  />
                </div>
                {graded && canGrade && (
                  <Button variant={d!.reviewed ? "secondary" : "primary"} icon={d!.reviewed ? "rotate" : "checkCircle"} onClick={toggleReviewed} loading={busy}>
                    {d!.reviewed ? "Mark not reviewed" : "Mark reviewed"}
                  </Button>
                )}
              </div>
              <span className="fb-foot__hint">
                <Icon name="info" size={13} />
                J and K move between files. R marks reviewed. E edits the total. Esc closes.
              </span>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NotGraded({ d, canGrade, act }: { d: SubmissionDetail; canGrade: boolean; act: (a: "regrade" | "retry" | "gradeAnyway") => void }) {
  const st = STATUS[d.status];
  return (
    <div className="stack" style={{ gap: 16 }}>
      <span className="status" style={{ fontSize: 16 }}>
        {d.status === "grading" ? <Icon name="loader" size={14} className="spin" style={{ color: st.color }} /> : <span className="dot" style={{ background: st.color }} />}
        {st.label}
      </span>
      {d.note && <div className={"callout" + (d.status === "failed" ? " callout--danger" : "")}>{d.note}</div>}
      {d.status === "queued" && <p className="muted">This file is waiting for a grading slot. It usually takes under a minute per file.</p>}
      {d.status === "grading" && <p className="muted">The AI is grading this file. This page updates when it finishes.</p>}
      {canGrade && d.status === "failed" && (
        <div>
          <Button variant="primary" icon="rotate" onClick={() => act("retry")}>
            Retry
          </Button>
        </div>
      )}
      {canGrade && d.status === "skipped" && (
        <div>
          <Button variant="primary" icon="play" onClick={() => act("gradeAnyway")}>
            Grade anyway
          </Button>
        </div>
      )}
      {canGrade && d.status === "cancelled" && (
        <div>
          <Button variant="primary" icon="refresh" onClick={() => act("regrade")}>
            Grade this file
          </Button>
        </div>
      )}
      <History d={d} />
    </div>
  );
}

function History({ d }: { d: SubmissionDetail }) {
  if (!d.history.length) return null;
  return (
    <section className="fb-section">
      <h3 className="fb-section__title">History</h3>
      <div className="stack" style={{ gap: 10 }}>
        {[...d.history].reverse().map((h, i) => (
          <div className="history-item" key={i}>
            <span>{h.text}</span>
            <span className="muted">
              {h.who ? h.who + ", " : ""}
              {fmtAt(h.at)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
