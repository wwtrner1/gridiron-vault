/**
 * The team hub inside the Front Office: teams, their rosters and everything a
 * staff runs a season with. Shared by the browser and the API function, so
 * both clean a player the same way.
 *
 * Privacy: roster rows hold minors' names, contacts and medical notes. Only
 * the director and the coaches on that team's staff ever receive them, every
 * answer is `private, no-store`, and nothing here is reachable without a
 * sign-in. Never add a public route that returns roster data.
 */

export const HUB_LIMITS = {
  teams: 40,
  players: 150,
  name: 60,
  short: 40,
  text: 120,
  notes: 1000,
  guardians: 3,
  /** Rows one paste can import. */
  importRows: 150,
};

/** Where a player stands right now. */
export const PLAYER_STATUS = ["active", "injured", "inactive"] as const;
export type PlayerStatus = (typeof PLAYER_STATUS)[number];
export const STATUS_LABEL: Record<PlayerStatus, string> = { active: "Active", injured: "Injured", inactive: "Inactive" };

/** A parent, guardian or emergency contact. `text` is their OK to receive team texts. */
export type Guardian = { name: string; relation: string; phone: string; email: string; text: boolean };

/** Uniform sizes as the coach writes them: "YM", "AL", "Youth L", "28". */
export type UniformSizes = { jersey: string; shirt: string; pants: string };
export const SIZE_LABEL: Record<keyof UniformSizes, string> = { jersey: "Jersey", shirt: "Shirt", pants: "Shorts / pants" };

export type PlayerInfo = {
  firstName: string;
  middleName: string;
  lastName: string;
  jersey: string;
  /** As the coach writes them: "QB, S" or "X / CB". */
  positions: string;
  grade: string;
  /** Four-digit graduation year ("2031"), or "". */
  gradYear: string;
  /** yyyy-mm-dd, or "" */
  birthDate: string;
  height: string;
  weight: string;
  status: PlayerStatus;
  phone: string;
  email: string;
  /** The player's own OK to receive team texts (older players). */
  text: boolean;
  address: string;
  guardians: Guardian[];
  /** Allergies, conditions, medication. Coaches only. */
  medical: string;
  notes: string;
  sizes: UniformSizes;
  /** A small square JPEG data URL (`photoFromFile`), or "". */
  photo: string;
  /**
   * Fields the coach added to the roster ("Waiver", "T-shirt paid"): field
   * name to value. Empty values are dropped, so a field nobody filled in
   * lives only in the coach's roster view (`lib/rosterView.ts`).
   */
  custom: Record<string, string>;
};

/** Fields a coach can add to a roster. */
export const CUSTOM_LIMITS = { fields: 12, name: 30, value: 120 };

/** A field name as the coach typed it, tidied; "" when nothing is left. */
export const customName = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, CUSTOM_LIMITS.name) : "");

export type HubPlayer = PlayerInfo & { id: string; teamId: string; updatedAt: string };

export type HubTeam = {
  id: string;
  name: string;
  /** "Varsity", "U10", "Tuesday flag" */
  level: string;
  season: string;
  color: string;
  /** Member ids (org_members.id) on this team's staff. */
  coachIds: string[];
  /** Every coach in the Front Office is on the staff. */
  allCoaches: boolean;
  players: number;
};

/** A coach the director can put on a team's staff. */
export type HubCoach = { id: string; name: string; email: string; active: boolean };

/** What one coach can see of an organisation's hub. */
export type HubState = {
  org: { id: string; name: string };
  role: "director" | "coach";
  teams: HubTeam[];
  /** Filled for the director only. */
  coaches: HubCoach[];
};

export const TEAM_COLORS = ["#0f8aa6", "#1d4ed8", "#c0392b", "#1e8449", "#d35400", "#7d3c98", "#2c3e50", "#b7950b"];

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v).slice(0, max) : "");
const flag = (v: unknown) => v === true || v === "true" || v === "yes" || v === "1" || v === 1;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX = /^#[0-9a-f]{6}$/i;

export const emptyGuardian = (): Guardian => ({ name: "", relation: "", phone: "", email: "", text: false });

export const emptySizes = (): UniformSizes => ({ jersey: "", shirt: "", pants: "" });

export const emptyPlayer = (): PlayerInfo => ({
  firstName: "",
  middleName: "",
  lastName: "",
  jersey: "",
  positions: "",
  grade: "",
  gradYear: "",
  birthDate: "",
  height: "",
  weight: "",
  status: "active",
  phone: "",
  email: "",
  text: false,
  address: "",
  guardians: [],
  medical: "",
  notes: "",
  sizes: emptySizes(),
  photo: "",
  custom: {},
});

/** A player picture is at most this long as a data URL (about 9 KB of JPEG). */
export const PHOTO_MAX_CHARS = 12000;
const PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

