import type { Box } from "./geometry";
import type { FieldView } from "./types";
import { CANVAS_H, CANVAS_W } from "./types";

/** How far in from the canvas edge each field view draws its sidelines. */
export const fieldInset = (view: FieldView) => (view === "flag" ? 96 : 34);

type Props = {
  view: FieldView;
  losY: number;
  /** Print cards: white ground and the line of scrimmage only. */
  lite?: boolean;
  /** Print cards: white ground, the line of scrimmage and 5-yard lines with their distances. */
  yards?: boolean;
  /** Print line weight, so the line of scrimmage keeps up with heavier routes. */
  weight?: number;
  /**
   * Print only: points per canvas unit on paper. Markings too small to read at
   * that size (hash marks, labels) are left off, distances grow to a readable
   * size, and the lines that stay are kept heavy enough to print.
   */
  ptPerUnit?: number;
  /** Print only: the part of the canvas that prints, so distances sit at its edges. */
  frame?: Box;
};

/** Smallest field lettering worth printing, and the thinnest chalk line, in points. */
const MIN_LABEL_PT = 4.5;
const MIN_CHALK_PT = 0.35;
const MIN_LOS_PT = 0.75;
/** Print LOS colour: lighter than the routes so a route run along it still stands out. */
const LOS_PRINT = "#7D8B99";

/* GridIronVault field: paper-white turf, cool navy chalk. Prints clean at any size. */
const TURF = "#FFFFFF";
const BAND = "#F5F8FA"; // --paper
const CHALK = "#CBDAE4";
const CHALK_SOFT = "#E4ECF1";
const NUMBERS = "#8FA6BB"; // --muted-2
/** Distances on paper print darker than on screen, so a small number still reads. */
const NUMBERS_PRINT = "#5B7085";
const NAVY = "#0B1524"; // --ink
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

/** Yard spacing for each view, in canvas units per 5 yards. */
const SPACING: Record<FieldView, number> = {
  full: 48,
  half: 72,
  redzone: 104,
  flag: 60,
  blank: 0,
};
/** Canvas units per yard in a view (0 for the whiteboard), for distance read-outs. */
export const unitsPerYard = (view: FieldView) => SPACING[view] / 5;

/** Top of the playing field: the goal line on views with an end zone, else the sideline box. */
const fieldTop = (view: FieldView) => (view === "redzone" || view === "flag" ? 82 : 14);

export type YardLine = { y: number; yards: number };

/**
 * Yard lines every 5 yards, counted out from the line of scrimmage both ways,
 * so the number on each one is how deep a route goes. Pure, for the field and the tests of it.
 */
export function yardLines(view: FieldView, losY: number, top = fieldTop(view), bottom = CANVAS_H - 14): YardLine[] {
  const gap = SPACING[view];
  if (!gap) return [];
  const out: YardLine[] = [];
  for (let k = 1; losY - k * gap > top + 4; k++) out.unshift({ y: losY - k * gap, yards: k * 5 });
  for (let k = 1; losY + k * gap < bottom - 4; k++) out.push({ y: losY + k * gap, yards: k * 5 });
  return out;
}

/**
 * Which yard lines carry their distance at a label size: every line when the
 * numbers fit between them, every other (10, 20 …) when they don't, none when even that crowds.
 */
function labelled(lines: YardLine[], gap: number, size: number, frame?: Box): YardLine[] {
  // A number the printed frame would cut in half is left off.
  const whole = frame ? lines.filter((l) => l.y - size * 1.1 > frame.y && l.y < frame.y + frame.h) : lines;
  if (size <= gap * 0.7) return whole;
  if (size <= gap * 1.4) return whole.filter((l) => l.yards % 10 === 0);
  return [];
}

