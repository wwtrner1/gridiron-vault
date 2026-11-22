import type { CameraSide, FilmCamera, FixedCamera } from "./film3d";

/*
 * Where each Film Room camera stands and what it looks at. Pure numbers (no
 * three.js), so the framing can be checked without a browser. The field is in
 * yards: the ball is at x 0, z 0, +z is downfield, and the offense lines up
 * behind the line at negative z. The 3D field draws +x on the left of the
 * screen from behind the offense, the way the flat field reads.
 */

export type V3 = [number, number, number];
/** One camera set-up: where it is, the point it looks at, its vertical angle in degrees, and which way is up. */
export type Shot = { pos: V3; look: V3; fov: number; up?: V3 };
export type Box = { x0: number; x1: number; z0: number; z1: number };

/** The moments of one play that a camera can change on. */
export type Moment = "pre" | "drop" | "air" | "post";
export function momentOf(t: number, throwAt: number, flight: number, thrown: boolean): Moment {
  if (t <= 0.001) return "pre";
  if (!thrown || t < throwAt) return "drop";
  return t < throwAt + flight ? "air" : "post";
}

/** The Film Room's steps, by id (kept as plain strings so this file needs nothing from the lesson). */
type Step = "look" | "zones" | "call" | "snap" | "read" | "job";

const BY_STEP: Record<Step, FixedCamera> = { look: "wide", zones: "all22", call: "behind", snap: "behind", read: "qb", job: "zoom" };
const BY_MOMENT: Record<Moment, FixedCamera> = { pre: "wide", drop: "behind", air: "zoom", post: "sideline" };

/**
 * The one camera a pick comes to right now. `auto` goes by the lesson's step,
 * `modular` by the moment of the play; `tag` is what the page reports
 * (`auto:look`, `modular:air`, or the camera's own id).
 */
export function resolveCamera(kind: FilmCamera, step: Step, moment: Moment): { shot: FixedCamera; tag: string } {
  if (kind === "auto") return { shot: BY_STEP[step] ?? "behind", tag: `auto:${step}` };
  if (kind === "modular") return { shot: BY_MOMENT[moment], tag: `modular:${moment}` };
  return { shot: kind, tag: kind };
}

/** A player the camera rides with: where he is, the way he is headed (a unit vector), and what he is watching. */
export type Followed = { x: number; z: number; hx: number; hz: number; offense: boolean; eyes?: { x: number; z: number } };

export type Rig = {
  /** Width over height of the picture. */
  aspect: number;
  side: CameraSide;
  /** Every player from the snap to the whistle. */
  play: Box;
  /** Every player lined up at the snap. */
  snap: Box;
  /** Half the field's width, sideline to the middle. */
  halfField: number;
  qb: { x: number; z: number } | null;
  follow: Followed | null;
  /** The ball once it is thrown (in the air, then with the receiver). */
  ball: { x: number; y: number; z: number } | null;
  /** Go with the ball once it is thrown. */
  pass: boolean;
  /** Free look: turn, tilt (radians) and distance in yards. */
  orbit: { az: number; el: number; r: number };
  /** Helmet cam: how far the coach has turned the head, in radians. */
  eye: { yaw: number; pitch: number };
  /** How tall the players are drawn (1 is life size). */
  tall: number;
};

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const ORBIT_START = { az: 0.6, el: 0.5, r: 46 };
export const ORBIT_LIMITS = { el: [0.08, 1.45] as const, r: [8, 110] as const };
export const EYE_LIMITS = { yaw: [-2.4, 2.4] as const, pitch: [-0.5, 0.4] as const };

