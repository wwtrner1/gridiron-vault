/**
 * GridIronVault plans and entitlements.
 *
 * One module owns every gate so the UI, the export pipeline and the API all
 * read the same rules. Plans are stored per-account; until billing is wired up
 * the tier is read from the workspace so beta coaches can be upgraded by hand.
 */

export type TierId = "master" | "beta" | "trial" | "free" | "solo" | "crew" | "program";

export type Tier = {
  id: TierId;
  name: string;
  blurb: string;
  price: string;
  cadence: string;
  seats: string;
  featured?: boolean;
  /** Plays a coach may keep in their Vault. */
  playLimit: number;
  /** Call Sheets they may keep. */
  gridLimit: number;
  /** Playbooks they may make. Playbooks past a cap (made on a bigger plan) are kept, not deleted. */
  playbookLimit: number;
  /** Public Vault plays they may copy into their own Vault each month. */
  copyLimit: number;
  /** Export sizes unlocked, by id from EXPORT_SIZES. */
  sizes: "starter" | "all";
  /** Highest raster DPI allowed. Free exports stay screen-grade. */
  maxDpi: number;
  /** Stamp a GridIronVault watermark across exports. */
  watermark: boolean;
  /** Multi-play PDF and wristband sheets. */
  sheets: boolean;
  /** Share links and playbook hand-off. */
  share: boolean;
  /** Coaches a director can invite into a Front Office (0 = no Front Office of their own; anyone can still join one). */
  orgSeats: number;
  /** Tools held back on the free tier. */
  lockedTools: string[];
  /** Whiteboard photo reviews per month (the costlier AI job). */
  photoReviews: number;
  /** Griddy requests per month (messages and single play reads). */
  assistantCalls: number;
  /** Every starter play, or only the SAMPLE_STARTERS handful. */
  allStarters: boolean;
  /** The 24-play Ready-to-Go playbook. */
  readyBook: boolean;
  /** Plays in one export or print run (PDF, images, slides). */
  exportPlays: number;
  perks: string[];
};

/** Full kit: what every paid plan, the trial and the owner get past the gates below. */
const OPEN = { allStarters: true, readyBook: true, exportPlays: 1_000_000 } as const;
/** Sideline and beta: a taste of the library, a few plays per export, so the material can't walk out the door. */
const SAMPLE = { allStarters: false, readyBook: false, exportPlays: 3 } as const;

