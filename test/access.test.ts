// Who can reach what through the API. Each route runs for real against an in-memory database;
// only the session is stood in for (test/helpers/seed.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { first } from "@/lib/server/db";
import { resetEnv } from "./helpers/env";
import { addAssignment, addCourse, addSubmission, addUser, params, request, tokenOf } from "./helpers/seed";

vi.mock("@/lib/server/session", async () => (await import("./helpers/seed")).sessionMock());

import * as settingsRoute from "@/app/api/admin/settings/route";
import * as adminUserRoute from "@/app/api/admin/users/[id]/route";
import * as actionsRoute from "@/app/api/assignments/[id]/actions/route";
import * as duplicateRoute from "@/app/api/assignments/[id]/duplicate/route";
import * as gradesRoute from "@/app/api/assignments/[id]/grades/route";
import * as assignmentRoute from "@/app/api/assignments/[id]/route";
import * as similarityRoute from "@/app/api/assignments/[id]/similarity/route";
import * as listRoute from "@/app/api/assignments/[id]/submissions/route";
import * as newAssignmentRoute from "@/app/api/courses/[id]/assignments/route";
import * as invitesRoute from "@/app/api/courses/[id]/invites/route";
import * as memberRoute from "@/app/api/courses/[id]/members/[userId]/route";
import * as resetRoute from "@/app/api/courses/[id]/reset/route";
import * as courseRoute from "@/app/api/courses/[id]/route";
import * as invitationRoute from "@/app/api/invitations/[id]/route";
import * as downloadRoute from "@/app/api/submissions/[id]/download/route";
import * as submissionRoute from "@/app/api/submissions/[id]/route";
import * as studentDownloadRoute from "@/app/r/[token]/download/route";

// Course A: tess teaches, gary grades. Course B belongs to olga, who has nothing to do with A.
// Course Z ended last year, so it's archived. ada is a site administrator in no course.
beforeEach(async () => {
  resetEnv();
  vi.spyOn(console, "log").mockImplementation(() => {});
  for (const u of ["tess", "gary", "olga"]) await addUser(u);
  await addUser("ada", { admin: true });
  await addUser("pat", { status: "pending" });
  await addUser("dana", { status: "disabled" });
  await addCourse("A", { tess: "Teacher", gary: "Grader", dana: "Teacher" });
  await addCourse("B", { olga: "Teacher" });
  await addCourse("Z", { tess: "Teacher" }, "2020-01-01");
  await addAssignment("a1", "A");
  await addAssignment("b1", "B");
  await addAssignment("z1", "Z");
  await addSubmission("s1", "a1");
  await addSubmission("sb", "b1");
  await addSubmission("sz", "z1");
});

type Who = "nobody" | "olga" | "gary" | "tess" | "ada" | "pat" | "dana";
const as = (who: Who) => (who === "nobody" ? null : who);

/** Runs a route as each person and returns the statuses. */
async function statuses(people: Who[], call: (user: string | null) => Promise<Response>) {
  const out: Record<string, number> = {};
  for (const who of people) out[who] = (await call(as(who))).status;
  return out;
}

const everyone: Who[] = ["nobody", "pat", "dana", "olga", "gary", "tess", "ada"];
// Signed out, not approved yet, and deactivated all count as nobody. Someone outside the course is told it doesn't exist.
const lockedOut = { nobody: 401, pat: 401, dana: 401, olga: 404 };

describe("reading a course's work", () => {
  const readable = { ...lockedOut, gary: 200, tess: 200, ada: 200 };

  it("an assignment", async () => {
    expect(await statuses(everyone, (u) => assignmentRoute.GET(request(u, "GET", "/api/assignments/a1"), params({ id: "a1" })))).toEqual(readable);
  });

  it("its list of files", async () => {
    expect(await statuses(everyone, (u) => listRoute.GET(request(u, "GET", "/api/assignments/a1/submissions"), params({ id: "a1" })))).toEqual(readable);
  });

  it("one file's feedback", async () => {
    expect(await statuses(everyone, (u) => submissionRoute.GET(request(u, "GET", "/api/submissions/s1"), params({ id: "s1" })))).toEqual(readable);
  });

  it("the grades CSV and a feedback download", async () => {
    expect(await statuses(everyone, (u) => gradesRoute.GET(request(u, "GET", "/api/assignments/a1/grades"), params({ id: "a1" })))).toEqual(readable);
    expect(
      await statuses(everyone, (u) => downloadRoute.GET(request(u, "GET", "/api/submissions/s1/download?format=json"), params({ id: "s1" }))),
    ).toEqual(readable);
  });

  it("gives nothing away about another course's files, whatever the route", async () => {
    // tess teaches A and Z, not B.
    expect((await submissionRoute.GET(request("tess", "GET", "/api/submissions/sb"), params({ id: "sb" }))).status).toBe(404);
    expect((await downloadRoute.GET(request("tess", "GET", "/api/submissions/sb/download?format=json"), params({ id: "sb" }))).status).toBe(404);
    expect((await listRoute.GET(request("tess", "GET", "/api/assignments/b1/submissions"), params({ id: "b1" }))).status).toBe(404);
    // Naming another course's file in an action on your own assignment does nothing to it.
    const res = await actionsRoute.POST(request("tess", "POST", "/api/assignments/a1/actions", { action: "remove", ids: ["sb"] }), params({ id: "a1" }));
    expect(await res.json()).toEqual({ count: 0 });
    expect(await first("select id from submission where id = 'sb'")).not.toBeNull();
  });
});

