import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { RAIL_GROUPS, useToolPrefs, type RailId } from "../lib/toolPrefs";

/** The rail's sections, in order (Wes, 2026-11-21: one Tools panel, every section starts closed and opening one closes the others). Plays is the playbook tree. */
export const RAIL_TABS = [
  { id: "draw", label: "Draw" },
  { id: "routes", label: "Routes" },
  { id: "players", label: "Players" },
  { id: "sets", label: "Sets" },
  { id: "plays", label: "Playbooks" },
  { id: "style", label: "Style" },
] as const;
export type RailTab = (typeof RAIL_TABS)[number]["id"];

/** The open section, for this visit only: every section starts closed. */
let tab: RailTab | null = null;
const listeners = new Set<() => void>();
const set = (next: RailTab | null) => {
  if (next === tab) return;
  tab = next;
  listeners.forEach((l) => l());
};

/** Which rail section is open (one at a time). */
export const railStore = {
  get: () => tab,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Opens one section and closes the rest. */
  show(next: RailTab) {
    set(next);
  },
  /** A press on a section's heading: open it, or close it when it is already open. */
  toggle(next: RailTab) {
    set(tab === next ? null : next);
  },
  close() {
    set(null);
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
      <h4 id={`dz-${id}-title`}>{title}</h4>
      {children}
    </section>
  );
}
