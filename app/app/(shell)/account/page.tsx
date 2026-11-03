import { AccountForm } from "@/components/account/AccountForm";
import { canvasAccount } from "@/lib/server/canvas";
import { all, first } from "@/lib/server/db";
import { pageUser } from "@/lib/server/session";
import { getSettings } from "@/lib/server/settings";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const me = await pageUser();
  const roles = await all<{ courseId: string; course: string; role: string }>(
    `select c.id courseId, c.name course, e.role from enrollment e join course c on c.id = e.course_id where e.user_id = ? order by c.name collate nocase`,
    me.id,
  );
  let deleteBlock: string | null = null;
  if (me.isAdmin) {
    const n = (await first<{ n: number }>(`select count(*) n from "user" where isAdmin = 1 and status = 'active'`))?.n ?? 0;
    if (n <= 1) deleteBlock = "You're the only administrator. Make someone else an admin before deleting your account.";
  }
  const [settings, canvas] = await Promise.all([getSettings(), canvasAccount(me.id)]);
  return (
    <div className="page page--narrow">
      <h1 className="h1">Account</h1>
      <AccountForm
        me={me}
        roles={roles}
        deleteBlock={deleteBlock}
        canvas={settings.canvasUrl || me.isAdmin ? { url: settings.canvasUrl, account: canvas } : null}
      />
    </div>
  );
}
