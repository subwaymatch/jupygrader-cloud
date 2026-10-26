import { SettingsForm } from "@/components/admin/SettingsForm";
import { emailConfigured } from "@/lib/server/email";
import { pageAdmin } from "@/lib/server/session";
import { getSettingsWithKey, monthUsage } from "@/lib/server/settings";

export const metadata = { title: "Settings" };

export default async function SiteSettingsPage() {
  await pageAdmin();
  const { aiApiKey, aiKeySource, ...settings } = await getSettingsWithKey();
  const usage = await monthUsage();
  return (
    <div className="page page--narrow">
      <h1 className="h1">Settings</h1>
      <SettingsForm initial={settings} keyInfo={{ source: aiKeySource, last4: aiApiKey.slice(-4) }} usage={usage} emailOn={emailConfigured()} />
    </div>
  );
}
