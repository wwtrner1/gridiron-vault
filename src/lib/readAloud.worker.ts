/// <reference lib="webworker" />
/**
 * The Film Room voice's worker: turns words into sounds (espeak-ng's
 * phonemes), the sounds into the model's numbers, and runs the speech model.
 * It lives in a worker so the lesson stays alive while a step is read.
 */
import * as ort from "onnxruntime-web/wasm";
import { phonemize } from "phonemizer";
import type { READER, ReaderMessage } from "./readAloud";

type Reader = typeof READER;
type Ask = { kind: "load"; reader: Reader } | { kind: "read"; n: number; parts: string[] };

let reader: Reader;
let session: ort.InferenceSession;
let vocab: Record<string, number>;
let voice: Float32Array;

const say = (m: ReaderMessage, move: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(m, move);

async function load(r: Reader) {
  reader = r;
  // One thread: it needs no cross-origin isolation and reads faster than real time.
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = "/ort/";
  // A missing file comes back as the app's own page, not a 404, so the type is checked too.
  const there = (f: Response) => f.ok && !(f.headers.get("content-type") ?? "").includes("text/html");
  const [table, style] = await Promise.all([fetch(r.vocab), fetch(r.voice)]);
  if (!there(table) || !there(style)) return say({ kind: "failed", n: -1, missing: true });
  vocab = (await table.json()) as Record<string, number>;
  voice = new Float32Array(await style.arrayBuffer());
  // The model arrives in parts, four at a time, and is put back together here.
  const model = new Uint8Array(r.bytes);
  const count = Math.ceil(r.bytes / r.partBytes);
  let next = 0;
  let got = 0;
  let missing = false;
  const take = async () => {
    while (next < count && !missing) {
      const i = next++;
      const f = await fetch(`${r.model}.${i}.part`);
      if (!there(f)) return void (missing = true);
      const part = new Uint8Array(await f.arrayBuffer());
      if (i * r.partBytes + part.length > r.bytes) return void (missing = true);
      model.set(part, i * r.partBytes);
      got += part.length;
      say({ kind: "fetched", pct: Math.round((got / r.bytes) * 100) });
    }
  };
  await Promise.all([take(), take(), take(), take()]);
  if (missing || got !== r.bytes) return say({ kind: "failed", n: -1, missing: true });
  session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
  say({ kind: "ready" });
}

/** A sentence as the model's sounds, with its commas and stops kept so the voice pauses where the words do. */
async function sounds(sentence: string): Promise<number[]> {
  let out = "";
  for (const part of sentence.split(/([,.!?;:])/)) {
    if (/^[,.!?;:]$/.test(part)) out += part;
    else if (part.trim()) out += (out ? " " : "") + (await phonemize(part.trim(), "en-us")).join(" ");
  }
  return [...out].map((c) => vocab[c]).filter((v): v is number => v !== undefined).slice(0, reader.maxSounds);
}

async function read(parts: string[]): Promise<Float32Array> {
  const chunks: Float32Array[] = [];
  const quiet = new Float32Array(Math.round(reader.gap * reader.rate));
  for (const part of parts) {
    const ids = await sounds(part);
    if (!ids.length) continue;
    // The voice file holds one style per length of sentence.
    const at = Math.min(ids.length, voice.length / 256 - 1) * 256;
    const result = await session.run({
      tokens: new ort.Tensor("int64", BigInt64Array.from([0, ...ids, 0].map(BigInt)), [1, ids.length + 2]),
      style: new ort.Tensor("float32", voice.slice(at, at + 256), [1, 256]),
      speed: new ort.Tensor("float32", [reader.speed], [1]),
    });
    const data = Object.values(result)[0].data as Float32Array;
    if (chunks.length) chunks.push(quiet);
    chunks.push(data);
  }
  const all = new Float32Array(chunks.reduce((sum, c) => sum + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return all;
}

self.onmessage = async (ev: MessageEvent<Ask>) => {
  const ask = ev.data;
  if (ask.kind === "load") return load(ask.reader).catch(() => say({ kind: "failed", n: -1 }));
  try {
    const samples = await read(ask.parts);
    say({ kind: "done", n: ask.n, samples }, [samples.buffer]);
  } catch {
    say({ kind: "failed", n: ask.n });
  }
};
