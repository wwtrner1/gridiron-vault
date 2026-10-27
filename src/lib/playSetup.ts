import { emptyScene, makePlayer, type TokenPreset } from "./presets";
import { layoutFormation, tokenFor, type GameType, type Placed } from "./formations";
import { defenseNodes, layoutDefense, type Front } from "./defense";
import { CANVAS_W, uid } from "./types";
import { store } from "./store";
import type { FieldView, PlayMeta, Scene, SceneNode } from "./types";

/**
 * New Play setup: what a coach picks before the field opens (name,
 * personnel, formation, field, playbook), and the starting field it builds.
 * The last picks are remembered per browser so the next play is one Enter away.
 */
export type SetupChoice = {
  name: string;
  /** A value from the Personnel dropdown (`personnelGroups`), e.g. "11 personnel". */
  personnel: string;
  formation: string;
  view: FieldView;
  /** A playbook id, "" for none, or NEW_BOOK with `newBook` as its name. */
  book: string;
  newBook: string;
};

export const NEW_BOOK = "__new__";

const KEY = "grid1ronvault.newplay.v1";
type Saved = Omit<SetupChoice, "name" | "newBook"> & { ask: boolean };
const DEFAULT: Saved = { personnel: "11 personnel", formation: "Doubles", view: "half", book: "", ask: true };

function readSaved(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<Saved>) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function writeSaved(patch: Partial<Saved>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readSaved(), ...patch }));
  } catch {
    /* storage blocked — the setup still works, it just won't be remembered */
  }
}

/** Whether a new play opens with the setup (the coach can turn it off). */
export const setupWanted = () => readSaved().ask;
export const setSetupWanted = (ask: boolean) => writeSaved({ ask });

/** The coach's last setup, with `book` taken from the playbook they came from when there is one. */
export function lastChoice(fromBook: string | null, books: { id: string }[]): SetupChoice {
  const s = readSaved();
  const book = fromBook && books.some((b) => b.id === fromBook) ? fromBook : books.some((b) => b.id === s.book) ? s.book : "";
  return { name: "", personnel: s.personnel, formation: s.formation, view: s.view, book, newBook: "" };
}

export function rememberChoice(c: SetupChoice) {
  writeSaved({ personnel: c.personnel, formation: c.formation, view: c.view, book: c.book === NEW_BOOK ? "" : c.book });
}

/** How a personnel value turns into players on the field. */
export type SetupPlan =
  | { side: "offense"; game: GameType; code: string; keep?: { count: number; tackles: boolean; guards: boolean } }
  | { side: "defense"; front: Front | null; exact: boolean; scout: { game: GameType; code: string } }
  | { side: "special" }
  | { side: "none" };

/** Defensive personnel → the closest front the defense library draws. */
const FRONT_FOR: Record<string, { front: Front; exact: boolean }> = {
  "Base 4-3": { front: "4-3", exact: true },
  "Base 3-4": { front: "3-4", exact: true },
  "Nickel 3-3-5": { front: "3-3", exact: true },
  "Bear 46": { front: "4-4", exact: true },
  "Nickel 4-2-5": { front: "3-3", exact: false },
  "Dime 4-1-6": { front: "3-3", exact: false },
  "Dime 3-2-6": { front: "3-3", exact: false },
  Quarter: { front: "3-3", exact: false },
  "Goal line": { front: "5-2", exact: false },
};

export function planFor(personnel: string): SetupPlan {
  const code = /^(\d\d) personnel$/.exec(personnel)?.[1];
  if (code) return { side: "offense", game: "11", code };
  if (personnel === "7v7 offense") return { side: "offense", game: "7v7", code: "11" };
  if (personnel === "5-on-5 offense") return { side: "offense", game: "5v5", code: "11" };
  // 8-man and 6-man: the 11-man set with the tackles (and for 6-man the guards) off, trimmed from the outside receiver in.
  if (personnel === "8-man offense") return { side: "offense", game: "11", code: "11", keep: { count: 8, tackles: false, guards: true } };
  if (personnel === "6-man offense") return { side: "offense", game: "11", code: "11", keep: { count: 6, tackles: false, guards: false } };
  const front = FRONT_FOR[personnel];
  if (front) return { side: "defense", ...front, scout: { game: "11", code: "11" } };
  if (personnel === "7v7 defense") return { side: "defense", front: null, exact: false, scout: { game: "7v7", code: "11" } };
  if (personnel === "5-on-5 defense") return { side: "defense", front: null, exact: false, scout: { game: "5v5", code: "11" } };
  if (personnel === "8-man defense" || personnel === "6-man defense") return { side: "defense", front: null, exact: false, scout: { game: "11", code: "11" } };
  if (["Kickoff", "Kick return", "Punt", "Punt return", "Field goal / PAT", "Field goal block"].includes(personnel)) return { side: "special" };
  return { side: "none" };
}

