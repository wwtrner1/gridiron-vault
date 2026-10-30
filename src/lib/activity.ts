/**
 * The account activity the owner's console audits, shared by the browser and the API.
 * sign_in and open are recorded by the server; the rest are capture signals the browser reports (src/lib/captureLog.ts).
 */
export const ACTIVITY_KINDS = ["sign_in", "open", "screenshot_key", "print", "copy", "export"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  sign_in: "Signed in",
  open: "Opened the app",
  screenshot_key: "Screenshot key",
  print: "Printed a page",
  copy: "Copied",
  export: "Exported",
};

/**
 * A short code that names the account a PDF came from, written into the file's Keywords. It is a hash of the account
 * id, so it says nothing to anyone but the owner, who can look it up in Admin → Activity.
 */
export async function traceCodeOf(userId: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`gv-trace:${userId}`)));
  return `GV-${[...bytes.slice(0, 5)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** The signed-in account's trace code, for exports. Empty when signed out. */
let traceUser = "";
export const setTraceUser = (id: string | null | undefined) => {
  traceUser = id ?? "";
};
export const traceCode = () => (traceUser ? traceCodeOf(traceUser) : Promise.resolve(""));
