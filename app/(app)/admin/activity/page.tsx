import Link from "next/link";
import { all, first } from "@/lib/server/db";
import { pageAdmin } from "@/lib/server/session";
import { ACTIVITY_TYPES, type ActivityType } from "@/lib/shared/constants";
import { fmtAt } from "@/lib/shared/format";

export const metadata = { title: "Activity" };

const PAGE = 50;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ type?: string; page?: string }> }) {
  await pageAdmin();
  const sp = await searchParams;
  const type = sp.type && sp.type in ACTIVITY_TYPES ? (sp.type as ActivityType) : null;
  const page = Math.max(1, Number(sp.page) || 1);
  const counts = await all<{ type: string; n: number }>("select type, count(*) n from activity group by type");
  const total = counts.reduce((a, c) => a + c.n, 0);
  const n = type ? (counts.find((c) => c.type === type)?.n ?? 0) : total;
  const rows = await all<{ id: string; at: string; user_name: string; text: string; type: string; course: string | null }>(
    `select a.id, a.at, a.user_name, a.text, a.type, c.name course from activity a left join course c on c.id = a.course_id
      ${type ? "where a.type = ?" : ""} order by a.at desc limit ${PAGE} offset ${(page - 1) * PAGE}`,
    ...(type ? [type] : []),
  );
  const pages = Math.max(1, Math.ceil(n / PAGE));
  const href = (t: string | null, p = 1) => `/admin/activity?${new URLSearchParams({ ...(t ? { type: t } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;
  const oldest = await first<{ at: string }>("select min(at) at from activity");
  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head__text">
          <h1 className="h1">Activity</h1>
          <p className="lede">What people did across all courses, newest first. Actions are recorded automatically and can&apos;t be edited or deleted.</p>
        </div>
      </div>
      <div className="pills pills--plain" role="tablist" style={{ marginBottom: 12 }}>
        <Link href={href(null)} className="pill" role="tab" aria-selected={!type}>
          All <span className="count">{total}</span>
        </Link>
        {(Object.keys(ACTIVITY_TYPES) as ActivityType[]).map((t) => {
          const c = counts.find((x) => x.type === t)?.n ?? 0;
          if (!c && type !== t) return null;
          return (
            <Link key={t} href={href(t)} className="pill" role="tab" aria-selected={type === t}>
              {ACTIVITY_TYPES[t]} <span className="count">{c}</span>
            </Link>
          );
        })}
      </div>
      <div className="list">
        {rows.map((r) => (
          <div className="activity-row" key={r.id}>
            <span className="muted">{fmtAt(r.at)}</span>
            <div className="stack" style={{ gap: 2 }}>
              <span>{r.text}</span>
              <span className="muted">
                {r.user_name}
                {r.course ? ` in ${r.course}` : ""} · {ACTIVITY_TYPES[r.type as ActivityType] ?? r.type}
              </span>
            </div>
          </div>
        ))}
        {!rows.length && <p className="empty">Nothing here yet.</p>}
      </div>
      {pages > 1 && (
        <div className="pager">
          <span>
            Page {page} of {pages}
            {oldest?.at ? `, since ${fmtAt(oldest.at)}` : ""}
          </span>
          <div className="pager__pages">
            {page > 1 && (
              <Link className="pager__btn" href={href(type, page - 1)} aria-label="Previous page">
                ‹
              </Link>
            )}
            {page < pages && (
              <Link className="pager__btn" href={href(type, page + 1)} aria-label="Next page">
                ›
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
