import { AuthFrame } from "@/components/auth/AuthFrame";
import { ResetForm } from "@/components/auth/ResetForm";

export const metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthFrame>
      <ResetForm token={sp.token || ""} invalid={!sp.token || !!sp.error} />
    </AuthFrame>
  );
}
