import type { Guide } from "../lib/guides";
import { useGuides } from "../lib/guideLoad";

/** The screen's recorded tour, if it has one. Loads nothing until the coach presses play. */
export function GuideClip({ guide }: { guide: Guide }) {
  const guides = useGuides();
  const clip = guides?.clipOf(guide);
  if (!clip) return null;
  return (
    <video className="guide-clip" src={clip.src} poster={clip.poster} controls muted playsInline preload="none" aria-label={`Video: the ${guide.title} tour`}>
      The {guide.title} tour, recorded. Your browser can't play it here; take the tour instead.
    </video>
  );
}

/** A guide's buttons as a reference list: section headings, then name and what it does. */
export function GuideList({ guide, shell = false, clip = false }: { guide: Guide; shell?: boolean; clip?: boolean }) {
  const guides = useGuides();
  if (!guides) return null;
  return (
    <div className="guide-list">
      <p className="guide-intro">{guide.intro}</p>
      {clip && <GuideClip guide={guide} />}
      {guides.stepsOf(guide, shell).map((s) => (
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