export const TIERS: Record<TierId, Tier> = {
  // Not a plan anyone can pick or buy: the server gives it to the owner list (netlify/security/owner.ts).
  master: {
    id: "master",
    name: "All-Access Master",
    blurb: "The owner account. Every tool on, no plan limits.",
    price: "—",
    cadence: "owner",
    seats: "Owner",
    playLimit: 1_000_000,
    gridLimit: 1_000_000,
    playbookLimit: 1_000_000,
    copyLimit: 1_000_000,
    sizes: "all",
    maxDpi: 600,
    watermark: false,
    sheets: true,
    share: true,
    orgSeats: 1_000_000,
    lockedTools: [],
    photoReviews: 1_000_000,
    assistantCalls: 1_000_000,
    ...OPEN,
    perks: ["Every tool and export", "No Vault, Griddy or photo limits", "Owner admin console"],
  },
  // Coaches who joined before trials. Their own drawing stays roomy; the library and exports match Sideline.
  beta: {
    id: "beta",
    name: "Beta Coach",
    blurb: "Draw and keep your own plays. Exports are watermarked; the full library and clean prints come with Head Coach.",
    price: "Free",
    cadence: "during beta",
    seats: "1 coach",
    playLimit: 200,
    gridLimit: 10,
    playbookLimit: 1_000_000,
    copyLimit: 5,
    sizes: "starter",
    maxDpi: 86,
    watermark: true,
    sheets: false,
    share: false,
    orgSeats: 12,
    lockedTools: [],
    photoReviews: 30,
    assistantCalls: 300,
    ...SAMPLE,
    perks: [
      "Every drawing tool on",
      "200 plays of your own",
      "5 starter plays, watermarked exports 3 plays at a time",
      "Founding-coach pricing: Head Coach at $9 a month for life",
    ],
  },
  // Not on the pricing page: the server starts it for a new coach (netlify/security/trial.ts) and drops them to Sideline after TRIAL_DAYS.
  trial: {
    id: "trial",
    name: "Head Coach trial",
    blurb: "Every Head Coach tool for 14 days. No card.",
    price: "Free",
    cadence: "for 14 days",
    seats: "1 coach",
    playLimit: 400,
    gridLimit: 25,
    playbookLimit: 1_000_000,
    copyLimit: 200,
    sizes: "all",
    maxDpi: 300,
    watermark: false,
    sheets: true,
    share: true,
    orgSeats: 0,
    lockedTools: [],
    // The real cost of a trial is Griddy, so it gets a taste, not a month's allowance.
    photoReviews: 5,
    assistantCalls: 40,
    ...OPEN,
    perks: ["Every tool and export for 14 days", "Your plays stay when the trial ends", "Then Sideline, free, or Head Coach"],
  },
  free: {
    id: "free",
    name: "Sideline",
    blurb: "Draw plays, keep a short stack, print a watermarked card.",
    price: "$0",
    cadence: "free, limited",
    seats: "1 coach",
    playLimit: 8,
    gridLimit: 1,
    playbookLimit: 1,
    copyLimit: 5,
    sizes: "starter",
    maxDpi: 86,
    watermark: true,
    sheets: false,
    share: false,
    orgSeats: 0,
    lockedTools: ["pen", "polygon", "zone", "motion", "connect"],
    photoReviews: 0,
    assistantCalls: 5,
    ...SAMPLE,
    perks: [
      "8 plays in your Vault",
      "1 Call Sheet",
      "Wristband + letter export, watermarked, 3 plays at a time",
      "5 Griddy messages a month",
      "5 sample starter plays",
    ],
  },
  solo: {
    id: "solo",
    name: "Head Coach",
    blurb: "One coach, one program, no limits worth thinking about.",
    price: "$12",
    cadence: "per month",
    seats: "1 coach",
    featured: true,
    playLimit: 400,
    gridLimit: 25,
    playbookLimit: 1_000_000,
    copyLimit: 200,
    sizes: "all",
    maxDpi: 300,
    watermark: false,
    sheets: true,
    share: true,
    orgSeats: 0,
    lockedTools: [],
    photoReviews: 30,
    assistantCalls: 300,
    ...OPEN,
    perks: [
      "400 plays in your Vault",
      "All 56 starter plays and the Ready-to-Go playbook",
      "Every drawing tool and mode",
      "Clean 300-DPI export and print",
      "Wristband sheets at 6, 8 or 10 per card",
      "Share links for parents and players",
    ],
  },
  crew: {
    id: "crew",
    name: "Staff",
    blurb: "You and your assistants in the same playbook.",
    price: "$29",
    cadence: "per month",
    seats: "Up to 3 coaches",
    playLimit: 1200,
    gridLimit: 60,
    playbookLimit: 1_000_000,
    copyLimit: 600,
    sizes: "all",
    maxDpi: 600,
    watermark: false,
    sheets: true,
    share: true,
    orgSeats: 3,
    lockedTools: [],
    photoReviews: 90,
    assistantCalls: 900,
    ...OPEN,
    perks: [
      "3 seats on one shared playbook",
      "Everything in Head Coach",
      "600-DPI print for booklets",
      "Practice-plan and install exports",
      "Draw together: your 3 coaches edit one play at the same time",
      "Front Office: hand master playbooks to your 3 coaches",
    ],
  },
  program: {
    id: "program",
    name: "Program",
    blurb: "A league or a multi-team program on one system.",
    price: "$79",
    cadence: "per month",
    seats: "Up to 15 coaches",
    playLimit: 5000,
    gridLimit: 250,
    playbookLimit: 1_000_000,
    copyLimit: 5000,
    sizes: "all",
    maxDpi: 600,
    watermark: false,
    sheets: true,
    share: true,
    orgSeats: 15,
    lockedTools: [],
    photoReviews: 300,
    assistantCalls: 2000,
    ...OPEN,
    perks: [
      "15 seats and shared team Vaults",
      "Front Office: league-wide master playbooks",
      "Bulk wristband runs for every team",
      "Priority support during the season",
    ],
  },
};

/** Days of full Head Coach a new coach gets, once per person. */
export const TRIAL_DAYS = 14;

export const PUBLIC_TIERS: Tier[] = [TIERS.free, TIERS.solo, TIERS.crew, TIERS.program];

