import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Shell } from "../components/Shell";
import { HUB_LIMITS } from "../lib/teamHub";
import { useAuth } from "../lib/auth";
import { loadMyTeam, localSource, MY_TEAM_ID, onMyTeam, saveMyTeam } from "../lib/teamSource";
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
  const source = useMemo(localSource, []);
  const [info, setInfo] = useState(() => {
    const t = loadMyTeam();
    return { name: t.name, level: t.level, season: t.season };
  });
  // The tabs reload from the source when this changes, so the header count stays true.
  const [count, setCount] = useState(() => loadMyTeam().players.length);
  const { account } = useAuth();
  // The account's newer copy arrived after sign-in: show it.
  const [version, setVersion] = useState(0);
  useEffect(
    () =>
      onMyTeam((from) => {
        if (from !== "account") return;
        const t = loadMyTeam();
        setInfo({ name: t.name, level: t.level, season: t.season });
        setCount(t.players.length);
        setVersion((v) => v + 1);
      }),
    [],
  );

  const rename = (patch: Partial<typeof info>) => {
    const next = { ...info, ...patch };
    setInfo(next);
    try {
      saveMyTeam({ ...loadMyTeam(), ...next, name: next.name.trim() ? next.name : "My team" });
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const team = { id: MY_TEAM_ID, name: info.name.trim() || "My team", allCoaches: false };

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
          key={version}
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
        <DepthTab key={version} team={team} source={source} />
      )}

      <p className="hint myteam-foot">
        Coaching more than one team, or sharing the roster with assistant coaches? A <Link to="/front-office">Front Office</Link> holds a
        roster per team for your whole staff, and its Import spreadsheet takes the CSV you download here.
      </p>
    </Shell>
  );
}
