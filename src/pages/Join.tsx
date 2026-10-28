import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { consentWording } from "../lib/teamHub";
import "../styles/team.css";

/**
 * Where a parent, guardian or older player signs up for a team's texts
 * (`/join/:token`, from the coach). They type their own number and tick the
 * box themselves: that is the opt-in carriers check before they deliver team
 * texts. No account, no Shell, no Griddy launcher.
 */
export function Join() {
  const { token = "" } = useParams();
  const [team, setTeam] = useState<{ team: string; org: string } | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [player, setPlayer] = useState("");
  const [phone, setPhone] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState<"new" | "texted" | "again" | null>(null);

  useEffect(() => {
    let live = true;
    api
      .joinInfo(token)
      .then((t) => live && setTeam(t))
      .catch((e: Error) => live && setError(e.message));
    return () => void (live = false);
  }, [token]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem("");
    try {
      const r = await api.join(token, { name, player, phone, consent: agree });
      setDone(r.again ? "again" : r.confirmed ? "texted" : "new");
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="tm">
      <header className="tm-brand">
        <img src="/brand/lockup-horizontal.webp" alt="GridIronVault" height={30} />
      </header>
      {error ? (
        <div className="tm-note">
          <h1>This link isn't working</h1>
          <p>{error}</p>
        </div>
      ) : !team ? (
        <p className="tm-note" role="status">
          Opening the sign-up…
        </p>
      ) : done ? (
        <div role="status">
          <h1 className="tm-title">You're on the list</h1>
          <p className="tm-sub">
            {done === "again"
              ? `That number was already signed up for ${team.team} texts. We've updated your details.`
              : `You'll get ${team.team} updates by text.${done === "texted" ? " A confirmation text is on its way." : ""} Reply STOP to any text to stop them.`}
          </p>
        </div>
      ) : (
        <form className="jn" onSubmit={send}>
          <h1 className="tm-title">{team.team} team texts</h1>
          <p className="tm-sub">
            Get game times, schedule changes and cancellations from the {team.team} coaches{team.org ? ` (${team.org})` : ""} by text.
          </p>
          {problem && (
            <p className="jn-error" role="alert">
              {problem}
            </p>
          )}
          <label className="jn-field">
            <span>Your name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" required />
          </label>
          <label className="jn-field">
            <span>Player's name</span>
            <input className="input" value={player} onChange={(e) => setPlayer(e.target.value)} maxLength={80} placeholder="Leave blank if you're the player" />
          </label>
          <label className="jn-field">
            <span>Mobile number</span>
            <input className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} autoComplete="tel" placeholder="(615) 555-0142" required />
          </label>
          <label className="jn-consent">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>{consentWording(team.team)}</span>
          </label>
          <p className="jn-legal">
            See our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>. We never sell or share your number.
          </p>
          <button type="submit" className="btn btn-primary" disabled={busy || !agree}>
            {busy ? "Signing up…" : "Sign me up for team texts"}
          </button>
        </form>
      )}
    </main>
  );
}
