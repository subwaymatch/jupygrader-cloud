import Link from "next/link";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { InviteForm } from "@/components/auth/InviteForm";
import { invitationByToken } from "@/lib/server/accounts";
import { currentUser } from "@/lib/server/session";

export const metadata = { title: "Invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await invitationByToken(token);
  const me = await currentUser();
  if (!inv || !inv.valid) {
    return (
      <AuthFrame>
        <div className="auth-card">
          <h1 className="auth-card__title">This invitation isn&apos;t valid</h1>
          <p className="muted" style={{ lineHeight: 1.6 }}>
            It may have expired, been revoked, or already been used. Ask the person who invited you to send a new one.
          </p>
          <Link href={me ? "/courses" : "/login"} className="btn btn--secondary">
            {me ? "Go to your courses" : "Go to sign in"}
          </Link>
        </div>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame>
      <InviteForm token={token} inv={inv} signedInAs={me?.email ?? null} />
    </AuthFrame>
  );
}
