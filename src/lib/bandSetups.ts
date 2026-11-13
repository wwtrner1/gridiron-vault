/**
 * Saved wristband setups: a coach names the Wristbands page's settings
 * (card, look, numbering, call sheet) and loads them again next week. Kept in
 * this browser only, like the page's own settings.
 */
export const BAND_SETUPS_KEY = "grid1ronvault.wristbandSetups.v1";
export const SETUP_LIMITS = { count: 20, name: 40 } as const;

export type BandSetup<P = Record<string, unknown>> = { id: string; name: string; prefs: P; savedAt: string };

export function loadSetups<P>(): BandSetup<P>[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BAND_SETUPS_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (s): s is BandSetup<P> =>
        !!s && typeof s.id === "string" && typeof s.name === "string" && !!s.prefs && typeof s.prefs === "object",
    );
  } catch {
    return [];
  }
}

/** False when the browser refused the write (a private window or a full disk). */
export function storeSetups<P>(list: BandSetup<P>[]): boolean {
  try {
    localStorage.setItem(BAND_SETUPS_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export const cleanSetupName = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, SETUP_LIMITS.name);

/**
 * Add a setup, or replace the one with the same name (any case), newest
 * first. Null when the list is full and the name is new.
 */
export function withSetup<P>(list: BandSetup<P>[], name: string, prefs: P, now = new Date()): BandSetup<P>[] | null {
  const clean = cleanSetupName(name);
  if (!clean) return null;
  const same = list.find((s) => s.name.toLowerCase() === clean.toLowerCase());
  if (!same && list.length >= SETUP_LIMITS.count) return null;
  const setup: BandSetup<P> = {
    id: same?.id ?? `setup-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: clean,
    prefs,
    savedAt: now.toISOString(),
  };
  return [setup, ...list.filter((s) => s !== same)];
}
