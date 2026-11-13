/**
 * Where each depth chart spot lines up on the field view. Pure: the Depth
 * chart tab draws it, and the same rules port to the other sports' Vaults.
 *
 * Positions are percent of the field box: x across (0 left sideline, 100
 * right), y down the page. Offense looks up the field from behind its
 * backfield (line near the top third, backs below it); defense faces it (line
 * near the bottom, safeties up top). A spot the coach dragged keeps its own
 * `at`; any other is placed from its name and playbook letter, and a name we
 * don't know waits on the sideline row for the coach to drag it into place.
 */
import { layoutFormation, PERSONNEL, type GameType, type Placed } from "./formations";
import type { DepthSlot, DepthUnit } from "./teamHub";

export type Spot = { x: number; y: number };
export type PlacedSlot = { slot: DepthSlot; at: Spot; guessed: boolean; parked: boolean };

/** Where the line of scrimmage is drawn, per unit. */
export const LOS_Y: Record<DepthUnit, number> = { offense: 34, defense: 66, special: 55 };

type Role = { test: RegExp; spots: Spot[]; letters?: string[] };

const L = LOS_Y.offense;
const OFFENSE: Role[] = [
  { test: /^(c|center|centre|snapper)$/, letters: ["C"], spots: [{ x: 50, y: L }] },
  { test: /^(lt|left tackle)$/, spots: [{ x: 32, y: L }] },
  { test: /^(lg|left guard)$/, spots: [{ x: 41, y: L }] },
  { test: /^(rg|right guard)$/, spots: [{ x: 59, y: L }] },
  { test: /^(rt|right tackle)$/, spots: [{ x: 68, y: L }] },
  { test: /^(t|ot|tackle|ol|oline|lineman|offensive line)$/, spots: [{ x: 32, y: L }, { x: 68, y: L }] },
  { test: /^(g|og|guard)$/, spots: [{ x: 41, y: L }, { x: 59, y: L }] },
  { test: /^(qb|quarterback|q)$/, letters: ["Q"], spots: [{ x: 50, y: L + 18 }] },
  { test: /^(te|tight end|y|ye)$/, letters: ["Y"], spots: [{ x: 77, y: L }] },
  { test: /^(fb|fullback|f)$/, letters: ["F"], spots: [{ x: 50, y: L + 28 }] },
  { test: /^(rb|hb|tb|running back|halfback|tailback|h|back)$/, letters: ["H", "R", "B"], spots: [{ x: 50, y: L + 40 }, { x: 38, y: L + 26 }] },
  { test: /^(x|se|split end|wr1)$/, letters: ["X"], spots: [{ x: 8, y: L }] },
  { test: /^(z|fl|flanker|wr2)$/, letters: ["Z"], spots: [{ x: 91, y: L + 5 }] },
  { test: /^(s|slot|a|w|wr3|wing)$/, letters: ["S", "A", "W"], spots: [{ x: 22, y: L + 5 }, { x: 80, y: L + 9 }] },
  { test: /^(wr|receiver|wide receiver|wideout)$/, spots: [{ x: 8, y: L }, { x: 91, y: L + 5 }, { x: 22, y: L + 5 }, { x: 80, y: L + 9 }] },
];

const D = LOS_Y.defense;
const DEFENSE: Role[] = [
  { test: /^(cb l|corner l|left corner|lcb|cb left|corner left)$/, spots: [{ x: 8, y: D - 8 }] },
  { test: /^(cb r|corner r|right corner|rcb|cb right|corner right)$/, spots: [{ x: 92, y: D - 8 }] },
  { test: /^(cb|corner|cornerback|c)$/, spots: [{ x: 8, y: D - 8 }, { x: 92, y: D - 8 }] },
  { test: /^(de|end|defensive end|e)$/, letters: ["E"], spots: [{ x: 33, y: D - 4 }, { x: 67, y: D - 4 }] },
  { test: /^(dt|tackle|defensive tackle|t|nt|nose|nose tackle|n)$/, letters: ["T", "N"], spots: [{ x: 45, y: D - 4 }, { x: 55, y: D - 4 }, { x: 50, y: D - 4 }] },
  { test: /^(dl|lineman|defensive line)$/, spots: [{ x: 33, y: D - 4 }, { x: 45, y: D - 4 }, { x: 55, y: D - 4 }, { x: 67, y: D - 4 }] },
  { test: /^(rusher|rush|r|blitzer)$/, letters: ["R"], spots: [{ x: 50, y: D - 4 }] },
  { test: /^(mike|mlb|m|middle linebacker)$/, letters: ["M"], spots: [{ x: 50, y: D - 20 }] },
  { test: /^(will|wlb|w|weak linebacker)$/, letters: ["W"], spots: [{ x: 33, y: D - 19 }] },
  { test: /^(sam|slb|s|strong linebacker)$/, letters: ["S"], spots: [{ x: 67, y: D - 19 }] },
  { test: /^(lb|linebacker|olb|ilb|backer)$/, spots: [{ x: 50, y: D - 20 }, { x: 33, y: D - 19 }, { x: 67, y: D - 19 }] },
  { test: /^(nickel|star|nb|spur)$/, spots: [{ x: 80, y: D - 16 }] },
  { test: /^(fs|free safety|free|f)$/, letters: ["F"], spots: [{ x: 38, y: D - 44 }] },
  { test: /^(ss|strong safety|strong|rover|robber)$/, spots: [{ x: 62, y: D - 42 }] },
  { test: /^(safety|sf|db)$/, spots: [{ x: 50, y: D - 44 }, { x: 38, y: D - 44 }, { x: 62, y: D - 42 }] },
];

