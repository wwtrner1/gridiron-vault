import { MORE_TILES, ROUTE_TILES } from "../lib/routeLibrary";
import type { Tile } from "../lib/routeLibrary";

const GAME_KEY = "grid1ronvault.formationLib.v1";

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** The game type picked in the Formation library; blocking only shows for 11-man. */
const elevenMan = () => {
  try {
    return JSON.parse(read(GAME_KEY) ?? "{}").game === "11";
  } catch {
    return false;
  }
};

function TileButton({ tile, onPick, armed }: { tile: Tile; onPick: (t: Tile) => void; armed: boolean }) {
  return (
    <button
      type="button"
      className={`rl-tile${armed ? " is-on" : ""}`}
      aria-pressed={armed}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/grid1ronvault-route", tile.id)}
      // A double-click loads the tile once; its second click doesn't put it away again.
      onClick={(e) => e.detail < 2 && onPick(tile)}
      aria-label={`${tile.num ? `${tile.num} ` : ""}${tile.label}${tile.depth ? `, ${tile.depth}` : ""}${tile.side === "defense" ? " (defenders)" : ""}`}
    >
      <svg viewBox="0 0 56 44" aria-hidden="true">
        <path d={tile.icon} stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {tile.kind === "route" && <circle cx="28" cy="40" r="3" fill="currentColor" />}
      </svg>
      <span>
        {tile.num && <b>{tile.num}</b>}
        {tile.label}
        {tile.depth && <small>{tile.depth}</small>}
      </span>
    </button>
  );
}

/**
 * Route library panel: the routes at Wes's yard depths (one set since
 * 2026-11-21), then handoffs, motion and coverage tiles. Pick players and
 * click a tile, drag a tile onto a player, or click a tile with nobody picked
 * to load it (`armed`) and then click players or the field to place it.
 */
export function RouteLibrary({ onPick, armed }: { onPick: (tile: Tile) => void; armed: string | null }) {
  const blocking = elevenMan();
  const more = MORE_TILES.filter((t) => t.id !== "block" || blocking);

  return (
    <div className="rl">
      <div className="rl-grid">
        {ROUTE_TILES.map((t) => (
          <TileButton key={t.id} tile={t} onPick={onPick} armed={armed === t.id} />
        ))}
      </div>
      <span className="fl-label">Handoffs · blocking · coverage</span>
      <div className="rl-grid">
        {more.map((t) => (
          <TileButton key={t.id} tile={t} onPick={onPick} armed={armed === t.id} />
        ))}
      </div>
      <p className="dz-note">
        Quickest: click a player on the field and pick his route. Here, click a tile, then a player or the field to place it. Or pick players first, or drag a tile onto one. To repeat a route, right-click it and copy and paste.
        {blocking ? "" : " Block shows when the Formation library is set to 11-man — flag leagues don't block."}
      </p>
    </div>
  );
}
