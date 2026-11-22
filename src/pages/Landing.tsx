import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { MarketingFooter, MarketingNav } from "../components/Marketing";
import { Icon } from "../components/Icon";
import { PUBLIC_TIERS, plusTax } from "../lib/plan";
import { useTier } from "../lib/tier";
import { lazyPage } from "../lib/lazyPage";
import type { Watch } from "./home/tools";
import "../styles/home.css";

// The featured tools, the camera gallery and the every-tool grid (with the clip list they draw from) are all below the
// fold: they load right after the hero, so every other screen's first download doesn't carry them. The video pop-out
// loads the first time a visitor presses Watch.
const ToolSections = lazyPage(() => import("./home/ToolSections"), "ToolSections");
const VideoPopout = lazyPage(() => import("./home/VideoPopout"), "VideoPopout");

/** Scrolls to the address's #section once the sections above it have drawn (they arrive a moment after the page). */
function ScrollToHash({ hash }: { hash: string }) {
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);
  return null;
}

// The hero diagram (and the 56 starter plays behind it) loads right after the page, not with the app.
const HeroPlay = lazyPage(() => import("./home/HeroPlay"), "HeroPlay");

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
    body: "Drop a formation on the ball, or one of your own sets, and flip it left or right. Or drag the players yourself; nobody is stopping you.",
  },
  {
    n: "03",
    title: "Draw the routes",
    body: "Click a receiver and pick a route; it draws at real depth in his color. Tap a lineman, then a defender, and the block is drawn.",
  },
  {
    n: "04",
    title: "Teach it, print it, go",
    body: "Teach it in the 3D Film Room, then print the wristband for the quarterback, the call sheet for you and a player link for the parent who is helping out.",
  },
];

/** What the tools reel shows, in order, and the second each part starts; the list beside the video says the same thing in words and jumps the clip. */
const REEL: { title: string; at: number }[] = [
  { title: "Draw plays in seconds", at: 2.96 },
  { title: "Teach it in the Film Room, even in 3D", at: 4.64 },
  { title: "Check it against any coverage", at: 7.32 },
  { title: "Print wristbands and call sheets", at: 9.24 },
  { title: "Plan practice from the Drill Vault", at: 11.12 },
  { title: "Run your roster and depth chart", at: 13.2 },
  { title: "Ask Griddy", at: 15.47 },
];

/**
 * The tools reel: a short clip of the app itself that starts silent, with its captions drawn into the picture and a
 * narrator one press away. It loads and plays only once it is on screen, stops when it leaves, and waits for a press
 * when the visitor asked for less motion. The list beside it jumps the clip to each part.
 */
