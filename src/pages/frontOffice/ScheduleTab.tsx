import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { api } from "../../lib/api";
import { useStore } from "../../lib/store";
import {
  EVENT_KINDS,
  HUB_LIMITS,
  KIND_LABEL,
  record,
  SCHEDULE_LIMITS,
  scheduleIcs,
  TEAM_COLORS,
  type EventDraft,
  type HubEvent,
  type HubState,
  type HubTeam,
} from "../../lib/teamHub";
import { useToast } from "../../lib/toast";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const longDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
/** "2026-10-27" and "18:30" in the coach's own time zone, for the date and time inputs. */
const localParts = (iso: string) => {
  const d = new Date(iso);
  return { date: dayKey(d), time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` };
};
const fromLocal = (date: string, t: string) => (date ? new Date(`${date}T${t || "00:00"}`).toISOString() : "");

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The team's season: games, practices and meetings on a month calendar or a
 * list, with the won-lost record, an .ics download for phones and Google
 * Calendar, and the Call Sheet one tap from a game with a Call Sheet.
 */
export function ScheduleTab({ hub, team }: { hub: HubState; team: HubTeam }) {
  const toast = useToast();
  const navigate = useNavigate();
  const sheets = useStore((s) => s.sheets);
  const [events, setEvents] = useState<HubEvent[] | null>(null);
  const [failed, setFailed] = useState("");
  const [view, setView] = useState<"month" | "list">("month");
  const [allTeams, setAllTeams] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [open, setOpen] = useState<HubEvent | { draft: EventDraft } | null>(null);
  const [showPast, setShowPast] = useState(false);
  const director = hub.role === "director";
  const teamById = useMemo(() => new Map(hub.teams.map((t) => [t.id, t])), [hub.teams]);

  useEffect(() => {
    api
      .events(hub.org.id)
      .then((r) => setEvents(r.events))
      .catch((e: Error) => setFailed(e.message));
  }, [hub.org.id]);

  const mine = useMemo(() => (events ?? []).filter((e) => allTeams || e.teamId === null || e.teamId === team.id), [events, allTeams, team.id]);
  const teamGames = useMemo(() => (events ?? []).filter((e) => e.teamId === team.id), [events, team.id]);
  const rec = record(teamGames);
  const now = Date.now();
  const next = mine.find((e) => !e.canceled && new Date(e.startsAt).getTime() > now);

  const color = (e: HubEvent) => (e.teamId ? teamById.get(e.teamId)?.color || TEAM_COLORS[0] : "var(--ink)");

  const blank = (date?: string): EventDraft => {
    const d = date ? new Date(`${date}T18:00`) : new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000);
    return {
      teamId: team.id,
      kind: "practice",
      title: "",
      startsAt: d.toISOString(),
      endsAt: new Date(d.getTime() + 90 * 60_000).toISOString(),
      location: "",
      opponent: "",
      homeAway: "",
      notes: "",
      sheetId: "",
      scoreUs: null,
      scoreThem: null,
      canceled: false,
    };
  };

  // The month grid: whole weeks, Sunday first.
  const grid = useMemo(() => {
    const start = new Date(month);
    start.setDate(1 - start.getDay());
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    while (days.length > 35 && days[days.length - 7].getMonth() !== month.getMonth()) days.splice(-7);
    return days;
  }, [month]);
  const byDay = useMemo(() => {
    const m = new Map<string, HubEvent[]>();
    for (const e of mine) {
      const k = dayKey(new Date(e.startsAt));
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return m;
  }, [mine]);
  const today = dayKey(new Date());

  if (failed && !events)
    return (
      <p className="hint" role="alert">
        {failed}
      </p>
    );
  if (!events) return <p role="status">Opening the schedule…</p>;

  const listed = mine.filter((e) => showPast || new Date(e.startsAt).getTime() >= now - 3 * 3_600_000);

  return (
    <section className="hub-panel" aria-labelledby="hub-schedule">
      <div className="hub-head">
        <h3 id="hub-schedule">{allTeams ? `${hub.org.name} calendar` : `${team.name} schedule`}</h3>
        <div className="fo-actions hub-noprint">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen({ draft: blank() })}>
            <Icon name="plus" size={14} /> Add event
          </button>
          <button type="button" className="btn btn-quiet btn-sm" disabled={!mine.length} onClick={() => download(`${allTeams ? hub.org.name : team.name} schedule.ics`, scheduleIcs(allTeams ? hub.org.name : team.name, mine))}>
            <Icon name="calendar" size={14} /> Add to my calendar (.ics)
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => window.print()}>
            <Icon name="print" size={14} /> Print
          </button>
        </div>
      </div>

      <div className="hub-stats">
        <div>
          <small>Record</small>
          <b>
            {rec.w}-{rec.l}
            {rec.t ? `-${rec.t}` : ""}
          </b>
        </div>
        <div>
          <small>Points for / against</small>
          <b>
            {rec.pf} / {rec.pa}
          </b>
        </div>
        <div className="hub-next">
          <small>Next up</small>
          {next ? (
            <button type="button" className="hub-link" onClick={() => setOpen(next)}>
              <b>{next.title}</b> · {longDay(next.startsAt)} {time(next.startsAt)}
              {next.location && ` · ${next.location}`}
            </button>
          ) : (
            <b>Nothing scheduled</b>
          )}
        </div>
      </div>

      <div className="hub-tools hub-noprint">
        <div className="chip-row" role="group" aria-label="View">
          <button type="button" className={`chip${view === "month" ? " is-on" : ""}`} aria-pressed={view === "month"} onClick={() => setView("month")}>
            Month
          </button>
          <button type="button" className={`chip${view === "list" ? " is-on" : ""}`} aria-pressed={view === "list"} onClick={() => setView("list")}>
            List
          </button>
        </div>
        {(director || hub.teams.length > 1) && (
          <label className="check">
            <input type="checkbox" checked={allTeams} onChange={(e) => setAllTeams(e.target.checked)} /> Show every team I can see
          </label>
        )}
        {view === "list" && (
          <label className="check">
            <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Show past events
          </label>
        )}
      </div>

      {view === "month" ? (
        <div className="hub-month">
          <div className="hub-month-head">
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">
              <Icon name="prev" size={14} />
            </button>
            <h4 aria-live="polite">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h4>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">
              <Icon name="next" size={14} />
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
              Today
            </button>
          </div>
          <div className="hub-cal" role="grid" aria-label="Calendar">
            {WEEKDAYS.map((w) => (
              <div key={w} className="hub-cal-wd" role="columnheader">
                {w}
              </div>
            ))}
            {grid.map((d) => {
              const k = dayKey(d);
              const list = byDay.get(k) ?? [];
              return (
                <div key={k} role="gridcell" className={`hub-cal-day${d.getMonth() !== month.getMonth() ? " is-out" : ""}${k === today ? " is-today" : ""}`}>
                  <button type="button" className="hub-cal-num" onClick={() => setOpen({ draft: blank(k) })} aria-label={`Add an event on ${d.toLocaleDateString()}`}>
                    {d.getDate()}
                  </button>
                  {list.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className={`hub-ev hub-ev-${e.kind}${e.canceled ? " is-canceled" : ""}`}
                      style={{ "--team": color(e) } as React.CSSProperties}
                      onClick={() => setOpen(e)}
                    >
                      <span>{time(e.startsAt)}</span> {e.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : listed.length ? (
        <ul className="hub-agenda">
          {listed.map((e) => (
            <li key={e.id} style={{ "--team": color(e) } as React.CSSProperties} className={e.canceled ? "is-canceled" : ""}>
              <div className="hub-agenda-when">
                <b>{longDay(e.startsAt)}</b>
                <small>
                  {time(e.startsAt)}
                  {e.endsAt && `–${time(e.endsAt)}`}
                </small>
              </div>
              <div className="hub-agenda-what">
                <span className={`pill hub-kind-${e.kind}`}>{KIND_LABEL[e.kind]}</span>
                {e.canceled && <span className="pill pill-red">Canceled</span>}
                <b>{e.title}</b>
                <small>
                  {[e.teamId ? teamById.get(e.teamId)?.name : "Whole Front Office", e.homeAway && e.homeAway[0].toUpperCase() + e.homeAway.slice(1), e.location].filter(Boolean).join(" · ")}
                </small>
                {e.kind === "game" && e.scoreUs !== null && e.scoreThem !== null && (
                  <span className={`pill ${e.scoreUs > e.scoreThem ? "pill-green" : e.scoreUs < e.scoreThem ? "pill-red" : ""}`}>
                    {e.scoreUs > e.scoreThem ? "W" : e.scoreUs < e.scoreThem ? "L" : "T"} {e.scoreUs}-{e.scoreThem}
                  </span>
                )}
              </div>
              <div className="fo-actions hub-noprint">
                {e.kind === "game" && sheets.some((s) => s.id === e.sheetId) && (
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => navigate(`/grid?sheet=${encodeURIComponent(e.sheetId)}`)}>
                    <Icon name="table" size={13} /> Call Sheet
                  </button>
                )}
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOpen(e)} aria-label={`Open ${e.title}`}>
                  <Icon name="pencil" size={13} /> Open
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty empty-sm">
          <Icon name="calendar" size={30} />
          <h3>Nothing coming up</h3>
          <p>Add your games and practices. A weekly practice can repeat for the whole season in one go.</p>
        </div>
      )}

      {open && (
        <EventDialog
          event={"draft" in open ? null : open}
          initial={"draft" in open ? open.draft : open}
          hub={hub}
          onClose={() => setOpen(null)}
          onSave={async (draft, repeat) => {
            if ("draft" in open) {
              const res = await api.addEvent(hub.org.id, draft, repeat);
              setEvents(res.events);
              toast(res.added > 1 ? `${res.added} events added, one a week.` : "Added to the schedule.");
            } else {
              setEvents((await api.updateEvent(open.id, draft)).events);
              toast("Saved.");
            }
            setOpen(null);
          }}
          onDelete={
            "draft" in open
              ? undefined
              : async () => {
                  setEvents((await api.deleteEvent(open.id)).events);
                  setOpen(null);
                  toast("Removed from the schedule.");
                }
          }
        />
      )}
    </section>
  );
}

function EventDialog({
  event,
  initial,
  hub,
  onClose,
  onSave,
  onDelete,
}: {
  event: HubEvent | null;
  initial: EventDraft;
  hub: HubState;
  onClose: () => void;
  onSave: (draft: EventDraft, repeatWeeks: number) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const sheets = useStore((s) => s.sheets);
  const navigate = useNavigate();
  const [d, setD] = useState<EventDraft>(initial);
  const start = localParts(initial.startsAt);
  const [date, setDate] = useState(start.date);
  const [from, setFrom] = useState(start.time);
  const [to, setTo] = useState(initial.endsAt ? localParts(initial.endsAt).time : "");
  const [repeat, setRepeat] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sure, setSure] = useState(false);
  const set = (patch: Partial<EventDraft>) => setD((x) => ({ ...x, ...patch }));
  const game = d.kind === "game";

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    const startsAt = fromLocal(date, from);
    let endsAt = to ? fromLocal(date, to) : null;
    // An end time before the start runs past midnight.
    if (endsAt && endsAt <= startsAt) endsAt = new Date(new Date(endsAt).getTime() + 86_400_000).toISOString();
    void run(() => onSave({ ...d, startsAt, endsAt }, repeat));
  };
  const score = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.min(999, Math.floor(Number(v)) || 0)));

  return (
    <Modal
      title={event ? event.title : "Add to the schedule"}
      onClose={onClose}
      wide
      footer={
        <>
          {onDelete &&
            (sure ? (
              <button type="button" className="btn btn-danger hub-left" disabled={busy} onClick={() => void run(onDelete)}>
                Yes, remove it
              </button>
            ) : (
              <button type="button" className="btn btn-quiet hub-left" disabled={busy} onClick={() => setSure(true)}>
                <Icon name="trash" size={14} /> Remove
              </button>
            ))}
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !date} onClick={save}>
            {event ? "Save" : repeat ? `Add ${repeat + 1} events` : "Add"}
          </button>
        </>
      }
    >
      <form
        className="hub-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {error && (
          <p className="hub-error" role="alert">
            {error}
          </p>
        )}
        <div className="chip-row" role="group" aria-label="Kind of event">
          {EVENT_KINDS.map((k) => (
            <button key={k} type="button" className={`chip${d.kind === k ? " is-on" : ""}`} aria-pressed={d.kind === k} onClick={() => set({ kind: k })}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="hub-row">
          <label className="field">
            <span>For</span>
            <select className="select" value={d.teamId ?? ""} onChange={(e) => set({ teamId: e.target.value || null })}>
              {hub.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              {hub.role === "director" && <option value="">Whole Front Office</option>}
            </select>
          </label>
          {game && (
            <>
              <label className="field">
                <span>Opponent</span>
                <input className="input" value={d.opponent} maxLength={HUB_LIMITS.name} onChange={(e) => set({ opponent: e.target.value })} placeholder="Hawks" />
              </label>
              <label className="field">
                <span>Home or away</span>
                <select className="select" value={d.homeAway} onChange={(e) => set({ homeAway: e.target.value as EventDraft["homeAway"] })}>
                  <option value="">—</option>
                  <option value="home">Home</option>
                  <option value="away">Away</option>
                  <option value="neutral">Neutral site</option>
                </select>
              </label>
            </>
          )}
        </div>
        <label className="field">
          <span>Title</span>
          <input
            className="input"
            value={d.title}
            maxLength={SCHEDULE_LIMITS.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder={game ? (d.opponent ? `vs ${d.opponent}` : "vs Hawks") : d.kind === "practice" ? "Practice" : "Parent meeting"}
          />
        </label>
        <div className="hub-row">
          <label className="field">
            <span>Date</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="field">
            <span>Starts</span>
            <input className="input" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>Ends</span>
            <input className="input" type="time" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Location</span>
          <input className="input" value={d.location} maxLength={HUB_LIMITS.text} onChange={(e) => set({ location: e.target.value })} placeholder="Field 3, Riverside Park" />
        </label>
        {!event && (
          <label className="field">
            <span>Repeat</span>
            <select className="select" value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}>
              <option value={0}>Just this once</option>
              {Array.from({ length: SCHEDULE_LIMITS.repeat }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  Every week for {n + 1} weeks
                </option>
              ))}
            </select>
          </label>
        )}
        {game && (
          <>
            <div className="hub-row">
              <label className="field">
                <span>Our score</span>
                <input className="input" inputMode="numeric" value={d.scoreUs ?? ""} onChange={(e) => set({ scoreUs: score(e.target.value) })} />
              </label>
              <label className="field">
                <span>Their score</span>
                <input className="input" inputMode="numeric" value={d.scoreThem ?? ""} onChange={(e) => set({ scoreThem: score(e.target.value) })} />
              </label>
              <label className="field">
                <span>Call Sheet for this game</span>
                <select className="select" value={d.sheetId} onChange={(e) => set({ sheetId: e.target.value })}>
                  <option value="">None</option>
                  {sheets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  {d.sheetId && !sheets.some((s) => s.id === d.sheetId) && <option value={d.sheetId}>A sheet on another coach's device</option>}
                </select>
              </label>
            </div>
            {d.sheetId && sheets.some((s) => s.id === d.sheetId) && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => navigate(`/grid?sheet=${encodeURIComponent(d.sheetId)}`)}>
                <Icon name="table" size={13} /> Open Call Sheet
              </button>
            )}
          </>
        )}
        {d.kind === "practice" && (
          <p className="hint">
            Plan the periods and print scout cards in the{" "}
            <button type="button" className="hub-link" onClick={() => navigate("/practice")}>
              practice planner
            </button>
            .
          </p>
        )}
        <label className="field">
          <span>Notes</span>
          <textarea className="textarea" value={d.notes} maxLength={SCHEDULE_LIMITS.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Arrive 45 minutes early. White jerseys." />
        </label>
        {event && (
          <label className="check">
            <input type="checkbox" checked={d.canceled} onChange={(e) => set({ canceled: e.target.checked })} /> Canceled (stays on the calendar, crossed out)
          </label>
        )}
      </form>
    </Modal>
  );
}
