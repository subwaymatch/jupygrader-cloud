import type { Role } from "@/lib/shared/constants";
import { isArchived, type CourseRow } from "./access";
import { all, first } from "./db";
import { getSettingsWithKey, monthStartIso, monthUsage } from "./settings";

export type PendingUser = { id: string; name: string; email: string; createdAt: string };

export async function pendingUsers(): Promise<PendingUser[]> {
  return all<PendingUser>(`select id, name, email, "createdAt" from "user" where status = 'pending' order by "createdAt"`);
}

export type AttentionTask = { tone: "danger" | "warn" | "muted"; title: string; detail: string; cta: string; href: string };

export async function overviewData() {
  const now = Date.now();
  const courses = await all<CourseRow>("select * from course order by created_at desc");
  const active = courses.filter((c) => !isArchived(c));
  const people = (await first<{ n: number; a: number }>(`select count(*) n, sum(isAdmin) a from "user" where status = 'active'`)) ?? { n: 0, a: 0 };
  const monthGraded = (await first<{ n: number }>("select count(*) n from submission where status = 'graded' and graded_at >= ?", monthStartIso()))?.n ?? 0;

  const tasks: AttentionTask[] = [];
  const failed = await all<{ assignment_id: string; n: number; title: string; course_id: string; course: string }>(
    `select s.assignment_id, count(*) n, a.title, a.course_id, c.name course from submission s
       join assignment a on a.id = s.assignment_id join course c on c.id = a.course_id
      where s.status = 'failed' group by s.assignment_id`,
  );
  for (const f of failed)
    tasks.push({
      tone: "danger",
      title: `${f.n} file${f.n === 1 ? "" : "s"} failed to grade`,
      detail: `${f.title}, ${f.course}`,
      cta: "Open",
      href: `/courses/${f.course_id}/assignments/${f.assignment_id}`,
    });
  const invites = await all<{ email: string; sent_at: string; expires_at: string }>("select email, sent_at, expires_at from invitation where status = 'pending'");
  const nowIso = new Date(now).toISOString();
  const stale = invites.filter((i) => i.expires_at > nowIso && now - Date.parse(i.sent_at) > 7 * 86400_000);
  const expired = invites.filter((i) => i.expires_at <= nowIso);
  if (stale.length)
    tasks.push({
      tone: "warn",
      title: `${stale.length} invitation${stale.length === 1 ? "" : "s"} pending for over a week`,
      detail: stale.slice(0, 4).map((i) => i.email).join(", ") + (stale.length > 4 ? ` and ${stale.length - 4} more` : ""),
      cta: "Review",
      href: "/admin/invitations",
    });
  if (expired.length)
    tasks.push({
      tone: "muted",
      title: `${expired.length} invitation${expired.length === 1 ? "" : "s"} expired`,
      detail: expired.slice(0, 4).map((i) => i.email).join(", ") + `. Resend or remove ${expired.length === 1 ? "it" : "them"}.`,
      cta: "Review",
      href: "/admin/invitations",
    });
  const s = await getSettingsWithKey();
  const usage = await monthUsage();
  if (s.aiKeySource === "none")
    tasks.unshift({ tone: "danger", title: "AI grading isn't set up", detail: "Add an API key and choose a model so files can be graded.", cta: "Settings", href: "/admin/settings" });
  else if (s.capOn && s.cap > 0 && usage.cost >= s.cap)
    tasks.unshift({ tone: "danger", title: "Grading is paused at the spending cap", detail: `This month's estimated spend reached the $${s.cap} cap.`, cta: "Limits", href: "/admin/settings" });

  // Files graded per week, last 9 weeks (Monday start, UTC).
  const d = new Date();
  const day = (d.getUTCDay() + 6) % 7;
  const thisWeek = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  const since = new Date(thisWeek - 8 * 7 * 86400_000).toISOString();
  const graded = await all<{ graded_at: string }>("select graded_at from submission where status = 'graded' and graded_at >= ?", since);
  const weeks = Array.from({ length: 9 }, (_, i) => {
    const start = thisWeek - (8 - i) * 7 * 86400_000;
    const n = graded.filter((g) => {
      const t = Date.parse(g.graded_at);
      return t >= start && t < start + 7 * 86400_000;
    }).length;
    return { start: new Date(start).toISOString(), n, current: i === 8 };
  });

  const queue = (await first<{ q: number; g: number; f: number }>(
    "select sum(case when status='queued' then 1 else 0 end) q, sum(case when status='grading' then 1 else 0 end) g, sum(case when status='failed' then 1 else 0 end) f from submission",
  )) ?? { q: 0, g: 0, f: 0 };

  const courseRows = await Promise.all(
    active.slice(0, 8).map(async (c) => {
      const t = await all<{ name: string }>(`select u.name from enrollment e join "user" u on u.id = e.user_id where e.course_id = ? and e.role = 'Teacher' order by u.name`, c.id);
      const n = (await first<{ n: number }>("select count(*) n from submission s join assignment a on a.id = s.assignment_id where a.course_id = ? and s.status = 'graded'", c.id))?.n ?? 0;
      return { id: c.id, name: c.name, teachers: t.map((x) => x.name), graded: n, endDate: c.end_date };
    }),
  );
  const recent = await all<{ id: string; at: string; user_name: string; text: string; course: string | null }>(
    "select a.id, a.at, a.user_name, a.text, c.name course from activity a left join course c on c.id = a.course_id order by a.at desc limit 6",
  );
  return {
    stats: { active: active.length, archived: courses.length - active.length, people: people.n ?? 0, admins: people.a ?? 0, monthGraded },
    pending: await pendingUsers(),
    tasks,
    weeks,
    queue: { waiting: queue.q ?? 0, grading: queue.g ?? 0, failed: queue.f ?? 0 },
    spend: { cost: usage.cost, tokens: usage.input + usage.output, cap: s.cap, capOn: s.capOn },
    courses: courseRows,
    recent,
  };
}
export type OverviewData = Awaited<ReturnType<typeof overviewData>>;

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  status: string;
  createdAt: string;
  roles: { courseId: string; course: string; role: Role; archived: boolean }[];
};