export function FieldBackground({ view, losY, lite = false, yards = false, weight = 1, ptPerUnit, frame }: Props) {
  // On paper: does lettering of this size read, and how wide must a line be to print.
  const reads = (size: number) => !ptPerUnit || size * ptPerUnit >= MIN_LABEL_PT;
  const atLeast = (width: number, pt: number) => (ptPerUnit ? Math.max(width, pt / ptPerUnit) : width);
  const chalk = (w: number) => atLeast(w, MIN_CHALK_PT);
  const gap = SPACING[view];
  // Distances: 15 units on screen, grown on paper to MIN_LABEL_PT, at most a 5-yard gap tall.
  const numSize = atLeast(15, MIN_LABEL_PT);
  const numFill = ptPerUnit ? NUMBERS_PRINT : NUMBERS;
  const distance = (l: YardLine, x: number, anchor: "start" | "end") => (
    <text
      key={`n-${l.y}-${anchor}`}
      x={x}
      y={l.y - numSize * 0.3}
      fontSize={numSize}
      fill={numFill}
      fontWeight={600}
      fontFamily={MONO}
      textAnchor={anchor}
    >
      {l.yards}
    </text>
  );

  if (lite || yards) {
    // Half the route weight, so the line of scrimmage sits behind the play instead of competing with it.
    const los = atLeast(1.3 * weight, MIN_LOS_PT);
    const left = frame ? frame.x : -CANVAS_W;
    const right = frame ? frame.x + frame.w : CANVAS_W * 2;
    const lines = yards ? yardLines(view === "blank" ? "half" : view, losY, (frame?.y ?? 0) - gap, (frame ? frame.y + frame.h : CANVAS_H) + gap) : [];
    const edge = numSize * 0.35;
    return (
      <g pointerEvents="none">
        <rect x={-CANVAS_W} y={-CANVAS_H} width={CANVAS_W * 3} height={CANVAS_H * 3} fill={TURF} />
        {lines.map((l) => (
          <line key={l.y} x1={left} x2={right} y1={l.y} y2={l.y} stroke={CHALK} strokeWidth={chalk(1.6 * Math.min(weight, 2))} />
        ))}
        {labelled(lines, SPACING[view === "blank" ? "half" : view], numSize, frame).flatMap((l) => [
          distance(l, left + edge, "start"),
          distance(l, right - edge, "end"),
        ])}
        <line
          x1={left}
          x2={right}
          y1={losY}
          y2={losY}
          stroke={ptPerUnit ? LOS_PRINT : NAVY}
          strokeWidth={los}
          strokeDasharray={`${los * 4} ${los * 3}`}
          opacity={ptPerUnit ? 1 : 0.55}
        />
      </g>
    );
  }

  const inset = fieldInset(view);
  const top = fieldTop(view);
  const lines = yardLines(view, losY, top);
  const hashes = reads(15);
  // Distances sit just inside the sidelines, or inside the printed frame when it crops them.
  const numLeft = Math.max(inset, frame?.x ?? -Infinity) + 10 + (frame ? 0 : 22);
  const numRight = Math.min(CANVAS_W - inset, frame ? frame.x + frame.w : Infinity) - 10 - (frame ? 0 : 22);
  // Mow bands alternate every 5 yards out from the line of scrimmage, so they line up with the yard lines.
  const bands: { y: number; h: number }[] = [];
  if (gap > 0)
    for (let y = losY, k = 0; y > top; y -= gap, k++)
      if (k % 2 === 0) bands.push({ y: Math.max(top, y - gap), h: Math.min(gap, y - top) });
  if (gap > 0)
    for (let y = losY + gap, k = 1; y < CANVAS_H - 14; y += gap, k++)
      if (k % 2 === 0) bands.push({ y, h: Math.min(gap, CANVAS_H - 14 - y) });

  return (
    <g pointerEvents="none">
      <rect x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill={TURF} />
      {view !== "blank" && (
        <>
          {/* Alternating mow bands, very light so ink stays readable */}
          {bands.map((b) => (
            <rect key={`band-${b.y}`} x={inset} y={b.y} width={CANVAS_W - inset * 2} height={b.h} fill={BAND} />
          ))}

          {/* Sideline box */}
          <rect
            x={inset}
            y={14}
            width={CANVAS_W - inset * 2}
            height={CANVAS_H - 28}
            fill="none"
            stroke={CHALK}
            strokeWidth={chalk(3)}
          />

          {/* End zone shading */}
          {(view === "redzone" || view === "flag") && (
            <>
              <rect x={inset} y={14} width={CANVAS_W - inset * 2} height={68} fill="#EDF5F9" />
              <line x1={inset} x2={CANVAS_W - inset} y1={82} y2={82} stroke={CHALK} strokeWidth={chalk(3)} />
              {reads(19) && (
                <text x={CANVAS_W / 2} y={54} textAnchor="middle" fontSize={19} fill={NUMBERS} fontWeight={800} letterSpacing="7">
                  END ZONE
                </text>
              )}
            </>
          )}

          {/* Yard lines every 5 yards from the line of scrimmage, each marked with its distance */}
          {lines.map((l) => (
            <line
              key={l.y}
              x1={inset}
              x2={CANVAS_W - inset}
              y1={l.y}
              y2={l.y}
              stroke={l.yards % 10 ? CHALK_SOFT : CHALK}
              strokeWidth={chalk(l.yards % 10 ? 1.2 : 2)}
            />
          ))}
          {labelled(lines, gap, numSize, frame).flatMap((l) => [distance(l, numLeft, "start"), distance(l, numRight, "end")])}

          {/* Hash marks */}
          {hashes &&
            lines.flatMap((l) =>
              [CANVAS_W * 0.36, CANVAS_W * 0.64].map((x) => (
                <line key={`${l.y}-${x}`} x1={x - 10} x2={x + 10} y1={l.y} y2={l.y} stroke={CHALK} strokeWidth={1.8} />
              )),
            )}
        </>
      )}

      {/* Line of scrimmage */}
      <line
        x1={inset}
        x2={CANVAS_W - inset}
        y1={losY}
        y2={losY}
        stroke={NAVY}
        strokeWidth={atLeast(2.6 * Math.max(1, weight * 0.6), MIN_LOS_PT)}
        strokeDasharray={ptPerUnit ? `${atLeast(13, 3)} ${atLeast(10, 2.3)}` : "13 10"}
      />
      {reads(11.5) && (
        <g>
          <rect x={inset + 4} y={losY - 25} width={148} height={20} rx={4} fill={NAVY} />
          <text x={inset + 12} y={losY - 11} fontSize={11.5} fill="#FFFFFF" fontWeight={600} fontFamily={MONO} letterSpacing="1.2">
            LINE OF SCRIMMAGE
          </text>
        </g>
      )}
    </g>
  );
}

