/**
 * How a player moves on screen. The Coverage check works a play out frame by
 * frame at one speed with square corners, which is right for grading it and
 * reads as stiff when it is played back: everyone is at full speed on the
 * first frame, a cut is an instant turn, and a defender chasing a moving man
 * twitches. `smoothTrack` turns those frames into the way a player really
 * covers ground (he builds speed off the snap, leans through a break and
 * gathers himself to stop) without moving where he is at any moment by more
 * than about a yard, and `pointAt` reads a spot between two frames, so
 * the picture moves at the screen's own rate instead of the model's.
 *
 * Pure, and only for drawing: grades, rings and reads still come from the
 * model's own frames.
 */
import type { Point } from "./types";

/** How long a change of speed or direction is spread over, in seconds each side. */
export const MOTION = { spread: 0.1 } as const;

/** A track of one spot per frame, eased. The first frame stays put, so players start from their stance. */
export function smoothTrack(pts: Point[], fps: number): Point[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const sigma = MOTION.spread * fps;
  const r = Math.max(1, Math.ceil(sigma * 2.5));
  const w: number[] = [];
  for (let j = -r; j <= r; j++) w.push(Math.exp(-(j * j) / (2 * sigma * sigma)));
  const sum = w.reduce((a, b) => a + b, 0);
  // Before the snap he is standing still; after the last frame he carries on as he was going.
  const last = pts[n - 1];
  const vx = last.x - pts[n - 2].x;
  const vy = last.y - pts[n - 2].y;
  const at = (i: number): Point => (i < 0 ? pts[0] : i < n ? pts[i] : { x: last.x + vx * (i - n + 1), y: last.y + vy * (i - n + 1) });
  const eased = (i: number): Point => {
    let x = 0;
    let y = 0;
    for (let j = -r; j <= r; j++) {
      const p = at(i + j);
      x += p.x * w[j + r];
      y += p.y * w[j + r];
    }
    return { x: x / sum, y: y / sum };
  };
  // Easing both ways in time has him creeping forward before the snap, so the eased track starts
  // a few frames early (where he is all but still in his stance). Read it from there at the snap and catch
  // up over the first steps: he leaves from a standstill and is on the model's time soon after.
  const lead = Math.ceil(sigma * 1.25);
  const early = Array.from({ length: n + lead }, (_, i) => eased(i - lead));
  const over = Math.min(n - 1, lead * 4);
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const u = Math.min(1, i / over);
    const f = Math.max(0, i + lead - lead * (1 - u) * (1 - u));
    const k = Math.min(n + lead - 2, Math.floor(f));
    const a = early[k];
    const b = early[k + 1];
    out.push({ x: a.x + (b.x - a.x) * (f - k), y: a.y + (b.y - a.y) * (f - k) });
  }
  // Nobody leaves his spot before the snap, however little.
  out[0] = { ...pts[0] };
  return out;
}

/** Where a track is at a time between frames. */
export function pointAt(pts: Point[], t: number, fps: number): Point | undefined {
  if (!pts.length) return undefined;
  const f = Math.max(0, Math.min(pts.length - 1, t * fps));
  const i = Math.floor(f);
  const a = pts[i];
  const b = pts[Math.min(pts.length - 1, i + 1)];
  const u = f - i;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}
