import { Link } from "react-router-dom";
import { HOME_VISUALS } from "./homeVisuals";

type Props = {
  id: string;
  visual: keyof typeof HOME_VISUALS;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  cta: { to: string; label: string };
  /** Canvas alternates white and paper grounds. */
  ground: "white" | "paper";
  /** Game film uses a wider illustration column (0.9 : 1.1). */
  wide?: boolean;
};

/**
 * One Home feature row from the canvas: copy on one side, the canvas's own
 * illustration on the other (side comes from the canvas).
 */
export function FeatureSection({ id, visual, eyebrow, title, body, points, cta, ground, wide }: Props) {
  const art = HOME_VISUALS[visual];
  return (
    <section
      className={`home-feature-row is-${ground}${art.side === "left" ? " art-left" : ""}${wide ? " is-wide" : ""}`}
      id={id}
      aria-labelledby={`${id}-h`}
    >
      <div className="home-feature-art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: art.html }} />
      <div className="home-feature-copy">
        <p className="home-eyebrow home-eyebrow-lg">{eyebrow}</p>
        <h2 id={`${id}-h`}>{title}</h2>
        <p className="home-feature-body">{body}</p>
        <ul className="home-checks">
          {points.map((p) => (
            <li key={p}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m5 12 5 5 9-10" />
              </svg>
              {p}
            </li>
          ))}
        </ul>
        <div>
          <Link to={cta.to} className="btn btn-ghost">
            {cta.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
