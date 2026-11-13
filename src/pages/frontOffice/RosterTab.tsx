import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, coachError } from "../../lib/api";
import { Confirm } from "../../components/Confirm";
import { PagePreview } from "../../components/PrintPreview";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { useAuth } from "../../lib/auth";
import { initials, photoFromFile } from "../../lib/playerPhoto";
import {
  byJersey,
  CUSTOM_LIMITS,
  customName,
  emptyGuardian,
  emptyPlayer,
  emptySizes,
  FILE_LIMITS,
  FILE_TYPES,
  fullName,
  HUB_LIMITS,
  PLAYER_FILE_LIMITS,
  PLAYER_STATUS,
  playersFromRows,
  parseTable,
  rosterCsv,
  SIZE_LABEL,
  STATUS_LABEL,
  type HubPlayer,
  type HubTeam,
  type PlayerFile,
  type PlayerInfo,
  type PlayerStatus,
  type UniformSizes,
} from "../../lib/teamHub";
import { setGriddyRoster } from "../../lib/griddyRoster";
import { allColumns, applyEdit, columnsCsv, customColumn, customFields, customColumnId, takenNames, type RosterColumn, type RosterField } from "../../lib/rosterColumns";
import { isShown, useRosterView, withColumn } from "../../lib/rosterView";
import { hubSource, type TeamSource } from "../../lib/teamSource";
import { useToast } from "../../lib/toast";

const STATUS_PILL: Record<PlayerStatus, string> = { active: "pill-green", injured: "pill-red", inactive: "" };

/** Years old today, from a yyyy-mm-dd birth date. */
function age(birth: string): string {
  if (!birth) return "";
  const b = new Date(`${birth}T00:00:00`);
  const now = new Date();
  let years = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) years--;
  return years >= 0 && years < 100 ? String(years) : "";
}

/** "J YS · S YM · P YL" */
const sizeLine = (s: UniformSizes | undefined) =>
  s ? (["jersey", "shirt", "pants"] as const).filter((k) => s[k]).map((k) => `${k === "jersey" ? "J" : k === "shirt" ? "S" : "P"} ${s[k]}`).join(" · ") : "";

/** The player's picture, or their initials on a tinted circle. */
export function PlayerFace({ player, size = 32 }: { player: Pick<PlayerInfo, "firstName" | "lastName" | "photo">; size?: number }) {
  return player.photo ? (
    <img className="hub-face" src={player.photo} alt="" width={size} height={size} />
  ) : (
    <span className="hub-face hub-face-none" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {initials(player.firstName, player.lastName)}
    </span>
  );
}

