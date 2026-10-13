import { useEffect } from "react";
import { store } from "../lib/store";
import type { LocalPlaybook, SheetDoc } from "../lib/store";
import { presetStore, type PlayerPreset } from "../lib/playerPresets";
import { useToast } from "../lib/toast";
import type { StoredPlay } from "../lib/types";

/**
 * Plays saved in a browser under the old address (gridi1ronvault.netlify.app)
 * can't be read from the new one, so the old address's forwarding page packs
 * them into the link (#carry=…) on the way here. This unpacks them into this
 * browser's Vault, keeping the newer copy of anything that's already here.
 */
type Carried = {
  v: 1;
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

export function CarryOver() {
  const toast = useToast();
  useEffect(() => {
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
        if (plays.length || books)
          toast(
            `Welcome to the new address. ${plays.length} ${plays.length === 1 ? "play" : "plays"}${books ? ` and ${books} ${books === 1 ? "playbook" : "playbooks"}` : ""} came over from the old one.`,
          );
      } catch {
        toast("Some plays saved under the old address couldn't be brought over. Open gridi1ronvault.netlify.app once more to try again.", true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
