"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { IconButton } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo, LogoMark } from "@/components/ui/Logo";
import { ActionMenu } from "@/components/ui/Menu";
import { Sheet } from "@/components/ui/Sheet";
import { authClient } from "@/lib/client/auth-client";
import { initials } from "@/lib/shared/format";
import type { CourseSummary, Me } from "@/lib/shared/types";

const ADMIN_NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/app/admin", label: "Overview", icon: "dashboard" },
  { href: "/app/admin/users", label: "Users & roles", icon: "users" },
  { href: "/app/admin/invitations", label: "Invitations", icon: "mail" },
  { href: "/app/admin/activity", label: "Activity", icon: "history" },
  { href: "/app/admin/settings", label: "Settings", icon: "settings" },
];

function courseAbbr(name: string): string {
  const code = name.match(/\b([A-Z]{2,5})\s?-?(\d{2,4})/);
  if (code) return (code[1].slice(0, 2) + code[2].slice(0, 2)).toUpperCase();
  return initials(name);
}

function asgAbbr(title: string): string {
  const m = title.match(/^([A-Za-z]+)\s*(\d+)/);
  if (m) return (m[1][0] + m[2]).toUpperCase().slice(0, 3);
  return initials(title);
}

async function signOut() {
  await authClient.signOut();
  window.location.assign("/login");
}

type NavProps = {
  me: Me;
  courses: CourseSummary[];
  adminBadge: number;
  pathname: string;
  current: CourseSummary | null;
  onNavigate?: () => void;
};

function useCurrentCourse(courses: CourseSummary[], pathname: string): CourseSummary | null {
  const fromPath = pathname.match(/^\/app\/courses\/([^/]+)/)?.[1];
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => {
    try {
      if (fromPath && fromPath !== "new") localStorage.setItem("jg-last-course", fromPath);
      setLast(localStorage.getItem("jg-last-course"));
    } catch {
      /* storage unavailable */
    }
  }, [fromPath]);
  const id = fromPath && fromPath !== "new" ? fromPath : last;
  const active = courses.filter((c) => !c.archived);
  return courses.find((c) => c.id === id) ?? active[0] ?? null;
}

function CourseSwitcher({ courses, current, onNavigate }: { courses: CourseSummary[]; current: CourseSummary; onNavigate?: () => void }) {
  const active = courses.filter((c) => !c.archived);
  const archived = courses.filter((c) => c.archived);
  const router = useRouter();
  const go = (href: string) => {
    onNavigate?.();
    router.push(href);
  };
  return (
    <ActionMenu
      align="start"
      minWidth={240}
      trigger={
        <button className="course-switch" title="Switch course">
          <span className="truncate">{current.name}</span>
          <Icon name="chevronsUpDown" size={15} />
        </button>
      }
      items={[
        { type: "heading", label: "Courses" },
        ...active.map((c) => ({ label: c.name, onClick: () => go(`/app/courses/${c.id}`), checked: c.id === current.id })),
        ...(archived.length ? [{ type: "heading" as const, label: "Archived" }] : []),
        ...archived.map((c) => ({ label: c.name, onClick: () => go(`/app/courses/${c.id}`), checked: c.id === current.id })),
        { type: "separator" },
        { label: "All courses", icon: "layers", onClick: () => go("/app/courses") },
        { label: "Add course", icon: "plus", onClick: () => go("/app/courses/new") },
      ]}
    />
  );
}

