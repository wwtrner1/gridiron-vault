import { readToNodes } from "./assistant";
import type { AssistantRead } from "./assistant";
import { api, toStoredPlay } from "./api";
import type { GameType } from "./formations";
import type { TokenPreset } from "./presets";
import { emptyScene } from "./presets";
import { store } from "./store";
import { uid } from "./types";
import type { StoredPlay } from "./types";

/** The game type the coach last drew in the Formation library: what Griddy draws by default. */
const GAME_KEY = "grid1ronvault.formationLib.v1";
export function currentGame(): GameType {
  try {
    const g = JSON.parse(localStorage.getItem(GAME_KEY) ?? "{}").game;
    return g === "7v7" || g === "11" ? g : "5v5";
  } catch {
    return "5v5";
  }
}

/** A read from Griddy as a play ready for the Vault: its own field, players and routes. */
export function playFromRead(read: AssistantRead, tokens: TokenPreset[], opts: { name?: string; note: string; tags: string[] }): StoredPlay {
  const base = emptyScene();
  const scene = { ...base, nodes: readToNodes(read, tokens, base.losY, 1) };
  return {
    id: uid("play"),
    name: (opts.name || read.name).slice(0, 160),
    formation: read.formation,
    playType: "pass",
    personnel: read.game === "11" ? (read.personnel ?? "") : read.game,
    description: opts.note,
    tags: opts.tags,
    isPublic: false,
    ownerName: "You",
    fieldView: scene.view,
    scene,
    preview: "",
    saveCount: 0,
    updatedAt: new Date().toISOString(),
    remote: false,
  };
}

/**
 * Saves plays to the Vault, and files them in a playbook when one is named
 * (an existing playbook of that name, or a new one). Saved in this browser
 * first; signed in, each play and a new playbook also go to the account,
 * the same way the Ready-to-Go playbook does.
 */
export async function savePlays(plays: StoredPlay[], opts: { playbook: string | null; signedIn: boolean }): Promise<StoredPlay[]> {
  plays.forEach((p) => store.upsertPlay(p));
  const name = opts.playbook?.trim();
  const existing = name ? store.get().playbooks.find((b) => b.name.toLowerCase() === name.toLowerCase()) : undefined;
  const book = name
    ? existing ?? {
        id: uid("book"),
        name,
        description: "Added by Griddy.",
        color: "#16C8E8",
        isPublic: false,
        updatedAt: new Date().toISOString(),
        playIds: [] as string[],
      }
    : null;
  const file = (ids: string[]) => {
    if (!book) return;
    const current = store.get().playbooks.find((b) => b.id === book.id) ?? book;
    store.upsertPlaybook({ ...current, playIds: [...current.playIds.filter((id) => !ids.includes(id)), ...ids], updatedAt: new Date().toISOString() });
  };
  file(plays.map((p) => p.id));
  if (!opts.signedIn) return plays;

  // Swap each local copy for the account's copy, keeping the playbook's order.
  const synced: StoredPlay[] = [];
  for (const p of plays) {
    try {
      const res = await api.createPlay({
        name: p.name,
        formation: p.formation,
        playType: p.playType,
        personnel: p.personnel,
        description: p.description,
        tags: p.tags,
        fieldView: p.fieldView,
        scene: p.scene,
        isPublic: false,
      });
      const saved = toStoredPlay(res.play);
      store.removePlay(p.id);
      store.upsertPlay(saved);
      synced.push(saved);
    } catch {
      synced.push(p); // stays in this browser; it syncs the next time it's saved
    }
  }
  if (book) {
    // removePlay above dropped the local ids from the playbook; file the account copies in their place.
    file(synced.map((p) => p.id));
  }
  return synced;
}
