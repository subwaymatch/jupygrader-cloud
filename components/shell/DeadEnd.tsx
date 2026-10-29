import type { ReactNode } from "react";
import { LinkButton } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { Mascot } from "@/components/ui/Mascot";

/** Centers a dead-end card. Outside the app shell (`page`), it fills the window and shows the logo. */
export function DeadEnd({ page = false, children }: { page?: boolean; children: ReactNode }) {
  if (!page) return <div className="dead-end">{children}</div>;
  return (
    <div className="dead-end dead-end--page">
      <div className="dead-end__wrap">
        <Logo size={24} />
        {children}
      </div>
    </div>
  );
}

/** The 404 card: the mascot peeks over its top edge. */
export function NotFound({ page = false }: { page?: boolean }) {
  return (
    <DeadEnd page={page}>
      <div className="dead-end__card dead-end__card--peek">
        <Mascot pose="peeking" size={168} className="dead-end__peek" />
        <span className="dead-end__code">404</span>
        <h1 className="h1">Page not found</h1>
        <p className="muted">The page may have moved, the link may be out of date, or you may not have access to it.</p>
        <div className="dead-end__actions">
          <LinkButton href="/app/courses" variant="primary" icon="arrowLeft">
            Back to courses
          </LinkButton>
        </div>
      </div>
    </DeadEnd>
  );
}
