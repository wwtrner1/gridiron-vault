import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { coachError } from "../../lib/api";
import { PagePreview } from "../../components/PrintPreview";
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
import { initials, photoFromFile } from "../../lib/playerPhoto";
import { PlayerFace } from "./RosterTab";
import { useToast } from "../../lib/toast";
import { clampSpot, LOS_Y, placeSlots, type Spot } from "../../lib/depthField";

/** List or On the field, remembered in this browser. */
const VIEW_KEY = "grid1ronvault.depthview.v1";
type DepthView = "list" | "field";
const loadDepthView = (): DepthView => {
  try {
    return localStorage.getItem(VIEW_KEY) === "field" ? "field" : "list";
  } catch {
    return "list";
  }
};

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
  const [look, setLook] = useState<DepthView>(loadDepthView);
  const pickLook = (v: DepthView) => {
    setLook(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private window: for this visit only */
    }
  };
  const [state, setState] = useState<"saved" | "saving" | "waiting">("saved");
  const [drag, setDrag] = useState<Drag | null>(null);
  const timers = useRef<Partial<Record<DepthUnit, number>>>({});
  const [failed, setFailed] = useState("");
  // Print shows a preview of the printed page first.
  const [previewing, setPreviewing] = useState(false);
  const closePreview = useCallback(() => setPreviewing(false), []);
  // One hidden picker for every card: which player the chosen picture is for.
  const photoInput = useRef<HTMLInputElement>(null);
  const photoFor = useRef<string>("");
  const choosePhoto = (id: string) => {
    photoFor.current = id;
    photoInput.current?.click();
  };
  const savePhoto = async (file: File) => {
    const p = players?.find((x) => x.id === photoFor.current);
    if (!p) return;
    try {
      const photo = await photoFromFile(file);
      const { id: _id, teamId: _t, updatedAt: _u, ...info } = p;
      setPlayers((await source.updatePlayer(p.id, { ...info, photo })).players);
      toast(`Picture added for ${fullName(p)}.`);
    } catch (e) {
      toast(coachError(e, "That picture didn't save. Try again in a minute."), true);
    }
  };

  useEffect(() => {
    Promise.all([source.roster(), source.depthCharts()])
      .then(([r, d]) => {
        setPlayers(r.players);
        const by = { offense: [], defense: [], special: [] } as Record<DepthUnit, DepthSlot[]>;
        for (const c of d.charts as DepthChart[]) by[c.unit] = c.slots;
        setCharts(by);
      })
      .catch((e: unknown) => setFailed(coachError(e, "The depth chart didn't load. Try again in a minute.")));
    return () => Object.values(timers.current).forEach((t) => window.clearTimeout(t));
  }, [source]);

  /*
   * A change waits SAVE_DELAY_MS so dragging three players is one save, but a
   * coach who moves a starter and taps Roster, Back or reload inside that
   * moment must not lose it: whatever is still waiting is saved on the way out
   * (unmount) and when the page is put away (pagehide). The browser's own team
   * writes straight to localStorage, so a reload keeps it too.
   */
  const pending = useRef<Partial<Record<DepthUnit, DepthSlot[]>>>({});
  const flush = useCallback(
    (forUnit: DepthUnit) => {
      window.clearTimeout(timers.current[forUnit]);
      const next = pending.current[forUnit];
      if (!next) return;
      delete pending.current[forUnit];
      setState("saving");
      source
        .saveDepth(forUnit, next)
        .then(() => setState("saved"))
        .catch((e: unknown) => {
          setState("saved");
          toast(coachError(e, "The depth chart didn't save. Try again in a minute."), true);
        });
    },
    [source, toast],
  );
  const flushAll = useRef(() => {});
  flushAll.current = () => (Object.keys(pending.current) as DepthUnit[]).forEach(flush);
  useEffect(() => {
    const onHide = () => flushAll.current();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flushAll.current();
    };
  }, []);

  const byId = useMemo(() => new Map((players ?? []).map((p) => [p.id, p])), [players]);
  const slots = useMemo(() => (charts?.[unit] ?? []).map((s) => ({ ...s, playerIds: s.playerIds.filter((id) => byId.has(id)) })), [charts, unit, byId]);
  const placed = useMemo(() => new Set(slots.flatMap((s) => s.playerIds)), [slots]);
  const bench = (players ?? []).filter((p) => !placed.has(p.id) && p.status !== "inactive");

  const change = (next: DepthSlot[]) => {
    setCharts((c) => (c ? { ...c, [unit]: next } : c));
    setState("waiting");
    // One timer per unit, so switching to Defense doesn't drop Offense's last change.
    const forUnit = unit;
    pending.current[forUnit] = next;
    window.clearTimeout(timers.current[forUnit]);
    timers.current[forUnit] = window.setTimeout(() => flush(forUnit), SAVE_DELAY_MS);
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
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPreviewing(true)} disabled={!slots.length}>
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
      {slots.length > 0 && (
        <div className="chip-row hub-noprint hub-look" role="group" aria-label="Depth chart view">
          <button type="button" className={`chip${look === "list" ? " is-on" : ""}`} aria-pressed={look === "list"} onClick={() => pickLook("list")}>
            <Icon name="ladder" size={13} /> List
          </button>
          <button type="button" className={`chip${look === "field" ? " is-on" : ""}`} aria-pressed={look === "field"} onClick={() => pickLook("field")}>
            <Icon name="board" size={13} /> On the field
          </button>
        </div>
      )}
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
      ) : look === "field" ? (
        <DepthField
          unit={unit}
          slots={slots}
          byId={byId}
          dragging={drag}
          onMove={(key, at) => edit(key, { at })}
          onReset={() => change(slots.map(({ at: _at, ...s }) => s))}
          onDropPlayer={(key) => {
            if (drag) place(key, drag.playerId);
            setDrag(null);
          }}
        />
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
                      <button
                        type="button"
                        className="hub-face-btn"
                        onClick={() => choosePhoto(p.id)}
                        aria-label={p.photo ? `Change ${fullName(p)}'s picture` : `Add a picture of ${fullName(p)}`}
                        title={p.photo ? "Change picture" : "Add a picture"}
                      >
                        <PlayerFace player={p} size={30} />
                        {!p.photo && <Icon name="upload" size={10} className="hub-face-add" />}
                      </button>
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

      {slots.length > 0 && players.length > 0 && look === "list" && <p className="hint hub-noprint">Tap a player's circle to add their picture.</p>}

      {slots.length > 0 && bench.length > 0 && (
        <div className="hub-bench hub-noprint">
          <h4>Not on the {UNIT_LABEL[unit].toLowerCase()} chart yet</h4>
          <p className="hint">{look === "field" ? "Drag a name onto a spot on the field, or use the List view's Add player lists." : "Drag a name onto a spot, or use that spot's Add player list."}</p>
          <ul>
            {bench.map((p) => (
              <li key={p.id} draggable onDragStart={() => setDrag({ playerId: p.id, from: null })} onDragEnd={() => setDrag(null)}>
                <PlayerFace player={p} size={22} />
                {p.jersey && <b>#{p.jersey} </b>}
                {fullName(p)}
                {p.positions && <small> {p.positions}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        hidden
        aria-label="Player picture"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void savePhoto(file);
        }}
      />
      {previewing && <PagePreview title={`${team.name} depth chart`} onClose={closePreview} />}
    </section>
  );
}

/**
 * The depth chart on a field: every spot where it lines up, its starter's
 * picture and name on top and the backups under. Spots are placed from their
 * names (QB behind the center, corners wide, safeties deep); drag one, or
 * focus it and use the arrow keys, to put it where your scheme has it.
 */
function DepthField({
  unit,
  slots,
  byId,
  dragging,
  onMove,
  onReset,
  onDropPlayer,
}: {
  unit: DepthUnit;
  slots: DepthSlot[];
  byId: Map<string, HubPlayer>;
  dragging: Drag | null;
  onMove: (key: string, at: Spot) => void;
  onReset: () => void;
  onDropPlayer: (key: string) => void;
}) {
  const field = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<{ key: string; at: Spot } | null>(null);
  const grab = useRef<{ key: string; x: number; y: number; moved: boolean } | null>(null);
  const placed = useMemo(() => placeSlots(unit, slots), [unit, slots]);
  const parked = placed.filter((p) => p.parked).length;
  const moved = slots.some((s) => s.at);

  const toSpot = (clientX: number, clientY: number): Spot => {
    const r = field.current!.getBoundingClientRect();
    return clampSpot(((clientX - r.left) / r.width) * 100, ((clientY - r.top) / r.height) * 100);
  };

  return (
    <div className="hub-field-wrap">
      <div className="hub-field-bar hub-noprint">
        <span className="hint">
          {parked
            ? `${parked} ${parked === 1 ? "spot waits" : "spots wait"} on the sideline: drag ${parked === 1 ? "it" : "them"} to where ${parked === 1 ? "it lines" : "they line"} up.`
            : "Drag a spot, or pick it and use the arrow keys, to match your formation."}
        </span>
        {moved && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={onReset}>
            Line them up by position
          </button>
        )}
      </div>
      <div ref={field} className={`hub-field hub-field-${unit}`} role="group" aria-label={`${UNIT_LABEL[unit]} on the field`}>
        <span className="hub-field-los" style={{ top: `${LOS_Y[unit]}%` }} aria-hidden="true" />
        {placed.map(({ slot, at: placedAt, parked: isParked }) => {
          const at = live?.key === slot.key ? live.at : placedAt;
          const [starter, ...backups] = slot.playerIds.map((id) => byId.get(id)).filter((p): p is HubPlayer => Boolean(p));
          return (
            <div
              key={slot.key}
              className={`hub-fspot${isParked ? " is-parked" : ""}${dragging ? " is-target" : ""}${live?.key === slot.key ? " is-moving" : ""}`}
              style={{ left: `${at.x}%`, top: `${at.y}%` }}
              data-spot={slot.label}
              onDragOver={(e) => dragging && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onDropPlayer(slot.key);
              }}
            >
              <button
                type="button"
                className={`hub-ftoken${starter?.status === "injured" ? " is-hurt" : ""}`}
                aria-label={`${slot.label}: ${starter ? fullName(starter) : "nobody yet"}. Drag or use the arrow keys to move this spot.`}
                title="Drag to move this spot"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  grab.current = { key: slot.key, x: e.clientX, y: e.clientY, moved: false };
                }}
                onPointerMove={(e) => {
                  const g = grab.current;
                  if (!g || g.key !== slot.key) return;
                  if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 4) return;
                  g.moved = true;
                  setLive({ key: slot.key, at: toSpot(e.clientX, e.clientY) });
                }}
                onPointerUp={(e) => {
                  const g = grab.current;
                  grab.current = null;
                  if (g?.moved) onMove(slot.key, toSpot(e.clientX, e.clientY));
                  setLive(null);
                }}
                onPointerCancel={() => {
                  grab.current = null;
                  setLive(null);
                }}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 5 : 2;
                  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
                  if (!d) return;
                  e.preventDefault();
                  onMove(slot.key, clampSpot(at.x + d[0], at.y + d[1]));
                }}
              >
                {starter?.photo ? (
                  <PlayerFace player={starter} size={34} />
                ) : (
                  // Drawn by CSS from the attribute, so the button's only words are its name.
                  <span className="hub-ftoken-open" aria-hidden="true" data-text={starter ? initials(starter.firstName, starter.lastName) : slot.letter || slot.label.slice(0, 2)} />
                )}
                {slot.letter && starter && (
                  <span className="hub-fletter" aria-hidden="true" data-text={slot.letter} />
                )}
              </button>
              <span className="hub-flabel">{slot.label}</span>
              <span className="hub-fname">{starter ? `${starter.jersey ? `#${starter.jersey} ` : ""}${fullName(starter)}` : "Open"}</span>
              {backups.length > 0 && (
                <span className="hub-fbackups">
                  {backups.map((p, i) => (
                    <span key={p.id}>
                      {STRING[i + 1]} {p.lastName || p.firstName}
                    </span>
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
