import { useSyncExternalStore } from "react";

/**
 * Team branding: the coach's team name, logo and two colors, remembered per
 * browser. The field draws the logo at midfield and the colors in the end
 * zones, and wristbands and PDFs carry the name, logo and colors, so every
 * diagram looks like the coach's own program. The logo is kept as a small PNG
 * data URL (the CSP allows data: images), never uploaded.
 */
export type TeamBrand = {
  name: string;
  /** A PNG data URL, at most LOGO_PX on its long side; null for none. */
  logo: string | null;
  primary: string;
  secondary: string;
  /** Logo at midfield on the field. */
  logoOnField: boolean;
  /** End zones in team colors, with the team name. */
  endZones: boolean;
  /** Name, logo and colors on wristbands and PDF exports. */
  prints: boolean;
};

export const LOGO_PX = 256;
/** A logo past this (as a data URL) is refused rather than filling the browser's storage. */
export const LOGO_MAX_CHARS = 400_000;
export const BRAND_NAME_MAX = 40;

export const DEFAULT_BRAND: TeamBrand = {
  name: "",
  logo: null,
  primary: "#0B1524",
  secondary: "#16C8E8",
  logoOnField: true,
  endZones: true,
  prints: true,
};

/** One-click team colors for coaches without a logo to pull them from. */
export const BRAND_PRESETS: { label: string; primary: string; secondary: string }[] = [
  { label: "Navy and gold", primary: "#1B2A4A", secondary: "#F2B705" },
  { label: "Red and white", primary: "#B3232F", secondary: "#FFFFFF" },
  { label: "Royal and white", primary: "#1E4FB8", secondary: "#FFFFFF" },
  { label: "Green and gold", primary: "#1F5B3A", secondary: "#E8B820" },
  { label: "Black and orange", primary: "#151515", secondary: "#F26B1D" },
  { label: "Maroon and gold", primary: "#6B1F2E", secondary: "#D9A520" },
  { label: "Purple and gold", primary: "#4B2A85", secondary: "#F2B705" },
  { label: "Black and gold", primary: "#151515", secondary: "#C9A227" },
  { label: "Columbia and navy", primary: "#5DA9E9", secondary: "#13294B" },
  { label: "Orange and white", primary: "#E35205", secondary: "#FFFFFF" },
];

const KEY = "grid1ronvault.brand.v1";
const HEX = /^#[0-9a-f]{6}$/i;

export function cleanBrand(raw: unknown): TeamBrand {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<TeamBrand>;
  const d = DEFAULT_BRAND;
  const logo = typeof r.logo === "string" && r.logo.startsWith("data:image/png;base64,") && r.logo.length <= LOGO_MAX_CHARS ? r.logo : null;
  return {
    name: typeof r.name === "string" ? r.name.slice(0, BRAND_NAME_MAX) : d.name,
    logo,
    primary: typeof r.primary === "string" && HEX.test(r.primary) ? r.primary.toUpperCase() : d.primary,
    secondary: typeof r.secondary === "string" && HEX.test(r.secondary) ? r.secondary.toUpperCase() : d.secondary,
    logoOnField: typeof r.logoOnField === "boolean" ? r.logoOnField : d.logoOnField,
    endZones: typeof r.endZones === "boolean" ? r.endZones : d.endZones,
    prints: typeof r.prints === "boolean" ? r.prints : d.prints,
  };
}

function read(): TeamBrand {
  try {
    return cleanBrand(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return DEFAULT_BRAND;
  }
}

let state = read();
const listeners = new Set<() => void>();

export const brandStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Throws a coach-facing message when the browser's storage is full. */
  set(patch: Partial<TeamBrand>) {
    const next = cleanBrand({ ...state, ...patch });
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      if (patch.logo) throw new Error("This browser is out of room for the logo. Try a smaller image.");
    }
    state = next;
    listeners.forEach((l) => l());
  },
  clear() {
    brandStore.set({ ...DEFAULT_BRAND });
  },
};

export const useBrand = () => useSyncExternalStore(brandStore.subscribe, brandStore.get, brandStore.get);

/** True once the coach has set anything worth showing. */
export const hasBrand = (b: TeamBrand) => !!(b.logo || b.name.trim() || b.primary !== DEFAULT_BRAND.primary || b.secondary !== DEFAULT_BRAND.secondary);

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();

/** Relative luminance (WCAG). */
export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** White or ink, whichever reads on this color. */
export const inkOn = (hex: string) => (luminance(hex) > 0.4 ? "#0B1524" : "#FFFFFF");

/** A color mixed toward white, for tints that keep the play readable on top. */
export function tint(hex: string, amount: number) {
  const [r, g, b] = hexToRgb(hex);
  return toHex(r + (255 - r) * (1 - amount), g + (255 - g) * (1 - amount), b + (255 - b) * (1 - amount));
}

/**
 * The two colors a logo is mostly made of: pixels are bucketed by hue and
 * shade, see-through and near-white ones are skipped (the background), and the
 * second color must differ clearly from the first. Pure, over RGBA bytes.
 */
export function colorsFromPixels(data: ArrayLike<number>): { primary: string; secondary: string } | null {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 160) continue;
    if (r > 236 && g > 236 && b > 236) continue;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const s = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    s.n++;
    s.r += r;
    s.g += g;
    s.b += b;
    buckets.set(key, s);
  }
  const ranked = [...buckets.values()].sort((a, b) => b.n - a.n).map((s) => ({ n: s.n, rgb: [s.r / s.n, s.g / s.n, s.b / s.n] as const }));
  if (!ranked.length) return null;
  const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const first = ranked[0];
  // Second: the most common color that is clearly different and covers a real share of the logo.
  const second = ranked.find((c) => dist(c.rgb, first.rgb) > 90 && c.n >= first.n * 0.04);
  const hex = (c: readonly number[]) => toHex(c[0], c[1], c[2]);
  return { primary: hex(first.rgb), secondary: second ? hex(second.rgb) : "#FFFFFF" };
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
