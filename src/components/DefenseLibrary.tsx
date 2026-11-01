import { useMemo, useState } from "react";
import {
  COVERAGES,
  DEFENSE_INK,
  describeDefense,
  FRONTS,
  layoutDefense,
  mirrorDefense,
  ZONE_FILL,
  ZONE_STROKE,
} from "../lib/defense";
import type { Coverage, DefenseLayout, Front } from "../lib/defense";
import { layoutFormation } from "../lib/formations";

const KEY = "grid1ronvault.defenseLib.v1";
export type Choice = { front: Front; coverage: Coverage; show: boolean; flip: boolean; tags: boolean };
const DEFAULT: Choice = { front: "4-3", coverage: "Cover 3", show: true, flip: false, tags: true };

function readChoice(): Choice {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<Choice>) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/** A stand-in offense (11-man Doubles) so the preview can show man lines. */
const SAMPLE = layoutFormation("11", "11", "Doubles").filter((p) => p.role !== "line" && p.role !== "qb");

/** Preview at the canvas's scale: a 240×150 card drawn 4⅓× larger, line of scrimmage at 80. */
const LOS = 347;

function Preview({ layout, show, label, flip }: { layout: DefenseLayout; show: boolean; label: string; flip: boolean }) {
  const X = (dx: number) => 520 + dx;
  const Y = (dy: number) => LOS + dy;
  return (
    <svg viewBox="0 0 1040 650" className="fl-preview" role="img" aria-label={label}>
      {[0, 260, 520].map((y) => (
        <rect key={y} x="0" y={y} width="1040" height="130" fill="#f5f8fa" />
      ))}
      <line x1="0" y1={LOS} x2="1040" y2={LOS} stroke="#0b1524" strokeWidth="4" strokeDasharray="17 13" />
      {show &&
        layout.zones.map((z, i) => (
          <ellipse key={i} cx={X(z.dx)} cy={Y(z.dy)} rx={z.rx} ry={z.ry} fill={ZONE_FILL} stroke={ZONE_STROKE} strokeWidth="4" strokeDasharray="13 9" />
        ))}
      {layout.lines.some((l) => l.kind === "man") &&
        SAMPLE.map((p, i) => <circle key={i} cx={X(flip ? -p.dx : p.dx)} cy={Y(p.dy)} r="16" fill="#dde5ec" />)}
      {show &&
        layout.lines.map((l, i) => {
          const d = layout.defenders[l.from];
          const rush = l.kind === "rush";
          return (
            <g key={i}>
              <line
                x1={X(d.dx)}
                y1={Y(d.dy) + (rush ? 4 : 0)}
                x2={X(l.to.dx)}
                y2={Y(l.to.dy)}
                stroke={rush ? DEFENSE_INK : ZONE_STROKE}
                strokeWidth="5"
                strokeDasharray={rush ? undefined : "13 9"}
              />
              {l.kind === "drop" && <circle cx={X(l.to.dx)} cy={Y(l.to.dy)} r="8" fill={ZONE_STROKE} />}
            </g>
          );
        })}
      {layout.defenders.map((d, i) => (
        <text key={i} x={X(d.dx)} y={Y(d.dy)} textAnchor="middle" fontFamily="Saira Condensed, sans-serif" fontWeight="700" fontSize="39" fill={DEFENSE_INK}>
          {d.label}
        </text>
      ))}
    </svg>
  );
}

/** "3 technique, A gap, Deep 1/3…": the front's first few tags, so the note says what this front will print. */
function tagLine(layout: DefenseLayout) {
  const seen: string[] = [];
  for (const d of layout.defenders) if (d.tag && !seen.includes(d.tag)) seen.push(d.tag);
  return seen.slice(0, 4).join(", ");
}

/**
 * Defense library panel, from the Grid1ron Design canvas. The coach picks a
 * front and a coverage, turns assignments on or off, and drops it on the
 * field; man coverage draws a line to each receiver already on the play.
 */
export function DefenseLibrary({ onDrop, onMatch }: { onDrop: (choice: Choice) => void; onMatch?: () => void }) {
  const [choice, setChoice] = useState<Choice>(readChoice);
  const update = (patch: Partial<Choice>) =>
    setChoice((c) => {
      const next = { ...c, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage blocked — the choice still holds this session */
      }
      return next;
    });

  const layout = useMemo(
    () =>
      choice.flip
        ? mirrorDefense(layoutDefense(choice.front, choice.coverage, SAMPLE.map((p) => ({ ...p, dx: -p.dx }))))
        : layoutDefense(choice.front, choice.coverage, SAMPLE),
    [choice.front, choice.coverage, choice.flip],
  );
  const label = describeDefense(choice.front, choice.coverage, choice.show) + (choice.flip ? ", flipped left to right" : "");

  return (
    <div className="fl" id="dz-list-tray">
      <label className="fl-field">
        <span className="fl-label">Front</span>
        <select className="select" value={choice.front} onChange={(e) => update({ front: e.target.value as Front })}>
          {FRONTS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      <label className="fl-field">
        <span className="fl-label">Coverage</span>
        <select className="select" value={choice.coverage} onChange={(e) => update({ coverage: e.target.value as Coverage })}>
          {COVERAGES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <div className="fl-row">
        <span className="fl-row-label" id="fl-assign">
          Show assignments
        </span>
        <div className="seg seg-onoff" role="group" aria-labelledby="fl-assign">
          {[true, false].map((on) => (
            <button key={String(on)} type="button" className={choice.show === on ? "is-on" : ""} aria-pressed={choice.show === on} onClick={() => update({ show: on })}>
              {on ? "On" : "Off"}
            </button>
          ))}
        </div>
      </div>
      <div className="fl-row">
        <span className="fl-row-label" id="fl-dflip">
          Flip left/right
        </span>
        <div className="seg seg-onoff" role="group" aria-labelledby="fl-dflip">
          {[false, true].map((on) => (
            <button key={String(on)} type="button" className={choice.flip === on ? "is-on" : ""} aria-pressed={choice.flip === on} onClick={() => update({ flip: on })}>
              {on ? "Flipped" : "As drawn"}
            </button>
          ))}
        </div>
      </div>
      <div className="fl-row">
        <span className="fl-row-label" id="fl-dtags">
          Responsibility tags
        </span>
        <div className="seg seg-onoff" role="group" aria-labelledby="fl-dtags">
          {[true, false].map((on) => (
            <button key={String(on)} type="button" className={choice.tags === on ? "is-on" : ""} aria-pressed={choice.tags === on} onClick={() => update({ tags: on })}>
              {on ? "On" : "Off"}
            </button>
          ))}
        </div>
      </div>
      <Preview layout={layout} show={choice.show} label={label} flip={choice.flip} />
      <p className="dz-note">
        On shows zone drops as shaded areas and man coverage as lines to each receiver on the play. Responsibility tags put each
        defender's technique, gap or coverage job under him ({tagLine(layout)}).
      </p>
      <button type="button" className="dz-btn is-on" onClick={() => onDrop(choice)}>
        Drop {choice.front} {choice.coverage}
      </button>
      {onMatch && (
        <>
          <p className="dz-note">Or let the offense on the field pick it: a front and coverage that fit the set, lined up on its strength.</p>
          <button type="button" className="dz-btn" onClick={onMatch}>
            Turn this offense into a defense
          </button>
        </>
      )}
    </div>
  );
}
