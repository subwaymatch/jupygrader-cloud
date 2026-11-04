import Link from "next/link";
import { DevicesMini, DuplicatesMini, FormatsMini, RubricMini, StylesMini } from "@/components/home/FeatureMinis";
import { NotebookMock, ReviewMock, TeamMock } from "@/components/home/FeatureMocks";
import { HeroLand, HeroWindow } from "@/components/home/Hero";
import { HomeHeader } from "@/components/home/HomeHeader";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { countUsers } from "@/lib/server/accounts";
import { currentUser } from "@/lib/server/session";
import { getSettings } from "@/lib/server/settings";
import { retentionLabel } from "@/lib/shared/constants";

export const metadata = { title: { absolute: "Jupygrader · AI-assisted grading for Jupyter notebooks" } };

const WORKS_WITH: [IconName, string][] = [
  ["notebook", "Jupyter notebooks"],
  ["code", "Python, R and other code"],
  ["fileText", "PDF, Word and Markdown"],
  ["archive", "A .zip of the whole class"],
  ["link", "Canvas"],
];

const STEPS: [string, string, string][] = [
  ["teacher", "Set up the assignment", "Add the instructions students received, a rubric (or let the AI draft one), and an answer key if you have one."],
  ["upload", "Drop in the files", "Notebooks, code, documents or images, or a single .zip. Exact duplicates are caught before anything is uploaded."],
  ["airplane", "Let it grade in the background", "Files are graded a few at a time. Close the tab and come back later: grading keeps going."],
  ["review", "Review and share", "Check the flagged grades, change any score, and send each student a private link to their feedback."],
];

const SPOTLIGHTS: [React.ReactNode, string, string, string[]][] = [
  [
    <NotebookMock key="nb" />,
    "Feedback inside the notebook",
    "Downloads keep every original cell, output and piece of metadata. A summary goes at the top and a feedback cell follows each commented cell, so students read it where they did the work.",
    ["Code files get comments in their own syntax", "Grades CSV, plus HTML, text and JSON exports", "One file or a .zip of the whole class"],
  ],
  [
    <ReviewMock key="rv" />,
    "A second look where it matters",
    "Low-confidence grades and near-identical submissions are flagged for review. Every change to an AI score is kept in the history, and the score breakdown shows how the class did on each rubric line.",
    ["Edit any rubric line or override the total", "Mark files reviewed as you go", "Keyboard shortcuts for moving through a stack"],
  ],
  [
    <TeamMock key="tm" />,
    "Built for teaching teams",
    "Teachers set up courses and assignments. Graders and TAs join by email invitation, review files and adjust scores, each with access to their own courses only.",
    ["Teacher and Grader roles per course", "Admins approve instructor accounts", "Activity log of every change"],
  ],
];

// The first two take half the row; the other three share the next row.
const FEATURES: [React.ReactNode, string, string][] = [
  [<StylesMini key="st" />, "Grading styles from Completion to Strict.", "Choose how generous partial credit should be, and the tone and length of the feedback."],
  [<RubricMini key="rb" />, "Rubrics drafted for you.", "Skip the rubric, paste or upload one, or let the AI itemize the points from your instructions."],
  [<FormatsMini key="fm" />, "Instructions in any format.", "Paste the instructions or upload the PDF, Word or Markdown file students received."],
  [<DuplicatesMini key="dp" />, "Duplicates caught early.", "Exact copies are skipped before upload, and near-identical work is flagged for a closer look."],
  [<DevicesMini key="dv" />, "Works on any device.", "Review grades on a laptop or a phone: the layout adapts to small screens."],
];

