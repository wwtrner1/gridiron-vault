import { useEffect, useSyncExternalStore } from "react";
import { api } from "./api";
import { useAuth } from "./auth";
import { cleanBrand, colorsFromPixels, DEFAULT_BRAND, LOGO_MAX_CHARS, LOGO_PX, type TeamBrand } from "./brandData";

export * from "./brandData";

/**
 * Team branding: the coach's team name, logo and two colors. Kept in this
 * browser and copied to the account while signed in (`BrandSync`, newer
 * wins), so every device draws the same field. The field draws the logo at
 * midfield and the colors in the end zones, and wristbands and PDFs carry the
 * name, logo and colors. The logo is a small PNG data URL (the CSP allows
 * data: images).
 */
const KEY = "grid1ronvault.brand.v1";

function read(): TeamBrand {
  try {
    return cleanBrand(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return DEFAULT_BRAND;
  }
}

let state = read();
const listeners = new Set<(from: "local" | "account") => void>();

function write(next: TeamBrand, from: "local" | "account") {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    if (from === "local" && next.logo && next.logo !== state.logo) throw new Error("This browser is out of room for the logo. Try a smaller image.");
  }
  state = next;
  listeners.forEach((l) => l(from));
}

export const brandStore = {
  get: () => state,
  subscribe(l: (from: "local" | "account") => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  /** A change made here: stamped now, and the account copy follows a moment later. Throws a coach-facing message when storage is full. */
  set(patch: Partial<TeamBrand>) {
    write(cleanBrand({ ...state, ...patch, updatedAt: new Date().toISOString() }), "local");
  },
  clear() {
    brandStore.set({ ...DEFAULT_BRAND });
  },
};

export const useBrand = () => useSyncExternalStore(brandStore.subscribe, brandStore.get, brandStore.get);

/** True once the coach has set anything worth showing. */
export const hasBrand = (b: TeamBrand) => !!(b.logo || b.name.trim() || b.primary !== DEFAULT_BRAND.primary || b.secondary !== DEFAULT_BRAND.secondary);

/** What the account holds, so an unchanged brand isn't sent again. */
let sentAt = "";
const PUSH_DELAY_MS = 1500;

async function pushBrand() {
  const b = brandStore.get();
  // A browser that has never been branded has nothing to send (and must not blank the account's).
  if (!b.updatedAt || b.updatedAt === sentAt) return;
  try {
    const res = await api.saveBrand(b);
    sentAt = res.brand?.updatedAt ?? b.updatedAt;
  } catch {
    /* still saved in this browser; the next change tries again */
  }
}

/**
 * Mounted once, under the sign-in provider, like MyTeamSync. Signing in pulls
 * the account's brand and keeps whichever is newer; every change here pushes
 * a moment later.
 */
export function BrandSync() {
  const { account } = useAuth();
  const id = account?.id;

  useEffect(() => {
    if (!id) return;
    let alive = true;
    let timer: number | undefined;
    const off = brandStore.subscribe((from) => {
      if (from !== "local" || !alive) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void pushBrand(), PUSH_DELAY_MS);
    });
    // Pull first, so a fresh browser never sends the default look over the account's.
    api
      .brand()
      .then(({ brand: raw }) => {
        if (!alive || !raw) return;
        const remote = cleanBrand(raw);
        const local = brandStore.get();
        if (remote.updatedAt > local.updatedAt) {
          write(remote, "account");
          sentAt = remote.updatedAt;
        } else if (remote.updatedAt === local.updatedAt) sentAt = local.updatedAt;
      })
      .catch(() => {
        /* offline: the brand in this browser still works */
      })
      .finally(() => {
        if (alive) void pushBrand();
      });
    return () => {
      alive = false;
      window.clearTimeout(timer);
      off();
    };
  }, [id]);

  return null;
}

/**
 * Reads an image file into a logo: scaled to at most LOGO_PX, kept as PNG so a
 * see-through background stays see-through, plus the colors pulled from it.
 */
export async function logoFromFile(file: File): Promise<{ logo: string; primary: string; secondary: string } | null> {
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) throw new Error("Choose a PNG, JPG, WebP, GIF or SVG image of your logo.");
  if (file.size > 8 * 1024 * 1024) throw new Error("That image is over 8 MB. Choose a smaller copy of your logo.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That image didn't open. Try saving it as a PNG first."));
      i.src = url;
    });
    const w0 = img.naturalWidth || LOGO_PX;
    const h0 = img.naturalHeight || LOGO_PX;
    const k = Math.min(1, LOGO_PX / Math.max(w0, h0));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w0 * k));
    canvas.height = Math.max(1, Math.round(h0 * k));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const logo = canvas.toDataURL("image/png");
    if (logo.length > LOGO_MAX_CHARS) throw new Error("That logo is too detailed to keep. Try a simpler or smaller image.");
    const colors = colorsFromPixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data) ?? { primary: DEFAULT_BRAND.primary, secondary: DEFAULT_BRAND.secondary };
    return { logo, ...colors };
  } finally {
    URL.revokeObjectURL(url);
  }
}
