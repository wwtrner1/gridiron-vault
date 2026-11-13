export type NavItem = { to: string; icon: string; label: string; hint: string };
export type NavGroup = { id: string; label: string; items: NavItem[] };

/**
 * Every tool in one list. The side menu shows them in the groups below
 * (NAV_GROUPS) and the home page lists them flat, so a tool added here
 * shows up in both places; give it a group in GROUP_OF too.
 */
const TOOLS: NavItem[] = [
  {
    to: "/vault",
    icon: "folder",
    label: "The Vault",
    hint: "Every play you have drawn, plus the plays other coaches made public.",
  },
  {
    to: "/upload",
    icon: "upload",
    label: "Upload plays",
    hint: "Turn a whiteboard photo, screenshot or PowerPoint deck into editable plays.",
  },
  {
    to: "/playbooks",
    icon: "board",
    label: "Playbooks",
    hint: "Group plays into an install order — base, red zone, third down.",
  },
  {
    to: "/roster",
    icon: "users",
    label: "My team",
    hint: "Your roster, depth chart and team branding: logo and colors on the field, wristbands and PDFs.",
  },
  {
    to: "/front-office",
    icon: "link",
    label: "Front Office",
    hint: "League and program playbooks: share read-only masters with your coaches, or clone the ones shared with you.",
  },
  {
    to: "/assignments",
    icon: "user",
    label: "Assignments",
    hint: "One player's job on every play in a playbook. Print it as a position sheet.",
  },
  {
    to: "/grid",
    icon: "table",
    label: "Call Sheet",
    hint: "Your game plan. Sort it, paint it, collapse it, print it.",
  },
  {
    to: "/coverage",
    icon: "eye",
    label: "Coverage report",
    hint: "Run every pass play against Cover 1, 2, 3, 4 and man. See what each beats and your best call against each look.",
  },
  {
    to: "/practice",
    icon: "board",
    label: "Practice",
    hint: "Build tonight's practice script: timed periods with plays and drills, printed with scout cards.",
  },
  {
    to: "/drills",
    icon: "play",
    label: "Drill Vault",
    hint: "Drills with animated diagrams, coaching points and film. Add your own and drop them into practice.",
  },
  {
    to: "/library",
    icon: "play",
    label: "Coaching videos",
    hint: "Flag football drill games and coaching reads from MOJO, with credit. Videos play right here.",
  },
  {
    to: "/wristbands",
    icon: "wristband",
    label: "Wristbands",
    hint: "Print quarterback wristband cards from your Call Sheet or a playbook.",
  },
  {
    to: "/starters",
    icon: "sparkle",
    label: "Starter plays",
    hint: "Fifty-six ready-made plays you can copy and edit as your own.",
  },
  {
    to: "/language",
    icon: "language",
    label: "Playbook language",
    hint: "Your own names for formations, routes and calls.",
  },
  {
    to: "/tools",
    icon: "grid",
    label: "More tools",
    hint: "Formation and defense libraries, the route tree and the other Designer tools in one place.",
  },
];

/** The side menu's groups, in order, and the tools in each. */
const GROUP_OF: { id: string; label: string; paths: string[] }[] = [
  { id: "plays", label: "Plays", paths: ["/vault", "/playbooks", "/upload", "/starters"] },
  { id: "gameplan", label: "Game plan", paths: ["/grid", "/wristbands", "/coverage"] },
  { id: "practice", label: "Practice", paths: ["/practice", "/drills", "/library", "/assignments"] },
  { id: "team", label: "Team", paths: ["/roster", "/front-office"] },
  { id: "tools", label: "Tools", paths: ["/language", "/tools"] },
];

export const NAV_GROUPS: NavGroup[] = GROUP_OF.map((g) => ({
  id: g.id,
  label: g.label,
  items: g.paths.map((p) => TOOLS.find((t) => t.to === p)).filter((t): t is NavItem => !!t),
}));

/** Every tool in the side menu's order (the home page's grid). */
export const PLAYBOOK_NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** The group holding a page, so the side menu opens it. */
export const groupOf = (pathname: string) =>
  NAV_GROUPS.find((g) => g.items.some((t) => pathname === t.to || pathname.startsWith(`${t.to}/`)))?.id ?? null;

const OPEN_KEY = "grid1ronvault.railGroups.v1";

/** The groups a coach opened by hand (this browser). The first visit opens Plays. */
export function loadOpenGroups(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "null");
    if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  } catch {
    /* fall through */
  }
  return ["plays"];
}

export function saveOpenGroups(ids: string[]) {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(ids));
  } catch {
    /* kept for this visit */
  }
}
