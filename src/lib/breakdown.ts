/**
 * A film breakdown brought in from a spreadsheet: the play-by-play table a
 * coach downloads from Hudl (or keeps by hand) as a CSV. Each row is one rep.
 * `readBreakdown` finds the columns by their headings, `matchReps` ties every
 * rep to a Vault play by its name, and the reps a coach keeps are saved in the
 * play itself (`scene.film.reps`), so they follow the play to every device.
 * Pure: the screen (`components/Breakdown.tsx`) only shows what this returns.
 */

/** One rep of a play on film. */
export type FilmRep = {
  /** The game or practice it came from, in the coach's words. */
  game: string;
  /** The rep's number in that film. */
  n: number;
  down?: number;
  dist?: number;
  /** Yards gained (negative for a loss). */
  gain?: number;
  /** "Complete", "Rush", "TD" … as the breakdown says it. */
  result?: string;
};

export const REP_LIMITS = { perPlay: 60, game: 60, result: 40, rows: 3000, bytes: 2 * 1024 * 1024 } as const;

const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : undefined);

/** Keeps only reps a play can hold; undefined when there are none. */
export function cleanReps(raw: unknown): FilmRep[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: FilmRep[] = [];
  for (const r of raw.slice(0, REP_LIMITS.perPlay)) {
    if (!r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    const n = num(v.n, 0, 9999);
    if (typeof v.game !== "string" || n === undefined) continue;
    const rep: FilmRep = { game: v.game.trim().slice(0, REP_LIMITS.game), n };
    const down = num(v.down, 1, 4);
    const dist = num(v.dist, 0, 99);
    const gain = num(v.gain, -99, 120);
    if (down !== undefined) rep.down = down;
    if (dist !== undefined) rep.dist = dist;
    if (gain !== undefined) rep.gain = gain;
    if (typeof v.result === "string" && v.result.trim()) rep.result = v.result.trim().slice(0, REP_LIMITS.result);
    out.push(rep);
  }
  return out.length ? out : undefined;
}

/** A row of the breakdown: the play as the film names it, and the rep. */
export type BreakdownRow = { play: string; formation: string; rep: Omit<FilmRep, "game"> };

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Headings a breakdown uses for each thing we read, most exact first. */
const HEADS: Record<"play" | "form" | "n" | "down" | "dist" | "gain" | "result" | "odk", string[]> = {
  play: ["offplay", "playname", "play", "call", "offensiveplay"],
  form: ["offform", "formation", "offformation", "form"],
  n: ["play#", "playnumber", "playno", "#", "rep", "no"],
  down: ["dn", "down"],
  dist: ["dist", "distance", "togo", "ydstogo"],
  gain: ["gnls", "gainloss", "gain", "yards", "yds"],
  result: ["result", "outcome"],
  odk: ["odk"],
};

const headKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9#]+/g, "");
const toInt = (s: string | undefined): number | undefined => {
  const m = /^-?\d{1,4}$/.exec((s ?? "").trim());
  return m ? Number(m[0]) : undefined;
};

/**
 * Reads the table. The headings row is the first of the top ten that names a
 * play column; defensive and kicking reps (ODK of D or K) and rows with no
 * play name are left out. `error` is in coach words when nothing can be read.
 */
export function readBreakdown(table: string[][]): { rows: BreakdownRow[]; error?: string } {
  let at = -1;
  let cols: Partial<Record<keyof typeof HEADS, number>> = {};
  for (let r = 0; r < Math.min(10, table.length) && at < 0; r++) {
    const heads = table[r].map(headKey);
    const found: typeof cols = {};
    for (const [what, names] of Object.entries(HEADS) as [keyof typeof HEADS, string[]][]) {
      for (const name of names) {
        const c = heads.indexOf(name);
        if (c >= 0) {
          found[what] = c;
          break;
        }
      }
    }
    if (found.play !== undefined) {
      at = r;
      cols = found;
    }
  }
  if (at < 0) return { rows: [], error: 'That file has no play column. A breakdown needs a column headed "OFF PLAY" or "Play" with the play\'s name in it.' };
  const rows: BreakdownRow[] = [];
  const cell = (row: string[], what: keyof typeof HEADS) => (cols[what] === undefined ? "" : (row[cols[what]!] ?? "").trim());
  table.slice(at + 1, at + 1 + REP_LIMITS.rows).forEach((row, i) => {
    const play = cell(row, "play");
    if (!play) return;
    const odk = cell(row, "odk").toUpperCase();
    if (odk && odk !== "O") return;
    const rep: BreakdownRow["rep"] = { n: toInt(cell(row, "n")) ?? i + 1 };
    const down = toInt(cell(row, "down"));
    const dist = toInt(cell(row, "dist"));
    const gain = toInt(cell(row, "gain"));
    if (down !== undefined && down >= 1 && down <= 4) rep.down = down;
    if (dist !== undefined && dist >= 0 && dist <= 99) rep.dist = dist;
    if (gain !== undefined && gain >= -99 && gain <= 120) rep.gain = gain;
    const result = cell(row, "result");
    if (result) rep.result = result.slice(0, REP_LIMITS.result);
    rows.push({ play: play.slice(0, 80), formation: cell(row, "form").slice(0, 60), rep });
  });
  if (!rows.length) return { rows, error: "That file has headings but no offensive reps with a play name under them." };
  return { rows };
}

/** One play name from the film, its reps, and the Vault play it is tied to (or none yet). */
export type RepGroup = { name: string; formation: string; reps: BreakdownRow["rep"][]; playId: string | null };

/**
 * Ties each film name to a Vault play: the same name, the same name without
 * the Vault's leading number ("17 · Stick" is "Stick"), or the formation and
 * name together ("Trips Right Stick"). A name two Vault plays share is left
 * for the coach to pick.
 */
export function matchReps(rows: BreakdownRow[], plays: { id: string; name: string }[]): RepGroup[] {
  const byKey = new Map<string, string | null>();
  const note = (k: string, id: string) => k && byKey.set(k, byKey.has(k) && byKey.get(k) !== id ? null : id);
  for (const p of plays) {
    note(key(p.name), p.id);
    note(key(p.name.replace(/^\s*\d+\s*[·.\-:)]\s*/, "")), p.id);
  }
  const groups = new Map<string, RepGroup>();
  for (const row of rows) {
    const k = key(row.play);
    let g = groups.get(k);
    if (!g) {
      const playId = byKey.get(k) ?? byKey.get(key(`${row.formation}${row.play}`)) ?? null;
      g = { name: row.play, formation: row.formation, reps: [], playId };
      groups.set(k, g);
    }
    g.reps.push(row.rep);
  }
  return [...groups.values()].sort((a, b) => b.reps.length - a.reps.length || a.name.localeCompare(b.name));
}

