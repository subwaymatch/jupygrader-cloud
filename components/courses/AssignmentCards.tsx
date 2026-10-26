"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { ActionMenu } from "@/components/ui/Menu";
import { useConfirm } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/client/api";
import type { AssignmentCard } from "@/lib/server/courses";

export function AssignmentCards({
  courseId,
  items,
  canManage,
  canGrade,
}: {
  courseId: string;
  items: AssignmentCard[];
  canManage: boolean;
  canGrade: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();

  async function move(i: number, d: -1 | 1) {
    const ids = items.map((a) => a.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      await api(`/api/courses/${courseId}/assignments/reorder`, { body: { ids } });
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), { error: true });
    }
  }

  return (
    <div className="asg-list">
      {items.map((a, i) => {
        const pct = a.total ? Math.round((a.graded / a.total) * 100) : 0;
        return (
          <div key={a.id} className="asg-card" style={{ cursor: "pointer" }} onClick={() => router.push(`/courses/${courseId}/assignments/${a.id}`)}>
            <div className="asg-card__top">
              <div className="grow">
                <Link
                  href={`/courses/${courseId}/assignments/${a.id}`}
                  className="asg-card__title"
                  style={{ color: "inherit" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {a.title}
                </Link>
                <div className="asg-card__meta">
                  {a.rubricItems ? `${a.rubricItems} rubric item${a.rubricItems === 1 ? "" : "s"}` : "No rubric"}, {a.points} points
                </div>
              </div>
              {(canGrade || canManage) && (
                <span onClick={(e) => e.stopPropagation()}>
                  <ActionMenu
                    trigger={
                      <button className="icon-btn" aria-label={`More actions for ${a.title}`}>
                        <Icon name="more" size={16} />
                      </button>
                    }
                    items={[
                      { label: "Open", icon: "arrowRight", onClick: () => router.push(`/courses/${courseId}/assignments/${a.id}`) },
                      canGrade && {
                        label: "Duplicate",
                        icon: "copy",
                        onClick: async () => {
                          try {
                            const r = await api<{ id: string }>(`/api/assignments/${a.id}/duplicate`, { method: "POST" });
                            toast(`Duplicated ${a.title}`);
                            router.push(`/courses/${courseId}/assignments/${r.id}?tab=rubric`);
                            router.refresh();
                          } catch (err) {
                            toast(errorMessage(err), { error: true });
                          }
                        },
                      },
                      canManage && i > 0 && { label: "Move up", icon: "chevronUp", onClick: () => move(i, -1) },
                      canManage && i < items.length - 1 && { label: "Move down", icon: "chevronDown", onClick: () => move(i, 1) },
                      canManage && { type: "separator" as const },
                      canManage && {
                        label: "Delete assignment",
                        icon: "trash",
                        danger: true,
                        onClick: async () => {
                          const ok = await confirm({
                            title: `Delete ${a.title}?`,
                            body: `This deletes the assignment and all ${a.total} of its files, grades and student links. It can't be undone.`,
                            cta: "Delete assignment",
                            danger: true,
                          });
                          if (!ok) return;
                          try {
                            await api(`/api/assignments/${a.id}`, { method: "DELETE" });
                            toast(`Deleted ${a.title}`);
                            router.refresh();
                          } catch (err) {
                            toast(errorMessage(err), { error: true });
                          }
                        },
                      },
                    ]}
                  />
                </span>
              )}
            </div>
            <div className="asg-card__bottom">
              <span>
                {a.total ? `${a.graded} of ${a.total} graded` : "No submissions yet"}
                {a.inProgress > 0 && <span className="muted">, {a.inProgress} in progress</span>}
              </span>
              <div className="asg-card__flags">
                {a.needsReview > 0 && (
                  <span className="flag flag--warn">
                    <Icon name="flag" size={13} />
                    {a.needsReview} need{a.needsReview === 1 ? "s" : ""} review
                  </span>
                )}
                {a.failed > 0 && (
                  <span className="flag flag--danger">
                    <Icon name="alertCircle" size={13} />
                    {a.failed} failed
                  </span>
                )}
              </div>
            </div>
            {a.total > 0 && (
              <div className="progress" aria-hidden>
                <span style={{ width: pct + "%" }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
