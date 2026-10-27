import type { SharedPlay } from "./share";
import type { StoredPlay } from "./types";
import { uid } from "./types";

/**
 * Front Office: a league or program director invites coaches by email and
 * hands them read-only master playbooks. Members read a frozen copy and can
 * clone it into their own Vault; nothing they do changes the director's plays.
 * Shared by the browser and the API function.
 */

export const ORG_LIMITS = {
  name: 80,
  note: 280,
  /** Playbooks one Front Office can share at once. */
  shares: 40,
  /** Addresses in one invite. */
  invite: 60,
};

export type OrgMember = { id: string; email: string; name: string; status: "invited" | "active"; invitedAt: string; joinedAt: string | null };

/** A shared playbook as a list shows it (no plays). */
export type OrgShareSummary = { id: string; source: string; name: string; note: string; plays: number; updatedAt: string };

/** The director's own Front Office. */
export type MyOrg = { id: string; name: string; seats: number; members: OrgMember[]; shares: OrgShareSummary[] };

/** A Front Office this coach belongs to, as a member sees it: no member list. */
export type JoinedOrg = { memberId: string; org: { id: string; name: string; ownerName: string }; shares: OrgShareSummary[] };

export type OrgInvite = { memberId: string; org: { id: string; name: string; ownerName: string }; invitedAt: string };

export type FrontOfficeState = { mine: MyOrg | null; joined: JoinedOrg[]; invites: OrgInvite[] };

/** One shared playbook with its plays, for a member to read or clone. */
export type OrgShareDetail = Omit<OrgShareSummary, "plays"> & { orgName: string; plays: SharedPlay[] };

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;

/** Addresses out of whatever the director pasted (commas, spaces, new lines, "Name <a@b.com>"), lower case, no repeats. */
export function parseEmails(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(/[\s,;]+/);
  const out = new Set<string>();
  for (const piece of list) {
    const email = piece.replace(/^.*</, "").replace(/>.*$/, "").trim().toLowerCase();
    if (email.length <= 254 && EMAIL.test(email)) out.add(email);
  }
  return [...out];
}

/** A shared play as a new play in this coach's Vault: a fresh id, so the master copy is never touched. */
export function cloneSharedPlay(p: SharedPlay): StoredPlay {
  return {
    id: uid("play"),
    name: p.name,
    formation: p.formation,
    playType: p.playType as StoredPlay["playType"],
    personnel: p.personnel || "5v5",
    description: p.description,
    tags: [...p.tags],
    isPublic: false,
    ownerName: "You",
    fieldView: p.scene.view,
    scene: structuredClone(p.scene),
    preview: "",
    saveCount: 0,
    updatedAt: new Date().toISOString(),
    remote: false,
  };
}
