import { UsersAdmin } from "@/components/admin/UsersAdmin";
import { adminUsers } from "@/lib/server/admin";
import { all } from "@/lib/server/db";
import { pageAdmin } from "@/lib/server/session";

export const metadata = { title: "Users & roles" };

export default async function UsersPage() {
  const me = await pageAdmin();
  const users = await adminUsers();
  const courses = await all<{ id: string; name: string }>("select id, name from course order by name collate nocase");
  return (
    <div className="page">
      <UsersAdmin users={users} courses={courses} meId={me.id} />
    </div>
  );
}
