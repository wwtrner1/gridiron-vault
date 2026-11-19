import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, coachError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { plainCaption } from "../lib/teach";
import type { StepId, TeachStep } from "../lib/teach";
import { VOICE_LIMITS, voiceUrl } from "../lib/voice";
import type { VoiceClip } from "../lib/voice";

/** What this browser's recorder can make that the account keeps. */
function recorderType(): string | null {
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) if (MediaRecorder.isTypeSupported(t)) return t;
  return null;
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/**
 * The coach's own voice on one step of a Film Room lesson: Record, Stop and
 * keep, Hear it, Record again, Remove. The clip goes to the account
 * (`/api/voice`) and the play names it (`scene.teach.voice`), so it follows
 * the play to every device and onto the team link. Nothing is recorded until
 * the coach presses Record, and the microphone is let go the moment it stops.
 *
 * A coach who would rather not record can have the Film Room voice read the
 * step (or every step that has no voice yet): a stock voice made in this
 * browser by `lib/readAloud`, kept on the account the same way.
 */
export function LessonVoice({
  step,
  steps,
  clip,
  onClip,
  onClips,
}: {
  step: TeachStep;
  steps: TeachStep[];
  clip?: VoiceClip;
  onClip: (clip: VoiceClip | undefined) => void;
  onClips: (clips: Partial<Record<StepId, VoiceClip>>) => void;
}) {
  const { account } = useAuth();
  const type = recorderType();
  const [state, setState] = useState<"idle" | "asking" | "recording" | "saving" | "reading">("idle");
  const [took, setTook] = useState(0);
  const [note, setNote] = useState("");
  const rec = useRef<{ recorder: MediaRecorder; stream: MediaStream; started: number; timer: number; keep: boolean } | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const live = useRef(true);
  const stepRef = useRef(step.id);
  /** A read keeps going when the coach looks at another step. */
  const reading = useRef(false);

  const letGo = (keep: boolean) => {
    const r = rec.current;
    if (!r) return;
    r.keep = keep;
    clearInterval(r.timer);
    if (r.recorder.state !== "inactive") r.recorder.stop();
    r.stream.getTracks().forEach((t) => t.stop());
  };

  // Moving to another step, or closing the Film Room, throws an unfinished recording away.
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      letGo(false);
      audio.current?.pause();
    };
  }, []);
  useEffect(() => {
    if (stepRef.current === step.id) return;
    stepRef.current = step.id;
    letGo(false);
    audio.current?.pause();
    if (reading.current) return;
    setState("idle");
    setNote("");
  }, [step.id]);

  const record = async () => {
    if (!type) return;
    setNote("");
    setState("asking");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setState("idle");
      setNote("The microphone is blocked. Allow it for this site in the browser's site settings, then press Record again.");
      return;
    }
    if (!live.current) return stream.getTracks().forEach((t) => t.stop());
    const forStep = step.id;
    const before = clip;
    const recorder = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 64_000 });
    const parts: Blob[] = [];
    const started = performance.now();
    recorder.ondataavailable = (e) => e.data.size && parts.push(e.data);
    recorder.onstop = async () => {
      const mine = rec.current;
      rec.current = null;
      const ms = Math.round(performance.now() - started);
      if (!mine?.keep || !live.current || stepRef.current !== forStep) return;
      if (ms < VOICE_LIMITS.minMs) {
        setState("idle");
        setNote("That was too short to hear. Press Record, say the step, then Stop and keep.");
        return;
      }
      setState("saving");
      try {
        const saved = await api.saveVoice(new Blob(parts, { type: type.split(";")[0] }), Math.min(ms, VOICE_LIMITS.ms));
        if (!live.current) return;
        onClip(saved);
        setNote(`Kept. Your voice plays on ${step.title} (${secs(saved.ms)}). Save the play to keep it.`);
        // The clip it replaces is no longer named by the play.
        if (before) api.deleteVoice(before.id).catch(() => undefined);
      } catch (e) {
        if (live.current) setNote(coachError(e, "That recording didn't save. Try again in a minute."));
      } finally {
        if (live.current) setState("idle");
      }
    };
    setTook(0);
    const timer = window.setInterval(() => {
      const ms = performance.now() - started;
      setTook(ms);
      if (ms >= VOICE_LIMITS.ms) letGo(true);
    }, 100);
    rec.current = { recorder, stream, started, timer, keep: false };
    recorder.start();
    setState("recording");
  };

  /** The Film Room voice reads this step, or every step with no voice yet, and the clips are kept like recordings. */
  const readFor = async (which: TeachStep[]) => {
    setState("reading");
    const first = performance.now();
    const kept: Partial<Record<StepId, VoiceClip>> = {};
    try {
      const { readAloud } = await import("../lib/readAloud");
      reading.current = true;
      for (const [i, s] of which.entries()) {
        const of = which.length > 1 ? ` (step ${i + 1} of ${which.length})` : "";
        const made = await readAloud(plainCaption(s.caption), (stage, pct) => {
          if (!live.current) return;
          // Every tenth, so a screen reader isn't told each percent.
          const tenth = pct === undefined ? "" : ` ${Math.floor(pct / 10) * 10}% here.`;
          setNote(
            stage === "loading"
              ? `Getting the Film Room voice ready. The first time is a big download (about 325 MB, a few minutes on home Wi-Fi), then this browser keeps it.${tenth}`
              : `Reading ${s.title}${of}…`,
          );
        });
        if (!live.current) return;
        if (made.ms > VOICE_LIMITS.ms || made.clip.size > VOICE_LIMITS.size) throw new Error("long");
        const saved = await api.saveVoice(made.clip, made.ms);
        if (!live.current) return void api.deleteVoice(saved.id).catch(() => undefined);
        kept[s.id] = { ...saved, by: "reader" };
        if (s.voice) api.deleteVoice(s.voice.id).catch(() => undefined);
      }
      const took = Math.round((performance.now() - first) / 1000);
      setNote(which.length > 1 ? `Read ${which.length} steps in ${took} s. Press Play to hear the lesson, then save the play to keep it.` : `Read. The Film Room voice plays on ${which[0].title}. Save the play to keep it.`);
    } catch (e) {
      if (live.current)
        setNote(
          e instanceof Error && e.message === "long"
            ? "That step is too long to read in one clip. Record it in your own voice instead."
            : e instanceof Error && e.name === "ReaderError"
              ? e.message
              : coachError(e, "The Film Room voice didn't finish. Try again in a minute."),
        );
    } finally {
      reading.current = false;
      if (Object.keys(kept).length && live.current) onClips(kept);
      if (live.current) setState("idle");
    }
  };
  const unvoiced = steps.filter((s) => !s.voice);

  const hear = () => {
    if (!clip) return;
    const a = (audio.current ??= new Audio());
    a.src = voiceUrl(clip.id);
    a.currentTime = 0;
    a.play().catch(() => setNote("That recording didn't play. Record it again."));
  };

  const remove = () => {
    if (!clip) return;
    audio.current?.pause();
    onClip(undefined);
    api.deleteVoice(clip.id).catch(() => undefined);
    setNote(`Removed ${clip.by === "reader" ? "the Film Room voice" : "your voice"} from ${step.title}.`);
  };

  const busy = state !== "idle";
  return (
    <div className="fr-voice" role="group" aria-label={`Your voice on ${step.title}`}>
      <span className="fr-voice-k">Your voice · {step.title}</span>
      {!account ? (
        <Link className="fr-link" to="/signin">
          Sign in to record your voice on this lesson
        </Link>
      ) : !type ? (
        <span className="fr-voice-note">This browser can't record. Open the play in Chrome, Edge or Safari to add your voice.</span>
      ) : state === "recording" ? (
        <>
          <span className="fr-voice-live" aria-live="off">
            <i aria-hidden="true" /> Recording {secs(took)} of {VOICE_LIMITS.ms / 1000} s
          </span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => letGo(true)}>
            Stop and keep
          </button>
          <button
            type="button"
            className="btn btn-outline-dark btn-sm"
            onClick={() => {
              letGo(false);
              setState("idle");
            }}
          >
            Throw it away
          </button>
        </>
      ) : (
        <>
          {clip && (
            <span className="fr-voice-has">
              {clip.by === "reader" ? "Film Room voice" : "Recorded"} · {secs(clip.ms)}
            </span>
          )}
          {clip && (
            <button type="button" className="btn btn-outline-dark btn-sm" onClick={hear} disabled={busy}>
              Hear it
            </button>
          )}
          <button type="button" className="btn btn-outline-dark btn-sm" onClick={record} disabled={busy}>
            {state === "asking" ? "Waiting for the microphone…" : state === "saving" ? "Saving…" : clip ? "Record again" : "Record this step"}
          </button>
          <button type="button" className="btn btn-outline-dark btn-sm" onClick={() => readFor([step])} disabled={busy}>
            {state === "reading" ? "Reading…" : "Read it for me"}
          </button>
          {unvoiced.length > 1 && (
            <button type="button" className="btn btn-outline-dark btn-sm" onClick={() => readFor(unvoiced)} disabled={busy}>
              Read the {unvoiced.length} steps with no voice
            </button>
          )}
          {clip && (
            <button type="button" className="btn btn-outline-dark btn-sm" onClick={remove} disabled={busy}>
              Remove
            </button>
          )}
        </>
      )}
      <span className="fr-voice-note" role="status">
        {note}
      </span>
    </div>
  );
}
