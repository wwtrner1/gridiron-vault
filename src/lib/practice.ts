import { uid } from "./types";

/**
 * A practice script: timed periods, each with the plays to rep. Kept in this
 * browser. It prints as the one-page script on the clipboard and as scout
 * cards, one play per card, for whoever runs the look team.
 */
export type Period = { id: string; title: string; minutes: number; note: string; playIds: string[] };
export type Script = { name: string; start: string; periods: Period[] };

const KEY = "grid1ronvault.practice.v1";

export const newPeriod = (title: string, minutes: number, note = ""): Period => ({ id: uid("per"), title, minutes, note, playIds: [] });

export const freshScript = (): Script => ({
  name: "Practice script",
  start: "",
  periods: [
    newPeriod("Warm-up", 10, "Dynamic stretch, throwing"),
    newPeriod("Individual", 15, "Routes on air, QB and center exchanges"),
    newPeriod("Skelly", 15, "Offense vs. no defense"),
    newPeriod("Team", 20, "Full speed vs. scout look"),
    newPeriod("Situational", 10, "Red zone, third down, last play"),
  ],
});

export function loadScript(): Script {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Script | null;
    if (raw && Array.isArray(raw.periods)) return raw;
  } catch {
    /* fall through to a fresh script */
  }
  return freshScript();
}

export function saveScript(script: Script) {
  try {
    localStorage.setItem(KEY, JSON.stringify(script));
  } catch {
    /* storage blocked: the script still holds this visit */
  }
}

export const totalMinutes = (s: Script) => s.periods.reduce((n, p) => n + (p.minutes || 0), 0);

/** Clock times for each period from a "HH:MM" start; empty when no start was set. */
export function clockTimes(s: Script): string[] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.start);
  if (!m) return s.periods.map(() => "");
  let at = Number(m[1]) * 60 + Number(m[2]);
  return s.periods.map((p) => {
    const h = Math.floor(at / 60) % 24;
    const label = `${h % 12 || 12}:${String(at % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
    at += p.minutes || 0;
    return label;
  });
}
