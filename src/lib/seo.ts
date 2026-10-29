/**
 * Search and share details per route. index.html carries the home page's;
 * RouteChrome calls `applySeo` on every navigation so a crawler that runs the
 * app sees each public page's own description and address, and the tool
 * screens (empty for a visitor with no plays) and unknown addresses are kept
 * out of search results.
 */
export const SITE = "https://gridiron-vault.com";

const HOME =
  "Draw plays, build your Vault, and print wristbands. The playbook studio built for the flag football sideline.";

/** Public pages worth finding in search, with their description. Everything else is noindex. */
export const PUBLIC_PAGES: Record<string, string> = {
  "/": HOME,
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

function tag(selector: string, make: () => HTMLElement): HTMLElement {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = make();
    document.head.appendChild(el);
  }
  return el;
}

const meta = (attr: "name" | "property", key: string, content: string) =>
  tag(`meta[${attr}="${key}"]`, () => {
    const m = document.createElement("meta");
    m.setAttribute(attr, key);
    return m;
  }).setAttribute("content", content);

/** `path` is the route key RouteChrome uses ("/build" for every Designer address). */
export function applySeo(path: string, title: string) {
  const description = PUBLIC_PAGES[path];
  const canonical = tag('link[rel="canonical"]', () => {
    const l = document.createElement("link");
    l.rel = "canonical";
    return l;
  }) as HTMLLinkElement;
  if (description === undefined) {
    meta("name", "robots", "noindex");
    canonical.remove();
    return;
  }
  document.head.querySelector('meta[name="robots"]')?.remove();
  canonical.href = SITE + path;
  meta("name", "description", description);
  meta("property", "og:title", title);
  meta("property", "og:description", description);
  meta("property", "og:url", SITE + path);
}
