/**
 * The roster table's columns: what each shows, the player fields it edits in
 * the table and the CSV headings it downloads under. Pure, so the table, the
 * CSV and the tests read the same list. The coach's choice of columns lives
 * in `rosterView.ts`.
 *
 * A column is one or more fields. Each field reads and writes one value of a
 * player, so editing in the table and downloading the CSV can't disagree.
 * CSV headings are the ones `rosterCsv` writes, so a downloaded file imports
 * again.
 */
import { CUSTOM_LIMITS, emptyGuardian, emptySizes, HUB_LIMITS, PLAYER_STATUS, STATUS_LABEL, type Guardian, type PlayerInfo, type PlayerStatus, type UniformSizes } from "./teamHub";

export type FieldKind = "text" | "tel" | "email" | "date" | "status" | "number";

export type RosterField = {
  key: string;
  /** The CSV heading and the box's name ("Guardian 1 phone"). */
  label: string;
  /** A short label for the box in the table ("Phone"). */
  short?: string;
  kind: FieldKind;
  max: number;
  get(p: PlayerInfo): string;
  set(p: PlayerInfo, value: string): PlayerInfo;
};

export type RosterColumn = {
  id: string;
  label: string;
  /** Shown before the coach picks columns. A function decides from the players (a player phone column only when someone has one). */
  byDefault: boolean | ((players: PlayerInfo[]) => boolean);
  /** The player's name can't be hidden: every row needs it. */
  fixed?: boolean;
  /** A field the coach added. */
  custom?: boolean;
  fields: RosterField[];
};

const text = (key: keyof PlayerInfo, label: string, max: number, kind: FieldKind = "text", short?: string): RosterField => ({
  key,
  label,
  short,
  kind,
  max,
  get: (p) => String(p[key] ?? ""),
  set: (p, v) => ({ ...p, [key]: v }),
});

const size = (key: keyof UniformSizes, label: string): RosterField => ({
  key: `size.${key}`,
  label,
  short: key === "jersey" ? "Jersey" : key === "shirt" ? "Shirt" : "Pants",
  kind: "text",
  max: 12,
  get: (p) => p.sizes?.[key] ?? "",
  set: (p, v) => ({ ...p, sizes: { ...emptySizes(), ...p.sizes, [key]: v } }),
});

/** A guardian's field; typing into an empty one adds the guardian, and emptying every field of the last one takes it off. */
const guardian = (n: number, key: keyof Omit<Guardian, "text">, label: string, max: number, kind: FieldKind = "text"): RosterField => ({
  key: `guardian.${n}.${key}`,
  label: `Guardian ${n + 1} ${label.toLowerCase()}`,
  short: label,
  kind,
  max,
  get: (p) => p.guardians?.[n]?.[key] ?? "",
  set: (p, v) => {
    const list = [...(p.guardians ?? [])].map((g) => ({ ...g }));
    while (list.length <= n) list.push(emptyGuardian());
    list[n] = { ...list[n], [key]: v };
    // Trailing guardians with nothing in them come off (cleanPlayer would drop them anyway).
    while (list.length && !list[list.length - 1].name && !list[list.length - 1].phone && !list[list.length - 1].email) list.pop();
    return { ...p, guardians: list };
  },
});

const status: RosterField = {
  key: "status",
  label: "Status",
  kind: "status",
  max: 12,
  get: (p) => STATUS_LABEL[p.status] ?? "",
  set: (p, v) => {
    const s = (PLAYER_STATUS as readonly string[]).includes(v) ? (v as PlayerStatus) : (PLAYER_STATUS.find((x) => STATUS_LABEL[x].toLowerCase() === v.toLowerCase()) ?? p.status);
    return { ...p, status: s };
  },
};

const has = (players: PlayerInfo[], get: (p: PlayerInfo) => string) => players.some((p) => get(p).trim());

