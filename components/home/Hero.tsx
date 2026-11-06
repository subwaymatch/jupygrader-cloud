import { AnimatedArt } from "@/components/home/AnimatedArt";
import { Icon } from "@/components/ui/Icon";

/*
 * The home page hero's picture: a morning sky over soft hills, and a window of the feedback page rising out of
 * them with the bird peeking over its edge. All decorative: the hero's copy says what the picture shows.
 */

// Three ridges in a 1440 × 360 box, stretched to the hero's width. The nearest is solid white, so the hills
// run straight into the white page below.
const RIDGES = [
  "M0 214 C 110 178 200 128 300 148 C 384 165 438 112 540 118 C 646 124 704 186 806 176 C 904 166 962 98 1080 104 C 1190 110 1250 168 1340 160 C 1392 156 1420 148 1440 144 L1440 360 L0 360 Z",
  "M0 262 C 160 226 304 202 452 222 C 604 243 706 206 862 210 C 1012 214 1132 250 1262 236 C 1352 226 1404 216 1440 214 L1440 360 L0 360 Z",
  "M0 304 C 220 278 420 264 642 282 C 862 300 1080 272 1300 270 C 1380 269 1420 274 1440 278 L1440 360 L0 360 Z",
];

export function HeroLand() {
  return (
    <div className="home-hero__land" aria-hidden="true">
      <span className="home-hero__sun" />
      <span className="home-hero__haze home-hero__haze--1" />
      <span className="home-hero__haze home-hero__haze--2" />
      <AnimatedArt name="flying" still="/mascot/flying.webp" width={192} height={192} className="home-hero__flyer" />
      <svg className="home-hero__hills" viewBox="0 0 1440 360" preserveAspectRatio="none">
        {RIDGES.map((d, i) => (
          <path key={i} d={d} className={`home-hero__ridge home-hero__ridge--${i + 1}`} />
        ))}
      </svg>
    </div>
  );
}

const RUBRIC: [string, number, number, string?][] = [
  ["Loads and cleans the data", 4, 4],
  ["Fits the regression model", 6, 6],
  ["Plots the fit", 5, 5],
  ["Interprets the slope", 3, 5, "Say what the slope means in dollars per square foot."],
];

// Scatter points for the plot output, in a 200 × 60 box that stretches to the cell's width. Each point is a
// zero-length stroke with round caps, so it stays round however the box is stretched.
const POINTS = [
  [12, 50], [22, 46], [30, 48], [41, 40], [50, 43], [58, 36], [69, 38], [78, 31], [88, 33], [97, 27], [108, 29], [118, 22], [127, 25],
  [138, 18], [148, 21], [157, 14], [168, 16], [178, 10], [188, 12],
];
const DOTS = POINTS.map(([x, y]) => `M${x} ${y}h0`).join("");

/** A window of the feedback page: the notebook with feedback cells on the left, the score and rubric on the right. */
export function HeroWindow() {
  return (
    <div className="hwin" aria-hidden="true">
      <AnimatedArt name="peeking" still="/mascot/peeking.webp" width={112} height={112} className="mascot hwin__bird" />
      <div className="hwin__bar">
        <span className="mock__dots">
          <i />
          <i />
          <i />
        </span>
        <span className="hwin__path">
          <span>Data 101</span>
          <Icon name="chevronRight" size={13} />
          <span>Lab 4</span>
          <Icon name="chevronRight" size={13} />
          <b>maya_lab4.ipynb</b>
        </span>
        <span className="hwin__nav">
          <span className="rvm__ok">
            <Icon name="check" size={13} />
            Reviewed
          </span>
          <span className="hwin__key">
            <Icon name="chevronUp" size={14} />
          </span>
          <span className="hwin__key">
            <Icon name="chevronDown" size={14} />
          </span>
        </span>
      </div>
      <div className="hwin__main">
        <div className="hwin__file nbm">
          <div className="nbm__summary">
            <span className="nbm__sumhead">
              <strong>Feedback summary</strong>
              <span className="nbm__score">18 / 20</span>
            </span>
            <span>A clean model and a clear plot. Finish by saying what the slope tells you about prices.</span>
          </div>
          <div className="nbm__cell">
            <span className="nbm__prompt">[1]</span>
            <code>
              df = pd.<span className="tok-f">read_csv</span>(<span className="tok-s">&quot;housing.csv&quot;</span>).<span className="tok-f">dropna</span>()
              <br />
              model = <span className="tok-f">LinearRegression</span>().<span className="tok-f">fit</span>(df[[<span className="tok-s">&quot;sqft&quot;</span>]], df[
              <span className="tok-s">&quot;price&quot;</span>])
            </code>
          </div>
          <div className="nbm__fb">
            <Icon name="checkCircle" size={15} />
            <span>Good: missing rows are dropped before fitting.</span>
          </div>
          <div className="nbm__cell">
            <span className="nbm__prompt">[2]</span>
            <code>
              plt.<span className="tok-f">scatter</span>(df.sqft, df.price)
              <br />
              plt.<span className="tok-f">plot</span>(df.sqft, model.<span className="tok-f">predict</span>(df[[<span className="tok-s">&quot;sqft&quot;</span>]]))
            </code>
          </div>
          <svg className="hwin__plot" viewBox="0 0 200 60" preserveAspectRatio="none">
            <path className="hwin__dots" d={DOTS} vectorEffect="non-scaling-stroke" />
            <line x1="8" y1="51" x2="192" y2="10" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="nbm__fb nbm__fb--warn">
            <Icon name="flag" size={15} />
            <span>Explain what the slope means for house prices.</span>
            <b>−2</b>
          </div>
        </div>
        <div className="hwin__side">
          <div className="hwin__score">
            <span className="hwin__n">18</span>
            <span className="hwin__of">/ 20</span>
          </div>
          <div className="hwin__chips">
            <span>Balanced</span>
            <span>Encouraging</span>
          </div>
          <span className="hwin__title">Rubric</span>
          <ul className="hwin__rubric">
            {RUBRIC.map(([name, got, of, note]) => (
              <li key={name}>
                <span className="hwin__crit">
                  <span>{name}</span>
                  <b className={got < of ? "hwin__lost" : undefined}>
                    {got} / {of}
                  </b>
                </span>
                {note && <span className="hwin__note">{note}</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
