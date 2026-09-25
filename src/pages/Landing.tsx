import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon } from "../components/Icon";
import { MarketingFooter, MarketingNav } from "../components/Marketing";
import { PlayThumb } from "../components/PlayThumb";
import { PUBLIC_TIERS } from "../lib/plan";
import { STARTERS, starterScene } from "../lib/starters";

const HERO_PLAY = STARTERS.find((s) => s.n === 16)!;
const FEATURE_PLAYS = [9, 30, 43, 53];

const FEATURES = [
  {
    icon: "cursor",
    kicker: "The designer",
    title: "Draw a play the way you draw on a whiteboard",
    body: "Drag tokens where you want them. Pull a route and it snaps into an arrow. Multi-select, duplicate-by-drag, rotate, scale from any anchor, click through a group to grab one man — the moves you already know from PowerPoint, aimed at a football field.",
    points: [
      "Solid, dashed, block and motion lines",
      "Bezier nodes for the routes that bend",
      "Auto-connect for handoffs and coverage",
    ],
    to: "/build",
    cta: "Open the designer",
  },
  {
    icon: "table",
    kicker: "The call sheet",
    title: "A playground, not a form",
    body: "Rename any column. Drag them into the order your eyes read. Sort a field three ways, paint a row amber because it is a third-down call, and let the sheet learn your shorthand so the second half fills itself in.",
    points: ["Drag-and-drop columns and rows", "Paint cells in seven colours", "Autocomplete that learns your words"],
    to: "/grid",
    cta: "Build a call sheet",
  },
  {
    icon: "print",
    kicker: "Export and print",
    title: "From a wristband to a binder",
    body: "One diagram, every size. Six, eight or ten plays on a wristband card. Full 8.5 × 11 landscape with the coaching notes underneath for the three-ring binder. PNG at 600 DPI when you want it on a banner.",
    points: [
      "Wristband cards at 6, 8 or 10 per sheet",
      "Letter PDFs with notes under the diagram",
      "High-resolution PNG, JPEG and raw SVG",
    ],
    to: "/starters",
    cta: "See the starter plays",
  },
  {
    icon: "board",
    kicker: "The Vault",
    title: "Every play your program has ever drawn",
    body: "Search by name, formation, personnel or the labels you made up yourself. Check off twelve plays and export them as one packet. Share a book with your staff so the 8U coach installs the same Trips Flood you do.",
    points: [
      "Filter by formation, type and label",
      "Multi-select then export as a packet",
      "Copy any shared play into your own book",
    ],
    to: "/vault",
    cta: "Look inside the Vault",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Pick a field",
    body: "Half field to start — it is the view you actually coach from. Full field, red zone and a blank sheet are one click away.",
  },
  {
    n: "02",
    title: "Set your formation",
    body: "Ten presets drop five players in the right spots. Or drag them yourself; nobody is stopping you.",
  },
  {
    n: "03",
    title: "Draw the routes",
    body: "Click point to point, or freehand it. Every line gets an arrow unless you tell it otherwise.",
  },
  {
    n: "04",
    title: "Print it and go",
    body: "Wristband for the quarterback, binder page for you, phone view for the parent who is helping out.",
  },
];

