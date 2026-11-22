import { useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { tabKey } from "./tabKeys";
import { CLIPS, FEATURED, clock, type Watch } from "./tools";

/**
 * Featured tools: a list of the tools on the left and, for the one picked, its video poster, what it does and the steps
 * of its clip as slides. A press on the poster or on a slide opens the video pop-out (at that step).
 */
export function FeaturedTools({ onWatch }: { onWatch: (w: Watch) => void }) {
  const [at, setAt] = useState(0);
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  if (FEATURED.length === 0) return null;
  const tool = FEATURED[at];
  const clip = CLIPS[tool.clip];
  const pick = (i: number) => {
    setAt(i);
    tabs.current[i]?.focus();
  };
  return (
    <section className="ft" id="featured" aria-labelledby="ft-h">
      <div className="home-band-head home-rv">
        <p className="home-eyebrow">Featured tools</p>
        <h2 id="ft-h">See every tool at work</h2>
        <p>Pick a tool. Press Watch for a short video with a narrator, or click any step to jump straight to it.</p>
      </div>
      <div className="ft-body home-rv">
        <div className="ft-tabs" role="tablist" aria-label="Featured tools" aria-orientation="vertical">
          {FEATURED.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-t${i}`}
              aria-selected={i === at}
              aria-controls={`${id}-p`}
              tabIndex={i === at ? 0 : -1}
              className={`ft-tab${i === at ? " is-on" : ""}`}
              data-first={i === 0 || FEATURED[i - 1].group !== t.group ? "" : undefined}
              onClick={() => setAt(i)}
              onKeyDown={(e) => {
                const n = tabKey(e, i, FEATURED.length);
                if (n !== null) pick(n);
              }}
            >
              <span className="ft-tab-n" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="ft-tab-name">{t.name}</span>
              <small aria-hidden="true">{t.group}</small>
            </button>
          ))}
        </div>

        <div className="ft-stage" role="tabpanel" id={`${id}-p`} aria-labelledby={`${id}-t${at}`}>
          <div className="ft-top">
            <button type="button" className="ft-poster" tabIndex={-1} aria-hidden="true" onClick={() => onWatch({ clip: tool.clip })}>
              <img src={clip.poster} alt="" width={1280} height={720} />
              <span className="ft-watch">
                <Icon name="play" size={16} />
                Watch · {clock(clip.seconds)}
              </span>
            </button>
            <div className="ft-copy">
              <p className="home-eyebrow">{tool.group}</p>
              <h3>{tool.name}</h3>
              <p>{tool.blurb}</p>
              <div className="ft-actions">
                <button type="button" className="btn btn-primary" onClick={() => onWatch({ clip: tool.clip })}>
                  <Icon name="play" size={16} />
                  Watch the video · {clock(clip.seconds)}
                </button>
                <Link to={tool.to} className="btn btn-ghost">
                  {tool.cta}
                </Link>
              </div>
              <p className="ft-note">With a narrator and captions on screen. {clip.steps.length} steps, and you can jump to any of them.</p>
            </div>
          </div>
          <ol className="ft-steps" data-cols={clip.steps.length % 3 === 0 || clip.steps.length === 5 ? 3 : 4} aria-label={`The steps in ${tool.name}`}>
            {clip.steps.map((s, i) => (
              <li key={`${tool.clip}-${i}`}>
                <button type="button" onClick={() => onWatch({ clip: tool.clip, step: i })}>
                  <img src={s.still} alt="" width={640} height={360} loading="lazy" />
                  <span className="ft-step-t">
                    <i>{i + 1}</i>
                    {s.title}
                  </span>
                  <small>{s.text}</small>
                  <span className="sr-only">Watch the video from this step</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
