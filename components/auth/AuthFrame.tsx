import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth__inner">
        <Link href="/login" className="auth__brand" style={{ color: "inherit", textDecoration: "none" }}>
          <Logo size={30} animated />
        </Link>
        {children}
      </div>
    </div>
  );
}