function ExpandedNav({ me, courses, adminBadge, pathname, current, onNavigate }: NavProps) {
  const [adminOpen, setAdminOpen] = useState(true);
  useEffect(() => {
    try {
      setAdminOpen(localStorage.getItem("jg-admin-nav") !== "0");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleAdmin = () => {
    setAdminOpen((v) => {
      try {
        localStorage.setItem("jg-admin-nav", v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  };
  const canManage = !!current && (me.isAdmin || current.role === "Teacher");
  const is = (href: string, exact = true) => (exact ? pathname === href : pathname.startsWith(href));
  const nav = (href: string, label: string, icon: IconName | null, current: boolean, sub = false) => (
    <Link key={href} href={href} className={"nav-item" + (sub ? " nav-item--sub" : "")} aria-current={current ? "page" : undefined} onClick={onNavigate} title={label}>
      {icon && <Icon name={icon} size={16} />}
      <span className="nav-item__label">{label}</span>
    </Link>
  );
  return (
    <nav className="sidebar__nav" aria-label="Main">
      {current ? (
        <>
          <span className="sidebar__section">Course</span>
          <CourseSwitcher courses={courses} current={current} onNavigate={onNavigate} />
          {nav(`/app/courses/${current.id}`, "Course Home", "home", is(`/app/courses/${current.id}`))}
          {nav(`/app/courses/${current.id}/members`, "Members", "users", is(`/app/courses/${current.id}/members`))}
          {canManage && nav(`/app/courses/${current.id}/settings`, "Course settings", "settings", is(`/app/courses/${current.id}/settings`))}
          <Link href={`/app/courses/${current.id}`} className="sidebar__section" onClick={onNavigate}>
            Assignments
          </Link>
          {current.assignments.map((a) =>
            nav(`/app/courses/${current.id}/assignments/${a.id}`, a.title, null, is(`/app/courses/${current.id}/assignments/${a.id}`, false), true),
          )}
          {!current.assignments.length && <span className="nav-empty">No assignments yet</span>}
        </>
      ) : (
        <>
          <span className="sidebar__section">Courses</span>
          {nav("/app/courses", "All courses", "layers", is("/app/courses"))}
          {nav("/app/courses/new", "New course", "plus", is("/app/courses/new"))}
        </>
      )}
      {me.isAdmin && (
        <>
          <button className="sidebar__section" onClick={toggleAdmin} aria-expanded={adminOpen}>
            <span style={{ flex: 1 }}>Admin</span>
            {!adminOpen && adminBadge > 0 && <span className="badge">{adminBadge}</span>}
            <Icon name="chevronRight" size={14} style={{ transform: `rotate(${adminOpen ? 90 : 0}deg)`, transition: "transform .15s" }} />
          </button>
          {adminOpen &&
            ADMIN_NAV.map((n) => (
              <Link key={n.href} href={n.href} className="nav-item" aria-current={is(n.href) ? "page" : undefined} onClick={onNavigate}>
                <Icon name={n.icon} size={16} />
                <span className="nav-item__label">{n.label}</span>
                {n.href === "/app/admin" && adminBadge > 0 && <span className="badge">{adminBadge}</span>}
              </Link>
            ))}
        </>
      )}
    </nav>
  );
}

function AccountMenu({ me, trigger }: { me: Me; trigger: React.ReactElement<Record<string, unknown>> }) {
  const router = useRouter();
  return (
    <ActionMenu
      side="top"
      align="start"
      minWidth={220}
      trigger={trigger}
      items={[
        { type: "heading", label: me.email },
        { label: "Account settings", icon: "user", onClick: () => router.push("/app/account") },
        { label: "Help", icon: "help", onClick: () => router.push("/app/help") },
        { type: "separator" },
        { label: "Sign out", icon: "logOut", onClick: signOut },
      ]}
    />
  );
}

function SidebarFoot({ me, pathname, onNavigate }: { me: Me; pathname: string; onNavigate?: () => void }) {
  return (
    <div className="sidebar__foot">
      <Link href="/app/account" className="me-btn" aria-current={pathname === "/app/account" ? "page" : undefined} onClick={onNavigate} title="Account settings">
        <span className="avatar">{initials(me.name)}</span>
        <span className="truncate">{me.name}</span>
      </Link>
      <AccountMenu me={me} trigger={<button className="icon-btn" aria-label="Account, help and sign out" title="Account, help and sign out"><Icon name="more" size={16} /></button>} />
    </div>
  );
}

export function AppShell({
  me,
  courses,
  adminBadge,
  children,
}: {
  me: Me;
  courses: CourseSummary[];
  adminBadge: number;
  children: ReactNode;
}) {
  const pathname = usePathname() || "/";
  const current = useCurrentCourse(courses, pathname);
  const [rail, setRail] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setRail(localStorage.getItem("jg-sidebar-collapsed") === "1");
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);

  const toggleRail = () => {
    setRail((v) => {
      try {
        localStorage.setItem("jg-sidebar-collapsed", v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  };

  const title = useMemo(() => {
    if (pathname.startsWith("/app/admin")) return ADMIN_NAV.find((n) => n.href === pathname)?.label ?? "Admin";
    if (pathname.startsWith("/app/account")) return "Account";
    if (pathname.startsWith("/app/help")) return "Help";
    if (pathname.startsWith("/app/courses/") && current && pathname.includes(current.id)) {
      const asgId = pathname.match(/assignments\/([^/]+)/)?.[1];
      const asg = current.assignments.find((a) => a.id === asgId);
      return asg?.title ?? current.name;
    }
    return "Courses";
  }, [pathname, current]);

  const navProps: NavProps = { me, courses, adminBadge, pathname, current };

  return (
    <div className={"shell" + (rail ? " shell--rail" : "")}>
      {!rail ? (
        <aside className="sidebar">
          <div className="sidebar__top">
            <Link href="/app/courses" className="sidebar__brand" aria-label="Jupygrader home">
              <Logo size={24} />
            </Link>
            <IconButton icon="panelLeft" label="Collapse sidebar" onClick={toggleRail} />
          </div>
          <ExpandedNav {...navProps} />
          <SidebarFoot me={me} pathname={pathname} />
        </aside>
      ) : (
        <aside className="sidebar sidebar--rail">
          <div className="sidebar__top">
            <Link href="/app/courses" aria-label="Jupygrader home">
              <LogoMark size={26} />
            </Link>
            <IconButton icon="panelLeftOpen" label="Expand sidebar" onClick={toggleRail} />
          </div>
          <nav className="sidebar__nav" aria-label="Main">
            {courses
              .filter((c) => !c.archived)
              .map((c) => (
                <Link
                  key={c.id}
                  href={`/app/courses/${c.id}`}
                  className="rail-btn rail-btn--text"
                  title={c.name}
                  aria-label={c.name}
                  aria-current={current?.id === c.id ? "page" : undefined}
                  style={current?.id === c.id ? { boxShadow: "inset 0 0 0 2px var(--c-primary)" } : undefined}
                >
                  {courseAbbr(c.name)}
                </Link>
              ))}
            <Link href="/app/courses/new" className="rail-btn" title="Add course" aria-label="Add course">
              <Icon name="plus" size={17} />
            </Link>
            {current && current.assignments.length > 0 && <span className="rail-sep" />}
            {current?.assignments.map((a) => (
              <Link
                key={a.id}
                href={`/app/courses/${current.id}/assignments/${a.id}`}
                className="rail-btn"
                title={a.title}
                aria-label={a.title}
                aria-current={pathname.includes(a.id) ? "page" : undefined}
              >
                {asgAbbr(a.title)}
              </Link>
            ))}
            {me.isAdmin && <span className="rail-sep" />}
            {me.isAdmin &&
              ADMIN_NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rail-btn" title={n.label} aria-label={n.label} aria-current={pathname === n.href ? "page" : undefined}>
                  <Icon name={n.icon} size={18} />
                </Link>
              ))}
          </nav>
          <div className="sidebar__foot">
            <Link href="/app/help" className="rail-btn" title="Help" aria-label="Help">
              <Icon name="help" size={18} />
            </Link>
            <AccountMenu
              me={me}
              trigger={
                <button className="rail-btn" title={`${me.name}: account, help and sign out`} aria-label="Account menu">
                  <span className="avatar">{initials(me.name)}</span>
                </button>
              }
            />
          </div>
        </aside>
      )}

      <header className="topbar">
        <IconButton icon="menu" label="Open menu" size={20} onClick={() => setMobileOpen(true)} />
        <span className="topbar__title">{title}</span>
        <AccountMenu
          me={me}
          trigger={
            <button className="icon-btn" aria-label="Account menu" style={{ width: 40, height: 40 }}>
              <span className="avatar">{initials(me.name)}</span>
            </button>
          }
        />
      </header>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen} side="left" label="Menu">
        <div className="mobile-nav">
          <div className="sidebar__top">
            <Logo size={24} />
            <IconButton icon="x" label="Close menu" size={18} onClick={() => setMobileOpen(false)} />
          </div>
          <ExpandedNav {...navProps} onNavigate={() => setMobileOpen(false)} />
          <SidebarFoot me={me} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
        </div>
      </Sheet>

      <main className="main">{children}</main>
    </div>
  );
}
