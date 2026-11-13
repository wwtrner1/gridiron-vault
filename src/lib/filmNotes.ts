/**
 * Film notes: a coach's notes and drawings pinned to moments in their own film ("0:42, watch the 2
 * cut", with an arrow on the frame). The film stays on YouTube or Hudl; only the times, words and
 * marks are kept, so it costs nothing to host (Wes, 2026-11-12: build #1, notes on linked film, in
 * every Vault). Sport-neutral and pure (no imports): copy this file to another Vault as is.
 *
 * Marks are drawn in a 1000 x 563 box (16:9, the YouTube frame), so they sit on the same spot of
 * the picture at any player size.
 */

export const FRAME_W = 1000;
export const FRAME_H = 563;

export type MarkKind = "arrow" | "circle" | "free";
export type Mark = { kind: MarkKind; color: string; pts: [number, number][] };
export type FilmNote = { id: string; at: number; text: string; marks: Mark[] };

export const FILM_NOTE_LIMITS = { notes: 30, text: 280, marks: 8, points: 40, seconds: 6 * 3600 };

/** The pens: bright enough to read on grass, wood or dirt. Saved into notes, so keep the values. */
export const MARK_COLORS = [
  { name: "Yellow", value: "#ffd60a" },
  { name: "Red", value: "#ff3b30" },
  { name: "Blue", value: "#2ec5ff" },
  { name: "White", value: "#ffffff" },
] as const;

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const HEX = /^#[0-9a-f]{6}$/i;

