import type { FieldView } from "./types";
import { CANVAS_H, CANVAS_W } from "./types";

/** How far in from the canvas edge each field view draws its sidelines. */
export const fieldInset = (view: FieldView) => (view === "flag" ? 96 : 34);

type Props = {
  view: FieldView;
  losY: number;
  /** Print cards: white ground and the line of scrimmage only. */
  lite?: boolean;
  /** Print line weight, so the line of scrimmage keeps up with heavier routes. */
  weight?: number;
  /**
   * Print only: points per canvas unit on paper. Markings too small to read at
   * that size (yard numbers, hash marks, labels) are left off, and the lines
   * that stay are kept heavy enough to print.
   */
  ptPerUnit?: number;
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

export function FieldBackground({ view, losY, lite = false, weight = 1, ptPerUnit }: Props) {
  // On paper: does lettering of this size read, and how wide must a line be to print.
  const reads = (size: number) => !ptPerUnit || size * ptPerUnit >= MIN_LABEL_PT;
  const atLeast = (width: number, pt: number) => (ptPerUnit ? Math.max(width, pt / ptPerUnit) : width);
  if (lite) {
    // Half the route weight, so the line of scrimmage sits behind the play instead of competing with it.
    const los = atLeast(1.3 * weight, MIN_LOS_PT);
    return (
      <g pointerEvents="none">
        <rect x={-CANVAS_W} y={-CANVAS_H} width={CANVAS_W * 3} height={CANVAS_H * 3} fill={TURF} />
        <line
          x1={-CANVAS_W}
          x2={CANVAS_W * 2}
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
  const gap = SPACING[view];
  const lines: number[] = [];
  if (gap > 0) for (let y = gap; y < CANVAS_H - 6; y += gap) lines.push(y);

  const numbered = (view === "full" || view === "half") && reads(15);
  const hashes = reads(15);
  const inset = fieldInset(view);
  const chalk = (w: number) => atLeast(w, MIN_CHALK_PT);

  return (
    <g pointerEvents="none">
      <rect x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill={TURF} />
      {view !== "blank" && (
        <>
          {/* Alternating mow bands, very light so ink stays readable */}
          {lines.map((y, i) =>
            i % 2 === 0 ? (
              <rect key={`band-${y}`} x={inset} y={y} width={CANVAS_W - inset * 2} height={gap} fill={BAND} />
            ) : null,
          )}

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
              <text
                x={CANVAS_W / 2}
                y={54}
                textAnchor="middle"
                fontSize={19}
                fill={NUMBERS}
                fontWeight={800}
                letterSpacing="7"
              >
                END ZONE
              </text>
              )}
            </>
          )}

          {/* Yard lines */}
          {lines.map((y, i) => (
            <g key={y}>
              <line
                x1={inset}
                x2={CANVAS_W - inset}
                y1={y}
                y2={y}
                stroke={i % 2 ? CHALK_SOFT : CHALK}
                strokeWidth={chalk(i % 2 ? 1.2 : 2)}
              />
              {numbered && i % 2 === 1 && (
                <>
                  <text x={inset + 32} y={y - 7} fontSize={15} fill={NUMBERS} fontWeight={600} fontFamily={MONO} letterSpacing="1">
                    {Math.min(50, (i + 1) * 5)}
                  </text>
                  <text
                    x={CANVAS_W - inset - 32}
                    y={y - 7}
                    fontSize={15}
                    fill={NUMBERS}
                    fontWeight={600}
                    fontFamily={MONO}
                    letterSpacing="1"
                    textAnchor="end"
                  >
                    {Math.min(50, (i + 1) * 5)}
                  </text>
                </>
              )}
            </g>
          ))}

          {/* Hash marks */}
          {hashes && lines.flatMap((y) =>
            [CANVAS_W * 0.36, CANVAS_W * 0.64].map((x) => (
              <line key={`${y}-${x}`} x1={x - 10} x2={x + 10} y1={y} y2={y} stroke={CHALK} strokeWidth={1.8} />
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
