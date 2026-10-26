import { baseNode } from "./types";
import type { PlayerNode, Scene } from "./types";

export type TokenPreset = {
  code: string;
  label: string;
  title: string;
  hint: string;
  shape: PlayerNode["shape"];
  fill: string;
  stroke: string;
  textColor: string;
  side: PlayerNode["side"];
};

/**
 * Default position colors, used everywhere a player appears. Codes are
 * internal ids for formations; labels are the letters coaches see.
 * Q black · C cyan · X blue · Y red · Z green · H orange · S light purple.
 */
export const OFFENSE_TOKENS: TokenPreset[] = [
  { code: "QB", label: "Q", title: "Quarterback", hint: "Drop this on the snap point. Every pass route in the play starts from here.", shape: "circle", fill: "#111111", stroke: "#111111", textColor: "#FFFFFF", side: "offense" },
  { code: "C", label: "C", title: "Center", hint: "Snapper. In 5-on-5 the centre is usually eligible once the ball is away.", shape: "square", fill: "#16C8E8", stroke: "#16C8E8", textColor: "#04212A", side: "offense" },
  { code: "X", label: "X", title: "Receiver X", hint: "Backside split end. Drop this on the left edge for Twins and Trips looks.", shape: "circle", fill: "#1E4FD8", stroke: "#1E4FD8", textColor: "#FFFFFF", side: "offense" },
  { code: "Y", label: "Y", title: "Receiver Y", hint: "Slot or tight receiver. Usually the inside man in Bunch and Stack sets.", shape: "circle", fill: "#D24B3E", stroke: "#D24B3E", textColor: "#FFFFFF", side: "offense" },
  { code: "Z", label: "Z", title: "Receiver Z", hint: "Flanker, off the line. Motion this player to build jet and orbit looks.", shape: "circle", fill: "#1D7A50", stroke: "#1D7A50", textColor: "#FFFFFF", side: "offense" },
  { code: "RB", label: "H", title: "Running back (H)", hint: "Backfield runner. Pair it with a handoff line to draw dives and reverses.", shape: "circle", fill: "#F28C28", stroke: "#F28C28", textColor: "#0B1524", side: "offense" },
  { code: "H", label: "S", title: "Second back / wing (S)", hint: "Second back or wing. Good for crossbuck and double-back sets.", shape: "circle", fill: "#C9B8F5", stroke: "#C9B8F5", textColor: "#0B1524", side: "offense" },
  { code: "BALL", label: "", title: "Ball spot", hint: "Marks where the ball is spotted. Line the scrimmage line up with it.", shape: "ball", fill: "#7A5230", stroke: "#41290F", textColor: "#FFFFFF", side: "ball" },
];

export const DEFENSE_TOKENS: TokenPreset[] = [
  { code: "CB", label: "C", title: "Cornerback", hint: "Outside cover man. Draw a dashed line to show his man-coverage assignment.", shape: "triangle", fill: "#2E7DBE", stroke: "#164A76", textColor: "#FFFFFF", side: "defense" },
  { code: "LB", label: "L", title: "Linebacker", hint: "Underneath defender. Pair with the Coverage zone tool to shade a hook or flat.", shape: "triangle", fill: "#2E7DBE", stroke: "#164A76", textColor: "#FFFFFF", side: "defense" },
  { code: "FS", label: "F", title: "Free safety", hint: "Deep middle. Place him high to show a Cover 1 or Cover 3 shell.", shape: "triangle", fill: "#2E9E6B", stroke: "#1B6845", textColor: "#FFFFFF", side: "defense" },
  { code: "SS", label: "S", title: "Strong safety", hint: "Rolls to the strength of the formation. Useful for Cover 2 halves.", shape: "triangle", fill: "#2E9E6B", stroke: "#1B6845", textColor: "#FFFFFF", side: "defense" },
  { code: "R", label: "R", title: "Rusher", hint: "Blitzer off the edge. Add a solid arrow into the backfield to show the path.", shape: "cross", fill: "none", stroke: "#D24B3E", textColor: "#D24B3E", side: "defense" },
  { code: "X2", label: "X", title: "Generic defender", hint: "Unlabelled defender — rename it in the Properties panel on the right.", shape: "cross", fill: "none", stroke: "#0B1524", textColor: "#0B1524", side: "defense" },
];

export function makePlayer(preset: TokenPreset, x: number, y: number): PlayerNode {
  return {
    ...baseNode({ x, y, name: preset.title }),
    kind: "player",
    shape: preset.shape,
    label: preset.label,
    size: 36,
    fill: preset.fill,
    stroke: preset.stroke,
    textColor: preset.textColor,
    side: preset.side,
  };
}

export function emptyScene(losY = 420): Scene {
  return { version: 2, view: "half", width: 1040, height: 660, losY, pivot: null, nodes: [] };
}
