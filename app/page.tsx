import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { countUsers } from "@/lib/server/accounts";
import { currentUser } from "@/lib/server/session";
import { getSettings } from "@/lib/server/settings";
import { retentionLabel } from "@/lib/shared/constants";

export const metadata = { title: { absolute: "Jupygrader · AI-assisted grading for Jupyter notebooks" } };

const STEPS: [string, string, string][] = [
  ["teacher", "Set up the assignment", "Add the instructions students received, a rubric (or let the AI draft one from the instructions), and an answer key if you have one."],
  ["upload", "Drop in the files", "Notebooks, code, documents or images, or a single .zip. Exact duplicates are caught before anything is uploaded."],
  ["airplane", "Let it grade in the background", "Files are queued and graded a few at a time. Close the tab and come back later; grading keeps going."],
  ["review", "Review and share", "Check the flagged grades, change any score, and send each student a private link to their feedback."],
];

const SPOTLIGHTS: [string, string, string, string[]][] = [
  [
    "notebooks",
    "Feedback inside the notebook",
    "Downloads keep every original cell, output and piece of metadata. A summary goes at the top and a feedback cell follows each commented cell, so students read it where they did the work.",
    ["Code files get comments in their own syntax", "Grades CSV, plus HTML, text and JSON exports", "One file or a .zip of the whole class"],
  ],
  [
    "results",
    "A second look where it matters",
    "Low-confidence grades and near-identical submissions are flagged for review. Every change to an AI score is kept in the history, and the score breakdown shows how the class did on each rubric line.",
    ["Edit any rubric line or override the total", "Mark files reviewed as you go", "Keyboard shortcuts for moving through a stack"],
  ],
  [
    "team",
    "Built for teaching teams",
    "Teachers set up courses and assignments. Graders and TAs join by email invitation, review files and adjust scores, each with access to their own courses only.",
    ["Teacher and Grader roles per course", "Admins approve instructor accounts", "Activity log of every change"],
  ],
];

const FEATURES: [IconName, string, string][] = [
  ["gauge", "Grading styles from Completion to Strict", "Pick how generous partial credit should be, plus the tone and length of the feedback."],
  ["sparkles", "Rubrics drafted for you", "Skip the rubric, paste or upload one, or let the AI itemize the points from your instructions."],
  ["fileKey", "Answer keys stay private", "Reference solutions guide the AI but are never shown to students."],
  ["bot", "Your choice of model", "Claude through the Anthropic API, or any OpenAI-compatible model, with your own API key."],
  ["coins", "Spending under control", "Admins set a monthly spending cap and how many files are graded at once."],
  ["globe", "Works on any device", "Review grades on a laptop or a phone: the layout adapts to small screens."],
];

