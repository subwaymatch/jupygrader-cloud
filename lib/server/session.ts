import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Me } from "@/lib/shared/types";
import { getAuth } from "./auth";
import { first } from "./db";
import { forbidden, unauthorized } from "./http";

type UserRow = { id: string; name: string; email: string; isAdmin: number; status: string; notifyEmail: number };

export async function getSessionUser(h: Headers): Promise<Me | null> {
  let session;
  try {
    session = await getAuth().api.getSession({ headers: h });
  } catch {
    return null;
  }
  if (!session) return null;
  const u = await first<UserRow>('select id, name, email, isAdmin, status, notifyEmail from "user" where id = ?', session.user.id);
  if (!u || u.status !== "active") return null;
  return { id: u.id, name: u.name, email: u.email, isAdmin: !!u.isAdmin, notifyEmail: !!u.notifyEmail };
}

export async function requireUser(req: Request): Promise<Me> {
  const u = await getSessionUser(req.headers);
  if (!u) throw unauthorized();
  return u;
}

export async function requireAdmin(req: Request): Promise<Me> {
  const u = await requireUser(req);
  if (!u.isAdmin) throw forbidden("Only administrators can do that.");
  return u;
}

/** For server components: the signed-in user, or null. */
export async function currentUser(): Promise<Me | null> {
  return getSessionUser(await headers());
}

/** For server components: the signed-in user, redirecting to sign-in if there is none. */
export async function pageUser(): Promise<Me> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function pageAdmin(): Promise<Me> {
  const u = await pageUser();
  if (!u.isAdmin) redirect("/app/courses");
  return u;
}
