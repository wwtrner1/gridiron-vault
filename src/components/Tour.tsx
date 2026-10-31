import { createContext, Suspense, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import type { Running } from "./TourLayer";
import { guidesSeen, markGuideSeen } from "../lib/guideSeen";
import { loadGuides, useGuides, type Guides } from "../lib/guideLoad";
import { lazyPage } from "../lib/lazyPage";
import { visible } from "../lib/onScreen";
import "../styles/tour.css";

/**
 * Guided tours: a spotlight on one button at a time with a card saying what
 * it does. The steps come from lib/guides.ts, the same list the "?" help
 * and the Tutorials page show. A step whose button isn't on screen is
 * skipped; `open` buttons are clicked first to bring a menu or dialog up.
 * `?tour=<id>` in the address starts one (the Tutorials page links that way).
 * The guides' text (lib/guideLoad.ts), the spotlight (TourLayer.tsx) and the
 * button list in the ? dialog (GuideList.tsx) all load on first use, so the
 * app's first download keeps only the ? button and the provider.
 */
// lazyPage, so warmPages fetches them for no-signal use at the field.
const TourLayer = lazyPage(() => import("./TourLayer"), "TourLayer");
const GuideList = lazyPage(() => import("./GuideList"), "GuideList");

type Ctx = { start: (id: string) => void | Promise<void>; running: boolean };
const TourCtx = createContext<Ctx>({ start: () => {}, running: false });
export const useTour = () => useContext(TourCtx);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [run, setRun] = useState<Running | null>(null);
  const location = useLocation();
  const started = useRef("");

  const start = useCallback(async (id: string) => {
    let guides: Guides;
    try {
      guides = await loadGuides();
    } catch {
      return; // no signal and not cached: the tour just doesn't start
    }
    const guide = guides.guideById(id);
    if (!guide) return;
    const steps = guides.stepsOf(guide).flatMap((s) => s.steps);
    // Steps that can never show here (no target on screen and nothing to open) are left out up front, so the count is honest.
    const reachable = steps.filter((s) => !s.target || s.open?.length || visible(s.target));
    setRun({ guide, steps: reachable.length ? reachable : steps, at: 0 });
    markGuideSeen(id);
  }, []);

  // ?tour=<id> starts a tour once the screen has drawn. The address is tidied without a router
  // navigation, so a page that reads its own query (the Designer) isn't reloaded.
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("tour");
    if (!id || started.current === location.key) return;
    started.current = location.key;
    const url = new URL(window.location.href);
    url.searchParams.delete("tour");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    // Screens load on first visit, so wait for this one to be up (at most 10 s), then let it draw.
    let t = 0;
    let tries = 0;
    const go = () => {
      if (document.querySelector("[data-page-loading]") && ++tries < 50) t = window.setTimeout(go, 200);
      else t = window.setTimeout(() => start(id), 700);
    };
    go();
    return () => window.clearTimeout(t);
  }, [location, start]);

  return (
    <TourCtx.Provider value={{ start, running: !!run }}>
      {children}
      {run && (
        <Suspense fallback={null}>
          <TourLayer run={run} onRun={setRun} />
        </Suspense>
      )}
    </TourCtx.Provider>
  );
}

/**
 * The "?" on each screen: every button on it and what it does, from the
 * screen's guide, with Show me around to start the tour. The dot shows until
 * the coach has opened this screen's help once.
 */
export function PageHelp({
  tone = "light",
  extra,
}: {
  tone?: "light" | "dark";
  /** One more way to learn this screen, e.g. the Designer's animated slides. */
  extra?: { label: string; run: () => void };
}) {
  const { pathname, search } = useLocation();
  const guides = useGuides();
  const guide = guides ? guides.guideFor(pathname, search) : null;
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => (guide ? guidesSeen().includes(guide.id) : true));
  const { start } = useTour();
  useEffect(() => setSeen(guide ? guidesSeen().includes(guide.id) : true), [guide]);
  // Hold the button's place while the guides load, so the top bar doesn't shift.
  if (!guides) return <span className={`page-help-btn is-${tone}`} aria-hidden="true" style={{ visibility: "hidden" }} />;
  if (!guide) return null;

  const show = () => {
    markGuideSeen(guide.id);
    setSeen(true);
    setOpen(true);
  };
  const tourNow = () => {
    setOpen(false);
    // Let the dialog hand focus back before the spotlight measures the page.
    window.setTimeout(() => start(guide.id), 80);
  };

  return (
    <>
      <button
        type="button"
        className={`page-help-btn is-${tone}${seen ? "" : " is-new"}`}
        onClick={show}
        aria-label={`Help on this screen: every button on ${guide.title}`}
        title="What every button here does"
        data-tour="page-help"
      >
        ?
      </button>
      {/* Portalled: the top bars are their own stacking context, which would sink the dialog under Griddy's launcher. */}
      {open &&
        createPortal(
          <Modal
            title={`${guide.title}: every button`}
            onClose={() => setOpen(false)}
            wide
            footer={
              <>
                <Link to="/tutorials" className="btn btn-quiet" onClick={() => setOpen(false)}>
                  All tutorials
                </Link>
                <span className="spacer" />
                {extra && (
                  <button type="button" className="btn btn-ghost" onClick={() => (setOpen(false), extra.run())}>
                    {extra.label}
                  </button>
                )}
                <button type="button" className="btn btn-primary" onClick={tourNow}>
                  <Icon name="play" size={14} /> Show me around
                </button>
              </>
            }
          >
            <Suspense fallback={null}>
              <GuideList guide={guide} clip />
            </Suspense>
          </Modal>,
          document.body,
        )}
    </>
  );
}