export default async function Home() {
  const [me, settings, users] = await Promise.all([currentUser(), getSettings(), countUsers()]);
  const firstRun = users === 0;
  const canRequest = firstRun || settings.openReg;
  const request = firstRun ? "Set up Jupygrader" : "Request an account";

  const ctas = me ? (
    <Link href="/app/courses" className="btn btn--primary home-btn">
      Open Jupygrader
      <Icon name="arrowRight" size={16} />
    </Link>
  ) : (
    <>
      <Link href="/login" className="btn btn--primary home-btn">
        <Icon name="logIn" size={16} />
        Instructor and grader sign in
      </Link>
      {canRequest && (
        <Link href="/register" className="btn btn--outline home-btn">
          {request}
        </Link>
      )}
    </>
  );

  return (
    <div className="home">
      <header className="home-header">
        <div className="home-wrap home-header__inner">
          <Link href="/" className="home-header__brand" aria-label="Jupygrader home">
            <Logo size={28} />
          </Link>
          <nav className="home-nav" aria-label="Sections">
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
            <a href="#students">For students</a>
            <a href="#privacy">Privacy</a>
          </nav>
          <div className="home-header__actions">
            {me ? (
              <Link href="/app/courses" className="btn btn--primary">
                Open app
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn btn--ghost">
                  Sign in
                </Link>
                {canRequest && (
                  <Link href="/register" className="btn btn--primary home-header__request">
                    {firstRun ? "Set up" : "Request access"}
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="home-hero">
          <div className="home-wrap home-hero__inner">
            <div className="home-hero__copy">
              <span className="home-eyebrow">
                <Icon name="notebook" size={14} />
                AI-assisted grading for Jupyter notebooks
              </span>
              <h1 className="home-h1">
                <span>Grade the whole stack.</span> <span className="home-accent">Keep the final say.</span>
              </h1>
              <p className="home-lead">
                Jupygrader grades Jupyter notebooks and other student work against your rubric. You review each result next to the notebook, change any score, and send every
                student a private link to their feedback.
              </p>
              <div className="home-ctas">{ctas}</div>
              {!me && <p className="home-note">Students don&apos;t need an account. Their feedback arrives as a private link from you.</p>}
            </div>
            <img className="home-hero__art" src="/home/hero.webp" width={1200} height={844} alt="The Jupygrader bird typing on a laptop, surrounded by checked papers" />
          </div>
        </section>

        <section className="home-section" id="how-it-works">
          <div className="home-wrap">
            <div className="home-section__head">
              <span className="home-kicker">How it works</span>
              <h2 className="home-h2">From rubric to feedback in four steps</h2>
            </div>
            <ol className="home-steps">
              {STEPS.map(([img, title, body], i) => (
                <li key={img} className="home-step">
                  <img src={`/home/${img}.webp`} width={160} height={160} alt="" loading="lazy" className="home-step__art" />
                  <span className="home-step__num">{i + 1}</span>
                  <h3 className="home-h3">{title}</h3>
                  <p>{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="home-section home-section--tint" id="features">
          <div className="home-wrap">
            <div className="home-section__head">
              <span className="home-kicker">Features</span>
              <h2 className="home-h2">The busywork goes to the bird. The judgement stays with you.</h2>
            </div>
            <div className="home-spotlights">
              {SPOTLIGHTS.map(([img, title, body, points], i) => (
                <div key={img} className={"home-spotlight" + (i % 2 ? " home-spotlight--flip" : "")}>
                  <div className="home-spotlight__art">
                    <img src={`/home/${img}.webp`} width={280} height={280} alt="" loading="lazy" />
                  </div>
                  <div className="home-spotlight__copy">
                    <h3 className="home-h3 home-h3--lg">{title}</h3>
                    <p>{body}</p>
                    <ul className="home-checks">
                      {points.map((p) => (
                        <li key={p}>
                          <Icon name="checkCircle" size={16} />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
            <div className="home-features">
              {FEATURES.map(([icon, title, body]) => (
                <div key={title} className="home-feature">
                  <span className="home-feature__icon">
                    <Icon name={icon} size={18} />
                  </span>
                  <h3 className="home-h3">{title}</h3>
                  <p>{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="home-section" id="students">
          <div className="home-wrap home-band">
            <img src="/home/feedback.webp" width={320} height={310} alt="" loading="lazy" className="home-band__art" />
            <div className="home-band__copy">
              <span className="home-kicker">For students</span>
              <h2 className="home-h2">Feedback, not another login</h2>
              <p>
                Each student gets a private page with their score, the rubric, and their own work with the feedback in place. There is nothing to sign up for, and an instructor
                can turn a link off or replace it at any time.
              </p>
              <p className="home-note">Got a link from your instructor? Just open it. You don&apos;t need to sign in here.</p>
            </div>
          </div>
        </section>

        <section className="home-section home-section--tint" id="privacy">
          <div className="home-wrap home-band home-band--flip">
            <img src="/home/privacy.webp" width={320} height={300} alt="" loading="lazy" className="home-band__art" />
            <div className="home-band__copy">
              <span className="home-kicker">Privacy</span>
              <h2 className="home-h2">Careful with student work</h2>
              <ul className="home-checks">
                <li>
                  <Icon name="checkCircle" size={16} />
                  Each file is graded on its own and identified only by its file name and a fingerprint (SHA-256 hash).
                </li>
                <li>
                  <Icon name="checkCircle" size={16} />
                  Files, scores and feedback are deleted {retentionLabel(settings.retention)} after upload.
                </li>
                <li>
                  <Icon name="checkCircle" size={16} />
                  The AI provider&apos;s API key is stored encrypted, and only admins can change it.
                </li>
                <li>
                  <Icon name="checkCircle" size={16} />
                  Only the people in a course can see its files and grades.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="home-cta">
          <div className="home-wrap home-cta__inner">
            <img src="/home/celebrate.webp" width={480} height={319} alt="" loading="lazy" className="home-cta__art" />
            <h2 className="home-h2">Ready for your next stack of notebooks?</h2>
            <div className="home-ctas home-ctas--center">{ctas}</div>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <div className="home-wrap home-footer__inner">
          <Logo size={22} />
          <span className="muted">AI-assisted grading for Jupyter notebooks.</span>
          <nav className="home-footer__links" aria-label="Account">
            {me ? (
              <Link href="/app/courses">Open app</Link>
            ) : (
              <>
                <Link href="/login">Sign in</Link>
                {canRequest && <Link href="/register">{request}</Link>}
              </>
            )}
          </nav>
        </div>
      </footer>
    </div>
  );
}
