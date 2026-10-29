"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Mascot";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/client/api";
import { fmtAt, fmtDay, fmtLongDay, fmtTokens, fmtUsd, plural } from "@/lib/shared/format";
import type { OverviewData } from "@/lib/server/admin";

export function Overview({ data }: { data: OverviewData }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const attention = data.pending.length + data.tasks.length;
  const maxWeek = Math.max(1, ...data.weeks.map((w) => w.n));
  const pct = data.spend.cap > 0 ? Math.min(100, (data.spend.cost / data.spend.cap) * 100) : 0;

  async function decide(id: string, action: "approve" | "decline", name: string) {
    setBusy(id + action);
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", body: { action } });
      toast(action === "approve" ? `${name} can now sign in. We emailed them.` : `Declined the request from ${name}`);
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), { error: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1 className="h1">Overview</h1>
          <p className="lede">{attention ? `${plural(attention, "thing")} need${attention === 1 ? "s" : ""} your attention.` : "Nothing needs your attention right now."}</p>
        </div>
      </div>
      <div className="stat-tiles">
        <div className="stat-tile">
          <span className="muted">Active courses</span>
          <span className="stat-tile__value">{data.stats.active}</span>
          <span className="stat-tile__note">{data.stats.archived} archived</span>
        </div>
        <div className="stat-tile">
          <span className="muted">People</span>
          <span className="stat-tile__value">{data.stats.people}</span>
          <span className="stat-tile__note">{plural(data.stats.admins, "admin")}</span>
        </div>
        <div className="stat-tile">
          <span className="muted">Files graded</span>
          <span className="stat-tile__value">{data.stats.monthGraded}</span>
          <span className="stat-tile__note">This month</span>
        </div>
      </div>

      <section className="section" style={{ marginTop: 40 }}>
        <h2 className="h2">
          Needs attention <span className="count">{attention}</span>
        </h2>
        <div className="list">
          {data.pending.map((p) => (
            <div className="attention-row" key={p.id}>
              <span className="dot" style={{ background: "var(--c-primary)" }} />
              <div className="grow stack" style={{ gap: 2 }}>
                <span style={{ fontWeight: 500 }}>{p.name} requested an instructor account</span>
                <span className="muted">
                  {p.email}, requested {fmtAt(p.createdAt)}
                </span>
              </div>
              <div className="row">
                <Button variant="secondary" size="sm" onClick={() => decide(p.id, "decline", p.name)} loading={busy === p.id + "decline"}>
                  Decline
                </Button>
                <Button variant="primary" size="sm" icon="check" onClick={() => decide(p.id, "approve", p.name)} loading={busy === p.id + "approve"}>
                  Approve
                </Button>
              </div>
            </div>
          ))}
          {data.tasks.map((t, i) => (
            <div className="attention-row" key={i}>
              <span className="dot" style={{ background: t.tone === "danger" ? "var(--c-danger)" : t.tone === "warn" ? "var(--c-warning)" : "var(--c-muted-dot)" }} />
              <div className="grow stack" style={{ gap: 2 }}>
                <span style={{ fontWeight: 500 }}>{t.title}</span>
                <span className="muted">{t.detail}</span>
              </div>
              <LinkButton href={t.href} variant="secondary" size="sm" iconRight="chevronRight">
                {t.cta}
              </LinkButton>
            </div>
          ))}
          {!attention && (
            <EmptyState pose="thumbs-up" size={88}>
              Nothing needs your attention right now.
            </EmptyState>
          )}
        </div>
      </section>

      <div className="two-col" style={{ marginTop: 40 }}>
        <section className="section">
          <h2 className="h2">Files graded per week</h2>
          <div>
            <div className="bars">
              {data.weeks.map((w) => (
                <div className="bars__col" key={w.start} title={`${plural(w.n, "file")} in the week of ${fmtDay(w.start)}`}>
                  <span>{w.n}</span>
                  <div className={"bars__bar" + (w.current ? " bars__bar--now" : "")} style={{ height: `${(w.n / maxWeek) * 100}%`, minHeight: w.n ? 3 : 0 }} />
                </div>
              ))}
            </div>
            <div className="bars__labels">
              {data.weeks.map((w) => (
                <span key={w.start} style={w.current ? { color: "var(--c-text)" } : undefined}>
                  {w.current ? "This week" : fmtDay(w.start)}
                </span>
              ))}
            </div>
          </div>
        </section>
        <section className="section">
          <div className="section-head">
            <h2 className="h2">AI spend this month</h2>
            <Link href="/admin/settings">Limits</Link>
          </div>
          <div className="row" style={{ alignItems: "baseline" }}>
            <span className="stat-tile__value">{fmtUsd(data.spend.cost)}</span>
            {data.spend.capOn && data.spend.cap > 0 && (
              <span className="muted">
                of ${data.spend.cap} cap, {Math.round(pct)}% used
              </span>
            )}
          </div>
          {data.spend.capOn && data.spend.cap > 0 && (
            <div className={"meter" + (pct >= 100 ? " meter--danger" : pct >= 80 ? " meter--warn" : "")}>
              <span style={{ width: pct + "%" }} />
            </div>
          )}
          <span className="muted">{fmtTokens(data.spend.tokens)} tokens so far, estimated from the token counts the API returns. Resets on the 1st of each month (UTC).</span>
          <div className="queue-note" style={{ marginTop: 8 }}>
            <span style={{ fontWeight: 500 }}>Grading queue</span>
            <span className="muted">
              Waiting <strong style={{ color: "var(--c-text)" }}>{data.queue.waiting}</strong>
            </span>
            <span className="muted">
              Grading now <strong style={{ color: "var(--c-text)" }}>{data.queue.grading}</strong>
            </span>
            <span className="muted">
              Failed <strong style={{ color: "var(--c-text)" }}>{data.queue.failed}</strong>
            </span>
          </div>
        </section>
      </div>

      <div className="two-col" style={{ marginTop: 40 }}>
        <section className="section">
          <h2 className="h2">
            Active courses <span className="count">{data.stats.active}</span>
          </h2>
          <div className="list">
            {data.courses.map((c) => (
              <Link key={c.id} href={`/courses/${c.id}`} className="list-row">
                <div className="list-row__main">
                  <span style={{ fontWeight: 500 }}>{c.name}</span>
                  <span className="muted">
                    {c.teachers.length ? c.teachers.join(", ") : "No Teacher"}, {plural(c.graded, "file")} graded
                  </span>
                </div>
                <span className="status">
                  <span className="dot" style={{ background: "var(--c-success)" }} />
                  Until {fmtLongDay(c.endDate)}
                </span>
              </Link>
            ))}
            {!data.courses.length && <p className="empty">No active courses.</p>}
          </div>
        </section>
        <section className="section">
          <div className="section-head">
            <h2 className="h2">Recent activity</h2>
            <Link href="/admin/activity">View all</Link>
          </div>
          <div className="list">
            {data.recent.map((a) => (
              <div className="list-row" key={a.id} style={{ alignItems: "flex-start" }}>
                <div className="list-row__main">
                  <span>{a.text}</span>
                  <span className="muted" style={{ fontSize: 13.5 }}>
                    {fmtAt(a.at)}, {a.user_name}
                    {a.course ? ` in ${a.course}` : ""}
                  </span>
                </div>
              </div>
            ))}
            {!data.recent.length && <p className="empty">Nothing yet.</p>}
          </div>
        </section>
      </div>
    </>
  );
}
