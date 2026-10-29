import { Icon } from "@/components/ui/Icon";
import { Mascot, type Pose } from "@/components/ui/Mascot";

/*
 * Small animated mock-ups of the app for the home page. They are decorative (the copy next to them says the same
 * thing), use CSS animations only, and show their finished state when the visitor prefers reduced motion.
 * Class names: mk-in-N appears at N% of the loop, mk-from/mk-to-N swap at N%, mk-type types its text.
 */

function Window({ title, pose, children }: { title: string; pose: Pose; children: React.ReactNode }) {
  return (
    <div className="mock" aria-hidden="true">
      <Mascot pose={pose} size={112} className="mock__bird" />
      <div className="mock__bar">
        <span className="mock__dots">
          <i />
          <i />
          <i />
        </span>
        <span className="mock__title">{title}</span>
      </div>
      <div className="mock__body">{children}</div>
    </div>
  );
}

/** A notebook gaining a feedback summary and feedback cells. */
export function NotebookMock() {
  return (
    <Window title="alice_hw2.ipynb" pose="reading">
      <div className="nbm">
        <div className="nbm__summary mk-in-10">
          <span className="nbm__sumhead">
            <strong>Feedback summary</strong>
            <span className="nbm__score">18 / 20</span>
          </span>
          <span>Clear analysis of the sales data. Label your chart so readers know what it shows.</span>
        </div>
        <div className="nbm__cell">
          <span className="nbm__prompt">[1]</span>
          <code>
            df = pd.<span className="tok-f">read_csv</span>(<span className="tok-s">&quot;sales.csv&quot;</span>)
            <br />
            totals = df.<span className="tok-f">groupby</span>(<span className="tok-s">&quot;region&quot;</span>)[<span className="tok-s">&quot;sales&quot;</span>].
            <span className="tok-f">sum</span>()
          </code>
        </div>
        <div className="nbm__fb mk-in-30">
          <Icon name="checkCircle" size={15} />
          <span>Good use of groupby to total each region.</span>
        </div>
        <div className="nbm__cell">
          <span className="nbm__prompt">[2]</span>
          <code>
            totals.<span className="tok-f">plot</span>(kind=<span className="tok-s">&quot;bar&quot;</span>)
          </code>
        </div>
        <div className="nbm__chart">
          <i style={{ height: "62%" }} />
          <i style={{ height: "88%" }} />
          <i style={{ height: "45%" }} />
          <i style={{ height: "70%" }} />
        </div>
        <div className="nbm__fb nbm__fb--warn mk-in-50">
          <Icon name="flag" size={15} />
          <span>Label both axes and add a title.</span>
          <b>−2</b>
        </div>
      </div>
    </Window>
  );
}

/** A submissions list: the last file finishes grading, a flagged grade is edited and marked reviewed. */
export function ReviewMock() {
  return (
    <Window title="HW 2 · Submissions" pose="magnifier">
      <div className="rvm">
        <div className="rvm__progress">
          <span className="mk-stack">
            <span className="mk-from mk-to-35">Grading 23 of 24</span>
            <span className="mk-to mk-to-35 rvm__done">
              <Icon name="checkCircle" size={14} />
              All 24 graded
            </span>
          </span>
          <span className="rvm__bar">
            <span className="mk-fill-35" />
          </span>
        </div>
        <div className="rvm__row">
          <span className="rvm__file">
            <Icon name="notebook" size={15} />
            alice_hw2.ipynb
          </span>
          <span className="rvm__state" />
          <span className="rvm__score">18 / 20</span>
        </div>
        <div className="rvm__row">
          <span className="rvm__file">
            <Icon name="notebook" size={15} />
            bob_hw2.ipynb
          </span>
          <span className="rvm__state" />
          <span className="rvm__score mk-stack">
            <span className="mk-from mk-to-35 rvm__grading">
              <Icon name="loader" size={14} className="spin" />
              Grading
            </span>
            <span className="mk-to mk-to-35">16 / 20</span>
          </span>
        </div>
        <div className="rvm__row rvm__row--focus">
          <span className="rvm__file">
            <Icon name="notebook" size={15} />
            carol_hw2.ipynb
          </span>
          <span className="rvm__state mk-stack">
            <span className="mk-from mk-to-80 rvm__flag">
              <Icon name="flag" size={13} />
              Low confidence
            </span>
            <span className="mk-to mk-to-80 rvm__ok">
              <Icon name="check" size={13} />
              Reviewed
            </span>
          </span>
          <span className="rvm__score">
            <span className="mk-stack">
              <span className="mk-from mk-to-60">9</span>
              <span className="mk-to mk-to-60 rvm__edited">12</span>
            </span>{" "}
            / 20
          </span>
        </div>
        <div className="rvm__row">
          <span className="rvm__file">
            <Icon name="notebook" size={15} />
            dan_hw2.ipynb
          </span>
          <span className="rvm__state">
            <span className="rvm__flag">
              <Icon name="flag" size={13} />
              Close match
            </span>
          </span>
          <span className="rvm__score">17 / 20</span>
        </div>
      </div>
    </Window>
  );
}

const PEOPLE: [string, string, string][] = [
  ["AL", "Ada Lovelace", "Teacher"],
  ["GH", "Grace Hopper", "Grader"],
  ["AT", "Alan Turing", "Grader"],
];

/** A course's members: an invitation is typed, sent, and shows up as invited. */
export function TeamMock() {
  return (
    <Window title="Data 101 · Members" pose="waving">
      <div className="tmm">
        {PEOPLE.map(([ini, name, role]) => (
          <div key={name} className="tmm__row">
            <span className="tmm__avatar">{ini}</span>
            <span className="tmm__name">{name}</span>
            <span className={"tmm__role" + (role === "Teacher" ? " tmm__role--teacher" : "")}>{role}</span>
          </div>
        ))}
        <div className="tmm__row mk-in-62">
          <span className="tmm__avatar tmm__avatar--new">
            <Icon name="mail" size={14} />
          </span>
          <span className="tmm__name">katherine@school.edu</span>
          <span className="tmm__role tmm__role--invited">Invited</span>
        </div>
        <div className="tmm__invite">
          <span className="tmm__input">
            <span className="mk-type">katherine@school.edu</span>
            <span className="tmm__caret" />
          </span>
          <span className="tmm__send mk-press-50">
            <Icon name="send" size={14} />
            Invite
          </span>
        </div>
        <div className="tmm__toast mk-in-54">
          <Icon name="checkCircle" size={15} />
          Invitation sent
        </div>
      </div>
    </Window>
  );
}
