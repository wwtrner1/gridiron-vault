import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";
import { loadTexts, textContacts } from "../lib/textTeam";
import { loadMyTeam } from "../lib/teamSource";
import "../styles/textTeam.css";

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * My team's way into Text the team: the numbers a coach can text, the big
 * button, and the last texts sent from this browser. `version` changes when
 * the roster does, so the counts stay true.
 */
export function TextTeamCard({ version }: { version: number | string }) {
  // The roster and the history live in this browser; read them again when the roster changes.
  const players = useMemo(() => loadMyTeam().players, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const texts = useMemo(() => loadTexts(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const contacts = textContacts(players, "all").length;

  return (
    <section className="tt-entry" aria-label="Text the team" data-tour="text-team">
      <div className="tt-stats">
        <div className="tt-card tt-stat">
          <b>{players.length}</b>
          <span>Players</span>
        </div>
        <div className="tt-card tt-stat">
          <b>{contacts}</b>
          <span>Text contacts</span>
        </div>
        <div className="tt-card tt-stat">
          <b>{texts.length}</b>
          <span>Texts sent</span>
        </div>
      </div>
      <Link to="/roster/text" className="btn btn-primary tt-cta">
        <Icon name="message" size={20} /> Text the team
      </Link>
      <p className="hint tt-center" style={{ margin: 0 }}>
        Sends from your phone. Parents see your number. Only contacts marked “OK to text” are included.
      </p>
      {texts.length > 0 && (
        <div className="tt-card">
          <div className="tt-recent-head">Last texts</div>
          <ul className="tt-recent">
            {texts.slice(0, 3).map((t) => (
              <li key={t.id}>
                <div className="tt-recent-top">
                  <span>{t.body}</span>
                  <span className="mono">{day(t.at)}</span>
                </div>
                <small>
                  {t.contacts} {t.contacts === 1 ? "contact" : "contacts"} · {t.groups} {t.groups === 1 ? "group" : "groups"}
                </small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
