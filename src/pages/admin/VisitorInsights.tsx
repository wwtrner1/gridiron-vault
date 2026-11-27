import type { CSSProperties } from "react";

/**
 * The visual half of the Visitors tab: the trend, the path to a paying coach, when coaches visit, every page's
 * views, time and exits, coaches by plan and which tools get used, with a short "Worth a look" list worked out
 * from the same numbers. Counts only; the server never sends a person (netlify/admin/visits.ts, `siteInsights`).
 */
export type InsightData = {
  totals: { sessions: number };
  perDay: { day: string; visitors: number; signups: number }[];
  pages: { path: string; views: number; visits: number; avgSeconds: number }[];
  exits: { path: string; n: number; views: number }[];
  funnel: { pricing: number; designer: number; signin: number; accounts: number; madePlay: number; paying: number };
  heat: { dow: number; hour: number; n: number }[];
  newVsReturning: { new: number; returning: number };
  campaigns: { name: string; n: number; signedIn: number }[];
  plans: { plan: string; coaches: number; active: number; joined: number }[];
  features: { name: string; n: number; coaches: number }[];
};

const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hourLabel = (h: number) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);

/** Visitors per day as an area, new accounts as dots on the same days. */
function Trend({ perDay }: { perDay: InsightData["perDay"] }) {
  if (perDay.length < 2) return null;
  const W = 640;
  const H = 160;
  const pad = { l: 28, r: 8, t: 10, b: 22 };
  const max = Math.max(1, ...perDay.map((d) => d.visitors));
  const x = (i: number) => pad.l + (i / (perDay.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const line = perDay.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.visitors).toFixed(1)}`).join(" ");
  const area = `${line} L${x(perDay.length - 1).toFixed(1)},${H - pad.b} L${pad.l},${H - pad.b} Z`;
  const ticks = [0, Math.round(perDay.length / 2), perDay.length - 1];
  return (
    <figure className="card adm-card adm-trend">
      <h3>Visitors and new accounts</h3>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Visitors per day, highest ${max}`}>
        <line x1={pad.l} x2={W - pad.r} y1={y(max)} y2={y(max)} className="adm-grid" />
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} className="adm-grid" />
        <text x={pad.l - 4} y={y(max) + 4} textAnchor="end" className="adm-axis">{max}</text>
        <text x={pad.l - 4} y={H - pad.b + 4} textAnchor="end" className="adm-axis">0</text>
        <path d={area} className="adm-area" />
        <path d={line} className="adm-line" />
        {perDay.map((d, i) =>
          d.signups ? (
            <circle key={d.day} cx={x(i)} cy={y(d.visitors)} r={4.5} className="adm-dot">
              <title>{`${d.day}: ${d.signups} new account${d.signups === 1 ? "" : "s"}`}</title>
            </circle>
          ) : null,
        )}
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === perDay.length - 1 ? "end" : "middle"} className="adm-axis">
            {perDay[i].day.slice(5)}
          </text>
        ))}
      </svg>
      <figcaption className="hint"><span className="adm-key adm-key-line" /> Visitors <span className="adm-key adm-key-dot" /> Days with new accounts</figcaption>
    </figure>
  );
}

/** From a visit to a paying coach. The first four are visits; the last three are accounts made in the period. */
function Funnel({ s }: { s: InsightData }) {
  const f = s.funnel;
  const steps = [
    { label: "Visits", n: s.totals.sessions },
    { label: "Saw Pricing", n: f.pricing },
    { label: "Opened the Designer", n: f.designer },
    { label: "Opened sign-in or sign-up", n: f.signin },
    { label: "Created an account", n: f.accounts },
    { label: "Saved a play to the account", n: f.madePlay },
    { label: "On a paid plan", n: f.paying },
  ];
  const top = Math.max(1, steps[0].n);
  return (
    <section className="card adm-card">
      <h3>Path to a paying coach</h3>
      <ol className="adm-funnel">
        {steps.map((st, i) => (
          <li key={st.label} style={{ "--share": `${Math.max(st.n ? 2 : 0, (st.n / top) * 100)}%` } as CSSProperties}>
            <span className="adm-funnel-label">{st.label}</span>
            <span className="adm-funnel-bar" />
            <b>{st.n}</b>
            <small>{i === 0 ? "" : i === 4 ? `${pct(st.n, steps[3].n)}% of sign-in visits` : `${pct(st.n, steps[i === 5 || i === 6 ? 4 : 0].n)}% of ${i >= 5 ? "accounts" : "visits"}`}</small>
          </li>
        ))}
      </ol>
      <p className="hint">Accounts count by the day they were made, so a coach who visited last week and signed up today shows here today.</p>
    </section>
  );
}

