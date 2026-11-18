/**
 * The Film Room voice: a stock voice that reads a lesson step aloud for a
 * coach who would rather not record. The speech is made in the coach's own
 * browser (an open speech model run with WebAssembly, in a worker), so nothing
 * is sent to a voice service and a lesson costs nothing to read. What it makes
 * is kept exactly like the coach's own recording (`/api/voice`), so players
 * only ever press play on a finished clip and never download the model.
 *
 * It is a stock voice. It is not a copy of any real person's voice and must
 * never be described as sounding like one.
 */
export const READER = {
  /** The speech model, its sounds table and the stock voice. Versioned names, so they can be cached for good. */
  model: "/voice-model/kokoro-v1-q8.onnx",
  vocab: "/voice-model/vocab.json",
  voice: "/voice-model/voice-c.bin",
  /** Megabytes the coach's browser fetches the first time. */
  megabytes: 92,
  /** Samples a second in what the model makes. */
  rate: 24_000,
  /** A touch under the model's natural pace, so a step is never rushed. */
  speed: 0.92,
  /** Sounds in one pass; a longer step is read sentence by sentence. */
  maxSounds: 400,
  /** Quiet between sentences, in seconds. */
  gap: 0.28,
} as const;

/** Words a coach writes that should be said differently. Only whole words. */
const SAY: [RegExp, string][] = [
  [/\bLOS\b/g, "line of scrimmage"],
  [/\bvs\.?(?=\s)/gi, "versus"],
  [/\bQB\b/g, "quarterback"],
  [/\byds?\b/gi, "yards"],
  [/\s*·\s*/g, ", "],
  [/\s*[→]\s*/g, " to "],
  [/[“”"]/g, ""],
];

/** A step's caption as it should be said. */
export function spokenText(text: string): string {
  let out = text.replace(/[{}]/g, "");
  for (const [from, to] of SAY) out = out.replace(from, to);
  return out.replace(/\s+/g, " ").trim();
}

/** A caption split where a coach would breathe: after each sentence. */
export function sentences(text: string): string[] {
  return (spokenText(text).match(/[^.!?]+[.!?]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

/** Mono samples as a 16-bit WAV file, which every browser plays and the lesson video can read. */
export function wavBlob(samples: Float32Array, rate: number = READER.rate): Blob {
  const bytes = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at: number, s: string) => [...s].forEach((c, i) => bytes.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  bytes.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVEfmt ");
  bytes.setUint32(16, 16, true);
  bytes.setUint16(20, 1, true);
  bytes.setUint16(22, 1, true);
  bytes.setUint32(24, rate, true);
  bytes.setUint32(28, rate * 2, true);
  bytes.setUint16(32, 2, true);
  bytes.setUint16(34, 16, true);
  text(36, "data");
  bytes.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) bytes.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return new Blob([bytes.buffer], { type: "audio/wav" });
}

/** Coach wording for a read that didn't happen. */
export class ReaderError extends Error {
  name = "ReaderError";
}

export type ReaderMessage = { kind: "ready" } | { kind: "done"; n: number; samples: Float32Array } | { kind: "failed"; n: number; missing?: boolean };

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let n = 0;
const waiting = new Map<number, { done: (s: Float32Array) => void; failed: (e: ReaderError) => void }>();

const MISSING = "The Film Room voice isn't set up on this site yet. Record the step in your own voice for now.";
const FAILED = "The Film Room voice couldn't read that in this browser. Try Chrome or Edge on a computer, or record the step yourself.";

function start(): Promise<void> {
  if (ready) return ready;
  ready = new Promise<void>((resolve, reject) => {
    if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") return reject(new ReaderError(FAILED));
    const w = new Worker(new URL("./readAloud.worker.ts", import.meta.url), { type: "module" });
    worker = w;
    const stop = (e: ReaderError) => {
      reject(e);
      for (const job of waiting.values()) job.failed(e);
      waiting.clear();
      w.terminate();
      worker = null;
      ready = null;
    };
    w.onerror = () => stop(new ReaderError(FAILED));
    w.onmessage = (ev: MessageEvent<ReaderMessage>) => {
      const m = ev.data;
      if (m.kind === "ready") return resolve();
      if (m.kind === "failed" && m.n < 0) return stop(new ReaderError(m.missing ? MISSING : FAILED));
      const job = waiting.get(m.n);
      if (!job) return;
      waiting.delete(m.n);
      if (m.kind === "done") job.done(m.samples);
      else job.failed(new ReaderError(FAILED));
    };
    w.postMessage({ kind: "load", reader: READER });
  });
  return ready;
}

/**
 * Reads one step aloud and answers the clip to keep. The first call fetches
 * the model (about 92 MB, then the browser keeps it); `onStage` says which
 * part is running so the button can tell the coach.
 */
export async function readAloud(text: string, onStage?: (stage: "loading" | "reading") => void): Promise<{ clip: Blob; ms: number }> {
  const parts = sentences(text);
  if (!parts.length) throw new ReaderError("This step has no words to read.");
  onStage?.("loading");
  await start();
  onStage?.("reading");
  const id = ++n;
  const samples = await new Promise<Float32Array>((done, failed) => {
    waiting.set(id, { done, failed });
    worker!.postMessage({ kind: "read", n: id, parts });
  });
  if (!samples.length) throw new ReaderError(FAILED);
  return { clip: wavBlob(samples), ms: Math.round((samples.length / READER.rate) * 1000) };
}