const K = LOS_Y.special;
const SPECIAL: Role[] = [
  { test: /^(long snapper|ls|snapper)$/, spots: [{ x: 50, y: K }] },
  { test: /^(holder|h)$/, spots: [{ x: 50, y: K + 15 }] },
  { test: /^(kicker|k|pk|place kicker|kickoff)$/, letters: ["K"], spots: [{ x: 44, y: K + 22 }] },
  { test: /^(punter|p)$/, letters: ["P"], spots: [{ x: 50, y: K + 32 }] },
  { test: /^(kick returner|kr|returner)$/, spots: [{ x: 42, y: 8 }, { x: 58, y: 8 }] },
  { test: /^(punt returner|pr)$/, spots: [{ x: 50, y: 14 }] },
  { test: /^(gunner|gunners)$/, spots: [{ x: 8, y: K }, { x: 92, y: K }] },
  { test: /^(upback|personal protector|pp)$/, spots: [{ x: 50, y: K + 10 }] },
  { test: /^(jammer|vice)$/, spots: [{ x: 10, y: K - 8 }, { x: 90, y: K - 8 }] },
];

const ROLES: Record<DepthUnit, Role[]> = { offense: OFFENSE, defense: DEFENSE, special: SPECIAL };

/** "Corner R", "DT ", "Free safety" → a tidy key; a trailing side or number is kept for the side rules. */
const tidy = (v: string) => v.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

function roleOf(unit: DepthUnit, slot: DepthSlot): Role | undefined {
  const roles = ROLES[unit];
  const name = tidy(slot.label);
  const bare = name.replace(/ ?\d+$/, "");
  return roles.find((r) => r.test.test(name)) ?? roles.find((r) => r.test.test(bare)) ?? (slot.letter ? roles.find((r) => r.letters?.includes(slot.letter.toUpperCase())) : undefined);
}

const near = (a: Spot, b: Spot) => Math.abs(a.x - b.x) < 9 && Math.abs(a.y - b.y) < 9;

/** Every spot on the field: dragged ones where the coach left them, the rest by their name, unknown names on the sideline row. */
export function placeSlots(unit: DepthUnit, slots: DepthSlot[]): PlacedSlot[] {
  const used = new Map<Role, number>();
  const taken: Spot[] = slots.filter((s) => s.at).map((s) => s.at!);
  const out: PlacedSlot[] = [];
  let parked = 0;
  for (const slot of slots) {
    if (slot.at) {
      out.push({ slot, at: slot.at, guessed: false, parked: false });
      continue;
    }
    const role = roleOf(unit, slot);
    if (!role) {
      out.push({ slot, at: { x: 0, y: 0 }, guessed: true, parked: true });
      parked++;
      continue;
    }
    const n = used.get(role) ?? 0;
    used.set(role, n + 1);
    let at = { ...role.spots[n % role.spots.length] };
    // A third DE or a second QB slides over until it has room of its own.
    for (let tries = 0; taken.some((t) => near(t, at)) && tries < 8; tries++) at = { x: at.x + (at.x > 85 ? -9 : 9), y: at.y + (tries % 2 ? 4 : 0) };
    taken.push(at);
    out.push({ slot, at, guessed: true, parked: false });
  }
  // The sideline row along the bottom (offense, special) or top (defense), spread evenly.
  const rowY = unit === "defense" ? 7 : 88;
  let i = 0;
  for (const p of out)
    if (p.parked) {
      p.at = { x: parked === 1 ? 50 : 10 + (80 * i) / (parked - 1), y: rowY };
      i++;
    }
  return out;
}