/** The camera for one fixed view of this play, fitted to the picture's shape (a tall phone pulls it back). */
export function shotFor(kind: FixedCamera, r: Rig): Shot {
  const off = r.side === "offense";
  const s = off ? 1 : -1;
  const cx = (r.snap.x0 + r.snap.x1) / 2;
  const acrossSnap = Math.max(cx - r.snap.x0, r.snap.x1 - cx) + 1.5;
  const acrossPlay = Math.max(cx - r.play.x0, r.play.x1 - cx) + 2.5;
  const midZ = (r.play.z0 + r.play.z1) / 2;
  const deep = (r.play.z1 - r.play.z0) / 2 + 3;
  const tanH = (fov: number) => Math.tan(rad(fov / 2)) * r.aspect;

  /** From behind one end: `d` yards back from the ball and `h` up, looking `ahead` yards past the line. */
  const endZone = (fov: number, d: number, h: number, ahead: number): Shot => {
    // The near row has to stay in the picture: the deepest back for the offense's end, the deepest man downfield for the defense's.
    const near = off ? Math.max(0, -r.play.z0 - 6) : Math.max(0, r.play.z1 - 9);
    const z = off ? -(d + near) : d + 6 + near;
    return { pos: [cx, h, z], look: [cx, 1, off ? ahead : 6 - ahead], fov };
  };

  /**
   * From one sideline, `D` yards out from the middle and `h` up, level with `z`.
   * The angle is sized on the players nearest the camera, who fill the most of
   * the picture: wide enough for the play's length there, tall enough for their feet.
   */
  const fromSide = (D: number, h: number, z: number, lookY: number, pad: number, least: number): Shot => {
    const camX = -s * D;
    const nearD = Math.max(8, Math.min(Math.abs(camX - r.play.x0), Math.abs(camX - r.play.x1)));
    const farD = Math.max(Math.abs(camX - r.play.x0), Math.abs(camX - r.play.x1));
    const reach = Math.max(r.play.z1 - z, z - r.play.z0) + pad;
    const across = deg(2 * Math.atan(reach / nearD / r.aspect));
    const tilt = Math.atan2(h - lookY, Math.abs(camX - cx));
    const feet = deg(2 * (Math.atan2(h, nearD) - tilt)) + 6;
    const heads = deg(2 * (tilt - Math.atan2(h - 2.2 * r.tall, farD))) + 6;
    return { pos: [camX, h, z], look: [cx, lookY, z], fov: clamp(Math.max(across, feet, heads), least, 75) };
  };

  switch (kind) {
    case "behind": {
      const fov = 50;
      const d = Math.max(14, acrossSnap / (tanH(fov) * 0.96));
      return endZone(fov, d, 2.5 + d * 0.34, 4 + d * 0.2);
    }
    case "wide": {
      const fov = 60;
      const d = Math.max(22, acrossPlay / (tanH(fov) * 0.88));
      return endZone(fov, d, d * 0.56, 2 + d * 0.16);
    }
    case "all22": {
      const fov = 44;
      const d = Math.max(34, acrossPlay / (tanH(fov) * 0.8));
      return endZone(fov, d, d * 0.84, Math.max(11, midZ + 4));
    }
    case "qb": {
      if (!r.qb) return shotFor("behind", r);
      // The skycam: hung behind and above the quarterback, riding with him, the whole box in the picture.
      const fov = 50;
      const back = Math.max(9, (acrossSnap * 0.72) / tanH(fov) - Math.max(0, -r.qb.z));
      const h = 6.5 + back * 0.28;
      const pos: V3 = [r.qb.x * 0.85 + cx * 0.15, h, r.qb.z - back];
      let look: V3 = [r.qb.x * 0.5 + cx * 0.5, 1, r.qb.z + 15];
      // Once the ball is out the camera swings to it and holds on the catch.
      if (r.pass && r.ball) look = [r.ball.x * 0.85, Math.max(1, r.ball.y * 0.5), Math.max(r.qb.z + 9, r.ball.z + 2)];
      return { pos, look, fov };
    }
    case "zoom": {
      const f = r.follow;
      if (!f) return shotFor("behind", r);
      const fwd = f.offense ? 1 : -1;
      // The ball has to be out in front of the camera before it swings to it; a throw still leaving the quarterback's hand is behind it.
      if (r.pass && r.ball && f.offense && r.ball.z > f.z - 5) return { pos: [f.x * 0.9, 4.2 * r.tall, f.z - 7.5], look: [r.ball.x, Math.max(1.2, r.ball.y * 0.7), r.ball.z], fov: 50 };
      return { pos: [f.x * 0.94, 3.5 * r.tall, f.z - fwd * 7], look: [f.x, 1.4 * r.tall, f.z + fwd * 14], fov: 54 };
    }
    case "eyes": {
      const f = r.follow;
      if (!f) return shotFor("behind", r);
      let lx = f.x + f.hx * 20;
      let lz = f.z + f.hz * 20;
      if (f.eyes && Math.hypot(f.eyes.x - f.x, f.eyes.z - f.z) > 1.5) {
        lx = f.eyes.x;
        lz = f.eyes.z;
      }
      // +x is on the left of the screen, so turning the head to the right takes the angle down.
      const a = Math.atan2(lx - f.x, lz - f.z) - r.eye.yaw;
      const d = Math.max(8, Math.hypot(lx - f.x, lz - f.z));
      const y = 1.9 * r.tall;
      return { pos: [f.x + Math.sin(a) * 0.16, y, f.z + Math.cos(a) * 0.16], look: [f.x + Math.sin(a) * d, y * 0.82 - d * Math.sin(r.eye.pitch), f.z + Math.cos(a) * d], fov: 84 };
    }
    case "sideline": {
      // The broadcast camera: on the sideline, sliding a little with the ball.
      const on = r.ball?.z ?? r.qb?.z ?? midZ;
      const z = midZ + (on - midZ) * 0.35;
      return fromSide(r.halfField + 34, off ? 20 : 16, z, 1, 3, 20);
    }
    case "coach": {
      // The press box: higher and wider than the broadcast camera, and it never moves.
      return fromSide(r.halfField + 36, off ? 32 : 26, midZ, 0, 8, 28);
    }
    case "overhead": {
      const fov = 46;
      const h = Math.max(acrossPlay / tanH(fov), deep / Math.tan(rad(fov / 2))) * 1.1;
      return { pos: [cx, Math.max(24, h), midZ], look: [cx, 0, midZ], fov, up: [0, 0, s] };
    }
    case "free":
    default: {
      const { az, el, r: dist } = r.orbit;
      const a = off ? az : az + Math.PI;
      return { pos: [cx + dist * Math.cos(el) * Math.sin(a), Math.max(1.2, dist * Math.sin(el)), midZ - dist * Math.cos(el) * Math.cos(a)], look: [cx, 0, midZ], fov: 45 };
    }
  }
}

/**
 * Where a point on the field lands in the picture: x and y from -1 to 1 (the
 * edges of the screen), or null when it is behind the camera. Used to check
 * that a camera keeps the players in the frame.
 */
export function inPicture(shot: Shot, aspect: number, p: V3): { x: number; y: number } | null {
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const unit = (a: V3): V3 => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const fwd = unit(sub(shot.look, shot.pos));
  const right = unit(cross(fwd, shot.up ?? [0, 1, 0]));
  const up = cross(right, fwd);
  const d = sub(p, shot.pos);
  const depth = dot(d, fwd);
  if (depth <= 0.01) return null;
  const tv = Math.tan(rad(shot.fov / 2));
  return { x: dot(d, right) / (depth * tv * aspect), y: dot(d, up) / (depth * tv) };
}
