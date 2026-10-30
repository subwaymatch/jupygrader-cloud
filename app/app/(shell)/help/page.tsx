import { HelpTabs } from "@/components/HelpTabs";
import { Icon } from "@/components/ui/Icon";
import { Mascot } from "@/components/ui/Mascot";
import { all } from "@/lib/server/db";
import { pageUser } from "@/lib/server/session";
import { getSettings } from "@/lib/server/settings";
import { retentionLabel, STYLES } from "@/lib/shared/constants";

export const metadata = { title: "Help" };

const PERMS: (string | [string, boolean, boolean, boolean])[] = [
  "Grading",
  ["View courses, assignments and grades", true, true, true],
  ["Upload, grade and regrade files", true, true, true],
  ["Review AI feedback, change scores and mark files reviewed", true, true, true],
  ["Share student links and export results", true, true, true],
  ["Import files from Canvas and post grades to it", true, true, true],
  "Assignments",
  ["Duplicate assignments", true, true, true],
  ["Create, edit, reorder and delete assignments and rubrics", true, false, true],
  ["Link the course and its assignments to Canvas", true, false, true],
  "People",
  ["Invite people and change course roles", true, false, true],
  "Site",
  ["Approve instructor accounts and manage all users", false, false, true],
  ["View the activity log", false, false, true],
  ["Change site settings: AI model, API key, spending cap, data retention and the Canvas address", false, false, true],
];

const yes = (v: boolean) =>
  v ? (
    <span className="perm-yes" aria-label="Yes">
      <Icon name="check" size={16} />
    </span>
  ) : (
    <span className="perm-no" aria-label="No">
      –
    </span>
  );

