import { useEffect, useMemo, useRef, useState } from "react";
import { brandStore, hasBrand, inkOn, luminance, useBrand } from "../lib/brand";
import { STATUS_COLOR, yards } from "../lib/coverage";
import { DEFENSE_INK } from "../lib/defense";
import { useDialogFocus } from "../lib/dialogFocus";
import { fieldInset, yardLines } from "../lib/field";
import { drawOrder, MarkerDefs, NodeLayer, strokeColors } from "../lib/render";
import { buildLesson, canTeach, captionParts, clockAt, defaultLook, linesFor, plainCaption, stepLength, teachLooks, TEACH_LOOKS, TEACH_LOOK_NAME } from "../lib/teach";
import type { TeachLook, TeachSettings } from "../lib/teach";
import { CANVAS_H, CANVAS_W } from "../lib/types";
import type { Scene, SceneNode } from "../lib/types";
import "../styles/filmroom.css";

const FPS = 30;
const BALL_FLIGHT = 0.5;
/** Ink for the coach's black lines and labels on the dark field. */
const DARK_INK = "#E9F0F6";
const DARK_DEFENSE = "#FF8A7A";

const isDarkInk = (hex: string) => {
  try {
    return /^#[0-9a-f]{6}$/i.test(hex) && luminance(hex) < 0.12;
  } catch {
    return false;
  }
};

/** The coach's drawing with its black ink turned light, so it reads on the dark field. Colors the coach chose stay. */
function onDark(n: SceneNode): SceneNode {
  if (n.kind === "path") return isDarkInk(n.stroke) ? { ...n, stroke: DARK_INK } : n;
  if (n.kind === "shape") return isDarkInk(n.stroke) ? { ...n, stroke: DARK_INK } : n;
  if (n.kind === "text") return isDarkInk(n.color) ? { ...n, color: DARK_INK } : n;
  return n;
}

