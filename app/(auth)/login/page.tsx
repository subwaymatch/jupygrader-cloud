import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { LoginForm } from "@/components/auth/LoginForm";
import { countUsers } from "@/lib/server/accounts";
import { currentUser } from "@/lib/server/session";
import { getSettings } from "@/lib/server/settings";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  link: "That sign-in link has expired or was already used, or the account isn't approved yet. Request a new link.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  if (await currentUser()) redirect("/courses");
  if ((await countUsers()) === 0) redirect("/register");
  const sp = await searchParams;
  const settings = await getSettings();
  return (
    <AuthFrame>
      <LoginForm next={sp.next} initialError={sp.error ? (ERRORS[sp.error] ?? "Couldn't sign you in. Try again.") : ""} openReg={settings.openReg} />
    </AuthFrame>
  );
}
