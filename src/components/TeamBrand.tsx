import { useRef, useState } from "react";
import { BRAND_NAME_MAX, BRAND_PRESETS, brandStore, inkOn, LogoError, logoFromFile, useBrand } from "../lib/brand";
import { FieldBackground } from "../lib/field";
import { useToast } from "../lib/toast";
import { CANVAS_H, CANVAS_W } from "../lib/types";

/**
 * Team branding: name, logo and colors. The logo's colors are pulled out when
 * it's added, the field shows the logo at midfield and the colors in the end
 * zones, and wristbands and PDFs print them. Kept in this browser.
 */
export function TeamBrand({ teamName }: { teamName: string }) {
  const brand = useBrand();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const set = (patch: Parameters<typeof brandStore.set>[0]) => {
    try {
      brandStore.set(patch);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  async function addLogo(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try {
      const got = await logoFromFile(f);
      if (!got) return toast("That image didn't open. Try saving it as a PNG first.");
      set(got);
      toast("Logo added. Its colors are now your team colors; change them below if they're off.");
    } catch (e) {
      // The logo's own checks speak to the coach; a decode error from the browser doesn't.
      toast(e instanceof LogoError ? e.message : "That image didn't open. Try saving it as a PNG first.");
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }

  return (
    <section className="hub-panel brand-panel" aria-labelledby="brand-h">
      <div className="brand-form">
        <h3 id="brand-h">Team branding</h3>
        <p className="hint">Your logo and colors on the field, wristbands and PDFs. Saved in this browser, and on your account when you sign in.</p>

        <label className="field">
          <span>Name on the field and prints</span>
          <input
            className="input"
            value={brand.name}
            maxLength={BRAND_NAME_MAX}
            placeholder={teamName}
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>

        <div className="brand-logo-row">
          {brand.logo ? <img className="brand-logo" src={brand.logo} alt="Team logo" /> : <span className="brand-logo is-empty">No logo</span>}
          <div className="brand-logo-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => file.current?.click()}>
              {busy ? "Reading…" : brand.logo ? "Change logo" : "Add logo"}
            </button>
            {brand.logo && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => set({ logo: null })}>
                Remove
              </button>
            )}
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              hidden
              onChange={(e) => addLogo(e.target.files?.[0])}
            />
          </div>
        </div>

        <div className="brand-colors">
          <label className="field">
            <span>Primary color</span>
            <input type="color" className="brand-color" value={brand.primary} onChange={(e) => set({ primary: e.target.value })} />
          </label>
          <label className="field">
            <span>Second color</span>
            <input type="color" className="brand-color" value={brand.secondary} onChange={(e) => set({ secondary: e.target.value })} />
          </label>
        </div>

        <div className="brand-presets" role="group" aria-label="Team color presets">
          {BRAND_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`brand-preset${brand.primary === p.primary && brand.secondary === p.secondary ? " is-on" : ""}`}
              title={p.label}
              aria-label={p.label}
              aria-pressed={brand.primary === p.primary && brand.secondary === p.secondary}
              onClick={() => set({ primary: p.primary, secondary: p.secondary })}
              style={{ background: `linear-gradient(135deg, ${p.primary} 50%, ${p.secondary} 50%)` }}
            />
          ))}
        </div>

        <label className="check">
          <input type="checkbox" checked={brand.logoOnField} onChange={(e) => set({ logoOnField: e.target.checked })} />
          Logo at midfield
        </label>
        <label className="check">
          <input type="checkbox" checked={brand.endZones} onChange={(e) => set({ endZones: e.target.checked })} />
          End zones in team colors <small>Red zone and flag fields</small>
        </label>
        <label className="check">
          <input type="checkbox" checked={brand.prints} onChange={(e) => set({ prints: e.target.checked })} />
          On wristbands and PDFs <small>Header in your colors, logo by each play name</small>
        </label>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => brandStore.clear()}>
          Back to GridIronVault colors
        </button>
      </div>

      <figure className="brand-preview">
        <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} role="img" aria-label="Preview of the red zone field with your branding">
          <FieldBackground view="redzone" losY={470} />
        </svg>
        <figcaption>
          <span className="brand-band" style={{ background: brand.primary, color: inkOn(brand.primary) }}>
            {brand.logo && <img src={brand.logo} alt="" />}
            {(brand.name.trim() || teamName).toUpperCase()} · CARD A
          </span>
        </figcaption>
      </figure>
    </section>
  );
}