/** Other ways to buy Head Coach, for coaches who only need it for a season or a year. */
export const OFFERS: { id: string; name: string; price: string; cadence: string; blurb: string; highlight?: boolean }[] = [
  { id: "season", name: "Season Pass", price: "$29", cadence: "for 4 months", blurb: "Head Coach for one season. Pay once — it does not renew." },
  { id: "yearly", name: "Head Coach yearly", price: "$99", cadence: "per year", blurb: "Every Head Coach feature for about $8 a month, billed once a year." },
  { id: "staff-yearly", name: "Staff yearly", price: "$249", cadence: "per year", blurb: "Staff seats for the whole coaching staff, billed once a year." },
  { id: "program-yearly", name: "Program yearly", price: "$699", cadence: "per year", blurb: "Program seats and Front Office for a league or club, billed once a year." },
  { id: "founding", name: "Founding coaches", price: "$9", cadence: "per month, for life", blurb: "Coach with us during the beta and keep Head Coach at $9 for as long as you stay.", highlight: true },
];

/** Prices are tax-exclusive (`stripe:setup` makes them so and Checkout adds sales tax where it applies), so every paid price says so. */
export const plusTax = (price: string): string => (price === "$0" ? "" : " + tax");

/** Sizes a free coach can print, so the product is genuinely usable first. */
export const STARTER_SIZES = ["wristband", "wristband-lg", "letter-p"];

export function tierFor(id: string | null | undefined): Tier {
  return TIERS[(id as TierId) ?? "beta"] ?? TIERS.beta;
}

/** Starter play numbers open on every plan (the rest come with Head Coach). */
export const SAMPLE_STARTERS = [3, 9, 16, 43, 53];
/** Their names, so a copy already in a Vault can be told apart from the held-back ones. Keep in step with lib/starters.ts. */
export const SAMPLE_STARTER_NAMES = ["Single Back — Base", "Spread — Double Slants", "Trips — Flood", "HB Dive", "Cover 1"];

export const starterOpen = (tier: Tier, n: number) => tier.allStarters || SAMPLE_STARTERS.includes(n);

/**
 * A play copied from the library this plan doesn't open: the Ready-to-Go
 * playbook, or a starter outside the sample. Copies already in a Vault are
 * kept and stay editable; they just don't export, print, sync up or get copied
 * again on Sideline or beta. Read from the play's tags (and a starter's name).
 */
export function heldBack(tier: Tier, play: { name?: string | null; tags?: readonly string[] | null }): boolean {
  const tags = play.tags ?? [];
  if (!tier.readyBook && tags.includes("ready-to-go")) return true;
  if (tier.allStarters || !tags.includes("starter")) return false;
  const name = (play.name ?? "").replace(/ \(copy\)$/, "");
  return !SAMPLE_STARTER_NAMES.includes(name);
}

export function gateReadyBook(tier: Tier): Gate {
  if (tier.readyBook) return { ok: true };
  return {
    ok: false,
    reason: `The Ready-to-Go playbook comes with Head Coach. ${tier.name} keeps the five sample starter plays and everything you draw yourself.`,
    cta: "See plans",
  };
}

export function gateLibrary(tier: Tier): Extract<Gate, { ok: false }> {
  return {
    ok: false,
    reason: `That play is from the GridIronVault library, which comes with Head Coach. ${tier.name} opens the five sample starter plays.`,
    cta: "See plans",
  };
}

export function gateExportCount(tier: Tier, count: number): Gate {
  if (count <= tier.exportPlays) return { ok: true };
  return {
    ok: false,
    reason: `${tier.name} exports and prints ${tier.exportPlays} plays at a time. Pick ${tier.exportPlays} or fewer, or move up to Head Coach for whole-playbook PDFs, wristband runs and clean prints.`,
    cta: "See plans",
  };
}

export type Gate =
  | { ok: true }
  | { ok: false; reason: string; cta: string };

export function gateSave(tier: Tier, currentPlays: number): Gate {
  if (currentPlays < tier.playLimit) return { ok: true };
  return {
    ok: false,
    reason: `Your ${tier.name} Vault holds ${tier.playLimit} plays and it is full. Delete one, or move up a plan to keep the whole install.`,
    cta: "See plans",
  };
}

