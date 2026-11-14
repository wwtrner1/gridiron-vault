import { cleanDrill, DRILL_LIMITS, type Drill } from "./drills";
import { PERIOD_KINDS, type Period, type PeriodKind, type Script } from "./practice";

/**
 * The coach's Drill Vault and practice script on the account, the pure part
 * shared by the browser and the API function. One row per coach
 * (`practice_vaults`) holds the coach's own drills, the starred ids and the
 * script; two copies merge (`mergeVault`), so a drill written on the laptop
 * and another on the phone both survive:
 *
 * - drills: each drill's newer save wins, and a delete newer than the save
 *   removes it everywhere (the tombstone list);
 * - stars: the newer starred list wins whole, so an un-star reaches every device;
 * - the script: the newer save wins whole.
 */
export type DrillTombstone = { id: string; at: string };
export type PracticeVault = {
  drills: Drill[];
  deleted: DrillTombstone[];
  favorites: string[];
  /** When the starred list last changed; "" for a browser that never starred. */
  favoritesAt: string;
  script: Script | null;
  /** When the script was last saved; "" when there is none. */
  scriptAt: string;
};

export const PRACTICE_LIMITS = { deleted: 200, favorites: 400, periods: 40, plays: 200, drills: 40 } as const;

export const EMPTY_VAULT: PracticeVault = { drills: [], deleted: [], favorites: [], favoritesAt: "", script: null, scriptAt: "" };

export { PRACTICE_LOCAL_EVENT, PRACTICE_SYNCED_EVENT } from "./practice";

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const iso = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : "");
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const ids = (v: unknown, max: number) => {
  const out: string[] = [];
  for (const x of Array.isArray(v) ? v : []) if (typeof x === "string" && ID.test(x) && !out.includes(x)) out.push(x);
  return out.slice(0, max);
};

/** A practice script read back from anywhere: well-formed periods only, inside the limits. */
export function cleanScript(raw: unknown): Script | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.periods)) return null;
  const periods: Period[] = [];
  const seen = new Set<string>();
  for (const p of r.periods) {
    if (!p || typeof p !== "object") continue;
    const q = p as Record<string, unknown>;
    if (typeof q.id !== "string" || !ID.test(q.id) || seen.has(q.id)) continue;
    seen.add(q.id);
    const period: Period = {
      id: q.id,
      title: str(q.title, 60),
      minutes: Math.max(0, Math.min(240, Math.round(Number(q.minutes) || 0))),
      note: str(q.note, 300),
      playIds: ids(q.playIds, PRACTICE_LIMITS.plays),
      drillIds: ids(q.drillIds, PRACTICE_LIMITS.drills),
    };
    if (PERIOD_KINDS.some((k) => k.id === q.kind)) period.kind = q.kind as PeriodKind;
    periods.push(period);
    if (periods.length >= PRACTICE_LIMITS.periods) break;
  }
  const start = typeof r.start === "string" && /^\d{1,2}:\d{2}$/.test(r.start) ? r.start : "";
  return { name: str(r.name, 80) || "Practice script", start, periods };
}

/** Keep only what is well formed; an unknown shape is an empty vault. */
export function cleanVault(raw: unknown): PracticeVault {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const drills: Drill[] = [];
  const seen = new Set<string>();
  for (const d of Array.isArray(r.drills) ? r.drills : []) {
    // A drill without its own id would get a new one each read, so it can't be merged: drop it.
    if (!d || typeof d !== "object" || typeof (d as Drill).id !== "string" || !(d as Drill).id.startsWith("drl_")) continue;
    const clean = cleanDrill(d);
    if (!clean || seen.has(clean.id)) continue;
    clean.updatedAt = iso(clean.updatedAt) || new Date(0).toISOString();
    seen.add(clean.id);
    drills.push(clean);
  }
  const deleted: DrillTombstone[] = [];
  for (const t of Array.isArray(r.deleted) ? r.deleted : []) {
    const { id, at } = (t ?? {}) as Record<string, unknown>;
    const when = iso(at);
    if (typeof id === "string" && ID.test(id) && when) deleted.push({ id, at: when });
  }
  const script = cleanScript(r.script);
  return tidy({
    drills,
    deleted,
    favorites: ids(r.favorites, PRACTICE_LIMITS.favorites),
    favoritesAt: iso(r.favoritesAt),
    script,
    scriptAt: script ? iso(r.scriptAt) : "",
  });
}

/** Newest drills first, within the limits, and nothing a newer delete has removed. */
function tidy(v: PracticeVault): PracticeVault {
  const gone = new Map(v.deleted.map((d) => [d.id, d.at]));
  const drills = v.drills
    .filter((d) => !(gone.has(d.id) && gone.get(d.id)! >= (d.updatedAt ?? "")))
    .sort((a, b) => ((a.updatedAt ?? "") < (b.updatedAt ?? "") ? 1 : (a.updatedAt ?? "") > (b.updatedAt ?? "") ? -1 : 0))
    .slice(0, DRILL_LIMITS.custom);
  const deleted = [...v.deleted].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, PRACTICE_LIMITS.deleted);
  return { ...v, drills, deleted };
}

/** Two copies as one (see the file's note for who wins what). */
export function mergeVault(a: PracticeVault, b: PracticeVault): PracticeVault {
  const byId = new Map<string, Drill>();
  for (const d of [...a.drills, ...b.drills]) {
    const had = byId.get(d.id);
    if (!had || (d.updatedAt ?? "") > (had.updatedAt ?? "")) byId.set(d.id, d);
  }
  const tomb = new Map<string, string>();
  for (const t of [...a.deleted, ...b.deleted]) if (!tomb.has(t.id) || t.at > tomb.get(t.id)!) tomb.set(t.id, t.at);
  const stars = b.favoritesAt > a.favoritesAt ? b : a;
  const plan = !a.script ? b : !b.script ? a : b.scriptAt > a.scriptAt ? b : a;
  return tidy({
    drills: [...byId.values()],
    deleted: [...tomb].map(([id, at]) => ({ id, at })),
    favorites: stars.favorites,
    favoritesAt: stars.favoritesAt,
    script: plan.script,
    scriptAt: plan.script ? plan.scriptAt : "",
  });
}

/** The same vault, drill for drill (order and tombstones included)? */
export const sameVault = (a: PracticeVault, b: PracticeVault) => JSON.stringify(a) === JSON.stringify(b);
