import { CAMERA_SIDES, FILM_CAMERA_NAME, cameraOn, followsPlayer, hasSide, tracksBall } from "../lib/film3d";
import type { CameraSide, FilmCamera } from "../lib/film3d";
import type { FilmCameraState } from "../lib/filmView";

const SIDE_NAME: Record<CameraSide, string> = { offense: "The offense's end", defense: "The defense's end" };

/**
 * The 3D camera's controls, the same in the Film Room, Preview and on the
 * Designer's field: which camera, and only what that camera can use (the
 * player it rides with, the end it stands at, whether it goes with the ball).
 */
export function CameraControls({
  cam,
  cameras,
  players,
  className,
  tip,
}: {
  cam: FilmCameraState;
  /** The cameras this screen offers, in order. */
  cameras: readonly FilmCamera[];
  players: { id: string; name: string }[];
  /** The class each labelled control wears, so it sits in its host's bar. */
  className: string;
  /** Marks the Camera select for the Film Room's tips. */
  tip?: string;
}) {
  const camera = cameraOn(cameras, cam.pick.camera);
  return (
    <>
      <label className={className} data-fr-tip={tip}>
        <span>Camera</span>
        <select value={camera} onChange={(e) => cam.set({ camera: e.target.value as FilmCamera })}>
          {cameras.map((c) => (
            <option key={c} value={c}>
              {FILM_CAMERA_NAME[c]}
            </option>
          ))}
        </select>
      </label>
      {followsPlayer(camera) && (
        <label className={className}>
          <span>Player</span>
          <select value={players.some((p) => p.id === cam.follow) ? cam.follow : ""} onChange={(e) => cam.setFollow(e.target.value || undefined)}>
            <option value="">{camera === "eyes" ? "Quarterback" : "First read"}</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {hasSide(camera) && (
        <label className={className}>
          <span>From</span>
          <select value={cam.pick.side} onChange={(e) => cam.set({ side: e.target.value as CameraSide })}>
            {CAMERA_SIDES.map((s) => (
              <option key={s} value={s}>
                {SIDE_NAME[s]}
              </option>
            ))}
          </select>
        </label>
      )}
      {tracksBall(camera) && (
        <label className={`${className} cam-check`}>
          <input type="checkbox" checked={cam.pick.pass} onChange={(e) => cam.set({ pass: e.target.checked })} />
          <span>Follow the ball</span>
        </label>
      )}
    </>
  );
}
