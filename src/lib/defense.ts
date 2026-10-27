import { makePlayer } from "./presets";
import { makePath, makeShape } from "./scene";
import { uid } from "./types";
import type { Point, SceneNode } from "./types";

/**
 * Defense library, from the Grid1ron Design canvas (Designer · assistant,
 * tools…): a front and a coverage make eleven defenders. With assignments
 * on, zone drops show as shaded areas and man coverage as lines to each
 * receiver. Offsets are from the ball; negative dy is the defense's side.
 */
export const FRONTS = ["4-3", "4-4", "3-4", "5-2", "3-3"] as const;
export const COVERAGES = ["Cover 3", "Cover 1", "Cover 2", "Cover 4", "Man"] as const;
export type Front = (typeof FRONTS)[number];
export type Coverage = (typeof COVERAGES)[number];

type Spot = [number, number, string];

const LINE: Record<number, Spot[]> = {
  3: [[-90, -26, "E"], [0, -26, "N"], [90, -26, "E"]],
  4: [[-110, -26, "E"], [-38, -26, "N"], [38, -26, "T"], [110, -26, "E"]],
  5: [[-150, -26, "E"], [-75, -26, "T"], [0, -26, "N"], [75, -26, "T"], [150, -26, "E"]],
};

const BACKERS: Record<Front, Spot[]> = {
  "4-3": [[-120, -86, "S"], [0, -80, "M"], [130, -86, "W"]],
  "4-4": [[-200, -80, "S"], [-62, -86, "M"], [62, -86, "J"], [200, -80, "W"]],
  "3-4": [[-190, -70, "S"], [-60, -86, "M"], [60, -86, "J"], [190, -70, "W"]],
  "5-2": [[-70, -86, "M"], [70, -86, "W"]],
  "3-3": [[-130, -86, "S"], [0, -86, "M"], [130, -86, "W"]],
};

const LINE_COUNT: Record<Front, number> = { "4-3": 4, "4-4": 4, "3-4": 3, "5-2": 5, "3-3": 3 };

/** Secondary alignment per coverage, by label. */
const SHELL: Record<Coverage, Record<string, [number, number]>> = {
  "Cover 3": { CL: [-440, -60], CR: [440, -60], S: [225, -160], FS: [0, -190], R: [-225, -150] },
  "Cover 1": { CL: [-440, -30], CR: [440, -30], S: [60, -140], FS: [0, -210], R: [-225, -120] },
  "Cover 2": { CL: [-420, -35], CR: [420, -35], S: [230, -200], FS: [-230, -200], R: [0, -140] },
  "Cover 4": { CL: [-430, -90], CR: [430, -90], S: [170, -170], FS: [-170, -170], R: [-260, -110] },
  Man: { CL: [-440, -30], CR: [440, -30], S: [200, -110], FS: [0, -210], R: [-200, -110] },
};

const DBS: Record<number, string[]> = { 3: ["CL", "CR", "FS"], 4: ["CL", "CR", "S", "FS"], 5: ["CL", "CR", "S", "FS", "R"] };

export type Zone = { dx: number; dy: number; rx: number; ry: number };
const z = (dx: number, dy: number, rx: number, ry: number): Zone => ({ dx, dy, rx, ry });

const DEEP: Record<string, Zone[]> = {
  thirds: [z(-340, -265, 150, 52), z(0, -280, 150, 52), z(340, -265, 150, 52)],
  halves: [z(-230, -270, 225, 56), z(230, -270, 225, 56)],
  quarters: [z(-390, -265, 118, 50), z(-130, -275, 118, 50), z(130, -275, 118, 50), z(390, -265, 118, 50)],
  middle: [z(0, -280, 210, 56)],
};

const UNDER: Record<number, Zone[]> = {
  1: [z(0, -150, 90, 36)],
  2: [z(-200, -125, 110, 39), z(200, -125, 110, 39)],
  3: [z(-280, -120, 110, 39), z(0, -128, 100, 39), z(280, -120, 110, 39)],
  4: [z(-400, -120, 105, 39), z(-160, -125, 95, 39), z(160, -125, 95, 39), z(400, -120, 105, 39)],
  5: [z(-410, -100, 95, 36), z(-220, -125, 90, 36), z(0, -132, 85, 36), z(220, -125, 90, 36), z(410, -100, 95, 36)],
};

/** Who plays deep, by label, and which deep zones they take. */
const PLAN: Record<Coverage, { deep: string[]; zones: Zone[]; robber?: string; man: boolean }> = {
  "Cover 3": { deep: ["CL", "FS", "CR"], zones: DEEP.thirds, man: false },
  "Cover 2": { deep: ["FS", "S"], zones: DEEP.halves, man: false },
  "Cover 4": { deep: ["CL", "FS", "S", "CR"], zones: DEEP.quarters, man: false },
  "Cover 1": { deep: ["FS"], zones: DEEP.middle, robber: "S", man: true },
  Man: { deep: [], zones: [], man: true },
};

