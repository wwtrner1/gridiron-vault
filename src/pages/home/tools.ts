import clipData from "./clips.json";

/** One line of a clip's voiceover: the second it starts, its caption words, and a still of the moment. */
export type ClipStep = { title: string; text: string; at: number; still: string };
/** A recorded clip (scripts/home-clips builds them and clips.json). */
export type Clip = { title: string; seconds: number; kb: number; src: string; poster: string; steps: ClipStep[] };
/** What the video pop-out is asked to show: a clip, and the step to start on. */
export type Watch = { clip: string; step?: number };

export const CLIPS = clipData as Record<string, Clip>;

/** 0:23 */
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

export type FeaturedTool = {
  id: string;
  /** The clip's name in clips.json. */
  clip: string;
  name: string;
  group: string;
  blurb: string;
  to: string;
  cta: string;
};

/** The groups the featured list runs in, in order. */
export const FEATURED_GROUPS = ["Draw", "Teach", "Plan and print", "Team and AI"] as const;

const ALL_FEATURED: FeaturedTool[] = [
  {
    id: "designer",
    clip: "01-designer-tools",
    name: "The Play Designer",
    group: "Draw",
    blurb: "Every drawing tool in one panel. Open a section and the rest fold away, so the field stays the star.",
    to: "/build",
    cta: "Open the Designer",
  },
  {
    id: "routes",
    clip: "05-one-click-routes",
    name: "Routes in one click",
    group: "Draw",
    blurb: "Click a receiver, pick a route, and it draws at real depth in his color. Tap a lineman, then a defender, and the block is drawn.",
    to: "/build",
    cta: "Draw a route",
  },
  {
    id: "precision",
    clip: "07-precision-drawing",
    name: "Precision drawing",
    group: "Draw",
    blurb: "Snap to the grid, set your hash marks, and turn on route depths so every break shows its yards. Clean plays read faster.",
    to: "/build",
    cta: "Draw a play",
  },
  {
    id: "sets",
    clip: "10-sets-and-defense",
    name: "Formations and defenses",
    group: "Draw",
    blurb: "Drop a formation on the ball and flip it left or right. Pick a front and a coverage, and every defender gets a job.",
    to: "/build",
    cta: "Line one up",
  },
  {
    id: "cameras",
    clip: "15-film-room-cameras",
    name: "Film Room, twelve cameras",
    group: "Teach",
    blurb: "Teach any play in 3D from behind the offense, the quarterback's view, the sideline or straight overhead.",
    to: "/concepts",
    cta: "Watch a concept",
  },
  {
    id: "coverage",
    clip: "06-coverage-check",
    name: "Coverage check",
    group: "Teach",
    blurb: "Run a play against any coverage. Every look gets a grade, and you see who is open, who is tight and who is covered.",
    to: "/coverage",
    cta: "Open the Coverage report",
  },
  {
    id: "players",
    clip: "14-playbooks-players",
    name: "Playbooks and player links",
    group: "Teach",
    blurb: "Group plays in install order, then share one link. Each player sees his own job on every play and takes the Griddy Quiz.",
    to: "/playbooks",
    cta: "Open Playbooks",
  },
  {
    id: "callsheet",
    clip: "11-call-sheet",
    name: "The Call Sheet",
    group: "Plan and print",
    blurb: "A spreadsheet that links to your plays, paints calls by situation, and prints or sends them straight to your wristbands.",
    to: "/grid",
    cta: "Build a call sheet",
  },
  {
    id: "wristbands",
    clip: "03-wristbands",
    name: "Wristbands",
    group: "Plan and print",
    blurb: "From the Designer to the wrist. Pick a playbook and the cards build themselves, the same size in every box.",
    to: "/wristbands",
    cta: "Make wristbands",
  },
  {
    id: "practice",
    clip: "12-practice-drills",
    name: "Practice and the Drill Vault",
    group: "Plan and print",
    blurb: "Plan practice to the minute in timed periods. Drop in plays and animated drills, then print the script and the scout cards.",
    to: "/practice",
    cta: "Plan a practice",
  },
  {
    id: "team",
    clip: "13-my-team",
    name: "My team",
    group: "Team and AI",
    blurb: "Your roster, depth chart, logo and colors in one place, with a text to the whole team from your own phone.",
    to: "/roster",
    cta: "Open My team",
  },
  {
    id: "upload",
    clip: "08-upload-any-play",
    name: "Upload any play",
    group: "Team and AI",
    blurb: "Got plays on a whiteboard or in a binder? Drop in a photo, a scan or a PDF, check the read, and it becomes a play you can edit.",
    to: "/upload",
    cta: "Upload a play",
  },
  {
    id: "griddy",
    clip: "09-griddy",
    name: "Ask Griddy",
    group: "Team and AI",
    blurb: "Your coaching assistant on every page. Ask for a play in plain words and he draws it, recolors a playbook or builds a call sheet.",
    to: "/vault",
    cta: "Open your Vault",
  },
];

