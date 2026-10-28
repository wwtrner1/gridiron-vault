import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { loadRoster, saveRoster } from "../../lib/roster";
import {
  DEPTH_LIMITS,
  DEPTH_PRESETS,
  DEPTH_UNITS,
  fullName,
  presetSlots,
  slotKey,
  UNIT_LABEL,
  type DepthChart,
  type DepthSlot,
  type DepthUnit,
  type HubPlayer,
  type HubTeam,
} from "../../lib/teamHub";
import { hubSource, type TeamSource } from "../../lib/teamSource";
import { useToast } from "../../lib/toast";

const STRING = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
const SAVE_DELAY_MS = 700;

/** What's being dragged: a player from the bench, or from one spot's list. */
type Drag = { playerId: string; from: string | null };

/**
 * A team's depth chart, one per unit. Spots are columns, players are listed
 * 1st string first; drag them between spots or use the arrow buttons.
 * Changes save a moment after the last one.
 */
export function DepthTab({ team, source: given }: { team: Pick<HubTeam, "id" | "name">; source?: TeamSource }) {
  const toast = useToast();
  const source = useMemo(() => given ?? hubSource(team.id), [given, team.id]);
  const [players, setPlayers] = useState<HubPlayer[] | null>(null);
  const [charts, setCharts] = useState<Record<DepthUnit, DepthSlot[]> | null>(null);
  const [unit, setUnit] = useState<DepthUnit>("offense");
  const [state, setState] = useState<"saved" | "saving" | "waiting">("saved");
  const [drag, setDrag] = useState<Drag | null>(null);
  const timers = useRef<Partial<Record<DepthUnit, number>>>({});
  const [failed, setFailed] = useState("");

  useEffect(() => {
    Promise.all([source.roster(), source.depthCharts()])
      .then(([r, d]) => {
        setPlayers(r.players);
        const by = { offense: [], defense: [], special: [] } as Record<DepthUnit, DepthSlot[]>;
        for (const c of d.charts as DepthChart[]) by[c.unit] = c.slots;
        setCharts(by);
      })
      .catch((e: Error) => setFailed(e.message));
    return () => Object.values(timers.current).forEach((t) => window.clearTimeout(t));
  }, [source]);

  const byId = useMemo(() => new Map((players ?? []).map((p) => [p.id, p])), [players]);
  const slots = useMemo(() => (charts?.[unit] ?? []).map((s) => ({ ...s, playerIds: s.playerIds.filter((id) => byId.has(id)) })), [charts, unit, byId]);
  const placed = useMemo(() => new Set(slots.flatMap((s) => s.playerIds)), [slots]);
  const bench = (players ?? []).filter((p) => !placed.has(p.id) && p.status !== "inactive");

  const change = (next: DepthSlot[]) => {
    setCharts((c) => (c ? { ...c, [unit]: next } : c));
    setState("waiting");
    // One timer per unit, so switching to Defense doesn't drop Offense's last change.
    const forUnit = unit;
    window.clearTimeout(timers.current[forUnit]);
    timers.current[forUnit] = window.setTimeout(() => {
      setState("saving");
      source
        .saveDepth(forUnit, next)
        .then(() => setState("saved"))
        .catch((e: Error) => {
          setState("saved");
          toast(e.message);
        });
    }, SAVE_DELAY_MS);
  };

  const edit = (key: string, patch: Partial<DepthSlot>) => change(slots.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const place = (key: string, playerId: string, at?: number) =>
    change(
      slots.map((s) => {
        if (s.key === key) {
          const ids = s.playerIds.filter((id) => id !== playerId);
          if (ids.length >= DEPTH_LIMITS.deep) return s;
          ids.splice(Math.min(at ?? ids.length, ids.length), 0, playerId);
          return { ...s, playerIds: ids };
        }
        // Dragged from another spot: it moves, it isn't copied.
        return drag?.from === s.key ? { ...s, playerIds: s.playerIds.filter((id) => id !== playerId) } : s;
      }),
    );
  const move = (key: string, i: number, by: number) => {
    const s = slots.find((x) => x.key === key);
    if (!s || i + by < 0 || i + by >= s.playerIds.length) return;
    const ids = [...s.playerIds];
    [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
    edit(key, { playerIds: ids });
  };

  /** The starters fill the Assignments roster, so position sheets print with their names. */
  const toAssignments = () => {
    const roster = loadRoster();
    let n = 0;
    for (const s of slots) {
      const p = byId.get(s.playerIds[0]);
      if (!s.letter || !p) continue;
      roster[s.letter] = { name: fullName(p), number: p.jersey };
      n++;
    }
    saveRoster(roster);
    toast(n ? `${n} starters are on the Assignments roster. Position sheets now print with their names.` : "Give a spot a playbook letter (like X or Q) first.");
  };

  if (failed && !charts)
    return (
      <p className="hint" role="alert">
        {failed}
      </p>
    );
  if (!charts || !players) return <p role="status">Opening the depth chart…</p>;

  return (
    <section className="hub-panel" aria-labelledby="hub-depth">
      <div className="hub-head">
        <h3 id="hub-depth">{team.name} depth chart</h3>
        <div className="fo-actions hub-noprint">
          <span className="hint" role="status">
            {state === "saved" ? "All changes saved" : state === "saving" ? "Saving…" : "Unsaved"}
          </span>
          <button type="button" className="btn btn-quiet btn-sm" onClick={toAssignments} disabled={!slots.length}>
            <Icon name="user" size={14} /> Starters to Assignments
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => window.print()} disabled={!slots.length}>
            <Icon name="print" size={14} /> Print
          </button>
        </div>
      </div>

      <div className="chip-row hub-noprint" role="group" aria-label="Unit">
        {DEPTH_UNITS.map((u) => (
          <button key={u} type="button" className={`chip${unit === u ? " is-on" : ""}`} aria-pressed={unit === u} onClick={() => setUnit(u)}>
            {UNIT_LABEL[u]}
          </button>
        ))}
      </div>
      <h4 className="hub-print-only">{UNIT_LABEL[unit]}</h4>

      {!players.length && <p className="hint">Add players on the Roster tab first, then set who starts where.</p>}

      {!slots.length ? (
        <div className="hub-presets">
          <p>Start the {UNIT_LABEL[unit].toLowerCase()} depth chart from a format, then rename or add spots to fit your scheme.</p>
          <div className="fo-actions">
            {DEPTH_PRESETS.filter((p) => p.unit === unit).map((p) => (
              <button key={p.id} type="button" className="btn btn-quiet btn-sm" onClick={() => change(presetSlots(p.id))}>
                {p.label}
              </button>
            ))}
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => change([{ key: slotKey(), label: "Spot", letter: "", playerIds: [] }])}>
              <Icon name="plus" size={14} /> Blank
            </button>
          </div>
        </div>
      ) : (
        <div className="hub-depth">
          {slots.map((s) => (
            <div
              key={s.key}
              className={`hub-slot${drag ? " is-target" : ""}`}
              onDragOver={(e) => drag && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (drag) place(s.key, drag.playerId);
                setDrag(null);
              }}
            >
              <div className="hub-slot-head">
                <input className="input" value={s.label} maxLength={DEPTH_LIMITS.label} onChange={(e) => edit(s.key, { label: e.target.value })} aria-label="Spot name" />
                <input
                  className="input hub-letter"
                  value={s.letter}
                  maxLength={2}
                  onChange={(e) => edit(s.key, { letter: e.target.value.toUpperCase() })}
                  aria-label={`Playbook letter for ${s.label}`}
                  title="Playbook letter (X, Q, H…)"
                  placeholder="—"
                />
                <button type="button" className="btn btn-quiet btn-sm hub-noprint" onClick={() => change(slots.filter((x) => x.key !== s.key))} aria-label={`Remove spot ${s.label}`}>
                  <Icon name="close" size={13} />
                </button>
              </div>
              <ol className="hub-string">
                {s.playerIds.map((id, i) => {
                  const p = byId.get(id)!;
                  return (
                    <li
                      key={id}
                      draggable
                      onDragStart={() => setDrag({ playerId: id, from: s.key })}
                      onDragEnd={() => setDrag(null)}
                      onDragOver={(e) => drag && e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (drag) place(s.key, drag.playerId, i);
                        setDrag(null);
                      }}
                      className={p.status === "injured" ? "is-hurt" : ""}
                    >
                      <span className="hub-rank">{STRING[i]}</span>
                      <span className="hub-who">
                        {p.jersey && <b>#{p.jersey} </b>}
                        {fullName(p)}
                        {p.status === "injured" && <span className="pill pill-red">Injured</span>}
                      </span>
                      <span className="hub-noprint hub-mini">
                        <button type="button" onClick={() => move(s.key, i, -1)} disabled={i === 0} aria-label={`Move ${fullName(p)} up`}>
                          <Icon name="prev" size={12} style={{ transform: "rotate(90deg)" }} />
                        </button>
                        <button type="button" onClick={() => move(s.key, i, 1)} disabled={i === s.playerIds.length - 1} aria-label={`Move ${fullName(p)} down`}>
                          <Icon name="next" size={12} style={{ transform: "rotate(90deg)" }} />
                        </button>
                        <button type="button" onClick={() => edit(s.key, { playerIds: s.playerIds.filter((x) => x !== id) })} aria-label={`Take ${fullName(p)} off ${s.label}`}>
                          <Icon name="close" size={12} />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ol>
              {s.playerIds.length < DEPTH_LIMITS.deep && players.length > 0 && (
                <select
                  className="select hub-noprint"
                  value=""
                  onChange={(e) => e.target.value && place(s.key, e.target.value)}
                  aria-label={`Add a player at ${s.label}`}
                >
                  <option value="">+ Add player</option>
                  {players
                    .filter((p) => !s.playerIds.includes(p.id) && p.status !== "inactive")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.jersey ? `#${p.jersey} ` : ""}
                        {fullName(p)}
                        {p.positions ? ` (${p.positions})` : ""}
                      </option>
                    ))}
                </select>
              )}
            </div>
          ))}
          {slots.length < DEPTH_LIMITS.slots && (
            <button type="button" className="hub-slot hub-slot-add hub-noprint" onClick={() => change([...slots, { key: slotKey(), label: "Spot", letter: "", playerIds: [] }])}>
              <Icon name="plus" size={18} /> Add a spot
            </button>
          )}
        </div>
      )}

      {slots.length > 0 && bench.length > 0 && (
        <div className="hub-bench hub-noprint">
          <h4>Not on the {UNIT_LABEL[unit].toLowerCase()} chart yet</h4>
          <p className="hint">Drag a name onto a spot, or use that spot's Add player list.</p>
          <ul>
            {bench.map((p) => (
              <li key={p.id} draggable onDragStart={() => setDrag({ playerId: p.id, from: null })} onDragEnd={() => setDrag(null)}>
                {p.jersey && <b>#{p.jersey} </b>}
                {fullName(p)}
                {p.positions && <small> {p.positions}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
