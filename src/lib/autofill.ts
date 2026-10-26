/**
 * Column-aware autocomplete for the Call Sheet.
 *
 * Headers are never fixed — a coach can rename a column to anything. So the
 * dictionary is keyed by the header text the coach typed, and it learns from
 * whatever they enter. Nothing is pre-seeded beyond a few football staples
 * that save typing on the very first grid.
 */
const KEY = "nextplay.autofill.v1";
const LIMIT = 40;

type Memory = Record<string, string[]>;

const SEED: Memory = {
  group: ["Base", "Red zone", "Third down", "Goal line", "Two minute", "Trick"],
  run: ["Dive", "Sweep", "Reverse", "QB keep", "Counter", "Jet"],
  pass: ["Slant", "Flood", "Post", "Corner", "Fade", "Screen", "Drag", "Wheel"],
  down: ["1st", "2nd", "3rd", "4th"],
  distance: ["Short", "Medium", "Long", "Goal"],
  hash: ["Left", "Middle", "Right"],
  route: ["Flat", "Slant", "Hitch", "Out", "Dig", "Corner", "Post", "Go", "Drag", "Cross", "Wheel"],
  position: ["Q", "C", "X", "Y", "Z", "H", "S"],
  formation: ["Single Back", "Spread", "Trips", "Trips Stack", "Twins", "Bunch", "Empty"],
};

const norm = (header: string) => header.trim().toLowerCase();

function read(): Memory {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...SEED, ...(JSON.parse(raw) as Memory) } : { ...SEED };
  } catch {
    return { ...SEED };
  }
}

let memory: Memory = read();

/** Remember a value a coach typed under a given header. */
export function learn(header: string, value: string) {
  const key = norm(header);
  const clean = value.trim();
  if (!key || clean.length < 2) return;
  const list = memory[key] ?? [];
  if (list.some((v) => v.toLowerCase() === clean.toLowerCase())) return;
  memory = { ...memory, [key]: [clean, ...list].slice(0, LIMIT) };
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* the grid still works, it just forgets between visits */
  }
}

/** Best matches for what the coach has typed so far. */
export function suggest(header: string, partial: string, extra: string[] = []): string[] {
  const key = norm(header);
  const pool = [...new Set([...extra, ...(memory[key] ?? [])])];
  const q = partial.trim().toLowerCase();
  if (!q) return pool.slice(0, 8);
  return pool
    .filter((v) => v.toLowerCase().includes(q) && v.toLowerCase() !== q)
    .sort((a, b) => Number(b.toLowerCase().startsWith(q)) - Number(a.toLowerCase().startsWith(q)))
    .slice(0, 8);
}

export const forgetAll = () => {
  memory = { ...SEED };
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
};
