/**
 * Route and block shapes as relative segments from the player. Negative y is
 * downfield. Shared by the starter plays and the Designer's player presets.
 */
export type Seg = [number, number];

/**
 * Route shapes as relative segments. Negative y is downfield; positive x is
 * toward the near sideline (out) and negative x toward the middle (in), for
 * a receiver on the right. Left-side players get the shape mirrored.
 */
export const ROUTES: Record<string, Seg[]> = {
  go: [[0, -250]],
  seam: [[0, -60], [22, -190]],
  fade: [[0, -50], [68, -186]],
  corner: [[0, -120], [104, -114]],
  post: [[0, -132], [-112, -118]],
  cross: [[0, -68], [-252, -116]],
  dig: [[0, -116], [-164, -4]],
  in: [[0, -92], [-148, -4]],
  out: [[0, -96], [128, -4]],
  hitch: [[0, -84], [14, 26]],
  comeback: [[0, -164], [46, 52]],
  slant: [[0, -38], [-100, -104]],
  flat: [[6, -28], [140, -12]],
  drag: [[0, -34], [-206, -6]],
  wheel: [[0, 16], [82, 34], [104, -188]],
  swing: [[0, 28], [122, 46]],
  screen: [[0, 22], [-92, 36]],
  chair: [[0, -92], [112, -8], [4, -96]],
  option: [[0, -88], [56, -34]],
  pivot: [[0, -46], [46, 24], [-64, -22]],
  stop: [[0, -110], [0, 24]],
  curl: [[0, -110], [-22, 26]],
  block: [[0, -44]],
  dive: [[0, -62], [-8, -120]],
  sweep: [[0, 18], [168, 6], [26, -196]],
  counter: [[0, 16], [-140, 10], [-18, -180]],
  keep: [[0, -20], [96, -54], [18, -150]],
  reverse: [[0, 12], [-210, 18], [-26, -186]],
  end_around: [[0, 24], [188, 14], [22, -180]],
  qb_sneak: [[0, -110]],
  rush: [[0, 96]],
  drop: [[0, 78]],
};

/** Extra route shapes the Designer's presets offer. */
ROUTES.bubble = [[26, 16], [104, 22]];

/** Block shapes, ending in a T-bar (chip & release ends in an arrow). */
export const BLOCKS: Record<string, Seg[]> = {
  base: [[0, -44]],
  reach: [[40, -40]],
  down: [[-44, -38]],
  pull: [[0, 18], [118, 12], [22, -52]],
  chip: [[18, -26], [36, -118]],
};

/** Route choices in the preset editor, as the canvas lists them (plus Seam and Rush for its examples). */
export const PRESET_ROUTES: { id: string; label: string }[] = [
  { id: "flat", label: "1 · Flat" },
  { id: "slant", label: "2 · Slant" },
  { id: "comeback", label: "3 · Comeback" },
  { id: "curl", label: "4 · Curl" },
  { id: "out", label: "5 · Out" },
  { id: "dig", label: "6 · Dig" },
  { id: "corner", label: "7 · Corner" },
  { id: "post", label: "8 · Post" },
  { id: "go", label: "9 · Go" },
  { id: "bubble", label: "Bubble" },
  { id: "wheel", label: "Wheel" },
  { id: "seam", label: "Seam" },
  { id: "rush", label: "Rush" },
];

export const PRESET_BLOCKS: { id: string; label: string }[] = [
  { id: "base", label: "Base" },
  { id: "reach", label: "Reach" },
  { id: "down", label: "Down" },
  { id: "pull", label: "Pull" },
  { id: "chip", label: "Chip & release" },
];
