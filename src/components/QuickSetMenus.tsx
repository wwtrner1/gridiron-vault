import type { ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * The insides of the one-click block and assignment menus (the Designer's
 * `.dz-quick` popovers): tiles with a little drawing, the arm steps ("now click
 * the receiver") and the bar that follows a pick. Presentational only; the
 * Designer owns the state and the scene (`lib/quickSets.ts` does the work).
 */

export type TileItem = { id: string; label: string; hint: string; icon: string };

/** Where a tile's drawing starts: the player's dot sits there (blocks and assignments start at different spots). */
const firstPoint = (d: string): { x: number; y: number } => {
  const m = /M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(d);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 28, y: 40 };
};

/** A grid of tiles in the player's color; `mirrored` draws them for the other side of the ball. */
export function SetTiles({
  items,
  ink,
  mirrored,
  label,
  onPick,
  dot = true,
}: {
  items: TileItem[];
  ink: string;
  mirrored: boolean;
  label: string;
  onPick: (id: string) => void;
  /** A player's dot where the drawing starts; whole-line drawings (the schemes) have none. */
  dot?: boolean;
}) {
  return (
    <div className="dz-quick-grid" role="group" aria-label={label}>
      {items.map((item) => {
        const start = firstPoint(item.icon);
        return (
          <button key={item.id} type="button" className="dz-set-tile" onClick={() => onPick(item.id)}>
            <svg viewBox="0 0 56 44" aria-hidden="true">
              <g transform={mirrored ? "translate(56 0) scale(-1 1)" : undefined}>
                <path d={item.icon} fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                {dot && <circle cx={start.x} cy={start.y} r="3.5" fill={ink} />}
              </g>
            </svg>
            <b>{item.label}</b>
            <small>{item.hint}</small>
          </button>
        );
      })}
    </div>
  );
}

function Head({ title, onClose, closeLabel, children }: { title: string; onClose: () => void; closeLabel: string; children?: ReactNode }) {
  return (
    <div className="dz-quick-head">
      <span className="dz-quick-title">{title}</span>
      <span className="dz-quick-head-end">
        {children}
        <button type="button" className="dz-quick-x" onClick={onClose} aria-label={closeLabel}>
          <Icon name="close" size={14} />
        </button>
      </span>
    </div>
  );
}

/** A lineman's block menu: the block tiles under the old "click the defender" step. */
export function LineBlockMenu({
  name,
  tiles,
  ink,
  mirrored,
  hasDefense,
  onPick,
  onStraight,
  onCancel,
}: {
  name: string;
  tiles: TileItem[];
  ink: string;
  mirrored: boolean;
  hasDefense: boolean;
  onPick: (id: string) => void;
  onStraight: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <p className="dz-quick-note">Now click the defender {name} blocks.</p>
      <p className="dz-quick-sub">{hasDefense ? "Or pick how he blocks" : "Or pick how he blocks (it fits the defense when there is one)"}</p>
      <SetTiles items={tiles} ink={ink} mirrored={mirrored} label={`Blocks for ${name}`} onPick={onPick} />
      <div className="dz-quick-row">
        <button type="button" onClick={onStraight}>Block straight ahead</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </>
  );
}

/** A back, tight end or receiver's block menu (the other half of the Routes menu). */
export function SkillBlockMenu({
  name,
  tiles,
  ink,
  mirrored,
  hasDefense,
  onPick,
  onRoutes,
  onClose,
}: {
  name: string;
  tiles: TileItem[];
  ink: string;
  mirrored: boolean;
  hasDefense: boolean;
  onPick: (id: string) => void;
  onRoutes: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <Head title={`Blocks for ${name}`} onClose={onClose} closeLabel="Close the block menu" />
      {!hasDefense && <p className="dz-quick-note">No defense on the field yet, so each block draws its own shape.</p>}
      <SetTiles items={tiles} ink={ink} mirrored={mirrored} label={`Blocks for ${name}`} onPick={onPick} />
      <div className="dz-quick-row">
        <button type="button" onClick={onRoutes}>Routes instead</button>
      </div>
    </>
  );
}

/** A defender's menu: rush jobs and coverage jobs, then Clear assignment when he has one. */
export function JobMenu({
  name,
  rush,
  coverage,
  ink,
  mirrored,
  hasJob,
  onPick,
  onClear,
  onClose,
}: {
  name: string;
  rush: TileItem[];
  coverage: TileItem[];
  ink: string;
  mirrored: boolean;
  hasJob: boolean;
  onPick: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <Head title={`Assignments for ${name}`} onClose={onClose} closeLabel="Close the assignment menu">
        {hasJob && (
          <button type="button" className="dz-quick-clear" onClick={onClear}>
            Clear assignment
          </button>
        )}
      </Head>
      <p className="dz-quick-sub">Rush</p>
      <SetTiles items={rush} ink={ink} mirrored={mirrored} label={`Rush assignments for ${name}`} onPick={onPick} />
      <p className="dz-quick-sub">Coverage</p>
      <SetTiles items={coverage} ink={ink} mirrored={mirrored} label={`Coverage assignments for ${name}`} onPick={onPick} />
    </>
  );
}

/** Man coverage's second step: the receiver, by a click on him or the closest one. */
export function ManArmMenu({ name, onNearest, onCancel }: { name: string; onNearest: () => void; onCancel: () => void }) {
  return (
    <>
      <p className="dz-quick-note">Now click the receiver {name} covers.</p>
      <div className="dz-quick-row">
        <button type="button" onClick={onNearest}>Nearest receiver</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </>
  );
}

/** The bar after a block or an assignment is drawn: switch its side, take it back, or finish. */
export function MadeBar({ title, flips, onFlip, onUndo, onDone, children }: { title: string; flips: boolean; onFlip: () => void; onUndo: () => void; onDone: () => void; children?: ReactNode }) {
  return (
    <>
      <span className="dz-quick-title">{title}</span>
      {flips && <button type="button" onClick={onFlip}>Flip side</button>}
      {children}
      <button type="button" onClick={onUndo}>Undo</button>
      <button type="button" className="is-done" onClick={onDone}>Done</button>
    </>
  );
}
