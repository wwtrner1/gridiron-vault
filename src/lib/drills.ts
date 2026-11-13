import { uid } from "./types";

/**
 * The Drill Vault: practice drills with a diagram that animates, the setup,
 * the steps, the coaching points and a link to film. The built-in drills are
 * written for GridIronVault (originals, drawn in our own style); a coach adds
 * his own beside them, kept in this browser like the practice script.
 *
 * A diagram works in yards on a small patch of field: x across, y down the
 * page (the top of the drawing is downfield). Spots are players, coaches,
 * cones, bags and balls; moves take one spot along a path at a time on the
 * drill's clock, so the same data draws the still picture, the print and the
 * animation.
 */

export type SpotKind = "off" | "def" | "coach" | "cone" | "ball" | "bag";
export type Spot = { id: string; kind: SpotKind; x: number; y: number; label?: string };
export type MoveStyle = "run" | "back" | "throw" | "block" | "shuffle";
export type Move = {
  /** The spot that moves. */
  who: string;
  /** Points after the spot's current position, in yards. */
  path: [number, number][];
  style: MoveStyle;
  label?: string;
  /** Seconds on the drill's clock. */
  at: number;
  dur: number;
};
/** A line drawn on the diagram that nothing runs (an option, a throwing lane). */
export type Guide = { from: [number, number]; path: [number, number][]; style: MoveStyle; label?: string };
export type DrillDiagram = { w: number; h: number; spots: Spot[]; moves: Move[]; guides?: Guide[] };

export const DRILL_CATEGORIES = [
  "Defensive backs",
  "Linebackers",
  "Line",
  "Receivers",
  "Quarterbacks",
  "Running backs",
  "Flag football",
  "Team & conditioning",
] as const;
export type DrillCategory = (typeof DRILL_CATEGORIES)[number];

export type DrillSide = "offense" | "defense" | "both";

export type Drill = {
  id: string;
  name: string;
  category: DrillCategory;
  side: DrillSide;
  minutes: number;
  /** "4+" or "2 lines" — free words, shown as written. */
  players: string;
  equipment: string[];
  setup: string;
  steps: string[];
  points: string[];
  /** A film link (YouTube, Hudl or any https page). */
  video?: string;
  /** A Vault play drawn as this drill's diagram (coach drills). */
  playId?: string;
  diagram?: DrillDiagram;
  /** True for a coach's own drill; built-in drills can't be edited, only copied. */
  custom?: boolean;
  updatedAt?: string;
};

export const DRILL_LIMITS = { name: 60, text: 600, step: 200, steps: 10, points: 6, equipment: 8, custom: 200 };

