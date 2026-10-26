"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { InvitePanel } from "@/components/people/InvitePanel";
import { Icon } from "@/components/ui/Icon";
import { ActionMenu } from "@/components/ui/Menu";
import { Pager, pageSlice } from "@/components/ui/Pager";
import { toast } from "@/components/ui/Toast";
import { api, copyText, errorMessage } from "@/lib/client/api";
import { fmtDay } from "@/lib/shared/format";
import type { InvitationRow } from "@/lib/server/admin";

const STATUS_STYLE: Record<InvitationRow["status"], [string, string]> = {
  pending: ["Pending", "var(--c-warning)"],
  accepted: ["Accepted", "var(--c-success)"],
  expired: ["Expired", "var(--c-muted-dot)"],
  revoked: ["Revoked", "var(--c-muted-dot)"],
};

export function InvitationsAdmin({ invitations, courses }: { invitations: InvitationRow[]; courses: { id: string; name: string }[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | InvitationRow["status"]>("all");
  const [page, setPage] = useState(1);
  const rows = useMemo(() => invitations.filter((i) => filter === "all" || i.status === filter), [invitations, filter]);
  const pg = pageSlice(rows, page, 25);

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
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1 className="h1">Invitations</h1>
          <p className="lede">
            Invite people to any course by email. They join with the role you choose when they accept. People who already have an account are
            added right away.
          </p>
        </div>
      </div>
      {courses.length ? <InvitePanel courses={courses} /> : <p className="callout">Create a course before inviting people.</p>}

      <section className="section" style={{ marginTop: 44 }}>
        <div className="section-head">
          <h2 className="h2">
            Sent <span className="count">{invitations.length}</span>
          </h2>
          <div className="pills pills--plain" role="tablist">
            {(["all", "pending", "accepted", "expired", "revoked"] as const).map((f) => (
              <button key={f} role="tab" className="pill" aria-selected={filter === f} onClick={() => (setFilter(f), setPage(1))}>
                {f === "all" ? "All" : STATUS_STYLE[f][0]}
                <span className="count">{f === "all" ? invitations.length : invitations.filter((i) => i.status === f).length}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="inv-row inv-row--head">
            <span className="th">Email</span>
            <span className="th">Course</span>
            <span className="th">Role</span>
            <span className="th">Status</span>
            <span className="th">Sent</span>
            <span />
          </div>
          {pg.rows.map((i) => (
            <div className="inv-row" key={i.id}>
              <span className="truncate" title={i.email}>
                {i.email}
              </span>
              <span className="truncate inv-course">{i.course}</span>
              <span className="inv-role">{i.role}</span>
              <span className="status inv-meta">
                <span className="dot" style={{ background: STATUS_STYLE[i.status][1] }} />
                {STATUS_STYLE[i.status][0]}
                <span className="muted" style={{ marginLeft: 6 }} hidden>
                  {fmtDay(i.sentAt)}
                </span>
              </span>
              <span className="muted inv-sent">{fmtDay(i.sentAt)}</span>
              <span className="inv-acts" style={{ justifySelf: "end" }}>
                {i.status !== "accepted" && (
                  <ActionMenu
                    trigger={
                      <button className="icon-btn" aria-label={`Actions for ${i.email}`}>
                        <Icon name="more" size={16} />
                      </button>
                    }
                    items={[
                      { label: "Resend", icon: "mail", onClick: () => run(() => api(`/api/invitations/${i.id}/resend`, { method: "POST" }), `Invitation sent to ${i.email}`) },
                      {
                        label: "Copy a new invite link",
                        icon: "link",
                        onClick: () =>
                          run(async () => {
                            const r = await api<{ link: string }>(`/api/invitations/${i.id}/resend`, { method: "POST" });
                            await copyText(r.link);
                          }, "Invite link copied. Earlier links no longer work."),
                      },
                      { type: "separator" },
                      {
                        label: i.status === "pending" ? "Revoke" : "Remove",
                        icon: i.status === "pending" ? "ban" : "trash",
                        danger: true,
                        onClick: () => run(() => api(`/api/invitations/${i.id}`, { method: "DELETE" }), i.status === "pending" ? "Invitation revoked" : "Removed"),
                      },
                    ]}
                  />
                )}
              </span>
            </div>
          ))}
          {!pg.rows.length && <p className="empty">No invitations yet.</p>}
        </div>
        <Pager page={pg.page} pages={pg.pages} total={rows.length} from={pg.from} to={pg.to} onPage={setPage} />
      </section>
    </>
  );
}
