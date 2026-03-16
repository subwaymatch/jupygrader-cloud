import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { BookOpen, LogOut, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top navigation */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
              <BookOpen className="h-5 w-5" />
              JupyGrader Cloud
            </Link>
            <nav className="hidden md:flex items-center gap-4 text-sm">
              <Link
                href="/dashboard"
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <LayoutDashboard className="h-4 w-4" />
                Workspaces
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden md:block">
              {session.user.email}
            </span>
            <form
              action={async () => {
                "use server";
                // Client-side sign-out is handled by authClient; this is a fallback
              }}
            >
              <Button variant="ghost" size="sm" asChild>
                <Link href="/api/auth/sign-out">
                  <LogOut className="h-4 w-4 mr-1" />
                  Sign out
                </Link>
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="container py-8">{children}</main>
    </div>
  );
}
