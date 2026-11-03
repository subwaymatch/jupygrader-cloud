import { canvasFor } from "@/lib/server/canvas";
import { handle } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

/** Canvas courses the signed-in person teaches or assists in, for linking. */
export const GET = handle(async (req: Request) => {
  const me = await requireUser(req);
  const courses = await (await canvasFor(me.id)).teachingCourses();
  return Response.json({
    courses: courses.map((c) => ({ id: String(c.id), name: c.name, code: c.course_code || "", term: c.term?.name || "" })),
  });
});