function download(name: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * A team's roster: every player with their contacts and guardians, searchable,
 * importable from a spreadsheet, downloadable as CSV and printable as a
 * sideline contact sheet.
 */
export function RosterTab({
  team,
  onCount,
  source: given,
  privacy,
}: {
  team: Pick<HubTeam, "id" | "name" | "allCoaches">;
  onCount?: () => void;
  /** Where the players live; a Front Office team's API unless given. */
  source?: TeamSource;
  /** Who can see the contacts, in place of the Front Office line. */
  privacy?: string;
}) {
  const toast = useToast();
  const source = useMemo(() => given ?? hubSource(team.id), [given, team.id]);
  const [players, setPlayers] = useState<HubPlayer[] | null>(null);
  const [failed, setFailed] = useState("");
  // Print shows a preview of the printed page first.
  const [previewing, setPreviewing] = useState(false);
  const closePreview = useCallback(() => setPreviewing(false), []);
  const [find, setFind] = useState("");
  const [status, setStatus] = useState<PlayerStatus | "all">("all");
  const [open, setOpen] = useState<HubPlayer | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  // Players ticked for Remove selected, and the ones a Remove box is asking about.
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [removing, setRemoving] = useState<HubPlayer[] | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  // Columns: which show (and so print and download), fields the coach added, and typing straight into the table.
  const [view, setView] = useRosterView(team.id);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dropField, setDropField] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);

  useEffect(() => {
    source
      .roster()
      .then((r) => setPlayers(r.players))
      .catch((e: Error) => setFailed(e.message));
  }, [source]);

  // Griddy can remove players or change their status on the roster on screen; his card hands the new list back.
  useEffect(() => {
    if (!players) return;
    return setGriddyRoster({
      team: team.name,
      players,
      source,
      onChange: (next) => {
        if (next.length !== players.length) onCount?.();
        setPlayers(next);
      },
    });
  }, [players, source, team.name, onCount]);

  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    return (players ?? [])
      .filter((p) => status === "all" || p.status === status)
      .filter(
        (p) =>
          !q ||
          [fullName(p), p.jersey, p.positions, p.grade, ...p.guardians.map((g) => g.name), ...Object.values(p.custom ?? {})].some((v) => v.toLowerCase().includes(q)),
      )
      .sort(byJersey);
  }, [players, find, status]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: players?.length ?? 0 };
    for (const p of players ?? []) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [players]);

  const fields = useMemo(() => customFields(players ?? [], view.fields), [players, view.fields]);
  const columns = useMemo(() => allColumns(fields), [fields]);
  const byDefault = useCallback((c: RosterColumn) => (typeof c.byDefault === "function" ? c.byDefault(players ?? []) : c.byDefault), [players]);
  const visible = columns.filter((c) => c.fixed || isShown(view, c.id, byDefault(c)));
  const hiddenCount = columns.length - visible.length;
  const toggleColumn = (c: RosterColumn, on: boolean) => setView((v) => withColumn(v, c.id, byDefault(c), on));

  /*
   * Typing in the table: the change shows at once and saves in the
   * background, one save at a time, each sending the player as the table now
   * has them, so two quick edits to one player can't undo each other. The
   * server's list comes back only once nothing else is waiting.
   */
  const latest = useRef(players);
  latest.current = players;
  const queue = useRef<Promise<void>>(Promise.resolve());
  const waiting = useRef(0);
  const editCell = (id: string, field: RosterField, value: string) => {
    const now = latest.current?.find((p) => p.id === id);
    if (!now || field.get(now) === value) return;
    const next = applyEdit(now, field, value);
    if (typeof next === "string") {
      toast(next, true);
      return;
    }
    const list = (latest.current ?? []).map((p) => (p.id === id ? { ...p, ...next } : p));
    latest.current = list;
    setPlayers(list);
    waiting.current++;
    setSaving(waiting.current);
    queue.current = queue.current.then(async () => {
      const p = latest.current?.find((x) => x.id === id);
      try {
        if (!p) return;
        const { id: _id, teamId: _t, updatedAt: _u, ...info } = p;
        const res = await source.updatePlayer(id, info);
        if (waiting.current === 1) {
          latest.current = res.players;
          setPlayers(res.players);
        }
      } catch (e) {
        toast(coachError(e, `${p ? fullName(p) : "That player"} didn't save. Try again in a minute.`), true);
        // Show what the roster really holds.
        source
          .roster()
          .then((r) => {
            latest.current = r.players;
            setPlayers(r.players);
          })
          .catch(() => undefined);
      } finally {
        waiting.current--;
        setSaving(waiting.current);
      }
    });
  };

  const addField = (raw: string): string => {
    const name = customName(raw);
    if (!name) return "Name the field first.";
    if (fields.length >= CUSTOM_LIMITS.fields) return `A roster holds ${CUSTOM_LIMITS.fields} added fields.`;
    if (takenNames(fields).has(name.toLowerCase())) return `The roster already has a ${name} column.`;
    setView((v) => withColumn({ ...v, fields: [...v.fields, name] }, customColumnId(name), true, true));
    return "";
  };
  const removeField = (name: string) => {
    for (const p of players ?? []) if (p.custom?.[name]) editCell(p.id, customColumn(name).fields[0], "");
    setView((v) => ({ ...v, fields: v.fields.filter((f) => f !== name), hide: v.hide.filter((x) => x !== customColumnId(name)) }));
    setDropField(null);
    toast(`${name} is off the roster.`);
  };

  const changed = (next: HubPlayer[], message?: string) => {
    if (next.length !== players?.length) onCount?.();
    latest.current = next;
    setPlayers(next);
    // Ticks on players who are gone go with them.
    setPicked((was) => new Set([...was].filter((id) => next.some((p) => p.id === id))));
    if (message) toast(message);
  };

  const remove = async (list: HubPlayer[]) => {
    setRemoveBusy(true);
    try {
      const res = list.length === 1 ? await source.deletePlayer(list[0].id) : await source.deletePlayers(list.map((p) => p.id));
      changed(res.players, list.length === 1 ? `${fullName(list[0])} removed from the roster.` : `${list.length} players removed from the roster.`);
      setRemoving(null);
    } catch (e) {
      toast(coachError(e, "Those players weren't removed. Try again in a minute."), true);
    } finally {
      setRemoveBusy(false);
    }
  };

  const shownIds = shown.map((p) => p.id);
  const allPicked = shownIds.length > 0 && shownIds.every((id) => picked.has(id));
  const pickAll = () => setPicked((was) => (allPicked ? new Set([...was].filter((id) => !shownIds.includes(id))) : new Set([...was, ...shownIds])));
  const pick = (id: string) =>
    setPicked((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (failed && !players)
    return (
      <p className="hint" role="alert">
        {failed}
      </p>
    );
  if (!players) return <p role="status">Opening the roster…</p>;

  return (
    <section className="hub-panel" aria-labelledby="hub-roster">
      <div className="hub-head">
        <h3 id="hub-roster">
          {team.name} roster <span className="pill">{players.length}</span>
        </h3>
        <div className="fo-actions hub-noprint">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen("new")} disabled={players.length >= HUB_LIMITS.players}>
            <Icon name="plus" size={14} /> Add player
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setImporting(true)}>
            <Icon name="upload" size={14} /> Import spreadsheet
          </button>
          <button type="button" className="btn btn-quiet btn-sm" disabled={!players.length} onClick={() => download(`${team.name} roster.csv`, columnsCsv([...players].sort(byJersey), visible))}>
            <Icon name="download" size={14} /> Download CSV
          </button>
          <button type="button" className="btn btn-quiet btn-sm" disabled={!players.length} onClick={() => setPreviewing(true)}>
            <Icon name="print" size={14} /> Print contact sheet
          </button>
        </div>
      </div>

      {players.length > 0 && (
        <div className="hub-tools hub-noprint">
          <label className="hub-find">
            <Icon name="search" size={15} />
            <input className="input" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a player, number, position or parent" aria-label="Find a player" />
          </label>
          <div className="chip-row" role="group" aria-label="Show players">
            {(["all", ...PLAYER_STATUS] as const).map((s) => (
              <button key={s} type="button" className={`chip${status === s ? " is-on" : ""}`} aria-pressed={status === s} onClick={() => setStatus(s)}>
                {s === "all" ? "Everyone" : STATUS_LABEL[s]} {counts[s] ?? 0}
              </button>
            ))}
          </div>
          <div className="hub-view-tools">
            <button type="button" className={`btn btn-quiet btn-sm${columnsOpen ? " is-on" : ""}`} aria-expanded={columnsOpen} aria-controls="hub-columns" onClick={() => setColumnsOpen((o) => !o)}>
              <Icon name="grid" size={14} /> Columns{hiddenCount ? ` (${hiddenCount} hidden)` : ""}
            </button>
            <button type="button" className={`btn btn-sm ${editing ? "btn-primary" : "btn-quiet"}`} aria-pressed={editing} onClick={() => setEditing((e) => !e)}>
              <Icon name="pencil" size={14} /> {editing ? "Done editing" : "Edit in the table"}
            </button>
            {(editing || saving > 0) && (
              <span className="hint" role="status">
                {saving ? "Saving…" : "Changes save as you go"}
              </span>
            )}
          </div>
        </div>
      )}

      {columnsOpen && players.length > 0 && (
        <ColumnsPanel
          columns={columns}
          shown={(c) => c.fixed || isShown(view, c.id, byDefault(c))}
          onToggle={toggleColumn}
          onAdd={addField}
          onDrop={(name) => (players.some((p) => p.custom?.[name]) ? setDropField(name) : removeField(name))}
          onReset={() => setView((v) => ({ ...v, hide: [], show: [] }))}
          onEverything={() => download(`${team.name} roster (every field).csv`, rosterCsv([...players].sort(byJersey), fields))}
          onClose={() => setColumnsOpen(false)}
        />
      )}

      {picked.size > 0 && (
        <div className="hub-bulk hub-noprint" role="region" aria-label="Selected players">
          <b>
            {picked.size} {picked.size === 1 ? "player" : "players"} selected
          </b>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setRemoving(players.filter((p) => picked.has(p.id)))}>
            <Icon name="trash" size={14} /> Remove selected
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPicked(new Set())}>
            Clear
          </button>
        </div>
      )}

      {players.length === 0 ? (
        <div className="empty empty-sm">
          <Icon name="users" size={30} />
          <h3>No players yet</h3>
          <p>Add players one at a time, or paste the sign-up spreadsheet from your league and they all come in at once.</p>
        </div>
      ) : (
        <div className="hub-table-wrap">
          <table className={`hub-table${editing ? " is-editing" : ""}`}>
            <thead>
              <tr>
                <th scope="col" className="hub-noprint hub-pick">
                  <input type="checkbox" checked={allPicked} onChange={pickAll} aria-label={allPicked ? "Clear the ticks" : "Select every player shown"} />
                </th>
                {visible.map((c) => (
                  <th scope="col" key={c.id} className={c.id === "jersey" ? "hub-num-h" : undefined}>
                    <span className="hub-th">
                      {c.label}
                      {!c.fixed && (
                        <button type="button" className="hub-th-hide hub-noprint" onClick={() => toggleColumn(c, false)} aria-label={`Hide the ${c.label === "#" ? "jersey number" : c.label} column`} title="Hide this column">
                          <Icon name="close" size={11} />
                        </button>
                      )}
                    </span>
                  </th>
                ))}
                <th scope="col" className="hub-noprint">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                return (
                  <tr key={p.id} className={picked.has(p.id) ? "is-picked" : undefined}>
                    <td className="hub-noprint hub-pick">
                      <input type="checkbox" checked={picked.has(p.id)} onChange={() => pick(p.id)} aria-label={`Select ${fullName(p)}`} />
                    </td>
                    {visible.map((c) => (
                      <td key={c.id} className={cellClass(c, editing)} data-col={c.id}>
                        {editing ? <EditCell column={c} player={p} onEdit={(f, v) => editCell(p.id, f, v)} /> : <ReadCell column={c} player={p} />}
                      </td>
                    ))}
                    <td className="hub-noprint hub-row-actions">
                      <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOpen(p)} aria-label={`Open ${fullName(p)}`}>
                        <Icon name="pencil" size={14} /> Open
                      </button>
                      <button type="button" className="btn btn-quiet btn-sm hub-x" onClick={() => setRemoving([p])} aria-label={`Remove ${fullName(p)}`} title="Remove from the roster">
                        <Icon name="close" size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!shown.length && <p className="hint">Nobody matches. Clear the search or pick Everyone.</p>}
        </div>
      )}
      <p className="hint hub-noprint">
        <Icon name="lock" size={12} />{" "}
        {privacy ??
          `Only you${team.allCoaches ? " and your Front Office coaches" : " and this team's staff"} can see these contacts. They are never shared with players or posted publicly.`}
      </p>

      {removing && (
        <Confirm
          title={removing.length === 1 ? `Remove ${fullName(removing[0])}?` : `Remove ${removing.length} players?`}
          action={removing.length === 1 ? "Remove player" : `Remove ${removing.length} players`}
          danger
          busy={removeBusy}
          onConfirm={() => void remove(removing)}
          onClose={() => setRemoving(null)}
        >
          They come off {team.name}'s roster and depth chart, with any documents and pictures kept with them. This can't be undone; download the CSV
          first if you might want them back.
        </Confirm>
      )}

      {dropField && (
        <Confirm
          title={`Take ${dropField} off the roster?`}
          action="Remove field"
          danger
          onConfirm={() => removeField(dropField)}
          onClose={() => setDropField(null)}
        >
          {players.filter((p) => p.custom?.[dropField]).length} players have something in {dropField}. It comes off every one of them, and this can't be undone; download the
          CSV first if you might want it back.
        </Confirm>
      )}

      {open && (
        <PlayerDialog
          scope={source.fileScope}
          player={open === "new" ? null : open}
          onClose={() => setOpen(null)}
          onSave={async (info) => {
            const res = open === "new" ? await source.addPlayers([info]) : await source.updatePlayer(open.id, info);
            changed(res.players, open === "new" ? `${fullName(info)} added.` : "Saved.");
            setOpen(null);
          }}
          onDelete={
            open === "new"
              ? undefined
              : async () => {
                  changed((await source.deletePlayer(open.id)).players, `${fullName(open)} removed from the roster.`);
                  setOpen(null);
                }
          }
        />
      )}

      {importing && (
        <ImportDialog
          room={HUB_LIMITS.players - players.length}
          fields={fields}
          onClose={() => setImporting(false)}
          onImport={async (list) => {
            const res = await source.addPlayers(list);
            changed(res.players, `${res.added} ${res.added === 1 ? "player" : "players"} added to ${team.name}.`);
            setImporting(false);
          }}
        />
      )}
      {previewing && <PagePreview title={`${team.name} roster`} onClose={closePreview} />}
    </section>
  );
}

