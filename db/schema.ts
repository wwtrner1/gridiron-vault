import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** One row per Identity user who has saved anything. */
export const profiles = pgTable("profiles", {
  id: text().primaryKey(), // Netlify Identity user id
  email: text().notNull(),
  displayName: text("display_name").notNull().default(""),
  team: text().notNull().default(""),
  /** Verified mobile number (E.164). One account per phone, one phone per account. */
  phone: text().unique(),
  phoneVerifiedAt: timestamp("phone_verified_at"),
  /** Plan id from src/lib/plan.ts. The server enforces its limits; billing will be the only writer once beta ends. */
  plan: text().notNull().default("beta"),
  createdAt: timestamp("created_at").defaultNow(),
  /** Last time the app talked to the server as this coach (throttled to every few minutes). */
  lastActiveAt: timestamp("last_active_at"),
});

/**
 * One row per account that deleted itself, so the owner's signup history and the
 * free-plan abuse checks survive deletion. Only fingerprints of the phone are
 * kept, never the number, and no plays.
 */
export const accountLedger = pgTable("account_ledger", {
  userId: text("user_id").primaryKey(),
  email: text().notNull(),
  name: text().notNull().default(""),
  /** SHA-256 of the verified phone number, or "" when there was none. */
  phoneHash: text("phone_hash").notNull().default(""),
  lastPlan: text("last_plan").notNull().default(""),
  playCount: integer("play_count").notNull().default(0),
  signedUpAt: timestamp("signed_up_at"),
  deletedAt: timestamp("deleted_at").defaultNow(),
});

/** Everything the owner does in /admin: who, what, to whom. Append-only. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    actorId: text("actor_id").notNull(),
    actorEmail: text("actor_email").notNull(),
    action: text().notNull(),
    targetId: text("target_id").notNull().default(""),
    detail: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    at: timestamp().defaultNow(),
  },
  (t) => [index("audit_log_at_idx").on(t.at)],
);

/**
 * Devices a coach has confirmed with a code to his phone. A sign-in from
 * any other device needs a code; at most three are kept per account.
 */
export const trustedDevices = pgTable(
  "trusted_devices",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    /** SHA-256 of the random device id the browser keeps; the id itself is never stored. */
    deviceHash: text("device_hash").notNull(),
    label: text().notNull().default(""),
    lastSeen: timestamp("last_seen").defaultNow(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [uniqueIndex("trusted_devices_owner_device_idx").on(t.ownerId, t.deviceHash)],
);

/** A single diagrammed play. `scene` holds the editor document. */
export const plays = pgTable(
  "plays",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    ownerName: text("owner_name").notNull().default(""),
    name: text().notNull(),
    formation: text().notNull().default(""),
    playType: text("play_type").notNull().default("pass"),
    personnel: text().notNull().default("5v5"),
    description: text().notNull().default(""),
    tags: jsonb().$type<string[]>().notNull().default([]),
    fieldView: text("field_view").notNull().default("full"),
    scene: jsonb().$type<unknown>().notNull(),
    preview: text().notNull().default(""), // inline SVG thumbnail
    isPublic: boolean("is_public").notNull().default(false),
    saveCount: integer("save_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("plays_owner_idx").on(t.ownerId),
    index("plays_public_idx").on(t.isPublic),
  ],
);

/** A folder of plays. */
export const playbooks = pgTable("playbooks", {
  id: uuid().primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  name: text().notNull(),
  description: text().notNull().default(""),
  color: text().notNull().default("#DB5A33"),
  isPublic: boolean("is_public").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const playbookPlays = pgTable(
  "playbook_plays",
  {
    id: uuid().primaryKey().defaultRandom(),
    playbookId: uuid("playbook_id")
      .notNull()
      .references(() => playbooks.id, { onDelete: "cascade" }),
    playId: uuid("play_id")
      .notNull()
      .references(() => plays.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("playbook_plays_book_idx").on(t.playbookId)],
);

/** Copies of public plays that a coach pulled into their own library. */
export const playSaves = pgTable(
  "play_saves",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    playId: uuid("play_id")
      .notNull()
      .references(() => plays.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("play_saves_user_idx").on(t.userId)],
);

/** The playcaller's spreadsheet: free-form columns plus row data. */
export const callSheets = pgTable(
  "call_sheets",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    name: text().notNull(),
    columns: jsonb().$type<unknown>().notNull(),
    rows: jsonb().$type<unknown>().notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("call_sheets_owner_idx").on(t.ownerId)],
);

/**
 * AI calls per coach per day, so one account can't run up the Claude bill.
 * `kind` is "assistant" (a Griddy message or single play read), "import" (one
 * play of a Griddy bulk import), "photo" (whiteboard photo review) or "texts".
 */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    day: text().notNull(), // YYYY-MM-DD, UTC
    kind: text().notNull(),
    count: integer().notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [uniqueIndex("ai_usage_owner_day_kind_idx").on(t.ownerId, t.day, t.kind)],
);

/**
 * The three usage events (play_created, call_sheet_opened, play_exported)
 * that track() beacons, kept for signed-in coaches only.
 */
export const events = pgTable(
  "events",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    name: text().notNull(),
    payload: jsonb().$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    at: timestamp().defaultNow(),
  },
  (t) => [index("events_owner_idx").on(t.ownerId)],
);

/**
 * A playbook handed to players: a frozen copy of its plays behind an
 * unguessable link, so a player needs no account. `source` is the coach's own
 * playbook id (it can be a browser-only id), so any device finds its link.
 */
export const playbookShares = pgTable(
  "playbook_shares",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    token: text().notNull(),
    source: text().notNull().default(""),
    name: text().notNull(),
    snapshot: jsonb().$type<unknown>().notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [uniqueIndex("playbook_shares_token_idx").on(t.token), index("playbook_shares_owner_idx").on(t.ownerId)],
);

/** Griddy Quiz scores players send back to the coach who shared the playbook. */
export const quizResults = pgTable(
  "quiz_results",
  {
    id: uuid().primaryKey().defaultRandom(),
    shareId: uuid("share_id")
      .notNull()
      .references(() => playbookShares.id, { onDelete: "cascade" }),
    playerName: text("player_name").notNull().default(""),
    letter: text().notNull().default(""),
    score: integer().notNull(),
    total: integer().notNull(),
    at: timestamp().defaultNow(),
  },
  (t) => [index("quiz_results_share_idx").on(t.shareId)],
);

/**
 * One row per visit (a browser tab's session), for the owner's visitor counts and
 * time on site. No IP address, no cookie and no user id: `visitor` is a hash of the
 * browser's random id and the day, so it can't follow anyone from one day to the next.
 */
export const visits = pgTable(
  "visits",
  {
    id: uuid().primaryKey().defaultRandom(),
    sid: text().notNull(),
    day: text().notNull(), // YYYY-MM-DD, UTC
    visitor: text().notNull(),
    signedIn: boolean("signed_in").notNull().default(false),
    landing: text().notNull().default("/"),
    referrer: text().notNull().default(""), // host only
    device: text().notNull().default("desktop"),
    pages: integer().notNull().default(1),
    /** Seconds the page was visible, summed from heartbeats. */
    seconds: integer().notNull().default(0),
    startedAt: timestamp("started_at").defaultNow(),
    lastBeatAt: timestamp("last_beat_at").defaultNow(),
  },
  (t) => [uniqueIndex("visits_sid_idx").on(t.sid), index("visits_day_idx").on(t.day)],
);
