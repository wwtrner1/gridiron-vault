import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import {
  byJersey,
  emptyGuardian,
  emptyPlayer,
  fullName,
  HUB_LIMITS,
  PLAYER_STATUS,
  playersFromTable,
  rosterCsv,
  STATUS_LABEL,
  type HubPlayer,
  type HubTeam,
  type PlayerInfo,
  type PlayerStatus,
} from "../../lib/teamHub";
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
  const [find, setFind] = useState("");
  const [status, setStatus] = useState<PlayerStatus | "all">("all");
  const [open, setOpen] = useState<HubPlayer | "new" | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    source
      .roster()
      .then((r) => setPlayers(r.players))
      .catch((e: Error) => setFailed(e.message));
  }, [source]);

  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    return (players ?? [])
      .filter((p) => status === "all" || p.status === status)
      .filter(
        (p) =>
          !q ||
          [fullName(p), p.jersey, p.positions, p.grade, ...p.guardians.map((g) => g.name)].some((v) => v.toLowerCase().includes(q)),
      )
      .sort(byJersey);
  }, [players, find, status]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: players?.length ?? 0 };
    for (const p of players ?? []) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [players]);

  const changed = (next: HubPlayer[], message?: string) => {
    if (next.length !== players?.length) onCount?.();
    setPlayers(next);
    if (message) toast(message);
  };

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
          <button type="button" className="btn btn-quiet btn-sm" disabled={!players.length} onClick={() => download(`${team.name} roster.csv`, rosterCsv([...players].sort(byJersey)))}>
            <Icon name="download" size={14} /> Download CSV
          </button>
          <button type="button" className="btn btn-quiet btn-sm" disabled={!players.length} onClick={() => window.print()}>
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
          <table className="hub-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Pos</th>
                <th scope="col">Grade / age</th>
                <th scope="col">Parent or guardian</th>
                <th scope="col">Phone</th>
                <th scope="col">Email</th>
                <th scope="col" className="hub-noprint">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const g = p.guardians[0];
                return (
                  <tr key={p.id}>
                    <td className="hub-num">{p.jersey}</td>
                    <td>
                      <b>{fullName(p)}</b>
                      {p.status !== "active" && <span className={`pill ${STATUS_PILL[p.status]}`}>{STATUS_LABEL[p.status]}</span>}
                      {p.medical && (
                        <span className="pill pill-amber" title="Has medical notes">
                          Medical
                        </span>
                      )}
                    </td>
                    <td>{p.positions}</td>
                    <td>{[p.grade, age(p.birthDate) && `${age(p.birthDate)} yrs`].filter(Boolean).join(" · ")}</td>
                    <td>
                      {g ? (
                        <>
                          {g.name}
                          {g.relation && <small>{g.relation}</small>}
                        </>
                      ) : (
                        <small>—</small>
                      )}
                    </td>
                    <td>
                      {[g?.phone, p.phone].filter(Boolean).map((n) => (
                        <a key={n} href={`tel:${n}`} className="hub-contact">
                          {n}
                        </a>
                      ))}
                    </td>
                    <td>
                      {[g?.email, p.email].filter(Boolean).map((m) => (
                        <a key={m} href={`mailto:${m}`} className="hub-contact">
                          {m}
                        </a>
                      ))}
                    </td>
                    <td className="hub-noprint">
                      <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOpen(p)} aria-label={`Open ${fullName(p)}`}>
                        <Icon name="pencil" size={14} /> Open
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

      {open && (
        <PlayerDialog
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
          onClose={() => setImporting(false)}
          onImport={async (list) => {
            const res = await source.addPlayers(list);
            changed(res.players, `${res.added} ${res.added === 1 ? "player" : "players"} added to ${team.name}.`);
            setImporting(false);
          }}
        />
      )}
    </section>
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
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function PlayerDialog({
  player,
  onClose,
  onSave,
  onDelete,
}: {
  player: HubPlayer | null;
  onClose: () => void;
  onSave: (p: PlayerInfo) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [p, setP] = useState<PlayerInfo>(() => {
    const base = player ? { ...emptyPlayer(), ...player } : emptyPlayer();
    return { ...base, guardians: base.guardians.length ? base.guardians.map((g) => ({ ...g })) : [emptyGuardian()] };
  });
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
        <h4>Player</h4>
        <div className="hub-row">
          {text("First name", "firstName", { maxLength: HUB_LIMITS.short, autoFocus: true })}
          {text("Last name", "lastName", { maxLength: HUB_LIMITS.short })}
          {text("Jersey #", "jersey", { maxLength: 3, inputMode: "numeric" })}
        </div>
        <div className="hub-row">
          {text("Positions", "positions", { maxLength: HUB_LIMITS.short, placeholder: "QB, S" })}
          {text("Grade", "grade", { maxLength: 20, placeholder: "7th" })}
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
      </form>
    </Modal>
  );
}

function ImportDialog({ room, onClose, onImport }: { room: number; onClose: () => void; onImport: (players: PlayerInfo[]) => Promise<void> }) {
  const [text, setText] = useState("");
  const { busy, error, run } = useSaving();
  const read = useMemo(() => playersFromTable(text), [text]);
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
        Copy the sheet from Excel or Google Sheets (headings in the first row) and paste it below, or open a CSV file. Columns like First name, Last
        name, Jersey, Position, Grade, Birth date, Parent name, Parent phone and Parent email come across on their own.
      </p>
      {error && (
        <p className="hub-error" role="alert">
          {error}
        </p>
      )}
      <label className="field">
        <span>Open a CSV file</span>
        <input
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void file.text().then(setText);
          }}
        />
      </label>
      <label className="field">
        <span>Or paste the rows</span>
        <textarea className="textarea hub-paste" value={text} onChange={(e) => setText(e.target.value)} placeholder={"First name\tLast name\tJersey\tParent name\tParent phone\nMarcus\tHill\t12\tDana Hill\t615-555-0142"} />
      </label>
      {text.trim() && (
        <div className="hub-preview" role="status">
          <b>
            {read.players.length} {read.players.length === 1 ? "player" : "players"} found
          </b>
          {read.players.length > room && <span> · only {room} more fit on this roster</span>}
          {read.skipped.length > 0 && <small>Not brought in: {read.skipped.join(", ")}</small>}
          <ul>
            {take.slice(0, 6).map((p, i) => (
              <li key={i}>
                {p.jersey && `#${p.jersey} `}
                {fullName(p)}
                {p.guardians[0]?.name && <small> · {p.guardians[0].name}</small>}
              </li>
            ))}
            {take.length > 6 && <li>and {take.length - 6} more</li>}
          </ul>
        </div>
      )}
    </Modal>
  );
}
