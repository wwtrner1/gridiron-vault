import { Suspense, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MarketingFooter, MarketingNav } from "../components/Marketing";
import { PlayThumb } from "../components/PlayThumb";
import { CONCEPTS, CONCEPT_SETS, PUBLIC_CONCEPTS, PUBLIC_LOOK, conceptById, conceptOpen, conceptScene, conceptSet } from "../lib/concepts";
import { useTier } from "../lib/tier";
import type { Scene } from "../lib/types";
import { lazyPage } from "../lib/lazyPage";
import "../styles/home.css";
import "../styles/pricing.css";
import "../styles/concepts.css";

const FilmRoom = lazyPage(() => import("../components/FilmRoom"), "FilmRoom");

/** A held-back concept's card: where the players line up, none of the routes. */
const lineup = (scene: Scene): Scene => ({ ...scene, nodes: scene.nodes.filter((n) => n.kind === "player") });

/**
 * The Concept Library: pass concepts every flag football coach teaches, each
 * as a Film Room lesson, in 5v5, 7v7 or 11-man. Anyone can watch three of them
 * against one defense (`PUBLIC_CONCEPTS`, `PUBLIC_LOOK`); the rest, and every
 * other defense, open with a plan that opens the whole library. A held-back
 * card shows the formation only, like a held-back starter. The
 * diagrams are our own teaching drawings (`lib/concepts.ts`), not starter
 * plays. The game and the open lesson live in the address (`?game=7&watch=smash`),
 * so a coach can send a player straight to one.
 */
export function Concepts() {
  const [params, setParams] = useSearchParams();
  const set = conceptSet(params.get("game")) ?? CONCEPT_SETS[2];
  const whole = useTier().allStarters;
  const asked = conceptById(params.get("watch"));
  const watching = asked && conceptOpen(whole, asked.id) ? asked : undefined;
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
          <h1 id="concepts-h">Pass concepts, taught step by step</h1>
          <p className="price-hero-lede">
            Pick your game, then watch a concept as a Film Room lesson: the look, the zones, the call, the snap, the read and each player's job.{" "}
            {whole
              ? "Every concept, against every defense. Your own plays teach the same way: open one in the Designer and pick Teach, then Film Room."
              : `${PUBLIC_CONCEPTS.length} concepts against ${PUBLIC_LOOK} are free to watch and free to share with your players.`}
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
            {CONCEPTS.map((c) => {
              const open = conceptOpen(whole, c.id);
              return (
                <li key={c.id} className={`cl-card${open ? "" : " is-held"}`}>
                  <div className="cl-thumb">
                    <PlayThumb scene={open ? scenes.get(c.id)! : lineup(scenes.get(c.id)!)} zoom={{ w: 3.2, h: 2 }} decorative lazy />
                  </div>
                  <h3>{c.name}</h3>
                  <p className="cl-why">{c.why}</p>
                  {open ? (
                    <>
                      <p className="cl-read">{c.read}</p>
                      <p className="cl-beats">{whole ? `Built to beat ${c.beats.join(" and ")}` : `Taught against ${PUBLIC_LOOK}`}</p>
                      <button type="button" className="btn btn-primary" onClick={() => go({ watch: c.id })}>
                        Watch the {c.name} lesson
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="cl-beats">Comes with a Head Coach plan</p>
                      <Link to="/pricing" className="btn btn-ghost" aria-label={`See plans to open the ${c.name} lesson`}>
                        See plans
                      </Link>
                    </>
                  )}
                </li>
              );
            })}
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
          <FilmRoom scene={scenes.get(watching.id)!} name={`${watching.name} · ${set.label}`} closeLabel="Back to the concepts" onlyLook={whole ? undefined : PUBLIC_LOOK} onClose={() => go({ watch: null })} />
        </Suspense>
      )}
    </div>
  );
}
