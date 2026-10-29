import { Icon } from "@/components/ui/Icon";

/*
 * Small animated pictures for the feature list on the home page. Like the mock-ups in FeatureMocks they are
 * decorative, use CSS animations only, and show a finished state when the visitor prefers reduced motion.
 * mk-turn4 and mk-turn3 elements take turns (a quarter or a third of the loop each); --i says which turn is theirs.
 */

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

function Stage({ loop, cycle = true, children }: { loop: number; cycle?: boolean; children: React.ReactNode }) {
  return (
    <div className="home-feature__stage" aria-hidden="true" style={{ "--mk": `${loop}s` } as Vars}>
      <div className={"mini" + (cycle ? " mini--cycle" : "")}>{children}</div>
    </div>
  );
}

const STYLE_TURNS: [string, string, string][] = [
  ["Completion", "20", "Every part was attempted, so every part gets full credit."],
  ["Lenient", "18", "The main ideas are right. Two small slips cost 2 points."],
  ["Balanced", "16", "A correct approach, but the chart has no axis labels or title."],
  ["Strict", "13", "The chart needs labels and a title, and the summary table is incomplete."],
];

/** The same notebook graded in each style, from Completion to Strict. */
export function StylesMini() {
  return (
    <Stage loop={12}>
      <div className="fsm">
        <div className="fsm__seg">
          <span className="fsm__pill" />
          {STYLE_TURNS.map(([name]) => (
            <span key={name}>{name}</span>
          ))}
        </div>
        <div className="fsm__card">
          <div className="fsm__head">
            <span className="fsm__file">
              <Icon name="notebook" size={15} />
              alice_hw2.ipynb
            </span>
            <span className="fsm__score">
              <span className="mk-stack">
                {STYLE_TURNS.map(([name, score], i) => (
                  <span key={name} className={"mk-turn4" + (i === 2 ? " mk-rest" : "")} style={{ "--i": i } as Vars}>
                    {score}
                  </span>
                ))}
              </span>{" "}
              / 20
            </span>
          </div>
          <span className="fsm__bar">
            <span />
          </span>
          <span className="mk-stack fsm__note">
            {STYLE_TURNS.map(([name, , note], i) => (
              <span key={name} className={"mk-turn4" + (i === 2 ? " mk-rest" : "")} style={{ "--i": i } as Vars}>
                {note}
              </span>
            ))}
          </span>
        </div>
        <div className="fsm__opts">
          <span>
            Tone <b>Encouraging</b>
          </span>
          <span>
            Length <b>Standard</b>
          </span>
        </div>
      </div>
    </Stage>
  );
}

const RUBRIC: [string, number, string][] = [
  ["Loads sales.csv into a DataFrame", 4, "mk-in-15"],
  ["Totals the sales for each region", 6, "mk-in-30"],
  ["Bar chart with labeled axes and a title", 5, "mk-in-45"],
  ["Explains which region sold the most", 5, "mk-in-60"],
];

/** Rubric lines drafted one at a time from the instructions. */
export function RubricMini() {
  return (
    <Stage loop={10}>
      <div className="frm">
        <span className="mk-stack frm__head">
          <span className="mk-from mk-to-80 frm__drafting">
            <Icon name="sparkles" size={15} />
            Drafting a rubric from your instructions
          </span>
          <span className="mk-to mk-to-80 frm__ready">
            <Icon name="checkCircle" size={15} />
            Rubric ready · 20 points
          </span>
        </span>
        <ul className="frm__list">
          {RUBRIC.map(([line, points, appear]) => (
            <li key={line} className={appear}>
              <span>{line}</span>
              <b>{points} pts</b>
            </li>
          ))}
        </ul>
      </div>
    </Stage>
  );
}

const FORMATS: [string, string][] = [
  ["PDF", "hw2_instructions.pdf"],
  ["DOCX", "hw2_instructions.docx"],
  ["MD", "hw2_instructions.md"],
];

/** A PDF, a Word file and a Markdown file each become the same instructions. */
export function FormatsMini() {
  return (
    <Stage loop={9} cycle={false}>
      <div className="ffm">
        <div className="ffm__drop">
          <span className="mk-stack">
            {FORMATS.map(([kind, name], i) => (
              <span key={kind} className={"ffm__file mk-turn3" + (i === 0 ? " mk-rest" : "")} style={{ "--i": i } as Vars}>
                <span className={"ffm__badge ffm__badge--" + kind.toLowerCase()}>{kind}</span>
                {name}
              </span>
            ))}
          </span>
        </div>
        <Icon name="arrowDown" size={18} className="ffm__arrow" />
        <div className="ffm__doc">
          <strong>Instructions</strong>
          <span className="ffm__text">Load sales.csv, total the sales for each region, and plot the totals as a bar chart with labeled axes.</span>
        </div>
      </div>
    </Stage>
  );
}

/** Files being added: an exact copy is skipped, and a near-identical one is flagged. */
export function DuplicatesMini() {
  return (
    <Stage loop={10}>
      <div className="fdm">
        <span className="fdm__head">
          <Icon name="uploadCloud" size={15} />
          Adding 4 files
        </span>
        <div className="fdm__row mk-in-15">
          <span className="fdm__name">alice_hw2.ipynb</span>
          <span className="fdm__ok">
            <Icon name="check" size={13} />
            Added
          </span>
        </div>
        <div className="fdm__row mk-in-30">
          <span className="fdm__name">bob_hw2.ipynb</span>
          <span className="fdm__ok">
            <Icon name="check" size={13} />
            Added
          </span>
        </div>
        <div className="fdm__row mk-in-45">
          <span className="fdm__name mk-strike-60">alice_hw2 (1).ipynb</span>
          <span className="mk-stack fdm__status">
            <span className="mk-from mk-to-60 fdm__checking">
              <Icon name="loader" size={13} className="spin" />
              Checking
            </span>
            <span className="mk-to mk-to-60 fdm__dup">
              <Icon name="copy" size={13} />
              Duplicate
            </span>
          </span>
        </div>
        <div className="fdm__row mk-in-62">
          <span className="fdm__name">dan_hw2.ipynb</span>
          <span className="mk-stack fdm__status">
            <span className="mk-from mk-to-80 fdm__ok">
              <Icon name="check" size={13} />
              Added
            </span>
            <span className="mk-to mk-to-80 fdm__close">
              <Icon name="flag" size={13} />
              Close match
            </span>
          </span>
        </div>
      </div>
    </Stage>
  );
}

const SCREEN_ROWS: [string, string][] = [
  ["alice_hw2.ipynb", "18 / 20"],
  ["bob_hw2.ipynb", "16 / 20"],
  ["carol_hw2.ipynb", "12 / 20"],
];

/** A submissions page narrowing from laptop width to phone width; its layout adapts as it goes. */
export function DevicesMini() {
  return (
    <Stage loop={8} cycle={false}>
      <div className="fvm">
        <div className="fvm__screen">
          <div className="fvm__bar">
            <img src="/logo.svg" width={14} height={14} alt="" />
            <span className="fvm__title">HW 2</span>
            <Icon name="menu" size={14} className="fvm__menu" />
          </div>
          <div className="fvm__body">
            <div className="fvm__side">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="fvm__list">
              {SCREEN_ROWS.map(([name, score]) => (
                <div key={name} className="fvm__row">
                  <span className="fvm__name">
                    <Icon name="notebook" size={13} />
                    <span>{name}</span>
                  </span>
                  <span className="fvm__score">{score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Stage>
  );
}