/** The featured tools that have a clip on this build, in order. */
export const FEATURED = ALL_FEATURED.filter((t) => CLIPS[t.clip]);

/** The tool a clip belongs to (the pop-out's "Open the tool" link). */
export const toolOfClip = (clip: string) => ALL_FEATURED.find((t) => t.clip === clip);

/** The clip that shows each screen of the side menu, for the grid's Watch chip. */
export const CLIP_OF_ROUTE: Record<string, string> = {
  "/build": "01-designer-tools",
  "/upload": "08-upload-any-play",
  "/playbooks": "14-playbooks-players",
  "/roster": "13-my-team",
  "/grid": "11-call-sheet",
  "/coverage": "06-coverage-check",
  "/practice": "12-practice-drills",
  "/drills": "12-practice-drills",
  "/wristbands": "03-wristbands",
  "/concepts": "15-film-room-cameras",
};

/** The picture of each screen (public/shots/<name>.webp, from scripts/home-clips/shots.mjs). */
export const SHOT_OF_ROUTE: Record<string, string> = {
  "/build": "designer",
  "/vault": "vault",
  "/upload": "upload",
  "/playbooks": "playbooks",
  "/roster": "my-team",
  "/assignments": "assignments",
  "/grid": "call-sheet",
  "/coverage": "coverage",
  "/practice": "practice",
  "/drills": "drills",
  "/library": "library",
  "/concepts": "film-room",
  "/wristbands": "wristbands",
  "/starters": "starters",
  "/language": "language",
  "/tools": "more-tools",
};

/** Film Room cameras, in the order the Camera select lists them (src/lib/film3d.ts FILM_CAMERAS). */
export const CAMERAS = [
  { id: "auto", name: "Follow the lesson", line: "The camera moves for you: wide on the look, high on the zones, behind the offense on the snap, with the quarterback on the read." },
  { id: "behind", name: "Behind the offense", line: "The whole play from the offense's end, with every route and every defender out in front of you." },
  { id: "wide", name: "Wide", line: "Pulled back far enough to keep every route and every defender in the picture." },
  { id: "all22", name: "All 22", line: "The coach's film angle: high above the end zone, all twenty-two players in view." },
  { id: "qb", name: "QB cam", line: "Rides behind the quarterback, then swings to the ball once it is thrown. A snap-to-pass clock counts his time." },
  { id: "zoom", name: "Follow a player", line: "Pick any player and the camera stays with him, then goes with the ball when it is in the air." },
  { id: "eyes", name: "Player's eyes", line: "A helmet cam. See what he sees, and drag to turn his head." },
  { id: "sideline", name: "Sideline", line: "The broadcast angle from the sideline, from either end of the field." },
  { id: "coach", name: "Coach cam", line: "The press box view: high and from the side, for the shape of the whole defense." },
  { id: "overhead", name: "Overhead", line: "Straight down, like a whiteboard that moves." },
  { id: "modular", name: "A camera for each moment", line: "Cuts for you: wide before the snap, behind on the drop, with the ball in the air, the sideline after the catch." },
  { id: "free", name: "Free look", line: "Drag, scroll or tap the buttons to look at the play from anywhere you like." },
] as const;