/** The formation each personnel group usually lines up in. */
const FORMATION_FOR: Record<string, string> = {
  "00": "Empty",
  "10": "Shotgun Spread",
  "11": "Doubles",
  "12": "Single Back",
  "13": "Goal Line",
  "20": "Pro Set",
  "21": "I Formation",
  "22": "I Formation",
  "23": "Goal Line",
};

export function defaultFormation(personnel: string): string {
  const plan = planFor(personnel);
  if (plan.side !== "offense") return "Doubles";
  if (plan.game !== "11") return "Trips Right";
  return FORMATION_FOR[plan.code] ?? "Doubles";
}

/** Flag fields for 5-on-5; anything else keeps the coach's field unless it was the flag one. */
export function defaultView(personnel: string, current: FieldView): FieldView {
  if (personnel.startsWith("5-on-5")) return "flag";
  return current === "flag" ? "half" : current;
}

/** The players a personnel group and formation put on the field (offense only). */
export function setupPlayers(personnel: string, formation: string): Placed[] {
  const plan = planFor(personnel);
  if (plan.side !== "offense") return [];
  let placed = layoutFormation(plan.game, plan.code, formation);
  const keep = plan.keep;
  if (keep) {
    placed = placed.filter((p) => p.code !== "OL" || (p.label === "T" ? keep.tackles : keep.guards));
    placed = placed.slice(0, keep.count);
  }
  return placed;
}

/** The starting field, play type and formation name for a setup. */
export function setupScene(c: SetupChoice, tokens: TokenPreset[]): { scene: Scene; meta: Partial<PlayMeta>; status: string } {
  const scene: Scene = { ...emptyScene(), view: c.view };
  const plan = planFor(c.personnel);
  const meta: Partial<PlayMeta> = { name: c.name.trim(), personnel: c.personnel };

  const place = (placed: Placed[]): SceneNode[] => {
    const group = uid("grp");
    return placed.map((p, i) => ({ ...makePlayer(tokenFor(p, tokens), CANVAS_W / 2 + p.dx, scene.losY + p.dy), groupId: group, z: i + 1 }));
  };

  if (plan.side === "offense") {
    scene.nodes = place(setupPlayers(c.personnel, c.formation));
    return { scene, meta: { ...meta, formation: c.formation }, status: `${c.formation} is set. Draw the routes.` };
  }
  if (plan.side === "defense") {
    const scout = layoutFormation(plan.scout.game, plan.scout.code, "Doubles");
    const offense = place(scout);
    scene.nodes = offense;
    if (!plan.front)
      return { scene, meta: { ...meta, playType: "defense" }, status: "A scout offense is on the field. Drop your defenders from the Defense tray." };
    const receivers = scout.filter((p) => p.role !== "line" && p.role !== "qb").map((p) => ({ dx: p.dx, dy: p.dy }));
    const defense = defenseNodes(layoutDefense(plan.front, "Cover 3", receivers), { x: CANVAS_W / 2, y: scene.losY }, false, offense.length + 1);
    scene.nodes = [...offense, ...defense];
    return {
      scene,
      meta: { ...meta, playType: "defense" },
      status: plan.exact
        ? `${c.personnel} is lined up against a scout offense. Draw the drops and blitzes.`
        : `A ${plan.front} front is the closest set to ${c.personnel}. Move or add defenders to match.`,
    };
  }
  if (plan.side === "special") return { scene, meta: { ...meta, playType: "special" }, status: "Drop your unit from the player trays, then draw the lanes." };
  return { scene, meta, status: "Drop a formation, then draw the routes." };
}

/** Where a new play is filed when it is first saved: a playbook id, or the name of one to make. */
export type FileTarget = { id: string } | { name: string };

export function fileTarget(c: SetupChoice): FileTarget | null {
  if (c.book === NEW_BOOK) return c.newBook.trim() ? { name: c.newBook.trim() } : null;
  return c.book ? { id: c.book } : null;
}

/** Files a saved play at the end of its playbook (making the playbook if it is new). Returns that playbook. */
export function fileNewPlay(playId: string, target: FileTarget): { id: string; name: string } | null {
  const books = store.get().playbooks;
  const found =
    "id" in target ? books.find((b) => b.id === target.id) : books.find((b) => b.name.toLowerCase() === target.name.toLowerCase());
  if (!found && "id" in target) return null;
  const book = found ?? {
    id: uid("book"),
    name: "name" in target ? target.name : "",
    description: "",
    color: "#16C8E8",
    isPublic: false,
    updatedAt: new Date().toISOString(),
    playIds: [] as string[],
  };
  store.upsertPlaybook({ ...book, playIds: [...book.playIds.filter((p) => p !== playId), playId] });
  return { id: book.id, name: book.name };
}
