import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  FILM_NOTE_LIMITS,
  FRAME_H,
  FRAME_W,
  MARK_COLORS,
  cleanNotes,
  filmEmbed,
  filmYoutubeId,
  markPath,
  noteCrossed,
  noteTime,
  notesText,
  readTime,
  thin,
  ytCommand,
  ytInfo,
  ytListening,
  type FilmNote,
  type Mark,
  type MarkKind,
} from "../lib/filmNotes";

/**
 * Film notes on a coach's own film: pin a note (and arrows, circles, a pen line) to a moment,
 * step through them, stop at each one while it plays, and copy them for the players. YouTube
 * plays here through the privacy-enhanced player, driven by messages (no YouTube script), so the
 * time is read off the film; Hudl film opens on Hudl and the coach types the times. Sport-neutral:
 * copy this file and `lib/filmNotes.ts` to another Vault as is.
 */

const YT_ORIGIN = "https://www.youtube-nocookie.com";
const TOOLS: { kind: MarkKind; label: string }[] = [
  { kind: "arrow", label: "Arrow" },
  { kind: "circle", label: "Circle" },
  { kind: "free", label: "Pen" },
];
const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type Draft = { id: string; at: number; atText: string; text: string; marks: Mark[]; isNew: boolean };

export function FilmNotes({
  link,
  title,
  start = 0,
  notes,
  onChange,
}: {
  link: string;
  title: string;
  start?: number;
  notes: FilmNote[];
  onChange: (notes: FilmNote[]) => void;
}) {
  const ytId = filmYoutubeId(link);
  const frame = useRef<HTMLIFrameElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const chan = useRef(newId());
  const timeRef = useRef(start);
  const [time, setTime] = useState(start);
  const [linked, setLinked] = useState(false);
  const linkedRef = useRef(false);
  const [stopAt, setStopAt] = useState(true);
  const [open, setOpen] = useState<FilmNote | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tool, setTool] = useState<MarkKind>("arrow");
  const [color, setColor] = useState<string>(MARK_COLORS[0].value);
  const [live, setLive] = useState<Mark | null>(null);
  const [status, setStatus] = useState("");
  const [gone, setGone] = useState<FilmNote | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const stopRef = useRef(stopAt);
  stopRef.current = stopAt;
  const busy = useRef(false);
  busy.current = !!draft;

  const send = (msg: string) => frame.current?.contentWindow?.postMessage(msg, YT_ORIGIN);
  const seek = (at: number) => {
    send(ytCommand(chan.current, "seekTo", [at, true]));
    send(ytCommand(chan.current, "pauseVideo"));
    timeRef.current = at;
    setTime(at);
  };

  // Listen to the player: its time and whether it's playing.
  useEffect(() => {
    if (!ytId) return;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== YT_ORIGIN || e.source !== frame.current?.contentWindow) return;
      const info = ytInfo(e.data);
      if (!info) return;
      linkedRef.current = true;
      setLinked(true);
      if (info.time === undefined) return;
      const prev = timeRef.current;
      timeRef.current = info.time;
      setTime(info.time);
      if (busy.current) return;
      setOpen((o) => (o && Math.abs(info.time! - o.at) > 1 ? null : o));
      if (stopRef.current) {
        const hit = noteCrossed(notesRef.current, prev, info.time);
        if (hit) {
          send(ytCommand(chan.current, "pauseVideo"));
          setOpen(hit);
          setStatus(`Stopped at ${noteTime(hit.at)}.`);
        }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [ytId]);

  // Say we're listening until the player answers (it ignores messages until it has loaded).
  const hello = () => {
    linkedRef.current = false;
    let tries = 0;
    const tick = () => {
      if (tries++ > 12 || !frame.current) return;
      send(ytListening(chan.current));
      window.setTimeout(() => {
        if (!linkedRef.current) tick();
      }, 500);
    };
    tick();
  };

  const startNote = () => {
    if (notes.length >= FILM_NOTE_LIMITS.notes) return setStatus(`That's the most notes one film can hold (${FILM_NOTE_LIMITS.notes}). Delete one first.`);
    if (ytId) send(ytCommand(chan.current, "pauseVideo"));
    const at = Math.floor(timeRef.current * 10) / 10;
    setOpen(null);
    setDraft({ id: newId(), at, atText: noteTime(at), text: "", marks: [], isNew: true });
  };
  const editNote = (n: FilmNote) => {
    if (ytId) seek(n.at);
    setOpen(null);
    setDraft({ id: n.id, at: n.at, atText: noteTime(n.at), text: n.text, marks: n.marks, isNew: false });
  };
  const saveDraft = () => {
    if (!draft) return;
    const at = readTime(draft.atText);
    if (at === null) return setStatus("Type the time like 1:05.");
    if (!draft.text.trim() && !draft.marks.length) return setStatus("Write a note or draw on the frame first.");
    const next = cleanNotes([...notes.filter((n) => n.id !== draft.id), { id: draft.id, at, text: draft.text, marks: draft.marks }]);
    onChange(next);
    setDraft(null);
    setOpen(next.find((n) => n.id === draft.id) ?? null);
    setStatus(draft.isNew ? `Note saved at ${noteTime(at)}.` : "Note updated.");
  };
  const remove = (n: FilmNote) => {
    onChange(notes.filter((x) => x.id !== n.id));
    if (open?.id === n.id) setOpen(null);
    setGone(n);
    setStatus(`Note at ${noteTime(n.at)} deleted.`);
  };
  const undoRemove = () => {
    if (!gone) return;
    onChange(cleanNotes([...notes, gone]));
    setStatus(`Note at ${noteTime(gone.at)} is back.`);
    setGone(null);
  };
  const view = (n: FilmNote) => {
    if (draft) return;
    setOpen(n);
    if (ytId) seek(n.at);
    setStatus(`${noteTime(n.at)}: ${n.text || "drawing"}`);
  };
  const playOn = () => {
    setOpen(null);
    send(ytCommand(chan.current, "playVideo"));
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(notesText(title, link, notes));
      setStatus("Notes copied. Paste them in a text or email to your players.");
    } catch {
      setStatus("This browser wouldn't copy. Select the notes and copy them yourself.");
    }
  };

  // Drawing on the paused frame.
  const at = (e: ReactPointerEvent): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * FRAME_W), Math.round(((e.clientY - r.top) / r.height) * FRAME_H)];
  };
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!draft || draft.marks.length >= FILM_NOTE_LIMITS.marks) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);
    setLive({ kind: tool, color, pts: [p, p] });
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!live) return;
    const p = at(e);
    setLive({ ...live, pts: live.kind === "free" ? [...live.pts, p] : [live.pts[0], p] });
  };
  const up = () => {
    if (!live || !draft) return setLive(null);
    const [a, b] = [live.pts[0], live.pts[live.pts.length - 1]];
    const far = Math.hypot(b[0] - a[0], b[1] - a[1]) > 12 || live.pts.length > 4;
    if (far) setDraft({ ...draft, marks: [...draft.marks, { ...live, pts: live.kind === "free" ? thin(live.pts) : [a, b] }] });
    setLive(null);
  };

  const shown = draft ? [...draft.marks, ...(live ? [live] : [])] : open?.marks ?? [];
  const sorted = [...notes].sort((a, b) => a.at - b.at);

  return (
    <div className="fn">
      {ytId ? (
        <div className="fn-stage">
          <iframe
            ref={frame}
            src={filmEmbed(ytId, start, window.location.origin)}
            title={`${title} film`}
            allow="encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            onLoad={hello}
          />
          {(draft || shown.length > 0) && (
            <svg
              ref={svg}
              className={`fn-draw${draft ? " is-drawing" : ""}`}
              viewBox={`0 0 ${FRAME_W} ${FRAME_H}`}
              role={draft ? "img" : undefined}
              aria-label={draft ? "Drawing area over the paused film. Drag to draw." : undefined}
              aria-hidden={draft ? undefined : true}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={() => setLive(null)}
            >
              {shown.map((m, i) => (
                <g key={i}>
                  <path d={markPath(m)} className="fn-casing" />
                  <path d={markPath(m)} stroke={m.color} className="fn-mark" />
                </g>
              ))}
            </svg>
          )}
        </div>
      ) : (
        <p className="fn-hudl">
          Hudl film opens on Hudl, so type the time from Hudl's player for each note.{" "}
          <a href={link} target="_blank" rel="noopener noreferrer">
            Open the film on Hudl ↗
          </a>
        </p>
      )}

      {draft ? (
        <div className="fn-edit" role="group" aria-label={draft.isNew ? "New note" : "Edit note"}>
          <div className="fn-row">
            <label className="fn-time">
              <span>Note time</span>
              <input value={draft.atText} inputMode="numeric" onChange={(e) => setDraft({ ...draft, atText: e.target.value })} aria-describedby="fn-time-hint" />
            </label>
            {ytId && linked && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDraft({ ...draft, atText: noteTime(timeRef.current) })}>
                Use the film's time ({noteTime(time)})
              </button>
            )}
            <span id="fn-time-hint" className="fn-hint">
              Like 1:05
            </span>
          </div>
          <label className="fn-text">
            <span>What to watch</span>
            <textarea
              rows={2}
              maxLength={FILM_NOTE_LIMITS.text}
              value={draft.text}
              placeholder="Watch the 2 cut off the screen"
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            />
          </label>
          {ytId && (
            <div className="fn-tools">
              <span className="fn-hint">Draw on the frame:</span>
              <div role="radiogroup" aria-label="Drawing tool" className="fn-chips">
                {TOOLS.map((t) => (
                  <button key={t.kind} type="button" role="radio" aria-checked={tool === t.kind} className={`fn-chip${tool === t.kind ? " is-on" : ""}`} onClick={() => setTool(t.kind)}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div role="radiogroup" aria-label="Pen color" className="fn-chips">
                {MARK_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={color === c.value}
                    aria-label={c.name}
                    className={`fn-swatch${color === c.value ? " is-on" : ""}`}
                    style={{ background: c.value }}
                    onClick={() => setColor(c.value)}
                  />
                ))}
              </div>
              <button type="button" className="btn btn-quiet btn-sm" disabled={!draft.marks.length} onClick={() => setDraft({ ...draft, marks: draft.marks.slice(0, -1) })}>
                Undo drawing
              </button>
              <button type="button" className="btn btn-quiet btn-sm" disabled={!draft.marks.length} onClick={() => setDraft({ ...draft, marks: [] })}>
                Clear drawing
              </button>
            </div>
          )}
          <div className="fn-row">
            <button type="button" className="btn btn-primary btn-sm" onClick={saveDraft}>
              Save note
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="fn-row fn-bar">
          <button type="button" className="btn btn-primary btn-sm" onClick={startNote}>
            + Add a note{ytId && linked ? ` at ${noteTime(time)}` : ""}
          </button>
          {ytId && (
            <label className="fn-check">
              <input type="checkbox" checked={stopAt} onChange={(e) => setStopAt(e.target.checked)} /> Stop at each note
            </label>
          )}
          {open && ytId && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={playOn}>
              ▶ Play on
            </button>
          )}
          {notes.length > 0 && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={copy}>
              Copy notes for players
            </button>
          )}
        </div>
      )}

      <p className="fn-status" role="status" aria-live="polite">
        {status}
        {gone && (
          <>
            {" "}
            <button type="button" className="fn-link" onClick={undoRemove}>
              Undo
            </button>
          </>
        )}
      </p>

      {sorted.length > 0 ? (
        <ol className="fn-list" aria-label="Film notes">
          {sorted.map((n) => (
            <li key={n.id} className={`fn-note${open?.id === n.id ? " is-open" : ""}`}>
              <button type="button" className="fn-at" onClick={() => view(n)} aria-label={`Go to ${noteTime(n.at)}`}>
                {noteTime(n.at)}
              </button>
              <span className="fn-words">
                {n.text || <em>Drawing only</em>}
                {n.marks.length > 0 && <span className="fn-tag">{n.marks.length === 1 ? "1 drawing" : `${n.marks.length} drawings`}</span>}
              </span>
              <span className="fn-acts">
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => editNote(n)} disabled={!!draft} aria-label={`Edit the note at ${noteTime(n.at)}`}>
                  Edit
                </button>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => remove(n)} disabled={!!draft} aria-label={`Delete the note at ${noteTime(n.at)}`}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        !draft && <p className="fn-empty">No notes yet. Pause on a moment and add one, like "0:42, watch the 2 cut."</p>
      )}
    </div>
  );
}
