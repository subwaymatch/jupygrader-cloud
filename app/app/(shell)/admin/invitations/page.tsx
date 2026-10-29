import { InvitationsAdmin } from "@/components/admin/InvitationsAdmin";
import { isArchived, type CourseRow } from "@/lib/server/access";
import { allInvitations } from "@/lib/server/admin";
import { all } from "@/lib/server/db";
import { pageAdmin } from "@/lib/server/session";

export const metadata = { title: "Invitations" };

export default async function InvitationsPage() {
  await pageAdmin();
  const courses = (await all<CourseRow>("select * from course order by name collate nocase")).filter((c) => !isArchived(c));
  return (
    <div className="page">
      <InvitationsAdmin invitations={await allInvitations()} courses={courses.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
