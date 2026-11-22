import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/**
 * Film Room tips: a short walk round the lesson's controls, one bubble at a
 * time with a ring on the control it is about. Shown once (then the Tips
 * button brings it back); nothing here covers the lesson with a scrim, so
 * every control still works while a tip is up.
 */
export type FilmTip = { target: string; title: string; text: string };

const KEY = "grid1ronvault.filmtips.v1";

/** This browser has already been shown the tips. */
export function filmTipsSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === "seen";
  } catch {
    return true;
  }
}

export function markFilmTipsSeen() {
  try {
    localStorage.setItem(KEY, "seen");
  } catch {
    /* storage blocked: the tips show again next time */
  }
}

/** The tips for this lesson; one whose control isn't on screen is left out when shown. */
export function filmTips(coach: boolean): FilmTip[] {
  return [
    { target: ".fr-steps", title: "Six steps, one lesson", text: "Each step teaches one thing: the look, the zones, the call, the snap, the read and your job. Press a step to jump to it." },
    { target: ".fr-field", title: "The field", text: "The play is drawn from above, or on a real field in 3D. Zones, routes and the read light up as the lesson reaches them." },
    { target: ".fr-cap", title: "One caption a step", text: "The key words are highlighted, and the line on top shows how far along the lesson is." },
    { target: ".fr-play", title: "Run the lesson", text: "Play the lesson runs every step in order. Back a step and Next step move one at a time." },
    { target: "select.fr-against, label.fr-against", title: "Pick the defense", text: "Teach the play against any coverage. The lesson rebuilds for the look you pick." },
    { target: "[data-fr-tip='sound']", title: "The coach's voice", text: "A step with a voice reads itself when the lesson reaches it. Voice on or off mutes it any time." },
    ...(coach
      ? [
          { target: ".fr-voice", title: "Add the voice", text: "Record a step in your own words, or have the Film Room voice read it for you. Players hear it on their team link." },
          { target: "[data-fr-tip='video']", title: "Make a video", text: "Saves the whole lesson as a video, wide for the meeting room or tall for phones." },
        ]
      : []),
    { target: "[data-fr-tip='steps']", title: "More room for the field", text: "Hide the steps puts this panel away so the field fills the screen. Show the steps brings it back." },
    { target: "[data-fr-tip='view']", title: "Flat or 3D", text: "Flat draws the play from above, the way it is drawn. 3D puts the players on a real field; pick a camera under the field, from the QB cam to a player's own eyes. Tap a player to ride with him, and drag to look around. Your pick follows you to every device." },
    { target: ".fr-looks", title: "Dark or light", text: "Pick the look that reads best where you teach: a dark room, a bright field or whatever your device is set to." },
    { target: "[data-fr-tip='tips']", title: "Tips, any time", text: "These tips show once. Press Tips to see them again." },
  ];
}

type Spot = { ring: { left: number; top: number; width: number; height: number }; box: { left: number; top: number } };

const BOX_W = 320;

export function FilmTips({ panel, tips, onDone }: { panel: RefObject<HTMLElement | null>; tips: FilmTip[]; onDone: () => void }) {
  const [n, setN] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);

  // Only the tips whose control is on screen (a player has no Make a video; a play with no voice has no Voice switch).
  // Read after the first paint: on the lesson's own first render its panel isn't attached yet when a child lays out.
  const [shown, setShown] = useState<FilmTip[]>([]);
  useEffect(() => {
    const root = panel.current;
    setShown(root ? tips.filter((t) => root.querySelector(t.target)) : []);
  }, [panel, tips]);

  const tip = shown[Math.min(n, shown.length - 1)];

  useLayoutEffect(() => {
    const root = panel.current;
    if (!root || !tip) return;
    const place = () => {
      const el = root.querySelector<HTMLElement>(tip.target);
      if (!el) return;
      el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      const r = el.getBoundingClientRect();
      const W = root.clientWidth;
      const H = root.clientHeight;
      const bw = Math.min(BOX_W, W - 16);
      const bh = box.current?.offsetHeight ?? 170;
      let top = r.bottom + 14;
      if (top + bh > H - 8) top = r.top - bh - 14;
      // No room above or below (the field fills the screen): sit inside the control's lower edge.
      if (top < 8) top = Math.max(8, Math.min(H - bh - 8, r.bottom - bh - 14));
      const left = Math.max(8, Math.min(W - bw - 8, r.left + r.width / 2 - bw / 2));
      setSpot({ ring: { left: r.left - 5, top: r.top - 5, width: r.width + 10, height: r.height + 10 }, box: { left, top } });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [panel, tip]);

  useEffect(() => {
    // A frame later, so the lesson's own focus move on open has already happened.
    const id = requestAnimationFrame(() => next.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, [tip]);

  if (!tip) return null;
  const last = n >= shown.length - 1;

  return (
    <>
      {spot && <i className="fr-tip-ring" style={spot.ring} aria-hidden="true" />}
      <div className="fr-tip" ref={box} role="group" aria-label="Film Room tips" style={spot ? spot.box : { left: 8, top: 8, visibility: "hidden" }}>
        <p className="fr-tip-k">
          Tip {Math.min(n, shown.length - 1) + 1} of {shown.length}
        </p>
        <div aria-live="polite">
          <h3>{tip.title}</h3>
          <p>{tip.text}</p>
        </div>
        <div className="fr-tip-row">
          <button type="button" className="fr-tip-skip" onClick={onDone}>
            Skip the tips
          </button>
          <button type="button" className="btn btn-outline-dark btn-sm" onClick={() => setN((v) => Math.max(0, v - 1))} disabled={n === 0}>
            Back
          </button>
          <button type="button" className="btn btn-primary btn-sm" ref={next} onClick={() => (last ? onDone() : setN((v) => v + 1))}>
            {last ? "Done" : "Next tip"}
          </button>
        </div>
      </div>
    </>
  );
}
