import type { Scene, StoredPlay } from "./types";
import { deviceId } from "./device";
import type { AssistantRead, AssistantRequest } from "./assistant";
import type { PhotoRead, PhotoRequest } from "./photo";
import type { GriddyReply, GriddyRequest } from "./griddy";
import type { QuizScore, ShareInfo, Snapshot } from "./share";

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

  me: () => request<{ user: { id: string; email: string; name: string } | null; owner?: boolean; plan?: string; trialEndsAt?: string; security?: Security }>("me"),

  /** During beta a coach picks their own plan; the server enforces it. */
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

  listPlaybooks: () => request<{ playbooks: Playbook[] }>("playbooks"),

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

  listSheets: () => request<{ sheets: RemoteSheet[] }>("call-sheets"),

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
