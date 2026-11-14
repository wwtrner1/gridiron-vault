import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Icon } from "../components/Icon";
import { PlayThumb } from "../components/PlayThumb";
import { PagePreview } from "../components/PrintPreview";
import { PracticeTabs } from "../components/PracticeTabs";
import { Tooltip } from "../components/Tooltip";
import { DrillField } from "../components/DrillField";
import { FieldTip } from "./Drills";
import {
  PERIOD_KINDS,
  PRACTICE_SYNCED_EVENT,
  clockTimes,
  endTime,
  kindOf,
  loadScript,
  newPeriod,
  saveScript,
  totalMinutes,
  type Period,
  type PeriodKind,
  type Script,
} from "../lib/practice";
import { allDrills, loadDrills } from "../lib/drills";
import { useStore } from "../lib/store";
import "../styles/practice.css";
import "../styles/drills.css";

const kindLabel = (k: PeriodKind) => PERIOD_KINDS.find((x) => x.id === k)?.label ?? "Group";

/**
 * Practice planner: the script for the night and the scout cards that go
 * with it. Plays come from the Vault and drills from the Drill Vault; nothing
 * here changes a play. Every field wears a label and an ⓘ that says what it's for.
 */
export function Practice() {
  const plays = useStore((s) => s.plays);
  const books = useStore((s) => s.playbooks);
  const [script, setScript] = useState<Script>(loadScript);
  const [out, setOut] = useState<"script" | "cards" | null>(null);
  const [custom, setCustom] = useState(() => loadDrills().custom);
  const drills = useMemo(() => allDrills(custom), [custom]);
  // The account's copy arrived (sign-in on a new device): show it.
  useEffect(() => {
    const reload = () => {
      setScript(loadScript());
      setCustom(loadDrills().custom);
    };
    window.addEventListener(PRACTICE_SYNCED_EVENT, reload);
    return () => window.removeEventListener(PRACTICE_SYNCED_EVENT, reload);
  }, []);
  const drillById = useMemo(() => new Map(drills.map((d) => [d.id, d])), [drills]);

  const change = (next: Script) => {
    setScript(next);
    saveScript(next);
  };
  const edit = (id: string, patch: Partial<Period>) => change({ ...script, periods: script.periods.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= script.periods.length) return;
    const periods = [...script.periods];
    [periods[i], periods[j]] = [periods[j], periods[i]];
    change({ ...script, periods });
  };
  const byId = useMemo(() => new Map(plays.map((p) => [p.id, p])), [plays]);
  const times = clockTimes(script);
  const total = totalMinutes(script);
  const ends = endTime(script);

  const closeOut = useCallback(() => setOut(null), []);
  const cards = script.periods.flatMap((p) => p.playIds.map((id) => ({ period: p, play: byId.get(id) })).filter((c) => c.play));
  const drillCards = script.periods.flatMap((p) => (p.drillIds ?? []).map((id, k) => ({ p, d: drillById.get(id), k }))).filter((x) => x.d?.diagram);
  const playCount = script.periods.reduce((n, p) => n + p.playIds.length, 0);
  const drillCount = script.periods.reduce((n, p) => n + (p.drillIds?.length ?? 0), 0);
  const any = playCount + drillCount > 0;

  return (
    <Shell
      title="Practice"
      tabs={<PracticeTabs current="plan" />}
      actions={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOut("cards")} disabled={!cards.length && !drillCards.length}>
            <Icon name="print" size={15} /> Print scout cards
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setOut("script")} disabled={!script.periods.length}>
            <Icon name="print" size={15} /> Print script
          </button>
        </>
      }
    >
      <div className="pr-edit">
        <section className="pr-hero" aria-label="Practice at a glance">
          <div className="pr-hero-main">
            <p className="pr-eyebrow">Tonight's practice</p>
            <div className="pr-top">
              <FieldTip label="Script name" tip="The title on the printed script, e.g. Tuesday: install Trips.">
                <input className="input pr-name" value={script.name} maxLength={60} onChange={(e) => change({ ...script, name: e.target.value })} />
              </FieldTip>
              <FieldTip label="Start time" tip="Every period gets its clock time from this and the minutes before it.">
                <input className="input" type="time" value={script.start} onChange={(e) => change({ ...script, start: e.target.value })} />
              </FieldTip>
            </div>
          </div>
          <dl className="pr-stats">
            <div><dt>Total</dt><dd className="pr-total">{total} minutes</dd></div>
            <div><dt>Ends</dt><dd>{ends || "—"}</dd></div>
            <div><dt>Periods</dt><dd>{script.periods.length}</dd></div>
            <div><dt>Plays</dt><dd>{playCount}</dd></div>
            <div><dt>Drills</dt><dd>{drillCount}</dd></div>
          </dl>
        </section>

        {script.periods.length > 0 && total > 0 && (
          <ol className="pr-timeline" aria-label="Practice timeline">
            {script.periods.map((p, i) => (
              <li key={p.id} className={`pk-${kindOf(p)}`} style={{ flexGrow: Math.max(p.minutes, 1) }}>
                <a href={`#period-${p.id}`} title={`${p.title}: ${p.minutes} min${times[i] ? ` at ${times[i]}` : ""}`}>
                  <b>{p.title}</b>
                  <span>{p.minutes}′</span>
                </a>
              </li>
            ))}
          </ol>
        )}

        {!plays.length && (
          <div className="empty empty-sm">
            <h3>Your Vault is empty</h3>
            <p>Draw or copy a few plays, then pick them for each period here. Drills from the Drill Vault work right away.</p>
            <Link to="/starters" className="btn btn-primary btn-sm">Browse starter plays</Link>
          </div>
        )}

        {script.periods.map((p, i) => {
          const kind = kindOf(p);
          const drillIds = p.drillIds ?? [];
          return (
            <section key={p.id} id={`period-${p.id}`} className={`pr-period pk-${kind}`} aria-label={p.title}>
              <div className="pr-clockcol">
                <span className="pr-num">{i + 1}</span>
                <span className="pr-clock">{times[i] || "—"}</span>
                <span className="pr-len">{p.minutes} min</span>
              </div>
              <div className="pr-body">
                <div className="pr-head">
                  <FieldTip label="Period" tip="The period's name as it prints: Individual, Skelly, Team, Special teams.">
                    <input className="input pr-title" aria-label="Period name" value={p.title} maxLength={40} onChange={(e) => edit(p.id, { title: e.target.value })} />
                  </FieldTip>
                  <FieldTip label="Type" tip="Sets the period's color on the card and the timeline.">
                    <select className="select" aria-label={`Type of ${p.title}`} value={kind} onChange={(e) => edit(p.id, { kind: e.target.value as PeriodKind })}>
                      {PERIOD_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                    </select>
                  </FieldTip>
                  <FieldTip group label="Minutes" tip="How long the period runs. The clock for every period after it moves with it.">
                    <span className="pr-min">
                      <button type="button" className="pr-step" aria-label={`Five minutes less for ${p.title}`} onClick={() => edit(p.id, { minutes: Math.max(0, p.minutes - 5) })}>−</button>
                      <input className="input" type="number" min={0} max={180} aria-label={`Minutes for ${p.title}`} value={p.minutes} onChange={(e) => edit(p.id, { minutes: Math.max(0, Math.min(180, Number(e.target.value) || 0)) })} />
                      <button type="button" className="pr-step" aria-label={`Five minutes more for ${p.title}`} onClick={() => edit(p.id, { minutes: Math.min(180, p.minutes + 5) })}>+</button>
                    </span>
                  </FieldTip>
                  <div className="pr-tools">
                    <Tooltip title="Move up" hint="Run this period earlier." side="top">
                      <button type="button" className="pr-step" aria-label={`Move ${p.title} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                    </Tooltip>
                    <Tooltip title="Move down" hint="Run this period later." side="top">
                      <button type="button" className="pr-step" aria-label={`Move ${p.title} down`} disabled={i === script.periods.length - 1} onClick={() => move(i, 1)}>↓</button>
                    </Tooltip>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => change({ ...script, periods: script.periods.filter((x) => x.id !== p.id) })}>
                      Remove
                    </button>
                  </div>
                </div>

                <FieldTip label="Focus" tip="The coaching point or what this period is for. It prints under the period.">
                  <input className="input" aria-label={`Note for ${p.title}`} placeholder="Coaching point or drill" value={p.note} maxLength={120} onChange={(e) => edit(p.id, { note: e.target.value })} />
                </FieldTip>

                <div className="pr-lists">
                  <div className="pr-list">
                    <p className="pr-list-head"><Icon name="board" size={14} /> Plays <span>{p.playIds.length}</span></p>
                    {p.playIds.length > 0 && (
                      <ul className="pr-plays">
                        {p.playIds.map((id, k) => (
                          <li key={`${id}-${k}`}>
                            <span>{byId.get(id)?.name ?? "Removed play"}</span>
                            <button type="button" aria-label={`Take ${byId.get(id)?.name ?? "play"} out of ${p.title}`} onClick={() => edit(p.id, { playIds: p.playIds.filter((_, j) => j !== k) })}>×</button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="pr-add">
                      <select className="select select-sm" aria-label={`Add a play to ${p.title}`} value="" onChange={(e) => e.target.value && edit(p.id, { playIds: [...p.playIds, e.target.value] })}>
                        <option value="">+ Add a play…</option>
                        {plays.map((pl) => (
                          <option key={pl.id} value={pl.id}>{pl.name}</option>
                        ))}
                      </select>
                      {books.length > 0 && (
                        <select
                          className="select select-sm"
                          aria-label={`Add a playbook to ${p.title}`}
                          value=""
                          onChange={(e) => {
                            const b = books.find((x) => x.id === e.target.value);
                            if (b) edit(p.id, { playIds: [...p.playIds, ...b.playIds.filter((id) => byId.has(id))] });
                          }}
                        >
                          <option value="">+ Add a whole playbook…</option>
                          {books.map((b) => (
                            <option key={b.id} value={b.id}>{b.name} ({b.playIds.length})</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                  <div className="pr-list">
                    <p className="pr-list-head"><Icon name="play" size={14} /> Drills <span>{drillIds.length}</span></p>
                    {drillIds.length > 0 && (
                      <ul className="pr-plays pr-drills">
                        {drillIds.map((id, k) => {
                          const d = drillById.get(id);
                          return (
                            <li key={`${id}-${k}`}>
                              {d ? <Link to={`/drills?drill=${encodeURIComponent(id)}`}>{d.name}</Link> : <span>Removed drill</span>}
                              <button type="button" aria-label={`Take ${d?.name ?? "drill"} out of ${p.title}`} onClick={() => edit(p.id, { drillIds: drillIds.filter((_, j) => j !== k) })}>×</button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <div className="pr-add">
                      <select className="select select-sm" aria-label={`Add a drill to ${p.title}`} value="" onChange={(e) => e.target.value && edit(p.id, { drillIds: [...drillIds, e.target.value] })}>
                        <option value="">+ Add a drill…</option>
                        {drills.map((d) => (
                          <option key={d.id} value={d.id}>{d.name} · {d.category}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          );
        })}
        <div className="pr-foot">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => change({ ...script, periods: [...script.periods, newPeriod("Period", 10, "", "group")] })}>
            <Icon name="plus" size={15} /> Add a period
          </button>
          <Link to="/drills" className="btn btn-ghost btn-sm">Browse the Drill Vault</Link>
        </div>
        {!any && plays.length > 0 && <p className="pr-hint">Pick plays and drills for each period and the scout cards fill themselves.</p>}
      </div>

      {out === "script" && (
        <article className="pr-out pr-sheet">
          <h1>{script.name}</h1>
          <p>{total} minutes{script.start ? ` · starts ${times[0]}` : ""}{ends ? ` · ends ${ends}` : ""}</p>
          {script.periods.map((p, i) => (
            <section key={p.id}>
              <h2>{times[i] ? `${times[i]} · ` : ""}{p.title} <span>{kindLabel(kindOf(p))} · {p.minutes} min</span></h2>
              {p.note && <p className="pr-note">{p.note}</p>}
              {(p.drillIds ?? []).length > 0 && (
                <ul className="pr-sheet-drills">
                  {(p.drillIds ?? []).map((id, k) => {
                    const d = drillById.get(id);
                    return <li key={`${id}-${k}`}><b>Drill:</b> {d?.name ?? "Removed drill"}{d?.points[0] ? ` — ${d.points[0]}` : ""}</li>;
                  })}
                </ul>
              )}
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
          {drillCards.map(({ p, d, k }) => (
            <figure key={`${d!.id}-${p.id}-${k}`} className="pr-card">
              <figcaption>
                <span>{p.title}</span>
                <b>{d!.name}</b>
                <i>Drill</i>
              </figcaption>
              <DrillField diagram={d!.diagram!} label={`${d!.name} diagram`} />
              {d!.points.length > 0 && <p>{d!.points.join(" ")}</p>}
            </figure>
          ))}
        </div>
      )}
      {/* The chosen layout shows as it prints, then the editor comes back. */}
      {out && <PagePreview title={out === "script" ? "Practice script" : "Scout cards"} onClose={closeOut} />}
    </Shell>
  );
}