/** A YouTube search for the drill, so a coach always lands on film without us pinning a video that can vanish. */
export const filmSearch = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`football ${q} drill`)}`;

// ---- Diagram helpers ------------------------------------------------------

const mirrorX = (d: DrillDiagram, suffix: string): DrillDiagram => ({
  w: d.w,
  h: d.h,
  spots: d.spots.map((s) => ({ ...s, id: s.id + suffix, x: d.w - s.x })),
  moves: d.moves.map((m) => ({ ...m, who: m.who + suffix, path: m.path.map(([x, y]) => [d.w - x, y] as [number, number]) })),
  guides: (d.guides ?? []).map((g) => ({ ...g, from: [d.w - g.from[0], g.from[1]], path: g.path.map(([x, y]) => [d.w - x, y] as [number, number]) })),
});

const join = (a: DrillDiagram, b: DrillDiagram): DrillDiagram => ({
  w: a.w,
  h: a.h,
  spots: [...a.spots, ...b.spots],
  moves: [...a.moves, ...b.moves],
  guides: [...(a.guides ?? []), ...(b.guides ?? [])],
});

const cone = (id: string, x: number, y: number, label?: string): Spot => ({ id, kind: "cone", x, y, label });

// One Backpedal Breaks station; the drill runs it on both sides of the field.
const backpedalStation: DrillDiagram = {
  w: 30,
  h: 20,
  spots: [
    cone("c45", 3, 15, "45°"),
    cone("c90", 3, 9.5, "90°"),
    cone("cop", 3, 3.5, "OPEN"),
    cone("cst", 10, 15.8),
    { id: "d", kind: "def", x: 10, y: 14.4, label: "DEF" },
    { id: "c", kind: "coach", x: 9.5, y: 19, label: "C" },
    { id: "b", kind: "ball", x: 8, y: 17.6 },
  ],
  moves: [
    { who: "d", path: [[10, 9.5]], style: "back", label: "BACKPEDAL", at: 0, dur: 1.8 },
    { who: "d", path: [[4.2, 9.5]], style: "run", label: "SPRINT", at: 1.9, dur: 1.2 },
    { who: "b", path: [[4.4, 9.2]], style: "throw", at: 2.5, dur: 0.8 },
  ],
  guides: [
    { from: [10, 9.5], path: [[4, 14.4]], style: "run", label: "SPRINT" },
    { from: [10, 9.5], path: [[4, 4.6]], style: "run", label: "SPRINT" },
  ],
};
const backpedalRight = mirrorX(
  {
    ...backpedalStation,
    moves: [
      { who: "d", path: [[10, 9.5]], style: "back", label: "BACKPEDAL", at: 0.4, dur: 1.8 },
      { who: "d", path: [[4.2, 4.6]], style: "run", label: "SPRINT", at: 2.3, dur: 1.2 },
      { who: "b", path: [[4.4, 4.3]], style: "throw", at: 2.9, dur: 0.8 },
    ],
    guides: [
      { from: [10, 9.5], path: [[4, 14.4]], style: "run", label: "SPRINT" },
      { from: [10, 9.5], path: [[4, 9.5]], style: "run", label: "SPRINT" },
    ],
  },
  "r",
);

// ---- The built-in drills --------------------------------------------------

export const SEED_DRILLS: Drill[] = [
  {
    id: "drill-trail-technique",
    name: "Trail Technique",
    category: "Defensive backs",
    side: "defense",
    minutes: 8,
    players: "1 line, 2 at a time",
    equipment: ["4 cones", "2 balls"],
    setup: "One line. The defender starts a yard off the receiver's hip at the start cone; three cones sit 10 yards downfield, one in the middle and one each side. The coach stands behind the line with a ball.",
    steps: [
      "The receiver jogs at the middle cone with a stutter every few steps.",
      "The defender trails at arm's length, eyes on the receiver's hips.",
      "At the middle cone the receiver breaks left or right.",
      "The defender reacts, drives on the break and plays the coach's throw.",
      "Defender goes to receiver, receiver to the end of the line.",
    ],
    points: ["Stay an arm's length off the hip, never even with him.", "Don't bite on the stutter: read the hips, not the head.", "Break up the pass through the receiver's hands."],
    video: filmSearch("DB trail technique"),
    diagram: {
      w: 24,
      h: 20,
      spots: [
        cone("l", 6, 2),
        cone("m", 12, 2),
        cone("r", 18, 2),
        cone("s", 10.4, 15),
        { id: "wr", kind: "off", x: 12, y: 13.2, label: "WR" },
        { id: "d", kind: "def", x: 12.2, y: 15.2, label: "DEF" },
        { id: "c", kind: "coach", x: 12, y: 19, label: "C" },
        { id: "b", kind: "ball", x: 13.3, y: 18.4 },
      ],
      moves: [
        { who: "wr", path: [[12, 4]], style: "run", label: "STUTTER", at: 0, dur: 2.2 },
        { who: "d", path: [[12.3, 6.2]], style: "back", at: 0.2, dur: 2.2 },
        { who: "wr", path: [[17.6, 3.6]], style: "run", at: 2.3, dur: 1 },
        { who: "d", path: [[16.6, 4.2]], style: "run", label: "REACT", at: 2.45, dur: 1 },
        { who: "b", path: [[17.4, 3.8]], style: "throw", at: 2.7, dur: 0.85 },
      ],
      guides: [
        { from: [12, 4], path: [[6.4, 3.6]], style: "run" },
        { from: [12, 19], path: [[6, 4.2]], style: "throw" },
      ],
    },
  },
  {
    id: "drill-backpedal-breaks",
    name: "Backpedal Breaks",
    category: "Defensive backs",
    side: "defense",
    minutes: 8,
    players: "2 lines, switch after each rep",
    equipment: ["8 cones", "2 balls"],
    setup: "Two stations, one each side. Each has a start cone and three break cones: 45°, 90° and open (deep, over the shoulder).",
    steps: [
      "The coach points back and the player backpedals.",
      "On the coach's next point the player plants, breaks and sprints to that cone.",
      "The coach tosses the ball to the break; the player catches it at its highest point.",
      "Switch lines after every rep so both sides get both breaks.",
    ],
    points: ["Pedal low with weight over the toes.", "Plant on the foot away from the break; no false steps.", "Eyes snap to the ball after the break."],
    video: filmSearch("backpedal break DB"),
    diagram: join(backpedalStation, backpedalRight),
  },
  {
    id: "drill-w-drill",
    name: "W Drill",
    category: "Defensive backs",
    side: "defense",
    minutes: 6,
    players: "1 line",
    equipment: ["5 cones"],
    setup: "Five cones in a W, five yards apart across and five deep.",
    steps: [
      "Backpedal from the first cone to the second.",
      "Plant and drive forward at 45° to the third.",
      "Backpedal again to the fourth, drive to the fifth.",
      "Next player goes when the one ahead reaches the second cone.",
    ],
    points: ["Same pedal height start to finish.", "Plant foot under the hip, not out wide.", "Drive out of the break; no rounding."],
    video: filmSearch("W drill defensive back"),
    diagram: {
      w: 26,
      h: 14,
      spots: [cone("1", 3, 11), cone("2", 8, 4), cone("3", 13, 11), cone("4", 18, 4), cone("5", 23, 11), { id: "d", kind: "def", x: 3, y: 12.5, label: "DB" }],
      moves: [
        { who: "d", path: [[8, 4.5]], style: "back", label: "PEDAL", at: 0, dur: 1.4 },
        { who: "d", path: [[13, 10.5]], style: "run", label: "DRIVE", at: 1.5, dur: 0.9 },
        { who: "d", path: [[18, 4.5]], style: "back", label: "PEDAL", at: 2.5, dur: 1.4 },
        { who: "d", path: [[23, 10.5]], style: "run", label: "DRIVE", at: 4, dur: 0.9 },
      ],
    },
  },
  {
    id: "drill-wave",
    name: "Wave Drill",
    category: "Defensive backs",
    side: "defense",
    minutes: 5,
    players: "3 or 4 across",
    equipment: ["1 ball"],
    setup: "Players stand five yards apart facing the coach, ten yards away with a ball.",
    steps: [
      "The coach points the ball back: everyone backpedals.",
      "The ball points left or right: everyone turns and runs that way at 45°.",
      "The ball comes forward: everyone drives down hard.",
      "The coach finishes with a throw to one player.",
    ],
    points: ["React to the ball, not the voice.", "Open the hips; never cross the feet.", "Finish every rep at full speed."],
    video: filmSearch("wave drill defensive back"),
    diagram: {
      w: 26,
      h: 18,
      spots: [
        { id: "a", kind: "def", x: 7, y: 7, label: "DB" },
        { id: "b2", kind: "def", x: 13, y: 7, label: "DB" },
        { id: "c2", kind: "def", x: 19, y: 7, label: "DB" },
        { id: "c", kind: "coach", x: 13, y: 16.5, label: "C" },
        { id: "ball", kind: "ball", x: 14.3, y: 15.6 },
      ],
      moves: [
        { who: "a", path: [[7, 4]], style: "back", at: 0, dur: 1 },
        { who: "b2", path: [[13, 4]], style: "back", at: 0, dur: 1 },
        { who: "c2", path: [[19, 4]], style: "back", at: 0, dur: 1 },
        { who: "a", path: [[3.5, 1.5]], style: "run", label: "WAVE", at: 1.1, dur: 0.9 },
        { who: "b2", path: [[9.5, 1.5]], style: "run", at: 1.1, dur: 0.9 },
        { who: "c2", path: [[15.5, 1.5]], style: "run", at: 1.1, dur: 0.9 },
        { who: "b2", path: [[9.5, 8]], style: "run", label: "DRIVE", at: 2.1, dur: 1 },
        { who: "ball", path: [[9.8, 8.4]], style: "throw", at: 2.5, dur: 0.7 },
      ],
    },
  },
  {
    id: "drill-tip",
    name: "Tip Drill",
    category: "Defensive backs",
    side: "defense",
    minutes: 5,
    players: "Groups of 3",
    equipment: ["1 ball"],
    setup: "Three players in a line, five yards apart, facing the coach.",
    steps: [
      "The coach throws high to the first player, who tips it up and back.",
      "The second player tips it again or catches it.",
      "The third player secures the catch and returns it to the coach.",
      "Rotate front to back.",
    ],
    points: ["Hands high, thumbs together on a high ball.", "Tip it up, not forward.", "Every player finishes to the ball as if it's live."],
    video: filmSearch("tip drill interception"),
    diagram: {
      w: 22,
      h: 18,
      spots: [
        { id: "a", kind: "def", x: 11, y: 12, label: "1" },
        { id: "b2", kind: "def", x: 11, y: 8, label: "2" },
        { id: "c2", kind: "def", x: 11, y: 4, label: "3" },
        { id: "c", kind: "coach", x: 11, y: 17, label: "C" },
        { id: "ball", kind: "ball", x: 12.4, y: 16.2 },
      ],
      moves: [
        { who: "ball", path: [[11.4, 12.4]], style: "throw", at: 0, dur: 0.7 },
        { who: "ball", path: [[11.4, 8.4]], style: "throw", label: "TIP", at: 0.8, dur: 0.6 },
        { who: "ball", path: [[11.4, 4.4]], style: "throw", label: "TIP", at: 1.5, dur: 0.6 },
      ],
    },
  },
  {
    id: "drill-mirror",
    name: "Mirror Drill",
    category: "Linebackers",
    side: "defense",
    minutes: 5,
    players: "Pairs",
    equipment: ["4 cones"],
    setup: "Two cones five yards apart on each side of a line. The ball carrier works between his cones; the linebacker faces him between the other two.",
    steps: [
      "The ball carrier shuffles and cuts between his cones.",
      "The linebacker shuffles to stay square to him, never crossing his feet.",
      "On the whistle the ball carrier goes downhill; the linebacker fits and wraps (thud in flag).",
    ],
    points: ["Shoulders square to the line.", "Inside-out: stay a half step behind his near hip.", "Short choppy steps when he plants."],
    video: filmSearch("linebacker mirror"),
    diagram: {
      w: 22,
      h: 16,
      spots: [
        cone("a", 6, 5),
        cone("b2", 16, 5),
        cone("c2", 6, 11),
        cone("d2", 16, 11),
        { id: "rb", kind: "off", x: 11, y: 4, label: "BC" },
        { id: "lb", kind: "def", x: 11, y: 12, label: "LB" },
      ],
      moves: [
        { who: "rb", path: [[14.5, 4]], style: "shuffle", label: "SHUFFLE", at: 0, dur: 1 },
        { who: "lb", path: [[14.5, 12]], style: "shuffle", label: "MIRROR", at: 0.1, dur: 1 },
        { who: "rb", path: [[8, 4]], style: "shuffle", at: 1.1, dur: 1.2 },
        { who: "lb", path: [[8, 12]], style: "shuffle", at: 1.2, dur: 1.2 },
        { who: "rb", path: [[8.5, 8]], style: "run", at: 2.5, dur: 0.7 },
        { who: "lb", path: [[8.5, 9.2]], style: "run", label: "FIT", at: 2.6, dur: 0.6 },
      ],
    },
  },
  {
    id: "drill-shuffle-fill",
    name: "Shuffle and Fill",
    category: "Linebackers",
    side: "defense",
    minutes: 6,
    players: "1 line",
    equipment: ["4 bags or cones"],
    setup: "Bags lie a yard apart as gaps. The linebacker starts five yards off them; the coach stands behind the bags.",
    steps: [
      "The coach steps to a gap and shows the ball.",
      "The linebacker shuffles over the bags' line, shoulders square.",
      "When the coach points, he fills that gap and breaks down.",
    ],
    points: ["Eyes on the ball, then the gap.", "Downhill fill, not around the bag.", "Break down with the feet under you."],
    video: filmSearch("linebacker scrape fill bag"),
    diagram: {
      w: 22,
      h: 14,
      spots: [
        { id: "g1", kind: "bag", x: 6, y: 6 },
        { id: "g2", kind: "bag", x: 9.5, y: 6 },
        { id: "g3", kind: "bag", x: 13, y: 6 },
        { id: "g4", kind: "bag", x: 16.5, y: 6 },
        { id: "lb", kind: "def", x: 6, y: 11, label: "LB" },
        { id: "c", kind: "coach", x: 13, y: 2, label: "C" },
      ],
      moves: [
        { who: "lb", path: [[14.75, 11]], style: "shuffle", label: "SHUFFLE", at: 0, dur: 1.6 },
        { who: "lb", path: [[14.75, 6.6]], style: "run", label: "FILL", at: 1.7, dur: 0.7 },
      ],
    },
  },
  {
    id: "drill-get-off",
    name: "Get-Off",
    category: "Line",
    side: "both",
    minutes: 5,
    players: "Linemen in a row",
    equipment: ["1 ball on a stick or a ball"],
    setup: "Linemen in their stance across a line. The coach holds a ball where the center would snap it.",
    steps: [
      "The coach moves the ball; every lineman fires out on the movement.",
      "Three hard steps, then sprint five yards.",
      "Anyone who moves before the ball goes again.",
    ],
    points: ["Move on the ball, never the voice.", "First step short and flat.", "Pad level low out of the stance."],
    video: filmSearch("defensive line get off ball movement"),
    diagram: {
      w: 24,
      h: 14,
      spots: [
        { id: "a", kind: "def", x: 6, y: 10, label: "DL" },
        { id: "b2", kind: "def", x: 10, y: 10, label: "DL" },
        { id: "c2", kind: "def", x: 14, y: 10, label: "DL" },
        { id: "d2", kind: "def", x: 18, y: 10, label: "DL" },
        { id: "ball", kind: "ball", x: 12, y: 12.4 },
        { id: "c", kind: "coach", x: 12, y: 13.4, label: "C" },
      ],
      moves: [
        { who: "a", path: [[6, 3]], style: "run", label: "FIRE", at: 0.3, dur: 1 },
        { who: "b2", path: [[10, 3]], style: "run", at: 0.3, dur: 1 },
        { who: "c2", path: [[14, 3]], style: "run", at: 0.3, dur: 1 },
        { who: "d2", path: [[18, 3]], style: "run", at: 0.3, dur: 1 },
      ],
    },
  },
  {
    id: "drill-kick-slide",
    name: "Kick-Slide Mirror",
    category: "Line",
    side: "offense",
    minutes: 6,
    players: "Pairs",
    equipment: ["2 cones"],
    setup: "An offensive lineman in a pass set faces a rusher two yards away between two cones.",
    steps: [
      "The rusher works up the field at the cone at half speed.",
      "The blocker kick-slides to stay between the rusher and the quarterback's spot.",
      "On the coach's call the rusher tries an inside move; the blocker punches and anchors.",
    ],
    points: ["Kick with the outside foot, slide with the inside; never cross.", "Hands inside, thumbs up.", "Keep the near hip square to the rusher."],
    video: filmSearch("offensive line kick slide pass set"),
    diagram: {
      w: 20,
      h: 14,
      spots: [cone("a", 15, 3), cone("b2", 6, 3), { id: "ol", kind: "off", x: 10, y: 9, label: "OL" }, { id: "dl", kind: "def", x: 10.5, y: 6.6, label: "R" }, { id: "q", kind: "coach", x: 9, y: 13, label: "Q" }],
      moves: [
        { who: "dl", path: [[14, 5]], style: "run", label: "RUSH", at: 0, dur: 1 },
        { who: "ol", path: [[12.5, 10]], style: "shuffle", label: "KICK", at: 0.1, dur: 1 },
        { who: "dl", path: [[11.5, 8]], style: "run", label: "INSIDE", at: 1.2, dur: 0.6 },
        { who: "ol", path: [[11.6, 9.8]], style: "block", at: 1.25, dur: 0.5 },
      ],
    },
  },
  {
    id: "drill-gauntlet",
    name: "Gauntlet",
    category: "Receivers",
    side: "offense",
    minutes: 6,
    players: "1 line, 4 passers",
    equipment: ["4 balls"],
    setup: "Two passers on each side of a line, three yards off it and five yards apart.",
    steps: [
      "The receiver runs straight down the line at three-quarter speed.",
      "Each passer throws in turn; the receiver catches with his hands, tosses the ball back and turns to the next.",
      "Finish the line and tuck the last ball.",
    ],
    points: ["Hands out to meet the ball; no body catches.", "Eyes snap back to the next passer.", "Keep the feet running through every catch."],
    video: filmSearch("receiver gauntlet"),
    diagram: {
      w: 22,
      h: 22,
      spots: [
        { id: "wr", kind: "off", x: 11, y: 20, label: "WR" },
        { id: "p1", kind: "coach", x: 6, y: 15, label: "P" },
        { id: "p2", kind: "coach", x: 16, y: 11, label: "P" },
        { id: "p3", kind: "coach", x: 6, y: 7, label: "P" },
        { id: "p4", kind: "coach", x: 16, y: 3, label: "P" },
        { id: "b1", kind: "ball", x: 7, y: 14.6 },
        { id: "b2", kind: "ball", x: 15, y: 10.6 },
        { id: "b3", kind: "ball", x: 7, y: 6.6 },
        { id: "b4", kind: "ball", x: 15, y: 2.6 },
      ],
      moves: [
        { who: "wr", path: [[11, 1]], style: "run", at: 0, dur: 4 },
        { who: "b1", path: [[10.6, 15]], style: "throw", at: 0.6, dur: 0.6 },
        { who: "b2", path: [[11.4, 11]], style: "throw", at: 1.45, dur: 0.6 },
        { who: "b3", path: [[10.6, 7]], style: "throw", at: 2.3, dur: 0.6 },
        { who: "b4", path: [[11.4, 3]], style: "throw", at: 3.15, dur: 0.6 },
      ],
    },
  },
  {
    id: "drill-stem-break",
    name: "Stem and Break",
    category: "Receivers",
    side: "offense",
    minutes: 8,
    players: "1 line",
    equipment: ["3 cones", "Balls"],
    setup: "A start cone, a break cone at the route's depth and a target cone where the ball is thrown.",
    steps: [
      "Release and stem at the defender's outside shoulder.",
      "Sell vertical for three hard steps at the break cone.",
      "Sink the hips and break to the target cone; the quarterback throws on the break.",
    ],
    points: ["Same speed into every break so the defender can't read it.", "Head and eyes stay up the field until the break.", "Snap the head around on the break, hands ready."],
    video: filmSearch("wide receiver route break stem"),
    diagram: {
      w: 24,
      h: 18,
      spots: [cone("s", 8, 15), cone("bk", 8, 6), cone("t", 16, 6), { id: "wr", kind: "off", x: 8, y: 15.8, label: "WR" }, { id: "q", kind: "coach", x: 14, y: 17, label: "QB" }, { id: "b", kind: "ball", x: 14.8, y: 16.3 }],
      moves: [
        { who: "wr", path: [[8, 7]], style: "run", label: "STEM", at: 0, dur: 1.4 },
        { who: "wr", path: [[15.3, 7]], style: "run", label: "BREAK", at: 1.5, dur: 0.9 },
        { who: "b", path: [[15.2, 7.3]], style: "throw", at: 1.6, dur: 0.8 },
      ],
    },
  },
  {
    id: "drill-release",
    name: "Release vs. Press",
    category: "Receivers",
    side: "both",
    minutes: 8,
    players: "Pairs: WR and DB",
    equipment: ["2 cones"],
    setup: "A receiver on the line with a defender in press, head up. Two cones five yards downfield mark a two-yard window each side.",
    steps: [
      "The receiver uses a footwork set (jab, hesitation or speed release).",
      "He clears the defender's hands and gets back on his stem through a window.",
      "The defender works to jam and ride him to the sideline. Swap after each rep.",
    ],
    points: ["WR: win with the feet first, then the hands.", "WR: get back on top of the defender within five yards.", "DB: patient feet, punch with the off hand."],
    video: filmSearch("receiver release press"),
    diagram: {
      w: 20,
      h: 16,
      spots: [cone("a", 7, 8), cone("b2", 13, 8), { id: "wr", kind: "off", x: 10, y: 13, label: "WR" }, { id: "db", kind: "def", x: 10, y: 11.4, label: "DB" }],
      moves: [
        { who: "wr", path: [[8.8, 12.6]], style: "run", label: "JAB", at: 0, dur: 0.4 },
        { who: "db", path: [[9.2, 11.2]], style: "shuffle", at: 0.1, dur: 0.4 },
        { who: "wr", path: [[12, 10.5], [12, 4]], style: "run", label: "RELEASE", at: 0.6, dur: 1.4 },
        { who: "db", path: [[11, 9]], style: "run", at: 0.75, dur: 0.9 },
      ],
    },
  },
  {
    id: "drill-three-step",
    name: "Three-Step and Throw",
    category: "Quarterbacks",
    side: "offense",
    minutes: 8,
    players: "QB + 2 targets",
    equipment: ["Balls", "2 cones"],
    setup: "The quarterback under center or in the gun, a target at a hitch spot each side, five yards deep.",
    steps: [
      "The coach calls the side as the quarterback takes the snap.",
      "Three-step drop: the third step plants and the ball comes out.",
      "Alternate sides; finish with five throws off a five-step drop.",
    ],
    points: ["The plant foot stops the drop; no drifting.", "Front shoulder points at the target.", "Follow through to the opposite hip pocket."],
    video: filmSearch("quarterback three step drop"),
    diagram: {
      w: 26,
      h: 16,
      spots: [cone("l", 5, 6), cone("r", 21, 6), { id: "q", kind: "off", x: 13, y: 9, label: "QB" }, { id: "b", kind: "ball", x: 13.6, y: 9.4 }, { id: "t", kind: "off", x: 21, y: 5, label: "WR" }, { id: "t2", kind: "off", x: 5, y: 5, label: "WR" }],
      moves: [
        { who: "q", path: [[13, 12]], style: "back", label: "3 STEPS", at: 0, dur: 1 },
        { who: "b", path: [[13.6, 12.4]], style: "run", at: 0, dur: 1 },
        { who: "b", path: [[20.4, 5.4]], style: "throw", at: 1.15, dur: 0.8 },
      ],
    },
  },
  {
    id: "drill-pocket-climb",
    name: "Pocket Climb",
    category: "Quarterbacks",
    side: "offense",
    minutes: 6,
    players: "QB + coach",
    equipment: ["4 cones or bags", "Balls"],
    setup: "Cones mark the tackles' spots. The coach stands behind the quarterback with a pad or bag.",
    steps: [
      "The quarterback drops and sets.",
      "The coach pushes a bag at one edge; the quarterback steps up into the pocket, ball high.",
      "Reset the feet and throw to a target down the middle.",
    ],
    points: ["Climb, don't bail: two short steps up.", "Two hands on the ball while moving.", "Eyes stay downfield the whole time."],
    video: filmSearch("quarterback step up pocket"),
    diagram: {
      w: 22,
      h: 18,
      spots: [{ id: "lt", kind: "bag", x: 6, y: 9 }, { id: "rt", kind: "bag", x: 16, y: 9 }, { id: "q", kind: "off", x: 11, y: 13, label: "QB" }, { id: "c", kind: "coach", x: 16.5, y: 15, label: "C" }, { id: "b", kind: "ball", x: 11.6, y: 13.4 }, { id: "t", kind: "off", x: 11, y: 2, label: "WR" }],
      moves: [
        { who: "c", path: [[13.5, 13.5]], style: "run", label: "PRESSURE", at: 0, dur: 0.9 },
        { who: "q", path: [[11, 10.5]], style: "run", label: "CLIMB", at: 0.5, dur: 0.7 },
        { who: "b", path: [[11.6, 10.9]], style: "run", at: 0.5, dur: 0.7 },
        { who: "b", path: [[11.4, 2.6]], style: "throw", at: 1.4, dur: 0.9 },
      ],
    },
  },
  {
    id: "drill-mesh-handoff",
    name: "Handoff Mesh Line",
    category: "Running backs",
    side: "offense",
    minutes: 6,
    players: "QB + line of backs",
    equipment: ["Balls", "2 cones"],
    setup: "Backs in a line seven yards deep, the quarterback at the mesh spot with a cone each side for the aiming point.",
    steps: [
      "The quarterback opens and presents the ball at the back's belt.",
      "The back takes it with the pocket (inside elbow up), squeezes and runs through the cone.",
      "Alternate sides every rep; go to the back of the line.",
    ],
    points: ["Back: eyes on the line, not the ball.", "QB: put it in the pocket and carry out the fake.", "Squeeze with both hands through the line."],
    video: filmSearch("running back handoff mesh"),
    diagram: {
      w: 22,
      h: 18,
      spots: [cone("a", 15, 6), cone("b2", 7, 6), { id: "q", kind: "off", x: 11, y: 9.5, label: "QB" }, { id: "b", kind: "ball", x: 11.7, y: 9.8 }, { id: "rb", kind: "off", x: 11, y: 15.5, label: "RB" }],
      moves: [
        { who: "q", path: [[12, 11]], style: "run", at: 0, dur: 0.6 },
        { who: "b", path: [[12.5, 11.5]], style: "run", at: 0, dur: 0.6 },
        { who: "rb", path: [[12.8, 11.6], [15, 5.5]], style: "run", label: "MESH", at: 0.2, dur: 1.6 },
        { who: "b", path: [[15.4, 5.8]], style: "run", at: 0.9, dur: 0.9 },
        { who: "q", path: [[8, 13]], style: "run", label: "FAKE", at: 0.9, dur: 0.9 },
      ],
    },
  },
  {
    id: "drill-cone-cut",
    name: "Cone Cut",
    category: "Running backs",
    side: "offense",
    minutes: 6,
    players: "1 line",
    equipment: ["5 cones", "Balls"],
    setup: "Five cones in a zig-zag, five yards up and three across.",
    steps: [
      "Ball in the outside arm, run at the first cone.",
      "Plant on the outside foot and cut to the next cone; switch the ball to the new outside arm.",
      "Finish through the last cone with a burst.",
    ],
    points: ["Lower the hips before the cut.", "Ball high and tight: five points of pressure.", "Accelerate out of every cut."],
    video: filmSearch("running back cone cut ball security"),
    diagram: {
      w: 20,
      h: 26,
      spots: [cone("1", 10, 21), cone("2", 13, 16), cone("3", 7, 11), cone("4", 13, 6), cone("5", 10, 1.5), { id: "rb", kind: "off", x: 10, y: 24, label: "RB" }],
      moves: [{ who: "rb", path: [[10, 21.6], [12.4, 16.2], [7.6, 11], [12.4, 6], [10, 2]], style: "run", label: "CUT", at: 0, dur: 4 }],
    },
  },
  {
    id: "drill-flag-pull-box",
    name: "Flag Pull Box",
    category: "Flag football",
    side: "both",
    minutes: 6,
    players: "Pairs",
    equipment: ["4 cones", "Flag belts"],
    setup: "A five-yard box. The ball carrier starts on one side, the defender on the other.",
    steps: [
      "On the whistle the ball carrier tries to cross the defender's line.",
      "The defender breaks down, mirrors and pulls a flag.",
      "Swap roles; three reps each.",
    ],
    points: ["Defender: eyes on the hips, where the flags are.", "Break down two yards away; don't lunge.", "Rip the flag and hold it up."],
    video: filmSearch("flag football flag pulling"),
    diagram: {
      w: 18,
      h: 16,
      spots: [cone("a", 4, 3), cone("b2", 14, 3), cone("c2", 4, 13), cone("d2", 14, 13), { id: "bc", kind: "off", x: 9, y: 12, label: "BC" }, { id: "d", kind: "def", x: 9, y: 4, label: "D" }],
      moves: [
        { who: "bc", path: [[7, 9], [11.5, 5]], style: "run", label: "JUKE", at: 0, dur: 1.6 },
        { who: "d", path: [[9, 6], [11, 6]], style: "shuffle", label: "BREAK DOWN", at: 0.2, dur: 1.3 },
      ],
    },
  },
  {
    id: "drill-sharks-minnows",
    name: "Sharks and Minnows",
    category: "Flag football",
    side: "both",
    minutes: 8,
    players: "Whole team",
    equipment: ["Cones", "Flag belts", "Balls"],
    setup: "A 20 by 15 yard grid. Two or three sharks in the middle; everyone else is a minnow with a ball on one end line.",
    steps: [
      "On \"go\" the minnows run to the far end line without losing a flag.",
      "A minnow who loses a flag becomes a shark.",
      "Play until one minnow is left.",
    ],
    points: ["Minnows: ball in the outside arm, use the whole grid.", "Sharks: work together and pin runners to the sideline.", "Great warm-up for flag pulling and open-field moves."],
    video: filmSearch("sharks and minnows flag football"),
    diagram: {
      w: 26,
      h: 20,
      spots: [
        cone("a", 3, 2), cone("b2", 23, 2), cone("c2", 3, 18), cone("d2", 23, 18),
        { id: "m1", kind: "off", x: 7, y: 17, label: "M" },
        { id: "m2", kind: "off", x: 13, y: 17, label: "M" },
        { id: "m3", kind: "off", x: 19, y: 17, label: "M" },
        { id: "s1", kind: "def", x: 10, y: 10, label: "S" },
        { id: "s2", kind: "def", x: 16, y: 9, label: "S" },
      ],
      moves: [
        { who: "m1", path: [[5, 10], [6, 3]], style: "run", at: 0, dur: 2 },
        { who: "m2", path: [[12, 11]], style: "run", at: 0, dur: 1.1 },
        { who: "m3", path: [[21, 9], [20, 3]], style: "run", at: 0, dur: 2 },
        { who: "s1", path: [[11.6, 11.2]], style: "run", label: "PULL", at: 0.4, dur: 0.8 },
        { who: "s2", path: [[19.5, 7]], style: "run", at: 0.4, dur: 1.2 },
      ],
    },
  },
  {
    id: "drill-rush-line",
    name: "Rush Line Contain",
    category: "Flag football",
    side: "defense",
    minutes: 6,
    players: "QB + rusher",
    equipment: ["Cones for the rush line", "Flag belts", "Balls"],
    setup: "Cones mark the league's rush line (usually seven yards). The rusher starts behind it; the quarterback sets up at the ball.",
    steps: [
      "On the snap the rusher sprints at the quarterback's outside shoulder.",
      "The quarterback rolls; the rusher keeps him inside and pulls the flag or forces a hurried throw.",
      "Count three seconds out loud; switch roles.",
    ],
    points: ["Start behind the rush line every time.", "Attack the throwing shoulder; take away the roll out.", "Hands up when he sets to throw."],
    video: filmSearch("flag football rusher"),
    diagram: {
      w: 22,
      h: 16,
      spots: [cone("a", 3, 4), cone("b2", 19, 4), { id: "r", kind: "def", x: 12, y: 3, label: "R" }, { id: "q", kind: "off", x: 11, y: 12, label: "QB" }, { id: "ball", kind: "ball", x: 11.6, y: 12.4 }],
      moves: [
        { who: "q", path: [[15, 13]], style: "run", label: "ROLL", at: 0.3, dur: 1.2 },
        { who: "ball", path: [[15.6, 13.4]], style: "run", at: 0.3, dur: 1.2 },
        { who: "r", path: [[14.5, 9], [15.4, 12]], style: "run", label: "CONTAIN", at: 0, dur: 1.5 },
      ],
      guides: [{ from: [3, 4], path: [[19, 4]], style: "back", label: "RUSH LINE" }],
    },
  },
  {
    id: "drill-pursuit",
    name: "Pursuit Angles",
    category: "Team & conditioning",
    side: "defense",
    minutes: 8,
    players: "All 11 (or all 5 in flag)",
    equipment: ["Cones", "1 ball"],
    setup: "The defense lines up in its base front. A ball carrier stands where the coach will toss to a sideline cone.",
    steps: [
      "On the snap the defense takes its first step, then the coach points to a sideline.",
      "Every defender takes his pursuit angle to the cone ahead of the ball carrier.",
      "Everyone finishes past the cone. Repeat to the other side.",
    ],
    points: ["Take the angle that meets him, not the one that chases him.", "Deepest players stay deepest: keep him in front.", "Sprint until the whistle, every rep."],
    video: filmSearch("defensive pursuit drill"),
    diagram: {
      w: 30,
      h: 20,
      spots: [
        cone("a", 27, 2),
        cone("b2", 27, 9),
        { id: "bc", kind: "off", x: 15, y: 17, label: "BC" },
        { id: "d1", kind: "def", x: 9, y: 14, label: "D" },
        { id: "d2", kind: "def", x: 15, y: 13, label: "D" },
        { id: "d3", kind: "def", x: 21, y: 14, label: "D" },
        { id: "d4", kind: "def", x: 15, y: 6, label: "D" },
      ],
      moves: [
        { who: "bc", path: [[26, 13], [27, 6]], style: "run", at: 0, dur: 2 },
        { who: "d3", path: [[26, 11]], style: "run", label: "ANGLE", at: 0.2, dur: 1.2 },
        { who: "d2", path: [[25, 7]], style: "run", at: 0.2, dur: 1.5 },
        { who: "d1", path: [[24, 4]], style: "run", at: 0.2, dur: 1.8 },
        { who: "d4", path: [[25.5, 2.5]], style: "run", at: 0.2, dur: 1.6 },
      ],
    },
  },
  {
    id: "drill-perfect-play",
    name: "Perfect Play Sprints",
    category: "Team & conditioning",
    side: "offense",
    minutes: 8,
    players: "Whole offense",
    equipment: ["1 ball"],
    setup: "The offense breaks the huddle, lines up and runs a called play on air, everyone sprinting 20 yards after the snap.",
    steps: [
      "The quarterback calls the play in the huddle.",
      "The offense lines up, snaps and runs the play at full speed.",
      "Everyone sprints to the 20-yard line; one mistake and the rep doesn't count.",
    ],
    points: ["Conditioning with the playbook, not without it.", "Perfect alignment and snap count every time.", "Coaches watch one position group each rep."],
    video: filmSearch("perfect play conditioning"),
    diagram: {
      w: 28,
      h: 22,
      spots: [
        { id: "x", kind: "off", x: 4, y: 18, label: "X" },
        { id: "c2", kind: "off", x: 14, y: 18, label: "C" },
        { id: "q", kind: "off", x: 14, y: 20.5, label: "Q" },
        { id: "y", kind: "off", x: 19, y: 18.5, label: "Y" },
        { id: "z", kind: "off", x: 24, y: 18, label: "Z" },
      ],
      moves: [
        { who: "x", path: [[4, 2]], style: "run", label: "SPRINT 20", at: 0, dur: 2.4 },
        { who: "c2", path: [[14, 2]], style: "run", at: 0, dur: 2.6 },
        { who: "q", path: [[14, 4]], style: "run", at: 0.3, dur: 2.4 },
        { who: "y", path: [[19, 2]], style: "run", at: 0, dur: 2.4 },
        { who: "z", path: [[24, 2]], style: "run", at: 0, dur: 2.4 },
      ],
    },
  },
];

// ---- The animation clock ---------------------------------------------------

/** Seconds the drill takes, plus a beat at the end before it loops. */
export function drillLength(d: DrillDiagram): number {
  return d.moves.reduce((n, m) => Math.max(n, m.at + m.dur), 0) + 0.8;
}

type Leg = { move: Move; from: [number, number]; pts: [number, number][]; len: number };

/** Each move with the point it starts from (where its runner stood after his last move). */
export function drillLegs(d: DrillDiagram): Leg[] {
  const at = new Map(d.spots.map((s) => [s.id, [s.x, s.y] as [number, number]]));
  return [...d.moves]
    .sort((a, b) => a.at - b.at)
    .map((move) => {
      const from = at.get(move.who) ?? move.path[0];
      const pts: [number, number][] = [from, ...move.path];
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      at.set(move.who, move.path[move.path.length - 1]);
      return { move, from, pts, len };
    });
}

/** A point part-way along a polyline. */
function along(pts: [number, number][], len: number, f: number): [number, number] {
  let left = Math.max(0, Math.min(1, f)) * len;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (left <= seg || i === pts.length - 1) {
      const k = seg ? Math.min(1, left / seg) : 1;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
    }
    left -= seg;
  }
  return pts[pts.length - 1];
}

/** Where every spot stands at second t. Before its first move a spot is where it was set. */
export function spotsAt(d: DrillDiagram, t: number, legs = drillLegs(d)): Map<string, [number, number]> {
  const out = new Map(d.spots.map((s) => [s.id, [s.x, s.y] as [number, number]]));
  for (const leg of legs) {
    const { at, dur, who } = leg.move;
    if (t < at) continue;
    out.set(who, along(leg.pts, leg.len, dur ? (t - at) / dur : 1));
  }
  return out;
}

// ---- The coach's own drills, kept in this browser ---------------------------

const KEY = "grid1ronvault.drills.v1";
type Saved = { custom: Drill[]; favorites: string[] };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, max: number, each: number) =>
  Array.isArray(v) ? v.map((x) => str(x, each)).filter(Boolean).slice(0, max) : [];

/** A safe film link: https only, or nothing. */
export function cleanVideo(v: unknown): string {
  const s = str(v, 400);
  if (!s) return "";
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
}

/** Checks one drill a coach wrote (or one read back from storage). */
export function cleanDrill(raw: unknown): Drill | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, DRILL_LIMITS.name);
  if (!name) return null;
  const category = DRILL_CATEGORIES.includes(r.category as DrillCategory) ? (r.category as DrillCategory) : "Team & conditioning";
  const side: DrillSide = r.side === "offense" || r.side === "defense" ? r.side : "both";
  const minutes = Math.max(1, Math.min(60, Math.round(Number(r.minutes) || 5)));
  const seed = SEED_DRILLS.find((s) => s.id === r.diagramFrom);
  const drill: Drill = {
    id: typeof r.id === "string" && r.id.startsWith("drl_") ? r.id : uid("drl"),
    name,
    category,
    side,
    minutes,
    players: str(r.players, 60),
    equipment: list(r.equipment, DRILL_LIMITS.equipment, 40),
    setup: str(r.setup, DRILL_LIMITS.text),
    steps: list(r.steps, DRILL_LIMITS.steps, DRILL_LIMITS.step),
    points: list(r.points, DRILL_LIMITS.points, DRILL_LIMITS.step),
    custom: true,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : new Date().toISOString(),
  };
  const video = cleanVideo(r.video);
  if (video) drill.video = video;
  if (typeof r.playId === "string" && r.playId) drill.playId = r.playId.slice(0, 80);
  const diagram = seed?.diagram ?? (isDiagram(r.diagram) ? (r.diagram as DrillDiagram) : undefined);
  if (diagram) drill.diagram = diagram;
  return drill;
}

function isDiagram(v: unknown): boolean {
  const d = v as DrillDiagram | null;
  return !!d && typeof d.w === "number" && typeof d.h === "number" && Array.isArray(d.spots) && Array.isArray(d.moves) && d.spots.length <= 60 && d.moves.length <= 60;
}

export function loadDrills(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Saved> | null;
    if (raw && typeof raw === "object") {
      return {
        custom: (Array.isArray(raw.custom) ? raw.custom : []).map(cleanDrill).filter((d): d is Drill => !!d).slice(0, DRILL_LIMITS.custom),
        favorites: Array.isArray(raw.favorites) ? raw.favorites.filter((x): x is string => typeof x === "string").slice(0, 400) : [],
      };
    }
  } catch {
    /* fall through */
  }
  return { custom: [], favorites: [] };
}

export function saveDrills(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: kept for this visit */
  }
}

/** Every drill a coach can pick: his own first, then the built-in ones. */
export const allDrills = (custom: Drill[]) => [...custom, ...SEED_DRILLS];

/** A built-in drill as the start of the coach's own copy (it keeps the diagram). */
export function copyOf(d: Drill): Drill & { diagramFrom?: string } {
  return { ...d, id: "", name: `${d.name} (my version)`.slice(0, DRILL_LIMITS.name), custom: true, diagramFrom: d.custom ? undefined : d.id };
}

/** Plain words for search. */
export const drillText = (d: Drill) => [d.name, d.category, d.side, d.setup, ...d.steps, ...d.points, ...d.equipment].join(" ").toLowerCase();
