import { useEffect, useState } from "react";

/**
 * The guides' text (lib/guides.ts) is loaded the first time a screen asks for
 * it, not with the app, so the first download stays small.
 */
export type Guides = typeof import("./guides");
let guidesMod: Guides | null = null;
let guidesLoad: Promise<Guides> | null = null;
export const loadGuides = () =>
  (guidesLoad ??= import("./guides").then((m) => (guidesMod = m)).catch((e) => ((guidesLoad = null), Promise.reject(e))));

/** The guides once loaded; starts the load on first use. */
export function useGuides(): Guides | null {
  const [mod, setMod] = useState(guidesMod);
  useEffect(() => {
    if (mod) return;
    let live = true;
    loadGuides().then((m) => live && setMod(m), () => {});
    return () => {
      live = false;
    };
  }, [mod]);
  return mod;
}