const cellClass = (c: RosterColumn, editing: boolean) =>
  [c.id === "jersey" && "hub-num", c.id === "player" && "hub-player", c.id === "sizes" && "hub-sizes", editing && "hub-edit-cell"].filter(Boolean).join(" ") || undefined;

const tel = (n: string) => (
  <a key={n} href={`tel:${n}`} className="hub-contact">
    {n}
  </a>
);
const mail = (m: string) => (
  <a key={m} href={`mailto:${m}`} className="hub-contact">
    {m}
  </a>
);

/** A roster cell as read: names, links to call and email, pills. */
function ReadCell({ column, player: p }: { column: RosterColumn; player: HubPlayer }) {
  switch (column.id) {
    case "jersey":
      return <>{p.jersey}</>;
    case "player":
      return (
        <>
          <PlayerFace player={p} />
          <b>{fullName(p)}</b>
          {p.status !== "active" && <span className={`pill ${STATUS_PILL[p.status]}`}>{STATUS_LABEL[p.status]}</span>}
          {p.medical && (
            <span className="pill pill-amber" title="Has medical notes">
              Medical
            </span>
          )}
        </>
      );
    case "grade":
      return <>{[p.grade, p.gradYear && `Class of ${p.gradYear}`, age(p.birthDate) && `${age(p.birthDate)} yrs`].filter(Boolean).join(" · ")}</>;
    case "sizes":
      return <>{sizeLine(p.sizes)}</>;
    case "status":
      return <span className={`pill ${STATUS_PILL[p.status]}`}>{STATUS_LABEL[p.status]}</span>;
    case "guardian": {
      const g = p.guardians[0];
      return g ? (
        <>
          {g.name}
          {g.relation && <small>{g.relation}</small>}
        </>
      ) : (
        <small>—</small>
      );
    }
    case "guardian2": {
      const g = p.guardians[1];
      return g ? (
        <>
          {g.name}
          {g.phone && tel(g.phone)}
          {g.email && mail(g.email)}
        </>
      ) : (
        <small>—</small>
      );
    }
    case "phone":
      return p.guardians[0]?.phone ? tel(p.guardians[0].phone) : null;
    case "email":
      return p.guardians[0]?.email ? mail(p.guardians[0].email) : null;
    case "playerPhone":
      return p.phone ? tel(p.phone) : null;
    case "playerEmail":
      return p.email ? mail(p.email) : null;
    default: {
      const text = column.fields.map((f) => f.get(p)).filter(Boolean).join(" · ");
      return text.length > 60 ? <span title={text}>{text.slice(0, 58)}…</span> : <>{text}</>;
    }
  }
}

