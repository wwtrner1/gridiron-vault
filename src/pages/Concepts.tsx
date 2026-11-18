import { Suspense, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MarketingFooter, MarketingNav } from "../components/Marketing";
import { PlayThumb } from "../components/PlayThumb";
import { CONCEPTS, CONCEPT_SETS, conceptById, conceptScene, conceptSet } from "../lib/concepts";
import { lazyPage } from "../lib/lazyPage";
import "../styles/home.css";
import "../styles/pricing.css";
import "../styles/concepts.css";

const FilmRoom = lazyPage(() => import("../components/FilmRoom"), "FilmRoom");

/**
 * The Concept Library: five pass concepts every flag football coach teaches,
 * each as a Film Room lesson anyone can watch, in 5v5, 7v7 or 11-man. The
 * diagrams are our own teaching drawings (`lib/concepts.ts`), not starter
 * plays. The game and the open lesson live in the address (`?game=7&watch=smash`),
 * so a coach can send a player straight to one.
 */
export function Concepts() {
  const [params, setParams] = useSearchParams();
  const set = conceptSet(params.get("game")) ?? CONCEPT_SETS[2];
  const watching = conceptById(params.get("watch"));
  const scenes = useMemo(() => new Map(CONCEPTS.map((c) => [c.id, conceptScene(set, c)])), [set]);

  const go = (next: { game?: string; watch?: string | null }) => {
    const p = new URLSearchParams(params);
    if (next.game) p.set("game", next.game);
    if (next.watch === null) p.delete("watch");
    else if (next.watch) p.set("watch", next.watch);
    setParams(p, { replace: true });
  };

  return (
    <div className="home">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <MarketingNav />
      <main id="main">
        <section className="price-hero" aria-labelledby="concepts-h">
          <p className="home-eyebrow">Concept Library</p>
          <h1 id="concepts-h">Five pass concepts, taught step by step</h1>
          <p className="price-hero-lede">
            Pick your game, then watch a concept as a Film Room lesson: the look, the zones, the call, the snap, the read and each player's job. Free to watch
            and free to share with your players.
          </p>
        </section>

        <section className="cl-wrap" aria-labelledby="cl-list-h">
          <h2 id="cl-list-h" className="sr-only">
            The concepts
          </h2>
          <div className="cl-games" role="group" aria-label="Game">
            {CONCEPT_SETS.slice()
              .reverse()
              .map((s) => (
                <button key={s.id} type="button" className={`chip${s.id === set.id ? " is-on" : ""}`} aria-pressed={s.id === set.id} onClick={() => go({ game: s.id })}>
                  {s.label}
                </button>
              ))}
          </div>
          <ul className="cl-grid">
            {CONCEPTS.map((c) => (
              <li key={c.id} className="cl-card">
                <div className="cl-thumb">
                  <PlayThumb scene={scenes.get(c.id)!} zoom={{ w: 3.2, h: 2 }} decorative lazy />
                </div>
                <h3>{c.name}</h3>
                <p className="cl-why">{c.why}</p>
                <p className="cl-read">{c.read}</p>
                <p className="cl-beats">Built to beat {c.beats.join(" and ")}</p>
                <button type="button" className="btn btn-primary" onClick={() => go({ watch: c.id })}>
                  Watch the {c.name} lesson
                </button>
              </li>
            ))}
          </ul>
          <p className="cl-note">
            The lessons run on a teaching model of each coverage. Real defenses disguise and adjust, so use them to teach the idea, not to promise a result.
          </p>
        </section>

        <section className="cl-cta" aria-labelledby="cl-cta-h">
          <h2 id="cl-cta-h">Teach your own plays the same way</h2>
          <p>Draw a play in the Designer and the Film Room builds its lesson, with your team colors, your voice and a video to send.</p>
          <div className="cl-cta-links">
            <Link to="/signin" className="btn btn-primary">
              Start free
            </Link>
            <Link to="/starters" className="btn btn-ghost">
              Browse starter plays
            </Link>
          </div>
        </section>
      </main>
      <MarketingFooter />
      {watching && (
        <Suspense fallback={null}>
          <FilmRoom scene={scenes.get(watching.id)!} name={`${watching.name} · ${set.label}`} closeLabel="Back to the concepts" onClose={() => go({ watch: null })} />
        </Suspense>
      )}
    </div>
  );
}
