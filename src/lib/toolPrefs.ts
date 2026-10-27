import { useSyncExternalStore } from "react";
import type { ModeId, ToolId } from "./tools";

/**
 * Which designer tools a coach keeps on show. Hidden groups and tools leave
 * the tool rail (and the phone sheet) but are never gone: the Tools guide
 * lists everything and brings any of it back. Remembered per browser.
 */
export type ToolKey = ToolId | ModeId;

/** The Designer's left-rail groups and the tab each lives on. */
export const RAIL_GROUPS = { modes: "draw", lines: "draw", shapes: "draw", routes: "routes", players: "players", sets: "sets", format: "sets", plays: "plays" } as const;
export type RailId = keyof typeof RAIL_GROUPS;
export type ToolPrefs = { hiddenGroups: RailId[]; hiddenTools: ToolKey[] };

/** What a group is for, in the guide's table of contents. */
export const GROUP_GUIDE: { id: RailId; title: string; text: string }[] = [
  { id: "modes", title: "Modes", text: "How a press on the field behaves: select, add to a selection, copy, grab inside a group, rotate or scale." },
  { id: "lines", title: "Lines", text: "Draw routes, blocks and motion by hand: straight, curved, dashed, freehand, or joined between two players." },
  { id: "routes", title: "Route library", text: "Ready-made routes. Pick a player, then tap a route and it's drawn from that player." },
  { id: "format", title: "Saved play format", text: "Save how this play looks (colors, line weights) and give the same look to other plays." },
  { id: "shapes", title: "Shapes · Zones", text: "Zones, boxes, circles and text labels for coverage areas and notes." },
  { id: "players", title: "Offense · Defense", text: "Single players to drop on the field." },
  { id: "sets", title: "Libraries · Layers", text: "Whole formations and defenses in one tap, and the list of everything on the field." },
  { id: "plays", title: "Your playbooks", text: "Every playbook as a folder with its plays inside. Open another play, start one in a playbook, or drag a play onto a folder." },
];

/** A simpler set for coaches who want the basics: draw, add players, formations. */
export const ESSENTIALS: ToolPrefs = {
  hiddenGroups: ["format", "shapes"],
  hiddenTools: ["arc", "block", "pen", "connect", "pivot", "multiSelect", "duplicate", "clickThrough", "rotate", "scale"],
};
export const EVERYTHING: ToolPrefs = { hiddenGroups: [], hiddenTools: [] };

const KEY = "grid1ronvault.toolPrefs.v1";
let prefs: ToolPrefs = (() => {
  try {
    const saved: ToolPrefs = { ...EVERYTHING, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
    // Groups that have since left the rail (Ink · Weight became the Style card) drop out of the list.
    return { ...saved, hiddenGroups: saved.hiddenGroups.filter((g) => g in RAIL_GROUPS) };
  } catch {
    return EVERYTHING;
  }
})();
const listeners = new Set<() => void>();

function commit(next: ToolPrefs) {
  prefs = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage blocked — the choice still holds this session */
  }
  listeners.forEach((l) => l());
}

export const toolPrefs = {
  get: () => prefs,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  set: commit,
  toggleGroup(id: RailId) {
    const hidden = prefs.hiddenGroups.includes(id);
    commit({ ...prefs, hiddenGroups: hidden ? prefs.hiddenGroups.filter((g) => g !== id) : [...prefs.hiddenGroups, id] });
  },
  toggleTool(id: ToolKey) {
    const hidden = prefs.hiddenTools.includes(id);
    commit({ ...prefs, hiddenTools: hidden ? prefs.hiddenTools.filter((t) => t !== id) : [...prefs.hiddenTools, id] });
  },
};

export function useToolPrefs() {
  return useSyncExternalStore(toolPrefs.subscribe, toolPrefs.get, toolPrefs.get);
}

/** Which named set the current choice matches, if any. */
export function presetName(p: ToolPrefs): "essentials" | "everything" | "custom" {
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  if (same(p.hiddenGroups, ESSENTIALS.hiddenGroups) && same(p.hiddenTools, ESSENTIALS.hiddenTools)) return "essentials";
  if (!p.hiddenGroups.length && !p.hiddenTools.length) return "everything";
  return "custom";
}
