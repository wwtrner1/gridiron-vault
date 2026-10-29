import { Link } from "react-router-dom";
import { Icon } from "./Icon";
import { useGriddy } from "./Griddy";
import { useStore } from "../lib/store";
import { onboarding, useOnboarding, type StartStep } from "../lib/onboarding";
import { READY_BOOK_NAME } from "../lib/readyPlaybook";
import { guideById, tourHref } from "../lib/guides";

type Step = { id: StartStep; title: string; why: string; guide: string; go?: { label: string; to: string } };

const STEPS: Step[] = [
  { id: "play", title: "Draw your first play", why: "Players, routes and blocks on a real field. Or say the call and Griddy draws it.", guide: "designer", go: { label: "Draft a play", to: "/build" } },
  { id: "playbook", title: "Make a playbook", why: "Group plays the way you install them, by week, level or situation.", guide: "playbooks", go: { label: "Playbooks", to: "/playbooks" } },
  { id: "wristband", title: "Print a wristband", why: "Your Call Sheet or a playbook on QB wristband cards, numbered to match.", guide: "wristbands", go: { label: "Wristbands", to: "/wristbands" } },
  { id: "griddy", title: "Ask Griddy", why: "Call a play, ask what beats Cover 2, or change every play in your Vault in one sentence.", guide: "griddy" },
  { id: "coverage", title: "Run a Coverage check", why: "See who gets open on your pass play against Cover 1, 2, 3, 4 and man.", guide: "coverage-check" },
];

/** The Designer opens blank for a tour or a first play, not on the New play setup questions. */
const designerState = (to: string) => (to.startsWith("/build") ? { skipSetup: true } : undefined);

/**
 * The Getting started checklist on the Vault and Tutorials pages: five moves,
 * each with a tour and a way straight in. Ticks itself off as the coach goes,
 * says so once all five are done, and can be hidden (Tutorials brings it back).
 */
export function GettingStarted({ always = false }: { always?: boolean }) {
  const saved = useOnboarding();
  const plays = useStore((s) => s.plays);
  const books = useStore((s) => s.playbooks);
  const { setOpen } = useGriddy();

  const done: Record<StartStep, boolean> = {
    // A copied starter or the Ready-to-Go playbook isn't a play the coach drew.
    play: !!saved.done.play || plays.some((p) => !p.tags.includes("starter") && !p.tags.includes("ready-to-go")),
    playbook: !!saved.done.playbook || books.some((b) => b.name !== READY_BOOK_NAME),
    wristband: !!saved.done.wristband,
    griddy: !!saved.done.griddy,
    coverage: !!saved.done.coverage,
  };
  const count = STEPS.filter((s) => done[s.id]).length;
  const all = count === STEPS.length;
  if (saved.hidden && !always) return null;

  return (
    <section className="card start" aria-labelledby="start-h">
      <div className="start-head">
        <div>
          <p className="eyebrow">Getting started · {count} of {STEPS.length}</p>
          <h2 id="start-h">{all ? "You're set up, coach." : "Five moves to game-ready"}</h2>
        </div>
        <div className="start-meter" role="progressbar" aria-label="Getting started" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={count}>
          <span style={{ width: `${(count / STEPS.length) * 100}%` }} />
        </div>
        {saved.hidden ? (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => onboarding.hide(false)}>
            Show on the Vault
          </button>
        ) : (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => onboarding.hide()}>
            {all ? "Done" : "Hide"}
          </button>
        )}
      </div>
      <ol className="start-steps">
        {STEPS.map((s) => {
          const guide = guideById(s.guide)!;
          return (
            <li key={s.id} className={done[s.id] ? "is-done" : ""}>
              <span className="start-tick" aria-hidden="true">
                {done[s.id] ? <Icon name="check" size={14} /> : null}
              </span>
              <div className="start-text">
                <b>
                  {s.title}
                  <span className="sr-only">{done[s.id] ? " (done)" : " (to do)"}</span>
                </b>
                <p>{s.why}</p>
              </div>
              <div className="start-acts">
                <Link to={tourHref(guide)} state={designerState(guide.path)} className="btn btn-ghost btn-sm">
                  <Icon name="play" size={12} /> Show me
                </Link>
                {s.go ? (
                  <Link to={s.go.to} state={s.id === "play" ? { setup: true } : undefined} className="btn btn-primary btn-sm">
                    {s.go.label}
                  </Link>
                ) : s.id === "griddy" ? (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
                    Ask Griddy
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
