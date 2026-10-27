/**
 * League rule lines: the two distances flag coaches draw around every play,
 * the rush line (how far behind the line of scrimmage defenders may not rush
 * from) and the no-run zone at the goal line. Leagues and states set these
 * differently, so a coach picks a starting point and edits the numbers.
 */
export type RuleLines = { on: boolean; rush: number; noRun: number; /** The rule set the Rules check reads (a RULE_PRESETS id). */ set: string };

/**
 * What a rule set allows, beyond the two distances. The Rules check in the
 * Designer reads these against the drawing itself (lib/ruleCheck.ts).
 */
export type RuleSet = {
  id: string;
  name: string;
  rush: number;
  noRun: number;
  note: string;
  /** Most players a side may have on the field; null when the set doesn't say. */
  players: number | null;
  /** Offensive players may block (a T-capped line). */
  blocking: boolean;
  /** The quarterback may run the ball past the line himself without a handoff first. */
  qbRun: boolean;
  /** Run plays are allowed at all (7-on-7 passing leagues have none). */
  runs: boolean;
  /** Defenders may rush the passer. */
  rushing: boolean;
  /** Flag fields also have a no-run zone before midfield. */
  midfieldNoRun: boolean;
  /** Tackle rules: seven on the line of scrimmage. */
  sevenOnLine: boolean;
};

export const RULE_PRESETS: RuleSet[] = [
  {
    id: "nfl-flag",
    name: "NFL FLAG 5-on-5",
    rush: 7,
    noRun: 5,
    note: "The usual 5-on-5 setup: rushers start 7 yards off the ball, no blocking, the quarterback can't run it himself, and the 5 yards before the goal line and midfield are pass-only. Check your league's rulebook.",
    players: 5,
    blocking: false,
    qbRun: false,
    runs: true,
    rushing: true,
    midfieldNoRun: true,
    sevenOnLine: false,
  },
  {
    id: "flag-7",
    name: "7-on-7 passing",
    rush: 0,
    noRun: 0,
    note: "Passing leagues: seven a side, no rush, no runs and no blocking.",
    players: 7,
    blocking: false,
    qbRun: false,
    runs: false,
    rushing: false,
    midfieldNoRun: false,
    sevenOnLine: false,
  },
  {
    id: "rush-only",
    name: "Rush line only",
    rush: 7,
    noRun: 0,
    note: "A rush line with no no-run zone, as some flag leagues play. No blocking.",
    players: null,
    blocking: false,
    qbRun: true,
    runs: true,
    rushing: true,
    midfieldNoRun: false,
    sevenOnLine: false,
  },
  {
    id: "tackle-11",
    name: "Tackle 11",
    rush: 0,
    noRun: 0,
    note: "Eleven a side with seven on the line, blocking allowed and one man in motion.",
    players: 11,
    blocking: true,
    qbRun: true,
    runs: true,
    rushing: true,
    midfieldNoRun: false,
    sevenOnLine: true,
  },
];

/** The rule set a coach picked, or NFL FLAG when the saved id is unknown. */
export const ruleSet = (id: string | undefined) => RULE_PRESETS.find((r) => r.id === id) ?? RULE_PRESETS[0];

export const RULE_LIMITS = { rush: { min: 0, max: 20 }, noRun: { min: 0, max: 15 } };

export const DEFAULT_RULES: RuleLines = { on: false, rush: RULE_PRESETS[0].rush, noRun: RULE_PRESETS[0].noRun, set: RULE_PRESETS[0].id };

const KEY = "grid1ronvault.rules.v1";

export const clampRule = (value: number, which: keyof typeof RULE_LIMITS) =>
  Math.min(RULE_LIMITS[which].max, Math.max(RULE_LIMITS[which].min, Math.round(Number.isFinite(value) ? value : 0)));

/** The coach's rule lines, remembered per browser. */
export function loadRules(): RuleLines {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<RuleLines> | null;
    if (saved)
      return {
        on: !!saved.on,
        rush: clampRule(Number(saved.rush ?? DEFAULT_RULES.rush), "rush"),
        noRun: clampRule(Number(saved.noRun ?? DEFAULT_RULES.noRun), "noRun"),
        // Saved before rule sets existed: the matching preset, else NFL FLAG.
        set: ruleSet(saved.set ?? RULE_PRESETS.find((r) => r.rush === saved.rush && r.noRun === saved.noRun)?.id).id,
      };
  } catch {
    /* unreadable: start from the defaults */
  }
  return DEFAULT_RULES;
}

export function saveRules(rules: RuleLines) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rules));
  } catch {
    /* storage blocked: the choice still holds this session */
  }
}