/** "31" → "2031"; four digits kept; anything else "". */
function year(v: unknown): string {
  const s = clip(v, 10).replace(/\.0+$/, "");
  if (/^\d{4}$/.test(s)) return s;
  if (/^\d{2}$/.test(s)) return `20${s}`;
  return "";
}

/** A player's added fields, held to the limits; empty values dropped. */
function cleanCustom(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const name = customName(k);
    const value = clip(v, CUSTOM_LIMITS.value);
    if (!name || !value || name in out) continue;
    if (Object.keys(out).length >= CUSTOM_LIMITS.fields) break;
    out[name] = value;
  }
  return out;
}

/** A player as the coach sent it, held to the limits; a string says what is missing. */
export function cleanPlayer(raw: unknown): PlayerInfo | string {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const p: PlayerInfo = {
    firstName: clip(r.firstName, HUB_LIMITS.short),
    middleName: clip(r.middleName, HUB_LIMITS.short),
    lastName: clip(r.lastName, HUB_LIMITS.short),
    jersey: clip(r.jersey, 3),
    positions: clip(r.positions, HUB_LIMITS.short),
    grade: clip(r.grade, 20),
    gradYear: year(r.gradYear),
    birthDate: DATE.test(clip(r.birthDate, 10)) ? clip(r.birthDate, 10) : "",
    height: clip(r.height, 12),
    weight: clip(r.weight, 12),
    status: (PLAYER_STATUS as readonly string[]).includes(String(r.status)) ? (r.status as PlayerStatus) : "active",
    phone: clip(r.phone, 30),
    email: clip(r.email, 254).toLowerCase(),
    text: flag(r.text),
    address: clip(r.address, HUB_LIMITS.text),
    guardians: (Array.isArray(r.guardians) ? r.guardians : [])
      .slice(0, HUB_LIMITS.guardians)
      .map((g) => {
        const o = (g && typeof g === "object" ? g : {}) as Record<string, unknown>;
        return { name: clip(o.name, HUB_LIMITS.name), relation: clip(o.relation, 30), phone: clip(o.phone, 30), email: clip(o.email, 254).toLowerCase(), text: flag(o.text) };
      })
      .filter((g) => g.name || g.phone || g.email),
    medical: clip(r.medical, HUB_LIMITS.notes),
    notes: clip(r.notes, HUB_LIMITS.notes),
    sizes: (() => {
      const o = (r.sizes && typeof r.sizes === "object" ? r.sizes : {}) as Record<string, unknown>;
      return { jersey: clip(o.jersey, 12), shirt: clip(o.shirt, 12), pants: clip(o.pants, 12) };
    })(),
    photo: typeof r.photo === "string" && r.photo.length <= PHOTO_MAX_CHARS && PHOTO.test(r.photo) ? r.photo : "",
    custom: cleanCustom(r.custom),
  };
  if (!p.firstName && !p.lastName) return "Give the player a first or last name.";
  return p;
}

export function cleanTeam(raw: unknown): Omit<HubTeam, "id" | "players"> | string {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = clip(r.name, HUB_LIMITS.name);
  if (!name) return "Name the team first.";
  return {
    name,
    level: clip(r.level, HUB_LIMITS.short),
    season: clip(r.season, HUB_LIMITS.short),
    color: HEX.test(clip(r.color, 7)) ? clip(r.color, 7).toLowerCase() : TEAM_COLORS[0],
    coachIds: (Array.isArray(r.coachIds) ? r.coachIds : []).map((v) => clip(v, 40)).filter(Boolean).slice(0, 60),
    allCoaches: flag(r.allCoaches),
  };
}

export const fullName = (p: Pick<PlayerInfo, "firstName" | "lastName">) => [p.firstName, p.lastName].filter(Boolean).join(" ");

/** "Marcus Hill #12" */
export const playerLabel = (p: Pick<PlayerInfo, "firstName" | "lastName" | "jersey">) => [fullName(p), p.jersey ? `#${p.jersey}` : ""].filter(Boolean).join(" ");

/** Jersey number order, then last name; players without a number last. */
export function byJersey(a: PlayerInfo, b: PlayerInfo) {
  const na = a.jersey === "" ? Infinity : Number(a.jersey);
  const nb = b.jersey === "" ? Infinity : Number(b.jersey);
  if (na !== nb) return (Number.isNaN(na) ? Infinity : na) - (Number.isNaN(nb) ? Infinity : nb);
  return (a.lastName || a.firstName).localeCompare(b.lastName || b.firstName);
}

/* ------------------------------------------------------------------ CSV --- */