/** A roster cell as boxes to type in; each box saves when the coach leaves it. */
function EditCell({ column, player, onEdit }: { column: RosterColumn; player: HubPlayer; onEdit: (field: RosterField, value: string) => void }) {
  const name = fullName(player) || "this player";
  return (
    <span className={`hub-cell-boxes${column.fields.length > 1 ? " is-multi" : ""}`}>
      {column.fields.map((f) =>
        f.kind === "status" ? (
          <select key={f.key} className="select hub-cell-input" value={player.status} onChange={(e) => onEdit(f, e.target.value)} aria-label={`Status for ${name}`}>
            {PLAYER_STATUS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        ) : (
          <CellInput key={f.key} field={f} value={f.get(player)} label={`${f.label} for ${name}`} onCommit={(v) => onEdit(f, v)} />
        ),
      )}
    </span>
  );
}

const INPUT_TYPE: Record<string, string> = { tel: "tel", email: "email", date: "date" };

/** One box: follows the player while the coach isn't in it, saves on leaving or Enter, Escape puts it back. */
function CellInput({ field, value, label, onCommit }: { field: RosterField; value: string; label: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const undo = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  const size = field.kind === "date" ? undefined : Math.max(3, Math.min(field.short === "#" ? 3 : 18, Math.max(draft.length, (field.short ?? field.label).length) + 1));
  return (
    <input
      className="input hub-cell-input"
      type={INPUT_TYPE[field.kind] ?? "text"}
      inputMode={field.kind === "number" ? "numeric" : undefined}
      value={draft}
      maxLength={field.max}
      size={size}
      placeholder={field.short ?? field.label}
      aria-label={label}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        focused.current = false;
        if (undo.current) {
          undo.current = false;
          setDraft(value);
        } else if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          e.stopPropagation();
          undo.current = true;
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/** Pick the roster's columns, add a field of your own, or take one off. */
function ColumnsPanel({
  columns,
  shown,
  onToggle,
  onAdd,
  onDrop,
  onReset,
  onEverything,
  onClose,
}: {
  columns: RosterColumn[];
  shown: (c: RosterColumn) => boolean;
  onToggle: (c: RosterColumn, on: boolean) => void;
  onAdd: (name: string) => string;
  onDrop: (name: string) => void;
  onReset: () => void;
  onEverything: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const added = columns.filter((c) => c.custom);
  return (
    <div id="hub-columns" className="hub-columns hub-noprint" role="group" aria-label="Roster columns">
      <div className="hub-columns-head">
        <b>Columns on the roster</b>
        <span className="hint">What shows here is what prints and what Download CSV saves.</span>
        <button type="button" className="btn btn-quiet btn-sm" onClick={onClose}>
          Done
        </button>
      </div>
      <ul className="hub-columns-list">
        {columns
          .filter((c) => !c.custom)
          .map((c) => (
            <li key={c.id}>
              <label className="check">
                <input type="checkbox" checked={shown(c)} disabled={c.fixed} onChange={(e) => onToggle(c, e.target.checked)} />
                {c.label === "#" ? "Jersey #" : c.label}
              </label>
            </li>
          ))}
      </ul>
      <h4>Your fields</h4>
      {added.length ? (
        <ul className="hub-columns-list">
          {added.map((c) => (
            <li key={c.id}>
              <label className="check">
                <input type="checkbox" checked={shown(c)} onChange={(e) => onToggle(c, e.target.checked)} />
                {c.label}
              </label>
              <button type="button" className="btn btn-quiet btn-sm hub-x" onClick={() => onDrop(c.label)} aria-label={`Remove the ${c.label} field`} title="Remove this field">
                <Icon name="trash" size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Add what your league asks for: waiver signed, fee paid, carpool, allergies to check.</p>
      )}
      <form
        className="hub-columns-add"
        onSubmit={(e) => {
          e.preventDefault();
          const problem = onAdd(name);
          setError(problem);
          if (!problem) setName("");
        }}
      >
        <input className="input" value={name} maxLength={CUSTOM_LIMITS.name} onChange={(e) => setName(e.target.value)} placeholder="Waiver signed" aria-label="New field name" />
        <button type="submit" className="btn btn-quiet btn-sm" disabled={!name.trim()}>
          <Icon name="plus" size={14} /> Add field
        </button>
      </form>
      {error && (
        <p className="hub-error" role="alert">
          {error}
        </p>
      )}
      <div className="fo-actions">
        <button type="button" className="btn btn-quiet btn-sm" onClick={onReset}>
          Show the usual columns
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={onEverything}>
          <Icon name="download" size={14} /> Download every field
        </button>
      </div>
    </div>
  );
}

/** Runs a save and keeps the dialog open with the server's words if it fails. */
function useSaving() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(coachError(e, "The roster didn't save. Try again in a minute."));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

const SIZE_SUGGEST = ["YXS", "YS", "YM", "YL", "YXL", "AS", "AM", "AL", "AXL", "A2XL", "A3XL"];

function PlayerDialog({
  scope,
  player,
  onClose,
  onSave,
  onDelete,
}: {
  scope: string;
  player: HubPlayer | null;
  onClose: () => void;
  onSave: (p: PlayerInfo) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [p, setP] = useState<PlayerInfo>(() => {
    const base = player ? { ...emptyPlayer(), ...player } : emptyPlayer();
    return { ...base, sizes: { ...emptySizes(), ...base.sizes }, guardians: base.guardians.length ? base.guardians.map((g) => ({ ...g })) : [emptyGuardian()] };
  });
  const [photoError, setPhotoError] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  const setSize = (key: keyof UniformSizes, value: string) => setP((x) => ({ ...x, sizes: { ...x.sizes, [key]: value } }));
  const [sure, setSure] = useState(false);
  const { busy, error, run } = useSaving();
  const set = (patch: Partial<PlayerInfo>) => setP((x) => ({ ...x, ...patch }));
  const setG = (i: number, patch: Partial<PlayerInfo["guardians"][number]>) => setP((x) => ({ ...x, guardians: x.guardians.map((g, n) => (n === i ? { ...g, ...patch } : g)) }));
  const named = Boolean(p.firstName.trim() || p.lastName.trim());

  const text = (label: string, key: keyof PlayerInfo, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field">
      <span>{label}</span>
      <input className="input" value={String(p[key] ?? "")} onChange={(e) => set({ [key]: e.target.value } as Partial<PlayerInfo>)} {...extra} />
    </label>
  );

  return (
    <Modal
      title={player ? fullName(player) || "Player" : "Add a player"}
      onClose={onClose}
      wide
      footer={
        <>
          {onDelete &&
            (sure ? (
              <button type="button" className="btn btn-danger hub-left" disabled={busy} onClick={() => void run(onDelete)}>
                Yes, remove from roster
              </button>
            ) : (
              <button type="button" className="btn btn-quiet hub-left" disabled={busy} onClick={() => setSure(true)}>
                <Icon name="trash" size={14} /> Remove
              </button>
            ))}
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !named} onClick={() => void run(() => onSave(p))}>
            {player ? "Save player" : "Add player"}
          </button>
        </>
      }
    >
      <form
        className="hub-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (named) void run(() => onSave(p));
        }}
      >
        {error && (
          <p className="hub-error" role="alert">
            {error}
          </p>
        )}
        <div className="hub-photo-row">
          <PlayerFace player={p} size={72} />
          <div>
            <h4>Player picture</h4>
            <p className="hint">Shows on the roster and the depth chart. Kept small, so it opens fast at the field.</p>
            <div className="fo-actions">
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => photoInput.current?.click()}>
                <Icon name="upload" size={14} /> {p.photo ? "Change picture" : "Add a picture"}
              </button>
              {p.photo && (
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => set({ photo: "" })}>
                  Remove picture
                </button>
              )}
            </div>
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              hidden
              aria-label="Player picture"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setPhotoError("");
                photoFromFile(file)
                  .then((photo) => set({ photo }))
                  .catch((err: Error) => setPhotoError(err.message));
              }}
            />
            {photoError && (
              <p className="hub-error" role="alert">
                {photoError}
              </p>
            )}
          </div>
        </div>

        <h4>Player</h4>
        <div className="hub-row">
          {text("First name", "firstName", { maxLength: HUB_LIMITS.short, autoFocus: true })}
          {text("Middle name", "middleName", { maxLength: HUB_LIMITS.short })}
          {text("Last name", "lastName", { maxLength: HUB_LIMITS.short })}
          {text("Jersey #", "jersey", { maxLength: 3, inputMode: "numeric" })}
        </div>
        <div className="hub-row">
          {text("Positions", "positions", { maxLength: HUB_LIMITS.short, placeholder: "QB, S" })}
          {text("Grade", "grade", { maxLength: 20, placeholder: "7th" })}
          {text("Grad year", "gradYear", { maxLength: 4, inputMode: "numeric", placeholder: "2031" })}
          {text("Birth date", "birthDate", { type: "date" })}
        </div>
        <div className="hub-row">
          {text("Height", "height", { maxLength: 12, placeholder: "5'6\"" })}
          {text("Weight", "weight", { maxLength: 12, placeholder: "120" })}
          <label className="field">
            <span>Status</span>
            <select className="select" value={p.status} onChange={(e) => set({ status: e.target.value as PlayerStatus })}>
              {PLAYER_STATUS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <h4>Uniform sizes</h4>
        <div className="hub-row">
          {(["jersey", "shirt", "pants"] as const).map((k) => (
            <label className="field" key={k}>
              <span>{SIZE_LABEL[k]}</span>
              <input className="input" value={p.sizes[k]} maxLength={12} list="hub-size-list" onChange={(e) => setSize(k, e.target.value)} placeholder="YM, AL" />
            </label>
          ))}
          <datalist id="hub-size-list">
            {SIZE_SUGGEST.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </div>

        <h4>Player's own contact (older players)</h4>
        <div className="hub-row">
          {text("Phone", "phone", { type: "tel", maxLength: 30 })}
          {text("Email", "email", { type: "email", maxLength: 254 })}
        </div>
        <label className="check">
          <input type="checkbox" checked={p.text} onChange={(e) => set({ text: e.target.checked })} /> OK to text this player team updates
        </label>
        {text("Home address", "address", { maxLength: HUB_LIMITS.text })}

        <h4>Parents and guardians</h4>
        {p.guardians.map((g, i) => (
          <div className="hub-guardian" key={i}>
            <div className="hub-row">
              <label className="field">
                <span>Name</span>
                <input className="input" value={g.name} maxLength={HUB_LIMITS.name} onChange={(e) => setG(i, { name: e.target.value })} />
              </label>
              <label className="field">
                <span>Relation</span>
                <input className="input" value={g.relation} maxLength={30} onChange={(e) => setG(i, { relation: e.target.value })} placeholder="Mother, Father, Guardian" />
              </label>
            </div>
            <div className="hub-row">
              <label className="field">
                <span>Phone</span>
                <input className="input" type="tel" value={g.phone} maxLength={30} onChange={(e) => setG(i, { phone: e.target.value })} />
              </label>
              <label className="field">
                <span>Email</span>
                <input className="input" type="email" value={g.email} maxLength={254} onChange={(e) => setG(i, { email: e.target.value })} />
              </label>
            </div>
            <div className="hub-guardian-foot">
              <label className="check">
                <input type="checkbox" checked={g.text} onChange={(e) => setG(i, { text: e.target.checked })} /> OK to text team updates
              </label>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => set({ guardians: p.guardians.filter((_, n) => n !== i) })}>
                Remove contact
              </button>
            </div>
          </div>
        ))}
        {p.guardians.length < HUB_LIMITS.guardians && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => set({ guardians: [...p.guardians, emptyGuardian()] })}>
            <Icon name="plus" size={14} /> Add a parent or guardian
          </button>
        )}

        <h4>Medical and notes</h4>
        <label className="field">
          <span>Allergies, conditions, medication</span>
          <textarea className="textarea" value={p.medical} maxLength={HUB_LIMITS.notes} onChange={(e) => set({ medical: e.target.value })} placeholder="Asthma, inhaler in bag" />
        </label>
        <label className="field">
          <span>Coach notes</span>
          <textarea className="textarea" value={p.notes} maxLength={HUB_LIMITS.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>

        <h4>Documents and pictures</h4>
        {player ? <PlayerDocs scope={scope} playerId={player.id} /> : <p className="hint">Add the player first, then open them again to keep a physical, birth certificate or waiver here.</p>}
      </form>
    </Modal>
  );
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Documents kept with one player (physicals, birth certificates, waivers,
 * pictures): uploaded to the account, private to whoever runs the team, and
 * always downloaded, never opened in the page.
 */
function PlayerDocs({ scope, playerId }: { scope: string; playerId: string }) {
  const [files, setFiles] = useState<PlayerFile[] | null>(null);
  const [state, setState] = useState<"" | "signin" | "busy">("");
  const [error, setError] = useState("");
  const [sure, setSure] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const { account } = useAuth();
  const signedIn = Boolean(account);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    api
      .playerFiles(scope, playerId)
      .then((r) => alive && setFiles(r.files ?? []))
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) setState("signin");
        else setError(coachError(e, "The documents didn't open. Try again in a minute."));
        setFiles([]);
      });
    return () => {
      alive = false;
    };
  }, [scope, playerId, signedIn]);

  if (state === "signin" || !signedIn)
    return (
      <p className="hint">
        <Link to="/signin">Sign in</Link> to keep documents and pictures with this player. They are stored on your account, never in this browser.
      </p>
    );
  if (!files) return <p role="status">Opening documents…</p>;

  const upload = async (list: FileList) => {
    setState("busy");
    setError("");
    try {
      for (const file of Array.from(list)) setFiles((await api.uploadPlayerFile(scope, playerId, file)).files);
    } catch (e) {
      setError(coachError(e, "That file didn't upload. Try again in a minute."));
    } finally {
      setState("");
    }
  };

  return (
    <div className="hub-docs">
      {error && (
        <p className="hub-error" role="alert">
          {error}
        </p>
      )}
      {files.length > 0 ? (
        <ul className="hub-files" aria-label="Documents">
          {files.map((f) => (
            <li key={f.id}>
              <a href={`/api/player-file/${f.id}`} download={f.name}>
                <Icon name="download" size={13} /> {f.name}
              </a>
              <small>{kb(f.size)}</small>
              {sure === f.id ? (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() =>
                    api
                      .deletePlayerFile(f.id)
                      .then((r) => setFiles(r.files))
                      .catch((e: unknown) => setError(coachError(e, "That file wasn't removed. Try again in a minute.")))
                      .finally(() => setSure(""))
                  }
                >
                  Yes, remove
                </button>
              ) : (
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setSure(f.id)} aria-label={`Remove ${f.name}`}>
                  <Icon name="trash" size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Nothing kept yet. Physicals, birth certificates, waivers, report cards and pictures fit here.</p>
      )}
      <button type="button" className="btn btn-quiet btn-sm" disabled={state === "busy" || files.length >= PLAYER_FILE_LIMITS.perPlayer} onClick={() => input.current?.click()}>
        <Icon name="upload" size={14} /> {state === "busy" ? "Uploading…" : "Upload a document or picture"}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-label="Upload a document or picture"
        accept={FILE_TYPES.map((t) => `.${t}`).join(",")}
        onChange={(e) => {
          const list = e.target.files;
          if (list?.length) void upload(list);
          e.target.value = "";
        }}
      />
      <p className="hint">
        PDF, Word, Excel, or a picture, up to {FILE_LIMITS.size / 1024 / 1024} MB each. Only you{scope.startsWith("my.") ? "" : " and this team's staff"} can open them.
      </p>
    </div>
  );
}

function ImportDialog({ room, fields, onClose, onImport }: { room: number; fields: string[]; onClose: () => void; onImport: (players: PlayerInfo[]) => Promise<void> }) {
  const [text, setText] = useState("");
  // A workbook's rows; typing in the box goes back to reading the box.
  const [fileRows, setFileRows] = useState<{ name: string; rows: string[][] } | null>(null);
  const [fileError, setFileError] = useState("");
  const { busy, error, run } = useSaving();
  const read = useMemo(() => playersFromRows(fileRows ? fileRows.rows : parseTable(text), fields), [text, fileRows, fields]);
  const take = read.players.slice(0, room);

  return (
    <Modal
      title="Import players from a spreadsheet"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !take.length} onClick={() => void run(() => onImport(take))}>
            Add {take.length || ""} {take.length === 1 ? "player" : "players"}
          </button>
        </>
      }
    >
      <p>
        Open your Excel workbook (.xlsx or .xls) or a CSV, or copy the sheet from Excel or Google Sheets and paste it below, headings first. Columns
        like First, Middle, Last, Jersey #, DOB, Grad yr, Dad, Dad cell, Dad email, Mom, Mom email, Mom cell, Jersey, Shirt and Pants sizes come
        across on their own.
      </p>
      {error && (
        <p className="hub-error" role="alert">
          {error}
        </p>
      )}
      <label className="field">
        <span>Open a spreadsheet (Excel or CSV)</span>
        <input
          type="file"
          accept=".xlsx,.xls,.csv,.tsv,.txt,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setFileError("");
            import("../../lib/sheetFile")
              .then(({ readSheetFile }) => readSheetFile(file))
              .then((rows) => {
                setFileRows({ name: file.name, rows });
                setText("");
              })
              .catch((err: unknown) => {
                setFileRows(null);
                setFileError(err instanceof Error && err.name !== "TypeError" ? err.message : "That file didn't open. Save it as .xlsx or .csv and try again.");
              });
          }}
        />
      </label>
      {fileError && (
        <p className="hub-error" role="alert">
          {fileError}
        </p>
      )}
      <label className="field">
        <span>Or paste the rows</span>
        <textarea
          className="textarea hub-paste"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setFileRows(null);
          }}
          placeholder={fileRows ? `Reading ${fileRows.name}. Paste here instead to replace it.` : "FIRST\tLAST\tJersey #\tDOB\tMOM\tMOM CELL\nMarcus\tHill\t12\t3/14/2016\tDana Hill\t615-555-0142"}
        />
      </label>
      {(text.trim() || fileRows) && (
        <div className="hub-preview" role="status">
          <b>
            {read.players.length} {read.players.length === 1 ? "player" : "players"} found
          </b>
          {read.players.length > room && <span> · only {room} more fit on this roster</span>}
          {read.skipped.length > 0 && <small>Not brought in: {read.skipped.join(", ")}</small>}
          {!read.players.length && !read.skipped.length && <small>We couldn't find a headings row. Put headings like FIRST, LAST and Jersey # above the players.</small>}
          <ul>
            {take.slice(0, 6).map((p, i) => (
              <li key={i}>
                {p.jersey && `#${p.jersey} `}
                {fullName(p)}
                {p.guardians.length > 0 && <small> · {p.guardians.map((g) => g.name || g.email || g.phone).join(", ")}</small>}
              </li>
            ))}
            {take.length > 6 && <li>and {take.length - 6} more</li>}
          </ul>
        </div>
      )}
    </Modal>
  );
}
