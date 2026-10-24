/**
 * Who runs GridIronVault. The All-Access Master account is decided here, on the
 * server, from the signed-in Identity email: nothing a browser sends (a plan
 * pick, a profile edit, localStorage) can grant it. Add more owners with the
 * OWNER_EMAILS environment variable (comma-separated) in the Netlify
 * dashboard; the address must be a confirmed Identity email.
 */
const BUILT_IN = ["wwtrner1@gmail.com"];

const owners = () =>
  new Set(
    [...BUILT_IN, ...(process.env.OWNER_EMAILS ?? "").split(",")]
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );

/** True for a confirmed Identity email on the owner list. */
export function isOwner(user: { email: string; confirmed: boolean } | null | undefined): boolean {
  return Boolean(user?.confirmed && owners().has(user.email.trim().toLowerCase()));
}

/** True when the address is on the owner list, before any confirmation check. */
export const onOwnerList = (email: string) => owners().has(email.trim().toLowerCase());
