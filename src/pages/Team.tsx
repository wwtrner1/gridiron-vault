import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { PlayThumb } from "../components/PlayThumb";
import { FieldBackground } from "../lib/field";
import { drawOrder, MarkerDefs, NodeLayer, strokeColors } from "../lib/render";
import { assignmentsFor, lettersIn } from "../lib/assignments";
import { api } from "../lib/api";
import { toWorld, unionBox, worldBox, type Box } from "../lib/geometry";
import { buildQuiz, type Question, type RouteOption } from "../lib/quiz";
import { ballAt, buildTimeline, positionsAt } from "../lib/runPlay";
import type { SharedPlay } from "../lib/share";
import { CANVAS_H, CANVAS_W } from "../lib/types";
import type { Scene } from "../lib/types";

/**
 * What a player opens from the link on a wristband sheet or a text from the
 * coach: pick your letter, see only your job on every play, watch it run, and
 * take the Griddy Quiz. No account, nothing to install.
 */

const KEY = "grid1ronvault.team.v1";
type Memory = { name?: string; letters?: Record<string, string> };
const recall = (): Memory => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
};
const remember = (patch: (m: Memory) => Memory) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(patch(recall())));
  } catch {
    /* storage blocked: the choice still holds this visit */
  }
};

type Loaded = { name: string; plays: SharedPlay[] };

export function Team() {
  const { token = "" } = useParams();
  const [book, setBook] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"plays" | "quiz">("plays");
  const [letter, setLetter] = useState("");
  const [name, setName] = useState(() => recall().name ?? "");
  const [running, setRunning] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    api
      .openShare(token)
      .then(({ share }) => live && setBook({ name: share.name, plays: share.plays }))
      .catch((e: Error) => live && setError(e.message));
    return () => void (live = false);
  }, [token]);

  const letters = useMemo(() => (book ? lettersIn(book.plays) : []), [book]);
  // A returning player lands on his letter; a new one is asked to tap it.
  useEffect(() => {
    const saved = recall().letters?.[token];
    if (saved && letters.some((l) => l.letter === saved)) setLetter(saved);
  }, [letters, token]);

  const jobs = useMemo(() => (book && letter ? assignmentsFor(book.plays, letter) : []), [book, letter]);

  const pick = (l: string) => {
    setLetter(l);
    remember((m) => ({ ...m, letters: { ...m.letters, [token]: l } }));
  };

  if (error)
    return (
      <main className="tm">
        <Brand />
        <div className="tm-note">
          <h1>This link isn't working</h1>
          <p>{error}</p>
        </div>
      </main>
    );
  if (!book)
    return (
      <main className="tm">
        <Brand />
        <p className="tm-note" role="status">
          Opening the playbook…
        </p>
      </main>
    );

  const open = running === null ? null : jobs[running];

  return (
    <main className="tm">
      <Brand />
      <h1 className="tm-title">{book.name}</h1>
      <p className="tm-sub">Pick your letter and see only your job on every play.</p>

      <div className="tm-letters" role="group" aria-label="Your letter">
        {letters.map((l) => (
          <button key={l.letter} type="button" className={`tm-letter${l.letter === letter ? " is-on" : ""}`} aria-pressed={l.letter === letter} onClick={() => pick(l.letter)}>
            {l.letter}
          </button>
        ))}
      </div>

      <div className="tm-tabs" role="tablist" hidden={!letter}>
        <button type="button" role="tab" aria-selected={tab === "plays"} className={tab === "plays" ? "is-on" : ""} onClick={() => setTab("plays")}>
          My plays <span>{jobs.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === "quiz"} className={tab === "quiz" ? "is-on" : ""} onClick={() => setTab("quiz")}>
          Griddy Quiz
        </button>
      </div>

      {!letter ? (
        <p className="tm-note tm-ask">Tap your letter above to see your plays.</p>
      ) : tab === "plays" ? (
        <section className="tm-grid" aria-label={`${letter} on every play`}>
          {jobs.map(({ play, lines, scene }, i) => {
            const tags = lines.map((l) => l.tag?.trim()).filter(Boolean);
            return (
              <button key={play.id + i} type="button" className="tm-card" onClick={() => setRunning(i)} aria-label={`Run ${play.name}`}>
                <PlayThumb scene={scene} label={`${letter} on ${play.name}`} />
                <b>{play.name}</b>
                <span>{tags.length ? tags.join(" · ") : lines.length ? "Run it to see your route" : "No route drawn"}</span>
              </button>
            );
          })}
          {!jobs.length && <p className="tm-note">{letter} isn't in any of these plays.</p>}
        </section>
      ) : (
        <Quiz token={token} plays={book.plays} letter={letter} name={name} onName={(n) => (setName(n), remember((m) => ({ ...m, name: n })))} />
      )}

      {open && <Runner key={open.play.id} play={open.play} scene={open.scene} letter={letter} onClose={() => setRunning(null)} />}
    </main>
  );
}

