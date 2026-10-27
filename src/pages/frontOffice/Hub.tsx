import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { api } from "../../lib/api";
import { HUB_LIMITS, TEAM_COLORS, type HubState, type HubTeam } from "../../lib/teamHub";
import { useToast } from "../../lib/toast";
import { DepthTab } from "./DepthTab";
import { FilesTab } from "./FilesTab";
import { MessagesTab } from "./MessagesTab";
import { RosterTab } from "./RosterTab";
import { ScheduleTab } from "./ScheduleTab";

export type HubTab = "roster" | "depth" | "schedule" | "messages" | "files";

/**
 * The team hub for one organisation: the team picker (the director adds teams
 * and picks each staff) and the open tab for the picked team.
 */
export function Hub({ orgId, tab, teamId, onTeam }: { orgId: string; tab: HubTab; teamId: string; onTeam: (id: string) => void }) {
  const toast = useToast();
  const [hub, setHub] = useState<HubState | null>(null);
  const [failed, setFailed] = useState("");
  const [editing, setEditing] = useState<HubTeam | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      setHub(await api.hub(orgId));
      setFailed("");
    } catch (e) {
      setFailed((e as Error).message);
    }
  }, [orgId]);

  useEffect(() => {
    setHub(null);
    void load();
  }, [load]);

  const team = hub?.teams.find((t) => t.id === teamId) ?? hub?.teams[0] ?? null;
  const director = hub?.role === "director";

  if (failed && !hub)
    return (
      <div className="empty empty-sm" role="alert">
        <p>{failed}</p>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  if (!hub) return <p role="status">Opening your teams…</p>;

  return (
    <div className="hub">
      <div className="hub-teams" role="group" aria-label="Teams">
        {hub.teams.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`hub-team${team?.id === t.id ? " is-on" : ""}`}
            aria-pressed={team?.id === t.id}
            onClick={() => onTeam(t.id)}
            style={{ "--team": t.color || TEAM_COLORS[0] } as React.CSSProperties}
          >
            <span className="hub-dot" aria-hidden="true" />
            <span>
              <b>{t.name}</b>
              <small>
                {[t.level, t.season].filter(Boolean).join(" · ") || "Team"} · {t.players} {t.players === 1 ? "player" : "players"}
              </small>
            </span>
          </button>
        ))}
        {director && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing("new")} disabled={hub.teams.length >= HUB_LIMITS.teams}>
            <Icon name="plus" size={14} /> Add team
          </button>
        )}
        {director && team && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(team)} aria-label={`Team settings for ${team.name}`}>
            <Icon name="pencil" size={14} /> Team settings
          </button>
        )}
      </div>

      {!team ? (
        <div className="empty empty-sm">
          <Icon name="users" size={30} />
          <h3>{director ? "Add your first team" : "No team yet"}</h3>
          <p>
            {director
              ? "A team holds its roster, depth chart, schedule, messages and files. Add one for each squad you run, then put your coaches on its staff."
              : `Your director hasn't put you on a team's staff in ${hub.org.name} yet. Once they do, its roster and schedule open here.`}
          </p>
          {director && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>
              <Icon name="plus" size={14} /> Add a team
            </button>
          )}
        </div>
      ) : (
        <>
          {tab === "roster" && <RosterTab key={team.id} team={team} onCount={() => void load()} />}
          {tab === "depth" && <DepthTab key={team.id} team={team} />}
          {tab === "schedule" && <ScheduleTab key={team.id} hub={hub} team={team} />}
          {tab === "messages" && <MessagesTab key={team.id} hub={hub} team={team} />}
          {tab === "files" && <FilesTab key={team.id} hub={hub} team={team} />}
        </>
      )}

      {editing && (
        <TeamDialog
          team={editing === "new" ? null : editing}
          hub={hub}
          onClose={() => setEditing(null)}
          onSaved={(next, created) => {
            setHub(next);
            setEditing(null);
            if (created) onTeam(created);
          }}
          onError={toast}
        />
      )}
    </div>
  );
}