/** Visits by weekday and hour, on the Central clock. */
function Heat({ heat }: { heat: InsightData["heat"] }) {
  const max = Math.max(1, ...heat.map((h) => h.n));
  const at = (d: number, h: number) => heat.find((c) => c.dow === d && c.hour === h)?.n ?? 0;
  const busiest = [...heat].sort((a, b) => b.n - a.n)[0];
  return (
    <section className="card adm-card">
      <h3>When coaches visit (Central time)</h3>
      <div className="adm-heat" role="img" aria-label="Visits by day and hour, Central time">
        <span />
        {Array.from({ length: 24 }, (_, h) => <span key={h} className="adm-heat-h">{h % 3 === 0 ? hourLabel(h) : ""}</span>)}
        {DAYS.map((d, di) => (
          <div key={d} className="adm-heat-row">
            <span className="adm-heat-d">{d}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const n = at(di, h);
              return <span key={h} className="adm-heat-c" style={{ "--heat": n ? 0.15 + 0.85 * (n / max) : 0 } as CSSProperties} title={`${d} ${hourLabel(h)}: ${n} visit${n === 1 ? "" : "s"}`} />;
            })}
          </div>
        ))}
      </div>
      <p className="hint">{busiest ? `Busiest: ${DAYS[busiest.dow]} around ${hourLabel(busiest.hour)} (${busiest.n} visits). Good times for a post or a release.` : "Nothing yet."}</p>
    </section>
  );
}

/** "Worth a look": the clearest leaks and wins, worked out from the numbers above. */
function hintsOf(s: InsightData) {
  const out: string[] = [];
  const exitRate = s.exits
    .filter((e) => e.views >= 5)
    .map((e) => ({ ...e, rate: pct(e.n, e.views) }))
    .sort((a, b) => b.rate - a.rate)[0];
  if (exitRate && exitRate.rate >= 40) out.push(`${exitRate.rate}% of visits to ${exitRate.path} end there. It's the page losing the most people.`);
  const f = s.funnel;
  if (f.signin >= 5 && f.accounts / f.signin < 0.3)
    out.push(`${f.signin} visits opened sign-in but ${f.accounts} account${f.accounts === 1 ? " was" : "s were"} made. The sign-up form may be where coaches stop.`);
  if (f.accounts >= 3 && f.madePlay / f.accounts < 0.5)
    out.push(`Only ${pct(f.madePlay, f.accounts)}% of new accounts saved a play. The first few minutes after sign-up need a clearer first step.`);
  if (s.totals.sessions >= 20 && f.pricing / s.totals.sessions < 0.05) out.push("Hardly anyone opens Pricing. A clearer link to it on the home page could help.");
  const longest = [...s.pages].filter((p) => p.views >= 5).sort((a, b) => b.avgSeconds - a.avgSeconds)[0];
  if (longest) out.push(`Coaches spend the longest on ${longest.path} (${dur(longest.avgSeconds)} a view on average). That's the tool holding attention.`);
  const unused = s.features.filter((x) => x.n === 0).map((x) => x.name);
  if (unused.length) out.push(`Not used in this period: ${unused.join(", ")}.`);
  const nr = s.newVsReturning;
  if (nr.new + nr.returning >= 20) out.push(`${pct(nr.returning, nr.new + nr.returning)}% of visits came from browsers that had been here before.`);
  return out.slice(0, 5);
}