/*
 * Spreadsheet headings a coach is likely to have, matched loosely (case,
 * punctuation and spacing don't matter) to the field they fill. League
 * sign-up sheets come in every shape: "FIRST / MIDDLE / LAST / Jersey# / DOB /
 * GRAD YR / DAD / DAD CELL / DAD EMAIL / MOM / MOM EMAIL / MOM CELL" is as
 * common as "Parent name / Parent phone".
 */
type Field =
  | "firstName"
  | "middleName"
  | "lastName"
  | "name"
  | "jersey"
  | "jerseyOrSize"
  | "positions"
  | "grade"
  | "gradYear"
  | "birthDate"
  | "height"
  | "weight"
  | "phone"
  | "email"
  | "address"
  | "medical"
  | "notes"
  | "size.jersey"
  | "size.shirt"
  | "size.pants"
  | "bare.phone"
  | "bare.email";

const HEADINGS: [RegExp, Field][] = [
  [/^(first|first name|fname|given|given name|player first|player first name|athlete first name)$/, "firstName"],
  [/^(middle|middle name|mi|m i|middle initial)$/, "middleName"],
  [/^(last|last name|lname|surname|family name|player last|player last name|athlete last name)$/, "lastName"],
  [/^(name|player|player name|full name|athlete|athlete name|player s name)$/, "name"],
  [/^(#|no|num|number|jersey #|jersey no|jersey num|jersey number|uniform #|uniform no|uniform number|player #)$/, "jersey"],
  [/^(jersey|uniform)$/, "jerseyOrSize"],
  [/^(jersey size|jersey sz|uniform size|game jersey|game jersey size)$/, "size.jersey"],
  [/^(size|shirt|shirt size|t shirt|t shirt size|tee|tee size|top|top size|practice shirt|practice shirt size)$/, "size.shirt"],
  [/^(pants|pant|shorts|short|pants size|pant size|shorts size|short size|shorts \/ pants|pants \/ shorts|bottoms|bottom size)$/, "size.pants"],
  [/^(pos|position|positions)$/, "positions"],
  [/^(grad|grad yr|grad year|graduation|graduation year|class of|yog|year of graduation|hs grad|hs grad year|hs grad yr)$/, "gradYear"],
  [/^(grade|class|school grade|yr|year)$/, "grade"],
  [/^(dob|d o b|birth|birthday|birthdate|birth date|date of birth)$/, "birthDate"],
  [/^(height|ht)$/, "height"],
  [/^(weight|wt)$/, "weight"],
  [/^(player phone|player cell|athlete phone|athlete cell|player mobile)$/, "phone"],
  [/^(player email|player e mail|athlete email)$/, "email"],
  [/^(phone|cell|cell phone|mobile|phone #|cell #|phone number)$/, "bare.phone"],
  [/^(email|e mail|email address)$/, "bare.email"],
  [/^(address|street|home address|street address|mailing address)$/, "address"],
  [/^(medical|medical notes|allergies|allergy|health|conditions|medical conditions)$/, "medical"],
  [/^(note|notes|comment|comments)$/, "notes"],
];

/** "DAD CELL" → father's phone; "Parent 2 email" → the second parent's email. */
const GUARDIAN = /^(dad|father|mom|mother|parent|guardian|parent \/ guardian|emergency|emergency contact)( ?([123]))?( (name|cell|cell phone|phone|mobile|number|#|phone #|cell #|phone number|email|e mail|email address|relation|relationship))?$/;
const RELATION: Record<string, string> = { dad: "Father", father: "Father", mom: "Mother", mother: "Mother", emergency: "Emergency contact", "emergency contact": "Emergency contact" };

type Column = { field: Field } | { guardian: string; relation: string; key: "name" | "phone" | "email" | "relation" } | { custom: string } | null;

const norm = (h: string) =>
  h
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[_*.:()?-]/g, " ")
    .replace(/#/g, " # ")
    .replace(/\//g, " / ")
    .replace(/\s+/g, " ")
    .trim();

function column(head: string): Column {
  const h = norm(head);
  if (!h) return null;
  const g = h.match(GUARDIAN);
  if (g) {
    const who = g[1] === "father" ? "dad" : g[1] === "mother" ? "mom" : g[1] === "emergency contact" ? "emergency" : g[1].startsWith("parent") || g[1] === "guardian" ? "parent" : g[1];
    const kind = g[5] ?? "name";
    const key = /mail/.test(kind) ? "email" : /relation/.test(kind) ? "relation" : kind === "name" ? "name" : "phone";
    return { guardian: who === "parent" ? `parent${g[3] ?? "1"}` : who, relation: RELATION[who] ?? "", key };
  }
  const found = HEADINGS.find(([re]) => re.test(h));
  return found ? { field: found[1] } : null;
}

/** "YM", "Youth L", "AXL", "2XL", "Small" — a uniform size, not a jersey number. */
const SIZE_VALUE = /^(y|yth|youth|a|ad|adult)?\s*-?\s*(xxs|xs|s|sm|small|m|md|med|medium|l|lg|large|xl|x large|xxl|2xl|xxxl|3xl|4xl)$/i;

/** Rows out of pasted CSV or tab-separated text (quotes allowed). */
export function parseTable(text: string): string[][] {
  const sep = text.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

/** "3/14/2012" or "2012-03-14" → "2012-03-14"; anything else → "". */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * "3/14/2012", "2012-03-14", "March 14, 2012" or an Excel date number
 * (41000 is 2012-04-01) → "2012-03-14"; anything else → "".
 */
export function isoDate(raw: string): string {
  const s = raw.trim();
  const pad = (n: number | string) => String(n).padStart(2, "0");
  if (DATE.test(s)) return s;
  const t = s.match(/^(\d{4}-\d{2}-\d{2})[T ]/);
  if (t) return t[1];
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? (Number(m[3]) > 40 ? `19${m[3]}` : `20${m[3]}`) : m[3];
    return `${y}-${pad(m[1])}-${pad(m[2])}`;
  }
  const w = s.toLowerCase().match(/^([a-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/);
  if (w && MONTHS.includes(w[1])) return `${w[3]}-${pad(MONTHS.indexOf(w[1]) + 1)}-${pad(w[2])}`;
  const n = Number(s);
  // Excel keeps dates as days since 1899-12-30; 1900 to 2119 is plenty for a birth date.
  if (/^\d{3,5}(\.\d+)?$/.test(s) && n > 366 && n < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  return "";
}

/** Excel hands numbers over as "12.0" or "6155550142.0". */
const whole = (v: string) => v.replace(/^(\d+)\.0+$/, "$1");

/**
 * Players out of a spreadsheet's rows. The headings row is the first of the
 * top ten that names at least two fields we know, so a title line above it
 * is fine. Columns nobody recognises are skipped and reported, so the coach
 * can see what didn't come across.
 */
export function playersFromRows(rows: string[][], customFields: string[] = []): { players: PlayerInfo[]; skipped: string[] } {
  const at = rows.slice(0, 10).findIndex((r) => r.filter((h) => column(h)).length >= 2);
  if (at < 0) return { players: [], skipped: [] };
  const head = rows[at];
  const body = rows.slice(at + 1);
  // A heading named like one of the team's added fields fills that field (a downloaded roster comes back whole).
  const ownField = (h: string) => customFields.find((f) => f.toLowerCase() === customName(h).toLowerCase());
  const cols: Column[] = head.map((h) => (ownField(h) ? { custom: ownField(h)! } : column(h)));

  // A bare "EMAIL" or "CELL" right after a parent's column belongs to that parent.
  cols.forEach((c, i) => {
    if (!c || !("field" in c) || (c.field !== "bare.phone" && c.field !== "bare.email")) return;
    const prev = cols[i - 1];
    const key = c.field === "bare.phone" ? "phone" : "email";
    if (prev && "guardian" in prev) cols[i] = { guardian: prev.guardian, relation: prev.relation, key };
    else cols[i] = { field: key };
  });
  // "Jersey" holding YS / YM / AL is the jersey size; holding 12 / 7 / 44 it's the number.
  cols.forEach((c, i) => {
    if (!c || !("field" in c) || c.field !== "jerseyOrSize") return;
    const values = body.map((r) => whole(r[i] ?? "").trim()).filter(Boolean);
    const sizes = values.filter((v) => SIZE_VALUE.test(v)).length;
    cols[i] = { field: sizes > values.length / 2 ? "size.jersey" : "jersey" };
  });

  const skipped = head.filter((h, i) => h.trim() && !cols[i]);
  const order: string[] = [];
  const relationOf: Record<string, string> = {};
  for (const c of cols)
    if (c && "guardian" in c) {
      if (!order.includes(c.guardian)) order.push(c.guardian);
      relationOf[c.guardian] ||= c.relation;
    }

  const players: PlayerInfo[] = [];
  for (const cells of body.slice(0, HUB_LIMITS.importRows)) {
    const raw: Record<string, unknown> = {};
    const custom: Record<string, string> = {};
    const sizes = emptySizes();
    const gs: Guardian[] = order.map((key) => ({ ...emptyGuardian(), relation: relationOf[key] }));
    cells.forEach((cell, i) => {
      const c = cols[i];
      const value = whole(cell.trim());
      if (!c || !value) return;
      if ("custom" in c) {
        custom[c.custom] ||= value;
        return;
      }
      if ("guardian" in c) {
        const g = gs[order.indexOf(c.guardian)];
        if (!g[c.key]) (g as Record<string, unknown>)[c.key] = value;
        return;
      }
      const f = c.field;
      if (f === "name") {
        const parts = value.includes(",") ? value.split(",").map((s) => s.trim()).reverse() : value.split(/\s+/);
        raw.firstName ??= parts[0];
        raw.lastName ??= parts.slice(1).join(" ");
      } else if (f.startsWith("size.")) sizes[f.slice(5) as keyof UniformSizes] ||= value;
      else if (f === "birthDate") raw.birthDate ||= isoDate(value);
      else if (f === "jersey") raw.jersey ||= value.replace(/^#/, "");
      else raw[f] ||= value;
    });
    raw.sizes = sizes;
    raw.custom = custom;
    // A guardian with only a relation filled in is no contact at all.
    raw.guardians = gs.filter((g) => g.name || g.phone || g.email);
    const p = cleanPlayer(raw);
    if (typeof p !== "string") players.push(p);
  }
  return { players, skipped };
}

/** Players out of pasted CSV or tab-separated text. */
export const playersFromTable = (text: string) => playersFromRows(parseTable(text));

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** The roster as a spreadsheet the coach can open in Excel or Sheets (and import again). */
export function rosterCsv(players: PlayerInfo[], customFields: string[] = []): string {
  const head = ["First name", "Middle name", "Last name", "Jersey #", "Positions", "Grade", "Grad year", "Birth date", "Height", "Weight", "Status", "Jersey size", "Shirt size", "Pants size", "Player phone", "Player email", "Address"];
  for (let g = 1; g <= HUB_LIMITS.guardians; g++) head.push(`Guardian ${g} name`, `Guardian ${g} relation`, `Guardian ${g} phone`, `Guardian ${g} email`);
  head.push("Medical", "Notes", ...customFields);
  const rows = players.map((p) => {
    const s = p.sizes ?? emptySizes();
    const cells = [p.firstName, p.middleName ?? "", p.lastName, p.jersey, p.positions, p.grade, p.gradYear ?? "", p.birthDate, p.height, p.weight, STATUS_LABEL[p.status], s.jersey, s.shirt, s.pants, p.phone, p.email, p.address];
    for (let g = 0; g < HUB_LIMITS.guardians; g++) {
      const x = p.guardians[g];
      cells.push(x?.name ?? "", x?.relation ?? "", x?.phone ?? "", x?.email ?? "");
    }
    cells.push(p.medical, p.notes, ...customFields.map((f) => p.custom?.[f] ?? ""));
    return cells.map(csvCell).join(",");
  });
  return [head.map(csvCell).join(","), ...rows].join("\n");
}

/* ---------------------------------------------------------- depth chart --- */

export const DEPTH_UNITS = ["offense", "defense", "special"] as const;
export type DepthUnit = (typeof DEPTH_UNITS)[number];
export const UNIT_LABEL: Record<DepthUnit, string> = { offense: "Offense", defense: "Defense", special: "Special teams" };

/**
 * One spot on the depth chart, its players in order (1st string first).
 * `letter` is the playbook letter it plays (X, Q, H...), so the starters can
 * fill the Assignments roster.
 */
export type DepthSlot = {
  key: string;
  label: string;
  letter: string;
  playerIds: string[];
  /** Where the coach dragged this spot on the field view, in percent of the field (x across, y down); unset spots line up by their name. */
  at?: { x: number; y: number };
};
export type DepthChart = { unit: DepthUnit; slots: DepthSlot[]; updatedAt: string };

export const DEPTH_LIMITS = { slots: 30, deep: 6, label: 20 };

type Preset = { id: string; label: string; unit: DepthUnit; slots: [string, string][] };

/** Starting spots by format. [label, playbook letter] */
export const DEPTH_PRESETS: Preset[] = [
  { id: "flag5-o", label: "Flag 5-on-5", unit: "offense", slots: [["QB", "Q"], ["Center", "C"], ["X", "X"], ["Y", "Y"], ["Z", "Z"]] },
  { id: "flag7-o", label: "7-on-7 / Flag 7", unit: "offense", slots: [["QB", "Q"], ["Center", "C"], ["X", "X"], ["Y", "Y"], ["Z", "Z"], ["H", "H"], ["S", "S"]] },
  {
    id: "eleven-o",
    label: "11-man pro set",
    unit: "offense",
    slots: [["QB", "Q"], ["RB", "H"], ["FB", "F"], ["X", "X"], ["Z", "Z"], ["TE", "Y"], ["LT", ""], ["LG", ""], ["C", "C"], ["RG", ""], ["RT", ""]],
  },
  { id: "flag5-d", label: "Flag 5-on-5", unit: "defense", slots: [["Rusher", "R"], ["Corner L", ""], ["Corner R", ""], ["Linebacker", ""], ["Safety", ""]] },
  { id: "flag7-d", label: "7-on-7 / Flag 7", unit: "defense", slots: [["Corner L", ""], ["Corner R", ""], ["Mike", "M"], ["Will", "W"], ["Sam", "S"], ["Free safety", "F"], ["Strong safety", ""]] },
  {
    id: "four3",
    label: "11-man 4-3",
    unit: "defense",
    slots: [["DE", "E"], ["DT", "T"], ["DT", "N"], ["DE", "E"], ["Sam", "S"], ["Mike", "M"], ["Will", "W"], ["CB", ""], ["CB", ""], ["FS", "F"], ["SS", ""]],
  },
  { id: "special", label: "Specialists", unit: "special", slots: [["Kicker", "K"], ["Punter", "P"], ["Long snapper", ""], ["Holder", ""], ["Kick returner", ""], ["Punt returner", ""]] },
];

let slotSeq = 0;
export const slotKey = () => `s${Date.now().toString(36)}${(slotSeq++).toString(36)}`;

export const presetSlots = (id: string): DepthSlot[] =>
  (DEPTH_PRESETS.find((p) => p.id === id)?.slots ?? []).map(([label, letter]) => ({ key: slotKey(), label, letter, playerIds: [] }));

/** A depth chart as sent, held to the limits; only ids in `players` survive, once per spot. */
export function cleanDepth(raw: unknown, players: Set<string>): DepthSlot[] {
  const list = Array.isArray(raw) ? raw.slice(0, DEPTH_LIMITS.slots) : [];
  return list.map((s, i) => {
    const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const ids = (Array.isArray(o.playerIds) ? o.playerIds : []).map(String).filter((id) => players.has(id));
    const slot: DepthSlot = {
      key: clip(o.key, 24) || `s${i}`,
      label: clip(o.label, DEPTH_LIMITS.label) || "Spot",
      letter: clip(o.letter, 2).toUpperCase(),
      playerIds: [...new Set(ids)].slice(0, DEPTH_LIMITS.deep),
    };
    const at = (o.at && typeof o.at === "object" ? o.at : null) as { x?: unknown; y?: unknown } | null;
    const pct = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(100, Math.max(0, v)) * 10) / 10 : null);
    const x = pct(at?.x);
    const y = pct(at?.y);
    if (x !== null && y !== null) slot.at = { x, y };
    return slot;
  });
}

/* ------------------------------------------------------------- schedule --- */

export const EVENT_KINDS = ["game", "practice", "meeting", "other"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const KIND_LABEL: Record<EventKind, string> = { game: "Game", practice: "Practice", meeting: "Meeting", other: "Event" };
export type HomeAway = "home" | "away" | "neutral" | "";

/** Something on the calendar. `teamId` null means the whole Front Office (league day, coaches' meeting). */
export type HubEvent = {
  id: string;
  teamId: string | null;
  kind: EventKind;
  title: string;
  /** ISO instants. */
  startsAt: string;
  endsAt: string | null;
  location: string;
  opponent: string;
  homeAway: HomeAway;
  notes: string;
  /** A Call Sheet's id in the coach's own browser, opened from the game. */
  sheetId: string;
  scoreUs: number | null;
  scoreThem: number | null;
  canceled: boolean;
};

export type EventDraft = Omit<HubEvent, "id">;

export const SCHEDULE_LIMITS = { events: 400, repeat: 26, title: 80, notes: 1000 };

const score = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 && n < 1000 ? n : null;
};

/** An event as sent, held to the limits; a string says what's wrong. */
export function cleanEvent(raw: unknown): EventDraft | string {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = (EVENT_KINDS as readonly string[]).includes(String(r.kind)) ? (r.kind as EventKind) : "other";
  const start = new Date(String(r.startsAt ?? ""));
  if (Number.isNaN(start.getTime())) return "Pick a date and start time.";
  const end = r.endsAt ? new Date(String(r.endsAt)) : null;
  const opponent = clip(r.opponent, HUB_LIMITS.name);
  const title = clip(r.title, SCHEDULE_LIMITS.title) || (kind === "game" && opponent ? `vs ${opponent}` : KIND_LABEL[kind]);
  return {
    teamId: typeof r.teamId === "string" && r.teamId ? r.teamId : null,
    kind,
    title,
    startsAt: start.toISOString(),
    endsAt: end && !Number.isNaN(end.getTime()) && end > start ? end.toISOString() : null,
    location: clip(r.location, HUB_LIMITS.text),
    opponent,
    homeAway: ["home", "away", "neutral"].includes(String(r.homeAway)) ? (r.homeAway as HomeAway) : "",
    notes: clip(r.notes, SCHEDULE_LIMITS.notes),
    sheetId: clip(r.sheetId, 80),
    scoreUs: kind === "game" ? score(r.scoreUs) : null,
    scoreThem: kind === "game" ? score(r.scoreThem) : null,
    canceled: flag(r.canceled),
  };
}

/** Wins, losses and ties from the games with both scores in. */
export function record(events: HubEvent[]) {
  const r = { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
  for (const e of events) {
    if (e.kind !== "game" || e.canceled || e.scoreUs === null || e.scoreThem === null) continue;
    r.pf += e.scoreUs;
    r.pa += e.scoreThem;
    if (e.scoreUs > e.scoreThem) r.w++;
    else if (e.scoreUs < e.scoreThem) r.l++;
    else r.t++;
  }
  return r;
}

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
const icsTime = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** The schedule as an .ics calendar file, for Google Calendar, Outlook or a phone. */
export function scheduleIcs(name: string, events: HubEvent[]): string {
  const now = icsTime(new Date().toISOString());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GridIronVault//Team hub//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${icsText(name)}`];
  for (const e of events) {
    const end = e.endsAt ?? new Date(new Date(e.startsAt).getTime() + (e.kind === "game" ? 2 : 1.5) * 3_600_000).toISOString();
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@gridiron-vault.com`,
      `DTSTAMP:${now}`,
      `DTSTART:${icsTime(e.startsAt)}`,
      `DTEND:${icsTime(end)}`,
      `SUMMARY:${icsText((e.canceled ? "CANCELED: " : "") + e.title)}`,
    );
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    if (e.notes) lines.push(`DESCRIPTION:${icsText(e.notes)}`);
    if (e.canceled) lines.push("STATUS:CANCELLED");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/* ------------------------------------------------------------- messages --- */

/** `staff`: a note on the coaches' board. `family`: an announcement to players and parents. */
export type MessageChannel = "staff" | "family";

export type HubMessage = {
  id: string;
  teamId: string | null;
  channel: MessageChannel;
  authorName: string;
  mine: boolean;
  subject: string;
  body: string;
  /** How many addresses and phones it went to from the server. */
  emailed: number;
  texted: number;
  createdAt: string;
};

/** What the server can send on its own (set up by the site owner). */
export type Delivery = { email: boolean; sms: boolean };

export const MESSAGE_LIMITS = { subject: 120, body: 2000, sms: 600, list: 200, smsPerDay: 300, emailPerDay: 1000 };

/** A team's family contacts: every email, and the phones that said OK to texts. */
export function familyContacts(players: PlayerInfo[]) {
  const emails = new Set<string>();
  const phones = new Set<string>();
  for (const p of players) {
    if (p.status === "inactive") continue;
    if (p.email) emails.add(p.email.toLowerCase());
    if (p.text && p.phone) phones.add(p.phone);
    for (const g of p.guardians) {
      if (g.email) emails.add(g.email.toLowerCase());
      if (g.text && g.phone) phones.add(g.phone);
    }
  }
  return { emails: [...emails], phones: [...phones] };
}

/* ---------------------------------------------------------------- files --- */

/** A folder of files. `teamId` null is a folder for the whole Front Office (only the director adds to it). */
export type HubFolder = { id: string; teamId: string | null; name: string; files: HubFile[] };
export type HubFile = { id: string; name: string; type: string; size: number; uploaderName: string; mine: boolean; createdAt: string };

export const FILE_LIMITS = {
  /** Netlify Functions take about 6 MB per request. */
  size: 5 * 1024 * 1024,
  /** Everything one Front Office stores. */
  total: 500 * 1024 * 1024,
  folders: 60,
  name: 120,
};

/** What a coach can upload: documents, sheets, slides and pictures. Everything downloads as an attachment, never opens in the page. */
export const FILE_TYPES = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "ppt", "pptx", "txt", "rtf", "png", "jpg", "jpeg", "gif", "webp", "heic"];

export const fileExt = (name: string) => (name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? "").toLowerCase();

/** A document or picture kept with one player (birth certificate, physical, waiver, photo). */
export type PlayerFile = { id: string; name: string; type: string; size: number; uploaderName: string; createdAt: string };

export const PLAYER_FILE_LIMITS = {
  /** Files one player can keep. */
  perPlayer: 20,
  /** Everything a coach keeps with their own (My team) players. */
  total: 200 * 1024 * 1024,
};

/** `my.<team id>` for a coach's own team, or a Front Office team's id. */
export const PLAYER_SCOPE = /^(my\.[A-Za-z0-9-]{1,40}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Starter folders a new team gets offered. */
export const STARTER_FOLDERS = ["Forms and waivers", "Medical", "Practice plans", "Scouting reports", "Film notes"];

export const fileSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/* ----------------------------------------------------------- family texts --- */

/**
 * Carriers only deliver texts to people who signed up themselves, so families
 * opt in on the team's `/join/:token` page and the server texts only those
 * numbers. The roster's "OK to text" stays for texting from the coach's own phone.
 */
export type TextSignup = { id: string; name: string; player: string; phone: string; createdAt: string };

export const TEXT_LIMITS = { name: 80, perTeam: 400, perDay: 40 };

/** Bump when the wording below changes, so each sign-up records what it agreed to. */
export const CONSENT_VERSION = "2026-10-28";

/** What a family agrees to, word for word, on the sign-up page. */
export const consentWording = (team: string) =>
  `Text me team updates from ${team} coaches through GridIronVault, such as game times, schedule changes and cancellations. ` +
  "Message frequency varies, usually 1 to 4 a week during the season. Msg & data rates may apply. Reply HELP for help, STOP to cancel. " +
  "Consent is not a condition of joining the team.";

/** The text a new sign-up gets straight away. */
export const SIGNUP_TEXT = (team: string) =>
  `GridIronVault: You're signed up for ${team} team texts. Up to 4 msgs/week in season. Msg & data rates may apply. Reply HELP for help, STOP to cancel.`;

/** Every team text names GridIronVault and the team first, as carriers require. */
export const teamText = (team: string, subject: string, body: string) =>
  `GridIronVault - ${team}: ${subject ? `${subject}. ` : ""}${body}`.slice(0, MESSAGE_LIMITS.sms) + "\nReply STOP to opt out.";

/** "(615) 555-0142" from "+16155550142". */
export const showPhone = (e164: string) => (/^\+1\d{10}$/.test(e164) ? `(${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}` : e164);

/* --------------------------------------------------------------- my team --- */

/**
 * My team: a coach's own teams (rosters and depth charts), kept in the browser
 * and copied to the account while signed in (`my_teams`, one row per coach
 * holding every team). `updatedAt` decides which copy wins when a browser and
 * the account differ. The first team keeps the id `my-team`, so rosters made
 * before a coach could have more than one stay where they were.
 */
export type MyTeamDoc = { id: string; name: string; level: string; season: string; players: HubPlayer[]; charts: DepthChart[]; updatedAt: string };
export type MyTeamsDoc = { teams: MyTeamDoc[]; updatedAt: string };

export const MY_TEAM_ID = "my-team";
export const MY_TEAMS_MAX = 12;
const PLAYER_ID = /^[A-Za-z0-9-]{1,40}$/;

export const blankMyTeam = (id = MY_TEAM_ID, name = "My team"): MyTeamDoc => ({ id, name, level: "", season: "", players: [], charts: [], updatedAt: "" });

/** One My team document as stored or sent, held to the same limits as a Front Office team. */
export function cleanMyTeam(raw: unknown, fallbackId = MY_TEAM_ID): MyTeamDoc {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const id = typeof r.id === "string" && PLAYER_ID.test(r.id) ? r.id : fallbackId;
  const seen = new Set<string>();
  const players = (Array.isArray(r.players) ? r.players : []).slice(0, HUB_LIMITS.players).flatMap((p): HubPlayer[] => {
    const info = cleanPlayer(p);
    const pid = (p as { id?: unknown })?.id;
    if (typeof info === "string" || typeof pid !== "string" || !PLAYER_ID.test(pid) || seen.has(pid)) return [];
    seen.add(pid);
    return [{ ...info, id: pid, teamId: id, updatedAt: clip((p as { updatedAt?: unknown }).updatedAt, 30) }];
  });
  const units = new Set<string>();
  const charts = (Array.isArray(r.charts) ? r.charts : []).flatMap((c): DepthChart[] => {
    const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    const unit = String(o.unit) as DepthUnit;
    if (!DEPTH_UNITS.includes(unit) || units.has(unit)) return [];
    units.add(unit);
    return [{ unit, slots: cleanDepth(o.slots, seen), updatedAt: clip(o.updatedAt, 30) }];
  });
  return {
    id,
    name: clip(r.name, HUB_LIMITS.name) || "My team",
    level: clip(r.level, HUB_LIMITS.short),
    season: clip(r.season, HUB_LIMITS.short),
    players,
    charts,
    updatedAt: clip(r.updatedAt, 30),
  };
}

/**
 * Every team a coach keeps, as stored or sent. A single team (what browsers
 * and the account held before a coach could have more than one) comes back
 * as a list of one.
 */
export function cleanMyTeams(raw: unknown): MyTeamsDoc {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(r.teams) ? r.teams : r.players || r.name ? [raw] : [];
  const ids = new Set<string>();
  const teams: MyTeamDoc[] = [];
  for (const [i, t] of list.slice(0, MY_TEAMS_MAX).entries()) {
    const team = cleanMyTeam(t, i === 0 ? MY_TEAM_ID : `team-${i}`);
    if (ids.has(team.id)) continue;
    ids.add(team.id);
    teams.push(team);
  }
  const newest = teams.reduce((m, t) => (t.updatedAt > m ? t.updatedAt : m), "");
  return { teams, updatedAt: clip(r.updatedAt, 30) || newest };
}
