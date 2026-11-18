import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { gateVideo } from "../lib/plan";
import type { Lesson } from "../lib/teach";
import { useTier } from "../lib/tier";
import { track } from "../lib/track";
import type { Scene } from "../lib/types";
import type { VideoJob, VideoShape } from "../lib/lessonVideo";
import { Modal } from "./Modal";

const SHAPES: { id: VideoShape; name: string; hint: string }[] = [
  { id: "wide", name: "Wide (16:9)", hint: "For the meeting room, a TV or a laptop." },
  { id: "tall", name: "Tall (9:16)", hint: "For phones, team chats and social." },
];

/**
 * "Make a video" in the Film Room: the lesson on screen as an MP4, made in the
 * coach's own browser. The encoder loads only when the coach presses the button.
 */
export function LessonVideo({
  scene,
  lesson,
  name,
  who,
  dark,
  team,
  onClose,
}: {
  scene: Scene;
  lesson: Lesson;
  name: string;
  who: string;
  dark: boolean;
  team?: VideoJob["team"];
  onClose: () => void;
}) {
  const gate = gateVideo(useTier());
  const [shape, setShape] = useState<VideoShape>("wide");
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const stop = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      stop.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const make = async () => {
    setNote(null);
    setFile(null);
    setBusy(0);
    const ctl = new AbortController();
    stop.current = ctl;
    let voice: "in" | "left-out" | null = null;
    try {
      const { lessonVideo, videoFileName } = await import("../lib/lessonVideo");
      const blob = await lessonVideo({ scene, lesson, name, who, dark, shape, team, signal: ctl.signal, onProgress: (p) => setBusy(p), onVoice: (v) => (voice = v) });
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const fileName = videoFileName(name, shape);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setFile({ url, name: fileName });
      setNote({
        ok: true,
        text: `Saved ${fileName} to your downloads${(voice as string | null) === "in" ? ", with your voice" : ""}.${
          (voice as string | null) === "left-out" ? " Your voice couldn't go into the file in this browser; make it in Chrome or Edge on a computer to hear it." : ""
        }`,
      });
      track("play_exported", { kind: "video" });
    } catch (e) {
      // Only our own wording reaches the coach; a library's error text never does.
      const ours = e instanceof Error && (e as { coach?: boolean }).coach === true;
      setNote({ ok: false, text: ours ? (e as Error).message : "The video didn't finish. Try again, or make it on a computer." });
    } finally {
      setBusy(null);
      stop.current = null;
    }
  };

  return (
    <Modal title="Make a video of this lesson" onClose={onClose}>
      {!gate.ok ? (
        <div className="fr-video">
          <p>{gate.reason}</p>
          <Link className="btn btn-primary" to="/pricing">
            {gate.cta}
          </Link>
        </div>
      ) : (
        <div className="fr-video">
          <p>
            The whole lesson against {lesson.look.name}, with the captions on it, as an MP4 file. It is made in this browser and saved to your downloads. Nothing is uploaded.
          </p>
          <fieldset className="fr-shapes" disabled={busy !== null}>
            <legend>Shape</legend>
            {SHAPES.map((s) => (
              <label key={s.id}>
                <input type="radio" name="fr-shape" checked={shape === s.id} onChange={() => setShape(s.id)} />
                <span>
                  <b>{s.name}</b>
                  {s.hint}
                </span>
              </label>
            ))}
          </fieldset>
          {busy !== null ? (
            <div className="fr-making">
              <progress value={busy} max={1} aria-label="Making the video" />
              <span role="status">Making the video… {Math.round(busy * 100)}%</span>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => stop.current?.abort()}>
                Stop
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-primary" onClick={make}>
              {file ? "Make it again" : "Make the video"}
            </button>
          )}
          {note && (
            <p className={note.ok ? "fr-video-ok" : "fr-video-bad"} role={note.ok ? "status" : "alert"}>
              {note.text}{" "}
              {note.ok && file && (
                <a href={file.url} download={file.name}>
                  Download it again
                </a>
              )}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
