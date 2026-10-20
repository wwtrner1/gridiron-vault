import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Icon } from "../components/Icon";
import { PlayThumb } from "../components/PlayThumb";
import { playNamed, useStore } from "../lib/store";
import type { SheetDoc } from "../lib/store";
import { useTier } from "../lib/tier";
import { cappedDpi, gateSheets } from "../lib/plan";
import { useToast } from "../lib/toast";
import { track } from "../lib/track";
import { slug } from "../lib/export";
import { applyFormat, usePlayFormat } from "../lib/playFormat";
import { FormatPanel } from "../components/FormatPanel";
import { BAND_LAYOUT, BAND_SIZES, wristbandSheets, type BandCopies, type BandEntry, type BandSizeId, type CellShows } from "../lib/wristbands";
import type { StoredPlay } from "../lib/types";
import "../styles/wristbands.css";

type Source = { id: string; label: string; entries: BandEntry[] };

/** A Season Grid's calls in order, numbered by its "#" column. */
function gridEntries(sheet: SheetDoc, plays: StoredPlay[]): BandEntry[] {
  const numCol = sheet.columns.find((c) => c.label.trim() === "#");
  const nameCol = sheet.columns.find((c) => /play/i.test(c.label));
  return sheet.rows
    .map((r, i) => {
      const typed = (nameCol ? r.cells[nameCol.id]?.trim() : "") || "";
      // A linked row, or a typed name that matches one saved play, prints with its diagram.
      const play = (r.playId ? plays.find((p) => p.id === r.playId) : undefined) ?? playNamed(plays, typed);
      const name = play?.name || typed;
      return { number: (numCol && r.cells[numCol.id]?.trim()) || String(i + 1), name, scene: play?.scene ?? null };
    })
    .filter((e) => e.name);
}

/**
 * Wristbands · print builder, from the Grid1ron Design canvas: pick the
 * plays, pick the size, print. Numbers match the Season Grid.
 */