function ToolsReel() {
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  // The clip starts silent (a browser won't start one with sound by itself); the narration is one press away.
  const [sound, setSound] = useState(false);
  // Once it has played, the clip follows the visitor down the page in a small window until they close it.
  const [floating, setFloating] = useState(false);
  const closed = useRef(false);
  const toggleSound = () => {
    const el = video.current;
    if (!el) return;
    el.muted = sound;
    if (!sound) el.play().catch(() => undefined);
  };
  useEffect(() => {
    const el = video.current;
    const box = frame.current;
    if (!el || !box || typeof IntersectionObserver === "undefined" || typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          closed.current = false;
          setFloating(false);
          el.play().catch(() => undefined);
        } else if (!closed.current && !el.paused && el.currentTime > 0) setFloating(true);
        else el.pause();
      },
      { threshold: 0.45 },
    );
    // The frame keeps its place on the page while the clip floats, so it is the frame that is watched.
    io.observe(box);
    return () => io.disconnect();
  }, []);
  const closeFloat = () => {
    closed.current = true;
    setFloating(false);
    video.current?.pause();
  };
  const jumpTo = (at: number) => {
    const el = video.current;
    if (!el) return;
    el.currentTime = at;
    el.play().catch(() => undefined);
  };
  const backToReel = () => document.getElementById("reel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <section className="home-reel" id="reel" aria-labelledby="reel-h">
      <div className="home-band-head home-rv">
        <p className="home-eyebrow">See it move</p>
        <h2 id="reel-h">The whole Vault in 20 seconds</h2>
        <p>This is the app itself, not a mock-up: plays drawn, taught in 3D, checked against a coverage, printed, planned and asked about. Press a part to jump to it.</p>
        <ol className="home-reel-list">
          {REEL.map((r, i) => (
            <li key={r.title}>
              <button type="button" onClick={() => jumpTo(r.at)}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {r.title}
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div ref={frame} className={`home-reel-frame home-rv${floating ? " is-floating" : ""}`}>
        <div className="home-reel-win" role={floating ? "region" : undefined} aria-label={floating ? "Floating video of the tools" : undefined}>
          {floating && (
            <div className="home-reel-bar">
              <button type="button" onClick={backToReel}>
                Back to the video
              </button>
              <button type="button" className="home-reel-x" aria-label="Close the floating video" onClick={closeFloat}>
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          <video ref={video} poster="/clips/home-reel.jpg" width={1280} height={720} controls={!floating} muted loop playsInline preload="none" onVolumeChange={(e) => setSound(!e.currentTarget.muted && e.currentTarget.volume > 0)} aria-label="Video: GridIronVault's tools in 20 seconds, with captions on screen and a narrator you can switch on">
            <source src="/clips/home-reel.webm" type="video/webm" />
            <source src="/clips/home-reel.mp4" type="video/mp4" />
            A short clip of the tools. Your browser can't play it here; the sections below show the same tools.
          </video>
          <button type="button" className="home-reel-sound" aria-pressed={sound} onClick={toggleSound}>
            {sound ? "Sound: on" : "Turn the sound on"}
          </button>
        </div>
      </div>
    </section>
  );
}

/** Sections slide up into place the first time they scroll into view. Off for a visitor who asked for less motion. */
function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined" || typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    // Only what is below the screen now waits to slide in; nothing a visitor is already looking at moves.
    const waiting = [...el.querySelectorAll<HTMLElement>(".home-rv, .home-rv-kids")].filter((x) => x.getBoundingClientRect().top > innerHeight * 0.9);
    waiting.forEach((x) => (x.classList.add("is-waiting"), io.observe(x)));
    return () => {
      io.disconnect();
      waiting.forEach((x) => x.classList.remove("is-waiting", "is-in"));
    };
  }, [root]);
}

export function Landing() {
  const { hash } = useLocation();
  const tier = useTier();
  const page = useRef<HTMLDivElement>(null);
  useReveal(page);
  // One video pop-out for the whole page: the featured tools, the camera gallery and the every-tool grid all open it.
  const [watch, setWatch] = useState<Watch | null>(null);
  const openWatch = useCallback((w: Watch) => {
    document.querySelector<HTMLVideoElement>("#reel video")?.pause();
    setWatch(w);
  }, []);

  // The shared nav links to /#how from any page; scroll there once the section exists.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <div className="marketing" ref={page}>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <MarketingNav />

      <main id="main">
        <section className="home-hero" aria-labelledby="hero-h">
          <div className="home-hero-copy">
            <img
              className="home-hero-badge"
              src="/brand/shield-440.webp"
              srcSet="/brand/shield-300.webp 300w, /brand/shield-440.webp 440w, /brand/shield.webp 1254w"
              sizes="(min-width: 1375px) 220px, (min-width: 938px) 16vw, 150px"
              width={220}
              height={220}
              alt="GridIronVault — Your playbook. Anywhere."
              fetchPriority="high"
            />
            <p className="home-eyebrow">Free to start · no card · just create and draw</p>
            <h1 id="hero-h">
              Draw the play
              <br />
              <span className="hl-teal">print the wristbands</span>
              <br />
              <span className="hl-cyan">Win the game</span>
            </h1>
            <p className="home-hero-lede">
              GridIronVault is the playbook studio for anyone who loves the game of football. Draw plays in a click, teach
              them in a 3D Film Room, check them against any coverage, keep them in one searchable Vault, build your call
              sheet in a spreadsheet that learns your shorthand, and print anything from a quarterback wristband to a full
              binder page.
            </p>
            <div className="home-hero-actions">
              <Link to="/build" className="btn btn-primary btn-lg">
                Start drawing — it is free
              </Link>
              <Link to="/starters" className="btn btn-outline-dark btn-lg">
                Browse the starter plays
              </Link>
            </div>
            <Link to="/#reel" className="home-hero-watch">
              <Icon name="play" size={16} />
              Watch the 20-second tour
            </Link>
            <p className="home-hero-fine">Works on the laptop you install from and the tablet you carry to the sideline.</p>
          </div>
          <div className="home-hero-stage">
          <figure className="home-hero-frame">
            <div className="home-frame-bar" aria-hidden="true">
              <i />
              <i />
              <i />
              <b>Trips — Flood</b>
            </div>
            <Suspense fallback={<svg viewBox="0 0 1040 660" aria-hidden="true" />}>
              <HeroPlay />
            </Suspense>
            <figcaption className="home-frame-foot">
              <div>
                <b>Three-level flood</b>
                <small>Flat, out, corner. First read is the flat.</small>
              </div>
              <span className="pill pill-pass">Pass</span>
            </figcaption>
          </figure>
            {/* Floating notes round the play: what the other tools say about it. Decoration only. */}
            <div className="home-float home-float-read" aria-hidden="true">
              <i />
              <b>Read 1 · open</b>
              <small>Flat, 4 yards of space</small>
            </div>
            <div className="home-float home-float-band" aria-hidden="true">
              <b>Wristband · card A</b>
              <ol>
                {["Flood", "Smash", "Mesh", "Stick", "Verts", "Sweep"].map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ol>
            </div>
            <div className="home-float home-float-griddy" aria-hidden="true">
              <img src="/brand/griddy-96.webp" width={34} height={34} alt="" loading="lazy" />
              <p>
                <b>Griddy</b>
                Flood beats Cover 3. Want it on the call sheet?
              </p>
            </div>
          </div>
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

        <ToolsReel />

        <Suspense fallback={<div className="home-lazy" aria-hidden="true" />}>
          <ToolSections onWatch={openWatch} />
          <ScrollToHash hash={hash} />
        </Suspense>

        <section className="home-how" id="how" aria-labelledby="how-h">
          <div className="home-band-head home-rv">
            <p className="home-eyebrow">How it works</p>
            <h2 id="how-h">Four steps, about five minutes</h2>
            <p>If you can run a slide deck, you already know how to run this.</p>
          </div>
          <ol className="home-steps home-rv-kids">
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
          <div className="home-band-head home-rv">
            <p className="home-eyebrow">Plans</p>
            <h2 id="plans-h">Start free, upgrade when it earns it</h2>
            <p>
              Sideline is free: draw your own plays, try five sample starters and print watermarked cards. Head Coach opens the full
              56-play library, the Ready-to-Go playbook and clean whole-playbook prints.
            </p>
          </div>
          <div className="home-plan-grid home-rv-kids">
            {PUBLIC_TIERS.map((t) => (
              <div className={`home-plan${t.featured ? " is-featured" : ""}`} key={t.id}>
                {t.featured && <span className="home-plan-flag">Most coaches pick this</span>}
                <h3>{t.name}</h3>
                <p>{t.blurb}</p>
                <div className="home-plan-price">
                  <b>{t.price}</b>
                  <small>
                    {t.cadence}
                    {plusTax(t.price)}
                  </small>
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

      {watch && (
        <Suspense fallback={null}>
          <VideoPopout watch={watch} onClose={() => setWatch(null)} />
        </Suspense>
      )}

      <MarketingFooter />
    </div>
  );
}
