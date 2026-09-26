import type { PlayerNode, Scene } from "./types";

/** Player notes, with the Player notes panel's defaults applied. */
export const noteShowsOnHover = (p: PlayerNode) => !!p.note?.trim() && p.noteHover !== false;
const notePrints = (p: PlayerNode) => !!p.note?.trim() && p.notePrint !== false;
const noteOnWristband = (p: PlayerNode) => !!p.note?.trim() && p.noteWristband === true;

/** "H — Read the flat defender…" lines for a print or wristband export. */
export function playerNoteLines(scene: Scene, where: "print" | "wristband"): string[] {
  const keep = where === "print" ? notePrints : noteOnWristband;
  return scene.nodes
    .filter((n): n is PlayerNode => n.kind === "player" && !n.hidden)
    .filter(keep)
    .sort((a, b) => a.x - b.x)
    .map((p) => `${p.label || p.name || "Player"} — ${p.note!.trim()}`);
}
