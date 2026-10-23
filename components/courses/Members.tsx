"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { ActionMenu } from "@/components/ui/Menu";
import { useConfirm } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import { api, copyText, errorMessage } from "@/lib/client/api";
import { ROLE_INFO } from "@/lib/shared/constants";
import { fmtDay, initials } from "@/lib/shared/format";
import type { MemberView } from "@/lib/server/courses";
import { Pager, pageSlice } from "@/components/ui/Pager";

export function Members({
  courseId,
  courseName,
  members,
  canManage,
  showInviteTile,
}: {
  courseId: string;
  courseName: string;
  members: MemberView[];
  canManage: boolean;
  showInviteTile: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const pg = pageSlice(members, page, 25);

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast(ok);
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), { error: true });
    }
  }

  return (
    <div>
      <div className="list">
        {pg.rows.map((m) => (
          <div className="member-row" key={m.kind + m.id}>
            <span className={"avatar" + (m.kind === "invite" ? " avatar--muted" : "")}>{initials(m.name)}</span>
            <div className="member-row__main">
              <span className="truncate" style={{ fontWeight: 500 }}>
                {m.kind === "member" ? m.name + (m.isMe ? " (you)" : "") : m.email}
              </span>
              <span className="muted truncate">
                {m.kind === "member" ? m.email : m.expired ? `Invitation expired` : `Invited ${fmtDay(m.sentAt)}, has not joined yet`}
              </span>
            </div>
            <div className="member-row__side">
              {m.kind === "invite" && (
                <span className="pending-label">
                  <Icon name="mail" size={13} />
                  {m.expired ? "Expired" : "Invite pending"}
                </span>
              )}
              <span className="chip" title={ROLE_INFO[m.role]}>
                {m.role}
              </span>
              {canManage && !m.isMe ? (
                <ActionMenu
                  trigger={
                    <button className="icon-btn" aria-label={`Actions for ${m.name}`}>
                      <Icon name="more" size={16} />
                    </button>
                  }
                  items={
                    m.kind === "member"
                      ? [
                          {
                            label: m.role === "Teacher" ? "Change to Grader" : "Change to Teacher",
                            icon: "userCog",
                            onClick: () =>
                              run(
                                () => api(`/api/courses/${courseId}/members/${m.id}`, { method: "PATCH", body: { role: m.role === "Teacher" ? "Grader" : "Teacher" } }),
                                `${m.name} is now a ${m.role === "Teacher" ? "Grader" : "Teacher"}`,
                              ),
                          },
                          { type: "separator" },
                          {
                            label: "Remove from course",
                            icon: "trash",
                            danger: true,
                            onClick: async () => {
                              if (
                                await confirm({
                                  title: `Remove ${m.name}?`,
                                  body: `They lose access to ${courseName}. Grades and feedback they worked on stay as they are.`,
                                  cta: "Remove",
                                  danger: true,
                                })
                              )
                                run(() => api(`/api/courses/${courseId}/members/${m.id}`, { method: "DELETE" }), `Removed ${m.name}`);
                            },
                          },
                        ]
                      : [
                          {
                            label: "Resend invitation",
                            icon: "mail",
                            onClick: () =>
                              run(async () => {
                                const r = await api<{ link: string; emailed: boolean }>(`/api/invitations/${m.id}/resend`, { method: "POST" });
                                if (!r.emailed) await copyText(r.link);
                              }, "Invitation sent again"),
                          },
                          {
                            label: "Copy a new invite link",
                            icon: "link",
                            onClick: () =>
                              run(async () => {
                                const r = await api<{ link: string }>(`/api/invitations/${m.id}/resend`, { method: "POST" });
                                await copyText(r.link);
                              }, "Invite link copied. The old link no longer works."),
                          },
                          { type: "separator" },
                          {
                            label: "Revoke invitation",
                            icon: "ban",
                            danger: true,
                            onClick: () => run(() => api(`/api/invitations/${m.id}`, { method: "DELETE" }), "Invitation revoked"),
                          },
                        ]
                  }
                />
              ) : (
                <span style={{ width: 28 }} />
              )}
            </div>
          </div>
        ))}
        {!members.length && <p className="empty">No members yet.</p>}
      </div>
      <Pager page={pg.page} pages={pg.pages} total={members.length} from={pg.from} to={pg.to} onPage={setPage} />
      {showInviteTile && (
        <div className="tile-add" style={{ marginTop: 16 }}>
          <Link href={`/courses/${courseId}/invite`} className="btn btn--pill">
            <Icon name="userPlus" size={15} />
            Invite people
          </Link>
        </div>
      )}
    </div>
  );
}
