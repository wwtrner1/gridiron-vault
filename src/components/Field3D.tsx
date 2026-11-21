import { useMemo } from "react";
import type { FilmCamera } from "../lib/film3d";
import { usePlayLesson } from "../lib/filmView";
import type { Scene } from "../lib/types";
import { LessonField3D } from "./LessonField3D";
import "../styles/filmroom.css";

/**
 * The Designer's field in 3D: a look at the play as drawn (routes on the
 * grass, the defense it is taught against), not a place to draw. It follows
 * every change to the play; Flat brings the drawing back.
 */
export function Field3D({ scene, name, rushYards = 7, camera, onFail }: { scene: Scene; name: string; rushYards?: number; camera: FilmCamera; onFail: () => void }) {
  const { lesson, look, who, dark, logo, colors } = usePlayLesson(scene, name, rushYards);
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
        camera={camera === "auto" ? "behind" : camera}
        label={`${name.trim() || "Untitled play"} in 3D against ${look.name}, lined up at the snap.`}
        onFail={onFail}
      />
    </div>
  );
}
