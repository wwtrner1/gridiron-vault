/**
 * Saved wristband setups, the pure part shared by the browser and the API
 * function: a coach names the Wristbands page's settings (card, look,
 * numbering, call sheet) and loads them on any device. The list lives on the
 * account (`wristband_setups`, one row per coach) with a copy in the browser
 * for signed-out use; two copies merge setup by setup (`mergeSetups`), so a
 * setup saved on the phone and another on the laptop both survive.
 */
export const SETUP_LIMITS = { count: 20, name: 40, prefsChars: 20_000, deleted: 100 } as const;

export type BandSetup<P = Record<string, unknown>> = { id: string; name: string; prefs: P; savedAt: string };
/** A deleted setup is remembered by id, so a device that still has it can't bring it back. */
export type SetupTombstone = { id: string; at: string };
export type SetupsDoc<P = Record<string, unknown>> = { setups: BandSetup<P>[]; deleted: SetupTombstone[] };

export const EMPTY_SETUPS: SetupsDoc = { setups: [], deleted: [] };

export const cleanSetupName = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, SETUP_LIMITS.name);

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const iso = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

/** Keep only well-formed setups and tombstones, inside the limits. An old browser's bare array is read as the setups. */
export function cleanSetupsDoc(raw: unknown): SetupsDoc {
  const doc = (Array.isArray(raw) ? { setups: raw } : raw && typeof raw === "object" ? raw : {}) as { setups?: unknown; deleted?: unknown };
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
  return tidy({ setups, deleted });
}

/** Newest first, within the limits, and nothing a tombstone has removed. */
function tidy<P>(doc: SetupsDoc<P>): SetupsDoc<P> {
  const gone = new Map(doc.deleted.map((d) => [d.id, d.at]));
  const setups = doc.setups
    .filter((s) => !(gone.has(s.id) && gone.get(s.id)! >= s.savedAt))
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0))
    .slice(0, SETUP_LIMITS.count);
  const deleted = [...doc.deleted].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, SETUP_LIMITS.deleted);
  return { setups, deleted };
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
  return tidy({ setups: [...byId.values()], deleted: [...tomb].map(([id, at]) => ({ id, at })) });
}

/** The same list, setup for setup (order and tombstones included)? */
export const sameSetups = (a: SetupsDoc<unknown>, b: SetupsDoc<unknown>) => JSON.stringify(a) === JSON.stringify(b);

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
  return { setups: [setup, ...doc.setups.filter((s) => s !== same)], deleted: doc.deleted.filter((d) => d.id !== setup.id) };
}

/** Take a setup off the list and remember the delete, so other devices drop it too. */
export function withoutSetup<P>(doc: SetupsDoc<P>, id: string, now = new Date()): SetupsDoc<P> {
  return { setups: doc.setups.filter((s) => s.id !== id), deleted: [{ id, at: now.toISOString() }, ...doc.deleted.filter((d) => d.id !== id)] };
}

/** Put a deleted setup back (the toast's Undo): its save time moves to now so it outranks the delete. */
export function restoreSetup<P>(doc: SetupsDoc<P>, setup: BandSetup<P>, now = new Date()): SetupsDoc<P> {
  const back = { ...setup, savedAt: now.toISOString() };
  return { setups: [back, ...doc.setups.filter((s) => s.id !== setup.id)], deleted: doc.deleted.filter((d) => d.id !== setup.id) };
}