/** A play's reps with one film's replaced by the new import (so bringing the same film in twice doesn't double it). */
export function withReps(have: FilmRep[] | undefined, game: string, reps: BreakdownRow["rep"][]): FilmRep[] {
  const name = game.trim().slice(0, REP_LIMITS.game);
  const kept = (have ?? []).filter((r) => r.game !== name);
  return [...kept, ...reps.map((r) => ({ game: name, ...r }))].slice(-REP_LIMITS.perPlay);
}

/** What the film says about a play: how often it was called and what it gained. */
export function repStats(reps: FilmRep[]): { calls: number; counted: number; avg: number | null; best: number | null; games: number } {
  const gains = reps.map((r) => r.gain).filter((g): g is number => typeof g === "number");
  return {
    calls: reps.length,
    counted: gains.length,
    avg: gains.length ? Math.round((gains.reduce((a, g) => a + g, 0) / gains.length) * 10) / 10 : null,
    best: gains.length ? Math.max(...gains) : null,
    games: new Set(reps.map((r) => r.game)).size,
  };
}

/** "Called 6 times on film · 5.2 yards a call · best 18" */
export function repLine(reps: FilmRep[]): string {
  const s = repStats(reps);
  const parts = [`Called ${s.calls} ${s.calls === 1 ? "time" : "times"} on film`];
  if (s.avg !== null) parts.push(`${s.avg} yards a call`);
  if (s.best !== null && s.counted > 1) parts.push(`best ${s.best}`);
  return parts.join(" · ");
}