function Brand() {
  return (
    <header className="tm-brand">
      <img src="/brand/lockup-horizontal.webp" alt="GridIronVault" height={30} />
    </header>
  );
}

/** One play running from the snap, with your player and route in color and everyone else greyed. */
function Runner({ play, scene, letter, onClose }: { play: SharedPlay; scene: Scene; letter: string; onClose: () => void }) {
  const tl = useMemo(() => buildTimeline(scene), [scene]);
  const [t, setT] = useState(0);
  const [on, setOn] = useState(true);
  const tRef = useRef(0);
  tRef.current = t;
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!on) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const next = tRef.current + (now - last) / 1000;
      last = now;
      if (next >= tl.duration) {
        setT(tl.duration);
        setOn(false);
        return;
      }
      setT(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, tl.duration]);

  const at = positionsAt(scene, tl, t);
  const ball = ballAt(tl, at, t);
  return (
    <div className="tm-run" role="dialog" aria-modal="true" aria-labelledby="tm-run-h">
      <div className="tm-run-card">
        <h2 id="tm-run-h">{play.name}</h2>
        <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} role="img" aria-label={`${play.name} running, ${letter} in color`}>
          <MarkerDefs colors={strokeColors(scene.nodes)} />
          <FieldBackground view={scene.view} losY={scene.losY} />
          {drawOrder(scene.nodes).map((n) => {
            if (n.kind !== "player") return <NodeLayer key={n.id} node={n} />;
            const p = at.get(n.id) ?? n;
            return <NodeLayer key={n.id} node={{ ...n, x: p.x, y: p.y }} />;
          })}
          {ball && <ellipse cx={ball.x} cy={ball.y} rx={11} ry={7} fill="#7A5230" stroke="#41290F" strokeWidth={2} />}
        </svg>
        {play.description && <p className="tm-run-note">{play.description}</p>}
        <div className="tm-run-bar">
          <button
            type="button"
            className="tm-btn"
            onClick={() => {
              setT(0);
              setOn(true);
            }}
          >
            {on ? "Restart" : "Run it again"}
          </button>
          <button type="button" className="tm-btn tm-btn-quiet" ref={close} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** A route choice: the player on his spot with one candidate route, cropped around both. */
function RouteCard({ option }: { option: RouteOption }) {
  const { scene } = option;
  const box = useMemo<Box>(() => {
    const raw = unionBox(scene.nodes.map(worldBox)) ?? { x: 0, y: 0, w: 200, h: 150 };
    const pad = 36;
    let b = { x: raw.x - pad, y: raw.y - pad, w: raw.w + pad * 2, h: raw.h + pad * 2 };
    // Keep a steady 4:3 frame so the four choices line up.
    const aspect = 4 / 3;
    if (b.w / b.h < aspect) b = { ...b, x: b.x - (b.h * aspect - b.w) / 2, w: b.h * aspect };
    else b = { ...b, y: b.y - (b.w / aspect - b.h) / 2, h: b.w / aspect };
    return b;
  }, [scene]);
  return (
    <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} aria-hidden="true">
      <MarkerDefs colors={strokeColors(scene.nodes)} />
      <FieldBackground view={scene.view} losY={scene.losY} lite />
      {drawOrder(scene.nodes).map((n) => (
        <NodeLayer key={n.id} node={n} />
      ))}
    </svg>
  );
}

