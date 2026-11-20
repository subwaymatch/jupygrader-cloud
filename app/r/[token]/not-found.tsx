import { Logo } from "@/components/ui/Logo";
import { Mascot } from "@/components/ui/Mascot";

export const metadata = { title: "Link not active", robots: { index: false, follow: false } };

/** A student link that is unknown, turned off or replaced, or whose feedback was deleted. Sent with a 404 status. */
export default function StudentLinkNotFound() {
  return (
    <div className="student-page">
      <div className="student-wrap">
        <Logo size={24} />
        <div className="student-card" style={{ alignItems: "flex-start" }}>
          <Mascot pose="sad" size={96} />
          <h1 className="h1">This link is no longer active</h1>
          <p className="muted" style={{ lineHeight: 1.6 }}>
            The person who shared it turned it off or replaced it with a new link, or the feedback was deleted. Ask them for the current one.
          </p>
        </div>
      </div>
    </div>
  );
}
