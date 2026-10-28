import type { Scene, StoredPlay } from "./types";
import { deviceId } from "./device";
import type { AssistantRead, AssistantRequest } from "./assistant";
import type { PhotoRead, PhotoRequest } from "./photo";
import type { ScanFind, ScanRequest } from "./scan";
import type { GriddyReply, GriddyRequest } from "./griddy";
import type { QuizScore, ShareInfo, Snapshot } from "./share";
import type { FrontOfficeState, OrgShareDetail } from "./frontOffice";
import type { Delivery, DepthChart, HubFolder, DepthSlot, DepthUnit, EventDraft, HubMessage, MessageChannel, HubEvent, HubPlayer, HubState, HubTeam, PlayerInfo, MyTeamDoc, TextSignup } from "./teamHub";

export type ApiPlay = {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  formation: string;
  playType: string;
  personnel: string;
  description: string;
  tags: string[];
  fieldView: string;
  scene: Scene;
  preview: string;
  isPublic: boolean;
  saveCount: number;
  updatedAt: string;
};

/** "One login, one coach": what the server knows about this account's phone and this device. */
export type Security = { required: boolean; verified: boolean; trusted: boolean; phone: string | null; devices: number };

/** Fired when the server asks for the phone or a device code, so the gate can open. */
export const SECURITY_EVENT = "grid1ronvault:security";

/** A team's family texts link and the people who signed up on it. */
export type TextList = { token: string; signups: TextSignup[]; sms: boolean };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", "X-Device": deviceId() },
  });
  const text = await res.text();
  let data: { error?: string; code?: string } & Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* a platform page (e.g. the rate limiter's 429), not our JSON */
  }
  if (res.status === 429 && !data.error) data.error = "That's a lot of requests at once. Wait a minute, then try again.";
  if (!res.ok) {
    if (data.code === "phone_required" || data.code === "device_unverified") window.dispatchEvent(new Event(SECURITY_EVENT));
    throw new Error(data.error ?? "The playbook service is unavailable right now.");
  }
  return data as T;
}