const ROUND = 8;

function Quiz({ token, plays, letter, name, onName }: { token: string; plays: SharedPlay[]; letter: string; name: string; onName: (n: string) => void }) {
  const [round, setRound] = useState<Question[] | null>(null);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [sent, setSent] = useState<"" | "sent" | "failed">("");

  // A new letter means a new quiz.
  useEffect(() => {
    setRound(null);
  }, [letter]);

  const start = () => {
    setRound(buildQuiz(plays, letter, ROUND));
    setStep(0);
    setPicked(null);
    setScore(0);
    setSent("");
  };

  const q = round?.[step];
  const done = !!round && step >= round.length;

  useEffect(() => {
    if (!done || !round?.length) return;
    api
      .sendScore(token, { name, letter, score, total: round.length })
      .then(() => setSent("sent"))
      .catch(() => setSent("failed"));
    // Sent once per finished round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  if (!round)
    return (
      <section className="tm-quiz">
        <h2>Griddy Quiz</h2>
        <p>
          {ROUND} quick questions about your job as the {letter}: your route on each play and which play is which. Your coach sees your score.
        </p>
        <label className="tm-field">
          Your name
          <input value={name} maxLength={40} onChange={(e) => onName(e.target.value)} placeholder="So your coach knows it's you" autoComplete="given-name" />
        </label>
        <button type="button" className="tm-btn" onClick={start} disabled={!assignmentsFor(plays, letter).length}>
          Start the quiz
        </button>
      </section>
    );

  if (!round.length)
    return (
      <section className="tm-quiz">
        <p className="tm-note">There aren't enough plays with a {letter} in them to quiz on yet.</p>
      </section>
    );

  if (done)
    return (
      <section className="tm-quiz">
        <h2>
          {score} of {round.length}
        </h2>
        <p>{score === round.length ? "Perfect. You know your job." : score >= round.length * 0.7 ? "Solid. Look over the ones you missed." : "Open My plays, run each one, then try again."}</p>
        <p className="tm-note" role="status">
          {sent === "sent" ? "Your score went to your coach." : sent === "failed" ? "Couldn't send your score to your coach. Check your connection and take it again." : "Sending your score…"}
        </p>
        <button type="button" className="tm-btn" onClick={start}>
          Take it again
        </button>
      </section>
    );

  const answer = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    if (q!.options[i].correct) setScore((s) => s + 1);
  };
  const right = q!.options.findIndex((o) => o.correct);

  return (
    <section className="tm-quiz" aria-live="polite">
      <p className="tm-count">
        Question {step + 1} of {round.length}
      </p>
      <h2>{q!.prompt}</h2>
      {q!.kind === "name" && <PlayThumb scene={q!.scene} label="The play" />}
      <div className={q!.kind === "route" ? "tm-opts tm-opts-routes" : "tm-opts"}>
        {q!.options.map((o, i) => {
          const state = picked === null ? "" : i === right ? " is-right" : i === picked ? " is-wrong" : " is-dim";
          return (
            <button key={i} type="button" className={`tm-opt${state}`} onClick={() => answer(i)} aria-label={q!.kind === "route" ? `Route ${i + 1}` : undefined}>
              {q!.kind === "route" ? <RouteCard option={o as RouteOption} /> : (o as { label: string }).label}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className="tm-next">
          <p>{picked === right ? "Right." : q!.kind === "route" ? `Not that one. The green outline is the ${letter}'s route.` : "Not that one. The green answer is right."}</p>
          <button type="button" className="tm-btn" onClick={() => (setStep((s) => s + 1), setPicked(null))}>
            {step + 1 === round.length ? "See my score" : "Next"}
          </button>
        </div>
      )}
    </section>
  );
}