export async function adminUsers(): Promise<AdminUser[]> {
  const users = await all<{ id: string; name: string; email: string; isAdmin: number; status: string; createdAt: string }>(
    `select id, name, email, isAdmin, status, "createdAt" from "user" order by case status when 'pending' then 0 else 1 end, name collate nocase`,
  );
  const enr = await all<{ user_id: string; course_id: string; role: Role; name: string; end_date: string }>(
    "select e.user_id, e.course_id, e.role, c.name, c.end_date from enrollment e join course c on c.id = e.course_id order by c.name",
  );
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    isAdmin: !!u.isAdmin,
    status: u.status,
    createdAt: u.createdAt,
    roles: enr
      .filter((e) => e.user_id === u.id)
      .map((e) => ({ courseId: e.course_id, course: e.name, role: e.role, archived: isArchived({ end_date: e.end_date }) })),
  }));
}

export type InvitationRow = {
  id: string;
  email: string;
  courseId: string;
  course: string;
  role: Role;
  status: "pending" | "accepted" | "revoked" | "expired";
  sentAt: string;
  inviter: string | null;
};

export async function allInvitations(): Promise<InvitationRow[]> {
  const rows = await all<{ id: string; email: string; course_id: string; course: string; role: Role; status: string; sent_at: string; expires_at: string; inviter: string | null }>(
    `select i.id, i.email, i.course_id, c.name course, i.role, i.status, i.sent_at, i.expires_at, u.name inviter
       from invitation i join course c on c.id = i.course_id left join "user" u on u.id = i.invited_by
      order by i.sent_at desc limit 1000`,
  );
  const now = new Date().toISOString();
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    courseId: r.course_id,
    course: r.course,
    role: r.role,
    status: r.status === "pending" && r.expires_at <= now ? "expired" : (r.status as InvitationRow["status"]),
    sentAt: r.sent_at,
    inviter: r.inviter,
  }));
}
