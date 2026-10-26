"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, IconButton, LinkButton } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Controls";
import { Icon } from "@/components/ui/Icon";
import { Pager, pageSlice } from "@/components/ui/Pager";
import { Select } from "@/components/ui/Select";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/client/api";
import { ROLE_INFO, type Role } from "@/lib/shared/constants";
import { fmtAt } from "@/lib/shared/format";
import type { AdminUser } from "@/lib/server/admin";

type Tab = "all" | "pending" | "unassigned" | "admins";

export function UsersAdmin({ users, courses, meId }: { users: AdminUser[]; courses: { id: string; name: string }[]; meId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(users.some((u) => u.status === "pending") ? "pending" : "all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [addCourse, setAddCourse] = useState("");
  const [addRole, setAddRole] = useState<Role>("Grader");
  const [busy, setBusy] = useState(false);

  const counts = {
    all: users.filter((u) => u.status === "active").length,
    pending: users.filter((u) => u.status === "pending").length,
    unassigned: users.filter((u) => u.status === "active" && !u.roles.length).length,
    admins: users.filter((u) => u.isAdmin).length,
  };
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return users.filter((u) => {
      if (tab === "pending" ? u.status !== "pending" : u.status !== "active") return false;
      if (tab === "unassigned" && u.roles.length) return false;
      if (tab === "admins" && !u.isAdmin) return false;
      return !s || u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s);
    });
  }, [users, tab, q]);
  const pg = pageSlice(rows, page, 25);
  const open = users.find((u) => u.id === openId) ?? null;

  async function patch(id: string, body: Record<string, unknown>, ok: string) {
    setBusy(true);
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", body });
      toast(ok);
      router.refresh();
      return true;
    } catch (err) {
      toast(errorMessage(err), { error: true });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const TABS: { id: Tab; label: string; icon: "users" | "userPlus" | "shield" | "clock" }[] = [
    { id: "all", label: "Everyone", icon: "users" },
    ...(counts.pending ? [{ id: "pending" as Tab, label: "Requests", icon: "clock" as const }] : []),
    { id: "unassigned", label: "Unassigned", icon: "userPlus" },
    { id: "admins", label: "Admins", icon: "shield" },
  ];

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1 className="h1">Users &amp; roles</h1>
          <p className="lede">Roles are set per course, so one person can be a Teacher in one course and a Grader in another.</p>
        </div>
        <LinkButton href="/admin/invitations" variant="primary" icon="userPlus">
          Invite people
        </LinkButton>
      </div>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="pills pills--plain" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" className="pill" aria-selected={tab === t.id} onClick={() => (setTab(t.id), setPage(1))}>
              <Icon name={t.icon} size={14} />
              {t.label} <span className="count">{counts[t.id]}</span>
            </button>
          ))}
        </div>
        <label className="search">
          <Icon name="search" size={14} />
          <input className="input input--sm" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} placeholder="Search people" aria-label="Search people" />
        </label>
      </div>
      <div className="list">
        {pg.rows.map((u) => (
          <div className="user-row" key={u.id}>
            <div className="stack" style={{ gap: 1, minWidth: 0 }}>
              <span className="row" style={{ gap: 8, fontWeight: 500 }}>
                <span className="truncate">{u.name}</span>
                {u.isAdmin && (
                  <span className="row" style={{ gap: 3, color: "var(--c-link)", fontWeight: 500, fontSize: 13 }}>
                    <Icon name="shield" size={12} />
                    Admin
                  </span>
                )}
              </span>
              <span className="muted truncate">{u.email}</span>
            </div>
            <div className="role-chips">
              {u.status === "pending" ? (
                <span className="muted">Requested an instructor account {fmtAt(u.createdAt)}</span>
              ) : u.roles.length ? (
                u.roles.map((r) => (
                  <span className="role-chip" key={r.courseId}>
                    <span>{r.course}</span>
                    <span>{r.role}</span>
                  </span>
                ))
              ) : (
                <span className="muted">Not in any course</span>
              )}
            </div>
            {u.status === "pending" ? (
              <div className="row">
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => patch(u.id, { action: "decline" }, `Declined ${u.name}`)}>
                  Decline
                </Button>
                <Button variant="primary" size="sm" icon="check" disabled={busy} onClick={() => patch(u.id, { action: "approve" }, `${u.name} can now sign in`)}>
                  Approve
                </Button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" icon="userCog" onClick={() => (setOpenId(u.id), setAddCourse(""))}>
                Edit roles
              </Button>
            )}
          </div>
        ))}
        {!pg.rows.length && <p className="empty">No one matches.</p>}
      </div>
      <Pager page={pg.page} pages={pg.pages} total={rows.length} from={pg.from} to={pg.to} onPage={setPage} />

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)} label="Edit roles">
        {open && (
          <>
            <div className="sheet__head">
              <div className="grow stack" style={{ gap: 2 }}>
                <span className="h2">{open.name}</span>
                <span className="muted">{open.email}</span>
              </div>
              <IconButton icon="x" label="Close" onClick={() => setOpenId(null)} />
            </div>
            <div className="sheet__body">
              <section className="stack" style={{ gap: 10 }}>
                <h3 className="h3">Course roles</h3>
                {open.roles.map((r) => (
                  <div className="row" key={r.courseId}>
                    <span className="grow truncate">{r.course}</span>
                    <div style={{ width: 130 }}>
                      <Select<Role>
                        value={r.role}
                        onChange={(v) => patch(open.id, { action: "enroll", courseId: r.courseId, role: v }, `${open.name} is now a ${v} in ${r.course}`)}
                        options={[
                          { value: "Teacher", label: "Teacher" },
                          { value: "Grader", label: "Grader" },
                        ]}
                        ariaLabel={`Role in ${r.course}`}
                      />
                    </div>
                    <IconButton icon="trash" label="Remove from course" onClick={() => patch(open.id, { action: "unenroll", courseId: r.courseId }, `Removed from ${r.course}`)} />
                  </div>
                ))}
                {!open.roles.length && <p className="muted">Not in any course yet.</p>}
                <div className="row" style={{ marginTop: 6 }}>
                  <div className="grow">
                    <Select
                      value={addCourse || null}
                      onChange={setAddCourse}
                      placeholder="Add to course…"
                      options={courses.filter((c) => !open.roles.some((r) => r.courseId === c.id)).map((c) => ({ value: c.id, label: c.name }))}
                      ariaLabel="Course"
                    />
                  </div>
                  <div style={{ width: 120 }}>
                    <Select<Role>
                      value={addRole}
                      onChange={setAddRole}
                      options={[
                        { value: "Grader", label: "Grader" },
                        { value: "Teacher", label: "Teacher" },
                      ]}
                      ariaLabel="Role"
                    />
                  </div>
                  <Button
                    variant="secondary"
                    disabled={!addCourse || busy}
                    onClick={async () => {
                      if (await patch(open.id, { action: "enroll", courseId: addCourse, role: addRole }, `Added ${open.name}`)) setAddCourse("");
                    }}
                  >
                    Add
                  </Button>
                </div>
              </section>
              <section className="stack" style={{ gap: 10 }}>
                <h3 className="h3">Site access</h3>
                <Checkbox
                  checked={open.isAdmin}
                  disabled={open.id === meId || busy}
                  onChange={(v) => patch(open.id, { action: "setAdmin", value: v }, v ? `${open.name} is now an administrator` : `${open.name} is no longer an administrator`)}
                  label="Administrator"
                  description={open.id === meId ? "You can't remove your own admin access." : "Approves instructors, manages users and invitations, and changes site settings. Has Teacher access in every course."}
                />
              </section>
              <section className="stack" style={{ gap: 10 }}>
                <h3 className="h3">About roles</h3>
                {(["Teacher", "Grader"] as Role[]).map((r) => (
                  <div key={r} className="stack" style={{ gap: 2 }}>
                    <span style={{ fontWeight: 500 }}>{r}</span>
                    <span className="muted">{ROLE_INFO[r]}</span>
                  </div>
                ))}
              </section>
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}
