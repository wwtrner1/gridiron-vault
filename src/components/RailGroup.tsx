import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { useToolPrefs } from "../lib/toolPrefs";

/** The Designer's left-rail groups and whether each starts open. */
export const RAIL_DEFAULTS = { modes: false, lines: true, routes: true, format: false, ink: false, shapes: false, players: true, sets: false };
export type RailId = keyof typeof RAIL_DEFAULTS;

const KEY = "grid1ronvault.rail.v1";
let state: Record<RailId, boolean> = (() => {
  try {
    return { ...RAIL_DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return RAIL_DEFAULTS;
  }
})();
const listeners = new Set<() => void>();

/** Which rail groups this coach keeps open, remembered in this browser. */
export const railStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  toggle(id: RailId) {
    state = { ...state, [id]: !state[id] };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage blocked — the choice still holds this session */
    }
    listeners.forEach((l) => l());
  },
  /** Opens a group (a coach tip or the Players button sending the coach to it). */
  open(id: RailId) {
    if (!state[id]) railStore.toggle(id);
  },
};

/**
 * One collapsible group in the Designer's tool rail. The heading is the
 * toggle; `summary` shows the current choice while the group is closed.
 */
export function RailGroup({ id, title, summary, children }: { id: RailId; title: string; summary?: ReactNode; children: ReactNode }) {
  const open = useSyncExternalStore(railStore.subscribe, railStore.get, railStore.get)[id];
  // Groups the coach hid in the Tools guide stay out of the rail until switched back on there.
  const hidden = useToolPrefs().hiddenGroups.includes(id);
  if (hidden) return null;
  return (
    <section className={`dz-group${open ? " is-open" : ""}`}>
      <h2>
        <button
          type="button"
          className="dz-group-toggle"
          aria-expanded={open}
          aria-controls={`dz-${id}-body`}
          onClick={() => railStore.toggle(id)}
        >
          <span>{title}</span>
          {!open && summary && <span className="dz-group-summary">{summary}</span>}
          <Icon name="chevron" size={14} />
        </button>
      </h2>
      <div className="dz-group-body" id={`dz-${id}-body`} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
