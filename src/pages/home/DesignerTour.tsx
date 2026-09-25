import { useState } from "react";
import { Link } from "react-router-dom";
import { DESIGNER_FEATURES } from "./designerSlides";

/**
 * Home's "The Designer" section: eight features on the left, a slide per
 * feature on the right. Clicking a feature, a dot, Prev or Next changes the
 * slide, exactly as the canvas's Home artboard does.
 */
export function DesignerTour() {
  const [slide, setSlide] = useState(0);
  const n = DESIGNER_FEATURES.length;
  const current = DESIGNER_FEATURES[slide];

  return (
    <section className="home-designer" id="designer" aria-labelledby="designer-h">
      <div className="home-designer-copy">
        <p className="home-eyebrow home-eyebrow-lg">The Designer</p>
        <h2 id="designer-h">Draw the plays the way you want</h2>
        <p className="home-designer-lede">
          Start from scratch, a napkin sketch or a photo of your whiteboard. The Designer gives you real drawing tools built
          for a football field: drag players into place, pull a route and it snaps into an arrow, multi-select, duplicate,
          rotate and scale — the moves you already know from PowerPoint. Then let it do the heavy lifting. Call a play out
          loud, drop in a formation or a defense, or import a play you drew somewhere else.
        </p>
        <div className="home-feature-grid">
          {DESIGNER_FEATURES.map((f, i) => (
            <button
              key={f.title}
              type="button"
              className={`home-feature${i === slide ? " is-on" : ""}`}
              aria-pressed={i === slide}
              aria-controls="designer-slide"
              onClick={() => setSlide(i)}
            >
              <span className="home-feature-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: f.icon }} />
              <span>
                <b>{f.title}</b>
                <small>{f.blurb}</small>
              </span>
            </button>
          ))}
        </div>
        <div>
          <Link to="/build" className="btn btn-ghost">
            Open the designer
          </Link>
        </div>
      </div>

      <div className="home-slide-card">
        <div
          className="home-slide"
          id="designer-slide"
          role="region"
          aria-live="polite"
          aria-label={`Feature ${slide + 1} of ${n}: ${current.title}`}
          dangerouslySetInnerHTML={{ __html: current.slide }}
        />
        <div className="home-slide-nav">
          <button type="button" className="home-slide-step" aria-label="Previous feature" onClick={() => setSlide((slide + n - 1) % n)}>
            ← Prev
          </button>
          <div className="home-slide-dots">
            {DESIGNER_FEATURES.map((f, i) => (
              <button
                key={f.title}
                type="button"
                className={`home-dot${i === slide ? " is-on" : ""}`}
                aria-label={`Go to slide ${i + 1}: ${f.title}`}
                aria-current={i === slide ? "true" : undefined}
                onClick={() => setSlide(i)}
              />
            ))}
          </div>
          <button type="button" className="home-slide-step" aria-label="Next feature" onClick={() => setSlide((slide + 1) % n)}>
            Next →
          </button>
        </div>
      </div>
    </section>
  );
}
