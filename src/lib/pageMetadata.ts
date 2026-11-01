/** Shared by the React route layout and the crawler-facing HTML response. */
export const SITE = "https://gridiron-vault.com";
export const SITE_NAME = "GridIronVault";
export const SITE_DESCRIPTION = "GridIronVault is the playbook studio for anyone who loves the game of football. Design plays with real drawing tools, keep them in one searchable Vault, build your call sheet in a spreadsheet that learns your shorthand, and print anything from a quarterback wristband to a full binder page.";

export const TITLES: Record<string, string> = {
  "/": "GridIronVault — Flag Football Playbook Studio",
  "/build": "Designer — GridIronVault",
  "/vault": "The Vault — GridIronVault",
  "/playbooks": "Playbooks — GridIronVault",
  "/grid": "Call Sheet — GridIronVault",
  "/starters": "Starter plays — GridIronVault",
  "/pricing": "Plans — GridIronVault",
  "/account": "Your account — GridIronVault",
  "/signin": "Sign in — GridIronVault",
  "/help": "Help & feedback — GridIronVault",
  "/privacy": "Privacy Policy — GridIronVault",
  "/terms": "Terms of Use — GridIronVault",
  "/wristbands": "Wristbands — GridIronVault",
  "/language": "Playbook language — GridIronVault",
  "/upload": "Upload plays — GridIronVault",
  "/assignments": "Assignments — GridIronVault",
  "/team": "Your playbook — GridIronVault",
  "/join": "Team texts sign-up — GridIronVault",
  "/practice": "Practice — GridIronVault",
  "/coverage": "Coverage report — GridIronVault",
  "/admin": "Admin — GridIronVault",
  "/tools": "More tools — GridIronVault",
  "/front-office": "Front Office — GridIronVault",
  "/roster": "My team — GridIronVault",
  "/roster/text": "Text the team — GridIronVault",
  "/tutorials": "Tutorials — GridIronVault",
};

export const PUBLIC_PAGES: Record<string, string> = {
  "/": SITE_DESCRIPTION,
  "/pricing":
    "GridIronVault plans for flag football coaches: free Sideline, Head Coach for one coach, Staff for a coaching staff and Program for a league. Compare what each includes.",
  "/starters":
    "56 flag football starter plays drawn on a real field: passing concepts, runs, trick plays and defenses, each with why it works. Copy any of them into your Vault.",
  "/tutorials":
    "How every button in GridIronVault works: guided tours and short videos for the play designer, Vault, Call Sheet, wristbands, Coverage check and Griddy.",
  "/help": "Help and feedback for GridIronVault, the flag football playbook studio. Ask a question or tell us what to build next.",
  "/privacy": "How GridIronVault handles coaches' and players' data.",
  "/terms": "The terms of use for GridIronVault, the flag football playbook studio.",
};

/** No blog routes exist yet; mark individual posts as articles when added. */
export function getPageMetadata(pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  const key = ["/build", "/grid", "/team", "/join"].find(
    (base) => path === base || path.startsWith(base + "/"),
  ) ?? path;
  return {
    title: TITLES[key] || SITE_NAME,
    description: PUBLIC_PAGES[key] || SITE_DESCRIPTION,
    url: SITE + path,
    type: path.startsWith("/blog/") ? "article" : "website",
    indexable: PUBLIC_PAGES[path] !== undefined,
  };
}
