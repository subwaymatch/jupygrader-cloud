import { AuthFrame } from "@/components/auth/AuthFrame";
import { ConfirmEmail } from "@/components/auth/ConfirmEmail";
import { currentUser } from "@/lib/server/session";

export const metadata = { title: "Confirm your email", robots: { index: false, follow: false } };

/** Where a link in a confirmation email lands. Nothing changes until the button is pressed. */
export default async function ConfirmEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthFrame>
      <ConfirmEmail token={token} signedIn={!!(await currentUser())} />
    </AuthFrame>
  );
}
