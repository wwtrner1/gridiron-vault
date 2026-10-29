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

/** Also for heavy parts of a screen that open on a click (the export dialog); the component keeps its prop types. */
export function lazyPage<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  loaders.push(load);
  // A screen loaded after the warm-up started still gets its parts fetched for offline use.
  if (warmed) idle(pump);
  return lazy<M[K] extends ComponentType<any> ? M[K] : ComponentType<any>>(() =>
    load().then(
      (m) => {
        try {
          sessionStorage.removeItem(RELOADED);
        } catch {
          /* storage off: nothing to clear */
        }
        return { default: m[name] as any };
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
let fetched = 0;
let pumping = false;

const idle = (fn: () => void) => {
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(fn, { timeout: 4000 });
  else setTimeout(fn, 1500);
};

/** Fetches the next few not yet fetched, then the next few once the browser is idle again. */
function pump() {
  if (pumping) return;
  const batch = loaders.slice(fetched, fetched + 3);
  if (!batch.length) return;
  pumping = true;
  fetched += batch.length;
  Promise.allSettled(batch.map((l) => l())).then(() => {
    pumping = false;
    idle(pump);
  });
}

/** Fetch every screen once the browser is idle, a few at a time. */
export function warmPages() {
  if (warmed) return;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  warmed = true;
  idle(pump);
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
