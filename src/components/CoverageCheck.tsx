import { useEffect, useMemo, useRef, useState } from "react";
import { onboarding } from "../lib/onboarding";
import { checkAll, FORMAT_NAME, grade, simulate, STATUS_COLOR, THROW_AT, verdict, wins, yards } from "../lib/coverage";
import type { Result } from "../lib/coverage";
import { DEFENSE_INK, ZONE_FILL, ZONE_STROKE } from "../lib/defense";
import { FieldBackground } from "../lib/field";
import { drawOrder, MarkerDefs, NodeLayer, strokeColors } from "../lib/render";
import { CANVAS_H, CANVAS_W } from "../lib/types";
import type { PlayMeta, Scene } from "../lib/types";

const FPS = 30;
const SPEEDS = [0.5, 1] as const;
const BALL_FLIGHT = 0.5;

/**
 * Coverage check: the play runs against a live defense (zone drops that
 * squeeze, man that trails, a rush that chases the quarterback) and the table
 * says who is open when the ball is due out. Every look for the play's format
 * is checked at once, so the chips double as "what does this beat". Nothing
 * here changes the play; "Show on the field" only sets the Vs defense overlay.
 */
export function CoverageCheck({
  scene,
  name,
  playType,
  rushYards,
  onShowLook,
  onClose,
}: {
  scene: Scene;
  name: string;
  playType: PlayMeta["playType"];
  /** The league's rush line, in yards, so a flag rusher starts where he legally can. */
  rushYards: number;
  /** Lays the chosen look under the play in the Designer (Vs defense). */
  onShowLook: (overlay: string) => void;
  onClose: () => void;
}) {
  const report = useMemo(() => checkAll(scene, { rushYards }), [scene, rushYards]);
  useEffect(() => onboarding.mark("coverage"), []);
  const format = report.format;
  const [lookId, setLookId] = useState(() => report.worst?.look.id ?? report.results[0]?.look.id ?? "");
  const [throwAt, setThrowAt] = useState(THROW_AT[format]);
  const look = report.results.find((r) => r.look.id === lookId)?.look ?? report.results[0]?.look;
  const result: Result | null = useMemo(() => (look ? simulate(scene, look, { throwAt, rushYards, extra: BALL_FLIGHT + 0.5 }) : null), [scene, look, throwAt, rushYards]);

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const tRef = useRef(0);
  tRef.current = t;
  const duration = result?.duration ?? 3;

  // A new look or throw time starts from the snap.
  useEffect(() => {
    setPlaying(false);
    setT(0);
  }, [lookId, throwAt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const next = tRef.current + ((now - last) / 1000) * speed;
      last = now;
      if (next >= duration) {
        setT(duration);
        setPlaying(false);
        return;
      }
      setT(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, duration]);

  const k = Math.min(Math.round(t * FPS), Math.round(duration * FPS));
  const thrown = !!result && t >= result.throwAt;
  const statusOf = new Map(thrown && result ? result.rows.map((r) => [r.id, r.status]) : []);
  const ordered = drawOrder(scene.nodes);

  // The ball, from the quarterback's hands to the target after the throw.
  let ball: { x: number; y: number } | null = null;
  if (result && thrown && result.target) {
    const qbId = [...result.offense.keys()].find((id) => {
      const n = scene.nodes.find((x) => x.id === id);
      return n?.kind === "player" && n.label.toUpperCase() === "Q";
    });
    const fk = Math.round(result.throwAt * FPS);
    const from = qbId ? result.offense.get(qbId)![fk] : null;
    const to = result.offense.get(result.target.id)?.[k];
    const p = Math.min(1, (t - result.throwAt) / BALL_FLIGHT);
    if (from && to && p < 1) ball = { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p - Math.sin(Math.PI * p) * 26 };
  }

  const run = () => {
    if (t >= duration) setT(0);
    setPlaying(true);
  };

  const throwChoices = [...new Set([1.6, THROW_AT[format], 3])].sort((a, b) => a - b);

  return (
    <div className="rp cov" role="dialog" aria-modal="true" aria-labelledby="cov-h">
      <header className="rp-top">
        <h2 id="cov-h">
          Coverage check <span>{name || "Untitled play"}</span>
        </h2>
        <button type="button" className="btn btn-outline-dark btn-sm" onClick={onClose}>
          Back to drawing
        </button>
      </header>

      <div className="rp-body">
        <div className="rp-left">
          <div className="cov-looks" role="group" aria-label={`Defenses to run against (${FORMAT_NAME[format]})`}>
            {report.results.map((r) => {
              const won = wins(r);
              const s = grade(r);
              return (
                <button
                  key={r.look.id}
                  type="button"
                  className={`cov-look${r.look.id === look?.id ? " is-on" : ""}`}
                  aria-pressed={r.look.id === look?.id}
                  onClick={() => setLookId(r.look.id)}
                >
                  <i style={{ background: r.rows.length ? STATUS_COLOR[s] : "var(--muted-2)" }} aria-hidden="true" />
                  {r.look.name}
                  <span className="sr-only">{r.rows.length ? (won ? ", beaten" : ", not beaten") : ""}</span>
                </button>
              );
            })}
          </div>

          <div className="rp-field">
            <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} role="img" aria-label={`${name || "Play"} against ${look?.name ?? "the defense"}, ${t.toFixed(1)} seconds after the snap`}>
              <MarkerDefs colors={strokeColors(scene.nodes)} />
              <FieldBackground view={scene.view} losY={scene.losY} />
              {result?.defenders.map((d, i) =>
                d.landmark && d.reach ? (
                  <ellipse
                    key={`z${i}`}
                    cx={d.landmark.x}
                    cy={d.landmark.y}
                    rx={d.reach.rx / 1.15}
                    ry={d.reach.ry / 2.4}
                    fill={ZONE_FILL}
                    fillOpacity={0.55}
                    stroke={ZONE_STROKE}
                    strokeWidth={1.4}
                    strokeDasharray="6 5"
                  />
                ) : null,
              )}
              {ordered.map((n) => {
                if (n.kind !== "player") return <NodeLayer key={n.id} node={n} opacity={0.3} />;
                const p = result?.offense.get(n.id)?.[k] ?? n;
                const s = statusOf.get(n.id);
                return (
                  <g key={n.id}>
                    {s && <circle cx={p.x} cy={p.y} r={n.size * 0.95} fill="none" stroke={STATUS_COLOR[s]} strokeWidth={6} />}
                    <NodeLayer node={{ ...n, x: p.x, y: p.y }} />
                  </g>
                );
              })}
              {/* Read order: a numbered badge at the end of each receiver's route. */}
              {result?.rows.map((r) => (
                <g key={`r${r.id}`} aria-hidden="true">
                  <circle cx={r.end.x} cy={r.end.y - 20} r={10} fill="#F2B705" stroke="#0B1524" strokeWidth={1.5} />
                  <text x={r.end.x} y={r.end.y - 16} textAnchor="middle" fontSize={12} fontWeight={700} fill="#0B1524" fontFamily="'IBM Plex Mono', monospace">
                    {r.read}
                  </text>
                </g>
              ))}
              {result?.defenders.map((d, i) => {
                const p = result.defense[k]?.[i] ?? d.start;
                return (
                  <g key={`d${i}`} aria-hidden="true">
                    <circle cx={p.x} cy={p.y} r={15} fill="#fff" stroke={DEFENSE_INK} strokeWidth={2.6} />
                    <text x={p.x} y={p.y + 4.5} textAnchor="middle" fontSize={13} fontWeight={700} fill={DEFENSE_INK} fontFamily="'Barlow', sans-serif">
                      {d.label}
                    </text>
                  </g>
                );
              })}
              {ball && <ellipse cx={ball.x} cy={ball.y} rx={11} ry={7} fill="#7A5230" stroke="#41290F" strokeWidth={2} />}
            </svg>
            <span className="rp-clock">
              {t.toFixed(1)} S · {speed}X
            </span>
          </div>

          <div className="rp-bar">
            {playing ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setPlaying(false)}>
                Pause
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={run}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M7 5v14l12-7z" />
                </svg>
                Run it
              </button>
            )}
            <div className="rp-speed" role="group" aria-label="Speed">
              {SPEEDS.map((s) => (
                <button key={s} type="button" className={speed === s ? "is-on" : ""} aria-pressed={speed === s} onClick={() => setSpeed(s)}>
                  {s}×
                </button>
              ))}
            </div>
            <div className="rp-time">
              <input type="range" min={0} max={duration} step={1 / FPS} value={t} aria-label="Time after the snap" onChange={(e) => (setPlaying(false), setT(Number(e.target.value)))} />
              <span className="rp-mark" style={{ left: "0%" }}>
                SNAP
              </span>
              {result && (
                <span className="rp-mark" style={{ left: `${(result.throwAt / duration) * 100}%` }}>
                  BALL OUT
                </span>
              )}
            </div>
            <div className="rp-speed" role="group" aria-label="Ball out at">
              {throwChoices.map((s) => (
                <button key={s} type="button" className={throwAt === s ? "is-on" : ""} aria-pressed={throwAt === s} onClick={() => setThrowAt(s)}>
                  {s.toFixed(1)} s
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rp-right">
          <p className="cov-sum">
            {report.results.some((r) => r.rows.length)
              ? `Beats ${report.beats} of ${report.results.length} ${FORMAT_NAME[format]} looks.`
              : "No receiver has a route to check yet."}
          </p>
          {playType === "run" && <p className="rp-note">This is marked as a run play. The check only reads the pass routes drawn on it.</p>}
          {result && (
            <>
              <h3 className="cov-h">vs {result.look.name}</h3>
              <p className="cov-verdict" aria-live="polite">
                {verdict(result)}
              </p>
              {result.rows.length > 0 && (
                <table className="cov-table">
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
                      <tr key={r.id} className={r.id === result.target?.id ? "is-target" : ""}>
                        <td>{r.read}</td>
                        <td>{r.label}</td>
                        <td>{r.route}</td>
                        <td>{yards(r.sep)} yds</td>
                        <td>
                          <span className="cov-pill" style={{ background: STATUS_COLOR[r.status] }}>
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {result.look.overlay && (
                <button type="button" className="btn btn-outline-dark" onClick={() => (onShowLook(result.look.overlay!), onClose())}>
                  Show {result.look.name} on the field
                </button>
              )}
            </>
          )}
          <p className="rp-note">
            Space is yards to the nearest defender in coverage when the ball comes out. Open is {">"}2.5 yds, tight is 1.2 to 2.5. Zones drop and squeeze the nearest
            receiver, man defenders trail a step late, and the rush chases the quarterback. It is a teaching model to compare plays, not a promise about Saturday.
          </p>
        </div>
      </div>
    </div>
  );
}
