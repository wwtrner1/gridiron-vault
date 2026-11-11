import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { MarketingFooter, MarketingNav } from "../components/Marketing";
import { OFFERS, PUBLIC_TIERS, TIERS, plusTax } from "../lib/plan";
import type { TierId } from "../lib/plan";
import { useAuth } from "../lib/auth";
import { choosePlan, goToBilling, SIGN_IN_FOR_PLAN, useBilling, useTier } from "../lib/tier";
import { coachError } from "../lib/api";
import { useToast } from "../lib/toast";
import "../styles/home.css";
import "../styles/pricing.css";

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
    label: "Call Sheets",
    hint: "One for each opponent, season or level.",
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
    label: "Starter plays",
    hint: "The 56-play library and the 24-play Ready-to-Go 5v5 playbook.",
    read: (t) => (t.allStarters ? "All 56 + Ready-to-Go" : "5 samples"),
  },
  {
    label: "Plays per export",
    hint: "How many plays go into one PDF, image set, slide deck or print run.",
    read: (t) => (t.exportPlays >= 1000 ? "Whole playbook" : `${t.exportPlays} at a time`),
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
    label: "Share links",
    hint: "Send a play or a book to players and parents.",
    read: (t) => (t.share ? "Yes" : "Not included"),
  },
  {
    label: "Whiteboard photo reviews",
    hint: "Snap a whiteboard or a playbook page and get a draft play back.",
    read: (t) => `${t.photoReviews.toLocaleString()}/month`,
  },
  {
    label: "Griddy, your coaching assistant",
    hint: "Ask anything, call a play and see it drawn, or drop in a whole list of plays at once.",
    read: (t) => `${t.assistantCalls.toLocaleString()}/month`,
  },
];

const FAQ = [
  {
    q: "What happens to plays I already have?",
    a: "They stay yours. If you end up over the limit on the plan you pick, nothing is deleted — your Vault goes read-only for new saves until you free up room or upgrade. Library plays you copied earlier (Ready-to-Go and the Head Coach starters) stay in your Vault to open and edit; exporting and printing them comes with Head Coach.",
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
    q: "Is there a free plan?",
    a: "Yes. Sideline stays free: eight plays, one Call Sheet, five sample starter plays, and watermarked wristband and letter printing, three plays at a time, so you can try the whole flow before you pay.",
  },
  {
    q: "Can I cancel?",
    a: "Any time, from your account page. You keep access until the end of the period you already paid for.",
  },
];

/** The offer on each card below the plans, by its id in OFFERS. */
const OFFER_KEY: Record<string, string> = { season: "season", yearly: "solo_year", "staff-yearly": "crew_year", "program-yearly": "program_year", founding: "founding" };

