import { useEffect } from "react";
import { coachTips, useCoachTip } from "../lib/coachTips";

/**
 * The coach-tip bubble: says why the last few taps didn't do anything and
 * what to do instead. It never blocks the field and clears itself.
 */
export function CoachTip() {
  const tip = useCoachTip();

  useEffect(() => {
    if (!tip) return;
    const t = window.setTimeout(() => coachTips.dismiss(), 16000);
    return () => window.clearTimeout(t);
  }, [tip]);

  if (!tip) return null;
  return (
    <div className="coach-tip" role="status" aria-live="polite">
      <p className="coach-tip-title">{tip.title}</p>
      <p className="coach-tip-text">{tip.text}</p>
      <div className="coach-tip-acts">
        {tip.action && (
          <button
            type="button"
            className="coach-tip-btn is-primary"
            onClick={() => {
              tip.action!.run();
              coachTips.dismiss();
            }}
          >
            {tip.action.label}
          </button>
        )}
        <button type="button" className="coach-tip-btn" onClick={() => coachTips.dismiss()}>
          Got it
        </button>
        <button type="button" className="coach-tip-off" onClick={() => coachTips.setEnabled(false)}>
          Turn off tips
        </button>
      </div>
    </div>
  );
}