export function Landing() {
  const scene = starterScene(HERO_PLAY);
  const { hash } = useLocation();

  // The shared nav links to /#how from any page; scroll there once the section exists.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <div className="marketing">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <MarketingNav />

      <main id="main">
        <section className="hero">
          <div className="hero-inner">
            <div className="hero-copy">
              <span className="pill pill-cyan">Free through beta · no card</span>
              <h1>
                Draw the play.
                <br />
                Print the wristband.
                <br />
                <em>Win the Saturday.</em>
              </h1>
              <p>
                Grid1ronVault is the playbook studio for 5-on-5 flag football. Design plays with real drawing tools, keep them in
                one searchable Vault, build your call sheet in a spreadsheet that learns your shorthand, and print anything from a
                quarterback wristband to a full binder page.
              </p>
              <div className="hero-actions">
                <Link to="/build" className="btn btn-primary btn-lg">
                  <Icon name="cursor" size={17} /> Start drawing — it is free
                </Link>
                <Link to="/starters" className="btn btn-ghost btn-lg">
                  <Icon name="board" size={17} /> Browse 56 starter plays
                </Link>
              </div>
              <p className="hero-fine">Works on the laptop you install from and the tablet you carry to the sideline.</p>
            </div>
            <div className="hero-art">
              <div className="hero-frame">
                <div className="hero-frame-bar" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <b>Trips — Flood</b>
                </div>
                <PlayThumb scene={scene} label={`${HERO_PLAY.name} — ${HERO_PLAY.description}`} />
              </div>
              <div className="hero-tag">
                <Icon name="sparkle" size={18} />
                <div>
                  <b>Three-level flood</b>
                  <small>Flat, out, corner. First read is the flat.</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="trust">
          <span>Built for</span>
          <b>Rec leagues</b>
          <b>Travel teams</b>
          <b>School programs</b>
          <b>Youth coaches</b>
          <b>Players learning the tree</b>
        </div>

        <section className="section" id="designer" aria-labelledby="designer-h">
          <div className="section-head">
            <span className="pill">What you get</span>
            <h2 id="designer-h">Four tools that talk to each other</h2>
            <p>Draw a play once. It shows up in the Vault, drops into your call sheet, and prints at any size.</p>
          </div>
          <div className="feature-zig">
            {FEATURES.map((f, i) => (
              <article className={`feature-row${i % 2 ? " is-flip" : ""}`} key={f.title}>
                <div className="feature-copy">
                  <span className="feature-kicker">
                    <Icon name={f.icon} size={15} /> {f.kicker}
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                  <ul className="feature-list">
                    {f.points.map((p) => (
                      <li key={p}>
                        <Icon name="check" size={14} /> {p}
                      </li>
                    ))}
                  </ul>
                  <Link to={f.to} className="btn btn-dark btn-sm">
                    {f.cta}
                  </Link>
                </div>
                <div className="feature-art">
                  <PlayThumb
                    scene={starterScene(STARTERS[FEATURE_PLAYS[i]])}
                    label={`Example play: ${STARTERS[FEATURE_PLAYS[i]].name}`}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section section-tight" id="how" aria-labelledby="how-h">
          <div className="section-head">
            <span className="pill">How it works</span>
            <h2 id="how-h">Four steps, about five minutes</h2>
            <p>If you can run a slide deck, you already know how to run this.</p>
          </div>
          <ol className="step-strip">
            {STEPS.map((s) => (
              <li className="step" key={s.n}>
                <b>{s.n}</b>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="section section-tight" aria-labelledby="plans-h">
          <div className="section-head">
            <span className="pill">Plans</span>
            <h2 id="plans-h">Free while we are in beta</h2>
            <p>
              Draw, export and print with everything switched on. When beta ends, your plays stay yours — pick the plan that fits
              your staff.
            </p>
          </div>
          <div className="plan-teaser">
            {PUBLIC_TIERS.map((t) => (
              <div className={`plan-mini${t.featured ? " is-featured" : ""}`} key={t.id}>
                <span>{t.name}</span>
                <b>{t.price}</b>
                <small>{t.cadence}</small>
                <p>{t.blurb}</p>
              </div>
            ))}
          </div>
          <div className="plan-teaser-cta">
            <Link to="/pricing" className="btn btn-ghost">
              Compare all four plans
            </Link>
          </div>
        </section>

        <section className="cta-band" aria-labelledby="cta-h">
          <div>
            <h2 id="cta-h">Your first play is about ninety seconds away.</h2>
            <p>No card, no trial clock. Draw something, print it, bring it to practice tonight.</p>
          </div>
          <Link to="/build" className="btn btn-primary btn-lg">
            Open the designer
          </Link>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