export function Pricing() {
  const tier = useTier();
  const toast = useToast();
  const { account } = useAuth();
  const billing = useBilling();
  const navigate = useNavigate();

  /** What a plan button buys when billing is open; Program is by quote. */
  const OFFER_OF: Partial<Record<TierId, string>> = { solo: "solo_month", crew: "crew_month", program: "program_month" };

  const pay = async (offer: string) => {
    try {
      await goToBilling(offer);
    } catch (e) {
      toast(coachError(e, "Stripe didn't open. Try again in a minute."), true);
    }
  };

  const choose = async (id: TierId) => {
    if (!account && id !== "free") {
      toast(SIGN_IN_FOR_PLAN);
      navigate("/signin");
      return;
    }
    if (billing && id !== "free") {
      const offer = OFFER_OF[id];
      if (offer) return pay(offer);
      return toast("Program plans are set up with us directly. Use Help & feedback and we'll reply the same day.");
    }
    try {
      await choosePlan(id, Boolean(account));
    } catch (e) {
      toast(coachError(e, "Your plan didn't change. Try again in a minute."), true);
      return;
    }
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
      <MarketingNav />

      <main id="main">
        <section className="price-hero" aria-labelledby="price-h">
          <p className="home-eyebrow">Plans and pricing</p>
          <h1 id="price-h">Pick the plan that matches your staff</h1>
          <p className="price-hero-lede">
            Every plan draws plays with the same tools. What changes is how many you keep, how many coaches share them, and how
            clean it prints.
          </p>
        </section>

        <section className="price-plans" aria-labelledby="plans-h">
          <h2 id="plans-h" className="sr-only">
            Plans
          </h2>
          <p className="price-note" role="note">
            <Icon name="sparkle" size={16} />
            <span>
              {billing || !account ? (
                <>
                  Start on Sideline for free, no card. Prices are in US dollars, and sales tax is added at checkout where your state charges it. Payments are handled by
                  Stripe, so we never see your card. Cancel any time from your account page and keep access until the period you paid
                  for ends.
                </>
              ) : tier.id === "beta" ? (
                <>
                  You are on <b>Beta Coach</b> — every drawing tool is on and your own plays stay yours. Exports are watermarked, 3
                  plays at a time, and the full starter library comes with Head Coach. Beta coaches keep founding rates.
                </>
              ) : tier.id === "trial" ? (
                <>
                  You are on the <b>Head Coach trial</b> — every tool is on and your plays stay when it ends. After that you keep
                  Sideline, free. Head Coach plans open soon, so nothing is charged yet.
                </>
              ) : (
                <>Billing is not live yet. Picking a plan below only changes which features are switched on in this browser — nothing is charged.</>
              )}
            </span>
          </p>
          <div className="home-plan-grid">
            {PUBLIC_TIERS.map((t) => (
              <article className={`home-plan${t.featured ? " is-featured" : ""}`} key={t.id}>
                {t.featured && <span className="home-plan-flag">Most coaches pick this</span>}
                <h3>{t.name}</h3>
                <p>{t.blurb}</p>
                <div className="home-plan-price">
                  <b>{t.price}</b>
                  <small>
                    {t.cadence}
                    {plusTax(t.price)}
                  </small>
                </div>
                <ul className="price-perks">
                  {[t.seats, ...t.perks].map((p) => (
                    <li key={p}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m5 12 5 5 9-10" />
                      </svg>
                      {p}
                    </li>
                  ))}
                </ul>
                <div className="home-plan-cta">
                  <button
                    type="button"
                    className={`btn ${t.featured ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => choose(t.id)}
                    disabled={tier.id === t.id}
                  >
                    {tier.id === t.id ? "Your current plan" : t.price === "$0" ? "Start on Sideline" : `Choose ${t.name}`}
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="price-offers">
            {OFFERS.map((o) => (
              <article className={`price-offer${o.highlight ? " is-highlight" : ""}`} key={o.id}>
                <h3>{o.name}</h3>
                <div className="home-plan-price">
                  <b>{o.price}</b>
                  <small>
                    {o.cadence}
                    {plusTax(o.price)}
                  </small>
                </div>
                <p>{o.blurb}</p>
                {billing && account && OFFER_KEY[o.id] && (
                  <button type="button" className="btn btn-ghost" onClick={() => pay(OFFER_KEY[o.id])}>
                    {o.id === "season" ? "Buy the Season Pass" : o.id === "founding" ? "Take the founding rate" : "Choose yearly"}
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="price-compare" aria-labelledby="compare-h">
          <div className="home-band-head">
            <p className="home-eyebrow">Side by side</p>
            <h2 id="compare-h">What is different</h2>
            <p>Hover any row for the plain-English version.</p>
          </div>
          <div className="compare-wrap" tabIndex={0} role="region" aria-label="Plan comparison table">
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

        <section className="price-faq" aria-labelledby="faq-h">
          <div className="home-band-head">
            <p className="home-eyebrow">Questions</p>
            <h2 id="faq-h">Before you pay us anything</h2>
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

        <section className="home-cta" aria-labelledby="price-cta-h">
          <h2 id="price-cta-h">Try it before you decide.</h2>
          <p>Draw one play, print one wristband. That is the whole evaluation.</p>
          <Link to="/build" className="btn btn-primary btn-lg">
            Open the designer
          </Link>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
