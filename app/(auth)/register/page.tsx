import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { countUsers } from "@/lib/server/accounts";
import { currentUser } from "@/lib/server/session";
import { getSettings } from "@/lib/server/settings";

export const metadata = { title: "Create an account" };

export default async function RegisterPage() {
  if (await currentUser()) redirect("/courses");
  const firstRun = (await countUsers()) === 0;
  const settings = await getSettings();
  return (
    <AuthFrame>
      <RegisterForm firstRun={firstRun} openReg={settings.openReg} />
    </AuthFrame>
  );
}
