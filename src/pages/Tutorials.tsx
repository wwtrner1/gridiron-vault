import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Icon } from "../components/Icon";
import { GuideClip, GuideList } from "../components/Tour";
import { allSteps, guideById, GUIDES, tourHref, type Guide } from "../lib/guides";

/** The order a new coach meets the screens in: draw, file, plan, print. */
const START_HERE = ["designer", "vault", "playbooks", "callsheet", "wristbands", "griddy"];

/** The Designer opens blank for a tour, not on the New play setup questions. */
const tourState = (g: Guide) => (g.path.startsWith("/build") ? { skipSetup: true } : undefined);

/**
 * Tutorials: every screen, every button and what it does, with a guided tour
 * of each and a finder for "where is the button that…". Built from
 * lib/guides.ts, the same lists the ? help on each screen shows.
 */
export function Tutorials() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const hits = useMemo(
    () =>
      q.length < 2
        ? []
        : allSteps()
            .filter(({ guide, section, step }) => `${guide.title} ${section} ${step.title} ${step.text}`.toLowerCase().includes(q))
            .slice(0, 30),
    [q],
  );

  return (
    <Shell title="Tutorials">
      <div className="page-head">
        <div>
          <h2>Learn every button</h2>
          <p>
            Every screen in GridIronVault, every button on it, and what it does. Take a tour and each button lights up in turn, or use the ?
            at the top of any screen for that screen's list.
          </p>
        </div>
      </div>

      <div className="search-box tut-find">
        <Icon name="search" size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a button: “flip”, “wristband numbers”, “paint”, “hash marks”"
          aria-label="Find a button"
        />
      </div>

      {q.length >= 2 && (
        <section aria-labelledby="tut-hits-h">
          <h3 id="tut-hits-h" className="sr-only">
            Buttons that match
          </h3>
          <p className="hint" role="status">
            {hits.length
              ? `${hits.length === 30 ? "First 30" : hits.length} ${hits.length === 1 ? "match" : "matches"}.`
              : "Nothing matches that. Try one word, like “print” or “color”."}
          </p>
          <ul className="tut-hits">
            {hits.map(({ guide, section, step }) => (
              <li key={`${guide.id}-${section}-${step.title}`}>
                <small>
                  {guide.title} · {section}
                </small>
                <b>{step.title}</b>
                <p>{step.text}</p>
                <Link to={tourHref(guide)} state={tourState(guide)} className="link">
                  Show me on the {guide.title} screen
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h3 className="eyebrow">Start here</h3>
      <ol className="tut-start">
        {START_HERE.map((id) => guideById(id)!).map((g) => (
          <li key={g.id}>
            <Link to={tourHref(g)} state={tourState(g)}>
              {g.title}
            </Link>
          </li>
        ))}
      </ol>

      <div className="tut-grid">
        {GUIDES.map((g) => (
          <article key={g.id} className="card tut-card" aria-labelledby={`tut-${g.id}`}>
            <h3 id={`tut-${g.id}`}>{g.title}</h3>
            <GuideClip guide={g} />
            <p>{g.intro}</p>
            <p className="tut-when">{g.when}</p>
            <div className="tut-acts">
              <Link to={tourHref(g)} state={tourState(g)} className="btn btn-primary btn-sm">
                <Icon name="play" size={13} /> Take the tour
              </Link>
              <Link to={g.path} state={tourState(g)} className="btn btn-ghost btn-sm">
                Open {g.title}
              </Link>
            </div>
            <details>
              <summary>Every button ({g.sections.reduce((n, s) => n + s.steps.length, 0)})</summary>
              <GuideList guide={g} />
            </details>
          </article>
        ))}
      </div>
    </Shell>
  );
}
