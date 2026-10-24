import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Icon } from "../components/Icon";
import { PlayThumb } from "../components/PlayThumb";
import { clockTimes, loadScript, newPeriod, saveScript, totalMinutes, type Period, type Script } from "../lib/practice";
import { useStore } from "../lib/store";
import "../styles/practice.css";

/**
 * Practice planner: the script for the night and the scout cards that go
 * with it. Plays come from the Vault; nothing here changes a play.
 */
export function Practice() {
  const plays = useStore((s) => s.plays);
  const books = useStore((s) => s.playbooks);
  const [script, setScript] = useState<Script>(loadScript);
  const [out, setOut] = useState<"script" | "cards" | null>(null);

  const change = (next: Script) => {
    setScript(next);
    saveScript(next);
  };
  const edit = (id: string, patch: Partial<Period>) => change({ ...script, periods: script.periods.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const byId = useMemo(() => new Map(plays.map((p) => [p.id, p])), [plays]);
  const times = clockTimes(script);

  // Print the chosen layout, then return to the editor.
  useEffect(() => {
    if (!out) return;
    const done = () => setOut(null);
    window.addEventListener("afterprint", done, { once: true });
    const t = window.setTimeout(() => window.print(), 150);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [out]);

  const cards = script.periods.flatMap((p) => p.playIds.map((id) => ({ period: p, play: byId.get(id) })).filter((c) => c.play));
  const any = script.periods.some((p) => p.playIds.length);

  return (
    <Shell
      title="Practice"
      actions={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOut("cards")} disabled={!cards.length}>
            <Icon name="print" size={15} /> Print scout cards
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setOut("script")} disabled={!script.periods.length}>
            <Icon name="print" size={15} /> Print script
          </button>
        </>
      }
    >
      <div className="page-head">
        <div>
          <h2>Practice</h2>
          <p>Build tonight's script from your Vault, then print it with a scout card for every play you'll rep.</p>
        </div>
      </div>

      <div className="pr-edit">
        <div className="pr-top">
          <label className="field">
            <span>Script name</span>
            <input className="input" value={script.name} maxLength={60} onChange={(e) => change({ ...script, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Start time</span>
            <input className="input" type="time" value={script.start} onChange={(e) => change({ ...script, start: e.target.value })} />
          </label>
          <p className="pr-total">{totalMinutes(script)} minutes</p>
        </div>

        {!plays.length && (
          <div className="empty empty-sm">
            <h3>Your Vault is empty</h3>
            <p>Draw or copy a few plays, then pick them for each period here.</p>
            <Link to="/starters" className="btn btn-primary btn-sm">Browse starter plays</Link>
          </div>
        )}

        {script.periods.map((p, i) => (
          <section key={p.id} className="pr-period" aria-label={p.title}>
            <div className="pr-head">
              <input className="input pr-title" aria-label="Period name" value={p.title} maxLength={40} onChange={(e) => edit(p.id, { title: e.target.value })} />
              <label className="pr-min">
                <input className="input" type="number" min={0} max={180} aria-label={`Minutes for ${p.title}`} value={p.minutes} onChange={(e) => edit(p.id, { minutes: Math.max(0, Math.min(180, Number(e.target.value) || 0)) })} />
                <span>min</span>
              </label>
              {times[i] && <span className="pill">{times[i]}</span>}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => change({ ...script, periods: script.periods.filter((x) => x.id !== p.id) })}>
                Remove
              </button>
            </div>
            <input className="input" aria-label={`Note for ${p.title}`} placeholder="Coaching point or drill" value={p.note} maxLength={120} onChange={(e) => edit(p.id, { note: e.target.value })} />
            <ul className="pr-plays">
              {p.playIds.map((id, k) => (
                <li key={`${id}-${k}`}>
                  <span>{byId.get(id)?.name ?? "Removed play"}</span>
                  <button type="button" aria-label={`Take ${byId.get(id)?.name ?? "play"} out of ${p.title}`} onClick={() => edit(p.id, { playIds: p.playIds.filter((_, j) => j !== k) })}>×</button>
                </li>
              ))}
            </ul>
            <div className="pr-add">
              <select className="select" aria-label={`Add a play to ${p.title}`} value="" onChange={(e) => e.target.value && edit(p.id, { playIds: [...p.playIds, e.target.value] })}>
                <option value="">Add a play…</option>
                {plays.map((pl) => (
                  <option key={pl.id} value={pl.id}>{pl.name}</option>
                ))}
              </select>
              {books.length > 0 && (
                <select
                  className="select"
                  aria-label={`Add a playbook to ${p.title}`}
                  value=""
                  onChange={(e) => {
                    const b = books.find((x) => x.id === e.target.value);
                    if (b) edit(p.id, { playIds: [...p.playIds, ...b.playIds.filter((id) => byId.has(id))] });
                  }}
                >
                  <option value="">Add a whole playbook…</option>
                  {books.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.playIds.length})</option>
                  ))}
                </select>
              )}
            </div>
          </section>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => change({ ...script, periods: [...script.periods, newPeriod("Period", 10)] })}>
          <Icon name="plus" size={15} /> Add a period
        </button>
        {!any && plays.length > 0 && <p className="pr-hint">Pick plays for each period and the scout cards fill themselves.</p>}
      </div>

      {out === "script" && (
        <article className="pr-out pr-sheet">
          <h1>{script.name}</h1>
          <p>{totalMinutes(script)} minutes{script.start ? ` · starts ${times[0]}` : ""}</p>
          {script.periods.map((p, i) => (
            <section key={p.id}>
              <h2>{times[i] ? `${times[i]} · ` : ""}{p.title} <span>{p.minutes} min</span></h2>
              {p.note && <p className="pr-note">{p.note}</p>}
              {p.playIds.length > 0 && <ol>{p.playIds.map((id, k) => <li key={`${id}-${k}`}>{byId.get(id)?.name ?? "Removed play"}</li>)}</ol>}
            </section>
          ))}
        </article>
      )}

      {out === "cards" && (
        <div className="pr-out pr-cards">
          {cards.map(({ period, play }, k) => (
            <figure key={`${play!.id}-${k}`} className="pr-card">
              <figcaption>
                <span>{period.title}</span>
                <b>{play!.name}</b>
                {play!.formation && <i>{play!.formation}</i>}
              </figcaption>
              <PlayThumb scene={play!.scene} label={play!.name} />
              {play!.description && <p>{play!.description}</p>}
            </figure>
          ))}
        </div>
      )}
    </Shell>
  );
}
