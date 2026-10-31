import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { api, coachError } from "../../lib/api";
import type { LivePlay } from "../../lib/live";
import { emptyScene } from "../../lib/presets";
import { useToast } from "../../lib/toast";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Plays the staff are drawing together. A play starts here (blank) or from the
 * Designer's Extras menu ("Draw this live with my staff"); everyone on the
 * Front Office opens the same one and sees each other's changes within a few
 * seconds. Drawing together comes with the Staff plan: the director's plan
 * decides, and joining is free.
 */
export function LiveTab({ orgId }: { orgId: string }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [plays, setPlays] = useState<LivePlay[] | null>(null);
  const [allowed, setAllowed] = useState(true);
  const [failed, setFailed] = useState("");
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.livePlays(orgId);
      setPlays(res.plays);
      setAllowed(res.live);
      setFailed("");
    } catch (e) {
      setFailed(coachError(e, "Live plays didn't load. Try again in a minute."));
    }
  }, [orgId]);

  useEffect(() => {
    setPlays(null);
    void load();
  }, [load]);

  const start = async () => {
    try {
      const { play } = await api.startLive(name.trim() || "New live play", emptyScene(), orgId);
      navigate(`/build?live=${play.id}`);
    } catch (e) {
      toast(coachError(e, "The live play didn't start. Try again in a minute."), true);
    }
  };

  const remove = async (p: LivePlay) => {
    if (!window.confirm(`Delete "${p.name}" for everyone on the Front Office? Save a copy to your Vault first if you want to keep it.`)) return;
    try {
      await api.deleteLive(p.id);
      void load();
    } catch (e) {
      toast(coachError(e, "The live play is still there. Try again in a minute."), true);
    }
  };

  if (failed) return <p className="empty" role="alert">{failed}</p>;
  if (!plays) return <p className="muted">Loading live plays…</p>;

  return (
    <section className="fo-section" aria-labelledby="fo-live">
      <h3 id="fo-live">Draw together</h3>
      <p className="muted">
        One play on one field for your whole staff. Everyone who opens it sees each other's changes within a few seconds, and two coaches can move different players at the same time.
      </p>
      {!allowed && (
        <p className="empty" role="status">
          Drawing together comes with the Staff plan. The director's plan decides, and coaches join for free. <Link to="/pricing">See plans</Link>
        </p>
      )}
      <form
        className="fo-row"
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
      >
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name the play (optional)" aria-label="Live play name" maxLength={80} disabled={!allowed} />
        <button type="submit" className="btn btn-primary btn-sm" disabled={!allowed}>
          <Icon name="plus" size={14} /> Start a blank live play
        </button>
      </form>
      <p className="muted">Already have it in your Vault? Open it in the Designer, then Extras, then "Draw this live with my staff".</p>
      {plays.length === 0 ? (
        <p className="empty">Nothing live yet.</p>
      ) : (
        <ul className="fo-list">
          {plays.map((p) => (
            <li key={p.id} className="fo-item">
              <Link to={`/build?live=${p.id}`}>
                <strong>{p.name}</strong>
              </Link>
              <span className="muted">
                {p.updatedBy ? `${p.updatedBy}, ` : ""}
                {when(p.updatedAt)}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove(p)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