export function Wristbands() {
  const plays = useStore((s) => s.plays);
  const sheets = useStore((s) => s.sheets);
  const playbooks = useStore((s) => s.playbooks);
  const tier = useTier();
  const toast = useToast();

  const sources = useMemo<Source[]>(
    () => [
      ...sheets.map((s) => ({ id: `grid:${s.id}`, label: `Season Grid · ${s.name}`, entries: gridEntries(s, plays) })),
      ...playbooks.map((b) => ({
        id: `book:${b.id}`,
        label: `Playbook · ${b.name}`,
        entries: b.playIds
          .map((id) => plays.find((p) => p.id === id))
          .filter((p): p is StoredPlay => !!p)
          .map((p, i) => ({ number: String(i + 1), name: p.name || "Untitled play", scene: p.scene })),
      })),
    ],
    [sheets, playbooks, plays],
  );

  // "Wristbands" on a Season Grid opens straight onto that grid.
  const [params] = useSearchParams();
  const [sourceId, setSourceId] = useState<string>(() => {
    const asked = params.get("source");
    return (asked && sources.some((s) => s.id === asked) ? asked : sources[0]?.id) ?? "hand";
  });
  const [picked, setPicked] = useState<string[]>([]);
  const [perCard, setPerCard] = useState<6 | 8 | 10>(8);
  const [sizeId, setSizeId] = useState<BandSizeId>("flag");
  const [shows, setShows] = useState<CellShows>({ diagram: true, name: true, numberOnly: false });
  const [copies, setCopies] = useState<BandCopies>({ qb: 2, center: 1, coach: 1 });
  const [printing, setPrinting] = useState(false);

  // "Apply game-day format" (canvas): print every play in the saved play format; the plays themselves don't change.
  const { format, parts } = usePlayFormat();
  const [gameDay, setGameDay] = useState(false);

  const source = sources.find((s) => s.id === sourceId);
  const raw: BandEntry[] = source
    ? source.entries
    : picked
        .map((id) => plays.find((p) => p.id === id))
        .filter((p): p is StoredPlay => !!p)
        .map((p, i) => ({ number: String(i + 1), name: p.name || "Untitled play", scene: p.scene }));
  const entries: BandEntry[] =
    gameDay && format && parts.length ? raw.map((e) => (e.scene ? { ...e, scene: applyFormat(e.scene, format, parts) } : e)) : raw;
  const sourceName = source ? source.label.replace(/^[^·]+·\s*/, "") : "Hand-picked";
  const cards = Math.max(1, Math.ceil(entries.length / perCard));
  const cardA = entries.slice(0, perCard);
  const { cols } = BAND_LAYOUT[perCard];
  const card = BAND_SIZES.find((b) => b.id === sizeId) ?? BAND_SIZES[0];
  const gate = gateSheets(tier);

  async function print() {
    if (!gate.ok || !entries.length) return;
    setPrinting(true);
    try {
      const doc = await wristbandSheets(entries, perCard, shows, copies, sourceName, {
        watermark: tier.watermark ? "GRIDIRONVAULT" : null,
        dpi: cappedDpi(tier, 200),
      }, card);
      doc.save(`${slug(`wristbands-${sourceName}`)}.pdf`);
      track("play_exported", { kind: "wristband" });
      toast("Wristband cards downloaded. Print at 100% scale and cut along the borders.");
    } catch {
      toast("The wristband PDF could not be built. Try again, or pick fewer plays.");
    } finally {
      setPrinting(false);
    }
  }

  const setCopy = (k: keyof BandCopies, v: number) => setCopies((c) => ({ ...c, [k]: Math.max(0, Math.min(10, v)) }));

  return (
    <Shell
      title="Wristbands"
      actions={
        <Link to="/grid" className="btn btn-ghost btn-sm">
          <Icon name="table" size={15} /> Season Grid
        </Link>
      }
    >
      <div className="wb">
        <div className="wb-head">
          <div>
            <p className="eyebrow">Print</p>
            <h2>Wristbands</h2>
            <p className="wb-lede">
              Pick the plays, pick the size, print. Numbers match your Season Grid so the call from the sideline is the box on the
              wrist.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={print} disabled={printing || !entries.length || !gate.ok}>
            <Icon name="print" size={15} /> {printing ? "Building cards…" : "Print cards"}
          </button>
        </div>
        {!gate.ok && (
          <p className="wb-gate" role="note">
            {gate.reason}{" "}
            <Link to="/pricing">{gate.cta}</Link>
          </p>
        )}

        <div className="wb-body">
          <div className="wb-controls card">
            <div className="wb-field" role="group" aria-labelledby="wb-size">
              <span id="wb-size">Plays per card</span>
              <div className="tab-row">
                {([6, 8, 10] as const).map((n) => (
                  <button key={n} type="button" className={perCard === n ? "is-on" : ""} aria-pressed={perCard === n} onClick={() => setPerCard(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="wb-field" role="group" aria-labelledby="wb-card-size">
              <span id="wb-card-size">Card size</span>
              <div className="tab-row">
                {BAND_SIZES.map((b) => (
                  <button key={b.id} type="button" className={sizeId === b.id ? "is-on" : ""} aria-pressed={sizeId === b.id} onClick={() => setSizeId(b.id)}>
                    {b.w} × {b.h.toFixed(2)} in
                  </button>
                ))}
              </div>
              <p className="wb-note">{card.note}</p>
            </div>

            <label className="wb-field">
              <span>Pull plays from</span>
              <select className="select" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
                <option value="hand">Pick plays by hand</option>
              </select>
            </label>

            {sourceId === "hand" && (
              <div className="wb-pick" role="group" aria-label="Plays to print">
                {plays.length === 0 && <p className="hint">Your Vault is empty. Draw a play or copy a starter first.</p>}
                {plays.map((p) => (
                  <label key={p.id} className="switch">
                    <input
                      type="checkbox"
                      checked={picked.includes(p.id)}
                      onChange={(e) => setPicked((l) => (e.target.checked ? [...l, p.id] : l.filter((x) => x !== p.id)))}
                    />
                    {p.name || "Untitled play"}
                  </label>
                ))}
              </div>
            )}

            <div className="wb-field" role="group" aria-labelledby="wb-shows">
              <span id="wb-shows">Cell shows</span>
              <label className="switch">
                <input type="checkbox" checked={shows.diagram && !shows.numberOnly} disabled={shows.numberOnly} onChange={(e) => setShows((s) => ({ ...s, diagram: e.target.checked }))} />
                Diagram
              </label>
              <label className="switch">
                <input type="checkbox" checked={shows.name} onChange={(e) => setShows((s) => ({ ...s, name: e.target.checked }))} />
                Play name
              </label>
              <label className="switch">
                <input type="checkbox" checked={shows.numberOnly} onChange={(e) => setShows((s) => ({ ...s, numberOnly: e.target.checked }))} />
                Number only (no diagram)
              </label>
            </div>

            <div className="wb-field" role="group" aria-labelledby="wb-copies">
              <span id="wb-copies">Copies</span>
              {(
                [
                  ["qb", "QB wristbands"],
                  ["center", "Center wristbands"],
                  ["coach", "Coach sheet"],
                ] as const
              ).map(([k, label]) => (
                <div key={k} className="wb-copy">
                  <span>{label}</span>
                  <button type="button" onClick={() => setCopy(k, copies[k] - 1)} aria-label={`Fewer ${label}`}>
                    −
                  </button>
                  <b aria-live="polite">×{copies[k]}</b>
                  <button type="button" onClick={() => setCopy(k, copies[k] + 1)} aria-label={`More ${label}`}>
                    +
                  </button>
                </div>
              ))}
            </div>

            <div className="wb-field">
              <label className="switch">
                <input type="checkbox" checked={gameDay && !!format} disabled={!format} onChange={(e) => setGameDay(e.target.checked)} />
                Apply game-day format
              </label>
              {format ? (
                gameDay && <FormatPanel />
              ) : (
                <p className="wb-note">Save a play's format in the Designer (Saved play format) to print every card in the same look.</p>
              )}
            </div>
          </div>

          <div className="wb-preview">
            {entries.length === 0 ? (
              <div className="empty">
                <Icon name="wristband" size={40} />
                <h3>No plays to print yet</h3>
                <p>
                  {sources.length === 0
                    ? "Build a Season Grid or a playbook, or pick plays by hand from your Vault."
                    : "This source has no calls with a play name. Pick another, or pick plays by hand."}
                </p>
                <Link to="/grid" className="btn btn-ghost">
                  Open the Season Grid
                </Link>
              </div>
            ) : (
              <>
                <div className="wb-card" aria-label={`Preview of card A, ${cardA.length} plays, ${card.w} by ${card.h.toFixed(2)} inches`}>
                  <div className="wb-card-head">
                    <span>QB wristband · Card A · {sourceName}</span>
                    <span>
                      {cardA.length} plays · {card.w} × {card.h.toFixed(2)} in
                    </span>
                  </div>
                  <div className="wb-cells" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                    {Array.from({ length: perCard }, (_, i) => cardA[i]).map((e, i) => (
                      <div key={i} className={`wb-cell${shows.numberOnly ? " is-number" : ""}`}>
                        {e && (
                          <>
                            <div className="wb-cell-top">
                              <b>{e.number}</b>
                              {shows.name && <span>{e.name}</span>}
                            </div>
                            {shows.diagram && !shows.numberOnly && e.scene && <PlayThumb scene={e.scene} label={e.name} />}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <p className="wb-summary">
                  {entries.length} {entries.length === 1 ? "play" : "plays"} · {cards} {cards === 1 ? "card" : "cards"} · prints{" "}
                  {cards * (copies.qb + copies.center)} wristband {cards * (copies.qb + copies.center) === 1 ? "card" : "cards"}
                  {copies.coach ? ` and ${copies.coach} coach ${copies.coach === 1 ? "sheet" : "sheets"}` : ""} on letter paper.
                  {entries.some((e) => !e.scene) && " Calls without a linked play print as a number."}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