describe("grading", () => {
  const graders = { ...lockedOut, gary: 200, tess: 200, ada: 200 };

  it("changing a grade, reviewing and file actions are for the course's graders and teachers", async () => {
    expect(
      await statuses(everyone, (u) => submissionRoute.PATCH(request(u, "PATCH", "/api/submissions/s1", { action: "review", reviewed: true }), params({ id: "s1" }))),
    ).toEqual(graders);
    expect(
      await statuses(everyone, (u) => actionsRoute.POST(request(u, "POST", "/api/assignments/a1/actions", { action: "cancel", ids: ["s1"] }), params({ id: "a1" }))),
    ).toEqual(graders);
    expect(await statuses(everyone, (u) => duplicateRoute.POST(request(u, "POST", "/api/assignments/a1/duplicate"), params({ id: "a1" })))).toEqual(graders);
  });
});

describe("managing a course", () => {
  // A grader is in the course, so they're told no rather than that it doesn't exist.
  const teachers = { ...lockedOut, gary: 403, tess: 200, ada: 200 };

  it("editing an assignment", async () => {
    expect(
      await statuses(everyone, (u) => assignmentRoute.PATCH(request(u, "PATCH", "/api/assignments/a1", { title: "Renamed" }), params({ id: "a1" }))),
    ).toEqual(teachers);
    expect(
      await statuses(everyone, (u) => similarityRoute.POST(request(u, "POST", "/api/assignments/a1/similarity", {}), params({ id: "a1" }))),
    ).toEqual(teachers);
  });

  it("creating an assignment, renaming the course and inviting people", async () => {
    const body = { title: "New", points: 10, rubricMethod: "none" };
    expect(await statuses(everyone, (u) => newAssignmentRoute.POST(request(u, "POST", "/api/courses/A/assignments", body), params({ id: "A" })))).toEqual(teachers);
    expect(await statuses(everyone, (u) => courseRoute.PATCH(request(u, "PATCH", "/api/courses/A", { name: "Renamed" }), params({ id: "A" })))).toEqual(teachers);
    expect(
      await statuses(everyone, (u) => invitesRoute.POST(request(u, "POST", "/api/courses/A/invites", { emails: "new@school.test", role: "Grader" }), params({ id: "A" }))),
    ).toEqual(teachers);
  });

  it("a grader can't delete an assignment, empty or delete the course, or change who is in it", async () => {
    const refused = { nobody: 401, olga: 404, gary: 403 };
    const some: Who[] = ["nobody", "olga", "gary"];
    expect(await statuses(some, (u) => assignmentRoute.DELETE(request(u, "DELETE", "/api/assignments/a1"), params({ id: "a1" })))).toEqual(refused);
    expect(await statuses(some, (u) => resetRoute.POST(request(u, "POST", "/api/courses/A/reset"), params({ id: "A" })))).toEqual(refused);
    expect(await statuses(some, (u) => courseRoute.DELETE(request(u, "DELETE", "/api/courses/A"), params({ id: "A" })))).toEqual(refused);
    expect(
      await statuses(some, (u) => memberRoute.PATCH(request(u, "PATCH", "/api/courses/A/members/gary", { role: "Teacher" }), params({ id: "A", userId: "gary" }))),
    ).toEqual(refused);
    expect(await statuses(some, (u) => memberRoute.DELETE(request(u, "DELETE", "/api/courses/A/members/tess"), params({ id: "A", userId: "tess" })))).toEqual(refused);
    // Everything is still there.
    expect(await first("select id from assignment where id = 'a1'")).not.toBeNull();
    expect((await first<{ role: string }>("select role from enrollment where course_id = 'A' and user_id = 'gary'"))?.role).toBe("Grader");
  });

  it("a teacher can't revoke another course's invitation", async () => {
    await invitesRoute.POST(request("olga", "POST", "/api/courses/B/invites", { emails: "new@school.test", role: "Grader" }), params({ id: "B" }));
    const inv = (await first<{ id: string }>("select id from invitation where course_id = 'B'"))!;
    expect((await invitationRoute.DELETE(request("tess", "DELETE", "/api/invitations/" + inv.id), params({ id: inv.id }))).status).toBe(404);
    expect((await invitationRoute.DELETE(request("olga", "DELETE", "/api/invitations/" + inv.id), params({ id: inv.id }))).status).toBe(200);
  });
});

