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
  /** End of the 14-day Head Coach trial. Set only while plan is "trial"; the server drops the coach to Sideline after it. */
  trialEndsAt: timestamp("trial_ends_at"),
  /** Stripe's ids for this coach, set when they first pay. Billing (netlify/billing/stripe.ts) is the only writer of plan after that. */
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** End of a one-time Season Pass. Past it, with no subscription, the coach is back on Sideline. */
  planEndsAt: timestamp("plan_ends_at"),
});

/**
 * One row per person who has been given a trial: a fingerprint of their email
 * (variants folded together) and, once verified, of their phone. Kept after the
 * account is deleted, so deleting and signing up again doesn't start another.
 * Fingerprints only: never the address or number.
 */
export const trialClaims = pgTable("trial_claims", {
  keyHash: text("key_hash").primaryKey(),
  kind: text().notNull(), // "email" | "phone"
  userId: text("user_id").notNull(),
  claimedAt: timestamp("claimed_at").defaultNow(),
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
 * play of a Griddy bulk import), "photo" (whiteboard photo review or one play read
 * from a scanned page), "scan" (a scanned page looked over for plays) or "texts".
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

/**
 * A copy of every play, playbook or Season Grid a coach deletes, kept for 30 days
 * so the owner can put it back if it was deleted by mistake. Account deletion
 * does not use this: it removes the coach's work for good.
 */
export const trash = pgTable(
  "trash",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    kind: text().notNull(), // "play" | "playbook" | "call_sheet"
    originalId: text("original_id").notNull(),
    name: text().notNull().default(""),
    /** The whole row, plus `playIds` for a playbook's members. */
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    deletedAt: timestamp("deleted_at").defaultNow(),
    restoredAt: timestamp("restored_at"),
  },
  (t) => [index("trash_owner_idx").on(t.ownerId)],
);

/**
 * Front Office: a league or program director's organisation. The director
 * (`ownerId`) invites coaches by email and hands them read-only playbooks.
 */
export const organizations = pgTable(
  "organizations",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    ownerName: text("owner_name").notNull().default(""),
    name: text().notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [uniqueIndex("organizations_owner_idx").on(t.ownerId)],
);

/**
 * A coach invited into an organisation. `email` is what the director typed
 * (lower case); `userId` is set when the coach signed in with that address and
 * accepted. Only accepted members can open the organisation's playbooks.
 */
export const orgMembers = pgTable(
  "org_members",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text().notNull(),
    userId: text("user_id"),
    name: text().notNull().default(""),
    status: text().notNull().default("invited"), // "invited" | "active"
    invitedAt: timestamp("invited_at").defaultNow(),
    joinedAt: timestamp("joined_at"),
  },
  (t) => [
    uniqueIndex("org_members_org_email_idx").on(t.orgId, t.email),
    index("org_members_email_idx").on(t.email),
    index("org_members_user_idx").on(t.userId),
  ],
);

/**
 * A master playbook the director shared with the organisation: a frozen copy
 * (same shape as a player link's snapshot), so members can read and clone it
 * but nothing they do changes the director's plays. `source` is the
 * director's own playbook id, so sharing it again refreshes the same entry.
 */
export const orgShares = pgTable(
  "org_shares",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    source: text().notNull().default(""),
    name: text().notNull(),
    note: text().notNull().default(""),
    snapshot: jsonb().$type<unknown>().notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("org_shares_org_idx").on(t.orgId)],
);

/**
 * Team hub: a team inside an organisation (Varsity, U10 Eagles). The director
 * creates it and picks its staff (`coachIds` are org_members ids, or
 * `allCoaches`). Only the director and that staff can read its roster.
 */
export const teams = pgTable(
  "teams",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text().notNull(),
    level: text().notNull().default(""),
    season: text().notNull().default(""),
    color: text().notNull().default(""),
    coachIds: jsonb("coach_ids").$type<string[]>().notNull().default([]),
    allCoaches: boolean("all_coaches").notNull().default(false),
    /** The team's family texts sign-up link (`/join/:token`), made the first time a coach opens it. */
    joinToken: text("join_token").unique(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("teams_org_idx").on(t.orgId)],
);

