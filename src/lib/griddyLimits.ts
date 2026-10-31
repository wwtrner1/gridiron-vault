/**
 * The bits of the Griddy contract the browser needs on every page (his name
 * and the size limits). Kept apart from lib/griddy.ts so the tools, prompt and
 * their imports (assistant, bulk edit) load only with the panel's cards and the API.
 */

export const GRIDDY = "Griddy";

/** Limits the browser and the function both hold to. */
export const GRIDDY_LIMITS = {
  /** Turns of history sent back each time; older ones fall off the front. */
  turns: 24,
  /** One message: long enough for a pasted list of a season's plays. */
  message: 12000,
  /** Plays Griddy will take from one dump. */
  importPlays: 60,
  /** Vault plays listed for Griddy to search. */
  vault: 300,
} as const;
