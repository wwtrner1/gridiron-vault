import { uid } from "./types";

/**
 * A practice script: timed periods, each with the plays to rep. Kept in this
 * browser. It prints as the one-page script on the clipboard and as scout
 * cards, one play per card, for whoever runs the look team.
 */
export type PeriodKind = "warmup" | "individual" | "group" | "team" | "special" | "conditioning" | "walkthrough" | "break";
export type Period = { id: string; title: string; minutes: number; note: string; playIds: string[]; drillIds?: string[]; kind?: PeriodKind };

/** What each kind of period is called and the color its card and the timeline wear. */
export const PERIOD_KINDS: { id: PeriodKind; label: string; hint: string }[] = [
  { id: "warmup", label: "Warm-up", hint: "Stretch, form running, throwing to get loose." },
  { id: "individual", label: "Individual", hint: "Position groups on their own: technique and drills." },
  { id: "group", label: "Group", hint: "Two or three position groups together: skelly, inside run, pass rush." },
  { id: "team", label: "Team", hint: "Eleven on eleven (or five on five): plays against a look." },
  { id: "special", label: "Special teams", hint: "Kicks, punts, returns and extra points." },
  { id: "conditioning", label: "Conditioning", hint: "Sprints and finishers." },
  { id: "walkthrough", label: "Walkthrough", hint: "At a walk: alignments, calls and the game plan." },
  { id: "break", label: "Water break", hint: "A rest the clock should count." },
];

/** A period saved before kinds existed gets one from its name. */
export function kindOf(p: Period): PeriodKind {
  if (p.kind && PERIOD_KINDS.some((k) => k.id === p.kind)) return p.kind;
  const t = p.title.toLowerCase();
  if (/warm|stretch|dynamic/.test(t)) return "warmup";
  if (/indiv|position/.test(t)) return "individual";
  if (/team|scrimmage|situation|red zone|2.?minute/.test(t)) return "team";
  if (/special|punt|kick/.test(t)) return "special";
  if (/condition|sprint|gasser/.test(t)) return "conditioning";
  if (/walk/.test(t)) return "walkthrough";
  if (/water|break|rest/.test(t)) return "break";
  return "group";
}
export type Script = { name: string; start: string; periods: Period[] };

const KEY = "grid1ronvault.practice.v1";

export const newPeriod = (title: string, minutes: number, note = "", kind?: PeriodKind): Period => ({ id: uid("per"), title, minutes, note, playIds: [], drillIds: [], ...(kind ? { kind } : {}) });

export const freshScript = (): Script => ({
  name: "Practice script",
  start: "",
  periods: [
    newPeriod("Warm-up", 10, "Dynamic stretch, throwing", "warmup"),
    newPeriod("Individual", 15, "Routes on air, QB and center exchanges", "individual"),
    newPeriod("Skelly", 15, "Offense vs. no defense", "group"),
    newPeriod("Team", 20, "Full speed vs. scout look", "team"),
    newPeriod("Situational", 10, "Red zone, third down, last play", "team"),
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

/** True once a script has been saved in this browser. */
export function hasSavedScript(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function saveScript(script: Script) {
  try {
    localStorage.setItem(KEY, JSON.stringify(script));
  } catch {
    /* storage blocked: the script still holds this visit */
  }
}

export const totalMinutes = (s: Script) => s.periods.reduce((n, p) => n + (p.minutes || 0), 0);

/** The clock time the script ends, or "" with no start time. */
export function endTime(s: Script): string {
  const t = clockTimes({ ...s, periods: [...s.periods, newPeriod("End", 0)] });
  return t[t.length - 1] ?? "";
}

/** Puts a drill into one period of the saved script (from the Drill Vault). */
export function addDrillToScript(periodId: string, drillId: string, shown?: Script): Script {
  // A script never saved is a fresh one with new ids each load, so use the one the coach was shown.
  const s = shown ?? loadScript();
  const next = { ...s, periods: s.periods.map((p) => (p.id === periodId ? { ...p, drillIds: [...(p.drillIds ?? []), drillId] } : p)) };
  saveScript(next);
  return next;
}

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
