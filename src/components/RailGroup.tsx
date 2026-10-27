import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { RAIL_GROUPS, useToolPrefs, type RailId } from "../lib/toolPrefs";

/** The rail's tabs, in order. Modes and the Style card sit outside them, always in view. Plays is the playbook tree, shown as a folder icon. */
export const RAIL_TABS = [
  { id: "draw", label: "Draw" },
  { id: "routes", label: "Routes" },
  { id: "players", label: "Players" },
  { id: "sets", label: "Sets" },
  { id: "plays", label: "Plays" },
] as const;
export type RailTab = (typeof RAIL_TABS)[number]["id"];

const KEY = "grid1ronvault.railTab.v1";
let tab: RailTab = (() => {
  try {
    const saved = localStorage.getItem(KEY);
    return RAIL_TABS.some((t) => t.id === saved) ? (saved as RailTab) : "players";
  } catch {
    return "players";
  }
})();
const listeners = new Set<() => void>();

/** Which rail tab is showing, remembered in this browser. */
export const railStore = {
  get: () => tab,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  show(next: RailTab) {
    if (next === tab) return;
    tab = next;
    try {
      localStorage.setItem(KEY, tab);
    } catch {
      /* storage blocked — the choice still holds this session */
    }
    listeners.forEach((l) => l());
  },
  /** Brings a group into view (a coach tip or the Players button sending the coach to it). */
  open(id: RailId) {
    railStore.show(RAIL_GROUPS[id]);
  },
};

export const useRailTab = () => useSyncExternalStore(railStore.subscribe, railStore.get, railStore.get);

/** One titled section on a rail tab. Groups the coach hid in the Tools guide stay out until switched back on there. */
export function RailGroup({ id, title, children }: { id: RailId; title: string; children: ReactNode }) {
  const hidden = useToolPrefs().hiddenGroups.includes(id);
  if (hidden) return null;
  return (
    <section className="dz-group" aria-labelledby={`dz-${id}-title`}>
      <h3 id={`dz-${id}-title`}>{title}</h3>
      {children}
    </section>
  );
}
