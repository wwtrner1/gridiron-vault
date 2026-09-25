import type { FieldView } from "./types";
import { CANVAS_H, CANVAS_W } from "./types";

type Props = { view: FieldView; losY: number };

/* Grid1ronVault field: paper-white turf, cool navy chalk. Prints clean at any size. */
const TURF = "#FFFFFF";
const BAND = "#F4F8FA";
const CHALK = "#CBDAE4";
const CHALK_SOFT = "#E4ECF1";
const NUMBERS = "#AFC2D0";
const NAVY = "#0B1524";
const CYAN = "#16C8E8";

/** Yard spacing for each view, in canvas units per 5 yards. */
const SPACING: Record<FieldView, number> = {
  full: 48,
  half: 72,
  redzone: 104,
  flag: 60,
  blank: 0,
};

export function FieldBackground({ view, losY }: Props) {
  const gap = SPACING[view];
  const lines: number[] = [];
  if (gap > 0) for (let y = gap; y < CANVAS_H - 6; y += gap) lines.push(y);

  const numbered = view === "full" || view === "half";
  const inset = view === "flag" ? 96 : 34;

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
            strokeWidth={3}
          />

          {/* End zone shading */}
          {(view === "redzone" || view === "flag") && (
            <>
              <rect x={inset} y={14} width={CANVAS_W - inset * 2} height={68} fill="#EDF5F9" />
              <line x1={inset} x2={CANVAS_W - inset} y1={82} y2={82} stroke={CHALK} strokeWidth={3} />
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
                strokeWidth={i % 2 ? 1.2 : 2}
              />
              {numbered && i % 2 === 1 && (
                <>
                  <text x={inset + 32} y={y - 7} fontSize={16} fill={NUMBERS} fontWeight={800} letterSpacing="2.5">
                    {Math.min(50, (i + 1) * 5)}
                  </text>
                  <text
                    x={CANVAS_W - inset - 32}
                    y={y - 7}
                    fontSize={16}
                    fill={NUMBERS}
                    fontWeight={800}
                    letterSpacing="2.5"
                    textAnchor="end"
                  >
                    {Math.min(50, (i + 1) * 5)}
                  </text>
                </>
              )}
            </g>
          ))}

          {/* Hash marks */}
          {lines.flatMap((y) =>
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
        strokeWidth={2.6}
        strokeDasharray="10 7"
        opacity={0.5}
      />
      <g>
        <rect x={inset + 4} y={losY - 23} width={132} height={16} rx={3} fill={NAVY} opacity={0.9} />
        <text x={inset + 10} y={losY - 11} fontSize={10} fill={CYAN} fontWeight={800} letterSpacing="1.8">
          LINE OF SCRIMMAGE
        </text>
      </g>
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