function TeamDialog({
  team,
  hub,
  onClose,
  onSaved,
  onError,
}: {
  team: HubTeam | null;
  hub: HubState;
  onClose: () => void;
  onSaved: (hub: HubState, created?: string) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Partial<HubTeam>>(
    team ?? { name: "", level: "", season: String(new Date().getFullYear()), color: TEAM_COLORS[hub.teams.length % TEAM_COLORS.length], coachIds: [], allCoaches: true },
  );
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<HubTeam>) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    setBusy(true);
    try {
      if (team) onSaved(await api.updateTeam(team.id, draft));
      else {
        const res = await api.createTeam(hub.org.id, draft);
        onSaved(res, res.created);
      }
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!team) return;
    setBusy(true);
    try {
      onSaved(await api.deleteTeam(team.id));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ids = new Set(draft.coachIds ?? []);
  return (
    <Modal
      title={team ? `${team.name} settings` : "Add a team"}
      onClose={onClose}
      footer={
        <>
          {team && !confirmDelete && (
            <button type="button" className="btn btn-quiet hub-left" onClick={() => setConfirmDelete(true)} disabled={busy}>
              <Icon name="trash" size={14} /> Remove team
            </button>
          )}
          {team && confirmDelete && (
            <button type="button" className="btn btn-danger hub-left" onClick={() => void remove()} disabled={busy}>
              Yes, remove {team.name} and its roster
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || !draft.name?.trim()}>
            {team ? "Save team" : "Add team"}
          </button>
        </>
      }
    >
      <form
        className="hub-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="field">
          <span>Team name</span>
          <input className="input" value={draft.name ?? ""} maxLength={HUB_LIMITS.name} onChange={(e) => set({ name: e.target.value })} placeholder="Eagles" required />
        </label>
        <div className="hub-row">
          <label className="field">
            <span>Level or age group</span>
            <input className="input" value={draft.level ?? ""} maxLength={HUB_LIMITS.short} onChange={(e) => set({ level: e.target.value })} placeholder="Varsity, JV, U10" />
          </label>
          <label className="field">
            <span>Season</span>
            <input className="input" value={draft.season ?? ""} maxLength={HUB_LIMITS.short} onChange={(e) => set({ season: e.target.value })} placeholder="Fall 2026" />
          </label>
        </div>
        <fieldset className="hub-colors">
          <legend>Team color</legend>
          {TEAM_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`hub-swatch${draft.color === c ? " is-on" : ""}`}
              style={{ background: c }}
              aria-label={`Color ${c}`}
              aria-pressed={draft.color === c}
              onClick={() => set({ color: c })}
            />
          ))}
        </fieldset>
        <fieldset className="hub-staff">
          <legend>Staff (who can see this roster)</legend>
          <label className="check">
            <input type="checkbox" checked={Boolean(draft.allCoaches)} onChange={(e) => set({ allCoaches: e.target.checked })} /> Every coach in {hub.org.name}
          </label>
          {!draft.allCoaches &&
            (hub.coaches.length ? (
              hub.coaches.map((c) => (
                <label className="check" key={c.id}>
                  <input
                    type="checkbox"
                    checked={ids.has(c.id)}
                    onChange={(e) => {
                      const next = new Set(ids);
                      if (e.target.checked) next.add(c.id);
                      else next.delete(c.id);
                      set({ coachIds: [...next] });
                    }}
                  />{" "}
                  {c.name || c.email}
                  {!c.active && <small> (invited, not joined yet)</small>}
                </label>
              ))
            ) : (
              <p className="hint">Invite coaches on the Playbooks &amp; coaches tab, then pick them here.</p>
            ))}
          <p className="hint">You always see every team. Rosters hold players' contacts and medical notes, so only put coaches on the staff who need them.</p>
        </fieldset>
      </form>
    </Modal>
  );
}
