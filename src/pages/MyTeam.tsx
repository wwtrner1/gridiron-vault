import { useEffect, useMemo, useState } from "react";
import { Confirm } from "../components/Confirm";
import { Modal } from "../components/Modal";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Shell } from "../components/Shell";
import { TeamBrand } from "../components/TeamBrand";
import { TextTeamCard } from "../components/TextTeamCard";
import { HUB_LIMITS, MY_TEAMS_MAX } from "../lib/teamHub";
import { useAuth } from "../lib/auth";
import { addMyTeam, currentTeamId, loadMyTeam, loadMyTeams, localSource, onMyTeam, pickMyTeam, removeMyTeam, saveMyTeam } from "../lib/teamSource";
import { useToast } from "../lib/toast";
import { DepthTab } from "./frontOffice/DepthTab";
import { RosterTab } from "./frontOffice/RosterTab";
import "../styles/frontOffice.css";

const TABS = [
  { id: "roster", label: "Roster", icon: "users" },
  { id: "depth", label: "Depth chart", icon: "ladder" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/**
 * My team: one coach's own roster and depth chart, no Front Office needed.
 * It uses the Front Office's Roster and Depth chart screens over a team kept
 * in this browser, and its starters fill the Assignments roster.
 */
export function MyTeam() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "depth" ? "depth" : "roster";
  // The team open in this browser; a coach can keep several (U10, U12, the spring 7v7 team).
  const [teamId, setTeamId] = useState(() => currentTeamId());
  const [teams, setTeams] = useState(() => loadMyTeams().teams.map((t) => ({ id: t.id, name: t.name, players: t.players.length })));
  const source = useMemo(() => localSource(teamId), [teamId]);
  const infoOf = (id: string) => {
    const t = loadMyTeam(id);
    return { name: t.name, level: t.level, season: t.season };
  };
  const [info, setInfo] = useState(() => infoOf(teamId));
  // The tabs reload from the source when this changes, so the header count stays true.
  const [count, setCount] = useState(() => loadMyTeam(teamId).players.length);
  const { account } = useAuth();
  // The account's newer copy arrived after sign-in: show it.
  const [version, setVersion] = useState(0);
  const [naming, setNaming] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);

  const refresh = (id = currentTeamId()) => {
    setTeams(loadMyTeams().teams.map((t) => ({ id: t.id, name: t.name, players: t.players.length })));
    setTeamId(id);
    setInfo(infoOf(id));
    setCount(loadMyTeam(id).players.length);
    setVersion((v) => v + 1);
  };
  useEffect(
    () =>
      onMyTeam((from) => {
        if (from === "account") refresh();
      }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const open = (id: string) => {
    pickMyTeam(id);
    refresh(id);
  };

  const rename = (patch: Partial<typeof info>) => {
    const next = { ...info, ...patch };
    setInfo(next);
    try {
      saveMyTeam({ ...loadMyTeam(teamId), ...next, name: next.name.trim() ? next.name : "My team" });
      setTeams((list) => list.map((t) => (t.id === teamId ? { ...t, name: next.name.trim() || "My team" } : t)));
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const create = (name: string) => {
    try {
      const made = addMyTeam(name);
      setNaming(null);
      refresh(made.id);
      toast(`${made.name} is ready. Add its players below.`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const drop = () => {
    const gone = info.name.trim() || "My team";
    removeMyTeam(teamId);
    setDropping(false);
    refresh();
    toast(`${gone} removed.`);
  };

  const team = { id: teamId, name: info.name.trim() || "My team", allCoaches: false };

  return (
    <Shell title="My team">
      <div className="page-head">
        <div>
          <h2>My team</h2>
          <p>
            Build your roster, set the depth chart, then send your starters to Assignments so every position sheet prints with the right
            name and number. No Front Office needed.
          </p>
        </div>
        <div className="fo-actions">
          <Link to="/assignments" className="btn btn-quiet btn-sm">
            <Icon name="user" size={14} /> Assignments
          </Link>
          <Link to="/front-office" className="btn btn-quiet btn-sm">
            <Icon name="link" size={14} /> Front Office
          </Link>
        </div>
      </div>

      <TextTeamCard version={`${teamId}-${version}-${count}`} />

      <div className="myteam-teams" role="group" aria-label="Your teams">
        {teams.map((t) => (
          <button key={t.id} type="button" className={`chip${t.id === teamId ? " is-on" : ""}`} aria-pressed={t.id === teamId} onClick={() => open(t.id)}>
            {t.id === teamId ? info.name.trim() || "My team" : t.name} <span className="pill">{t.id === teamId ? count : t.players}</span>
          </button>
        ))}
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setNaming("")} disabled={teams.length >= MY_TEAMS_MAX}>
          <Icon name="plus" size={14} /> New team
        </button>
        {(teams.length > 1 || count > 0) && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDropping(true)}>
            <Icon name="trash" size={14} /> Remove this team
          </button>
        )}
      </div>

      <section className="hub-panel myteam-info" aria-label="Team details">
        <label className="field">
          <span>Team name</span>
          <input className="input" value={info.name} maxLength={HUB_LIMITS.name} onChange={(e) => rename({ name: e.target.value })} placeholder="My team" />
        </label>
        <label className="field">
          <span>Level</span>
          <input className="input" value={info.level} maxLength={HUB_LIMITS.short} onChange={(e) => rename({ level: e.target.value })} placeholder="U10, Varsity, Tuesday flag" />
        </label>
        <label className="field">
          <span>Season</span>
          <input className="input" value={info.season} maxLength={HUB_LIMITS.short} onChange={(e) => rename({ season: e.target.value })} placeholder="Fall 2026" />
        </label>
        <p className="hint">
          <span className="pill">{count}</span> {count === 1 ? "player" : "players"}
        </p>
      </section>

      <TeamBrand teamName={team.name} />

      <div className="chip-row hub-tabs" role="tablist" aria-label="My team sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`chip${tab === t.id ? " is-on" : ""}`}
            onClick={() => setParams(t.id === "roster" ? {} : { tab: t.id }, { replace: true })}
          >
            <Icon name={t.icon} size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "roster" ? (
        <RosterTab
          key={`${teamId}-${version}`}
          team={team}
          source={source}
          onCount={() => setCount(loadMyTeam().players.length)}
          privacy={
            account
              ? "Saved in this browser and on your account, so it opens on any device you sign in on. Only you can see it; it is never shared with players or posted publicly."
              : "Saved in this browser only. Sign in to keep it on your account and open it on any device. It is never shared with players or posted publicly."
          }
        />
      ) : (
        <DepthTab key={`${teamId}-${version}`} team={team} source={source} />
      )}

      {naming !== null && (
        <Modal
          title="Start another team"
          onClose={() => setNaming(null)}
          footer={
            <>
              <button type="button" className="btn btn-quiet" onClick={() => setNaming(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => create(naming)}>
                Create team
              </button>
            </>
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create(naming);
            }}
          >
            <label className="field">
              <span>Team name</span>
              <input className="input" autoFocus value={naming} maxLength={HUB_LIMITS.name} onChange={(e) => setNaming(e.target.value)} placeholder="U12 Mustangs, Spring 7v7" />
            </label>
            <p className="hint">Each team keeps its own roster, depth chart and player documents. Switch between them with the buttons above the roster.</p>
          </form>
        </Modal>
      )}
      {dropping && (
        <Confirm title={`Remove ${team.name}?`} action="Remove team" danger onConfirm={drop} onClose={() => setDropping(false)}>
          Its {count} {count === 1 ? "player" : "players"}, depth chart and any documents kept with them go too. This can't be undone; download the roster CSV
          first if you might want it back.
        </Confirm>
      )}

      <p className="hint myteam-foot">
        Sharing a roster with assistant coaches? A <Link to="/front-office">Front Office</Link> holds a roster per team for your whole staff, and its
        Import spreadsheet takes the CSV you download here.
      </p>
    </Shell>
  );
}
