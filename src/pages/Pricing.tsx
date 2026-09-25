import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Mark } from "../components/Shell";
import { useAuth } from "../lib/auth";
import { PUBLIC_TIERS, TIERS } from "../lib/plan";
import type { TierId } from "../lib/plan";
import { tierStore, useTier } from "../lib/tier";
import { useToast } from "../lib/toast";

const COMPARE: {
  label: string;
  hint: string;
  read: (t: (typeof PUBLIC_TIERS)[number]) => string;
}[] = [
  {
    label: "Plays in your Vault",
    hint: "How many finished plays you can keep.",
    read: (t) => t.playLimit.toLocaleString(),
  },
  {
    label: "Season Grids",
    hint: "Separate call sheets — one per season, one per level.",
    read: (t) => String(t.gridLimit),
  },
  {
    label: "Coaches",
    hint: "People who can open and edit the same playbook.",
    read: (t) => t.seats,
  },
  {
    label: "Drawing tools",
    hint: "Freehand, polygon, coverage zones, motion and auto-connect.",
    read: (t) => (t.lockedTools.length ? "Essentials only" : "All tools"),
  },
  {
    label: "Export sizes",
    hint: "Wristband through full binder page.",
    read: (t) => (t.sizes === "all" ? "Every size" : "Wristband + letter"),
  },
  {
    label: "Print quality",
    hint: "Dots per inch on raster export.",
    read: (t) => `${t.maxDpi} DPI`,
  },
  {
    label: "Watermark",
    hint: "A Grid1ronVault stamp across free exports.",
    read: (t) => (t.watermark ? "On exports" : "None"),
  },
  {
    label: "Multi-play sheets",
    hint: "Wristband cards and packet PDFs.",
    read: (t) => (t.sheets ? "Yes" : "Not included"),
  },
  {
    label: "Share links",
    hint: "Send a play or a book to players and parents.",
    read: (t) => (t.share ? "Yes" : "Not included"),
  },
  {
    label: "Assistant runs",
    hint: "Play-from-a-sentence, auto-tagging and rules checks.",
    read: (t) => `${t.aiRuns}/month`,
  },
];

const FAQ = [
  {
    q: "What happens to my plays when beta ends?",
    a: "They stay yours. If you end up over the limit on the plan you pick, nothing is deleted — your Vault goes read-only for new saves until you free up room or upgrade.",
  },
  {
    q: "Can players use it, or is it coaches only?",
    a: "Both. A player can open a shared book, study the route tree and view the plays on a phone. Drawing and exporting stay with the coach on the account.",
  },
  {
    q: "Do you charge per team?",
    a: "No. Staff and Program are priced by coaching seats, and a seat can carry as many teams as you run.",
  },
  {
    q: "Is there a free plan after beta?",
    a: "Yes. Sideline stays free: eight plays, one Season Grid, and watermarked wristband and letter printing so you can keep using it.",
  },
  {
    q: "Can I cancel?",
    a: "Any time, from your account page. You keep access until the end of the period you already paid for.",
  },
];

export function Pricing() {
  const { account } = useAuth();
  const tier = useTier();
  const toast = useToast();

  const choose = (id: TierId) => {
    tierStore.set(id);
    toast(
      id === "free"
        ? "Switched to Sideline. The extra drawing tools are locked now."
        : `Switched to ${TIERS[id].name}. Every tool is unlocked.`,
    );
  };

  return (
    <div className="marketing">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="mkt-nav">
        <Link to="/" className="mkt-brand">
          <Mark size={30} />
          <span>
            Grid1ron<b>Vault</b>
          </span>
        </Link>
        <nav aria-label="Main">
          <Link to="/starters">Starter plays</Link>
          <Link to="/build">Designer</Link>
          <Link to="/pricing">Pricing</Link>
        </nav>
        <div className="mkt-nav-actions">
          {account ? (
            <Link to="/vault" className="btn btn-primary btn-sm">
              Your Vault
            </Link>
          ) : (
            <Link to="/signin" className="btn btn-primary btn-sm">
              Create an account
            </Link>
          )}
        </div>
      </header>

      <main id="main">
        <section className="price-head">
          <span className="pill pill-amber">Beta · billing is not live yet</span>
          <h1>Pick the plan that matches your staff</h1>
          <p>
            Every plan draws plays with the same tools. What changes is how many you keep, how many coaches share them, and how
            clean it prints.
          </p>
          {tier.id === "beta" && (
            <div className="beta-note">
              <Icon name="sparkle" size={16} />
              <span>
                You are on <b>Beta Coach</b> — everything below is already switched on for you. Pricing starts when beta ends, and
                beta coaches keep founding rates.
              </span>
            </div>
          )}
        </section>

        <h2 className="sr-only">Plans</h2>
        <p className="beta-note" role="note" style={{ marginBottom: 24 }}>
          <span className="pill pill-amber">Beta</span>
          <span>
            Billing is not wired up yet. Picking a plan below only changes which features are switched on in this browser — nothing is charged.
          </span>
        </p>
        <div className="plan-grid">
          {PUBLIC_TIERS.map((t) => (
            <article className={`plan${t.featured ? " is-featured" : ""}`} key={t.id}>
              {t.featured && <span className="plan-flag">Most coaches pick this</span>}
              <h3>{t.name}</h3>
              <p className="plan-blurb">{t.blurb}</p>
              <div className="plan-price">
                <b>{t.price}</b>
                <small>{t.cadence}</small>
              </div>
              <span className="plan-seats">
                <Icon name="user" size={14} /> {t.seats}
              </span>
              <ul className="plan-perks">
                {t.perks.map((p) => (
                  <li key={p}>
                    <Icon name="check" size={14} /> {p}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={`btn ${t.featured ? "btn-primary" : "btn-ghost"} btn-block`}
                onClick={() => choose(t.id)}
                disabled={tier.id === t.id}
              >
                {tier.id === t.id ? "Your current plan" : t.price === "$0" ? "Start on Sideline" : `Choose ${t.name}`}
              </button>
            </article>
          ))}
        </div>

        <section className="section section-tight">
          <div className="section-head">
            <span className="pill">Side by side</span>
            <h2>What is different</h2>
            <p>Hover any row for the plain-English version.</p>
          </div>
          <div className="compare-wrap">
            <table className="compare">
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  {PUBLIC_TIERS.map((t) => (
                    <th scope="col" key={t.id} className={t.featured ? "is-featured" : undefined}>
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">
                      <b>{row.label}</b>
                      <small>{row.hint}</small>
                    </th>
                    {PUBLIC_TIERS.map((t) => (
                      <td key={t.id} className={t.featured ? "is-featured" : undefined}>
                        {row.read(t)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section section-tight">
          <div className="section-head">
            <span className="pill">Questions</span>
            <h2>Before you pay us anything</h2>
          </div>
          <div className="faq">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="cta-band">
          <div>
            <h2>Try it before you decide.</h2>
            <p>Draw one play, print one wristband. That is the whole evaluation.</p>
          </div>
          <Link to="/build" className="btn btn-primary btn-lg">
            Open the designer
          </Link>
        </section>
      </main>
    </div>
  );
}
