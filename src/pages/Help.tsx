import { useState } from "react";
import { MarketingFooter, MarketingNav } from "../components/Marketing";
import { RESPONSE_TIME, SUPPORT_EMAIL } from "../lib/site";
import "../styles/home.css";
import { previousPage } from "../lib/lastPage";
import "../styles/help.css";

const AREAS = [
  "Designer",
  "Griddy (coaching assistant)",
  "Upload plays",
  "The Vault",
  "Call Sheet",
  "Wristbands & printing",
  "Something else",
];

const MAX_SHOT = 8 * 1024 * 1024;

/** The page the coach came from: the last in-app page, else a same-site referrer. */
function cameFrom() {
  const inApp = previousPage();
  if (inApp && inApp !== "/help") return inApp;
  try {
    const ref = new URL(document.referrer);
    return ref.origin === location.origin ? ref.pathname : "";
  } catch {
    return "";
  }
}

/**
 * Help & feedback, from the Grid1ron Design canvas. Submissions go to
 * Netlify Forms (the "feedback" form declared in public/__forms.html).
 */
export function Help() {
  const [improve, setImprove] = useState("");
  const [area, setArea] = useState(AREAS[0]);
  const [rating, setRating] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [shot, setShot] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!improve.trim()) {
      setError("Tell us what to improve — two sentences is plenty.");
      return;
    }
    if (shot && shot.size > MAX_SHOT) {
      setError("That screenshot is over 8 MB. Try a smaller one, or send the note without it.");
      return;
    }
    setError("");
    setState("sending");
    const body = new FormData();
    body.append("form-name", "feedback");
    body.append("improve", improve.trim());
    body.append("area", area);
    body.append("rating", rating ? String(rating) : "");
    body.append("email", email.trim());
    body.append("page", cameFrom());
    if (shot) body.append("screenshot", shot);
    try {
      const res = await fetch("/__forms.html", { method: "POST", body });
      if (!res.ok) throw new Error(String(res.status));
      setState("sent");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="marketing">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <MarketingNav />
      <main id="main">
        <section className="help-hero" aria-labelledby="help-h">
          <p className="home-eyebrow">Help &amp; feedback</p>
          <h1 id="help-h">
            Tell us what to <span>build next.</span>
          </h1>
          <p>
            GridIronVault is built with coaches, not just for them. Tell us what slowed you down, what’s missing, or what you’d
            change — two sentences is plenty.
          </p>
        </section>

        <section className="help-body">
          <div className="help-card">
            {state === "sent" ? (
              <div className="help-sent" role="status">
                <h2>Thanks, coach.</h2>
                <p>Your note is in. Every one is read by the people building GridIronVault{email.trim() ? ", and you’ll get a reply" : ""}.</p>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => (setState("idle"), setImprove(""), setRating(null), setShot(null))}
                >
                  Send another note
                </button>
              </div>
            ) : (
              <form className="help-form" onSubmit={send} noValidate>
                <h2 className="sr-only">Send feedback</h2>
                <label className="help-field">
                  <span>What should we improve?</span>
                  <textarea
                    className="textarea"
                    rows={5}
                    required
                    value={improve}
                    onChange={(e) => setImprove(e.target.value)}
                    placeholder="The more specific the better — “Let me flip a play left/right in one click.”"
                    aria-invalid={!!error && !improve.trim()}
                  />
                </label>
                <label className="help-field">
                  <span>Which part of GridIronVault?</span>
                  <select className="select" value={area} onChange={(e) => setArea(e.target.value)}>
                    {AREAS.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </label>
                <div className="help-field" role="radiogroup" aria-labelledby="rating-label">
                  <span id="rating-label">How is it going so far?</span>
                  <div className="help-rating">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={rating === n}
                        aria-label={`${n} out of 5`}
                        className={rating === n ? "is-on" : ""}
                        onClick={() => setRating(rating === n ? null : n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="help-scale" aria-hidden="true">
                    <span>Rough</span>
                    <span>Game-ready</span>
                  </div>
                </div>
                <label className="help-field">
                  <span>Your email (optional)</span>
                  <input
                    className="input"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="coach@yourprogram.org"
                  />
                  <small>Only if you’d like a reply. We never add you to a list.</small>
                </label>
                <label className="help-field">
                  <span>Attach a screenshot (optional)</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/heic" onChange={(e) => setShot(e.target.files?.[0] ?? null)} />
                  <small>PNG, JPG, WebP or HEIC, up to 8 MB.</small>
                </label>
                {error && (
                  <p className="error-line" role="alert">
                    {error}
                  </p>
                )}
                {state === "error" && (
                  <p className="error-line" role="alert">
                    That didn’t send. Check your connection and try again — your note is still here.
                  </p>
                )}
                <div>
                  <button type="submit" className="btn btn-primary btn-lg" disabled={state === "sending"}>
                    {state === "sending" ? "Sending…" : "Send feedback"}
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="help-side">
            <div className="help-card">
              <p className="home-eyebrow">Contact us</p>
              <h2 className="help-card-title">Talk to a person</h2>
              <p className="help-muted">Questions about your account, plans, or getting your whole staff set up.</p>
              {SUPPORT_EMAIL || RESPONSE_TIME ? (
                <ul className="help-contact">
                  {SUPPORT_EMAIL && (
                    <li>
                      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
                    </li>
                  )}
                  {RESPONSE_TIME && <li>{RESPONSE_TIME}</li>}
                </ul>
              ) : (
                <p className="help-muted">Use the form — leave your email and a coach on our side writes back.</p>
              )}
            </div>
            <div className="help-card">
              <p className="home-eyebrow">What happens next</p>
              <ol className="help-steps">
                <li>
                  <span>01</span>Every note is read by the people building GridIronVault.
                </li>
                <li>
                  <span>02</span>If you left an email, you get a reply.
                </li>
                <li>
                  <span>03</span>When your idea ships, it shows up in What’s new.
                </li>
              </ol>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
