/**
 * Fetches the Film Room voice's speech model (Kokoro v1.0, Apache-2.0, about
 * 325 MB) into voice-model/, which git ignores: the file is too big for the
 * repository. The build (`voiceModel` in vite.config.ts) then cuts it into
 * small parts under dist/voice-model/. The download is pinned by its SHA-256,
 * so a changed file is refused. A failed fetch never fails the build: the
 * site ships without the voice and the button says it isn't set up.
 *
 *   node scripts/voice-model.mjs
 */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx";
const SHA256 = "7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5";
const BYTES = 325_532_387;
const FILE = "voice-model/kokoro-v1.0.onnx";

const sha = async (path) => {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
};

try {
  if (existsSync(FILE) && statSync(FILE).size === BYTES && (await sha(FILE)) === SHA256) {
    console.log("voice model: already here");
  } else {
    mkdirSync("voice-model", { recursive: true });
    const res = await fetch(URL);
    if (!res.ok || !res.body) throw new Error(`answered ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(`${FILE}.tmp`));
    if ((await sha(`${FILE}.tmp`)) !== SHA256) throw new Error("the file fetched isn't the pinned one");
    renameSync(`${FILE}.tmp`, FILE);
    console.log("voice model: fetched");
  }
} catch (e) {
  rmSync(`${FILE}.tmp`, { force: true });
  console.warn(`voice model: not fetched (${e instanceof Error ? e.message : e}). The site builds without the Film Room voice.`);
}
