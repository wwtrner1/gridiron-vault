import { usePlayLesson } from "../lib/filmView";
import type { Scene } from "../lib/types";
import { LessonVideo } from "./LessonVideo";
// The video box is styled by the Film Room's sheet, which nothing else has loaded when it opens from the Play panel.
import "../styles/filmroom.css";

/**
 * "Make a video" outside the Film Room (the Designer's Play panel and Preview):
 * the play's lesson as it would open there, straight to the video box.
 */
export function PlayVideo({ scene, name, rushYards = 7, onClose }: { scene: Scene; name: string; rushYards?: number; onClose: () => void }) {
  const { lesson, who, dark, team } = usePlayLesson(scene, name, rushYards);
  return <LessonVideo scene={scene} lesson={lesson} name={name} who={who} dark={dark} team={team} onClose={onClose} />;
}
