/**
 * Saved wristband setups, the pure part shared by the browser and the API
 * function: a coach names the Wristbands page's settings (card, look,
 * numbering, call sheet) and loads them on any device. The list lives on the
 * account (`wristband_setups`, one row per coach) with a copy in the browser
 * for signed-out use; two copies merge setup by setup (`mergeSetups`), so a
 * setup saved on the phone and another on the laptop both survive.
 *
 * The same row also holds `current`: the settings the page is on right now
 * (Wes, 2026-11-22: settings follow the account, never one browser). The newer
 * `at` wins, and a copy with no `current` (an older tab) never erases it.
 */
/** The Wristbands page's live settings in this browser, and the event that tells an open page to read them again. */
export const BAND_PREFS_KEY = "grid1ronvault.wristbands.v1";
export const BAND_PREFS_EVENT = "grid1ronvault:wristband-prefs";

export const SETUP_LIMITS = { count: 20, name: 40, prefsChars: 20_000, deleted: 100 } as const;

export type BandSetup<P = Record<string, unknown>> = { id: string; name: string; prefs: P; savedAt: string };
/** A deleted setup is remembered by id, so a device that still has it can't bring it back. */
export type SetupTombstone = { id: string; at: string };
/** The settings the page is on now, stamped when the coach last changed them. */
export type CurrentSettings<P = Record<string, unknown>> = { prefs: P; at: string };
export type SetupsDoc<P = Record<string, unknown>> = { setups: BandSetup<P>[]; deleted: SetupTombstone[]; current?: CurrentSettings<P> };

export const EMPTY_SETUPS: SetupsDoc = { setups: [], deleted: [] };

export const cleanSetupName = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, SETUP_LIMITS.name);

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const iso = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

/** The live settings, or nothing when they are missing, too big or have no time on them. */
function cleanCurrent(raw: unknown): CurrentSettings | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { prefs, at } = raw as Record<string, unknown>;
  const when = iso(at);
  if (!when || !prefs || typeof prefs !== "object" || Array.isArray(prefs)) return undefined;
  if (JSON.stringify(prefs).length > SETUP_LIMITS.prefsChars) return undefined;
  return { prefs: prefs as Record<string, unknown>, at: when };
}

/** Keep only well-formed setups and tombstones, inside the limits. An old browser's bare array is read as the setups. */
export function cleanSetupsDoc(raw: unknown): SetupsDoc {
  const doc = (Array.isArray(raw) ? { setups: raw } : raw && typeof raw === "object" ? raw : {}) as { setups?: unknown; deleted?: unknown; current?: unknown };
  const setups: BandSetup[] = [];
  const seen = new Set<string>();
  for (const s of Array.isArray(doc.setups) ? doc.setups : []) {
    if (!s || typeof s !== "object") continue;
    const { id, name, prefs, savedAt } = s as Record<string, unknown>;
    const clean = typeof name === "string" ? cleanSetupName(name) : "";
    const at = iso(savedAt) ?? new Date(0).toISOString();
    if (typeof id !== "string" || !ID.test(id) || seen.has(id) || !clean) continue;
    if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) continue;
    if (JSON.stringify(prefs).length > SETUP_LIMITS.prefsChars) continue;
    seen.add(id);
    setups.push({ id, name: clean, prefs: prefs as Record<string, unknown>, savedAt: at });
  }
  const deleted: SetupTombstone[] = [];
  for (const d of Array.isArray(doc.deleted) ? doc.deleted : []) {
    const { id, at } = (d ?? {}) as Record<string, unknown>;
    const when = iso(at);
    if (typeof id === "string" && ID.test(id) && when) deleted.push({ id, at: when });
  }
  return tidy({ setups, deleted, current: cleanCurrent(doc.current) });
}

/** Newest first, within the limits, and nothing a tombstone has removed. */
function tidy<P>(doc: SetupsDoc<P>): SetupsDoc<P> {
  const gone = new Map(doc.deleted.map((d) => [d.id, d.at]));
  const setups = doc.setups
    .filter((s) => !(gone.has(s.id) && gone.get(s.id)! >= s.savedAt))
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0))
    .slice(0, SETUP_LIMITS.count);
  const deleted = [...doc.deleted].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, SETUP_LIMITS.deleted);
  return doc.current ? { setups, deleted, current: doc.current } : { setups, deleted };
}

