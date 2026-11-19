import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { lazyPage } from "../lib/lazyPage";
import { brandStore, hasBrand, inkOn, useBrand } from "../lib/brand";
import { yards } from "../lib/coverage";
import { useDialogFocus } from "../lib/dialogFocus";
import { LessonField } from "./LessonField";
import { FilmTips, filmTips, filmTipsSeen, markFilmTipsSeen } from "./FilmTips";
import { repText } from "../lib/breakdown";
import type { FilmRep } from "../lib/breakdown";
import { LessonVoice } from "./LessonVoice";
import { voiceUrl } from "../lib/voice";
import type { VoiceClip } from "../lib/voice";
import { buildLesson, canTeach, captionParts, clockAt, defaultLook, plainCaption, stepLength, teachLooks, TEACH_LOOKS, TEACH_LOOK_NAME } from "../lib/teach";
import type { StepId, TeachLook, TeachSettings } from "../lib/teach";
import type { Scene } from "../lib/types";
import "../styles/filmroom.css";

const LessonVideo = lazyPage(() => import("./LessonVideo"), "LessonVideo");

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
  rep,
  closeLabel = "Back to drawing",
  onlyLook,
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
  /** A rep of this play on film (from a breakdown): the lesson and its video say which one. */
  rep?: FilmRep;
  closeLabel?: string;
  /** Hold the lesson to one defense by name ("Cover 3"): no picker, whatever the play saved. */
  onlyLook?: string;
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
  const held = onlyLook ? looks.find((l) => l.name.endsWith(onlyLook)) : undefined;
  const look = held ?? looks.find((l) => l.id === settings.against) ?? fallback;
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

  const [making, setMaking] = useState(false);

  // The coach's own voice, where a step has one: it starts with the step and stops with Pause.
  const spoken = steps.some((s) => s.voice);
  const [sound, setSound] = useState(true);
  const voiceEl = useRef<HTMLAudioElement | null>(null);
  const clipNow = step.voice;
  useEffect(() => {
    if (!playing || !sound || !clipNow) {
      voiceEl.current?.pause();
      return;
    }
    const u = atRef.current.u;
    if (u * 1000 >= clipNow.ms) return;
    const el = (voiceEl.current ??= new Audio());
    el.muted = false;
    el.src = voiceUrl(clipNow.id);
    // Picking the lesson up mid-step picks the words up there too.
    if (u > 0.3) el.addEventListener("loadedmetadata", () => (el.currentTime = u), { once: true });
    el.play().catch(() => undefined);
    return () => el.pause();
  }, [playing, sound, i, clipNow?.id, clipNow?.ms]);
  const panel = useRef<HTMLDivElement>(null);

  // The tips show once (per browser, and per account for a coach); the Tips button brings them back.
  const [tipsUp, setTipsUp] = useState(() => teachable && !filmTipsSeen() && !(coach && brand.filmTips === false));
  const tips = useMemo(() => filmTips(coach), [coach]);
  const endTips = () => {
    setTipsUp(false);
    markFilmTipsSeen();
    if (coach && brand.filmTips !== false) {
      try {
        brandStore.set({ filmTips: false });
      } catch {
        /* storage full: this browser still remembers */
      }
    }
  };
  // The account's copy can arrive after the lesson opens: tips already seen on another device step aside.
  useEffect(() => {
    if (coach && brand.filmTips === false) setTipsUp((up) => (up && !filmTipsSeen() ? (markFilmTipsSeen(), false) : up));
  }, [coach, brand.filmTips]);
  // Escape puts the tips away first, then the lesson.
  useDialogFocus(panel, () => (tipsUp ? endTips() : onClose()));

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
    // Phones only let a page speak after a press, so the voice is woken here, inside the press.
    if (spoken && sound && !voiceEl.current) {
      const el = (voiceEl.current = new Audio());
      el.muted = true;
      el.src = voiceUrl(steps.find((s) => s.voice)!.voice!.id);
      el.play().catch(() => undefined);
    }
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

  const keepClip = (clip: VoiceClip | undefined) => {
    const voice = { ...settings.voice };
    if (clip) voice[step.id] = clip;
    else delete voice[step.id];
    save({ voice: Object.keys(voice).length ? voice : undefined });
  };
  /** Several steps' clips in one save (the Film Room voice reading every step). */
  const keepClips = (clips: Partial<Record<StepId, VoiceClip>>) => save({ voice: { ...settings.voice, ...clips } });

  const id = step.id;
  const who = lesson.letters.includes(letter) ? letter : lesson.letters[0] ?? "";

  const teamStyle = teamOn ? ({ "--fr-team": brand.primary, "--fr-team2": brand.secondary, "--fr-team-ink": inkOn(brand.primary) } as React.CSSProperties) : undefined;
  const title = name.trim() || "Untitled play";

  return (
    <div className="fr" data-theme={theme} role="dialog" aria-modal="true" aria-labelledby="fr-h" ref={panel} tabIndex={-1} style={teamStyle}>
      <header className="fr-top">
        <h2 id="fr-h">
          Film Room <span>{title}</span>
        </h2>
        <span className="fr-vs">vs {look.name}</span>
        {rep && <span className="fr-rep">On film: {repText(rep)}</span>}
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
        {teachable && (
          <button type="button" className="btn btn-outline-dark btn-sm" data-fr-tip="tips" aria-pressed={tipsUp} onClick={() => (tipsUp ? endTips() : (setPlaying(false), setTipsUp(true)))}>
            Tips
          </button>
        )}
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
              <LessonField scene={scene} lesson={lesson} step={step} t={t} who={who} dark={dark} logo={teamOn ? (brand.logo ?? undefined) : undefined} grow={big ? 1.5 : 1} label={`${title} against ${look.name}. Step ${i + 1} of ${steps.length}: ${step.title}. ${t.toFixed(1)} seconds after the snap.`} />
              <span className="fr-clock">{t.toFixed(1)} S</span>
            </div>

            <div className="fr-cap">
              <i className="fr-prog" style={{ width: `${total ? (done / total) * 100 : 0}%` }} aria-hidden="true" />
              <p aria-live="polite">
                {captionParts(step.caption).map((c, ci) => (c.key ? <em key={ci}>{c.text}</em> : <span key={ci}>{c.text}</span>))}
              </p>
            </div>

            <div className="fr-bar">
              <div className="fr-play">
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
              </div>
              {held ? (
                <p className="fr-against">
                  <span>Against</span> {held.name}
                </p>
              ) : (
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
              )}
              {spoken && (
                <button type="button" className="btn btn-outline-dark btn-sm" data-fr-tip="sound" aria-pressed={sound} onClick={() => setSound((v) => !v)}>
                  {sound ? "Voice on" : "Voice off"}
                </button>
              )}
              {coach && (
                <button type="button" className="btn btn-outline-dark btn-sm" data-fr-tip="video" onClick={() => (setPlaying(false), setMaking(true))}>
                  Make a video
                </button>
              )}
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
            {coach && <LessonVoice step={step} steps={steps} clip={step.voice} onClip={keepClip} onClips={keepClips} />}
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
      {tipsUp && !making && <FilmTips panel={panel} tips={tips} onDone={endTips} />}
      {making && (
        <Suspense fallback={null}>
          <LessonVideo
            scene={scene}
            lesson={lesson}
            name={name}
            who={who}
            note={rep ? `On film: ${repText(rep)}` : undefined}
            dark={dark}
            team={teamOn ? { name: brand.name, logo: brand.logo ?? undefined, primary: brand.primary, secondary: brand.secondary, ink: inkOn(brand.primary) } : undefined}
            onClose={() => setMaking(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
