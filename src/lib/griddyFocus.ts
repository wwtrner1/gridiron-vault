/**
 * The plays a coach has in front of them, for Griddy's "these plays": the
 * plays picked in the Vault, or the playbook open on Playbooks. Each screen
 * sets its own entry while it shows them and clears it when it closes; the
 * latest one set wins. Tiny and dependency-free, because the Vault and
 * Playbooks load it with their first paint.
 */
export type GriddyFocus = { label: string; ids: string[] };

const entries = new Map<string, { focus: GriddyFocus; at: number }>();
let tick = 0;

export function setGriddyFocus(screen: string, focus: GriddyFocus | null) {
  if (focus && focus.ids.length) entries.set(screen, { focus, at: ++tick });
  else entries.delete(screen);
}

export function griddyFocus(): GriddyFocus | null {
  let best: { focus: GriddyFocus; at: number } | null = null;
  for (const e of entries.values()) if (!best || e.at > best.at) best = e;
  return best?.focus ?? null;
}
