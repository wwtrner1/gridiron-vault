import type { Scene, StoredPlay } from "./types";

/**
 * Player links: a playbook frozen into a snapshot behind an unguessable link,
 * so a player opens it on a phone with no account. Shared by the browser and
 * the API function, which re-checks every snapshot it stores.
 */

export type SharedPlay = {
  id: string;
  name: string;
  formation: string;
  playType: string;
  /** Older snapshots have none; a Front Office clone falls back to 5v5. */
  personnel?: string;
  description: string;
  tags: string[];
  scene: Scene;
};

export type Snapshot = { name: string; plays: SharedPlay[] };

export const SHARE_LIMITS = {
  /** Plays in one link. */
  plays: 60,
  /** Largest snapshot, in characters of JSON. */
  chars: 1_500_000,
  /** Scores kept per link; the oldest go first. */
  results: 300,
  playerName: 40,
};

/** The pieces of a stored play a player needs; coach-only fields (owner, saves, preview) stay behind. */
export function toSnapshot(name: string, plays: StoredPlay[]): Snapshot {
  return {
    name,
    plays: plays.map((p) => ({
      id: p.id,
      name: p.name,
      formation: p.formation,
      playType: p.playType,
      personnel: p.personnel,
      description: p.description,
      tags: p.tags,
      scene: { ...p.scene, film: undefined },
    })),
  };
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * A coach-facing sentence when the snapshot can't be stored, else the cleaned snapshot.
 * `what` names the thing being shared in those sentences ("A player link", "A Front Office playbook").
 */
export function cleanSnapshot(raw: unknown, what = "A player link"): Snapshot | string {
  const r = raw as { name?: unknown; plays?: unknown } | null;
  if (!r || !Array.isArray(r.plays)) return "That playbook couldn't be read. Open it and try the link again.";
  if (!r.plays.length) return "Add at least one play to the playbook before you share it.";
  if (r.plays.length > SHARE_LIMITS.plays)
    return `${what} holds up to ${SHARE_LIMITS.plays} plays. Split this playbook, or share the plays you install first.`;
  const plays: SharedPlay[] = [];
  for (const p of r.plays as Record<string, unknown>[]) {
    const scene = p?.scene as Scene | undefined;
    if (!scene || scene.version !== 2 || !Array.isArray(scene.nodes)) return "One of the plays couldn't be read. Open it in the Designer, save it, and try again.";
    plays.push({
      id: text(p.id, 80),
      name: text(p.name, 120) || "Untitled play",
      formation: text(p.formation, 80),
      playType: text(p.playType, 20) || "pass",
      personnel: text(p.personnel, 20) || undefined,
      description: text(p.description, 600),
      tags: Array.isArray(p.tags) ? (p.tags as unknown[]).map((t) => text(t, 30)).filter(Boolean).slice(0, 12) : [],
      scene,
    });
  }
  const snap = { name: text(r.name, 120) || "Playbook", plays };
  if (JSON.stringify(snap).length > SHARE_LIMITS.chars) return "That playbook is too large to share in one piece. Share fewer plays, or split it into two playbooks.";
  return snap;
}

/** One score a player sent back. */
export type QuizScore = { id: string; playerName: string; letter: string; score: number; total: number; at: string };

/** A share as the coach sees it. */
export type ShareInfo = { token: string; source: string; name: string; plays: number; updatedAt: string; results: number };

/** The player page's address for a token. */
export const shareUrl = (token: string, origin = typeof location === "undefined" ? "" : location.origin) => `${origin}/team/${token}`;
