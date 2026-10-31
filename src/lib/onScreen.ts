/** DOM helpers for the guided tours: what is actually on screen, where it is, and a click on it. */
export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The first matching element that is actually on screen (not display:none, not slid off the edge). */
export function visible(selector: string): HTMLElement | null {
  let list: HTMLElement[];
  try {
    list = [...document.querySelectorAll<HTMLElement>(selector)];
  } catch {
    return null;
  }
  for (const el of list) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.right <= 0 || r.left >= innerWidth) continue;
    const css = getComputedStyle(el);
    if (css.visibility === "hidden" || Number(css.opacity) === 0) continue;
    return el;
  }
  return null;
}

/** Every element matching the selector, boxed together (a step can name two, e.g. zoom and Fit). */
export function boxOf(selector: string): DOMRect | null {
  const first = visible(selector);
  if (!first) return null;
  let rects: DOMRect[] = [];
  try {
    rects = [...document.querySelectorAll<HTMLElement>(selector)]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 1 && r.height > 1);
  } catch {
    return first.getBoundingClientRect();
  }
  const l = Math.min(...rects.map((r) => r.left));
  const t = Math.min(...rects.map((r) => r.top));
  const rt = Math.max(...rects.map((r) => r.right));
  const b = Math.max(...rects.map((r) => r.bottom));
  return new DOMRect(l, t, rt - l, b - t);
}

export const click = (selector: string) => {
  const el = visible(selector);
  el?.click();
  return !!el;
};

