import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PlayThumb } from "../components/PlayThumb";
import { WorkTabs } from "../components/WorkTabs";
import {
  ANY,
  SITUATION,
  callable,
  cell,
  choicesFor,
  introSeen,
  loadCalls,
  mix,
  namedRows,
  pickSheet,
  planned,
  saveCalls,
  sections,
  setIntroSeen,
  tally,
  type Call,
  type Situation,
} from "../lib/gameDay";
import { useStore } from "../lib/store";
import { uid } from "../lib/types";
import { rememberWork } from "../lib/workTabs";

/**
 * Game Day: the Call Sheet on a phone or tablet at the sideline. Set the
 * down, distance, hash and field zone, and the calls planned for that moment
 * show up under the sheet's own sections. Tap one to see the diagram big.
 * Logging what was called is optional and sits at the bottom. Everything stays
 * on this device, and the screen is kept awake while it's open.
 */

const TOOLS: { title: string; text: string }[] = [
  { title: "Set the situation", text: "Tap the down, distance, hash and field zone. Only the calls you planned for that moment stay on screen." },
  { title: "Your sections", text: "Calls sit under the sections from your Call Sheet's Group column: openers, red zone, short yardage, whatever you call them." },
  { title: "See it big", text: "Tap a call for the full diagram and its coaching notes, ready to signal in or show a player." },
  { title: "Built for the sideline", text: "Big buttons, dark screen, and the screen stays on while Game Day is open." },
];