export const api = {
  assistant: (body: AssistantRequest) =>
    request<{ read: AssistantRead }>("ai/assistant", { method: "POST", body: JSON.stringify(body) }),

  griddy: (body: GriddyRequest) =>
    request<{ reply: GriddyReply }>("ai/griddy", { method: "POST", body: JSON.stringify(body) }),

  photo: (body: PhotoRequest) =>
    request<{ read: PhotoRead }>("ai/photo", { method: "POST", body: JSON.stringify(body) }),

  /** Where the plays are on a scanned page (the reads that follow each use a photo review). */
  scan: (body: ScanRequest) =>
    request<ScanFind>("ai/scan", { method: "POST", body: JSON.stringify(body) }),

  me: () => request<{ user: { id: string; email: string; name: string } | null; owner?: boolean; billing?: boolean; plan?: string; trialEndsAt?: string; security?: Security }>("me"),

  /** During beta a coach picks their own plan; the server enforces it. */
  checkout: (offer: string) => request<{ url: string }>("billing/checkout", { method: "POST", body: JSON.stringify({ offer }) }),
  billingPortal: () => request<{ url: string }>("billing/portal", { method: "POST", body: "{}" }),
  setPlan: (plan: string) => request<{ plan: string }>("me/plan", { method: "PUT", body: JSON.stringify({ plan }) }),

  /** start / check (add or change the number), device-start / device-check, forget-others. */
  phone: (action: "start" | "check" | "device-start" | "device-check" | "forget-others", body: Record<string, string> = {}) =>
    request<{ sentTo?: string; security?: Security }>(`phone/${action}`, { method: "POST", body: JSON.stringify(body) }),

  listPlays: (params: Record<string, string>) =>
    request<{ plays: ApiPlay[] }>(`plays?${new URLSearchParams(params)}`),

  createPlay: (body: Partial<ApiPlay>) =>
    request<{ play: ApiPlay }>("plays", { method: "POST", body: JSON.stringify(body) }),

  updatePlay: (id: string, body: Partial<ApiPlay>) =>
    request<{ play: ApiPlay }>(`plays/${id}`, { method: "PUT", body: JSON.stringify(body) }),

  /** Deletes the account and everything stored with it. `confirm` is the account email, typed. */
  deleteAccount: (confirm: string) => request<{ ok: true }>("me", { method: "DELETE", body: JSON.stringify({ confirm }) }),

  deletePlay: (id: string) => request<{ ok: true }>(`plays/${id}`, { method: "DELETE" }),

  copyPlay: (id: string) => request<{ play: ApiPlay }>(`plays/${id}/copy`, { method: "POST" }),

  listPlaybooks: () =>
    request<{ playbooks: Playbook[]; members: { playbookId: string; playId: string; sortOrder: number }[] }>("playbooks"),

  /** `playIds` replaces the playbook's whole list, in order. */
  updatePlaybook: (id: string, body: Partial<Playbook> & { playIds?: string[] }) =>
    request<{ playbook: Playbook }>(`playbooks/${id}`, { method: "PUT", body: JSON.stringify(body) }),

  deletePlaybook: (id: string) => request<{ ok: true }>(`playbooks/${id}`, { method: "DELETE" }),

  createPlaybook: (body: Partial<Playbook>) =>
    request<{ playbook: Playbook }>("playbooks", { method: "POST", body: JSON.stringify(body) }),

  /** Player links: a coach's shared playbooks, one link per playbook. */
  listShares: () => request<{ shares: ShareInfo[] }>("shares"),
  shareBook: (source: string, snapshot: Snapshot) =>
    request<{ token: string }>("shares", { method: "POST", body: JSON.stringify({ source, snapshot }) }),
  stopShare: (token: string) => request<{ ok: true }>(`shares/${token}`, { method: "DELETE" }),
  shareScores: (token: string) => request<{ results: QuizScore[] }>(`shares/${token}/results`),

  /** What a player opens: no account, no sign-in. */
  openShare: (token: string) =>
    request<{ share: { name: string; plays: Snapshot["plays"]; updatedAt: string } }>(`shares/${token}`),
  sendScore: (token: string, body: { name: string; letter: string; score: number; total: number }) =>
    request<{ ok: true }>(`shares/${token}/results`, { method: "POST", body: JSON.stringify(body) }),

  /** Front Office: the coach's own league or program, the ones they joined, and invites waiting for them. */
  frontOffice: () => request<FrontOfficeState>("orgs"),
  createOrg: (name: string) => request<FrontOfficeState>("orgs", { method: "POST", body: JSON.stringify({ name }) }),
  renameOrg: (id: string, name: string) => request<FrontOfficeState>(`orgs/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteOrg: (id: string) => request<FrontOfficeState>(`orgs/${id}`, { method: "DELETE" }),
  inviteCoaches: (id: string, emails: string[]) =>
    request<FrontOfficeState & { invited: number }>(`orgs/${id}/members`, { method: "POST", body: JSON.stringify({ emails }) }),
  shareToOrg: (id: string, body: { source: string; note: string; snapshot: Snapshot }) =>
    request<FrontOfficeState>(`orgs/${id}/shares`, { method: "POST", body: JSON.stringify(body) }),
  acceptInvite: (memberId: string) => request<FrontOfficeState>(`org-members/${memberId}/accept`, { method: "POST" }),
  /** Decline an invite, leave a Front Office, or (director) remove a coach. */
  removeMember: (memberId: string) => request<FrontOfficeState>(`org-members/${memberId}`, { method: "DELETE" }),
  openOrgShare: (shareId: string) => request<{ share: OrgShareDetail }>(`org-shares/${shareId}`),
  unshareFromOrg: (shareId: string) => request<FrontOfficeState>(`org-shares/${shareId}`, { method: "DELETE" }),

  /* My team: the coach's own roster and depth chart, one per account. */
  myTeam: () => request<{ team: MyTeamDoc | null }>("my-team"),
  saveMyTeam: (team: MyTeamDoc) => request<{ team: MyTeamDoc }>("my-team", { method: "PUT", body: JSON.stringify({ team }) }),
  /* Team hub: teams and rosters, for the director and each team's staff. */
  hub: (orgId: string) => request<HubState>(`hub/${orgId}`),
  createTeam: (orgId: string, team: Partial<HubTeam>) =>
    request<HubState & { created: string }>("teams", { method: "POST", body: JSON.stringify({ ...team, orgId }) }),
  updateTeam: (id: string, team: Partial<HubTeam>) => request<HubState>(`teams/${id}`, { method: "PUT", body: JSON.stringify(team) }),
  deleteTeam: (id: string) => request<HubState>(`teams/${id}`, { method: "DELETE" }),
  roster: (teamId: string) => request<{ players: HubPlayer[] }>(`teams/${teamId}/players`),
  addPlayers: (teamId: string, players: PlayerInfo[]) =>
    request<{ players: HubPlayer[]; added: number }>(`teams/${teamId}/players`, { method: "POST", body: JSON.stringify({ players }) }),
  updatePlayer: (id: string, player: PlayerInfo) => request<{ players: HubPlayer[] }>(`team-players/${id}`, { method: "PUT", body: JSON.stringify({ player }) }),
  textSignups: (teamId: string, fresh = false) =>
    request<TextList>(`teams/${teamId}/texts`, fresh ? { method: "POST", body: JSON.stringify({ fresh: true }) } : undefined),
  removeTextSignup: (id: string) => request<TextList>(`text-signups/${id}`, { method: "DELETE" }),
  /** The public family sign-up page. */
  joinInfo: (token: string) => request<{ team: string; org: string }>(`join/${token}`),
  join: (token: string, body: { name: string; player: string; phone: string; consent: boolean }) =>
    request<{ ok: true; again?: boolean; confirmed?: boolean }>(`join/${token}`, { method: "POST", body: JSON.stringify(body) }),
  depthCharts: (teamId: string) => request<{ charts: DepthChart[] }>(`teams/${teamId}/depth`),
  saveDepth: (teamId: string, unit: DepthUnit, slots: DepthSlot[]) =>
    request<{ charts: DepthChart[] }>(`teams/${teamId}/depth`, { method: "PUT", body: JSON.stringify({ unit, slots }) }),
  events: (orgId: string) => request<{ events: HubEvent[] }>(`hub/${orgId}/events`),
  addEvent: (orgId: string, event: EventDraft, repeatWeeks = 0) =>
    request<{ events: HubEvent[]; added: number }>(`hub/${orgId}/events`, { method: "POST", body: JSON.stringify({ event, repeatWeeks }) }),
  updateEvent: (id: string, event: EventDraft) => request<{ events: HubEvent[] }>(`hub-events/${id}`, { method: "PUT", body: JSON.stringify({ event }) }),
  deleteEvent: (id: string) => request<{ events: HubEvent[] }>(`hub-events/${id}`, { method: "DELETE" }),
  messages: (orgId: string) => request<{ messages: HubMessage[]; delivery: Delivery }>(`hub/${orgId}/messages`),
  postMessage: (orgId: string, msg: { teamId: string | null; channel: MessageChannel; subject: string; body: string; email: boolean; sms: boolean }) =>
    request<{ messages: HubMessage[]; delivery: Delivery; emailed: number; texted: number }>(`hub/${orgId}/messages`, { method: "POST", body: JSON.stringify(msg) }),
  deleteMessage: (id: string) => request<{ messages: HubMessage[]; delivery: Delivery }>(`hub-messages/${id}`, { method: "DELETE" }),
  folders: (orgId: string) => request<{ folders: HubFolder[]; used: number }>(`hub/${orgId}/folders`),
  addFolders: (orgId: string, teamId: string | null, names: string[]) =>
    request<{ folders: HubFolder[]; used: number }>(`hub/${orgId}/folders`, { method: "POST", body: JSON.stringify({ teamId, names }) }),
  renameFolder: (id: string, name: string) => request<{ folders: HubFolder[]; used: number }>(`hub-folders/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteFolder: (id: string) => request<{ folders: HubFolder[]; used: number }>(`hub-folders/${id}`, { method: "DELETE" }),
  deleteFile: (id: string) => request<{ folders: HubFolder[]; used: number }>(`hub-files/${id}`, { method: "DELETE" }),
  /** The file's bytes go as the body; its name rides in a header. */
  uploadFile: async (folderId: string, file: File) => {
    const res = await fetch(`/api/hub-folders/${folderId}/files`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name), "X-Device": deviceId() },
      body: file,
    });
    const data = (await res.json().catch(() => ({}))) as { folders?: HubFolder[]; used?: number; error?: string };
    if (res.status === 413 && !data.error) data.error = "That file is too big to upload. Keep files under 5 MB.";
    if (!res.ok) throw new Error(data.error ?? "That file didn't upload. Try again in a minute.");
    return data as { folders: HubFolder[]; used: number };
  },
  deletePlayer: (id: string) => request<{ players: HubPlayer[] }>(`team-players/${id}`, { method: "DELETE" }),

  listSheets: () => request<{ sheets: RemoteSheet[] }>("call-sheets"),

  deleteSheet: (id: string) => request<{ ok: true }>(`call-sheets/${id}`, { method: "DELETE" }),

  createSheet: (body: unknown) =>
    request<{ sheet: RemoteSheet }>("call-sheets", { method: "POST", body: JSON.stringify(body) }),

  updateSheet: (id: string, body: unknown) =>
    request<{ sheet: RemoteSheet }>(`call-sheets/${id}`, { method: "PUT", body: JSON.stringify(body) }),

  /** Owner console. The server answers 404 to anyone who isn't on the owner list. */
  admin: <T,>(path: string, init?: RequestInit) => request<T>(`admin/${path}`, init),

  /** The owner's CSV of every signup, as a file the browser can save. */
  adminUsersCsv: async () => {
    const res = await fetch("/api/admin/users.csv", { credentials: "include", headers: { "X-Device": deviceId() } });
    if (!res.ok) throw new Error("The export didn't download. Try again in a minute.");
    return res.blob();
  },
};

export type Playbook = {
  id: string;
  name: string;
  description: string;
  color: string;
  isPublic: boolean;
  updatedAt?: string;
};

export type RemoteSheet = {
  id: string;
  name: string;
  columns: unknown;
  rows: unknown;
  updatedAt: string;
};

export const toStoredPlay = (p: ApiPlay): StoredPlay => ({
  id: p.id,
  name: p.name,
  formation: p.formation,
  playType: p.playType as StoredPlay["playType"],
  personnel: p.personnel,
  description: p.description,
  tags: p.tags ?? [],
  isPublic: p.isPublic,
  ownerName: p.ownerName || "Coach",
  fieldView: p.fieldView as StoredPlay["fieldView"],
  scene: p.scene,
  preview: p.preview,
  saveCount: p.saveCount ?? 0,
  updatedAt: p.updatedAt,
  remote: true,
});
