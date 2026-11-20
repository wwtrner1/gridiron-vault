/**
 * Contact details shown on Help & feedback. Both are Phase 4 items only the
 * coach can supply; each line stays hidden until it is filled in.
 */
export const SUPPORT_EMAIL = "support@gridiron-vault.com";
/** e.g. "We reply within one business day." */
export const RESPONSE_TIME = "";

/**
 * Partnerships and Follow us, shown above the marketing footer (and the same block on every Vault's site).
 * Partner leads go to the /partners page's Netlify form. Each Vault points at GridIronVault's accounts
 * until it has its own: swap the handle and links here.
 */
export const PARTNER_LINK = "/partners#contact";
export const SOCIAL_HANDLE = "@grid1ronvault";
export const SOCIALS: ReadonlyArray<readonly [label: string, url: string]> = [
  ["Instagram", "https://www.instagram.com/grid1ronvault"],
  ["Facebook", "https://www.facebook.com/profile.php?id=61596063004257"],
  ["YouTube", "https://www.youtube.com/channel/UCshtPNnM6FcZlZvILLPtFwA"],
  ["TikTok", "https://www.tiktok.com/@grid1ron_vault"],
];