export function GameDay() {
  const { id } = useParams();
  const nav = useNavigate();
  const sheets = useStore((s) => s.sheets);
  const plays = useStore((s) => s.plays);
  const fallback = useMemo(() => pickSheet(sheets), [sheets]);
  const sheet = id ? sheets.find((s) => s.id === id) : fallback;
  const [sit, setSit] = useState<Situation>(ANY);
  const [section, setSection] = useState("");
  const [calls, setCalls] = useState<Call[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [awake, setAwake] = useState(false);
  const [intro, setIntro] = useState(() => !introSeen());

  // /game with no id opens the coach's fullest Call Sheet, and the address says which.
  useEffect(() => {
    if (!id && fallback) nav(`/game/${fallback.id}`, { replace: true });
  }, [id, fallback?.id]);

  useEffect(() => {
    if (sheet) setCalls(loadCalls(sheet.id));
    if (sheet) rememberWork({ sheetId: sheet.id });
    setSit(ANY);
    setSection("");
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

  const total = useMemo(() => (sheet ? namedRows(sheet).length : 0), [sheet]);
  const rows = useMemo(() => (sheet ? callable(sheet, sit) : []), [sheet, sit]);
  const allSections = useMemo(() => (sheet ? sections(sheet, namedRows(sheet)) : []), [sheet]);
  const groups = useMemo(() => (sheet ? sections(sheet, rows) : []), [sheet, rows]);
  const shown = section ? groups.filter((g) => g.name === section) : groups;
  const counts = useMemo(() => tally(calls), [calls]);
  const split = useMemo(() => (sheet ? mix(sheet, calls) : { run: 0, pass: 0 }), [sheet, calls]);
  const chips = useMemo(
    () => Object.fromEntries(SITUATION.map((c) => [c.key, sheet ? choicesFor(sheet, c.column) : []])) as Record<string, string[]>,
    [sheet],
  );

  const closeIntro = () => {
    setIntro(false);
    setIntroSeen(true);
  };

  const introCard = (
    <section className="gd-intro" aria-labelledby="gd-intro-title">
      <div className="gd-intro-head">
        <h2 id="gd-intro-title">What Game Day is</h2>
        {sheet && (
          <button type="button" className="gd-quiet-sm" onClick={closeIntro}>
            Got it
          </button>
        )}
      </div>
      <p>
        Game Day is your Call Sheet on the sideline. You plan the calls on the <Link to={sheet ? `/grid/${sheet.id}` : "/grid"}>Call Sheet</Link> (play, section,
        down, distance, hash, field zone); Game Day reads them back during the game so the right call is one tap away.
      </p>
      <ul className="gd-tools">
        {TOOLS.map((t) => (
          <li key={t.title}>
            <b>{t.title}</b>
            <span>{t.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );

  if (!sheet) {
    return (
      <main className="gd">
        <header className="gd-top">
          <Link to="/grid" className="gd-exit">Exit</Link>
          <div className="gd-name">
            <h1>Game Day</h1>
          </div>
        </header>
        <WorkTabs current="game" tone="dark" />
        {introCard}
        <p className="gd-empty">
          {id ? "That Call Sheet isn't on this device. " : "You don't have a Call Sheet yet. "}
          <Link to="/grid">Open the Call Sheet</Link>, add your calls, then come back here on game day.
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
  const log = [...calls].reverse();
  const openRow = open ? byId.get(open) : undefined;
  const openPlay = openRow?.playId ? plays.find((p) => p.id === openRow.playId) : undefined;
  const toggle = (key: keyof Situation, value: string) => setSit((s) => ({ ...s, [key]: s[key] === value ? "" : value }));
  const filtered = SITUATION.some(({ key }) => sit[key]) || sit.text;
  const hasChips = SITUATION.some(({ key }) => chips[key].length);
  const others = sheets.filter((s) => s.id !== sheet.id && namedRows(s).length);

  return (
    <main className="gd">
      <header className="gd-top">
        <Link to={`/grid/${sheet.id}`} className="gd-exit">Exit</Link>
        <div className="gd-name">
          <h1>{sheet.name}</h1>
          <span>
            {total} {total === 1 ? "call" : "calls"} in {allSections.length} {allSections.length === 1 ? "section" : "sections"}
            {awake ? " · screen stays on" : ""}
          </span>
        </div>
        {!intro && (
          <button type="button" className="gd-help" aria-label="What Game Day is" onClick={() => setIntro(true)}>
            ?
          </button>
        )}
      </header>
      <WorkTabs current="game" tone="dark" />

      {sheets.length > 1 && (
        <label className="gd-sheetpick">
          <span>Call Sheet</span>
          <select value={sheet.id} onChange={(e) => nav(`/game/${e.target.value}`)}>
            {sheets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({namedRows(s).length})
              </option>
            ))}
          </select>
        </label>
      )}

      {intro && introCard}

      {total === 0 ? (
        <p className="gd-empty">
          This Call Sheet has no calls yet. <Link to={`/grid/${sheet.id}`}>Add plays to it</Link>
          {others.length > 0 && (
            <>
              {" "}or open <Link to={`/game/${others[0].id}`}>{others[0].name}</Link>, which has {namedRows(others[0]).length}.
            </>
          )}
        </p>
      ) : (
        <>
          <section className="gd-sit" aria-labelledby="gd-sit-title">
            <div className="gd-sit-head">
              <h2 id="gd-sit-title">Situation</h2>
              {filtered && (
                <button type="button" className="gd-quiet-sm" onClick={() => setSit(ANY)}>
                  Clear
                </button>
              )}
            </div>
            {SITUATION.map(({ key, label }) =>
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
            {!hasChips && (
              <p className="gd-tip">
                Fill the Down, Distance, Hash or YL columns on the <Link to={`/grid/${sheet.id}`}>Call Sheet</Link> and they become buttons here. A blank cell
                means the call fits any situation.
              </p>
            )}
            <input
              type="search"
              aria-label="Find a call"
              placeholder="Find a call by name, number or route"
              value={sit.text}
              onChange={(e) => setSit((s) => ({ ...s, text: e.target.value }))}
            />
          </section>

          {allSections.length > 1 && (
            <nav className="gd-sections" aria-label="Sections">
              <button type="button" className={!section ? "is-on" : ""} aria-pressed={!section} onClick={() => setSection("")}>
                All <i>{rows.length}</i>
              </button>
              {allSections.map((g) => {
                const n = groups.find((x) => x.name === g.name)?.rows.length ?? 0;
                return (
                  <button
                    key={g.name}
                    type="button"
                    className={section === g.name ? "is-on" : ""}
                    aria-pressed={section === g.name}
                    disabled={!n && section !== g.name}
                    onClick={() => setSection(section === g.name ? "" : g.name)}
                  >
                    {g.name} <i>{n}</i>
                  </button>
                );
              })}
            </nav>
          )}

          <p className="gd-count" aria-live="polite">
            {rows.length === total ? `All ${total} calls` : `${rows.length} of ${total} calls fit`}
          </p>

          {shown.length === 0 && (
            <p className="gd-empty">
              Nothing planned for that.{" "}
              <button type="button" className="gd-link" onClick={() => setSit(ANY)}>
                Show every call
              </button>
            </p>
          )}

          {shown.map((g) => (
            <section key={g.name} className="gd-group" aria-label={g.name}>
              <h3>
                {g.name} <span>{g.rows.length}</span>
              </h3>
              <ul className="gd-list">
                {g.rows.map((r) => {
                  const t = counts.get(r.id);
                  const play = r.playId ? plays.find((p) => p.id === r.playId) : undefined;
                  const num = cell(sheet, r, "#");
                  return (
                    <li key={r.id}>
                      <button type="button" className="gd-row" onClick={() => setOpen(r.id)}>
                        {play ? <PlayThumb scene={play.scene} label={play.name} /> : <span className="gd-blank" aria-hidden="true" />}
                        <span className="gd-info">
                          <b>
                            {num && <em>{num}</em>}
                            {cell(sheet, r, "Play Name")}
                          </b>
                          <span className="gd-tags">
                            {planned(sheet, r).map((tag) => (
                              <i key={tag}>{tag}</i>
                            ))}
                            {cell(sheet, r, "Route") && <span>{cell(sheet, r, "Route")}</span>}
                          </span>
                          {t && <span className="gd-used">Called {t.calls}×</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <details className="gd-log">
            <summary>
              Game log <span>{calls.length ? `${calls.length} called · ${split.pass} pass / ${split.run} run` : "optional"}</span>
            </summary>
            {calls.length === 0 ? (
              <p className="gd-tip">Press "Log as called" on a call to keep track of what you've run this game. It's optional and stays on this device.</p>
            ) : (
              <>
                <ol className="gd-recent">
                  {log.map((c) => (
                    <li key={c.id} className="gd-last">
                      <b>{byId.get(c.rowId) ? cell(sheet, byId.get(c.rowId)!, "Play Name") : "Removed play"}</b>
                      <span>{new Date(c.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                      <button type="button" className={c.ok === true ? "is-on" : ""} aria-pressed={c.ok === true} onClick={() => mark(c.id, true)}>
                        Worked
                      </button>
                      <button type="button" className={c.ok === false ? "is-bad" : ""} aria-pressed={c.ok === false} onClick={() => mark(c.id, false)}>
                        Stopped
                      </button>
                    </li>
                  ))}
                </ol>
                <button
                  type="button"
                  className="gd-reset"
                  onClick={() => window.confirm("Clear this game's call log? The Call Sheet stays as it is.") && commit([])}
                >
                  New game (clear the log)
                </button>
              </>
            )}
          </details>
        </>
      )}

      {openRow && (
        <div
          className="gd-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={cell(sheet, openRow, "Play Name")}
          onKeyDown={(e) => e.key === "Escape" && setOpen(null)}
        >
          <div className="gd-card">
            <h2>{cell(sheet, openRow, "Play Name")}</h2>
            <p className="gd-plan">{[cell(sheet, openRow, "Group"), ...planned(sheet, openRow)].filter(Boolean).join(" · ")}</p>
            {openPlay ? <PlayThumb scene={openPlay.scene} label={openPlay.name} /> : <p className="gd-empty">This call isn't linked to a drawn play.</p>}
            {openPlay?.description && <p className="gd-notes">{openPlay.description}</p>}
            <div className="gd-bar">
              <button type="button" className="gd-call" onClick={() => setOpen(null)} autoFocus>
                Back to the sheet
              </button>
              <button type="button" className="gd-quiet" onClick={() => call(openRow.id)}>
                Log as called
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
