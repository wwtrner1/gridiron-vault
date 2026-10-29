import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { clipOf, guideById, guideFor, guidesSeen, markGuideSeen, stepsOf, type Guide, type GuideStep } from "../lib/guides";
import "../styles/tour.css";

/**
 * Guided tours: a spotlight on one button at a time with a card saying what
 * it does. The steps come from lib/guides.ts, the same list the "?" help
 * and the Tutorials page show. A step whose button isn't on screen is
 * skipped; `open` buttons are clicked first to bring a menu or dialog up.
 * `?tour=<id>` in the address starts one (the Tutorials page links that way).
 */

type Ctx = { start: (id: string) => void; running: boolean };
const TourCtx = createContext<Ctx>({ start: () => {}, running: false });
export const useTour = () => useContext(TourCtx);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The first matching element that is actually on screen (not display:none, not slid off the edge). */
function visible(selector: string): HTMLElement | null {
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
function boxOf(selector: string): DOMRect | null {
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

const click = (selector: string) => {
  const el = visible(selector);
  el?.click();
  return !!el;
};

type Running = { guide: Guide; steps: GuideStep[]; at: number };

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [run, setRun] = useState<Running | null>(null);
  const location = useLocation();
  const started = useRef("");

  const start = useCallback((id: string) => {
    const guide = guideById(id);
    if (!guide) return;
    const steps = stepsOf(guide).flatMap((s) => s.steps);
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
      {run && <TourLayer run={run} onRun={setRun} />}
    </TourCtx.Provider>
  );
}

function TourLayer({ run, onRun }: { run: Running; onRun: (r: Running | null) => void }) {
  const { guide, steps, at } = run;
  const step = steps[at];
  const [box, setBox] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false);
  const opened = useRef<string | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const dir = useRef(1);
  const [cardSize, setCardSize] = useState({ w: 340, h: 180 });

  const finish = useCallback(() => {
    if (opened.current) click(opened.current);
    opened.current = null;
    onRun(null);
  }, [onRun]);

  const go = useCallback(
    (n: number) => {
      dir.current = n >= at ? 1 : -1;
      if (n < 0) return;
      if (n >= steps.length) return finish();
      onRun({ ...run, at: n });
    },
    [at, finish, onRun, run, steps.length],
  );

  // Bring the step's target on screen: close what the last step opened if this one doesn't need it,
  // click its openers in turn, scroll it into view. A target that never shows is skipped.
  useEffect(() => {
    let gone = false;
    setReady(false);
    (async () => {
      const close = opened.current;
      if (close && step.close !== close) {
        click(close);
        opened.current = null;
        await wait(120);
      }
      if (step.target && !visible(step.target) && step.open) {
        for (const o of step.open) {
          if (visible(step.target)) break;
          if (click(o)) await wait(260);
        }
        if (step.close) opened.current = step.close;
      }
      if (gone) return;
      const el = step.target ? visible(step.target) : null;
      if (step.target && !el) {
        const n = at + dir.current;
        if (n < 0) return go(at + 1);
        return go(n);
      }
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.top < 70 || r.bottom > innerHeight - 20) {
          el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
          await wait(350);
        }
      }
      if (gone) return;
      setBox(step.target ? boxOf(step.target) : null);
      setReady(true);
    })();
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, step]);

  // Follow the target when the page scrolls, resizes or reflows.
  useEffect(() => {
    if (!ready || !step.target) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setBox(boxOf(step.target!)));
    };
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const tick = window.setInterval(measure, 500);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.clearInterval(tick);
    };
  }, [ready, step.target]);

  useLayoutEffect(() => {
    if (!card.current) return;
    const r = card.current.getBoundingClientRect();
    if (Math.abs(r.width - cardSize.w) > 1 || Math.abs(r.height - cardSize.h) > 1) setCardSize({ w: r.width, h: r.height });
  });

  useEffect(() => {
    if (ready) nextBtn.current?.focus({ preventScroll: true });
  }, [ready, at]);

  // Keys: arrows step, Escape stops. Captured so the page underneath (the Designer's shortcuts) doesn't also act.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        finish();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        go(at + (e.key === "ArrowRight" ? 1 : -1));
      } else if (e.key === "Tab" && card.current) {
        const stops = [...card.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
        const i = stops.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        stops[(i + (e.shiftKey ? -1 : 1) + stops.length) % stops.length]?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [at, finish, go]);

  const pad = 6;
  const gutter = 12;
  const vw = typeof window === "undefined" ? 1024 : innerWidth;
  const vh = typeof window === "undefined" ? 768 : innerHeight;
  let pos: React.CSSProperties;
  if (box) {
    // Below the target, else above, else beside it (a tall panel), else the bottom corner over it.
    const below = box.bottom + pad + gutter;
    const above = box.top - pad - gutter - cardSize.h;
    const right = box.right + pad + gutter;
    const left = box.left - pad - gutter - cardSize.w;
    const midTop = Math.min(Math.max(gutter, box.top + box.height / 2 - cardSize.h / 2), vh - cardSize.h - gutter);
    const midLeft = Math.min(Math.max(gutter, box.left + box.width / 2 - cardSize.w / 2), vw - cardSize.w - gutter);
    if (below + cardSize.h <= vh - gutter) pos = { top: below, left: midLeft };
    else if (above >= gutter) pos = { top: above, left: midLeft };
    else if (right + cardSize.w <= vw - gutter) pos = { top: midTop, left: right };
    else if (left >= gutter) pos = { top: midTop, left };
    else pos = { top: Math.max(gutter, vh - cardSize.h - gutter), left: midLeft };
  } else {
    pos = { top: Math.max(gutter, (vh - cardSize.h) / 2), left: Math.max(gutter, (vw - cardSize.w) / 2) };
  }
  const last = at === steps.length - 1;

  return (
    <div className="tour-layer">
      {/* Catches clicks so the page underneath can't change mid-step. */}
      <div className="tour-catch" onPointerDown={(e) => e.preventDefault()} />
      {ready && box ? (
        <div
          className="tour-spot"
          style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 }}
          aria-hidden="true"
        />
      ) : (
        <div className="tour-dim" aria-hidden="true" />
      )}
      <div
        ref={card}
        className={`tour-card${ready ? "" : " is-moving"}`}
        style={pos}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-card-h"
        aria-describedby="tour-card-p"
      >
        <p className="tour-card-kicker">
          {guide.title} tour ·{" "}
          <span aria-live="polite">
            {at + 1} of {steps.length}
          </span>
        </p>
        <h2 id="tour-card-h">{step.title}</h2>
        <p id="tour-card-p">{step.text}</p>
        {step.target && ready && !box && <p className="tour-card-note">This one isn't on screen right now.</p>}
        <div className="tour-card-bar">
          <button type="button" className="btn btn-quiet btn-sm" onClick={finish}>
            End tour
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(at - 1)} disabled={at === 0}>
            Back
          </button>
          <button type="button" ref={nextBtn} className="btn btn-primary btn-sm" onClick={() => go(at + 1)}>
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
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
  const guide = guideFor(pathname, search);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => (guide ? guidesSeen().includes(guide.id) : true));
  const { start } = useTour();
  useEffect(() => setSeen(guide ? guidesSeen().includes(guide.id) : true), [guide]);
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
            <GuideList guide={guide} clip />
          </Modal>,
          document.body,
        )}
    </>
  );
}

/** The screen's recorded tour, if it has one. Loads nothing until the coach presses play. */
export function GuideClip({ guide }: { guide: Guide }) {
  const clip = clipOf(guide);
  if (!clip) return null;
  return (
    <video className="guide-clip" src={clip.src} poster={clip.poster} controls muted playsInline preload="none" aria-label={`Video: the ${guide.title} tour`}>
      The {guide.title} tour, recorded. Your browser can't play it here; take the tour instead.
    </video>
  );
}

/** A guide's buttons as a reference list: section headings, then name and what it does. */
export function GuideList({ guide, shell = false, clip = false }: { guide: Guide; shell?: boolean; clip?: boolean }) {
  return (
    <div className="guide-list">
      <p className="guide-intro">{guide.intro}</p>
      {clip && <GuideClip guide={guide} />}
      {stepsOf(guide, shell).map((s) => (
        <section key={s.heading}>
          <h3>{s.heading}</h3>
          <dl>
            {s.steps.map((st) => (
              <div key={st.title}>
                <dt>{st.title}</dt>
                <dd>{st.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