export default async function Home() {
  const [me, settings, users] = await Promise.all([currentUser(), getSettings(), countUsers()]);
  const firstRun = users === 0;
  const canRequest = firstRun || settings.openReg;
  const request = firstRun ? "Set up Jupygrader" : "Request an account";

  const PRIVACY: [string, string][] = [
    ["One file at a time", "Each file is graded on its own and identified only by its file name and a fingerprint (SHA-256 hash)."],
    ["Deleted on schedule", `Files, scores and feedback are deleted ${retentionLabel(settings.retention)} after upload.`],
    ["Keys kept encrypted", "API keys are stored encrypted, and only admins can change site settings."],
    ["Course members only", "Only the people in a course can see its files and grades."],
  ];

  const FAQ: [string, string][] = [
    [
      "Do students need an account?",
      "No. Each student gets a private link to a page with their score, the rubric, and their work with the feedback in place. An instructor can turn a link off or replace it at any time.",
    ],
    [
      "What kinds of files can it grade?",
      "Jupyter notebooks, code files (Python, R, Java and many more), documents (PDF, Word, Markdown and text) and images. Upload them one at a time or as a single .zip.",
    ],
    [
      "Can I change a grade the AI gave?",
      "Yes. Edit any rubric line or override the total. The AI's own score stays visible next to yours, and every change is kept in the history.",
    ],
    [
      "Does it work with Canvas?",
      "Yes. Link a course to its Canvas course, import the files students submitted, and post grades back with a comment and the file with feedback attached. Each person connects their own Canvas account, so Canvas's permissions apply.",
    ],
    [
      "Which AI does it use?",
      "The one your admin connects: any OpenAI-compatible API, or Anthropic's. The API key is stored encrypted, and only admins can change it.",
    ],
  ];

  // The calls to action. On the hero's blue sky they're white and glassy; lower down, a glossy blue.
  const ctas = (onSky: boolean) =>
    me ? (
      <Link href="/app/courses" className={"btn home-btn " + (onSky ? "home-btn--light" : "home-btn--glow")}>
        Open Jupygrader
        <Icon name="arrowRight" size={18} />
      </Link>
    ) : (
      <>
        <Link href="/login" className={"btn home-btn " + (onSky ? "home-btn--light" : "home-btn--glow")}>
          <Icon name="logIn" size={18} />
          Instructor and grader sign in
        </Link>
        {canRequest && (
          <Link href="/register" className={"btn home-btn " + (onSky ? "home-btn--glass" : "home-btn--soft")}>
            {request}
          </Link>
        )}
      </>
    );

  return (
    <div className="home">
      <HomeHeader>
        <div className="home-wrap home-header__inner">
          <Link href="/" className="home-header__brand" aria-label="Jupygrader home">
            <Logo size={28} />
          </Link>
          <nav className="home-nav" aria-label="Sections">
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
            <a href="#students">For students</a>
            <a href="#privacy">Privacy</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="home-header__actions">
            {me ? (
              <Link href="/app/courses" className="btn home-btn home-btn--sm home-header__cta">
                Open app
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn home-btn home-btn--sm home-header__signin">
                  Sign in
                </Link>
                {canRequest && (
                  <Link href="/register" className="btn home-btn home-btn--sm home-header__cta home-header__request">
                    {firstRun ? "Set up" : "Request access"}
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </HomeHeader>

      <main>
        <section className="home-hero">
          <div className="home-hero__sky">
            <div className="home-wrap home-hero__copy">
              <h1 className="home-h1">AI-assisted grading for Jupyter notebooks</h1>
              <p className="home-lead">
                Upload your students&apos; notebooks and a rubric. Jupygrader scores each one, adds feedback cells where they belong, and leaves the final say to you.
              </p>
              <div className="home-ctas home-ctas--center">{ctas(true)}</div>
              {!me && <p className="home-hero__note">Students don&apos;t need an account. They get feedback through a private link.</p>}
            </div>
          </div>
          <HeroLand />
          <div className="home-wrap home-hero__stage">
            <HeroWindow />
          </div>
          <div className="home-wrap">
            <ul className="home-works" aria-label="Works with">
              {WORKS_WITH.map(([icon, label]) => (
                <li key={label}>
                  <Icon name={icon} size={20} />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="home-section" id="how-it-works">
          <div className="home-wrap">
            <div className="home-section__head">
              <h2 className="home-h2">How it works</h2>
              <p className="home-sub">From rubric to feedback in four steps.</p>
            </div>
            <ol className="home-steps">
              {STEPS.map(([img, title, body], i) => (
                <li key={img} className="home-step home-reveal">
                  <div className="home-panel home-step__art">
                    <span className="home-step__num">{String(i + 1).padStart(2, "0")}</span>
                    <img src={`/home/${img}.webp`} width={220} height={220} alt="" loading="lazy" style={{ animationDelay: `${-i * 0.9}s` }} />
                  </div>
                  <h3 className="home-h3">{title}</h3>
                  <p>{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="home-section" id="features">
          <div className="home-wrap">
            <div className="home-section__head">
              <h2 className="home-h2">The busywork goes to the bird. The judgement stays with you.</h2>
            </div>
            <div className="home-spotlights">
              {SPOTLIGHTS.map(([mock, title, body, points], i) => (
                <div key={title} className={"home-spotlight home-reveal" + (i % 2 ? " home-spotlight--flip" : "")}>
                  <div className="home-panel home-spotlight__mock">{mock}</div>
                  <div className="home-spotlight__copy">
                    <h3 className="home-h3 home-h3--lg">{title}</h3>
                    <p>{body}</p>
                    <ul className="home-checks">
                      {points.map((p) => (
                        <li key={p}>
                          <Icon name="checkCircle" size={20} />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
            <div className="home-features">
              {FEATURES.map(([mini, title, body], i) => (
                <div key={title} className={"home-feature home-reveal" + (i < 2 ? " home-feature--wide" : "")}>
                  {mini}
                  <div className="home-feature__text">
                    <h3>{title}</h3> <p>{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="home-section" id="students">
          <div className="home-wrap home-band">
            <div className="home-panel home-band__art">
              <img src="/home/feedback.webp" width={360} height={348} alt="" loading="lazy" />
            </div>
            <div className="home-band__copy">
              <span className="home-label">For students</span>
              <h2 className="home-h2">Feedback, not another login</h2>
              <p>
                Each student gets a private page with their score, the rubric, and their own work with the feedback in place. There is nothing to sign up for, and an instructor
                can turn a link off or replace it at any time.
              </p>
              <p className="home-note">Got a link from your instructor? Just open it. You don&apos;t need to sign in here.</p>
            </div>
          </div>
        </section>

        <section className="home-section" id="privacy">
          <div className="home-wrap home-band home-band--flip">
            <div className="home-panel home-band__art">
              <img src="/home/privacy.webp" width={360} height={337} alt="" loading="lazy" />
            </div>
            <div className="home-band__copy">
              <span className="home-label">Privacy</span>
              <h2 className="home-h2">Careful with student work</h2>
              <dl className="home-facts">
                {PRIVACY.map(([title, body]) => (
                  <div key={title} className="home-fact">
                    <dt>{title}</dt>
                    <dd>{body}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <section className="home-section" id="faq">
          <div className="home-wrap home-faq">
            <h2 className="home-h2">Frequently asked questions</h2>
            <div className="home-faq__list">
              {FAQ.map(([q, a]) => (
                <details key={q} className="home-faq__item">
                  <summary>
                    {q}
                    <Icon name="chevronDown" size={22} />
                  </summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="home-cta">
          <div className="home-wrap home-cta__inner">
            <div className="home-cta__copy">
              <h2 className="home-cta__title">
                Ready for your next stack of notebooks?
                <span>Let the bird take the first pass.</span>
              </h2>
              <div className="home-ctas">{ctas(false)}</div>
            </div>
            <img src="/home/celebrate.webp" width={480} height={319} alt="" loading="lazy" className="home-cta__art" />
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <div className="home-wrap">
          <div className="home-footer__inner">
            <Logo size={26} />
            <span className="home-footer__tag">AI-assisted grading for Jupyter notebooks.</span>
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
        </div>
      </footer>
    </div>
  );
}
