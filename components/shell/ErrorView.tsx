"use client";

import { Button, LinkButton } from "@/components/ui/Button";
import { Mascot } from "@/components/ui/Mascot";
import { DeadEnd } from "./DeadEnd";

/** Shown by the error boundaries when a page fails to render. */
export function ErrorView({ reset, page = false }: { reset: () => void; page?: boolean }) {
  return (
    <DeadEnd page={page}>
      <div className="dead-end__card">
        <Mascot pose="shrugging" size={128} />
        <h1 className="h1">Something went wrong</h1>
        <p className="muted">This page didn&apos;t load. Try again, and if it keeps happening, let your site admin know.</p>
        <div className="dead-end__actions">
          <Button variant="primary" icon="refresh" onClick={reset}>
            Try again
          </Button>
          <LinkButton href="/courses" variant="secondary">
            Back to courses
          </LinkButton>
        </div>
      </div>
    </DeadEnd>
  );
}
