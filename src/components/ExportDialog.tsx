import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";
import { EXPORT_SIZES, type ExportSizeId } from "../lib/tools";
import {
  defaultSheetOptions,
  playToPng,
  playsToPdf,
  sceneToSvg,
  slug,
  triggerDownload,
  WRISTBAND_COUNTS,
  type SheetOptions,
} from "../lib/export";
import { cappedDpi, gateSheets, gateSize, gateVector, type Tier } from "../lib/plan";
import type { StoredPlay } from "../lib/types";

type Exportable = Pick<StoredPlay, "name" | "formation" | "playType" | "description" | "scene">;

type Props = {
  plays: Exportable[];
  tier: Tier;
  onClose: () => void;
  onUpgrade: () => void;
  onDone?: (kind: string) => void;
};

const DPI_STEPS = [96, 150, 300, 600];

export function ExportDialog({ plays, tier, onClose, onUpgrade, onDone }: Props) {
  const [kind, setKind] = useState<"pdf" | "png" | "svg">("pdf");
  const [options, setOptions] = useState<SheetOptions>({ ...defaultSheetOptions, dpi: cappedDpi(tier, 300) });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const sheetGate = gateSheets(tier);
  const sizeGate = gateSize(tier, options.size);
  const vectorGate = gateVector(tier);
  const many = plays.length > 1;
  const watermark = tier.watermark ? "GRIDIRONVAULT" : null;
  const size = useMemo(() => EXPORT_SIZES.find((s) => s.id === options.size) ?? EXPORT_SIZES[4], [options.size]);

  const set = (patch: Partial<SheetOptions>) => setOptions((o) => ({ ...o, ...patch }));

  const title = plays.length === 1 ? plays[0].name || "Untitled play" : `${plays.length} plays`;

  async function run() {
    if (!sizeGate.ok) return;
    if (options.perPage > 1 && !sheetGate.ok) return;
    setBusy(true);
    setProblem(null);
    try {
      const stem = slug(plays.length === 1 ? plays[0].name || "play" : "gridironvault-playbook");
      if (kind === "pdf") {
        const doc = await playsToPdf(plays, { ...options, dpi: cappedDpi(tier, options.dpi), watermark }, title);
        doc.save(`${stem}.pdf`);
      } else if (kind === "png") {
        const dpi = cappedDpi(tier, options.dpi);
        for (const play of plays) {
          const url = await playToPng(play, dpi, size.w, options.transparent, watermark);
          triggerDownload(url, `${slug(play.name || "play")}-${dpi}dpi.png`);
        }
      } else {
        for (const play of plays) {
          const svg = sceneToSvg(play.scene, { transparent: options.transparent, watermark });
          triggerDownload(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, `${slug(play.name || "play")}.svg`);
        }
      }
      onDone?.(kind);
      onClose();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The export did not finish. Try a smaller size.");
    } finally {
      setBusy(false);
    }
  }

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
            {busy ? "Building…" : kind === "pdf" ? "Build the PDF" : `Download ${kind.toUpperCase()}`}
          </button>
        </>
      }
    >
      <p className="eyebrow" id="ex-file">File</p>
      <div className="chip-row" style={{ marginBottom: 16 }} role="group" aria-labelledby="ex-file">
        {(["pdf", "png", "svg"] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={`chip${kind === k ? " is-on" : ""}`}
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            disabled={k === "svg" && !vectorGate.ok}
            style={k === "svg" && !vectorGate.ok ? { opacity: 0.55 } : undefined}
          >
            {k === "pdf" ? "Print-ready PDF" : k === "png" ? "PNG image" : "SVG vector"}
            {k === "svg" && !vectorGate.ok && <span className="pill pill-amber">Locked</span>}
          </button>
        ))}
      </div>
      {!vectorGate.ok && <p className="hint" style={{ marginTop: -8, marginBottom: 16 }}>{vectorGate.reason}</p>}

      <p className="eyebrow" id="ex-size">Size</p>
      <div className="size-list" role="radiogroup" aria-labelledby="ex-size">
        {EXPORT_SIZES.map((s) => {
          const gate = gateSize(tier, s.id);
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={options.size === s.id}
              className={`size-opt${options.size === s.id ? " is-on" : ""}`}
              onClick={() => set({ size: s.id as ExportSizeId })}
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
              <span className="dim">
                {s.w} × {s.h} in
              </span>
            </button>
          );
        })}
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
                    ? `Wristband layout — ${n} plays to a card with cut guides printed between them.`
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

      {kind !== "svg" && (
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
              : "300 DPI is the right choice for anything you hand to a player."}
          </p>
        </>
      )}

      <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
        <label className="switch">
          <input type="checkbox" checked={options.includeName} onChange={(e) => set({ includeName: e.target.checked })} />
          Print the play name and formation
        </label>
        <label className="switch">
          <input type="checkbox" checked={options.includeNotes} onChange={(e) => set({ includeNotes: e.target.checked })} />
          Print the coaching notes underneath
        </label>
        <label className="switch">
          <input type="checkbox" checked={options.transparent} onChange={(e) => set({ transparent: e.target.checked })} />
          Drop the field lines — diagram only
        </label>
      </div>

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

      {many && <p className="hint" style={{ marginTop: 12 }}>{plays.length} plays queued, in the order you picked them.</p>}
      {problem && <p className="error-line">{problem}</p>}
    </Modal>
  );
}
