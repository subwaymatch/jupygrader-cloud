import { MAX_DOC_BYTES } from "@/lib/shared/constants";
import { documentText } from "@/lib/server/extract";
import { badRequest, handle } from "@/lib/server/http";
import { randomId } from "@/lib/server/ids";
import { requireUser } from "@/lib/server/session";
import { putFile, safeName } from "@/lib/server/storage";
import { getEnv } from "@/lib/server/env";

/**
 * Stores an instructions, rubric or answer-key document and extracts its text.
 * The returned key is attached to an assignment when it is saved.
 */
export const POST = handle(async (req: Request) => {
  const me = await requireUser(req);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Choose a file to upload.");
  if (file.size > MAX_DOC_BYTES) throw badRequest("Files can be up to 15 MB.");
  if (!file.size) throw badRequest("This file is empty.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = `docs/${me.id}/${randomId(12)}/${safeName(file.name)}`;
  let text = "";
  try {
    text = (await documentText(file.name, bytes)).slice(0, 200_000);
  } catch (err) {
    console.error("text extraction failed", err);
  }
  await getEnv().FILES.put(key, bytes, {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { name: file.name.slice(0, 200) },
  });
  if (text) await putFile(key + ".txt", text, "text/plain; charset=utf-8");
  return Response.json({ key, name: file.name, size: file.size, type: file.type, hasText: !!text.trim(), preview: text.slice(0, 4000) });
});