export function Insights({ s, planName }: { s: InsightData; planName: (id: string) => string }) {
  const hints = hintsOf(s);
  const exitsOf = new Map(s.exits.map((e) => [e.path, e.n]));
  const maxViews = Math.max(1, ...s.pages.map((p) => p.views));
  const nr = s.newVsReturning;
  const totalPlans = Math.max(1, ...s.plans.map((p) => p.coaches));
  return (
    <div className="adm-insights">
      {hints.length > 0 && (
        <section className="card adm-card adm-hints">
          <h3>Worth a look</h3>
          <ul>{hints.map((h) => <li key={h}>{h}</li>)}</ul>
        </section>
      )}
      <div className="adm-split">
        <Trend perDay={s.perDay} />
        <section className="card adm-card">
          <h3>New and returning</h3>
          <div className="adm-stack" role="img" aria-label={`${nr.new} new, ${nr.returning} returning`}>
            <span className="adm-stack-new" style={{ flexGrow: nr.new || (nr.returning ? 0 : 1) }} />
            <span className="adm-stack-back" style={{ flexGrow: nr.returning }} />
          </div>
          <ol className="adm-top adm-top-bars">
            <li><span><i className="adm-key adm-key-new" /> First visit</span><b>{nr.new}</b></li>
            <li><span><i className="adm-key adm-key-back" /> Been here before</span><b>{nr.returning}</b></li>
          </ol>
          <p className="hint">The browser keeps its own "been here" flag. No id is sent, so a coach can't be followed.</p>
        </section>
      </div>
      <div className="adm-split">
        <Funnel s={s} />
        <Heat heat={s.heat} />
      </div>
      <section className="card adm-card">
        <h3>Pages</h3>
        {s.pages.length === 0 ? <p className="hint">Nothing yet. Pages count from this release on.</p> : (
          <div className="adm-scroll adm-scroll-plain">
            <table className="adm-table adm-pages">
              <thead><tr><th>Page</th><th>Views</th><th></th><th>Visits</th><th>Avg time on page</th><th>Visits ended here</th></tr></thead>
              <tbody>
                {s.pages.map((p) => {
                  const ex = exitsOf.get(p.path) ?? 0;
                  return (
                    <tr key={p.path}>
                      <td>{p.path}</td><td>{p.views}</td>
                      <td className="adm-barcell"><span className="adm-bar-fill" style={{ width: `${(p.views / maxViews) * 100}%` }} /></td>
                      <td>{p.visits}</td><td>{dur(p.avgSeconds)}</td>
                      <td>{ex} <small>{pct(ex, p.views)}%</small></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="adm-split">
        <section className="card adm-card">
          <h3>Coaches by plan</h3>
          {s.plans.length === 0 ? <p className="hint">No coaches yet.</p> : (
            <table className="adm-mini">
              <thead><tr><th>Plan</th><th>Coaches</th><th>Active in period</th><th>Joined in period</th></tr></thead>
              <tbody>
                {s.plans.map((p) => (
                  <tr key={p.plan} style={{ "--share": `${(p.coaches / totalPlans) * 100}%` } as CSSProperties}>
                    <td className="adm-mini-bar">{planName(p.plan)}</td><td>{p.coaches}</td><td>{p.active}</td><td>{p.joined}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card adm-card">
          <h3>Tools used</h3>
          <table className="adm-mini">
            <thead><tr><th>Tool</th><th>Uses</th><th>Coaches</th></tr></thead>
            <tbody>
              {s.features.map((x) => <tr key={x.name}><td>{x.name}</td><td>{x.n}</td><td>{x.coaches}</td></tr>)}
            </tbody>
          </table>
          <p className="hint">Your own use isn't counted.</p>
        </section>
      </div>
    </div>
  );
}
