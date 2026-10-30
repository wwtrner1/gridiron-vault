import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Icon } from "../components/Icon";
import { AddToPlaybook } from "../components/AddToPlaybook";
import { checkAll, FORMAT_NAME, grade, LOOKS, STATUS_COLOR, wins, yards } from "../lib/coverage";
import type { Format, Report } from "../lib/coverage";
import { loadRules } from "../lib/rules";
import { reconcileConnections } from "../lib/scene";
import { useStore } from "../lib/store";
import type { StoredPlay } from "../lib/types";
import "../styles/coverage.css";

type Row = { play: StoredPlay; report: Report; score: number };

const FORMATS: Format[] = ["5v5", "7v7", "11"];

/**
 * Coverage report: every pass play in the Vault (or one playbook) run against
 * every look for its format, so a coach can see what each play beats and pick
 * the best call against the coverage he expects. Same model as the Designer's
 * Coverage check; nothing here changes a play.
 */
export function Coverage() {
  const plays = useStore((s) => s.plays);
  const books = useStore((s) => s.playbooks);
  const [bookId, setBookId] = useState("");
  const [filing, setFiling] = useState<{ ids: string[]; name: string } | null>(null);
  const rush = useMemo(() => loadRules().rush || 7, []);

  const rows = useMemo(() => {
    const book = books.find((b) => b.id === bookId);
    const pool = book ? book.playIds.map((id) => plays.find((p) => p.id === id)).filter((p): p is StoredPlay => !!p) : plays;
    const out: Row[] = [];
    for (const play of pool) {
      if (play.playType !== "pass") continue;
      const report = checkAll(reconcileConnections(play.scene), { rushYards: rush });
      if (!report.results.some((r) => r.rows.length)) continue;
      out.push({ play, report, score: report.results.reduce((a, r) => a + r.score, 0) / report.results.length });
    }
    return out.sort((a, b) => b.report.beats - a.report.beats || b.score - a.score);
  }, [plays, books, bookId, rush]);

  const groups = FORMATS.map((f) => ({ format: f, rows: rows.filter((r) => r.report.format === f) })).filter((g) => g.rows.length);
  const passCount = plays.filter((p) => p.playType === "pass").length;

  return (
    <Shell title="Coverage report">
      <div className="page-head">
        <div>
          <h2>Coverage report</h2>
          <p>Every pass play run against a live defense. See what each play beats, and the best call when you expect Cover 2 or man.</p>
        </div>
        {books.length > 0 && (
          <label className="field cvr-book">
            <span>Plays from</span>
            <select className="select" value={bookId} onChange={(e) => setBookId(e.target.value)}>
              <option value="">The whole Vault</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!groups.length && (
        <div className="empty empty-sm">
          <h3>{passCount ? "No routes to check yet" : "No pass plays yet"}</h3>
          <p>
            {passCount
              ? "Draw routes for your receivers and mark the play as a pass, then come back."
              : "Mark a play as a pass in its Play intel, or copy a few starter pass plays, and they'll show up here."}
          </p>
          <Link to="/starters" className="btn btn-primary btn-sm">
            Browse starter plays
          </Link>
        </div>
      )}

      {groups.map(({ format, rows: list }) => {
        const looks = LOOKS[format];
        return (
          <section key={format} className="cvr-group" aria-labelledby={`cvr-${format}`}>
            <h3 id={`cvr-${format}`}>
              {FORMAT_NAME[format]} <span>{list.length} {list.length === 1 ? "play" : "plays"}</span>
            </h3>

            <div className="cvr-best">
              {looks.map((look, li) => {
                const best = list
                  .filter((r) => wins(r.report.results[li]))
                  .sort((a, b) => b.report.results[li].score - a.report.results[li].score)
                  .slice(0, 3);
                return (
                  <div key={look.id} className="cvr-best-card">
                    <p className="cvr-best-h">Best vs {look.name}</p>
                    {best.length ? (
                      <ol>
                        {best.map((r) => {
                          const t = r.report.results[li].target;
                          return (
                            <li key={r.play.id}>
                              <Link to={`/build/${r.play.id}`}>{r.play.name}</Link>
                              {t && (
                                <span>
                                  {t.label} {t.route}, {yards(t.sep)} yds
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    ) : (
                      <p className="cvr-none">Nothing beats it yet. Try a Smash or Flood concept.</p>
                    )}
                    {best.length > 0 && (
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm cvr-file"
                        onClick={() => setFiling({ ids: best.map((r) => r.play.id), name: `Beats ${look.name}` })}
                      >
                        <Icon name="plus" size={13} /> Add to a new playbook
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="cvr-wrap">
              <table className="cvr-table">
                <thead>
                  <tr>
                    <th scope="col">Play</th>
                    {looks.map((l) => (
                      <th key={l.id} scope="col">
                        {l.name}
                      </th>
                    ))}
                    <th scope="col">Beats</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.play.id}>
                      <th scope="row">
                        <Link to={`/build/${r.play.id}`}>{r.play.name || "Untitled play"}</Link>
                        {r.play.formation && <small>{r.play.formation}</small>}
                      </th>
                      {r.report.results.map((res) => {
                        const t = res.target;
                        const won = wins(res);
                        const status = grade(res);
                        return (
                          <td key={res.look.id}>
                            <span className={`cvr-cell is-${status}`} style={{ borderColor: STATUS_COLOR[status] }}>
                              <i style={{ background: STATUS_COLOR[status] }} aria-hidden="true" />
                              {t ? `${t.label} ${yards(t.sep)}` : "–"}
                              {res.sackAt !== null && <b title={`The rush gets home at ${res.sackAt.toFixed(1)} s`}> sack</b>}
                              <span className="sr-only">{won ? ", beaten" : `, ${status}`}</span>
                            </span>
                          </td>
                        );
                      })}
                      <td className="cvr-beats">
                        {r.report.beats}/{r.report.results.length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {groups.length > 0 && (
        <p className="cvr-note">
          Each cell is the throw: the first open receiver in the read order (first read, then deep to short) and his yards of space when the ball comes out. Open a play
          and choose Extras, then Coverage check, to watch it run. A teaching model for comparing plays: real kids, real leverage and real rush lanes will vary.
        </p>
      )}
      {filing && (
        <AddToPlaybook count={filing.ids.length} plays={() => filing.ids} newFirst suggest={filing.name} onClose={() => setFiling(null)} />
      )}
    </Shell>
  );
}