/**
 * A parent, guardian or player who signed themselves up for a team's texts on
 * its `/join/:token` page. Carriers only allow texts to people who opted in
 * themselves, so these numbers, never the roster's, are what the server texts.
 * `consent` is the version of the wording they agreed to (`CONSENT_VERSION`).
 * STOP replies are handled by Twilio's Messaging Service, which refuses to
 * send to that number again.
 */
export const textSignups = pgTable(
  "text_signups",
  {
    id: uuid().primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    phone: text().notNull(),
    name: text().notNull().default(""),
    player: text().notNull().default(""),
    consent: text().notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [uniqueIndex("text_signups_team_phone_idx").on(t.teamId, t.phone)],
);

/**
 * One player on a team's roster. Names are columns so the list sorts in SQL;
 * everything else (contacts, guardians, medical notes) is `info`, shaped by
 * `PlayerInfo` in src/lib/teamHub.ts. Minors' details: staff only, never public.
 */
export const teamPlayers = pgTable(
  "team_players",
  {
    id: uuid().primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    jersey: text().notNull().default(""),
    info: jsonb().$type<unknown>().notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("team_players_team_idx").on(t.teamId)],
);

/** A team's depth chart for one unit: spots in order, each with its players 1st string first. Shape: `DepthSlot[]`. */
export const depthCharts = pgTable(
  "depth_charts",
  {
    id: uuid().primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    unit: text().notNull(),
    slots: jsonb().$type<unknown>().notNull(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [uniqueIndex("depth_charts_team_unit_idx").on(t.teamId, t.unit)],
);

/**
 * Team hub calendar: games, practices and meetings. `teamId` null is an event
 * for the whole organisation (only the director adds those). `sheetId` is a
 * Call Sheet id from the coach's own browser, so Game Day opens from a game.
 */
export const hubEvents = pgTable(
  "hub_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    kind: text().notNull().default("other"),
    title: text().notNull(),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at"),
    location: text().notNull().default(""),
    opponent: text().notNull().default(""),
    homeAway: text("home_away").notNull().default(""),
    notes: text().notNull().default(""),
    sheetId: text("sheet_id").notNull().default(""),
    scoreUs: integer("score_us"),
    scoreThem: integer("score_them"),
    canceled: boolean().notNull().default(false),
    createdBy: text("created_by").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("hub_events_org_idx").on(t.orgId, t.startsAt)],
);

/**
 * Team hub messages: the coaches' board (`channel` staff) and announcements to
 * players and families (`family`), with how many emails and texts the server
 * sent. Recipients are always worked out from the roster on the server.
 */
export const hubMessages = pgTable(
  "hub_messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    channel: text().notNull().default("staff"),
    authorId: text("author_id").notNull(),
    authorName: text("author_name").notNull().default(""),
    subject: text().notNull().default(""),
    body: text().notNull(),
    emailed: integer().notNull().default(0),
    texted: integer().notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("hub_messages_org_idx").on(t.orgId, t.createdAt)],
);

/** Team hub folder. `teamId` null is a folder for the whole organisation. */
export const hubFolders = pgTable(
  "hub_folders",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    name: text().notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("hub_folders_org_idx").on(t.orgId)],
);

/**
 * A file in a team hub folder. The bytes live in the private `team-files`
 * Netlify Blobs store under `blobKey` (`<orgId>/<id>`); they are only ever
 * served to signed-in staff, as a download. Deleting a row here does not
 * delete the blob: the routes delete both.
 */
export const hubFiles = pgTable(
  "hub_files",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id")
      .notNull()
      .references(() => hubFolders.id, { onDelete: "cascade" }),
    name: text().notNull(),
    type: text().notNull().default(""),
    size: integer().notNull().default(0),
    blobKey: text("blob_key").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    uploaderName: text("uploader_name").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("hub_files_folder_idx").on(t.folderId), index("hub_files_org_idx").on(t.orgId)],
);

/**
 * My team: a coach's own roster and depth chart, no Front Office needed. One
 * row per coach holding the whole `MyTeamDoc` (src/lib/teamHub.ts), cleaned by
 * `cleanMyTeam`. Holds minors' contacts: owner only, never public.
 */
export const myTeams = pgTable("my_teams", {
  ownerId: text("owner_id").primaryKey(),
  data: jsonb().$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