/** A dragged spot, held inside the field. */
export const clampSpot = (x: number, y: number): Spot => ({ x: Math.round(Math.min(97, Math.max(3, x)) * 10) / 10, y: Math.round(Math.min(96, Math.max(4, y)) * 10) / 10 });

/* ------------------------------------------------- line up from a formation --- */

/** Formation units (dx from the ball, dy behind the line) to field percent. */
/** Across: the line and tight ends get more room than the width (cards need it), out to 42% each side at 400 units. */
const across = (dx: number) => Math.sign(dx) * (Math.abs(dx) <= 150 ? Math.abs(dx) * 0.14 : 21 + (Math.abs(dx) - 150) * 0.084);
const FROM_DY = 0.25;
const LINE_DX: Record<string, number> = { lt: -100, "left tackle": -100, lg: -50, "left guard": -50, rg: 50, "right guard": 50, rt: 100, "right tackle": 100 };

/** Which game the offense chart is drawn for: linemen mean 11-man, six or more spots 7v7, else 5v5. */
export function gameOf(slots: DepthSlot[]): GameType {
  if (slots.some((s) => /^(lt|lg|rg|rt|t|g|ot|og|ol|left tackle|left guard|right guard|right tackle|tackle|guard)$/.test(tidy(s.label)))) return "11";
  return slots.length >= 6 ? "7v7" : "5v5";
}

/** 11-man personnel from the chart's backs and tight ends ("21" for an I with a fullback). */
function personnelOf(slots: DepthSlot[]): string {
  const backs = slots.filter((s) => /^(rb|hb|tb|fb|running back|halfback|tailback|fullback|back)$/.test(tidy(s.label))).length;
  const tes = slots.filter((s) => /^(te|tight end)$/.test(tidy(s.label))).length;
  const code = `${Math.min(2, backs)}${Math.min(3, tes)}`;
  return PERSONNEL.some((p) => p.code === code) ? code : "11";
}

/**
 * The offense chart lined up the way a library formation sets it: each spot
 * finds the player the formation puts there by its playbook letter (X, Z, H),
 * then by its name (QB, Center, LT, TE, RB, FB, WR). Spots the formation has
 * no one for keep where they were. Returns the slots with `at` set, and how
 * many it placed.
 */
export function fromFormation(slots: DepthSlot[], name: string): { slots: DepthSlot[]; placed: number } {
  const game = gameOf(slots);
  const set: Placed[] = layoutFormation(game, game === "11" ? personnelOf(slots) : "11", name);
  const used = new Set<number>();
  const take = (ok: (p: Placed) => boolean) => {
    const i = set.findIndex((p, n) => !used.has(n) && ok(p));
    if (i >= 0) used.add(i);
    return i >= 0 ? set[i] : null;
  };
  const find = (s: DepthSlot): Placed | null => {
    const label = tidy(s.label);
    const letter = s.letter.toUpperCase();
    if (letter === "Q" || /^(qb|quarterback)$/.test(label)) return take((p) => p.code === "QB");
    if (letter === "C" || /^(c|center|centre)$/.test(label)) return take((p) => p.code === "C");
    if (label in LINE_DX) return take((p) => p.code === "OL" && p.dx === LINE_DX[label]);
    if (/^(t|g|ot|og|ol|tackle|guard|lineman)$/.test(label)) return take((p) => p.code === "OL");
    if (/^(fb|fullback)$/.test(label)) return take((p) => p.role === "rb" && p.code !== "RB") ?? take((p) => p.role === "rb");
    if (/^(rb|hb|tb|running back|halfback|tailback)$/.test(label)) return take((p) => p.role === "rb");
    if (/^(te|tight end)$/.test(label)) return take((p) => p.role === "te");
    if (letter) {
      const hit = take((p) => p.code === letter || (p.code === "EXTRA" && p.label === letter));
      if (hit) return hit;
      // A receiver letter the formation doesn't use (5v5 sets have three) takes the next receiver spot.
      if (/^[A-Z]$/.test(letter) && !"QCTGE".includes(letter)) return take((p) => p.role === "wr");
    }
    if (/^(wr|receiver|wide receiver|wideout|slot)$/.test(label)) return take((p) => p.role === "wr");
    return null;
  };
  let placed = 0;
  const out = slots.map((s) => {
    const p = find(s);
    if (!p) return s;
    placed++;
    return { ...s, at: clampSpot(50 + across(p.dx), LOS_Y.offense + p.dy * FROM_DY) };
  });
  return { slots: out, placed };
}