/** Every column the roster offers, in table order. */
export const ROSTER_COLUMNS: RosterColumn[] = [
  { id: "jersey", label: "#", byDefault: true, fields: [text("jersey", "Jersey #", 3, "number", "#")] },
  {
    id: "player",
    label: "Player",
    byDefault: true,
    fixed: true,
    fields: [text("firstName", "First name", HUB_LIMITS.short, "text", "First"), text("lastName", "Last name", HUB_LIMITS.short, "text", "Last")],
  },
  { id: "middle", label: "Middle name", byDefault: false, fields: [text("middleName", "Middle name", HUB_LIMITS.short)] },
  { id: "status", label: "Status", byDefault: false, fields: [status] },
  { id: "positions", label: "Pos", byDefault: true, fields: [text("positions", "Positions", HUB_LIMITS.short, "text", "Pos")] },
  { id: "grade", label: "Grade / age", byDefault: true, fields: [text("grade", "Grade", 20)] },
  { id: "gradYear", label: "Grad year", byDefault: false, fields: [text("gradYear", "Grad year", 4, "number")] },
  { id: "birthDate", label: "Birth date", byDefault: false, fields: [text("birthDate", "Birth date", 10, "date")] },
  { id: "height", label: "Height", byDefault: false, fields: [text("height", "Height", 12)] },
  { id: "weight", label: "Weight", byDefault: false, fields: [text("weight", "Weight", 12)] },
  { id: "sizes", label: "Sizes", byDefault: true, fields: [size("jersey", "Jersey size"), size("shirt", "Shirt size"), size("pants", "Pants size")] },
  {
    id: "guardian",
    label: "Parent or guardian",
    byDefault: true,
    fields: [guardian(0, "name", "Name", HUB_LIMITS.name), guardian(0, "relation", "Relation", 30)],
  },
  { id: "phone", label: "Parent phone", byDefault: true, fields: [guardian(0, "phone", "Phone", 30, "tel")] },
  { id: "email", label: "Parent email", byDefault: true, fields: [guardian(0, "email", "Email", 254, "email")] },
  {
    id: "guardian2",
    label: "Second parent",
    byDefault: (players) => has(players, (p) => p.guardians?.[1]?.name ?? ""),
    fields: [guardian(1, "name", "Name", HUB_LIMITS.name), guardian(1, "phone", "Phone", 30, "tel"), guardian(1, "email", "Email", 254, "email")],
  },
  { id: "playerPhone", label: "Player phone", byDefault: (players) => has(players, (p) => p.phone), fields: [text("phone", "Player phone", 30, "tel", "Phone")] },
  { id: "playerEmail", label: "Player email", byDefault: (players) => has(players, (p) => p.email), fields: [text("email", "Player email", 254, "email", "Email")] },
  { id: "address", label: "Address", byDefault: false, fields: [text("address", "Address", HUB_LIMITS.text)] },
  { id: "medical", label: "Medical", byDefault: false, fields: [text("medical", "Medical", HUB_LIMITS.notes)] },
  { id: "notes", label: "Coach notes", byDefault: false, fields: [text("notes", "Notes", HUB_LIMITS.notes)] },
];

export const customColumnId = (name: string) => `custom:${name}`;

/** A column for a field the coach added. */
export function customColumn(name: string): RosterColumn {
  return {
    id: customColumnId(name),
    label: name,
    byDefault: true,
    custom: true,
    fields: [
      {
        key: customColumnId(name),
        label: name,
        kind: "text",
        max: CUSTOM_LIMITS.value,
        get: (p) => p.custom?.[name] ?? "",
        set: (p, v) => {
          const custom = { ...(p.custom ?? {}) };
          if (v.trim()) custom[name] = v;
          else delete custom[name];
          return { ...p, custom };
        },
      },
    ],
  };
}

/** The fields the coach added to this team: the view's list first, then any a player carries that the view doesn't know (another coach added it). */
export function customFields(players: PlayerInfo[], added: string[]): string[] {
  const out = [...added];
  const seen = new Set(out.map((f) => f.toLowerCase()));
  for (const p of players)
    for (const k of Object.keys(p.custom ?? {}))
      if (!seen.has(k.toLowerCase())) {
        seen.add(k.toLowerCase());
        out.push(k);
      }
  return out.slice(0, CUSTOM_LIMITS.fields);
}

/** Every column for this team: the built-in ones, then the added fields. */
export const allColumns = (fields: string[]): RosterColumn[] => [...ROSTER_COLUMNS, ...fields.map(customColumn)];

/** Names the coach can't give an added field, because a built-in column already reads that way. */
export const takenNames = (fields: string[]) =>
  new Set([...ROSTER_COLUMNS.flatMap((c) => [c.label, ...c.fields.map((f) => f.label)]), ...fields, "First", "Last", "Name"].map((n) => n.toLowerCase()));

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** The roster as a CSV of the given columns, one CSV column per field. */
export function columnsCsv(players: PlayerInfo[], columns: RosterColumn[]): string {
  const fields = columns.flatMap((c) => c.fields);
  const head = fields.map((f) => csvCell(f.label)).join(",");
  return [head, ...players.map((p) => fields.map((f) => csvCell(f.get(p))).join(","))].join("\n");
}

/** One edit made in the table: the player as it would be saved, or why it can't be. */
export function applyEdit(p: PlayerInfo, field: RosterField, value: string): PlayerInfo | string {
  const v = value.slice(0, field.max);
  const next = field.set(p, field.kind === "email" ? v.trim().toLowerCase() : v);
  if (!next.firstName.trim() && !next.lastName.trim()) return "A player needs a first or last name.";
  return next;
}