export type Defender = { dx: number; dy: number; label: string; job: "rush" | "zone" | "man" };
export type Line = { from: number; to: { dx: number; dy: number }; kind: "drop" | "man" | "rush" };
export type DefenseLayout = { defenders: Defender[]; zones: Zone[]; lines: Line[] };

/**
 * Lays out a front and coverage. `receivers` are the offense's eligible
 * players (offsets from the ball); man defenders are matched to them
 * outside-in. With no receivers, man defenders are placed without lines.
 */
export function layoutDefense(front: Front, coverage: Coverage, receivers: { dx: number; dy: number }[] = []): DefenseLayout {
  const shell = SHELL[coverage];
  const plan = PLAN[coverage];
  const dl = LINE[LINE_COUNT[front]];
  const lb = BACKERS[front];
  const dbKeys = DBS[11 - dl.length - lb.length];

  const defenders: Defender[] = [
    ...dl.map(([dx, dy, label]): Defender => ({ dx, dy, label, job: "rush" })),
    ...lb.map(([dx, dy, label]): Defender => ({ dx, dy, label, job: "zone" })),
    ...dbKeys.map((k): Defender => {
      const [dx, dy] = shell[k];
      return { dx, dy, label: k === "CL" || k === "CR" ? "C" : k, job: "zone" };
    }),
  ];
  const keyOf = (i: number) => (i >= dl.length + lb.length ? dbKeys[i - dl.length - lb.length] : null);
  const zones: Zone[] = [];
  const lines: Line[] = [];
  const taken = new Set<number>();

  // Deep zones: the named defenders, or the nearest free defensive back if the front has none.
  plan.deep.forEach((key, zi) => {
    const zone = plan.zones[zi];
    let i = defenders.findIndex((_, j) => keyOf(j) === key && !taken.has(j));
    if (i < 0) i = nearest(defenders, zone.dx, (j) => keyOf(j) !== null && !taken.has(j));
    if (i < 0) return;
    taken.add(i);
    zones.push(zone);
    lines.push({ from: i, to: { dx: zone.dx, dy: zone.dy }, kind: "drop" });
  });

  const coverers = defenders.map((_, i) => i).filter((i) => defenders[i].job !== "rush" && !taken.has(i));

  if (plan.robber) {
    const zone = UNDER[1][0];
    let i = coverers.find((j) => keyOf(j) === plan.robber);
    if (i === undefined) i = coverers.find((j) => defenders[j].label === "M");
    if (i !== undefined) {
      taken.add(i);
      zones.push(zone);
      lines.push({ from: i, to: { dx: zone.dx, dy: zone.dy }, kind: "drop" });
    }
  }

  const free = coverers.filter((i) => !taken.has(i));
  if (plan.man) {
    // Outside receivers first, each to the nearest free defender; spares rush.
    const order = [...receivers].sort((a, b) => Math.abs(b.dx) - Math.abs(a.dx));
    const left = new Set(free);
    for (const r of order) {
      const i = nearest(defenders, r.dx, (j) => left.has(j));
      if (i < 0) break;
      left.delete(i);
      defenders[i].job = "man";
      lines.push({ from: i, to: r, kind: "man" });
    }
    if (receivers.length) for (const i of left) defenders[i].job = "rush";
    else for (const i of left) defenders[i].job = "man";
  } else {
    // Underneath zones, one per free defender, matched left to right.
    const set = UNDER[Math.min(free.length, 5)] ?? [];
    const byX = [...free].sort((a, b) => defenders[a].dx - defenders[b].dx);
    const extra = byX.length - set.length;
    // Too many for the zones: the defender nearest the middle blitzes.
    const blitz = new Set(
      [...byX].sort((a, b) => Math.abs(defenders[a].dx) - Math.abs(defenders[b].dx)).slice(0, Math.max(0, extra)),
    );
    const droppers = byX.filter((i) => !blitz.has(i));
    droppers.forEach((i, k) => {
      const zone = set[k];
      zones.push(zone);
      lines.push({ from: i, to: { dx: zone.dx, dy: zone.dy }, kind: "drop" });
    });
    for (const i of blitz) defenders[i].job = "rush";
  }

  defenders.forEach((d, i) => {
    if (d.job !== "rush") return;
    const out = d.dx === 0 ? 0 : Math.sign(d.dx) * 6;
    lines.push({ from: i, to: { dx: d.dx + out, dy: d.dy + 22 + (d.dy < -40 ? 30 : 0) }, kind: "rush" });
  });

  return { defenders, zones, lines };
}

function nearest(defenders: Defender[], dx: number, ok: (i: number) => boolean): number {
  let best = -1;
  let bestD = Infinity;
  defenders.forEach((d, i) => {
    if (!ok(i)) return;
    const dist = Math.abs(d.dx - dx);
    if (dist < bestD) {
      bestD = dist;
      best = i;
    }
  });
  return best;
}

export const DEFENSE_INK = "#9e3428";
export const ZONE_FILL = "#e8f3fb";
export const ZONE_STROKE = "#1c567f";

