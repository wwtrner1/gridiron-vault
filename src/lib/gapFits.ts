/**
 * Gap fits: which gap each defender in the box owns, worked out from where
 * the players stand. Pure, so Griddy's bulk "tag the gaps" change, the
 * defenses he draws and the API function all agree. The names are the
 * starter glossary's own ("A gap" … "D gap", see GAP_GLOSSARY in terms.ts),
 * so a coach's Playbook language explains every tag.
 */

/** Gap letters from the ball outward. */
const LETTERS = ["A", "B", "C", "D", "E"];
/** Offense players standing closer than this to the line count as on it (canvas units). */
const ON_LINE = 30;
/** Canvas units between linemen when the offense has none on the line (flag): the 11-man spacing. */
const SPLIT = 50;
/** Defenders this deep or shallower, and this close to the ball, are in the box. */
export const BOX_DEPTH = 110;
export const BOX_WIDTH = 230;

export type GapSpot = { name: string; x: number };

/**
 * The gaps across the line: halfway between the ball and the first player on
 * each side (the A gaps), then between neighbours, and one past the last
 * player. With nobody on a side, the 11-man spacing stands in.
 */
export function gapsFrom(lineXs: number[], ballX: number): GapSpot[] {
  const out: GapSpot[] = [];
  for (const dir of [-1, 1]) {
    const side = lineXs
      .filter((x) => (x - ballX) * dir > 5 && Math.abs(x - ballX) <= BOX_WIDTH)
      .sort((a, b) => Math.abs(a - ballX) - Math.abs(b - ballX));
    const posts = side.length ? [ballX, ...side] : [ballX, ...[1, 2, 3].map((k) => ballX + dir * SPLIT * k)];
    posts.forEach((x, i) => {
      if (i >= LETTERS.length) return;
      const next = posts[i + 1] ?? x + dir * SPLIT;
      out.push({ name: `${LETTERS[i]} gap`, x: (x + next) / 2 });
    });
  }
  return out;
}

/** A defender as gap fits see him: across from the ball (x) and yards of canvas off the line (depth, always positive). */
export type BoxDefender = { x: number; depth: number };

/**
 * Each defender's gap, or null when he isn't in the box or every gap is
 * taken. Defenders on the line choose first, nearest gap first; backers fill
 * what's left the same way, so a 4-3 lands two A, two B and two C gaps with
 * a backer spilling to the D gap.
 */
export function fitGaps(defenders: BoxDefender[], gaps: GapSpot[], ballX: number): (string | null)[] {
  const out: (string | null)[] = defenders.map(() => null);
  const free = new Set(gaps.map((_, i) => i));
  const inBox = (d: BoxDefender) => d.depth <= BOX_DEPTH && Math.abs(d.x - ballX) <= BOX_WIDTH;
  for (const front of [true, false]) {
    const who = defenders.map((d, i) => ({ d, i })).filter(({ d }) => inBox(d) && (d.depth <= 45) === front);
    const pairs = who.flatMap(({ d, i }) => gaps.map((g, gi) => ({ i, gi, dist: Math.abs(g.x - d.x) })));
    pairs.sort((a, b) => a.dist - b.dist);
    for (const p of pairs) {
      if (out[p.i] || !free.has(p.gi)) continue;
      out[p.i] = gaps[p.gi].name;
      free.delete(p.gi);
    }
  }
  return out;
}

/** A zone's coach name from where it sits (offsets from the ball, half-field units): Deep 1/3, Flat, Hook… */
export function zoneJob(zone: { dx: number; dy: number }, deepCount: number, robber = false): string {
  if (zone.dy <= -240) {
    if (deepCount <= 1) return "Deep middle";
    return deepCount === 2 ? "Deep 1/2" : deepCount === 3 ? "Deep 1/3" : "Deep 1/4";
  }
  if (robber) return "Robber";
  const out = Math.abs(zone.dx);
  if (out >= 330) return "Flat";
  if (out >= 150) return "Curl";
  return "Hook";
}
