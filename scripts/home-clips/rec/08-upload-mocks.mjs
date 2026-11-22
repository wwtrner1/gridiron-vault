// Mocks for the 08-upload-any-play clip. The Play reader needs the AI Gateway, so /api/ai/scan (where the plays are on the page)
// and /api/ai/photo (what each play says) answer here, exactly as netlify/ai/scan.ts and photo.ts shape them ({ plays } and
// { read }); the answers are what a reader would plausibly say about the sample whiteboard photo made by 08-whiteboard.py
// (three 5-on-5 plays: Smash, Mesh and Stick). Everything else (the Upload page, the review, Fix the read, Save, the Vault,
// the Designer) is the real app over the same small in-memory account the Griddy clip uses.
//
// Each answer waits on a gate the scene script opens, so "finding" and "reading" are on screen for exactly as many frames as
// the voiceover needs (the page clock is stepped by hand, but network answers are real time).
export const BOARD = "/tmp/home-clips/08/Whiteboard plays.jpg";
export const FILE_NAME = "Whiteboard plays.jpg";

/** Where each play is on the photo (fractions of the page), as 08-whiteboard.py printed them. */
export const BOXES = [
  { x: 0.04, y: 0.125, w: 0.29, h: 0.68, title: "Smash", notes: "" },
  { x: 0.345, y: 0.125, w: 0.29, h: 0.68, title: "Mesh", notes: "" },
  { x: 0.65, y: 0.125, w: 0.301, h: 0.68, title: "Stick", notes: "" },
];

// Board positions in each play's box (0-1 from the left and from the top), as drawn by 08-whiteboard.py.
const SPOTS = { X: [0.14, 0.6], C: [0.5, 0.6], Y: [0.7, 0.65], Z: [0.86, 0.6], Q: [0.5, 0.77] };
const players = () => Object.entries(SPOTS).map(([board, [x, y]]) => ({ board, vault: board, side: "offense", x, y }));
const route = (player, action, path, breaks) => ({ player, kind: "route", action, heard: "", ...(breaks ? { breaks } : {}), path: path.map(([x, y]) => ({ x, y })) });

/** The reader's answer for each play. Smash's Y is the one it isn't sure of: the line bends at about 8 yards (corner or post?). */
export const READS = [
  {
    isPlay: true,
    name: "Smash",
    formation: "Empty",
    game: "5v5",
    losY: 0.6,
    offenseAt: "bottom",
    players: players(),
    assignments: [
      route("X", "go", [[0.14, 0.6], [0.14, 0.12]]),
      // The reader's first guess for Y is a post; the board's line bends toward the sideline, so it asks.
      route("Y", "post", [[0.7, 0.65], [0.7, 0.4], [0.9, 0.3]]),
      route("Z", "hitch", [[0.86, 0.6], [0.86, 0.4], [0.79, 0.47]]),
    ],
    questions: [{ player: "Y", question: "Y route: corner or post? The line bends at about 8 yards.", options: ["corner", "post"] }],
  },
  {
    isPlay: true,
    name: "Mesh",
    formation: "Empty",
    game: "5v5",
    losY: 0.6,
    offenseAt: "bottom",
    players: players(),
    assignments: [
      route("X", "drag", [[0.14, 0.6], [0.14, 0.52], [0.62, 0.48]]),
      route("Y", "drag", [[0.7, 0.65], [0.7, 0.57], [0.3, 0.53]]),
      route("Z", "corner", [[0.86, 0.6], [0.86, 0.3], [0.95, 0.21]]),
    ],
    questions: [],
  },
  {
    isPlay: true,
    name: "Stick",
    formation: "Empty",
    game: "5v5",
    losY: 0.6,
    offenseAt: "bottom",
    players: players(),
    assignments: [
      route("X", "post", [[0.14, 0.6], [0.14, 0.3], [0.34, 0.19]]),
      route("Y", "hitch", [[0.7, 0.65], [0.7, 0.38], [0.63, 0.45]]),
      route("Z", "flat", [[0.86, 0.6], [0.97, 0.52]]),
    ],
    questions: [],
  },
];

/** A promise you open by hand. */
const gate = () => {
  let open = () => {};
  const done = new Promise((r) => (open = r));
  return { done, open, opened: false };
};

/**
 * Answers /api/ai/scan and /api/ai/photo. `gates.find` holds the page-reading answer, `gates.read[i]` each play's. With
 * `auto` every gate is already open (a layout check without the script).
 */
export async function installReader(page, { auto = false, log = () => {} } = {}) {
  const gates = { find: gate(), read: [gate(), gate(), gate()], released: [] };
  const open = (g) => { g.opened = true; g.open(); };
  if (auto) { open(gates.find); gates.read.forEach(open); }
  gates.openFind = () => open(gates.find);
  gates.openRead = (i) => open(gates.read[i]);
  let reads = 0;
  await page.context().route("**/api/ai/scan", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await gates.find.done;
    log("scan");
    return route.fulfill({ json: { plays: BOXES } });
  });
  await page.context().route("**/api/ai/photo", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const i = reads++;
    await gates.read[Math.min(i, 2)].done;
    log(`photo ${i + 1}`);
    return route.fulfill({ json: { read: READS[Math.min(i, 2)] } });
  });
  return gates;
}
