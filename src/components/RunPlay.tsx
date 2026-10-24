import { useEffect, useMemo, useRef, useState } from "react";
import { FieldBackground } from "../lib/field";
import { drawOrder, MarkerDefs, NodeLayer, strokeColors } from "../lib/render";
import { ballAt, buildTimeline, clock, isFilmLink, linkAt, parseClock, positionsAt } from "../lib/runPlay";
import { CANVAS_H, CANVAS_W } from "../lib/types";
import type { Scene } from "../lib/types";
import { Icon } from "./Icon";

const SPEEDS = [0.5, 1, 2] as const;

/**
 * Run play with video, from the Grid1ron Design canvas: the play animates
 * from the snap, a timeline marks the snap and the throw, and a clip can
 * run in time with it once the coach marks the snap. Running a play never
 * changes the saved diagram.
 */
export function RunPlay({
  scene,
  name,
  onFilm,
  onClose,
}: {
  scene: Scene;
  name: string;
  /** Saves the film link and snap mark onto the play. */
  onFilm: (film: Scene["film"]) => void;
  onClose: () => void;
}) {
  const tl = useMemo(() => buildTimeline(scene), [scene]);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState("");
  const [sync, setSync] = useState(true);
  const [linkDraft, setLinkDraft] = useState(scene.film?.link ?? "");
  const [linkError, setLinkError] = useState("");
  const snapAt = scene.film?.snapAt ?? 0;
  const video = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tRef = useRef(0);
  tRef.current = t;

  // Free the local clip when leaving.
  useEffect(() => () => void (videoUrl && URL.revokeObjectURL(videoUrl)), [videoUrl]);

  // Escape goes back to drawing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The clock: the drawing leads, the clip follows when synced.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const next = tRef.current + ((now - last) / 1000) * speed;
      last = now;
      if (next >= tl.duration) {
        setT(tl.duration);
        setPlaying(false);
        video.current?.pause();
        return;
      }
      setT(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, tl.duration]);

  const linked = sync && videoUrl && video.current;
  const seekVideo = (time: number) => {
    if (linked) video.current!.currentTime = Math.max(0, snapAt + time);
  };

  const run = () => {
    const start = t >= tl.duration ? 0 : t;
    setT(start);
    if (linked) {
      video.current!.playbackRate = speed;
      seekVideo(start);
      void video.current!.play();
    }
    setPlaying(true);
  };
  const pause = () => {
    setPlaying(false);
    video.current?.pause();
  };

  const at = positionsAt(scene, tl, t);
  const ball = ballAt(tl, at, t);
  const ordered = drawOrder(scene.nodes);

  const attach = (file: File) => {
    if (!file.type.startsWith("video/")) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file));
    setVideoName(file.name);
  };
  const saveLink = () => {
    const v = linkDraft.trim();
    if (v && !isFilmLink(v)) return setLinkError("Paste a Hudl or YouTube link that starts with https://.");
    setLinkError("");
    onFilm({ ...scene.film, link: v || undefined });
  };

  return (
    <div className="rp" role="dialog" aria-modal="true" aria-labelledby="rp-h">
      <header className="rp-top">
        <h2 id="rp-h">
          Run play <span>{name || "Untitled play"}</span>
        </h2>
        <button type="button" className="btn btn-outline-dark btn-sm" onClick={onClose}>
          Back to drawing
        </button>
      </header>

      <div className="rp-body">
        <div className="rp-left">
          <div className="rp-field">
            <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} role="img" aria-label={`${name || "Play"} running, ${t.toFixed(1)} seconds after the snap`}>
              <MarkerDefs colors={strokeColors(scene.nodes)} />
              <FieldBackground view={scene.view} losY={scene.losY} />
              {ordered.map((n) => {
                if (n.kind !== "player") return <NodeLayer key={n.id} node={n} opacity={0.35} />;
                const p = at.get(n.id) ?? n;
                return <NodeLayer key={n.id} node={{ ...n, x: p.x, y: p.y }} />;
              })}
              {ball && <ellipse cx={ball.x} cy={ball.y} rx={11} ry={7} fill="#7A5230" stroke="#41290F" strokeWidth={2} />}
            </svg>
            <span className="rp-clock">
              {t.toFixed(1)} S · {speed}X
            </span>
          </div>

          <div className="rp-bar">
            {playing ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={pause}>
                Pause
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={run}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M7 5v14l12-7z" />
                </svg>
                Run play
              </button>
            )}
            <div className="rp-speed" role="group" aria-label="Speed">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={speed === s ? "is-on" : ""}
                  aria-pressed={speed === s}
                  onClick={() => {
                    setSpeed(s);
                    if (video.current) video.current.playbackRate = s;
                  }}
                >
                  {s}×
                </button>
              ))}
            </div>
            <div className="rp-time">
              <input
                type="range"
                min={0}
                max={tl.duration}
                step={0.01}
                value={t}
                aria-label="Time after the snap"
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setT(v);
                  seekVideo(v);
                }}
              />
              <span className="rp-mark" style={{ left: "0%" }}>
                SNAP
              </span>
              {tl.throwAt !== null && (
                <span className="rp-mark" style={{ left: `${(tl.throwAt / tl.duration) * 100}%` }}>
                  THROW
                </span>
              )}
              <span className="rp-mark is-end">{tl.duration.toFixed(1)} S</span>
            </div>
            <label className="rp-sync">
              <input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} disabled={!videoUrl} /> Sync to video
            </label>
          </div>
          {tl.tracks.length === 0 && <p className="rp-note">Nobody has a route yet. Draw lines from the players, then run the play.</p>}
        </div>

        <div className="rp-right">
          <div className="rp-video">
            {videoUrl ? (
              // A clip from the coach's own computer; it has no captions to offer.
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video ref={video} src={videoUrl} controls playsInline aria-label={`Clip: ${videoName}`} />
            ) : (
              <button type="button" className="rp-empty" onClick={() => fileRef.current?.click()}>
                <Icon name="upload" size={22} />
                <span>Attach a practice or game clip from this computer</span>
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="video/*" hidden onChange={(e) => (e.target.files?.[0] && attach(e.target.files[0]), (e.target.value = ""))} />
          <div className="rp-acts">
            <button type="button" className="btn btn-outline-dark" onClick={() => fileRef.current?.click()}>
              {videoUrl ? "Attach a different video" : "Attach video"}
            </button>
            {videoUrl && (
              <button
                type="button"
                className="btn btn-outline-dark"
                onClick={() => {
                  const s = video.current?.currentTime ?? 0;
                  onFilm({ ...scene.film, snapAt: Math.round(s * 10) / 10 });
                }}
              >
                Mark the snap here
              </button>
            )}
          </div>
          <p className="rp-note">
            {videoUrl
              ? snapAt
                ? `Snap marked at ${snapAt.toFixed(1)} s. Run the play and the clip plays in time with the drawing.`
                : "Play the clip to the snap, pause, and press Mark the snap here."
              : "Mark the snap once and the clip plays in time with the drawing. Running a play never changes the saved diagram — wristbands still print the static play."}
            {videoUrl && " Clips stay on this computer; attach it again next time."}
          </p>

          <label className="rp-link">
            <span>Hudl or YouTube link</span>
            <input
              className="input"
              type="url"
              placeholder="https://www.hudl.com/… or https://youtu.be/…"
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
              onBlur={saveLink}
            />
          </label>
          {linkError && (
            <p className="rp-error" role="alert">
              {linkError}
            </p>
          )}
          {scene.film?.link && !linkError && (
            <label className="rp-link">
              <span>The snap happens at (m:ss)</span>
              <input
                className="input"
                key={snapAt}
                inputMode="numeric"
                placeholder="1:23"
                defaultValue={snapAt ? clock(snapAt) : ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  const secs = v ? parseClock(v) : 0;
                  if (secs !== null) onFilm({ ...scene.film, snapAt: secs || undefined });
                }}
              />
            </label>
          )}
          {scene.film?.link && !linkError && (
            <a className="rp-open" href={linkAt(scene.film.link, snapAt)} target="_blank" rel="noopener noreferrer">
              Open the film{snapAt ? ` at the snap (${clock(snapAt)})` : ""} ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
