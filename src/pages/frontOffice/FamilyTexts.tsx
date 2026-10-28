import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Panel } from "../../components/Panel";
import { api, type TextList } from "../../lib/api";
import { showPhone, type HubTeam } from "../../lib/teamHub";
import { useToast } from "../../lib/toast";

/**
 * The team's family texts sign-up link and who has signed up. Families add
 * themselves on `/join/:token`; carriers only deliver team texts to numbers
 * that opted in that way, so a coach can share the link or take someone off,
 * but never add a number.
 */
export function FamilyTexts({ team, list, onChange }: { team: HubTeam; list: TextList; onChange: (next: TextList) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const link = `${window.location.origin}/join/${list.token}`;

  const run = (job: Promise<TextList>, note: string) => {
    setBusy(true);
    job
      .then((next) => {
        onChange(next);
        toast(note);
      })
      .catch((e: Error) => toast(e.message))
      .finally(() => setBusy(false));
  };

  return (
    <Panel title="Family texts sign-up" icon="phone" count={list.signups.length} defaultOpen={list.signups.length === 0}>
      <p className="hint">
        Send this link to {team.name} families (team email, registration form, first-practice handout). Each parent, guardian or older player signs up their own
        mobile number. Only they can add a number, because phone carriers block team texts to anyone who didn't sign up themselves.
      </p>
      <div className="fo-actions">
        <input className="input" readOnly value={link} aria-label="Family texts sign-up link" onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          onClick={() =>
            void navigator.clipboard
              .writeText(link)
              .then(() => toast("Sign-up link copied."))
              .catch(() => toast("This browser blocked copying. Select the link and copy it."))
          }
        >
          <Icon name="copy" size={13} /> Copy link
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={busy}
          onClick={() => {
            if (window.confirm("Make a new link? The old one stops working. Everyone already signed up stays on the list.")) run(api.textSignups(team.id, true), "New sign-up link ready.");
          }}
        >
          New link
        </button>
      </div>
      {!list.sms && <p className="hint">Texting from GridIronVault isn't switched on yet. Families can sign up now, and they'll get texts once it is.</p>}
      {list.signups.length > 0 && (
        <ul className="hub-feed">
          {list.signups.map((s) => (
            <li key={s.id}>
              <div className="hub-feed-head">
                <b>{s.name}</b>
                <small>
                  {s.player ? `${s.player} · ` : ""}
                  {showPhone(s.phone)}
                </small>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  aria-label={`Take ${s.name} off team texts`}
                  onClick={() => run(api.removeTextSignup(s.id), `${s.name} is off team texts.`)}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
