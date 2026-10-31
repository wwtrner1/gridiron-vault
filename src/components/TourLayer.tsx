import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import type { Guide, GuideStep } from "../lib/guides";
import { boxOf, click, visible, wait } from "../lib/onScreen";

/**
 * The spotlight itself: one button at a time with a card saying what it does.
 * Loaded the first time a tour starts (Tour.tsx), so the app's first download
 * doesn't carry it.
 */
export type Running = { guide: Guide; steps: GuideStep[]; at: number };

export function TourLayer({ run, onRun }: { run: Running; onRun: (r: Running | null) => void }) {
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
