import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { ColorPicker } from "./ColorPicker";
import { colorName, normalizeHex } from "../lib/colors";
import type { ToolId } from "../lib/tools";
import { FIRST_READ, PALETTE, STROKE_WEIGHTS } from "../lib/types";

/** The read colors a coach reaches for most. "First" also marks the line as the first read when one is selected. */
export const READS = [
  { id: "first", label: "1st read", color: FIRST_READ },
  { id: "second", label: "2nd read", color: "#2E7DBE" },
  { id: "check", label: "Checkdown", color: "#2E9E6B" },
  { id: "defense", label: "Defense", color: "#0B1524" },
] as const;
export type ReadId = (typeof READS)[number]["id"];

const TOOLS: { id: ToolId; icon: string; label: string; key: string }[] = [
  { id: "select", icon: "cursor", label: "Select", key: "V" },
  { id: "line", icon: "arrow", label: "Route", key: "1" },
  { id: "dashed", icon: "dashed", label: "Dashed", key: "2" },
  { id: "block", icon: "block", label: "Block", key: "3" },
  { id: "text", icon: "text", label: "Text", key: "X" },
];

type Spot = { x: number; y: number; open: boolean; docked: boolean };
const KEY = "grid1ronvault.floatbar.v1";
const DOCK = { x: 12, y: 12 };
const STEP = 16;

function load(): Spot {
  const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
  const fallback = { ...DOCK, open: !narrow, docked: true };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && typeof raw.x === "number" && typeof raw.y === "number") return { ...fallback, ...raw };
  } catch {
    /* storage blocked: start docked */
  }
  return fallback;
}

function save(spot: Spot) {
  try {
    localStorage.setItem(KEY, JSON.stringify(spot));
  } catch {
    /* storage blocked: the spot still holds this visit */
  }
}

