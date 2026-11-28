import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";
import { loadTexts, tally, TEAM_TEXTS_LOCKED, textContacts } from "../lib/textTeam";
import { loadMyTeam } from "../lib/teamSource";
import { useTeamTexts } from "../lib/useTeamTexts";
import "../styles/textTeam.css";

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * My team's way into Text the team: who a text reaches, the big button, and
 * the last texts. With texting from GridIronVault on, that's the families who
 * signed up and the texts sent from GridIronVault's number (on any device);
 * otherwise the roster's "OK to text" numbers and the texts opened in Messages
 * from this browser. `version` changes when the roster does, so the counts
 * stay true.
 */
export function TextTeamCard({ version }: { version: number | string }) {
  // The roster and the phone history live in this browser; read them again when the roster changes.
  const team = useMemo(() => loadMyTeam(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const players = team.players;
  const local = useMemo(() => loadTexts(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const teamTexts = useTeamTexts(team.id);
  const server = teamTexts.texts;
  const live = Boolean(server?.sms);
  const contacts = live ? server!.signups.length : textContacts(players, "all").length;
  const texts = live
    ? server!.texts.map((t) => {
        const n = tally(t.recipients);
        return { id: t.id, at: t.at, body: t.body, note: `${n.delivered + n.sent + n.sending} of ${t.recipients.length} reached` };
      })
    : local.map((t) => ({ id: t.id, at: t.at, body: t.body, note: `${t.contacts} ${t.contacts === 1 ? "contact" : "contacts"} · opened in Messages` }));

  // Sideline and signed-out visitors get no texting (Wes 2026-11-25): the card offers the upgrade instead.
  if (teamTexts.locked)
    return (
      <section className="tt-entry" aria-label="Text the team" data-tour="text-team">
        <div className="tt-card tt-upsell">
          <span className="pill pill-violet">HEAD COACH</span>
          <h3>Text every family in one tap.</h3>
          <p>{TEAM_TEXTS_LOCKED}</p>
          <Link to="/pricing">See plans</Link>
        </div>
      </section>
    );

  return (
    <section className="tt-entry" aria-label="Text the team" data-tour="text-team">
      <div className="tt-stats">
        <div className="tt-card tt-stat">
          <b>{players.length}</b>
          <span>Players</span>
        </div>
        <div className="tt-card tt-stat">
          <b>{contacts}</b>
          <span>{live ? "Signed up" : "Text contacts"}</span>
        </div>
        <div className="tt-card tt-stat">
          <b>{texts.length}</b>
          <span>{live ? "Texts sent" : "Texts opened"}</span>
        </div>
      </div>
      <Link to="/roster/text" className="btn btn-primary tt-cta">
        <Icon name="message" size={20} /> Text the team
      </Link>
      <p className="hint tt-center" style={{ margin: 0 }}>
        {live
          ? "One tap sends it from GridIronVault's team number to every family who signed up on your team's link."
          : "Sends from your phone. Parents see your number. Only contacts marked “OK to text” are included."}
      </p>
      {texts.length > 0 && (
        <div className="tt-card">
          <div className="tt-recent-head">
            Last texts
            <Link to="/roster/text?view=history" className="tt-recent-all">
              See all
            </Link>
          </div>
          <ul className="tt-recent">
            {texts.slice(0, 3).map((t) => (
              <li key={t.id}>
                <div className="tt-recent-top">
                  <span>{t.body}</span>
                  <span className="mono">{day(t.at)}</span>
                </div>
                <small>{t.note}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
