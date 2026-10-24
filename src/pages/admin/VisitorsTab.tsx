import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { BEFORE_COUNTER as B } from "./beforeCounter";

type Stats = {
  days: number;
  liveNow: number;
  totals: { sessions: number; visitorDays: number; avgSeconds: number; medianSeconds: number; totalSeconds: number; signedInSessions: number; pagesPerVisit: number };
  perDay: { day: string; visitors: number; sessions: number; avgSeconds: number; bounced: number; signups: number }[];
  landing: { name: string; n: number }[];
  referrers: { name: string; n: number }[];
  devices: { name: string; n: number }[];
};

const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);

function Top({ title, rows }: { title: string; rows: { name: string; n: number }[] }) {
  return (
    <section className="card adm-card">
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="hint">Nothing yet.</p> : (
        <ol className="adm-top">
          {rows.map((r) => <li key={r.name}><span>{r.name}</span><b>{r.n}</b></li>)}
        </ol>
      )}
    </section>
  );
}

/** Fixed figures from Netlify Web Analytics, for the weeks before our own counter existed. */
function BeforeCounter() {
  return (
    <section className="adm">
      <h3>Before the counter</h3>
      <p className="hint">
        From {B.source}, {B.from} to {B.to} (Netlify keeps 30 days, so this is all the history there is). It is raw: crawlers and
        bots are in it, including the {B.topPages.find((p) => p.name === "/robots.txt")?.n} requests for robots.txt, so real coaches are
        fewer than {B.uniqueVisitors}. The /vault, /build and /signin rows are the closest guide.
      </p>
      <div className="adm-tiles">
        <div className="stat"><b>{B.uniqueVisitors}</b><span>Unique visitors (raw)</span></div>
        <div className="stat"><b>{B.pageviews.toLocaleString()}</b><span>Pageviews</span></div>
        <div className="stat"><b>{B.bandwidthMb} MB</b><span>Bandwidth</span></div>
      </div>
      <p className="hint">Daily uniques: {B.dailyUniques}.</p>
      <div className="adm-tops">
        <Top title="Top pages" rows={[...B.topPages]} />
        <Top title="Sources" rows={[...B.sources]} />
        <Top title="Countries" rows={[...B.countries]} />
      </div>
    </section>
  );
}

/** Visitors and time on site from our own visit counter. */
export function VisitorsTab() {
  const [days, setDays] = useState(30);
  const [s, setS] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setS(null);
    api.admin<Stats>(`visitors?days=${days}`).then(setS).catch((e) => setError(e instanceof Error ? e.message : "The numbers didn't load."));
  }, [days]);
  if (error) return <p className="adm-note adm-bad">{error}</p>;

  const max = Math.max(1, ...(s?.perDay.map((d) => d.visitors) ?? [1]));
  return (
    <>
      <div className="chip-row" role="group" aria-label="Period">
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" className={`chip${days === d ? " is-on" : ""}`} aria-pressed={days === d} onClick={() => setDays(d)}>
            Last {d} days
          </button>
        ))}
      </div>
      {!s ? <p className="hint">Loading…</p> : (
        <>
          <div className="adm-tiles">
            <div className="stat"><b>{s.liveNow}</b><span>On the site now</span></div>
            <div className="stat"><b>{s.totals.visitorDays}</b><span>Visitor-days</span></div>
            <div className="stat"><b>{s.totals.sessions}</b><span>Visits</span></div>
            <div className="stat"><b>{dur(s.totals.avgSeconds)}</b><span>Average time per visit</span></div>
            <div className="stat"><b>{dur(s.totals.medianSeconds)}</b><span>Median time per visit</span></div>
            <div className="stat"><b>{dur(s.totals.totalSeconds)}</b><span>Total time on site</span></div>
            <div className="stat"><b>{s.totals.pagesPerVisit}</b><span>Pages per visit</span></div>
            <div className="stat"><b>{s.totals.sessions ? Math.round((s.totals.signedInSessions / s.totals.sessions) * 100) : 0}%</b><span>Visits signed in</span></div>
          </div>
          <p className="hint">
            A visitor-day is one browser on one day: the same person on two days counts twice, because we never link days. Your own visits are not counted.
          </p>
          <div className="adm-scroll">
            <table className="adm-table">
              <thead><tr><th>Day</th><th>Visitors</th><th></th><th>Visits</th><th>Avg time</th><th>Left within 10 s</th><th>New accounts</th></tr></thead>
              <tbody>
                {[...s.perDay].reverse().map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td><td>{d.visitors}</td>
                    <td className="adm-barcell"><span className="adm-bar-fill" style={{ width: `${(d.visitors / max) * 100}%` }} /></td>
                    <td>{d.sessions}</td><td>{dur(d.avgSeconds)}</td><td>{d.bounced}</td><td>{d.signups}</td>
                  </tr>
                ))}
                {s.perDay.length === 0 && <tr><td colSpan={7}>No visits recorded yet. They start counting as soon as this is live.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="adm-tops">
            <Top title="Where visits start" rows={s.landing} />
            <Top title="Referring sites" rows={s.referrers} />
            <Top title="Devices" rows={s.devices} />
          </div>
        </>
      )}
      <BeforeCounter />
    </>
  );
}
