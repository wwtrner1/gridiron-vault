import { useEffect } from "react";
import { store } from "../lib/store";
import type { LocalPlaybook, SheetDoc } from "../lib/store";
import { presetStore, type PlayerPreset } from "../lib/playerPresets";
import { useToast } from "../lib/toast";
import type { StoredPlay } from "../lib/types";

/**
 * Plays saved in a browser under an earlier address (gridi1ronvault.netlify.app,
 * then gridiron-vault.netlify.app) can't be read from gridiron-vault.com, so
 * that address's forwarding script (old-address/move.js, public/handoff.js)
 * packs them into the link (#carry=…) on the way here. This unpacks them into
 * this browser's Vault, keeping the newer copy of anything that's already here.
 * Other saved settings (roster, rules, wristband choices…) come over only where
 * this browser has nothing yet, then the page reloads once so they take effect.
 * Sign-in (gotrue.*) is never carried.
 */
type Carried = {
  v: 1 | 2;
  keys?: Record<string, string>;
  ws?: { plays?: StoredPlay[]; playbooks?: LocalPlaybook[]; sheets?: SheetDoc[] };
  presets?: PlayerPreset[] | null;
};

function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function unpack(kind: string, data: string): Promise<Carried> {
  const bytes = fromB64url(data);
  if (kind === "gz") {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

const CARRY_PREFIXES = ["snapline.", "grid1ronvault.", "nextplay."];
const HANDLED_ELSEWHERE = new Set(["snapline.workspace.v1", "grid1ronvault.playerPresets.v1", "grid1ronvault.handedOff.v1"]);
const AFTER_RELOAD = "grid1ronvault.carryToast";

/** Writes carried settings this browser doesn't have yet; returns how many it wrote. */
function carryKeys(keys: Record<string, string> | undefined): number {
  let wrote = 0;
  for (const [k, v] of Object.entries(keys ?? {})) {
    if (typeof v !== "string" || v.length > 2_000_000) continue;
    if (k.startsWith("gotrue.") || HANDLED_ELSEWHERE.has(k)) continue;
    if (!CARRY_PREFIXES.some((p) => k.startsWith(p))) continue;
    try {
      if (localStorage.getItem(k) !== null) continue;
      localStorage.setItem(k, v);
      wrote++;
    } catch {
      /* storage full or blocked: skip this one */
    }
  }
  return wrote;
}

export function CarryOver() {
  const toast = useToast();
  useEffect(() => {
    // A carry that wrote settings reloaded the page so they take effect; say so now.
    try {
      const pending = sessionStorage.getItem(AFTER_RELOAD);
      if (pending) {
        sessionStorage.removeItem(AFTER_RELOAD);
        toast(pending);
      }
    } catch {
      /* no session storage: skip the message */
    }
    const m = location.hash.match(/^#carry=(gz|raw)\.([A-Za-z0-9_-]+)$/);
    if (!m) return;
    // Take it out of the address bar straight away, so a reload or a shared link doesn't repeat it.
    history.replaceState(null, "", location.pathname + location.search);
    (async () => {
      try {
        const got = await unpack(m[1], m[2]);
        const plays = got.ws?.plays ?? [];
        const have = store.get();
        if (plays.length) store.mergeRemotePlays(plays);
        for (const b of got.ws?.playbooks ?? []) if (!have.playbooks.some((x) => x.id === b.id)) store.upsertPlaybook(b);
        for (const s of got.ws?.sheets ?? []) if (!have.sheets.some((x) => x.id === s.id)) store.upsertSheet(s);
        for (const p of got.presets ?? []) if (!presetStore.get().some((x) => x.id === p.id)) presetStore.save(p);
        const books = got.ws?.playbooks?.length ?? 0;
        const wrote = carryKeys(got.keys);
        const msg =
          plays.length || books
            ? `Welcome to gridiron-vault.com. ${plays.length} ${plays.length === 1 ? "play" : "plays"}${books ? ` and ${books} ${books === 1 ? "playbook" : "playbooks"}` : ""} came over from the old address.`
            : wrote
              ? "Welcome to gridiron-vault.com. Your saved settings came over from the old address."
              : "";
        if (wrote) {
          // Most settings are read when the app starts, so start it again with them in place.
          try {
            if (msg) sessionStorage.setItem(AFTER_RELOAD, msg);
          } catch {
            /* the reload still applies them */
          }
          location.reload();
          return;
        }
        if (msg) toast(msg);
      } catch {
        toast("Some plays saved under the old address couldn't be brought over.", true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