type Props = {
  tool: ToolId;
  onTool: (t: ToolId) => void;
  /** The color shown as picked: the next line's, or the selected line's. */
  color: string | undefined;
  firstRead: boolean;
  onRead: (id: ReadId) => void;
  width: number | undefined;
  onWidth: (w: number) => void;
  /** The ink shown as picked in the color row: the next line's, or the first selected line, player or label. */
  ink: string | undefined;
  /** Colors the selection (lines, player fills, labels), or sets the next line's color when nothing is picked. */
  onColor: (hex: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** "Next line" or what the picks will restyle. */
  target: string;
};

/**
 * A small toolbar a coach can drag anywhere over the field, collapse to its
 * handle, or dock back in the corner. It lives beside the canvas, never on it,
 * so only its own box takes pointer events and drawing underneath is untouched.
 * Its spot is remembered per browser.
 */
export function FloatingToolbar({ tool, onTool, color, firstRead, onRead, width, onWidth, ink, onColor, onUndo, onRedo, canUndo, canRedo, target }: Props) {
  const [spot, setSpot] = useState(load);
  const [moreColors, setMoreColors] = useState(false);
  const inkHex = normalizeHex(ink ?? "") ?? "";
  const customInk = inkHex !== "" && !PALETTE.some((p) => p.toLowerCase() === inkHex.toLowerCase());
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; dx: number; dy: number; moved: boolean } | null>(null);

  /** Keeps the box inside the area it floats over. */
  const clamp = useCallback((x: number, y: number) => {
    const box = boxRef.current;
    const area = box?.parentElement;
    if (!box || !area) return { x, y };
    const maxX = Math.max(0, area.clientWidth - box.offsetWidth);
    const maxY = Math.max(0, area.clientHeight - box.offsetHeight);
    return { x: Math.round(Math.min(Math.max(0, x), maxX)), y: Math.round(Math.min(Math.max(0, y), maxY)) };
  }, []);

  const place = (next: Spot) => {
    setSpot(next);
    save(next);
  };

  // A window resize, zoom or collapse can leave it hanging off the edge: slide it back in.
  useLayoutEffect(() => {
    const area = boxRef.current?.parentElement;
    if (!area) return;
    const fit = () =>
      setSpot((s) => {
        const at = s.docked ? DOCK : clamp(s.x, s.y);
        return at.x === s.x && at.y === s.y ? s : { ...s, ...at };
      });
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(area);
    if (boxRef.current) ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [clamp, spot.open]);

  useEffect(() => () => void (drag.current = null), []);

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button:not(.dz-float-grip)")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, dx: e.clientX - spot.x, dy: e.clientY - spot.y, moved: false };
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const at = clamp(e.clientX - d.dx, e.clientY - d.dy);
    if (!d.moved && Math.hypot(at.x - spot.x, at.y - spot.y) < 3) return;
    d.moved = true;
    setSpot((s) => ({ ...s, ...at, docked: false }));
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.moved) setSpot((s) => (save(s), s));
  };

  /** Arrow keys on the grip move it; Home docks it. */
  const onGripKey = (e: React.KeyboardEvent) => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] };
    if (e.key === "Home") {
      e.preventDefault();
      place({ ...spot, ...DOCK, docked: true });
      return;
    }
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    place({ ...spot, ...clamp(spot.x + m[0], spot.y + m[1]), docked: false });
  };

  const pickedRead = READS.find((r) => (r.id === "first" ? firstRead : !firstRead && color?.toLowerCase() === r.color.toLowerCase()));

  return (
    <div
      ref={boxRef}
      className={`dz-float${spot.open ? "" : " is-closed"}`}
      style={{ transform: `translate(${spot.x}px, ${spot.y}px)` }}
      role="toolbar"
      aria-label="Floating tools"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="dz-float-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <button
          type="button"
          className="dz-float-grip"
          aria-label="Move the floating tools. Arrow keys move it, Home docks it."
          title="Drag to move"
          onKeyDown={onGripKey}
        >
          <span aria-hidden="true">⠿</span>
        </button>
        <span className="dz-float-title">{spot.open ? target : "Tools"}</span>
        <button type="button" className="dz-float-icon" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
          <Icon name="undo" size={13} />
        </button>
        <button type="button" className="dz-float-icon" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
          <Icon name="redo" size={13} />
        </button>
        {!spot.docked && (
          <button type="button" className="dz-float-icon" onClick={() => place({ ...spot, ...DOCK, docked: true })} title="Dock in the corner" aria-label="Dock in the corner">
            <Icon name="dock" size={13} />
          </button>
        )}
        <button
          type="button"
          className="dz-float-icon"
          onClick={() => place({ ...spot, open: !spot.open })}
          aria-expanded={spot.open}
          aria-label={spot.open ? "Collapse the floating tools" : "Open the floating tools"}
          title={spot.open ? "Collapse" : "Open"}
        >
          <Icon name="chevron" size={13} className={spot.open ? "is-up" : ""} />
        </button>
      </div>

      {spot.open && (
        <div className="dz-float-body">
          <div className="dz-float-tools" role="group" aria-label="Tool">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={tool === t.id ? "is-on" : ""}
                aria-pressed={tool === t.id}
                onClick={() => onTool(t.id)}
                title={`${t.label} (${t.key})`}
              >
                <Icon name={t.icon} size={16} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
          <div className="dz-float-reads" role="group" aria-label="Read color">
            {READS.map((r) => (
              <button
                key={r.id}
                type="button"
                className={pickedRead?.id === r.id ? "is-on" : ""}
                aria-pressed={pickedRead?.id === r.id}
                onClick={() => onRead(r.id)}
                title={r.label}
              >
                <i style={{ background: r.color }} aria-hidden="true" />
                <span>{r.label}</span>
              </button>
            ))}
          </div>
          <div className="dz-float-colors" role="group" aria-label={`Color: ${target}`}>
            {PALETTE.map((hex) => {
              const on = hex.toLowerCase() === inkHex.toLowerCase();
              return (
                <button
                  key={hex}
                  type="button"
                  className={`cp-swatch${on ? " is-on" : ""}`}
                  style={{ background: hex }}
                  title={colorName(hex)}
                  aria-label={`${colorName(hex)} for ${target.toLowerCase()}`}
                  aria-pressed={on}
                  onClick={() => onColor(hex)}
                />
              );
            })}
            <button
              type="button"
              className={`dz-swatch-more${customInk ? " is-on" : ""}`}
              style={customInk ? { background: inkHex } : undefined}
              aria-expanded={moreColors}
              aria-label="More colors"
              title="More colors: team colors, recent, any hex"
              onClick={() => setMoreColors((m) => !m)}
            >
              {customInk ? "" : "+"}
            </button>
          </div>
          {moreColors && (
            <div className="dz-float-picker">
              <ColorPicker label={target} value={inkHex} onChange={onColor} />
            </div>
          )}
          <div className="dz-seg dz-seg-4 dz-float-weights" role="group" aria-label="Line weight">
            {STROKE_WEIGHTS.map((w, i) => (
              <button
                key={w}
                type="button"
                className={width === w ? "is-on" : ""}
                aria-pressed={width === w}
                aria-label={`Line weight ${i + 1}${i === STROKE_WEIGHTS.length - 1 ? ", boldest" : ""}`}
                onClick={() => onWidth(w)}
              >
                <i style={{ height: Math.round(w) }} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
