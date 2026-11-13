import { useCallback, useState } from "react";
import { CUSTOM_LIMITS, customName } from "./teamHub";

/**
 * How a coach likes one team's roster laid out, in this browser: which
 * columns show (and so print and download) and the fields they added that
 * nobody has filled in yet. Like the Call Sheet's view, it's a view, not
 * data: values typed into an added field are saved with the player.
 */
export type RosterView = {
  /** Default columns the coach hid. */
  hide: string[];
  /** Columns that start hidden which the coach turned on. */
  show: string[];
  /** Fields the coach added, in the order they were added. */
  fields: string[];
};

const KEY = "grid1ronvault.rosterview.v1";
const MAX_IDS = 60;

export const emptyView = (): RosterView => ({ hide: [], show: [], fields: [] });

const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length <= 80).slice(0, MAX_IDS) : []);

export function cleanView(raw: unknown): RosterView {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fields = [...new Set(ids(r.fields).map(customName).filter(Boolean))].slice(0, CUSTOM_LIMITS.fields);
  return { hide: ids(r.hide), show: ids(r.show), fields };
}

function readAll(): Record<string, RosterView> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    return raw && typeof raw === "object" ? raw as Record<string, RosterView> : {};
  } catch {
    return {};
  }
}

export function loadView(team: string): RosterView {
  return cleanView(readAll()[team]);
}

function saveView(team: string, view: RosterView) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [team]: view }));
  } catch {
    /* private window: the view lasts for this visit */
  }
}

/** One team's roster view, kept in this browser. */
export function useRosterView(team: string) {
  const [view, setView] = useState<RosterView>(() => loadView(team));
  const [forTeam, setForTeam] = useState(team);
  if (forTeam !== team) {
    setForTeam(team);
    setView(loadView(team));
  }
  const update = useCallback(
    (change: (v: RosterView) => RosterView) =>
      setView((was) => {
        const next = cleanView(change(was));
        saveView(team, next);
        return next;
      }),
    [team],
  );
  return [view, update] as const;
}

/** Is this column on screen? */
export function isShown(view: RosterView, id: string, byDefault: boolean): boolean {
  return byDefault ? !view.hide.includes(id) : view.show.includes(id);
}

/** The view with one column turned on or off. */
export function withColumn(view: RosterView, id: string, byDefault: boolean, on: boolean): RosterView {
  const hide = view.hide.filter((x) => x !== id);
  const show = view.show.filter((x) => x !== id);
  if (byDefault && !on) hide.push(id);
  if (!byDefault && on) show.push(id);
  return { ...view, hide, show };
}
