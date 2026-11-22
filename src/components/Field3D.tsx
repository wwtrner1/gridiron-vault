import { useMemo } from "react";
import { FIELD_CAMERAS, cameraOn } from "../lib/film3d";
import { usePlayLesson } from "../lib/filmView";
import type { FilmCameraState } from "../lib/filmView";
import type { Scene } from "../lib/types";
import { LessonField3D } from "./LessonField3D";
import "../styles/filmroom.css";

/**
 * The Designer's field in 3D: a look at the play as drawn (routes on the
 * grass, the defense it is taught against), not a place to draw. It follows
 * every change to the play; Flat brings the drawing back. The chip here only
 * picks the camera, so it always stands at the offense's end.
 */
export function Field3D({ scene, name, rushYards = 7, cam, onFail }: { scene: Scene; name: string; rushYards?: number; cam: FilmCameraState; onFail: () => void }) {
  // Built without the play's name (it only words the captions), so typing a name doesn't rebuild the 3D field.
  const { lesson, look, who, dark, logo, colors } = usePlayLesson(scene, "", rushYards);
  // The call: everyone lined up at the snap with the routes drawn bold.
  const step = useMemo(() => lesson.steps.find((s) => s.id === "call") ?? lesson.steps[0], [lesson]);
  return (
    <div className="dz-3d-field">
      <LessonField3D
        scene={scene}
        lesson={lesson}
        step={step}
        t={0}
        who={who}
        dark={dark}
        logo={logo}
        team={colors}
        camera={cameraOn(FIELD_CAMERAS, cam.pick.camera)}
        follow={cam.follow}
        onPick={cam.tap}
        label={`${name.trim() || "Untitled play"} in 3D against ${look.name}, lined up at the snap.`}
        onFail={onFail}
      />
    </div>
  );
}
