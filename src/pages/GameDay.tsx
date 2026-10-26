import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PlayThumb } from "../components/PlayThumb";
import { ANY, callable, cell, choicesFor, loadCalls, mix, saveCalls, tally, type Call, type Situation } from "../lib/gameDay";
import { useStore } from "../lib/store";
import { uid } from "../lib/types";

/**
 * Game Day: the Call Sheet on a phone or tablet at the sideline. Tap the
 * down, distance and hash, see the calls that fit, tap one to see the
 * diagram big, call it, and mark whether it worked. Everything stays on this
 * device, and the screen is kept awake while it's open.
 */

const CHIPS: { key: "down" | "distance" | "hash"; label: string }[] = [
  { key: "down", label: "Down" },
  { key: "distance", label: "Distance" },
  { key: "hash", label: "Hash" },
];

export function GameDay() {
  const { id } = useParams();
  const nav = useNavigate();
  const sheets = useStore((s) => s.sheets);
  const plays = useStore((s) => s.plays);
  const sheet = sheets.find((s) => s.id === id) ?? (id ? undefined : sheets[0]);
  const [sit, setSit] = useState<Situation>(ANY);
  const [calls, setCalls] = useState<Call[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [awake, setAwake] = useState(false);

  useEffect(() => {
    if (sheet) setCalls(loadCalls(sheet.id));
    setSit(ANY);
    setOpen(null);
  }, [sheet?.id]);

  // Keep the screen on while the coach is calling plays; the browser drops it when the tab hides.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let live = true;
    const grab = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (!wl) return;
        lock = await wl.request("screen");
        if (live) setAwake(true);
      } catch {
        if (live) setAwake(false);
      }
    };
    const again = () => document.visibilityState === "visible" && void grab();
    void grab();
    document.addEventListener("visibilitychange", again);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", again);
      void lock?.release();
    };
  }, []);

  const rows = useMemo(() => (sheet ? callable(sheet, sit) : []), [sheet, sit]);
  const counts = useMemo(() => tally(calls), [calls]);
  const split = useMemo(() => (sheet ? mix(sheet, calls) : { run: 0, pass: 0 }), [sheet, calls]);
  const chips = useMemo(
    () => Object.fromEntries(CHIPS.map((c) => [c.key, sheet ? choicesFor(sheet, c.label) : []])) as Record<string, string[]>,
    [sheet],
  );

  if (!sheet) {
    return (
      <main className="gd">
        <header className="gd-top">
          <Link to="/grid" className="gd-exit">Exit</Link>
          <h1>Game Day</h1>
        </header>
        <p className="gd-empty">
          Game Day reads your Call Sheet. <Link to="/grid">Open the Call Sheet</Link>, add the calls, then come back here on game day.
        </p>
      </main>
    );
  }

  const commit = (next: Call[]) => {
    setCalls(next);
    saveCalls(sheet.id, next);
  };
  const call = (rowId: string) => {
    commit([...calls, { id: uid("call"), rowId, at: Date.now() }]);
    setOpen(null);
  };
  const mark = (callId: string, ok: boolean) => commit(calls.map((c) => (c.id === callId ? { ...c, ok: c.ok === ok ? undefined : ok } : c)));

  const byId = new Map(sheet.rows.map((r) => [r.id, r]));
  const recent = calls.slice(-5).reverse();
  const openRow = open ? byId.get(open) : undefined;
  const openPlay = openRow?.playId ? plays.find((p) => p.id === openRow.playId) : undefined;
  const toggle = (key: keyof Situation, value: string) => setSit((s) => ({ ...s, [key]: s[key] === value ? "" : value }));

  return (
    <main className="gd">
      <header className="gd-top">
        <Link to="/grid" className="gd-exit">Exit</Link>
        <div className="gd-name">
          <h1>{sheet.name}</h1>
          <span>
            {calls.length} called · {split.pass} pass / {split.run} run{awake ? " · screen stays on" : ""}
          </span>
        </div>
        {sheets.length > 1 && (
          <select aria-label="Choose a grid" value={sheet.id} onChange={(e) => nav(`/game/${e.target.value}`)}>
            {sheets.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </header>

      <section className="gd-sit" aria-label="Situation">
        {CHIPS.map(({ key, label }) =>
          chips[key].length ? (
            <div key={key} className="gd-chips" role="group" aria-label={label}>
              <b>{label}</b>
              {chips[key].map((v) => (
                <button key={v} type="button" className={sit[key] === v ? "is-on" : ""} aria-pressed={sit[key] === v} onClick={() => toggle(key, v)}>
                  {v}
                </button>
              ))}
            </div>
          ) : null,
        )}
        <input
          type="search"
          aria-label="Find a play"
          placeholder="Find a play"
          value={sit.text}
          onChange={(e) => setSit((s) => ({ ...s, text: e.target.value }))}
        />
      </section>

      {recent.length > 0 && (
        <section className="gd-recent" aria-label="Last calls">
          {recent.map((c, i) => (
            <div key={c.id} className="gd-last">
              <span>{i === 0 ? "Last call" : "Earlier"}</span>
              <b>{byId.get(c.rowId) ? cell(sheet, byId.get(c.rowId)!, "Play Name") : "Removed play"}</b>
              <button type="button" className={c.ok === true ? "is-on" : ""} aria-pressed={c.ok === true} onClick={() => mark(c.id, true)}>Worked</button>
              <button type="button" className={c.ok === false ? "is-bad" : ""} aria-pressed={c.ok === false} onClick={() => mark(c.id, false)}>Stopped</button>
            </div>
          ))}
        </section>
      )}

      <p className="gd-count">{rows.length} {rows.length === 1 ? "call fits" : "calls fit"}</p>
      <ul className="gd-list">
        {rows.map((r) => {
          const t = counts.get(r.id);
          const play = r.playId ? plays.find((p) => p.id === r.playId) : undefined;
          return (
            <li key={r.id}>
              <button type="button" className="gd-row" onClick={() => setOpen(r.id)}>
                {play ? <PlayThumb scene={play.scene} label={play.name} /> : <span className="gd-blank" aria-hidden="true" />}
                <span className="gd-info">
                  <b>{cell(sheet, r, "Play Name")}</b>
                  <span>{[cell(sheet, r, "Group"), cell(sheet, r, "Route")].filter(Boolean).join(" · ")}</span>
                  {t && (
                    <span className="gd-used">
                      Called {t.calls}×{t.marked ? ` · worked ${t.ok} of ${t.marked}` : ""}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {openRow && (
        <div className="gd-sheet" role="dialog" aria-modal="true" aria-label={cell(sheet, openRow, "Play Name")}>
          <div className="gd-card">
            <h2>{cell(sheet, openRow, "Play Name")}</h2>
            {openPlay ? <PlayThumb scene={openPlay.scene} label={openPlay.name} /> : <p className="gd-empty">This call isn't linked to a drawn play.</p>}
            {openPlay?.description && <p className="gd-notes">{openPlay.description}</p>}
            <div className="gd-bar">
              <button type="button" className="gd-call" onClick={() => call(openRow.id)}>Call it</button>
              <button type="button" className="gd-quiet" onClick={() => setOpen(null)}>Back</button>
            </div>
          </div>
        </div>
      )}

      {calls.length > 0 && (
        <button
          type="button"
          className="gd-reset"
          onClick={() => window.confirm("Clear this game's call log? The grid stays as it is.") && commit([])}
        >
          New game (clear the log)
        </button>
      )}
    </main>
  );
}
