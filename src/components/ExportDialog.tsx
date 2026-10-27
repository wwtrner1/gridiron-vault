import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";
import { EXPORT_SIZES } from "../lib/tools";
import {
  CUSTOM_LIMITS,
  defaultSheetOptions,
  noteSize,
  pdfSlots,
  playToImage,
  playsToPdf,
  PrintDiagram,
  sceneToSvg,
  sheetSize,
  slug,
  triggerDownload,
  WRISTBAND_COUNTS,
  type SheetOptions,
  type SizeChoice,
} from "../lib/export";
import { CARD_LOOK, FIELD_OPTIONS, FIT_OPTIONS, FULL_LOOK, WEIGHT_STEPS, type PrintLook } from "../lib/printLook";
import { cappedDpi, gateSheets, gateSize, gateVector, type Tier } from "../lib/plan";
import type { StoredPlay } from "../lib/types";
import { loadRules } from "../lib/rules";
import { CANVAS_H, CANVAS_W } from "../lib/types";

type Exportable = Pick<StoredPlay, "name" | "formation" | "playType" | "description" | "scene">;

type Props = {
  plays: Exportable[];
  tier: Tier;
  onClose: () => void;
  onUpgrade: () => void;
  onDone?: (kind: string) => void;
};

type Kind = "pdf" | "png" | "jpeg" | "svg" | "pptx";

const KINDS: { id: Kind; label: string }[] = [
  { id: "pdf", label: "Print-ready PDF" },
  { id: "png", label: "PNG image" },
  { id: "jpeg", label: "JPEG image" },
  { id: "svg", label: "SVG vector" },
  { id: "pptx", label: "PowerPoint" },
];

const DPI_STEPS = [86, 150, 300, 600];

/** One click to a known-good print setup; everything stays editable afterwards. */
const EXPORT_PRESETS: { id: string; label: string; hint: string; options: Partial<SheetOptions> & { size: SizeChoice } }[] = [
  {
    id: "bold",
    label: "Wristband bold",
    hint: "One play per 4.75 × 2.50 in card: zoomed in, extra-thick routes, big players. For the full 6 or 8-up card, use the Wristbands page.",
    options: {
      size: "wristband-lg",
      perPage: 1,
      includeName: true,
      includeNotes: false,
      transparent: false,
      look: { fit: "play", weight: "auto", field: "yards", icons: 1.3, lines: 1.5 },
    },
  },
  {
    id: "binder",
    label: "Install binder",
    hint: "One play per letter page with the whole field and your coaching notes underneath.",
    options: { size: "letter-p", perPage: 1, includeName: true, includeNotes: true, transparent: false, look: FULL_LOOK },
  },
];

/** Small cards print zoomed in and heavier; big pages print the field as drawn. */
const lookForSize = (w: number, h: number): PrintLook => (w < 5.5 && h < 5.5 ? CARD_LOOK : FULL_LOOK);

