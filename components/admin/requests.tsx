import { Icon } from "@/components/ui/Icon";

/** Whether the person asking for an account opened the link sent to their address. */
export function EmailConfirmed({ yes }: { yes: boolean }) {
  return yes ? (
    <span className="row" style={{ gap: 4, color: "var(--c-success-text)", fontSize: 13 }}>
      <Icon name="checkCircle" size={13} />
      Email confirmed
    </span>
  ) : (
    <span className="row" style={{ gap: 4, color: "var(--c-warning-text)", fontSize: 13 }}>
      <Icon name="alertTriangle" size={13} />
      Email not confirmed
    </span>
  );
}

/** Declining deletes the request, so it asks first. */
export const declineRequest = (name: string) => ({
  title: `Decline ${name}\u2019s request?`,
  body: "Their account request is deleted. They can ask for an account again.",
  cta: "Decline request",
  danger: true,
});

/** Anyone can ask for an account under any address, so approving one that was never confirmed asks first. */
export const approveUnconfirmed = (name: string, email: string) => ({
  title: `Approve ${name} without a confirmed email?`,
  body: `The link we sent to ${email} hasn\u2019t been opened, so nobody has shown that the address is theirs. Whoever made this request will be able to sign in under it.`,
  cta: "Approve anyway",
});
