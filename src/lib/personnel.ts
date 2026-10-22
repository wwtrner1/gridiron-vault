import type { PlayMeta } from "./types";
import { PERSONNEL } from "./formations";

/** One group in the Personnel dropdown. `value` is what saves on the play and prints on exports. */
export type PersonnelGroup = { id: string; label: string; options: { value: string; label: string }[] };

const offense: PersonnelGroup = {
  id: "offense",
  label: "Offense (11-man)",
  options: [...PERSONNEL]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((p) => ({
      value: `${p.code} personnel`,
      label: `${p.code} · ${p.rb} RB, ${p.te} TE, ${p.wr} WR`,
    })),
};

const defense: PersonnelGroup = {
  id: "defense",
  label: "Defense (11-man)",
  options: [
    ["Base 4-3", "Base 4-3 · 4 DL, 3 LB, 4 DB"],
    ["Base 3-4", "Base 3-4 · 3 DL, 4 LB, 4 DB"],
    ["Nickel 4-2-5", "Nickel 4-2-5 · 5 DB"],
    ["Nickel 3-3-5", "Nickel 3-3-5 (Stack) · 5 DB"],
    ["Dime 4-1-6", "Dime 4-1-6 · 6 DB"],
    ["Dime 3-2-6", "Dime 3-2-6 · 6 DB"],
    ["Quarter", "Quarter · 7 DB"],
    ["Bear 46", "Bear 46 · 4 DL, 4 LB, 3 DB"],
    ["Goal line", "Goal line · 6 DL, 3 LB, 2 DB"],
  ].map(([value, label]) => ({ value, label })),
};

const special: PersonnelGroup = {
  id: "special",
  label: "Special teams",
  options: ["Kickoff", "Kick return", "Punt", "Punt return", "Field goal / PAT", "Field goal block"].map((v) => ({ value: v, label: v })),
};

const smallSided: PersonnelGroup = {
  id: "small",
  label: "7v7 and flag",
  options: [
    "7v7 offense",
    "7v7 defense",
    "8-man offense",
    "8-man defense",
    "6-man offense",
    "6-man defense",
    "5-on-5 offense",
    "5-on-5 defense",
  ].map((v) => ({ value: v, label: v })),
};

/** The groups in the order a coach drawing this kind of play wants them: that side of the ball first. */
export function personnelGroups(playType: PlayMeta["playType"]): PersonnelGroup[] {
  if (playType === "defense") return [defense, offense, special, smallSided];
  if (playType === "special") return [special, offense, defense, smallSided];
  return [offense, defense, special, smallSided];
}

const KNOWN = new Set([offense, defense, special, smallSided].flatMap((g) => g.options.map((o) => o.value)));

/**
 * The listed value a saved play's personnel matches, or null when it's the
 * coach's own wording. Older plays saved a bare code ("11"), so that still
 * finds "11 personnel".
 */
export function knownPersonnel(value: string): string | null {
  const v = value.trim();
  if (KNOWN.has(v)) return v;
  if (KNOWN.has(`${v} personnel`)) return `${v} personnel`;
  return null;
}
