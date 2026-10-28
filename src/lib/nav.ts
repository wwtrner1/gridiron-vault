export type NavItem = { to: string; icon: string; label: string; hint: string };

/**
 * The side menu, the same on every signed-in page. The home page lists the
 * same items, so a tool added here shows up in both places.
 */
export const PLAYBOOK_NAV: NavItem[] = [
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
    hint: "Your roster and depth chart. Send the starters to Assignments so position sheets print with their names.",
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
    to: "/practice",
    icon: "board",
    label: "Practice",
    hint: "Build tonight's practice script and print scout cards for the plays you'll rep.",
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
