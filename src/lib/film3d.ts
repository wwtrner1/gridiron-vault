/*
 * The Film Room's 3D view, the parts the page needs before three.js loads:
 * the camera choices and whether this browser can draw WebGL at all.
 */

/** Where the camera sits: `auto` follows the lesson, the rest hold one spot. */
export const FILM_CAMERAS = ["auto", "behind", "sideline", "overhead"] as const;
export type FilmCamera = (typeof FILM_CAMERAS)[number];
export const FILM_CAMERA_NAME: Record<FilmCamera, string> = {
  auto: "Follow the lesson",
  behind: "Behind the offense",
  sideline: "Sideline",
  overhead: "Overhead",
};

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
