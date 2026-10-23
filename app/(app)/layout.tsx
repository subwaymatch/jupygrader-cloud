import { AppShell } from "@/components/shell/AppShell";
import { userCourses } from "@/lib/server/access";
import { first } from "@/lib/server/db";
import { pageUser } from "@/lib/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await pageUser();
  const courses = await userCourses(me);
  let adminBadge = 0;
  if (me.isAdmin) {
    const r = await first<{ n: number }>(`select count(*) n from "user" where status = 'pending'`);
    const f = await first<{ n: number }>(`select count(distinct assignment_id) n from submission where status = 'failed'`);
    adminBadge = (r?.n ?? 0) + (f?.n ?? 0);
  }
  return (
    <AppShell me={me} courses={courses} adminBadge={adminBadge}>
      {children}
    </AppShell>
  );
}
