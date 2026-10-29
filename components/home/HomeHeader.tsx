"use client";

import { useEffect, useState } from "react";

/** The home page header. It stays at the top of the window and gets more compact once the page is scrolled. */
export function HomeHeader({ children }: { children: React.ReactNode }) {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const update = () => setCompact(window.scrollY > 16);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return <header className={"home-header" + (compact ? " home-header--compact" : "")}>{children}</header>;
}
