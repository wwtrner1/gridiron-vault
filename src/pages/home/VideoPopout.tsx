import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { useDialogFocus } from "../../lib/dialogFocus";
import { CLIPS, clock, toolOfClip, type Watch } from "./tools";

/**
 * The video pop-out: a clip with sound, and beside it the steps as a clickable list (the transcript, too). Back a step and
 * Next step jump the video; the list follows the video as it plays. Escape closes it and focus goes back to the button that opened it.
 */
export function VideoPopout({ watch, onClose }: { watch: Watch; onClose: () => void }) {
  const clip = CLIPS[watch.clip];
  const tool = toolOfClip(watch.clip);
  const panel = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const titleId = useId();
  const first = Math.min(Math.max(watch.step ?? 0, 0), clip.steps.length - 1);
  const [step, setStep] = useState(first);
  // Browsers sometimes refuse to start a video with sound; the clip then plays silent with a button for the narrator.
  const [silent, setSilent] = useState(false);
  useDialogFocus(panel, onClose, video);

  // The page behind stays put while the pop-out is open.
  useEffect(() => {
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = was;
    };
  }, []);

  // Start playing as it opens (the press that opened it counts as the visitor asking for it).
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.play().catch((e: unknown) => {
      if (!(e instanceof DOMException) || e.name !== "NotAllowedError") return; // a browser that can't play the clip at all just shows its controls
      el.muted = true;
      setSilent(true);
      el.play().catch(() => undefined);
    });
  }, []);

  // The step in the list keeps in view.
  useEffect(() => {
    list.current?.children[step]?.scrollIntoView?.({ block: "nearest" });
  }, [step]);

  const jump = (i: number) => {
    const el = video.current;
    const to = Math.min(Math.max(i, 0), clip.steps.length - 1);
    setStep(to);
    if (!el) return;
    el.currentTime = clip.steps[to].at;
    el.play().catch(() => undefined);
  };
  const follow = () => {
    const el = video.current;
    if (!el) return;
    let now = 0;
    clip.steps.forEach((s, i) => {
      if (el.currentTime >= s.at - 0.15) now = i;
    });
    setStep(now);
  };
  const soundOn = () => {
    const el = video.current;
    if (!el) return;
    el.muted = false;
    el.play().catch(() => undefined);
    setSilent(false);
  };

  return (
    <div className="vp-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} className="vp" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="vp-head">
          <div>
            <p className="home-eyebrow">{tool?.group ?? "Video"}</p>
            <h2 id={titleId}>{clip.title}</h2>
          </div>
          <button type="button" className="vp-x" onClick={onClose} aria-label={`Close ${clip.title}`}>
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="vp-body">
          <div className="vp-media">
            <video
              ref={video}
              src={`${clip.src}#t=${clip.steps[first].at}`}
              poster={clip.poster}
              width={1280}
              height={720}
              controls
              playsInline
              preload="auto"
              tabIndex={0}
              aria-label={`Video: ${clip.title}, ${clock(clip.seconds)}, with a narrator and captions on screen. The steps are listed beside it.`}
              onTimeUpdate={follow}
              onSeeked={follow}
              onVolumeChange={(e) => e.currentTarget.muted || setSilent(false)}
            />
            {silent && (
              <button type="button" className="vp-sound" onClick={soundOn}>
                Turn the sound on
              </button>
            )}
          </div>
          <div className="vp-side">
            <ol className="vp-steps" ref={list} aria-label="Steps. Press one to jump to it.">
              {clip.steps.map((s, i) => (
                <li key={i}>
                  <button type="button" className={i === step ? "is-on" : undefined} aria-current={i === step ? "step" : undefined} onClick={() => jump(i)}>
                    <i aria-hidden="true">{i + 1}</i>
                    <span>
                      <b>{s.title}</b>
                      <small>{s.text}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="vp-nav">
              <button type="button" className="btn btn-ghost btn-sm" disabled={step === 0} onClick={() => jump(step - 1)}>
                Back a step
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={step === clip.steps.length - 1} onClick={() => jump(step + 1)}>
                Next step
              </button>
              {tool && (
                <Link to={tool.to} className="btn btn-primary btn-sm" onClick={onClose}>
                  {tool.cta}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
