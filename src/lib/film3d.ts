/*
 * The Film Room's 3D view, the parts the page needs before three.js loads:
 * the camera choices, the coach's saved pick and whether this browser can draw
 * WebGL at all. No three.js in here.
 */

/**
 * Where the camera sits. `auto` follows the lesson step by step and `modular`
 * changes with the moment of the play; the rest are one camera each.
 */
export const FILM_CAMERAS = ["auto", "behind", "wide", "all22", "qb", "zoom", "eyes", "sideline", "coach", "overhead", "modular", "free"] as const;
export type FilmCamera = (typeof FILM_CAMERAS)[number];
export const FILM_CAMERA_NAME: Record<FilmCamera, string> = {
  auto: "Follow the lesson",
  behind: "Behind the offense",
  wide: "Wide",
  all22: "All 22 (high end zone)",
  qb: "QB cam",
  zoom: "Follow a player",
  eyes: "Player's eyes (helmet cam)",
  sideline: "Sideline (broadcast)",
  coach: "Coach cam (press box)",
  overhead: "Overhead",
  modular: "A camera for each moment",
  free: "Free look",
};

/** A camera that is one spot (everything but the two that pick for themselves). */
export type FixedCamera = Exclude<FilmCamera, "auto" | "modular">;

/** Which end the end-zone and sideline cameras stand at. */
export const CAMERA_SIDES = ["offense", "defense"] as const;
export type CameraSide = (typeof CAMERA_SIDES)[number];

/** The coach's camera: which one, from which end, and whether it goes with the ball once it is thrown. */
export type CameraPick = { camera: FilmCamera; side: CameraSide; pass: boolean };
export const DEFAULT_CAMERA: CameraPick = { camera: "auto", side: "offense", pass: true };

/** A saved camera pick, checked; undefined when there is nothing worth keeping. */
export function cleanCameraPick(raw: unknown): CameraPick | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Partial<CameraPick>;
  if (!(FILM_CAMERAS as readonly unknown[]).includes(r.camera)) return undefined;
  return { camera: r.camera as FilmCamera, side: r.side === "defense" ? "defense" : "offense", pass: r.pass !== false };
}

/** Cameras that ride with one player, so the page offers a player to pick. */
export const followsPlayer = (c: FilmCamera) => c === "zoom" || c === "eyes";
/** Cameras the coach turns by dragging (or with the buttons on the field). */
export const turnsByHand = (c: FilmCamera) => c === "eyes" || c === "free";
/** Cameras that stand at one end or one sideline, so the end can be picked. */
export const hasSide = (c: FilmCamera) => c !== "qb" && c !== "zoom" && c !== "eyes" && c !== "auto";
/** Cameras that can swing to the ball once it is in the air. */
export const tracksBall = (c: FilmCamera) => c === "qb" || c === "zoom" || c === "modular";

/** The Designer's 3D field stands still at the snap, so the two cameras that change as a lesson or a play goes are left out. */
export const FIELD_CAMERAS: readonly FilmCamera[] = FILM_CAMERAS.filter((c) => c !== "auto" && c !== "modular");
/** Preview runs one step, which gives "Follow the lesson" nothing to follow. */
export const PREVIEW_CAMERAS: readonly FilmCamera[] = FILM_CAMERAS.filter((c) => c !== "auto");

/** The camera a screen shows for a pick: Behind the offense when the pick is one it doesn't offer. */
export function cameraOn(cameras: readonly FilmCamera[], pick: FilmCamera): FilmCamera {
  return cameras.includes(pick) ? pick : (cameras.find((c) => c === "behind") ?? cameras[0]);
}

let gl: boolean | undefined;
/** True when this browser can draw WebGL (asked once a visit). */
export function canDraw3d(): boolean {
  if (gl !== undefined) return gl;
  try {
    const c = document.createElement("canvas");
    gl = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    gl = false;
  }
  return gl;
}
