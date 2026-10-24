import { toWorld } from "./geometry";
import type { PathNode, PlayerNode, Point, Scene } from "./types";

/**
 * Run play, from the Grid1ron Design canvas (Designer · run play with
 * video): every player runs his line from the snap, and the ball goes to
 * the first read at the throw. Running a play never changes the scene.
 */

/** Field pixels a player covers per second at 1× (about a 4.6-second 40). */
const SPEED = 170;
const BALL_FLIGHT = 0.55;

export type Track = { playerId: string; pts: Point[]; lengths: number[]; total: number; delay: number };
export type Timeline = { tracks: Track[]; duration: number; throwAt: number | null; qbId: string | null; targetId: string | null };

/** A line's points in field coordinates. */
const worldPoints = (path: PathNode): Point[] => path.points.map((p) => toWorld(path, p));

/** The player whose line this is: glued or assigned to him, else the one it starts on. */
function owner(path: PathNode, players: PlayerNode[]): PlayerNode | undefined {
  const id = path.assignOf ?? path.fromId;
  if (id) return players.find((p) => p.id === id);
  const start = toWorld(path, path.points[0] ?? { x: 0, y: 0 });
  return players.find((p) => Math.hypot(p.x - start.x, p.y - start.y) < 30);
}

export function buildTimeline(scene: Scene): Timeline {
  const players = scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && !n.hidden);
  const paths = scene.nodes.filter((n): n is PathNode => n.kind === "path" && !n.hidden && !n.closed && n.points.length > 1);
  const tracks: Track[] = [];
  let read: PlayerNode | undefined;
  for (const path of paths) {
    const p = owner(path, players);
    if (!p || tracks.some((t) => t.playerId === p.id)) continue;
    const pts = worldPoints(path);
    // Start exactly where the player stands, so nobody jumps at the snap.
    pts[0] = { x: p.x, y: p.y };
    const lengths = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y));
    const total = lengths.reduce((a, b) => a + b, 0);
    if (total < 4) continue;
    // Motion happens before the snap; everyone else goes on it.
    tracks.push({ playerId: p.id, pts, lengths, total, delay: 0 });
    if (path.firstRead) read = p;
  }
  const runFor = Math.max(2.5, ...tracks.map((t) => t.total / SPEED));
  const qb = players.find((p) => p.side === "offense" && p.label.toUpperCase() === "Q");
  const readTrack = read && tracks.find((t) => t.playerId === read!.id);
  // Throw when the first read is three-quarters through his route, or at about two-thirds of the play,
  // No earlier than 1.2 s: the quarterback needs his drop.
  const throwAt = qb && read ? Math.max(1.2, Math.min(runFor - BALL_FLIGHT, ((readTrack?.total ?? 0) / SPEED) * 0.75 || runFor * 0.68)) : null;
  return { tracks, duration: runFor + 0.4, throwAt, qbId: qb?.id ?? null, targetId: read?.id ?? null };
}

/** Where a track's player is at time t (seconds after the snap). */
export function trackAt(track: Track, t: number): Point {
  let d = Math.max(0, Math.min(track.total, (t - track.delay) * SPEED));
  for (let i = 0; i < track.lengths.length; i++) {
    const len = track.lengths[i];
    if (d <= len || i === track.lengths.length - 1) {
      const k = len ? Math.min(1, d / len) : 1;
      const a = track.pts[i];
      const b = track.pts[i + 1];
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    d -= len;
  }
  return track.pts[track.pts.length - 1];
}

/** Every player's spot at time t; players without a line stay put. */
export function positionsAt(scene: Scene, tl: Timeline, t: number): Map<string, Point> {
  const at = new Map<string, Point>();
  for (const track of tl.tracks) at.set(track.playerId, trackAt(track, t));
  for (const n of scene.nodes) if (n.kind === "player" && !at.has(n.id)) at.set(n.id, { x: n.x, y: n.y });
  return at;
}

/** The ball: in the quarterback's hands until the throw, then in flight to the first read. */
export function ballAt(tl: Timeline, at: Map<string, Point>, t: number): Point | null {
  if (!tl.qbId || tl.throwAt === null || !tl.targetId) return null;
  const qb = at.get(tl.qbId);
  if (!qb) return null;
  if (t <= tl.throwAt) return null;
  const k = Math.min(1, (t - tl.throwAt) / BALL_FLIGHT);
  const target = at.get(tl.targetId);
  if (!target) return null;
  const track = tl.tracks.find((x) => x.playerId === tl.qbId);
  const from = track ? trackAt(track, tl.throwAt) : qb;
  return { x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k - Math.sin(Math.PI * k) * 26 };
}

/** A Hudl or YouTube link opened at a given second. */
export function linkAt(link: string, seconds: number): string {
  try {
    const u = new URL(link);
    const s = Math.max(0, Math.floor(seconds));
    if (/youtube\.com|youtu\.be/.test(u.hostname)) u.searchParams.set("t", `${s}s`);
    return u.toString();
  } catch {
    return link;
  }
}

export const isFilmLink = (s: string) => /^https:\/\/([a-z0-9-]+\.)*(hudl\.com|youtube\.com|youtu\.be)\//i.test(s.trim());

/** "1:23", "83" or "83s" as seconds; null when it isn't a time. */
export function parseClock(text: string): number | null {
  const t = text.trim().replace(/s$/i, "");
  const m = /^(?:(\d{1,3}):)?(\d{1,2}(?:\.\d)?)$/.exec(t) ?? (/^(\d{1,5}(?:\.\d)?)$/.test(t) ? [t, undefined, t] : null);
  if (!m) return null;
  return (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2]);
}

/** Seconds as "m:ss". */
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