export const describeDefense = (front: Front, coverage: Coverage, show: boolean) =>
  `${front} ${coverage}${!show ? "" : coverage === "Man" ? " with man coverage lines shown" : coverage === "Cover 1" ? " with zone drops and man lines shown" : " with zone drops shown"}`;

/** Scene nodes for a laid-out defense around the ball at `ball`, all in one group. */
export function defenseNodes(layout: DefenseLayout, ball: Point, show: boolean, z: number): SceneNode[] {
  const group = uid("grp");
  const at = (dx: number, dy: number): Point => ({ x: ball.x + dx, y: ball.y + dy });
  const nodes: SceneNode[] = [];
  if (show) {
    for (const zone of layout.zones) {
      const c = at(zone.dx, zone.dy);
      nodes.push({
        ...makeShape("ellipse", c, zone.rx * 2, zone.ry * 2, ZONE_STROKE, 0),
        name: "Coverage zone",
        fill: ZONE_FILL,
        fillOpacity: 0.85,
        width: 1.6,
        dash: "dashed",
      });
    }
    for (const line of layout.lines) {
      const d = layout.defenders[line.from];
      const from = at(d.dx, d.dy);
      const to = at(line.to.dx, line.to.dy);
      const pts = [{ x: 0, y: 0 }, { x: to.x - from.x, y: to.y - from.y }];
      const path =
        line.kind === "rush"
          ? { ...makePath("line", from, pts, DEFENSE_INK, 2, 0), name: `${d.label} rush`, endCap: "none" as const }
          : {
              ...makePath("dashed", from, pts, ZONE_STROKE, 2, 0),
              name: line.kind === "man" ? `${d.label} man` : `${d.label} drop`,
              endCap: line.kind === "man" ? ("arrow" as const) : ("dot" as const),
            };
      nodes.push(path);
    }
  }
  for (const d of layout.defenders) {
    const p = at(d.dx, d.dy);
    nodes.push({
      ...makePlayer(
        { code: d.label, label: d.label, title: `Defender ${d.label}`, hint: "", shape: "circle", fill: "transparent", stroke: DEFENSE_INK, textColor: DEFENSE_INK, side: "defense" },
        p.x,
        p.y,
      ),
      size: 30,
      outlineStyle: "none",
    });
  }
  return nodes.map((n, i) => ({ ...n, groupId: group, z: z + i }));
}

/** 5-on-5 flag looks for the Opponent front: one rusher and four in coverage. */
export const FLAG_LOOKS = ["1 rush · Cover 2", "1 rush · Cover 3", "1 rush · Man"] as const;
export type FlagLook = (typeof FLAG_LOOKS)[number];

/**
 * A 5-on-5 flag defense around the ball. The rusher lines up `rushUnits` off
 * the ball (the league's rush line), so the look is legal as drawn; man
 * defenders take the receivers outside-in.
 */
export function layoutFlagDefense(look: FlagLook, rushUnits: number, receivers: { dx: number; dy: number }[] = []): DefenseLayout {
  const rush = Math.max(30, rushUnits);
  const defenders: Defender[] = [{ dx: 0, dy: -rush, label: "R", job: "rush" }];
  const zones: Zone[] = [];
  const lines: Line[] = [{ from: 0, to: { dx: 0, dy: 26 }, kind: "rush" }];
  const add = (dx: number, dy: number, label: string, zone?: Zone) => {
    defenders.push({ dx, dy, label, job: zone ? "zone" : "man" });
    if (zone) {
      zones.push(zone);
      lines.push({ from: defenders.length - 1, to: { dx: zone.dx, dy: zone.dy }, kind: "drop" });
    }
  };
  if (look === "1 rush · Cover 2") {
    add(-300, -60, "C", z(-320, -110, 110, 36));
    add(300, -60, "C", z(320, -110, 110, 36));
    add(-170, -200, "S", z(-200, -260, 200, 52));
    add(170, -200, "S", z(200, -260, 200, 52));
  } else if (look === "1 rush · Cover 3") {
    add(-300, -90, "C", z(-320, -250, 130, 48));
    add(300, -90, "C", z(320, -250, 130, 48));
    add(0, -200, "S", z(0, -270, 130, 48));
    add(0, -110 - Math.min(40, rush / 4), "M", z(0, -130, 150, 38));
  } else {
    const spots: [number, number, string][] = [[-300, -40, "C"], [300, -40, "C"], [-120, -110, "S"], [120, -110, "S"]];
    spots.forEach(([dx, dy, label]) => add(dx, dy, label));
    const order = [...receivers].sort((a, b) => Math.abs(b.dx) - Math.abs(a.dx));
    const left = new Set([1, 2, 3, 4]);
    for (const r of order) {
      const i = nearest(defenders, r.dx, (j) => left.has(j));
      if (i < 0) break;
      left.delete(i);
      lines.push({ from: i, to: r, kind: "man" });
    }
  }
  return { defenders, zones, lines };
}