/** Two copies of the list as one: each setup's newer save wins, and a delete newer than the save removes it. */
export function mergeSetups<P>(a: SetupsDoc<P>, b: SetupsDoc<P>): SetupsDoc<P> {
  const byId = new Map<string, BandSetup<P>>();
  for (const s of [...a.setups, ...b.setups]) {
    const had = byId.get(s.id);
    if (!had || s.savedAt > had.savedAt) byId.set(s.id, s);
  }
  const tomb = new Map<string, string>();
  for (const d of [...a.deleted, ...b.deleted]) if (!tomb.has(d.id) || d.at > tomb.get(d.id)!) tomb.set(d.id, d.at);
  // The live settings: whichever copy was changed last; a copy with none leaves the other's alone.
  const current = a.current && b.current ? (b.current.at > a.current.at ? b.current : a.current) : (a.current ?? b.current);
  return tidy({ setups: [...byId.values()], deleted: [...tomb].map(([id, at]) => ({ id, at })), current });
}

/** Keys in a fixed order, so a copy that came back from the database (which keeps no key order) still reads as the same. */
export function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
        .map(([k, val]) => [k, canonical(val)]),
    );
  return v;
}

/** The same value, whatever order its keys came in? */
export const sameValue = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/** The same list, setup for setup (order, tombstones and the live settings included)? */
export const sameSetups = (a: SetupsDoc<unknown>, b: SetupsDoc<unknown>) => sameValue(a, b);

/**
 * The live settings can't be stamped later than `now`. A device whose clock is set ahead would otherwise keep its
 * settings on top of every later change made on a device with the right time.
 */
export function clampCurrent<P>(doc: SetupsDoc<P>, now = new Date()): SetupsDoc<P> {
  const limit = now.toISOString();
  return doc.current && doc.current.at > limit ? { ...doc, current: { ...doc.current, at: limit } } : doc;
}

/** The live settings, stamped now. */
export function withCurrent<P>(doc: SetupsDoc<P>, prefs: P, now = new Date()): SetupsDoc<P> {
  return { ...doc, current: { prefs, at: now.toISOString() } };
}

/**
 * Add a setup, or replace the one with the same name (any case), newest
 * first. Null when the list is full and the name is new.
 */
export function withSetup<P>(doc: SetupsDoc<P>, name: string, prefs: P, now = new Date()): SetupsDoc<P> | null {
  const clean = cleanSetupName(name);
  if (!clean) return null;
  const same = doc.setups.find((s) => s.name.toLowerCase() === clean.toLowerCase());
  if (!same && doc.setups.length >= SETUP_LIMITS.count) return null;
  const setup: BandSetup<P> = {
    id: same?.id ?? `setup-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: clean,
    prefs,
    savedAt: now.toISOString(),
  };
  return { ...doc, setups: [setup, ...doc.setups.filter((s) => s !== same)], deleted: doc.deleted.filter((d) => d.id !== setup.id) };
}

/** Take a setup off the list and remember the delete, so other devices drop it too. */
export function withoutSetup<P>(doc: SetupsDoc<P>, id: string, now = new Date()): SetupsDoc<P> {
  return { ...doc, setups: doc.setups.filter((s) => s.id !== id), deleted: [{ id, at: now.toISOString() }, ...doc.deleted.filter((d) => d.id !== id)] };
}

/** Put a deleted setup back (the toast's Undo): its save time moves to now so it outranks the delete. */
export function restoreSetup<P>(doc: SetupsDoc<P>, setup: BandSetup<P>, now = new Date()): SetupsDoc<P> {
  const back = { ...setup, savedAt: now.toISOString() };
  return { ...doc, setups: [back, ...doc.setups.filter((s) => s.id !== setup.id)], deleted: doc.deleted.filter((d) => d.id !== setup.id) };
}