export function ExportDialog({ plays, tier, onClose, onUpgrade, onDone }: Props) {
  const [kind, setKind] = useState<Kind>("pdf");
  // Rule lines start on when the coach has them on in Field controls.
  const [options, setOptions] = useState<SheetOptions>(() => ({
    ...defaultSheetOptions,
    dpi: cappedDpi(tier, 300),
    custom: { w: 4.75, h: 2.5 },
    look: { ...(defaultSheetOptions.look ?? FULL_LOOK), rules: loadRules().on },
  }));
  const [order, setOrder] = useState<number[]>(() => plays.map((_, i) => i));
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const sheetGate = gateSheets(tier);
  const sizeGate = gateSize(tier, options.size);
  const vectorGate = gateVector(tier);
  const many = plays.length > 1;
  const watermark = tier.watermark ? "GRIDIRONVAULT" : null;
  const size = useMemo(() => sheetSize(options), [options]);
  const look = options.look ?? FULL_LOOK;
  const ordered = order.map((i) => plays[i]).filter(Boolean);
  const vectorPdf = kind === "pdf" && vectorGate.ok;

  // A new look (size or preset) keeps the rule-lines switch unless it sets its own.
  const set = (patch: Partial<SheetOptions>) =>
    setOptions((o) => ({ ...o, ...patch, ...(patch.look ? { look: { rules: o.look?.rules, ...patch.look } } : {}) }));
  const setLook = (patch: Partial<PrintLook>) => setOptions((o) => ({ ...o, look: { ...(o.look ?? FULL_LOOK), ...patch } }));
  const pickSize = (id: SizeChoice) => {
    const next = sheetSize({ ...options, size: id });
    set({ size: id, look: lookForSize(next.w, next.h) });
  };
  const setCustom = (patch: Partial<{ w: number; h: number }>) => {
    const custom = { ...(options.custom ?? { w: 4.75, h: 2.5 }), ...patch };
    set({ custom, look: lookForSize(custom.w, custom.h) });
  };

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length || from === to) return;
    setOrder((o) => {
      const next = [...o];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  const title = plays.length === 1 ? plays[0].name || "Untitled play" : `${plays.length} plays`;

  async function run() {
    if (!sizeGate.ok) return;
    if (options.perPage > 1 && !sheetGate.ok) return;
    setBusy(true);
    setProblem(null);
    try {
      const stem = slug(plays.length === 1 ? plays[0].name || "play" : "gridironvault-playbook");
      const dpi = cappedDpi(tier, options.dpi);
      // Images and slides take the page's shape so a zoomed play fills them edge to edge.
      const shaped = { look, widthIn: size.w, heightIn: look.fit === "play" ? size.h : (size.w * CANVAS_H) / CANVAS_W };
      if (kind === "pdf") {
        const doc = await playsToPdf(ordered, { ...options, dpi, watermark, vector: vectorGate.ok }, title);
        doc.save(`${stem}.pdf`);
      } else if (kind === "png" || kind === "jpeg") {
        for (const play of ordered) {
          const url = await playToImage(play, {
            ...shaped,
            dpi,
            inches: size.w,
            transparent: kind === "png" && options.transparent,
            watermark,
            type: kind === "png" ? "image/png" : "image/jpeg",
          });
          triggerDownload(url, `${slug(play.name || "play")}-${dpi}dpi.${kind === "png" ? "png" : "jpg"}`);
        }
      } else if (kind === "svg") {
        for (const play of ordered) {
          const svg = sceneToSvg(play.scene, { ...shaped, transparent: options.transparent, watermark });
          triggerDownload(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, `${slug(play.name || "play")}.svg`);
        }
      } else {
        const { playsToPptx } = await import("../lib/pptxExport");
        const deck = await playsToPptx(ordered, {
          look,
          dpi: Math.min(dpi, 300),
          watermark,
          includeNotes: options.includeNotes,
          includeName: options.includeName,
          title,
        });
        await deck.save(`${stem}.pptx`);
      }
      onDone?.(kind);
      onClose();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The export did not finish. Try a smaller size.");
    } finally {
      setBusy(false);
    }
  }

  // Print preview: the first page exactly as the PDF lays it out.
  const previewOptions: SheetOptions = { ...options, perPage: kind === "pdf" ? options.perPage : 1 };
  const previewSlots = pdfSlots(ordered.slice(0, previewOptions.perPage), previewOptions);
  const pct = (v: number, whole: number) => `${(v / whole) * 100}%`;
  const cq = (pt: number) => `${(pt / 72 / size.w) * 100}cqw`;

  return (
    <Modal
      title={`Export ${title}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={run} disabled={busy || !sizeGate.ok}>
            <Icon name={kind === "pdf" ? "print" : "download"} size={15} />
            {busy ? "Building…" : kind === "pdf" ? "Build the PDF" : kind === "pptx" ? "Download the deck" : `Download ${kind.toUpperCase()}`}
          </button>
        </>
      }
    >
      <p className="eyebrow" id="ex-file">File</p>
      <div className="chip-row" style={{ marginBottom: 16 }} role="group" aria-labelledby="ex-file">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            className={`chip${kind === k.id ? " is-on" : ""}`}
            onClick={() => setKind(k.id)}
            aria-pressed={kind === k.id}
            disabled={k.id === "svg" && !vectorGate.ok}
            style={k.id === "svg" && !vectorGate.ok ? { opacity: 0.55 } : undefined}
          >
            {k.label}
            {k.id === "svg" && !vectorGate.ok && <span className="pill pill-amber">Locked</span>}
          </button>
        ))}
      </div>
      {!vectorGate.ok && <p className="hint" style={{ marginTop: -8, marginBottom: 16 }}>{vectorGate.reason}</p>}

      <p className="eyebrow" id="ex-presets">One-click styles</p>
      <div className="chip-row" style={{ marginBottom: 16 }} role="group" aria-labelledby="ex-presets">
        {EXPORT_PRESETS.map((pre) => (
          <Tooltip key={pre.id} title={pre.label} hint={pre.hint} side="top">
            <button
              type="button"
              className="chip"
              disabled={!gateSize(tier, pre.options.size).ok}
              onClick={() => {
                setKind("pdf");
                setOptions((o) => ({ ...o, ...pre.options }));
              }}
            >
              {pre.label}
            </button>
          </Tooltip>
        ))}
      </div>

      <div className="ex-preview" aria-label={`Print preview, ${size.w} by ${size.h} inches`}>
        <div
          className="ex-page"
          style={{ width: Math.round(Math.min(360, (300 * size.w) / size.h)), aspectRatio: `${size.w} / ${size.h}` }}
        >
          {previewSlots.map((slot, i) => {
            const play = ordered[i];
            return (
              <div key={i}>
                {options.includeName && kind !== "svg" && (
                  <div
                    className="ex-page-title"
                    style={{
                      left: pct(slot.x, size.w),
                      top: pct(slot.y, size.h),
                      width: pct(slot.cellW, size.w),
                      height: pct(slot.titleH, size.h),
                      fontSize: cq(slot.small ? 10 : 13),
                    }}
                  >
                    <b>{play.name || "Untitled play"}</b>
                    <span style={{ fontSize: cq(slot.small ? 6.5 : 8) }}>
                      {[play.formation, play.playType].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                )}
                <div
                  className="ex-page-art"
                  style={{ left: pct(slot.art.x, size.w), top: pct(slot.art.y, size.h), width: pct(slot.art.w, size.w), height: pct(slot.art.h, size.h) }}
                >
                  <PrintDiagram
                    scene={play.scene}
                    look={look}
                    widthIn={slot.art.w}
                    heightIn={slot.art.h}
                    transparent={options.transparent}
                    watermark={watermark}
                    label={play.name}
                  />
                </div>
                {slot.notesH > 0 && kind !== "svg" && (
                  <p
                    className="ex-page-notes"
                    style={{
                      left: pct(slot.x, size.w),
                      top: pct(slot.art.y + slot.art.h + 0.04, size.h),
                      width: pct(slot.cellW, size.w),
                      height: pct(slot.notesH, size.h),
                      fontSize: cq(noteSize(slot)),
                    }}
                  >
                    {slot.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <p className="hint">
          {size.w} × {size.h} in
          {kind === "pdf" ? (vectorPdf ? " · vector lines, sharp at any print size" : ` · ${cappedDpi(tier, options.dpi)} DPI`) : ""}
        </p>
      </div>

      <p className="eyebrow" id="ex-size">Size</p>
      <div className="size-list" role="radiogroup" aria-labelledby="ex-size">
        {[...EXPORT_SIZES, { id: "custom" as const, label: "Custom size", w: 0, h: 0, note: "Any width and height — measure your wristband window or card stock." }].map((s) => {
          const gate = gateSize(tier, s.id);
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={options.size === s.id}
              className={`size-opt${options.size === s.id ? " is-on" : ""}`}
              onClick={() => pickSize(s.id)}
              disabled={!gate.ok}
              style={!gate.ok ? { opacity: 0.55 } : undefined}
            >
              <span className="radio-dot" aria-hidden="true" />
              <span>
                <strong>
                  {s.label} {!gate.ok && <span className="pill pill-amber">Locked</span>}
                </strong>
                <small>{s.note}</small>
              </span>
              <span className="dim">{s.id === "custom" ? "" : `${s.w} × ${s.h} in`}</span>
            </button>
          );
        })}
      </div>
      {options.size === "custom" && (
        <div className="ex-dims">
          {(["w", "h"] as const).map((k) => (
            <label key={k}>
              {k === "w" ? "Width (in)" : "Height (in)"}
              <input
                className="input"
                type="number"
                step={0.05}
                min={CUSTOM_LIMITS.min}
                max={CUSTOM_LIMITS.max}
                value={options.custom?.[k] ?? ""}
                onChange={(e) => setCustom({ [k]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
      )}

      <p className="eyebrow" style={{ marginTop: 18 }} id="ex-look">
        Diagram
      </p>
      <div className="chip-row" role="group" aria-labelledby="ex-look">
        {FIT_OPTIONS.map((f) => (
          <Tooltip key={f.id} title={f.label} hint={f.hint} side="top">
            <button type="button" className={`chip${look.fit === f.id ? " is-on" : ""}`} aria-pressed={look.fit === f.id} onClick={() => setLook({ fit: f.id })}>
              {f.label}
            </button>
          </Tooltip>
        ))}
      </div>
      <div className="ex-dims">
        <label>
          Line and player weight
          <select className="select" value={String(look.weight)} onChange={(e) => setLook({ weight: e.target.value === "auto" ? "auto" : Number(e.target.value) })}>
            {WEIGHT_STEPS.map((w) => (
              <option key={String(w)} value={String(w)}>
                {w === "auto" ? "Auto, sized for the page" : w === 1 ? "As drawn (1×)" : `${w}× heavier`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Field
          <select className="select" value={look.field} onChange={(e) => setLook({ field: e.target.value as PrintLook["field"] })}>
            {FIELD_OPTIONS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="switch">
          <input type="checkbox" checked={!!look.rules} onChange={(e) => setLook({ rules: e.target.checked })} />
          League rush line and no-run zone
        </label>
      </div>

      {kind === "pdf" && (
        <>
          <p className="eyebrow" style={{ marginTop: 18 }} id="ex-per">
            Plays per sheet
          </p>
          <div className="chip-row" role="group" aria-labelledby="ex-per">
            {[1, 2, 4, ...WRISTBAND_COUNTS].map((n) => (
              <Tooltip
                key={n}
                title={n === 1 ? "One play per page" : `${n} plays per sheet`}
                hint={
                  WRISTBAND_COUNTS.includes(n as 6 | 8 | 10)
                    ? `${n} plays to a sheet with cut guides between them. For real wristband cards, use the Wristbands page.`
                    : "Cut guides print between plays so you can trim them apart."
                }
                side="top"
              >
                <button
                  type="button"
                  className={`chip${options.perPage === n ? " is-on" : ""}`}
                  onClick={() => set({ perPage: n })}
                  disabled={n > 1 && !sheetGate.ok}
                  aria-pressed={options.perPage === n}
                  aria-label={n === 1 ? "One play per page" : `${n} plays per sheet`}
                >
                  {n}
                </button>
              </Tooltip>
            ))}
          </div>
          {!sheetGate.ok && (
            <div className="lock-note">
              <Icon name="lock" size={15} />
              <span>
                {sheetGate.reason}{" "}
                <button type="button" className="btn btn-quiet btn-sm" onClick={onUpgrade}>
                  {sheetGate.cta}
                </button>
              </span>
            </div>
          )}
        </>
      )}

      {kind !== "svg" && !vectorPdf && (
        <>
          <p className="eyebrow" style={{ marginTop: 18 }} id="ex-dpi">
            Resolution
          </p>
          <div className="chip-row" role="group" aria-labelledby="ex-dpi">
            {DPI_STEPS.map((d) => (
              <button
                key={d}
                type="button"
                className={`chip${options.dpi === d ? " is-on" : ""}`}
                onClick={() => set({ dpi: d })}
                disabled={d > tier.maxDpi}
                aria-pressed={options.dpi === d}
                aria-label={d > tier.maxDpi ? `${d} DPI — locked on ${tier.name}` : `${d} DPI`}
              >
                {d} DPI {d > tier.maxDpi && <Icon name="lock" size={11} />}
              </button>
            ))}
          </div>
          <p className="hint">
            {tier.maxDpi < 300
              ? `${tier.name} exports top out at ${tier.maxDpi} DPI — fine on screen, soft on paper. Head Coach prints at 300.`
              : kind === "pptx"
                ? "Slides use up to 300 DPI, sharp on any projector."
                : "300 DPI is the right choice for anything you hand to a player; 600 for booklets."}
          </p>
        </>
      )}

      <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
        {kind !== "png" && kind !== "jpeg" && kind !== "svg" && (
          <>
            <label className="switch">
              <input type="checkbox" checked={options.includeName} onChange={(e) => set({ includeName: e.target.checked })} />
              Print the play name and formation
            </label>
            <label className="switch">
              <input type="checkbox" checked={options.includeNotes} onChange={(e) => set({ includeNotes: e.target.checked })} />
              Print the coaching notes underneath
            </label>
          </>
        )}
        {kind !== "jpeg" && kind !== "pptx" && (
          <label className="switch">
            <input type="checkbox" checked={options.transparent} onChange={(e) => set({ transparent: e.target.checked })} />
            Drop the field lines — diagram only
          </label>
        )}
      </div>

      {many && (
        <>
          <p className="eyebrow" style={{ marginTop: 18 }} id="ex-order">
            Order
          </p>
          <ol className="ex-order" aria-labelledby="ex-order">
            {order.map((pi, at) => (
              <li
                key={pi}
                draggable
                className={dragFrom === at ? "is-dragging" : undefined}
                onDragStart={(e) => {
                  setDragFrom(at);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(at));
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom !== null) move(dragFrom, at);
                  setDragFrom(null);
                }}
                onDragEnd={() => setDragFrom(null)}
              >
                <span className="ex-grip" aria-hidden="true">⋮⋮</span>
                <span className="ex-order-name">{plays[pi].name || "Untitled play"}</span>
                <button type="button" className="btn btn-quiet btn-sm" aria-label={`Move ${plays[pi].name || "play"} up`} disabled={at === 0} onClick={() => move(at, at - 1)}>
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  aria-label={`Move ${plays[pi].name || "play"} down`}
                  disabled={at === order.length - 1}
                  onClick={() => move(at, at + 1)}
                >
                  ↓
                </button>
              </li>
            ))}
          </ol>
          <p className="hint">Drag a play, or use the arrows, to set the print order.</p>
        </>
      )}

      {watermark && (
        <div className="lock-note">
          <Icon name="lock" size={15} />
          <span>
            Free exports carry a GridIronVault stamp. Any plan removes it and unlocks clean 300-DPI print.{" "}
            <button type="button" className="btn btn-quiet btn-sm" onClick={onUpgrade}>
              See plans
            </button>
          </span>
        </div>
      )}

      {problem && <p className="error-line">{problem}</p>}
    </Modal>
  );
}