export function gateGrid(tier: Tier, currentGrids: number): Gate {
  if (currentGrids < tier.gridLimit) return { ok: true };
  return {
    ok: false,
    reason: `${tier.name} includes ${tier.gridLimit} Call Sheet${tier.gridLimit === 1 ? "" : "s"}. Move up a plan to run a grid per opponent.`,
    cta: "See plans",
  };
}

export function gatePlaybook(tier: Tier, currentBooks: number): Gate {
  if (currentBooks < tier.playbookLimit) return { ok: true };
  return {
    ok: false,
    reason: `${tier.name} includes ${tier.playbookLimit} playbook${tier.playbookLimit === 1 ? "" : "s"}. Head Coach opens as many as you run, one for every opponent, unit or season.`,
    cta: "See plans",
  };
}

export function gateSize(tier: Tier, sizeId: string): Gate {
  if (tier.sizes === "all" || STARTER_SIZES.includes(sizeId)) return { ok: true };
  return {
    ok: false,
    reason: "Wristband and letter portrait are open on every plan. The rest of the print sizes come with Head Coach.",
    cta: "Unlock print sizes",
  };
}

export function gateSheets(tier: Tier): Gate {
  if (tier.sheets) return { ok: true };
  return {
    ok: false,
    reason: "Multi-play sheets and wristband runs come with Head Coach. Single-play export stays free.",
    cta: "Unlock sheets",
  };
}

export function gateTool(tier: Tier, toolId: string): Gate {
  if (!tier.lockedTools.includes(toolId)) return { ok: true };
  return {
    ok: false,
    reason: "Freehand, polygon, zones, motion and auto-connect come with Head Coach. Lines, shapes and players stay free.",
    cta: "Unlock the full kit",
  };
}

export function gateShare(tier: Tier): Gate {
  if (tier.share) return { ok: true };
  return {
    ok: false,
    reason: "Share links let players and parents open a play without an account. That comes with Head Coach.",
    cta: "Unlock sharing",
  };
}

/**
 * Front Office: a director hands read-only master playbooks to the coaches they
 * invite. `seatsUsed` counts invited and joined coaches; pass it when inviting.
 */
export function gateFrontOffice(tier: Tier, seatsUsed = 0, adding = 0): Gate {
  if (tier.orgSeats === 0)
    return {
      ok: false,
      reason: "Running a Front Office for your league or program comes with Staff and Program. Joining one is free on every plan.",
      cta: "See plans",
    };
  if (seatsUsed + adding <= tier.orgSeats) return { ok: true };
  const left = Math.max(0, tier.orgSeats - seatsUsed);
  return {
    ok: false,
    reason: `${tier.name} includes ${tier.orgSeats} coach${tier.orgSeats === 1 ? "" : "es"} in your Front Office${left ? `, and ${left} ${left === 1 ? "seat is" : "seats are"} left` : ", and every seat is taken"}. Remove a coach, or move up a plan for more seats.`,
    cta: "See plans",
  };
}

/** AI jobs each plan counts separately: photos cost several times what an assistant call does. */
export type AiKind = "assistant" | "photo";

export function gateAi(tier: Tier, kind: AiKind, usedThisMonth: number): Gate {
  const limit = kind === "photo" ? tier.photoReviews : tier.assistantCalls;
  if (usedThisMonth < limit) return { ok: true };
  if (limit === 0) return { ok: false, reason: `Whiteboard photo reviews come with Head Coach. ${tier.name} can still draw and print.`, cta: "See plans" };
  const what = kind === "photo" ? "whiteboard photo reviews" : "Griddy requests";
  return {
    ok: false,
    reason: `${tier.name} includes ${limit.toLocaleString()} ${what} a month, and you've used them. They reset on the 1st, or move up a plan for more.`,
    cta: "See plans",
  };
}

/**
 * SVG export: a vector file's watermark is just text anyone can delete, so
 * plans that watermark their exports don't get SVG (found in Phase 5 testing).
 */
export function gateVector(tier: Tier): Gate {
  if (!tier.watermark) return { ok: true };
  return {
    ok: false,
    reason: "SVG files come with Head Coach — a vector file can't keep a watermark. PDF and PNG stay open on every plan.",
    cta: "Unlock SVG",
  };
}

/** Export DPI actually used, after the plan cap. */
export const cappedDpi = (tier: Tier, wanted: number) => Math.min(wanted, tier.maxDpi);