/** Dark, light, or whatever the device is set to. */
function useLook(look: TeachLook): "dark" | "light" {
  const [deviceDark, setDeviceDark] = useState(() => (typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)").matches : true));
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setDeviceDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return look === "device" ? (deviceDark ? "dark" : "light") : look;
}

/** A phone-width screen, where tokens are drawn larger so letters still read. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof matchMedia === "function" && matchMedia("(max-width: 640px)").matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia("(max-width: 640px)");
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

/**
 * Film Room: the coach's own play as a short lesson. Six steps (the look, the
 * zones, the call, the snap, the read, your job), each with one caption, drawn
 * flat and top-down in GridIronVault's dark look or the light Designer look.
 * Everything comes from the drawing and the Coverage check; nothing here
 * changes the play except the lesson's own settings (`scene.teach`).
 */
export function FilmRoom({
  scene,
  name,
  rushYards = 7,
  onTeach,
  forLetter,
  closeLabel = "Back to drawing",
  onClose,
}: {
  scene: Scene;
  name: string;
  /** The league's rush line, in yards, so a flag rusher starts where he legally can. */
  rushYards?: number;
  /** Saves the lesson's settings onto the play. Left out on a player's team link, where picks last for the visit. */
  onTeach?: (teach: TeachSettings) => void;
  /** The player's own letter on a team link: "Your job" opens on it. */
  forLetter?: string;
  closeLabel?: string;
  onClose: () => void;
}) {
  const coach = !!onTeach;
  const [visit, setVisit] = useState<TeachSettings>({});
  const settings = useMemo(() => ({ ...scene.teach, ...visit }), [scene.teach, visit]);
  const brand = useBrand();
  const pick: TeachLook = settings.look ?? (coach ? brand.filmLook : undefined) ?? "dark";
  const theme = useLook(pick);
  const dark = theme === "dark";
  // A player's browser doesn't hold the coach's team brand, so a team link wears GridIronVault's colors.
  const branded = coach && hasBrand(brand);
  const teamOn = branded && settings.team !== false;
  const big = useNarrow();

  const teachable = canTeach(scene);
  const looks = useMemo(() => teachLooks(scene), [scene]);
  const fallback = useMemo(() => defaultLook(scene, { rushYards }), [scene, rushYards]);
  const look = looks.find((l) => l.id === settings.against) ?? fallback;
  const [letter, setLetter] = useState(() => forLetter?.trim().toUpperCase() ?? "");
  const lesson = useMemo(() => buildLesson(scene, name, look, letter, { rushYards }), [scene, name, look, letter, rushYards]);
  const { result, steps } = lesson;

  const [at, setAt] = useState({ i: 0, u: 0 });
  const [playing, setPlaying] = useState(false);
  const atRef = useRef(at);
  atRef.current = at;
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const i = Math.min(at.i, steps.length - 1);
  const step = steps[i];
  const t = clockAt(step, at.u);
  const total = steps.reduce((a, s) => a + stepLength(s), 0);
  const done = steps.slice(0, i).reduce((a, s) => a + stepLength(s), 0) + Math.min(at.u, stepLength(step));
  const atEnd = i === steps.length - 1 && at.u >= stepLength(step);

  // A new defense starts the lesson over; a new letter replays "Your job".
  useEffect(() => {
    setPlaying(false);
    setAt({ i: 0, u: 0 });
  }, [look.id]);

  const panel = useRef<HTMLDivElement>(null);
  useDialogFocus(panel, onClose);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const list = stepsRef.current;
      let { i: si, u } = atRef.current;
      si = Math.min(si, list.length - 1);
      u += dt;
      while (u >= stepLength(list[si]) && si < list.length - 1) {
        u -= stepLength(list[si]);
        si++;
      }
      if (si === list.length - 1 && u >= stepLength(list[si])) {
        setAt({ i: si, u: stepLength(list[si]) });
        setPlaying(false);
        return;
      }
      setAt({ i: si, u });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const go = (n: number) => {
    setPlaying(false);
    setAt({ i: Math.max(0, Math.min(steps.length - 1, n)), u: 0 });
  };
  const play = () => {
    if (atEnd) setAt({ i: 0, u: 0 });
    setPlaying(true);
  };
  const save = (patch: TeachSettings) => {
    if (!onTeach) return setVisit((v) => ({ ...v, ...patch }));
    onTeach({ ...settings, ...patch });
    // The look a coach picks becomes the usual one, kept with the team brand on the account.
    if (patch.look && patch.look !== brand.filmLook) {
      try {
        brandStore.set({ filmLook: patch.look });
      } catch {
        /* storage full: the play still keeps the look */
      }
    }
  };

  // The picture.
  const k = Math.min(Math.round(t * FPS), Math.round(result.duration * FPS));
  const id = step.id;
  const who = lesson.letters.includes(letter) ? letter : lesson.letters[0] ?? "";
  const mine = useMemo(() => new Set(id === "job" ? linesFor(scene, who).map((l) => l.id) : []), [scene, who, id]);
  const nodes = useMemo(() => drawOrder(scene.nodes.filter((n) => !(n.kind === "player" && n.side === "defense"))).map((n) => (dark ? onDark(n) : n)), [scene, dark]);
  const inkOpacity = (n: SceneNode) => (id === "call" ? 1 : id === "job" ? (mine.has(n.id) ? 1 : 0.14) : id === "look" || id === "zones" ? 0.22 : 0.5);
  const thrown = id === "read" && t >= result.throwAt;
  const statusOf = new Map(id === "read" ? result.rows.map((r) => [r.id, r.status]) : []);
  const showZones = id !== "job";
  const zoneTags = id === "zones";
  const inset = fieldInset(scene.view === "blank" ? "half" : scene.view);
  const lines = yardLines(scene.view, scene.losY);
  const defInk = dark ? DARK_DEFENSE : DEFENSE_INK;
  const grow = big ? 1.5 : 1;

  let ball: { x: number; y: number } | null = null;
  if (thrown && result.target) {
    const qbId = [...result.offense.keys()].find((pid) => {
      const n = scene.nodes.find((x) => x.id === pid);
      return n?.kind === "player" && n.label.toUpperCase() === "Q";
    });
    const from = qbId ? result.offense.get(qbId)![Math.round(result.throwAt * FPS)] : null;
    const to = result.offense.get(result.target.id)?.[k];
    const p = Math.min(1, (t - result.throwAt) / BALL_FLIGHT);
    if (from && to) ball = { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p - Math.sin(Math.PI * p) * 26 };
  }

  const teamStyle = teamOn ? ({ "--fr-team": brand.primary, "--fr-team2": brand.secondary, "--fr-team-ink": inkOn(brand.primary) } as React.CSSProperties) : undefined;
  const title = name.trim() || "Untitled play";

  return (
    <div className="fr" data-theme={theme} role="dialog" aria-modal="true" aria-labelledby="fr-h" ref={panel} tabIndex={-1} style={teamStyle}>
      <header className="fr-top">
        <h2 id="fr-h">
          Film Room <span>{title}</span>
        </h2>
        <span className="fr-vs">vs {look.name}</span>
        {teamOn && (
          <span className="fr-team">
            {brand.logo && <img src={brand.logo} alt="" />}
            {brand.name.trim() || "My team"}
          </span>
        )}
        <div className="fr-looks" role="group" aria-label="Look">
          {TEACH_LOOKS.map((l) => (
            <button key={l} type="button" aria-pressed={pick === l} onClick={() => save({ look: l })}>
              {TEACH_LOOK_NAME[l]}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-outline-dark btn-sm" onClick={onClose}>
          {closeLabel}
        </button>
      </header>

      {!teachable ? (
        <p className="fr-none">Film Room teaches offensive plays for now. Put an offense on the field, give the receivers routes, and open it again.</p>
      ) : (
        <div className="fr-body">
          <div className="fr-main">
            <div className="fr-field">
              <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} role="img" aria-label={`${title} against ${look.name}. Step ${i + 1} of ${steps.length}: ${step.title}. ${t.toFixed(1)} seconds after the snap.`}>
                <MarkerDefs colors={strokeColors(nodes)} />
                <rect className="fr-turf" x={0} y={0} width={CANVAS_W} height={CANVAS_H} />
                <line className="fr-side" x1={inset} y1={0} x2={inset} y2={CANVAS_H} />
                <line className="fr-side" x1={CANVAS_W - inset} y1={0} x2={CANVAS_W - inset} y2={CANVAS_H} />
                {lines.map((l) => (
                  <g key={l.y}>
                    <line className="fr-yard" x1={inset} y1={l.y} x2={CANVAS_W - inset} y2={l.y} />
                    {l.yards % 10 === 0 && l.y < scene.losY && (
                      <text className="fr-num" x={inset + 10} y={l.y - 5}>
                        {l.yards}
                      </text>
                    )}
                  </g>
                ))}
                <line className="fr-los" x1={inset} y1={scene.losY} x2={CANVAS_W - inset} y2={scene.losY} />
                {teamOn && brand.logo && <image className="fr-mark" href={brand.logo} x={CANVAS_W / 2 - 70} y={Math.max(20, scene.losY - 330)} width={140} height={140} preserveAspectRatio="xMidYMid meet" />}

                {showZones &&
                  result.defenders.map((d, di) =>
                    d.landmark && d.reach ? (
                      <g key={`z${di}`} opacity={zoneTags ? 1 : 0.45}>
                        <ellipse className="fr-zone" cx={d.landmark.x} cy={d.landmark.y} rx={d.reach.rx / 1.15} ry={d.reach.ry / 2.4} />
                        {zoneTags && (
                          <text className="fr-zone-tag" x={d.landmark.x} y={d.landmark.y + 4} textAnchor="middle">
                            {lesson.jobs[di].job.toUpperCase()}
                          </text>
                        )}
                      </g>
                    ) : null,
                  )}

                {nodes.map((n) => {
                  if (n.kind !== "player") return <NodeLayer key={n.id} node={n} opacity={inkOpacity(n)} className={n.kind === "path" && n.firstRead && id === "call" ? "fr-first" : undefined} />;
                  const p = result.offense.get(n.id)?.[k] ?? n;
                  const s = thrown ? statusOf.get(n.id) : undefined;
                  const dim = id === "job" && n.label.trim().toUpperCase() !== who;
                  return (
                    <g key={n.id} opacity={dim ? 0.3 : 1}>
                      {s && <circle cx={p.x} cy={p.y} r={n.size * 0.95 * grow} fill="none" stroke={STATUS_COLOR[s]} strokeWidth={6} />}
                      {dark && <circle className="fr-ring" cx={p.x} cy={p.y} r={n.size * 0.6 * grow} />}
                      <NodeLayer node={{ ...n, x: p.x, y: p.y, scaleX: n.scaleX * grow, scaleY: n.scaleY * grow }} />
                    </g>
                  );
                })}

                {id === "read" &&
                  result.rows.map((r) => (
                    <g key={`r${r.id}`} aria-hidden="true">
                      <circle cx={r.end.x} cy={r.end.y - 20} r={10} fill="#F2B705" stroke="#0B1524" strokeWidth={1.5} />
                      <text x={r.end.x} y={r.end.y - 16} textAnchor="middle" fontSize={12} fontWeight={700} fill="#0B1524" fontFamily="'IBM Plex Mono', monospace">
                        {r.read}
                      </text>
                    </g>
                  ))}

                {result.defenders.map((d, di) => {
                  const p = result.defense[k]?.[di] ?? d.start;
                  return (
                    <g key={`d${di}`} aria-hidden="true" opacity={id === "job" ? 0.35 : 1} data-defender={d.label}>
                      <circle cx={p.x} cy={p.y} r={15 * grow} fill={dark ? "#2A1717" : "#fff"} stroke={defInk} strokeWidth={2.6} />
                      <text x={p.x} y={p.y + 4.5 * grow} textAnchor="middle" fontSize={13 * grow} fontWeight={700} fill={defInk} fontFamily="'Barlow', sans-serif">
                        {d.label}
                      </text>
                    </g>
                  );
                })}
                {ball && <ellipse cx={ball.x} cy={ball.y} rx={11} ry={7} fill="#B07A45" stroke="#41290F" strokeWidth={2} />}
              </svg>
              <span className="fr-clock">{t.toFixed(1)} S</span>
            </div>

            <div className="fr-cap">
              <i className="fr-prog" style={{ width: `${total ? (done / total) * 100 : 0}%` }} aria-hidden="true" />
              <p aria-live="polite">
                {captionParts(step.caption).map((c, ci) => (c.key ? <em key={ci}>{c.text}</em> : <span key={ci}>{c.text}</span>))}
              </p>
            </div>

            <div className="fr-bar">
              <button type="button" className="btn btn-outline-dark btn-sm" onClick={() => go(i - 1)} disabled={i === 0}>
                Back a step
              </button>
              {playing ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setPlaying(false)}>
                  Pause
                </button>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" onClick={play}>
                  {atEnd ? "Play it again" : "Play the lesson"}
                </button>
              )}
              <button type="button" className="btn btn-outline-dark btn-sm" onClick={() => go(i + 1)} disabled={i === steps.length - 1}>
                Next step
              </button>
              <label className="fr-against">
                <span>Against</span>
                <select value={look.id} onChange={(e) => save({ against: e.target.value })}>
                  {looks.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              {branded ? (
                <label className="fr-check">
                  <input type="checkbox" checked={teamOn} onChange={(e) => save({ team: e.target.checked })} /> Team colors and logo
                </label>
              ) : coach ? (
                <a className="fr-link" href="/roster">
                  Add your team colors on My team
                </a>
              ) : null}
            </div>
          </div>

          <aside className="fr-side-panel" aria-label="Lesson steps">
            <p className="fr-k">Install · {steps.length} steps</p>
            <ol className="fr-steps">
              {steps.map((s, si) => (
                <li key={s.id}>
                  <button type="button" className={si === i ? "is-now" : si < i ? "is-done" : ""} aria-current={si === i ? "step" : undefined} onClick={() => go(si)}>
                    <b aria-hidden="true">{si + 1}</b>
                    {s.title}
                  </button>
                </li>
              ))}
            </ol>

            <div className="fr-card">
              {id === "look" && (
                <>
                  <h3>{look.name}</h3>
                  <p>Before the snap, find the safeties and count who is deep. That tells you the coverage.</p>
                </>
              )}
              {id === "zones" && (
                <>
                  <h3>Who has what</h3>
                  <ul className="fr-rows">
                    {lesson.jobs.map((j, ji) => (
                      <li key={ji}>
                        <i className="is-def">{j.label}</i>
                        {j.job}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {id === "call" && (
                <>
                  <h3>The call</h3>
                  {result.rows.length ? (
                    <ul className="fr-rows">
                      {result.rows.map((r) => (
                        <li key={r.id}>
                          <i>{r.label}</i>
                          {r.route}
                          <span>Read {r.read}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Nobody has a route yet. Draw lines from the receivers and the lesson fills in.</p>
                  )}
                </>
              )}
              {id === "snap" && (
                <>
                  <h3>Snap</h3>
                  <p>Everybody runs his route at full speed. The ball is due out at {result.throwAt.toFixed(1)} seconds.</p>
                </>
              )}
              {id === "read" && (
                <>
                  <h3>At the throw</h3>
                  <table className="fr-table">
                    <thead>
                      <tr>
                        <th scope="col">Read</th>
                        <th scope="col">Player</th>
                        <th scope="col">Route</th>
                        <th scope="col">Space</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((r) => (
                        <tr key={r.id}>
                          <td>{r.read}</td>
                          <td>{r.label}</td>
                          <td>{r.route}</td>
                          <td>{yards(r.sep)} yd</td>
                          <td>
                            <span className={`fr-pill is-${r.status}`}>{r.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="fr-foot">A teaching model from the Coverage check, not a promise about a real defense.</p>
                </>
              )}
              {id === "job" && (
                <>
                  <h3>Your job</h3>
                  <div className="fr-letters" role="group" aria-label="Show the job for">
                    {lesson.letters.map((l) => (
                      <button
                        key={l}
                        type="button"
                        aria-pressed={l === who}
                        onClick={() => {
                          setLetter(l);
                          setPlaying(false);
                          setAt({ i, u: 0 });
                        }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <p>{plainCaption(step.caption)}</p>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
