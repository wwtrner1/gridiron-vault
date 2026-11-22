import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useDialogFocus } from "../lib/dialogFocus";
import { PREVIEW_CAMERAS as CAMERAS, cameraOn } from "../lib/film3d";
import { cameraPlayers, useFilmView, useMedia, usePlayLesson } from "../lib/filmView";
import type { FilmCameraState } from "../lib/filmView";
import { lazyPage } from "../lib/lazyPage";
import type { TeachStep } from "../lib/teach";
import type { Scene } from "../lib/types";
import { CameraControls } from "./CameraControls";
import { LessonField } from "./LessonField";
import "../styles/filmroom.css";

const LessonField3D = lazyPage(() => import("./LessonField3D"), "LessonField3D");

/** A beat lined up before the snap, so the eye finds the formation first. */
const SET = 0.8;

/**
 * Preview: the play run once from the snap, flat or in 3D, before it goes
 * anywhere. This is where a coach picks the view and the 3D camera, and the
 * next step (Export, Make a video, the Film Room) sits right under the field.
 * It changes nothing in the play.
 */
export function PlayPreview({
  scene,
  name,
  rushYards = 7,
  cam,
  onExport,
  onVideo,
  onFilmRoom,
  onClose,
}: {
  scene: Scene;
  name: string;
  rushYards?: number;
  /** The 3D camera, shared with the Designer's own 3D look. */
  cam: FilmCameraState;
  onExport: () => void;
  onVideo: () => void;
  onFilmRoom: () => void;
  onClose: () => void;
}) {
  const { teachable, lesson, look, who, dark, logo, colors } = usePlayLesson(scene, name, rushYards);
  const { in3d, noGl, pickView, fail } = useFilmView(true);
  const narrow = useMedia("(max-width: 640px)");
  const sideways = useMedia("(max-height: 520px) and (orientation: landscape)");
  const big = narrow || sideways;

  // One run of the whole play: the Film Room's Snap step, carried through the catch.
  const end = lesson.result.duration;
  const step = useMemo<TeachStep>(() => ({ ...(lesson.steps.find((s) => s.id === "snap") ?? lesson.steps[0]), id: "snap", from: 0, to: end, rate: 1, hold: SET, voice: undefined }), [lesson, end]);
  const length = SET + end;
  const [u, setU] = useState(0);
  const [playing, setPlaying] = useState(false);
  const uRef = useRef(u);
  uRef.current = u;
  const t = Math.max(0, Math.min(end, u - SET));
  const atEnd = u >= length;
  const camera = cameraOn(CAMERAS, cam.pick.camera);
  const players = useMemo(() => cameraPlayers(scene, lesson), [scene, lesson]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const next = uRef.current + (now - last) / 1000;
      last = now;
      if (next >= length) {
        setU(length);
        setPlaying(false);
        return;
      }
      setU(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, length]);

  const panel = useRef<HTMLDivElement>(null);
  useDialogFocus(panel, onClose);
  const title = name.trim() || "Untitled play";
  const label = `${title} against ${look.name}${in3d ? ", in 3D" : ""}. ${t.toFixed(1)} seconds after the snap.`;

  return (
    <div className="fr pv" data-theme={dark ? "dark" : "light"} role="dialog" aria-modal="true" aria-labelledby="pv-h" ref={panel} tabIndex={-1}>
      <header className="fr-top">
        <h2 id="pv-h">
          Preview <span>{title}</span>
        </h2>
        {teachable && <span className="fr-vs">vs {look.name}</span>}
        {teachable && (
          <div className="fr-looks fr-views" role="group" aria-label="View">
            {(["flat", "3d"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={v === "3d" ? in3d : !in3d} onClick={() => pickView(v)}>
                {v === "3d" ? "3D" : "Flat"}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="btn btn-outline-dark btn-sm" onClick={onClose}>
          Back to drawing
        </button>
      </header>

      {!teachable ? (
        <div className="fr-none">
          <p>The moving preview needs an offense on the field. Add your players and their routes, then open it again. The drawing itself can still be exported.</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={onExport}>
            Export
          </button>
        </div>
      ) : (
        <div className="fr-body pv-body">
          <div className="fr-main">
            <div className={in3d ? "fr-field is-3d" : "fr-field"}>
              {in3d ? (
                <Suspense fallback={<div className="fr-3d"><span className="fr-3d-wait">Loading 3D…</span></div>}>
                  <LessonField3D scene={scene} lesson={lesson} step={step} t={t} who={who} dark={dark} logo={logo} team={colors} camera={camera} side={cam.pick.side} pass={cam.pick.pass} follow={cam.follow} onPick={cam.tap} light={big} ball label={label} onFail={fail} />
                </Suspense>
              ) : (
                <LessonField scene={scene} lesson={lesson} step={step} t={t} who={who} dark={dark} logo={logo} grow={big ? 1.5 : 1} crop={big} spread={narrow && !sideways} ball label={label} />
              )}
              <span className="fr-clock">{t.toFixed(1)} S</span>
            </div>
            {noGl && (
              <p className="fr-note" role="status">
                This browser can't draw 3D, so the preview is shown flat.
              </p>
            )}

            <div className="fr-bar">
              <div className="fr-play">
                {playing ? (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setPlaying(false)}>
                    Pause
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => (atEnd && setU(0), setPlaying(true))}>
                    {atEnd ? "Run it again" : "Run the play"}
                  </button>
                )}
              </div>
              <label className="fr-against pv-time">
                <span>Time</span>
                <input
                  type="range"
                  min={0}
                  max={end}
                  step={0.05}
                  value={t}
                  aria-valuetext={`${t.toFixed(1)} seconds after the snap`}
                  onChange={(e) => (setPlaying(false), setU(SET + Number(e.target.value)))}
                />
              </label>
              {in3d && <CameraControls cam={cam} cameras={CAMERAS} players={players} className="fr-against" />}
            </div>

            <div className="pv-next">
              <p className="fr-k">Next</p>
              <div className="pv-next-row">
                <button type="button" className="btn btn-primary btn-sm" onClick={onExport}>
                  Export
                </button>
                <button type="button" className="btn btn-outline-dark btn-sm" onClick={onVideo}>
                  Make a video
                </button>
                <button type="button" className="btn btn-outline-dark btn-sm" onClick={onFilmRoom}>
                  Teach it in the Film Room
                </button>
              </div>
              <p className="fr-hint">
                Flat or 3D and the camera are picked here, on the Designer's field and in the Film Room. An export is your flat drawing as it prints, without this defense. A video is the Film Room lesson, drawn flat.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
