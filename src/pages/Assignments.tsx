import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Icon } from "../components/Icon";
import { PlayThumb } from "../components/PlayThumb";
import { useStore } from "../lib/store";
import { assignmentsFor, lettersIn } from "../lib/assignments";
import { loadRoster, saveRoster, who, type Roster } from "../lib/roster";
import { fullName } from "../lib/teamHub";
import { loadMyTeam } from "../lib/teamSource";
import "../styles/assignments.css";

/**
 * One player's job across a playbook: every play he's in, with everyone else
 * greyed out. Coaches print it as a position sheet ("everything the Y does").
 */
export function Assignments() {
  const plays = useStore((s) => s.plays);
  const books = useStore((s) => s.playbooks);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const bookId = params.get("book") ?? books[0]?.id ?? "vault";
  const book = books.find((b) => b.id === bookId) ?? null;
  const source = useMemo(
    () =>
      book
        ? book.playIds.map((id) => plays.find((p) => p.id === id)).filter((p): p is (typeof plays)[number] => !!p)
        : [...plays].sort((a, b) => a.name.localeCompare(b.name)),
    [book, plays],
  );
  const letters = useMemo(() => lettersIn(source), [source]);
  const asked = params.get("player")?.toUpperCase();
  const letter = letters.find((l) => l.letter === asked)?.letter ?? letters.find((l) => l.side === "offense")?.letter ?? letters[0]?.letter ?? "";
  const jobs = useMemo(() => (letter ? assignmentsFor(source, letter) : []), [source, letter]);
  const sourceName = book ? book.name : "the whole Vault";
  const [roster, setRoster] = useState<Roster>(loadRoster);
  const [everyone, setEveryone] = useState(false);
  const offense = useMemo(() => letters.filter((l) => l.side === "offense"), [letters]);
  const named = (l: string) => who(roster, l);
  // My team's players, offered as names; picking one fills the jersey too.
  const team = useMemo(() => loadMyTeam().players.filter((p) => p.status !== "inactive"), []);
  const pickName = (l: string, name: string) => {
    const p = team.find((x) => fullName(x) === name);
    setSlot(l, p ? { name, number: p.jersey } : { name });
  };

  const setSlot = (l: string, patch: Partial<Roster[string]>) => {
    const next = { ...roster, [l]: { ...(roster[l] ?? { name: "", number: "" }), ...patch } };
    setRoster(next);
    saveRoster(next);
  };

  // Print every offensive player's sheet, one per page, then go back to the one-player view.
  useEffect(() => {
    if (!everyone) return;
    const done = () => setEveryone(false);
    window.addEventListener("afterprint", done, { once: true });
    const t = window.setTimeout(() => window.print(), 150);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [everyone]);

  const choose = (next: { book?: string; player?: string }) => {
    const p = new URLSearchParams(params);
    if (next.book !== undefined) {
      p.set("book", next.book);
      p.delete("player");
    }
    if (next.player !== undefined) p.set("player", next.player);
    setParams(p, { replace: true });
  };

  return (
    <Shell
      title="Assignments"
      actions={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEveryone(true)} disabled={!offense.length}>
            <Icon name="print" size={15} /> Print every player
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()} disabled={!jobs.length}>
            <Icon name="print" size={15} /> Print this sheet
          </button>
        </>
      }
    >
      <div className="page-head asg-head">
        <div>
          <h2>Assignments</h2>
          <p>Pick a player and see his job on every play in a playbook, with everyone else greyed out. Print it as a position sheet.</p>
        </div>
      </div>

      <div className="asg-pick">
        <label className="field">
          <span>Playbook</span>
          <select className="select" value={book ? book.id : "vault"} onChange={(e) => choose({ book: e.target.value })}>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.playIds.length})
              </option>
            ))}
            <option value="vault">Whole Vault ({plays.length})</option>
          </select>
        </label>
        <div className="field" role="group" aria-labelledby="asg-player-label">
          <span id="asg-player-label">Player</span>
          <div className="chip-row">
            {letters.map((l) => (
              <button
                key={l.letter}
                type="button"
                className={`chip${l.letter === letter ? " is-on" : ""}`}
                aria-pressed={l.letter === letter}
                onClick={() => choose({ player: l.letter })}
                title={`${l.letter} is in ${l.plays} ${l.plays === 1 ? "play" : "plays"}`}
              >
                {l.letter}
              </button>
            ))}
          </div>
        </div>
      </div>

      {offense.length > 0 && (
        <details className="asg-roster">
          <summary>Roster: who wears each letter</summary>
          <p>
            Names and numbers stay on this device and print on each player's sheet.{" "}
            {team.length ? "Start typing to pick from " : "Build your whole roster and depth chart in "}
            <Link to="/roster">My team</Link>
            {team.length ? ", or send its depth chart starters here in one click." : "."}
          </p>
          {team.length > 0 && (
            <datalist id="asg-team">
              {team.map((p) => (
                <option key={p.id} value={fullName(p)}>
                  {p.jersey ? `#${p.jersey}` : ""} {p.positions}
                </option>
              ))}
            </datalist>
          )}
          <div className="asg-slots">
            {offense.map((l) => (
              <div key={l.letter} className="asg-slot">
                <b>{l.letter}</b>
                <input
                  className="input"
                  aria-label={`Player at ${l.letter}`}
                  placeholder="Player name"
                  maxLength={40}
                  list={team.length ? "asg-team" : undefined}
                  value={roster[l.letter]?.name ?? ""}
                  onChange={(e) => pickName(l.letter, e.target.value)}
                />
                <input
                  className="input"
                  aria-label={`Jersey number for ${l.letter}`}
                  placeholder="#"
                  inputMode="numeric"
                  maxLength={3}
                  value={roster[l.letter]?.number ?? ""}
                  onChange={(e) => setSlot(l.letter, { number: e.target.value.replace(/\D/g, "") })}
                />
              </div>
            ))}
          </div>
        </details>
      )}

      <h3 className="asg-title">
        {letter ? `${named(letter) ? `${named(letter)} · ` : ""}${letter} in ${sourceName}` : sourceName} <span className="pill">{jobs.length} {jobs.length === 1 ? "play" : "plays"}</span>
      </h3>

      {!letters.length ? (
        <div className="empty empty-sm">
          <h3>No players to show yet</h3>
          <p>Draw a few plays in {sourceName} and every letter on them shows up here.</p>
          <Link to="/build" className="btn btn-primary btn-sm">
            Open the Designer
          </Link>
        </div>
      ) : everyone ? (
        offense.map((l) => (
          <section key={l.letter} className="asg-sheet">
            <h3 className="asg-title">{named(l.letter) ? `${named(l.letter)} · ` : ""}{l.letter} in {sourceName}</h3>
            <div className="asg-grid">
              {assignmentsFor(source, l.letter).map(({ play, lines, scene }) => (
                <div key={play.id} className="asg-card">
                  <PlayThumb scene={scene} label={`${l.letter} on ${play.name}`} />
                  <span className="asg-name">{play.name}</span>
                  <span className="asg-job">
                    {lines.map((x) => x.tag?.trim()).filter(Boolean).join(" · ") || (lines.length ? `${lines.length} ${lines.length === 1 ? "line" : "lines"}` : "No route drawn")}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="asg-grid">
          {jobs.map(({ play, lines, scene }) => {
            const tags = lines.map((l) => l.tag?.trim()).filter(Boolean);
            return (
              <button
                key={play.id}
                type="button"
                className="asg-card"
                onClick={() => navigate(`/build/${play.id}${book ? `?book=${book.id}` : ""}`)}
                aria-label={`Open ${play.name} in the Designer`}
              >
                <PlayThumb scene={scene} label={`${letter} on ${play.name}`} />
                <span className="asg-name">{play.name}</span>
                <span className="asg-job">
                  {tags.length ? tags.join(" · ") : lines.length ? `${lines.length} ${lines.length === 1 ? "line" : "lines"}` : "No route drawn"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
