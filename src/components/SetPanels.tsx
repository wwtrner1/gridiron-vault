import { useState } from "react";
import { BLOCK_SCHEMES } from "../lib/blockSchemes";
import type { Gold } from "../lib/pressures";
import { PRESSURES } from "../lib/pressures";
import type { Dir } from "../lib/quickSets";
import { SetTiles, type TileItem } from "./QuickSetMenus";

/**
 * The Sets section's Blocking and Pressures lists (Wes, 2026-11-22): a whole
 * line's blocks or a whole defense's rush and coverage in one click, on the
 * play on the field. Choices here last the visit only; each pick is one Undo
 * step, and the field's own one-click menus change any single player after.
 */

const INK = "#E8F1F8";

function Switch<T extends string | number>({
  label,
  id,
  value,
  options,
  onPick,
  stacked,
}: {
  label: string;
  id: string;
  value: T;
  options: { value: T; text: string }[];
  onPick: (v: T) => void;
  stacked?: boolean;
}) {
  return (
    <div className={`fl-row${stacked ? " is-stacked" : ""}`}>
      <span className="fl-row-label" id={id}>
        {label}
      </span>
      <div className="seg seg-onoff" role="group" aria-labelledby={id}>
        {options.map((o) => (
          <button key={String(o.value)} type="button" className={value === o.value ? "is-on" : ""} aria-pressed={value === o.value} onClick={() => onPick(o.value)}>
            {o.text}
          </button>
        ))}
      </div>
    </div>
  );
}

const items = (list: { id: string; label: string; hint: string; icon: string }[]): TileItem[] => list.map(({ id, label, hint, icon }) => ({ id, label, hint, icon }));

/** Whole-line block schemes: inside zone, power, trap, slide protection… run to the left or the right of the screen. */
export function BlockingPanel({ onApply, onClear, hasBlocks }: { onApply: (id: string, dir: Dir) => void; onClear: () => void; hasBlocks: boolean }) {
  const [dir, setDir] = useState<Dir>(1);
  const groups = [
    { id: "run", title: "Run blocking" },
    { id: "pass", title: "Pass protection" },
    { id: "screen", title: "Screens" },
  ] as const;
  return (
    <div className="fl" id="dz-list-tray">
      <Switch
        label="Run to the"
        id="fl-bdir"
        value={dir}
        options={[
          { value: -1 as Dir, text: "Left" },
          { value: 1 as Dir, text: "Right" },
        ]}
        onPick={setDir}
      />
      {groups.map((g) => (
        <div key={g.id} className="fl-group">
          <p className="dz-quick-sub">{g.title}</p>
          <SetTiles items={items(BLOCK_SCHEMES.filter((s) => s.group === g.id))} ink={INK} mirrored={false} dot={false} label={g.title} onPick={(id) => onApply(id, dir)} />
        </div>
      ))}
      <p className="dz-note">
        Every lineman gets a block that ends in a T: covered linemen take the man over them, the rest double or climb, and a puller kicks out the end. With a
        defense on the field each block aims at the defender it fits. Click any blocker after to change his block.
      </p>
      <button type="button" className="dz-btn" onClick={onClear} disabled={!hasBlocks}>
        Clear blocks
      </button>
    </div>
  );
}

type GoldPick = "sheet" | Gold;

/** Wes's pressures: Shark set and man-pressure packages put on the defense on the field, with the rover's Gold job. */
export function PressuresPanel({ onApply, onClear, hasDefense }: { onApply: (id: string, gold: Gold | null) => void; onClear: () => void; hasDefense: boolean }) {
  const [gold, setGold] = useState<GoldPick>("sheet");
  return (
    <div className="fl" id="dz-list-tray">
      <Switch
        label="Rover (Gold)"
        id="fl-gold"
        value={gold}
        stacked
        options={[
          { value: "sheet" as GoldPick, text: "Sheet" },
          { value: "back" as GoldPick, text: "Back" },
          { value: "free" as GoldPick, text: "Free" },
        ]}
        onPick={setGold}
      />
      <p className="dz-note">Gold Back: the rover takes the back. Gold Free: the rover is free to read and fill. Sheet uses each package's own call.</p>
      {(["Man pressure", "Shark set"] as const).map((from) => (
        <div key={from} className="fl-group">
          <p className="dz-quick-sub">{from}</p>
          <SetTiles
            items={items(PRESSURES.filter((p) => p.from === from))}
            ink={INK}
            mirrored={false}
            dot={false}
            label={from}
            onPick={(id) => onApply(id, gold === "sheet" ? null : gold)}
          />
        </div>
      ))}
      <p className="dz-note">
        {hasDefense
          ? "Each package picks its rushers from the defense on the field (the line and the backers it names), puts everyone else in man coverage and tags every job. Click any defender after to change his job."
          : "Drop a defense from the Defense list first; a pressure rushes the front it finds on the field."}
      </p>
      <button type="button" className="dz-btn" onClick={onClear} disabled={!hasDefense}>
        Clear all assignments
      </button>
    </div>
  );
}
