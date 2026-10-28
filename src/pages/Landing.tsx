import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { MarketingFooter, MarketingNav } from "../components/Marketing";
import { Icon } from "../components/Icon";
import { PlayThumb } from "../components/PlayThumb";
import { PLAYBOOK_NAV } from "../lib/nav";
import { PUBLIC_TIERS } from "../lib/plan";
import { STARTERS, starterScene } from "../lib/starters";
import { useTier } from "../lib/tier";
import { DesignerTour } from "./home/DesignerTour";
import { FeatureSection } from "./home/FeatureSection";
import "../styles/home.css";

const HERO_PLAY = STARTERS.find((s) => s.n === 16)!;

/** Plan card buttons, as labelled on the canvas. */
const PLAN_CTA: Record<string, string> = {
  free: "Start on Sideline",
  solo: "Choose Head Coach",
  crew: "Choose Staff",
  program: "Choose Program",
};

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
  const tier = useTier();

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
        <section className="home-hero" aria-labelledby="hero-h">
          <div className="home-hero-copy">
            <img
              className="home-hero-badge"
              src="/brand/shield.webp"
              width={220}
              height={220}
              alt="GridIronVault — Your playbook. Anywhere."
              fetchPriority="high"
            />
            <p className="home-eyebrow">Free through beta · no card · No payment · just create and draw</p>
            <h1 id="hero-h">
              Draw the play
              <br />
              <span className="hl-teal">print the wristband</span>
              <br />
              <span className="hl-cyan">Win the game</span>
            </h1>
            <p className="home-hero-lede">
              GridIronVault is the playbook studio for anyone who loves the game of football. Design plays with real drawing
              tools, keep them in one searchable Vault, build your call sheet in a spreadsheet that learns your shorthand, and
              print anything from a quarterback wristband to a full binder page.
            </p>
            <div className="home-hero-actions">
              <Link to="/build" className="btn btn-primary btn-lg">
                Start drawing — it is free
              </Link>
              <Link to="/starters" className="btn btn-outline-dark btn-lg">
                Browse 56 starter plays
              </Link>
            </div>
            <p className="home-hero-fine">Works on the laptop you install from and the tablet you carry to the sideline.</p>
          </div>
          <figure className="home-hero-frame">
            <div className="home-frame-bar" aria-hidden="true">
              <i />
              <i />
              <i />
              <b>Trips — Flood</b>
            </div>
            <PlayThumb scene={scene} label={`${HERO_PLAY.name} — ${HERO_PLAY.description}`} />
            <figcaption className="home-frame-foot">
              <div>
                <b>Three-level flood</b>
                <small>Flat, out, corner. First read is the flat.</small>
              </div>
              <span className="pill pill-pass">Pass</span>
            </figcaption>
          </figure>
        </section>

        <section className="home-built" aria-label="Built for">
          <p className="home-eyebrow">Built for</p>
          <ul>
            <li>Rec leagues</li>
            <li>Travel teams</li>
            <li>School programs</li>
            <li>Youth coaches</li>
            <li>Players learning the tree</li>
          </ul>
        </section>

        <section className="home-all" id="everything" aria-labelledby="all-h">
          <div className="home-band-head">
            <p className="home-eyebrow">Everything in the Vault</p>
            <h2 id="all-h">Every tool, one click away</h2>
            <p>The same tools as the side menu inside the app. Jump straight to the one you need.</p>
          </div>
          <ul className="home-all-grid">
            <li>
              <Link to="/build" className="home-all-card">
                <Icon name="pencil" size={22} />
                <b>Designer</b>
                <small>Draw a play: players, routes, blocks and coverage on a real field.</small>
              </Link>
            </li>
            {PLAYBOOK_NAV.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="home-all-card">
                  <Icon name={item.icon} size={22} />
                  <b>{item.label}</b>
                  <small>{item.hint}</small>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="home-head" aria-labelledby="tools-h">
          <p className="home-eyebrow">What you get</p>
          <h2 id="tools-h">Four tools that talk to each other</h2>
          <p>Draw a play once. It shows up in the Vault, drops into your call sheet, and prints at any size.</p>
        </section>

        <DesignerTour />

        <FeatureSection
          id="call-sheet"
          visual="callSheet"
          ground="white"
          eyebrow="The call sheet"
          title="A call sheet that adapts to you"
          body="Easy to pick up, built around the way you call a game. Filter down to the calls you need — third and short, red zone, left hash — in one click. Tap any call to see the diagram, add a note or flag it. Then drag calls up and down the sheet, or between situations, until the order matches how you want to call it on Saturday."
          points={[
            "Filter by down, distance, hash, field zone or play type",
            "Drag calls to reorder them or move them between situations",
            "Rename columns, color-code rows and let it learn your shorthand",
          ]}
          cta={{ to: "/grid", label: "Build a call sheet" }}
        />

        <FeatureSection
          id="export"
          visual="exportPrint"
          ground="paper"
          eyebrow="Export and print"
          title="From a wristband to a binder"
          body="One diagram, every size. Six, eight or ten plays on a wristband card. Full 8.5 × 11 landscape with the coaching notes underneath for the three-ring binder. PNG at 600 DPI when you want it on a banner."
          points={[
            "Wristband cards at 6, 8 or 10 per sheet",
            "Letter PDFs with notes under the diagram",
            "High-resolution PNG, JPEG and raw SVG",
          ]}
          cta={{ to: "/starters", label: "See the starter plays" }}
        />

        <FeatureSection
          id="vault"
          visual="vault"
          ground="white"
          eyebrow="The Vault"
          title="Every play your program has ever drawn"
          body="Search by name, formation, personnel or the labels you made up yourself. Check off twelve plays and export them as one packet. Share a book with your staff so the 8U coach installs the same Trips Flood you do."
          points={[
            "Filter by formation, type and label",
            "Multi-select then export as a packet",
            "Copy any shared play into your Vault",
          ]}
          cta={{ to: "/vault", label: "Look inside the Vault" }}
        />

        <FeatureSection
          id="film"
          visual="film"
          ground="paper"
          wide
          eyebrow="Game film"
          title="Put the film next to the play"
          body="Upload practice or game video and attach it to any play in the Vault. Mark the snap once and Run play animates every route in time with the clip, so your players see the drawing and the real rep side by side — the first read, the break, the throw. It turns film review into install."
          points={[
            "Upload a video file or paste a Hudl or YouTube link",
            "Mark the snap once — the clip and the drawing stay in sync",
            "Slow it to 0.5×, scrub, or step a tenth of a second at a time",
            "One main clip per play, with extra reps listed underneath",
            "Wristbands and binder pages still print the clean diagram",
          ]}
          cta={{ to: "/build", label: "See Run play" }}
        />

        <section className="home-how" id="how" aria-labelledby="how-h">
          <div className="home-band-head">
            <p className="home-eyebrow">How it works</p>
            <h2 id="how-h">Four steps, about five minutes</h2>
            <p>If you can run a slide deck, you already know how to run this.</p>
          </div>
          <ol className="home-steps">
            {STEPS.map((s) => (
              <li key={s.n}>
                <span>{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="home-plans" aria-labelledby="plans-h">
          <div className="home-band-head">
            <p className="home-eyebrow">Plans</p>
            <h2 id="plans-h">Free while we are in beta</h2>
            <p>
              Draw, export and print with everything switched on. When beta ends, your plays stay yours — pick the plan that fits
              your staff.
            </p>
          </div>
          <div className="home-plan-grid">
            {PUBLIC_TIERS.map((t) => (
              <div className={`home-plan${t.featured ? " is-featured" : ""}`} key={t.id}>
                {t.featured && <span className="home-plan-flag">Most coaches pick this</span>}
                <h3>{t.name}</h3>
                <p>{t.blurb}</p>
                <div className="home-plan-price">
                  <b>{t.price}</b>
                  <small>{t.cadence}</small>
                </div>
                <div className="home-plan-cta">
                  <Link to="/pricing" className={`btn ${t.featured ? "btn-primary" : "btn-ghost"}`}>
                    {tier.id === t.id ? "Your current plan" : PLAN_CTA[t.id]}
                  </Link>
                </div>
              </div>
            ))}
          </div>
          <div>
            <Link to="/pricing" className="btn btn-ghost">
              Compare all four plans
            </Link>
          </div>
        </section>

        <section className="home-cta" aria-labelledby="cta-h">
          <h2 id="cta-h">
            Your first play is about <span>ninety seconds away.</span>
          </h2>
          <p>No card, no trial clock. Draw something, print it, bring it to practice tonight.</p>
          <Link to="/build" className="btn btn-primary btn-lg">
            Open the designer
          </Link>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
