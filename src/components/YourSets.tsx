import { useMemo, useState } from "react";
import { swapSides } from "../lib/formations";
import { upright } from "../lib/pov";
import { useStore } from "../lib/store";
import { CANVAS_W } from "../lib/types";
import type { PlayerNode, Scene, StoredPlay } from "../lib/types";
import { PlayThumb } from "./PlayThumb";

export type YourSet = { name: string; plays: number; scene: Scene };

/**
 * The coach's own sets (Wes, 2026-11-21): one per formation name in the
 * Vault, taken from the earliest play saved with it, players only (no
 * routes). They come from the plays themselves, so they follow the coach to
 * every device with the plays. A new play saved with a new formation name
 * adds its set here by itself.
 */
export function setsFromPlays(plays: StoredPlay[]): YourSet[] {
  const byName = new Map<string, { first: StoredPlay; count: number }>();
  for (const p of plays) {
    const name = p.formation?.trim();
    if (!name || p.playType === "defense") continue;
    const players = p.scene?.nodes?.some((n) => n.kind === "player" && n.side === "offense");
    if (!players) continue;
    const key = name.toLowerCase();
    const had = byName.get(key);
    if (!had) byName.set(key, { first: p, count: 1 });
    else byName.set(key, { first: p.updatedAt < had.first.updatedAt ? p : had.first, count: had.count + 1 });
  }
  return [...byName.values()]
    .map(({ first, count }) => {
      // A play drawn from the defense's end is turned upright first, so the set always reads offense-up (the Designer turns it back on a turned play).
      const flat = upright(first.scene);
      return {
        name: first.formation.trim(),
        plays: count,
        scene: { ...flat, nodes: flat.nodes.filter((n) => n.kind === "player" && n.side === "offense" && !n.hidden && !n.ghostOf) },
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The set's players for the field, offense-up: lined up on this play's line (its offense-up line, `upright(scene).losY`), plain or as saved, flipped if asked. */
export function setPlayers(set: YourSet, losY: number, opts: { plain: boolean; flip: boolean }): PlayerNode[] {
  const dy = losY - set.scene.losY;
  return (set.scene.nodes as PlayerNode[]).map((p) => ({
    ...p,
    x: opts.flip ? CANVAS_W - p.x : p.x,
    y: p.y + dy,
    ...(opts.plain ? { fill: "#FFFFFF", stroke: "#0B1524", textColor: "#0B1524", shade: undefined } : {}),
    job: undefined,
    note: undefined,
  }));
}

export function YourSets({ losY, onDrop }: { losY: number; onDrop: (name: string, players: PlayerNode[]) => void }) {
  const plays = useStore((s) => s.plays);
  const sets = useMemo(() => setsFromPlays(plays), [plays]);
  const [plain, setPlain] = useState(false);
  const [flip, setFlip] = useState(false);
  if (!sets.length)
    return (
      <div className="dz-list" id="dz-list-tray">
        <p className="dz-note">Save a play with a formation name and its set shows up here, players only, ready to drop on any play.</p>
      </div>
    );
  return (
    <div className="dz-list ys" id="dz-list-tray">
      <div className="seg seg-sm" role="group" aria-label="Look">
        <button type="button" className={!plain ? "is-on" : ""} aria-pressed={!plain} onClick={() => setPlain(false)}>
          Labeled and colored
        </button>
        <button type="button" className={plain ? "is-on" : ""} aria-pressed={plain} onClick={() => setPlain(true)}>
          Plain
        </button>
      </div>
      <div className="seg seg-sm" role="group" aria-label="Side">
        <button type="button" className={!flip ? "is-on" : ""} aria-pressed={!flip} onClick={() => setFlip(false)}>
          As drawn
        </button>
        <button type="button" className={flip ? "is-on" : ""} aria-pressed={flip} onClick={() => setFlip(true)}>
          Flipped
        </button>
      </div>
      {sets.map((s) => {
        const name = flip ? swapSides(s.name) : s.name;
        return (
          <button key={s.name} type="button" className="ys-set" onClick={() => onDrop(name, setPlayers(s, losY, { plain, flip }))} aria-label={`Drop ${name}, from ${s.plays} play${s.plays === 1 ? "" : "s"}`}>
            <PlayThumb scene={{ ...s.scene, nodes: setPlayers(s, s.scene.losY, { plain, flip }) }} decorative zoom={{ w: 1.4, h: 0.7 }} />
            <span>
              <b>{name}</b>
              <small>
                {s.plays} play{s.plays === 1 ? "" : "s"}
              </small>
            </span>
          </button>
        );
      })}
    </div>
  );
}
