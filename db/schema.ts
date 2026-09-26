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
  createdAt: timestamp("created_at").defaultNow(),
});

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
 * `kind` is "assistant" (Play assistant) or "photo" (whiteboard photo review).
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