describe("an archived course", () => {
  it("can be read but not changed, even by its teacher or an administrator", async () => {
    for (const who of ["tess", "ada"]) {
      expect((await assignmentRoute.GET(request(who, "GET", "/api/assignments/z1"), params({ id: "z1" }))).status).toBe(200);
      expect((await assignmentRoute.PATCH(request(who, "PATCH", "/api/assignments/z1", { title: "X" }), params({ id: "z1" }))).status).toBe(403);
      expect((await submissionRoute.PATCH(request(who, "PATCH", "/api/submissions/sz", { action: "override", score: 1 }), params({ id: "sz" }))).status).toBe(403);
      expect((await actionsRoute.POST(request(who, "POST", "/api/assignments/z1/actions", { action: "remove", ids: ["sz"] }), params({ id: "z1" }))).status).toBe(403);
    }
    expect((await first<{ score: number }>("select score from submission where id = 'sz'"))?.score).toBe(15);
  });
});

describe("site administration", () => {
  it("is for administrators only", async () => {
    const admins = { nobody: 401, pat: 401, dana: 401, olga: 403, gary: 403, tess: 403, ada: 200 };
    expect(await statuses(everyone, (u) => settingsRoute.PUT(request(u, "PUT", "/api/admin/settings", { concurrency: 4 })))).toEqual(admins);
    expect(
      await statuses(everyone, (u) => adminUserRoute.PATCH(request(u, "PATCH", "/api/admin/users/gary", { action: "enroll", courseId: "B", role: "Grader" }), params({ id: "gary" }))),
    ).toEqual(admins);
  });

  it("a teacher can't make themselves an administrator or deactivate anyone", async () => {
    expect((await adminUserRoute.PATCH(request("tess", "PATCH", "/api/admin/users/tess", { action: "setAdmin", value: true }), params({ id: "tess" }))).status).toBe(403);
    expect((await adminUserRoute.PATCH(request("tess", "PATCH", "/api/admin/users/gary", { action: "deactivate" }), params({ id: "gary" }))).status).toBe(403);
    expect((await first<{ isAdmin: number }>(`select isAdmin from "user" where id = 'tess'`))?.isAdmin).toBe(0);
  });

  it("the last administrator can't be deactivated or deleted, and nobody deactivates themselves", async () => {
    await addUser("bea", { admin: true });
    expect((await adminUserRoute.PATCH(request("ada", "PATCH", "/api/admin/users/ada", { action: "deactivate" }), params({ id: "ada" }))).status).toBe(400);
    expect((await adminUserRoute.PATCH(request("ada", "PATCH", "/api/admin/users/bea", { action: "deactivate" }), params({ id: "bea" }))).status).toBe(200);
    // bea is deactivated, so ada is the only administrator who can sign in.
    expect((await adminUserRoute.PATCH(request("bea", "PATCH", "/api/admin/users/ada", { action: "remove" }), params({ id: "ada" }))).status).toBe(401);
    expect((await first<{ status: string }>(`select status from "user" where id = 'bea'`))?.status).toBe("disabled");
  });
});

describe("student links", () => {
  const open = (token: string, user: string | null = null) =>
    studentDownloadRoute.GET(request(user, "GET", `/r/${token}/download?format=txt`), params({ token }));

  it("open without an account, for a graded file that isn't waiting for review", async () => {
    expect((await open(tokenOf("s1"))).status).toBe(200);
    expect((await open("not-a-real-token")).status).toBe(404);
  });

  it("stay closed to students while a flagged file hasn't been reviewed", async () => {
    await addSubmission("low", "a1", { confidence: "low" });
    await addSubmission("near", "a1", { nearOf: "s1" });
    await addSubmission("seen", "a1", { nearOf: "s1", reviewed: true });
    expect((await open(tokenOf("low"))).status).toBe(404);
    expect((await open(tokenOf("near"))).status).toBe(404);
    expect((await open(tokenOf("seen"))).status).toBe(200);
    // The course's staff can preview it. Someone from another course can't.
    expect((await open(tokenOf("low"), "gary")).status).toBe(200);
    expect((await open(tokenOf("low"), "olga")).status).toBe(404);
    // Reviewing it opens the link.
    await submissionRoute.PATCH(request("gary", "PATCH", "/api/submissions/low", { action: "review", reviewed: true }), params({ id: "low" }));
    expect((await open(tokenOf("low"))).status).toBe(200);
  });

  it("stop working when turned off or replaced", async () => {
    await submissionRoute.PATCH(request("gary", "PATCH", "/api/submissions/s1", { action: "share", on: false }), params({ id: "s1" }));
    expect((await open(tokenOf("s1"))).status).toBe(404);
    await submissionRoute.PATCH(request("gary", "PATCH", "/api/submissions/s1", { action: "resetLink" }), params({ id: "s1" }));
    expect((await open(tokenOf("s1"))).status).toBe(404);
    const fresh = (await first<{ share_token: string }>("select share_token from submission where id = 's1'"))!.share_token;
    expect((await open(fresh)).status).toBe(200);
  });
});
