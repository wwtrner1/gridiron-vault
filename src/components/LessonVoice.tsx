import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, coachError } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { TeachStep } from "../lib/teach";
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
 */
export function LessonVoice({ step, clip, onClip }: { step: TeachStep; clip?: VoiceClip; onClip: (clip: VoiceClip | undefined) => void }) {
  const { account } = useAuth();
  const type = recorderType();
  const [state, setState] = useState<"idle" | "asking" | "recording" | "saving">("idle");
  const [took, setTook] = useState(0);
  const [note, setNote] = useState("");
  const rec = useRef<{ recorder: MediaRecorder; stream: MediaStream; started: number; timer: number; keep: boolean } | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const live = useRef(true);
  const stepRef = useRef(step.id);

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
    setNote(`Removed your voice from ${step.title}.`);
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
          {clip && <span className="fr-voice-has">Recorded · {secs(clip.ms)}</span>}
          {clip && (
            <button type="button" className="btn btn-outline-dark btn-sm" onClick={hear} disabled={busy}>
              Hear it
            </button>
          )}
          <button type="button" className="btn btn-outline-dark btn-sm" onClick={record} disabled={busy}>
            {state === "asking" ? "Waiting for the microphone…" : state === "saving" ? "Saving…" : clip ? "Record again" : "Record this step"}
          </button>
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
