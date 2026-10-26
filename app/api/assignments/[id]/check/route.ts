import { requireAssignment } from "@/lib/server/access";
import { handle, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { findDuplicate } from "@/lib/server/submissions";

/** Before uploading: which of these files (by SHA-256) are already in the assignment. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireUser(req);
  const { id } = await ctx.params;
  await requireAssignment(me, id, "grade", true);
  const { files } = await readJson<{ files?: { name: string; sha256: string }[] }>(req);
  const out: { name: string; sha256: string; duplicateOf: string | null }[] = [];
  for (const f of (files || []).slice(0, 1000)) {
    const dup = /^[0-9a-f]{64}$/.test(f.sha256) ? await findDuplicate(id, f.sha256) : null;
    out.push({ name: f.name, sha256: f.sha256, duplicateOf: dup?.file ?? null });
  }
  return Response.json({ files: out });
});
