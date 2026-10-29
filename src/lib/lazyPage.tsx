import { lazy, type ComponentType } from "react";

/**
 * Screens load on first visit instead of all in one first download. Two things
 * come with that:
 * - After a release, an open tab still asks for the old file names, which no
 *   longer exist. The first failed load reloads the page once, to the new release.
 * - The app still has to open every screen with no signal at the field, so once
 *   the first screen is up every other one is fetched quietly in the background
 *   (`warmPages`), and the service worker keeps them.
 */
const loaders: (() => Promise<unknown>)[] = [];
const RELOADED = "grid1ronvault.reloaded";

export function lazyPage<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  loaders.push(load);
  return lazy(() =>
    load().then(
      (m) => {
        try {
          sessionStorage.removeItem(RELOADED);
        } catch {
          /* storage off: nothing to clear */
        }
        return { default: m[name] as ComponentType<any> };
      },
      (err) => {
        let again = false;
        try {
          again = !sessionStorage.getItem(RELOADED);
          if (again) sessionStorage.setItem(RELOADED, "1");
        } catch {
          /* storage off: don't risk a reload loop */
        }
        if (again) {
          window.location.reload();
          return new Promise<never>(() => {});
        }
        throw err;
      },
    ),
  );
}

let warmed = false;
/** Fetch every screen once the browser is idle, a few at a time. */
export function warmPages() {
  if (warmed) return;
  warmed = true;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  const idle = (fn: () => void) => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(fn, { timeout: 4000 });
    else setTimeout(fn, 1500);
  };
  const queue = [...loaders];
  const next = () => {
    const batch = queue.splice(0, 3);
    if (!batch.length) return;
    Promise.allSettled(batch.map((l) => l())).then(() => idle(next));
  };
  idle(next);
}

/** What shows for the moment a screen is still loading. */
export function PageLoading() {
  return (
    <div className="page-loading" data-page-loading role="status">
      <span className="sr-only">Loading</span>
      <span className="page-loading-bar" aria-hidden="true" />
    </div>
  );
}