/** Seconds as "m:ss", or "h:mm:ss" past an hour. */
export function noteTime(s: number): string {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** "1:23", "1:02:03", "83" or "83s" as whole seconds; null when it isn't a time. */
export function readTime(text: string): number | null {
  const t = text.trim().replace(/s$/i, "");
  if (!t) return null;
  if (/^\d{1,5}$/.test(t)) return Number(t);
  const m = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/.exec(t);
  if (!m || Number(m[3]) > 59 || (m[1] && Number(m[2]) > 59)) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** The YouTube video id in a link; null for Hudl or anything else. */
export function filmYoutubeId(link: string): string | null {
  try {
    const u = new URL(link.trim());
    if (u.protocol !== "https:") return null;
    if (u.hostname === "youtu.be") return /^[\w-]{6,20}$/.test(u.pathname.slice(1)) ? u.pathname.slice(1) : null;
    if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null;
    const id = u.searchParams.get("v") ?? /^\/(?:embed|shorts|live)\/([\w-]{6,20})/.exec(u.pathname)?.[1] ?? null;
    return id && /^[\w-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** The film link opened at a moment: YouTube gets ?t=, Hudl opens as pasted (it has no time in its links). */
export function filmAt(link: string, at: number): string {
  if (!filmYoutubeId(link)) return link;
  try {
    const u = new URL(link.trim());
    u.searchParams.delete("start");
    u.searchParams.set("t", `${Math.floor(at)}s`);
    return u.toString();
  } catch {
    return link;
  }
}

/**
 * The privacy-enhanced player with its JavaScript API on, so the page can read the time and
 * seek by message (no YouTube script is loaded, so the CSP stays `script-src 'self'`).
 */
export function filmEmbed(id: string, start: number, origin: string): string {
  const o = /^https?:\/\/[\w.-]+(:\d+)?$/.test(origin) ? `&origin=${encodeURIComponent(origin)}` : "";
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&enablejsapi=1&start=${Math.floor(Math.max(0, start))}${o}`;
}

/** Notes in film order. */
export const sortNotes = (notes: FilmNote[]) => [...notes].sort((a, b) => a.at - b.at);

/** The first note the film reaches between two moments (prev, now]; how "Stop at each note" knows when to pause. */
export function noteCrossed(notes: FilmNote[], prev: number, now: number): FilmNote | null {
  if (!(now > prev) || now - prev > 2) return null; // a seek, not playback
  return sortNotes(notes).find((n) => n.at > prev && n.at <= now) ?? null;
}

/** Thin a freehand line to at most `max` points, keeping its ends. */
export function thin(pts: [number, number][], max = FILM_NOTE_LIMITS.points): [number, number][] {
  if (pts.length <= max) return pts;
  const step = (pts.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => pts[Math.round(i * step)]);
}

const point = (v: unknown): [number, number] | null => {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [x, y] = v.map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [Math.round(Math.min(FRAME_W, Math.max(0, x))), Math.round(Math.min(FRAME_H, Math.max(0, y)))];
};

/** One mark as drawn or stored; null when it can't be drawn. */
export function cleanMark(raw: unknown): Mark | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = r.kind === "arrow" || r.kind === "circle" || r.kind === "free" ? r.kind : null;
  if (!kind) return null;
  const pts = (Array.isArray(r.pts) ? r.pts : []).map(point).filter((p): p is [number, number] => !!p);
  if (pts.length < 2) return null;
  const color = typeof r.color === "string" && HEX.test(r.color) ? r.color.toLowerCase() : MARK_COLORS[0].value;
  return { kind, color, pts: kind === "free" ? thin(pts) : [pts[0], pts[pts.length - 1]] };
}

/** One note as typed or stored; null when it has nothing in it or no id. */
export function cleanNote(raw: unknown): FilmNote | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (typeof r.id !== "string" || !ID.test(r.id)) return null;
  const at = typeof r.at === "number" && Number.isFinite(r.at) ? Math.min(FILM_NOTE_LIMITS.seconds, Math.max(0, Math.round(r.at * 10) / 10)) : 0;
  const text = typeof r.text === "string" ? r.text.trim().slice(0, FILM_NOTE_LIMITS.text) : "";
  const marks = (Array.isArray(r.marks) ? r.marks : []).map(cleanMark).filter((m): m is Mark => !!m).slice(0, FILM_NOTE_LIMITS.marks);
  if (!text && !marks.length) return null;
  return { id: r.id, at, text, marks };
}

/** A clip's or play's notes as stored or sent: cleaned, one per id, in film order, held to the limit. */
export function cleanNotes(raw: unknown): FilmNote[] {
  const seen = new Set<string>();
  const out: FilmNote[] = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    const n = cleanNote(x);
    if (!n || seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
    if (out.length >= FILM_NOTE_LIMITS.notes) break;
  }
  return sortNotes(out);
}

/** Plain text to send players: a heading, the film, then one line per note with a link to its moment on YouTube. */
export function notesText(title: string, link: string, notes: FilmNote[]): string {
  const yt = !!filmYoutubeId(link);
  const lines = sortNotes(notes).map((n) => {
    const words = n.text || (n.marks.length ? "See the drawing" : "");
    return `${noteTime(n.at)}  ${words}${yt ? `\n${filmAt(link, n.at)}` : ""}`;
  });
  return [`Film notes: ${title.trim() || "Film"}`, yt ? "" : link, "", ...lines].filter((l, i) => i !== 1 || l).join("\n").trim() + "\n";
}

/** The SVG path for a mark in the frame box: arrows get a head, circles fit the box they were dragged across. */
export function markPath(m: Mark): string {
  const [a, b] = [m.pts[0], m.pts[m.pts.length - 1]];
  if (m.kind === "circle") {
    const cx = (a[0] + b[0]) / 2;
    const cy = (a[1] + b[1]) / 2;
    const rx = Math.max(6, Math.abs(b[0] - a[0]) / 2);
    const ry = Math.max(6, Math.abs(b[1] - a[1]) / 2);
    return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
  }
  const line = (m.kind === "free" ? m.pts : [a, b]).map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join("");
  if (m.kind !== "arrow") return line;
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const head = 26;
  const p1 = [b[0] - head * Math.cos(ang - 0.45), b[1] - head * Math.sin(ang - 0.45)];
  const p2 = [b[0] - head * Math.cos(ang + 0.45), b[1] - head * Math.sin(ang + 0.45)];
  const r = (n: number) => Math.round(n);
  return `${line}M${r(p1[0])} ${r(p1[1])}L${b[0]} ${b[1]}L${r(p2[0])} ${r(p2[1])}`;
}

/* ---------------------------------------------------------- the YouTube bridge --- */

/**
 * The messages the YouTube player understands without loading its script (the IFrame API's
 * own wire format): say we're listening, then send commands. Kept here so the component stays thin.
 */
export const ytListening = (id: string) => JSON.stringify({ event: "listening", id, channel: "widget" });
export const ytCommand = (id: string, func: "seekTo" | "pauseVideo" | "playVideo", args: unknown[] = []) =>
  JSON.stringify({ event: "command", func, args, id, channel: "widget" });

/** The time and play state in a message from the player; null for anything else. 1 = playing, 2 = paused. */
export function ytInfo(data: unknown): { time?: number; state?: number } | null {
  let d: unknown = data;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d);
    } catch {
      return null;
    }
  }
  const o = (d && typeof d === "object" ? d : {}) as { event?: unknown; info?: unknown };
  if (o.event !== "infoDelivery" && o.event !== "initialDelivery" && o.event !== "onStateChange") return null;
  if (o.event === "onStateChange") return typeof o.info === "number" ? { state: o.info } : null;
  const info = (o.info && typeof o.info === "object" ? o.info : {}) as { currentTime?: unknown; playerState?: unknown };
  const out: { time?: number; state?: number } = {};
  if (typeof info.currentTime === "number" && Number.isFinite(info.currentTime)) out.time = info.currentTime;
  if (typeof info.playerState === "number") out.state = info.playerState;
  return out.time === undefined && out.state === undefined ? null : out;
}
