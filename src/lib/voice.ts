/**
 * A coach's own voice on a Film Room lesson: one short clip per step, recorded
 * in the browser and kept on the account (`/api/voice`). Shared by the page
 * and the function, so both hold a clip to the same limits.
 */
export const VOICE_LIMITS = {
  /** Bytes in one clip. A 45 second clip at the recorder's bitrate is well under this. */
  size: 1024 * 1024,
  /** Milliseconds in one clip. */
  ms: 45_000,
  /** The shortest clip worth keeping. */
  minMs: 400,
  /** Bytes of clips one coach keeps. */
  total: 60 * 1024 * 1024,
} as const;

/** What a browser's recorder makes: WebM (Chrome, Edge, Firefox) or MP4 (Safari). WAV is what the Film Room voice reads a step into. */
export const VOICE_TYPES = ["audio/webm", "audio/mp4", "audio/ogg", "audio/wav"] as const;

/** `audio/webm;codecs=opus` → `audio/webm`, or "" when it isn't a voice clip we keep. */
export function voiceType(raw: string): string {
  const base = raw.split(";")[0].trim().toLowerCase();
  return (VOICE_TYPES as readonly string[]).includes(base) ? base : "";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isVoiceId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Where a clip plays from. The id is random and unguessable, so a player on a team link can hear it without an account. */
export const voiceUrl = (id: string) => `/api/voice/${id}`;

/** One step's clip: the account's id for it and how long it runs. `by: "reader"` marks one the Film Room voice read, not the coach. */
export type VoiceClip = { id: string; ms: number; by?: "reader" };

export function cleanClip(raw: unknown): VoiceClip | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (!isVoiceId(r.id) || typeof r.ms !== "number" || !Number.isFinite(r.ms)) return undefined;
  const ms = Math.round(r.ms);
  if (ms < VOICE_LIMITS.minMs || ms > VOICE_LIMITS.ms) return undefined;
  return r.by === "reader" ? { id: r.id.toLowerCase(), ms, by: "reader" } : { id: r.id.toLowerCase(), ms };
}
