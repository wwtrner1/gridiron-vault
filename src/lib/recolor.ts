import { OFFENSE_TOKENS } from "./presets";
import type { PlayerNode, Scene } from "./types";

/**
 * Brings plays saved before the new default position colors up to date.
 * Only players still wearing an old default are changed — a color a coach
 * picked on purpose is left alone.
 */

const lc = (s: string) => s.toLowerCase();
const token = (code: string) => OFFENSE_TOKENS.find((t) => t.code === code)!;

type Match = { label: string; fill: string; shape?: PlayerNode["shape"]; to: string };

/** The original defaults (before Sep 25), mapped to today's token. */
const OLD_DEFAULTS: Match[] = [
  { label: "Q", fill: "#0b1524", to: "QB" },
  { label: "C", fill: "#f2a63b", to: "C" },
  { label: "X", fill: "#ffffff", to: "X" },
  { label: "Y", fill: "#ffffff", to: "Y" },
  { label: "Z", fill: "#ffffff", to: "Z" },
  // The old running back was a cyan "R"; it is now the orange "H".
  { label: "R", fill: "#16c8e8", to: "RB" },
  // The old H-back was a white diamond; it is now the light purple "S".
  { label: "H", fill: "#ffffff", shape: "diamond", to: "H" },
];

/** The first new colors had a darker outline; the canvas uses the fill. */
const DARK_OUTLINES = new Set(["#0b7d94", "#143a9e", "#9e3428", "#13553a", "#b45f12", "#7a6bd2"]);
const NEW_FILLS = new Set(OFFENSE_TOKENS.map((t) => lc(t.fill)));

function update(p: PlayerNode): PlayerNode | null {
  if (p.side !== "offense") return null;
  const old = OLD_DEFAULTS.find(
    (m) => m.label === p.label && m.fill === lc(p.fill) && (!m.shape || m.shape === p.shape),
  );
  if (old) {
    const t = token(old.to);
    return { ...p, label: t.label, shape: t.shape, fill: t.fill, stroke: t.stroke, textColor: t.textColor };
  }
  if (NEW_FILLS.has(lc(p.fill)) && DARK_OUTLINES.has(lc(p.stroke))) return { ...p, stroke: p.fill };
  return null;
}

/** How many players in this scene would change. */
export function staleCount(scene: Scene): number {
  return scene.nodes.filter((n) => n.kind === "player" && update(n)).length;
}

export function recolorScene(scene: Scene): Scene {
  let changed = false;
  const nodes = scene.nodes.map((n) => {
    if (n.kind !== "player") return n;
    const u = update(n);
    if (!u) return n;
    changed = true;
    return u;
  });
  return changed ? { ...scene, nodes } : scene;
}
