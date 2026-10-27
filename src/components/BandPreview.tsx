import { useState } from "react";
import { PrintDiagram } from "../lib/export";
import {
  bandChrome,
  cardLetter,
  cellType,
  diagramBox,
  fillBandText,
  type BandEntry,
  type BandOptions,
} from "../lib/wristbands";

type Props = {
  /** Entries in print order. */
  entries: BandEntry[];
  options: Pick<BandOptions, "card" | "grid" | "shows" | "look" | "numberSize" | "numberStyle" | "header" | "footer" | "source">;
  /** Draw at the card's real size in inches instead of filling the column. */
  actualSize: boolean;
  /** Move the entry at `from` to position `to` in print order. */
  onMove: (from: number, to: number) => void;
  onEditHeader?: () => void;
};

/** Percent of a length, for absolutely placed card parts. */
const pct = (part: number, whole: number) => `${(part / whole) * 100}%`;

/**
 * Print preview of every QB card, drawn with the same framing and sizes the
 * PDF uses. Cells drag into a new order; the arrow buttons do the same from
 * the keyboard.
 */
export function BandPreview({ entries, options: o, actualSize, onMove, onEditHeader }: Props) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const perCard = o.grid.cols * o.grid.rows;
  const cards = Math.max(1, Math.ceil(entries.length / perCard));
  const { w, h } = o.card;
  const { headH, footH } = bandChrome(o);
  const { cellW, cellH, strip, numPt, bigPt, namePt } = cellType(o);
  const art = diagramBox(o);
  // Type sizes in container units, so text keeps the printed proportion at any preview width.
  const cq = (pt: number) => `${((pt / 72) / w) * 100}cqw`;

  function drop(to: number) {
    if (dragFrom !== null && dragFrom !== to) onMove(dragFrom, Math.min(to, entries.length - 1));
    setDragFrom(null);
    setOver(null);
  }

  return (
    <div className="wb-cards">
      {Array.from({ length: cards }, (_, c) => {
        const slice = entries.slice(c * perCard, c * perCard + perCard);
        const vars = { role: "QB wristband", card: cardLetter(c), source: o.source, count: slice.length };
        return (
          <div
            key={c}
            className="wb-card"
            style={{ width: actualSize ? `${w}in` : "100%", aspectRatio: `${w} / ${h}` }}
            aria-label={`Card ${cardLetter(c)}, ${slice.length} plays, ${w} by ${h.toFixed(2)} inches`}
          >
            {headH > 0 && (
              <button
                type="button"
                className="wb-card-head"
                style={{ height: pct(headH, h), fontSize: cq(7) }}
                onClick={onEditHeader}
                title="Edit the header text"
              >
                <span>{fillBandText(o.header.left, vars)}</span>
                <span>{fillBandText(o.header.right, vars)}</span>
              </button>
            )}
            {Array.from({ length: perCard }, (_, i) => {
              const index = c * perCard + i;
              const e = slice[i];
              const style = {
                left: pct((i % o.grid.cols) * cellW, w),
                top: pct(headH + Math.floor(i / o.grid.cols) * cellH, h),
                width: pct(cellW, w),
                height: pct(cellH, h),
              };
              if (!e) return <div key={i} className="wb-cell is-empty" style={style} onDragOver={(ev) => ev.preventDefault()} onDrop={() => drop(index)} />;
              const diagram = o.shows.diagram && !o.shows.numberOnly && e.scene;
              return (
                <div
                  key={i}
                  className={`wb-cell${diagram ? "" : " is-number"}${dragFrom === index ? " is-dragging" : ""}${over === index ? " is-over" : ""}`}
                  style={style}
                  draggable
                  onDragStart={(ev) => {
                    setDragFrom(index);
                    ev.dataTransfer.effectAllowed = "move";
                    ev.dataTransfer.setData("text/plain", String(index));
                  }}
                  onDragEnd={() => {
                    setDragFrom(null);
                    setOver(null);
                  }}
                  onDragOver={(ev) => {
                    ev.preventDefault();
                    setOver(index);
                  }}
                  onDragLeave={() => setOver((v) => (v === index ? null : v))}
                  onDrop={(ev) => {
                    ev.preventDefault();
                    drop(index);
                  }}
                >
                  {diagram ? (
                    <>
                      {o.numberStyle === "band" ? (
                        <div className="wb-cell-band" style={{ height: pct(strip, cellH), fontSize: cq(numPt) }}>
                          {o.shows.name ? `${e.number} · ${e.name}` : e.number}
                        </div>
                      ) : (
                        <div className="wb-cell-top" style={{ height: pct(strip, cellH) }}>
                          <b style={{ fontSize: cq(numPt) }}>{e.number}</b>
                          {o.shows.name && <span style={{ fontSize: cq(Math.max(5.5, numPt * 0.66)) }}>{e.name}</span>}
                        </div>
                      )}
                      <div className="wb-cell-art">
                        <PrintDiagram
                          scene={e.scene!}
                          look={o.look}
                          widthIn={art.w}
                          heightIn={art.h}
                          label={e.name}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="wb-cell-num">
                      <b style={{ fontSize: cq(bigPt) }}>{e.number}</b>
                      {o.shows.name && <span style={{ fontSize: cq(namePt) }}>{e.name}</span>}
                    </div>
                  )}
                  <span className="wb-move">
                    <button type="button" aria-label={`Move ${e.number} ${e.name} earlier`} disabled={index === 0} onClick={() => onMove(index, index - 1)}>
                      ‹
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${e.number} ${e.name} later`}
                      disabled={index === entries.length - 1}
                      onClick={() => onMove(index, index + 1)}
                    >
                      ›
                    </button>
                  </span>
                </div>
              );
            })}
            {footH > 0 && (
              <div className="wb-card-foot" style={{ height: pct(footH, h), fontSize: cq(6.5) }}>
                {fillBandText(o.footer, vars)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