export const FIELD_VIEWS: { id: FieldView; label: string; hint: string }[] = [
  { id: "half", label: "Half field", hint: "50-yard view — the everyday drawing surface and the default for a new play." },
  { id: "full", label: "Full field", hint: "100-yard view for long developing plays and kick returns." },
  { id: "redzone", label: "Red zone", hint: "Tight 25-yard view with the end zone shaded — goal-line and fade work." },
  { id: "flag", label: "Flag 30×70", hint: "NFL FLAG 5-on-5 field proportions with both end zones marked." },
  { id: "blank", label: "Whiteboard", hint: "No markings at all — install drawings, blocking rules and teaching diagrams." },
];

const RULE_RUSH = "#C0792B";
const RULE_ZONE = "#D24B3E";
const RULE_MONO = "'IBM Plex Mono', ui-monospace, monospace";

/**
 * A league's rule lines over the field: the rush line a set number of yards
 * behind the line of scrimmage (offense side), and the no-run zone counted back
 * from the goal line on the views that show an end zone.
 */
export function RuleLinesLayer({ view, losY, rush, noRun, scale = 1 }: { view: FieldView; losY: number; rush: number; noRun: number; scale?: number }) {
  const perYard = unitsPerYard(view);
  if (!perYard) return null;
  const inset = fieldInset(view);
  const x1 = inset;
  const x2 = CANVAS_W - inset;
  const rushY = losY + rush * perYard;
  const hasEndZone = view === "redzone" || view === "flag";
  const goal = 82;
  const zoneBottom = goal + noRun * perYard;
  return (
    <g pointerEvents="none">
      {hasEndZone && noRun > 0 && zoneBottom < losY && (
        <>
          <rect x={x1} y={goal} width={x2 - x1} height={zoneBottom - goal} fill={RULE_ZONE} fillOpacity={0.1} />
          <line x1={x1} x2={x2} y1={zoneBottom} y2={zoneBottom} stroke={RULE_ZONE} strokeWidth={1.6 * scale} strokeDasharray="6 5" />
          <text x={CANVAS_W * 0.3} y={zoneBottom - 5 * scale} stroke="#fff" strokeWidth={3 * scale} paintOrder="stroke" fontSize={11 * scale} fontWeight={700} fill={RULE_ZONE} fontFamily={RULE_MONO} letterSpacing="1">
            NO-RUN ZONE · {noRun} YDS
          </text>
        </>
      )}
      {rush > 0 && rushY < CANVAS_H - 14 && (
        <>
          <line x1={x1} x2={x2} y1={rushY} y2={rushY} stroke={RULE_RUSH} strokeWidth={1.8 * scale} strokeDasharray="3 5" />
          <text x={CANVAS_W * 0.7} y={rushY - 5 * scale} stroke="#fff" strokeWidth={3 * scale} paintOrder="stroke" fontSize={11 * scale} fontWeight={700} fill={RULE_RUSH} fontFamily={RULE_MONO} letterSpacing="1" textAnchor="end">
            RUSH LINE · {rush} YDS
          </text>
        </>
      )}
    </g>
  );
}
