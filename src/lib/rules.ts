/**
 * League rule lines: the two distances flag coaches draw around every play,
 * the rush line (how far behind the line of scrimmage defenders may not rush
 * from) and the no-run zone at the goal line. Leagues and states set these
 * differently, so a coach picks a starting point and edits the numbers.
 */
export type RuleLines = { on: boolean; rush: number; noRun: number };

export const RULE_PRESETS: { id: string; name: string; rush: number; noRun: number; note: string }[] = [
  { id: "nfl-flag", name: "NFL FLAG 5-on-5", rush: 7, noRun: 5, note: "The usual 5-on-5 setup: rushers start 7 yards back, and the last 5 yards before the goal line are pass-only. Check your league's rulebook." },
  { id: "rush-only", name: "Rush line only", rush: 7, noRun: 0, note: "A rush line with no no-run zone, as some leagues play." },
];

export const RULE_LIMITS = { rush: { min: 0, max: 20 }, noRun: { min: 0, max: 15 } };

export const DEFAULT_RULES: RuleLines = { on: false, rush: RULE_PRESETS[0].rush, noRun: RULE_PRESETS[0].noRun };

const KEY = "grid1ronvault.rules.v1";

export const clampRule = (value: number, which: keyof typeof RULE_LIMITS) =>
  Math.min(RULE_LIMITS[which].max, Math.max(RULE_LIMITS[which].min, Math.round(Number.isFinite(value) ? value : 0)));

/** The coach's rule lines, remembered per browser. */
export function loadRules(): RuleLines {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<RuleLines> | null;
    if (saved) return { on: !!saved.on, rush: clampRule(Number(saved.rush ?? DEFAULT_RULES.rush), "rush"), noRun: clampRule(Number(saved.noRun ?? DEFAULT_RULES.noRun), "noRun") };
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