export default async function HelpPage() {
  const me = await pageUser();
  const s = await getSettings();
  const mine = await all<{ name: string; role: string }>(
    "select c.name, e.role from enrollment e join course c on c.id = e.course_id where e.user_id = ? order by c.name",
    me.id,
  );

  const roles = (
    <div className="stack" style={{ gap: 28 }}>
      {(me.isAdmin || mine.length > 0) && (
        <div className="row row--wrap" style={{ gap: 8 }}>
          <span className="muted">Your access</span>
          {me.isAdmin && <span className="chip chip--blue">Admin for the whole site</span>}
          {mine.map((m, i) => (
            <span className="chip chip--blue" key={m.name + i}>
              {m.role} <span style={{ fontWeight: 400 }}>in {m.name}</span>
            </span>
          ))}
        </div>
      )}
      <div className="role-cards">
        {[
          ["graduationCap", "Teacher", "Per course", "Runs the course. Creates assignments and rubrics, grades, changes scores and manages people.", "Instructors sign up and an admin approves the account. Teachers can also invite other teachers."],
          ["clipboardCheck", "Grader", "Per course", "Uploads files for grading, reviews the AI feedback and changes scores. Cannot edit assignments or manage people.", "Graders and TAs join through an email invite from their instructor."],
          ["shield", "Admin", "Whole site", "Approves instructor accounts, manages users and invitations, and sets the AI model, spending cap and data retention.", "Given by another admin in Users & roles. The first account on the site is an admin."],
        ].map(([icon, title, scope, body, foot]) => (
          <div className="role-card" key={title}>
            <div className="role-card__head">
              <span className="role-card__icon">
                <Icon name={icon} size={15} />
              </span>
              <strong className="grow">{title}</strong>
              <span className="muted">{scope}</span>
            </div>
            <p>{body}</p>
            <p className="muted">{foot}</p>
          </div>
        ))}
      </div>
      <div className="callout">
        <Icon name="link" size={15} />
        <span>
          <strong>Students</strong> don&apos;t have accounts. Each graded file has a student link that shows the score and feedback without signing in.
        </span>
      </div>
      <section className="section">
        <h2 className="h2">What each role can do</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="perm-table">
            <thead>
              <tr>
                <th />
                <th>Teacher</th>
                <th>Grader</th>
                <th>Admin</th>
              </tr>
            </thead>
            <tbody>
              {PERMS.map((p) =>
                typeof p === "string" ? (
                  <tr className="group" key={p}>
                    <td colSpan={4}>{p}</td>
                  </tr>
                ) : (
                  <tr key={p[0]}>
                    <td>{p[0]}</td>
                    <td>{yes(p[1])}</td>
                    <td>{yes(p[2])}</td>
                    <td>{yes(p[3])}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        <p className="muted">Admins have Teacher access in every course. Assignments and people in archived courses can&apos;t be changed.</p>
      </section>
    </div>
  );

  const flow = (
    <div className="stack" style={{ gap: 32 }}>
      <div>
        {[
          ["Set up the assignment", "Teacher", "Add a title, total points and a rubric. Paste rubric text or upload a document, and the AI splits it into scored items you can edit. You can also add an answer key, choose a grading style, set the feedback tone and length, and leave notes for the AI."],
          ["Upload submissions", "Teacher or Grader", "Drop in notebooks or other files, or a .zip of them, or import them from a linked Canvas assignment. Exact copies of a file that was already uploaded are skipped as duplicates. Files that closely match another submission are flagged."],
          ["The AI grades each file", "Automatic", "For every file, the AI scores each rubric item, comments on specific cells or passages and writes a short summary. Files are graded a few at a time in the background, so you can close the page. If grading fails, retry the file."],
          ["Review flagged grades", "Teacher or Grader", "Files the AI wasn't confident about, and close matches, are marked Needs review. Open a file to check its scores next to the notebook, change any item, then mark it reviewed. Changed scores keep the AI's original score visible."],
          ["Share results", "Teacher or Grader", "Send each student their link. It always shows the latest grade, and making a new link stops the old one working. You can also download notebooks with the feedback inserted as cells, export grades as CSV, or post grades and feedback to Canvas."],
          ["Change the setup and regrade", "Teacher", "Editing the rubric, grading style or model doesn't change existing grades. They're marked as graded with earlier settings, and you choose when to regrade them."],
        ].map(([title, who, body], i) => (
          <div className="flow-step" key={title}>
            <span className="step-num">{i + 1}</span>
            <div className="stack" style={{ gap: 4 }}>
              <div className="row row--wrap">
                <strong>{title}</strong>
                <span className="chip">{who}</span>
              </div>
              <p className="muted" style={{ lineHeight: 1.6 }}>
                {body}
              </p>
            </div>
          </div>
        ))}
      </div>
      <section className="section">
        <h2 className="h2">File statuses</h2>
        <div>
          {[
            ["Queued", "Waiting for a grading slot."],
            ["Grading", "The AI is grading the file."],
            ["Graded", "Scores and feedback are ready."],
            ["Failed", "Grading didn't finish. Retry the file."],
            ["Duplicate", "Identical to a file already uploaded, so it isn't graded again unless you ask."],
            ["Cancelled", "Grading was stopped before it started. Grade it later or remove it."],
          ].map(([k, v]) => (
            <div className="def-row" key={k}>
              <strong>{k}</strong>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  const ai = (
    <div className="stack" style={{ gap: 32 }}>
      <p style={{ lineHeight: 1.6 }}>The AI grades each submission against the assignment&apos;s rubric and writes the feedback. Teachers and graders can review and change any result.</p>
      <div className="two-col" style={{ gap: 32 }}>
        <section className="section">
          <h2 className="h2">What the AI receives</h2>
          <ul className="bullets">
            <li>
              The submitted file, with notebook outputs
              {s.aiImages.mode === "none" ? "" : s.aiImages.mode === "limit" ? ` and up to ${s.aiImages.limit} plots` : " and its plots"}, unless the
              assignment sets how many plots and interactive outputs to send
            </li>
            <li>The assignment instructions</li>
            <li>The rubric items and their points</li>
            <li>The answer key, if one was added</li>
            <li>The grading style, feedback tone and length</li>
            <li>Notes for the AI, if any</li>
          </ul>
        </section>
        <section className="section">
          <h2 className="h2">What it sends back</h2>
          <ul className="bullets">
            <li>A score and comment for each rubric item</li>
            <li>Inline comments on specific cells, lines or passages</li>
            <li>A short summary</li>
            <li>A confidence signal, used to flag files for review</li>
          </ul>
        </section>
      </div>
      <section className="section">
        <h2 className="h2">Where people stay in control</h2>
        <ul className="bullets">
          <li>Teachers and graders can change any score. The AI&apos;s original score stays visible next to the change.</li>
          <li>Low-confidence grades and close matches between submissions are flagged for review.</li>
          <li>Answer keys are never shown to students or included in feedback.</li>
          <li>Each grade records the rubric version, grading style and model used, so grades from earlier settings are easy to find and regrade.</li>
          <li>Student feedback pages say the work was graded with AI.</li>
        </ul>
      </section>
      <section className="section">
        <h2 className="h2">Grading styles</h2>
        <div>
          {STYLES.map((st) => (
            <div className="def-row" key={st.id}>
              <strong>{st.name}</strong>
              <span>
                {st.desc}
                {st.id === "balanced" ? " This is the default." : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="section">
        <h2 className="h2">Model, cost and data</h2>
        <div>
          <div className="def-row">
            <strong>Model</strong>
            <span>
              Grading uses <strong>{s.model || "a model chosen by an admin"}</strong> through{" "}
              {s.aiProvider === "anthropic" ? "the Anthropic API" : "an OpenAI-compatible API"} chosen by an admin.
            </span>
          </div>
          <div className="def-row">
            <strong>Cost</strong>
            <span>The API reports the tokens used by each request. Jupygrader estimates cost from those counts, and admins can pause grading at a monthly spending cap.</span>
          </div>
          <div className="def-row">
            <strong>Retention</strong>
            <span>
              Files, scores and feedback are deleted {retentionLabel(s.retention)} after upload, and student links stop working. Only file fingerprints are kept, so duplicates
              can still be detected.
            </span>
          </div>
          <div className="def-row">
            <strong>Sent to the AI</strong>
            <span>The submitted file, the instructions, rubric, answer key and grading settings. File names are replaced with an anonymous label. Names written inside a file are sent as they are.</span>
          </div>
          <div className="def-row">
            <strong>Not sent</strong>
            <span>Student names from file names, email addresses, scores from other files and anything in Jupygrader accounts.</span>
          </div>
        </div>
      </section>
    </div>
  );

  return (
    <div className="page page--medium" style={{ maxWidth: 1000 }}>
      <div className="page-head page-head--mascot">
        <div className="page-head__text">
          <h1 className="h1">Help</h1>
          <p className="lede">What each role can do, how grading works and how the AI is used.</p>
        </div>
        <Mascot pose="lifebuoy" size={96} className="page-head__mascot" />
      </div>
      <HelpTabs roles={roles} flow={flow} ai={ai} />
    </div>
  );
}
