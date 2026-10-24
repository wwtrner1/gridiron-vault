import { useCallback, useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { api } from "../lib/api";
import { gateShare, type Tier } from "../lib/plan";
import { SHARE_LIMITS, shareUrl, toSnapshot, type QuizScore, type ShareInfo } from "../lib/share";
import type { LocalPlaybook } from "../lib/store";
import type { StoredPlay } from "../lib/types";
import { useToast } from "../lib/toast";

/** The QR code for a link, as an SVG path the browser draws without any image request. */
function Qr({ text }: { text: string }) {
  const { path, size } = useMemo(() => {
    const q = qrcode(0, "M");
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { path: d, size: n + 8 };
  }, [text]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="pl-qr" role="img" aria-label="QR code for the player link" shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#0B1524" />
    </svg>
  );
}

/**
 * Hand a playbook to the players: one link (and QR code) that opens it on
 * their phones with no account, plus the Griddy Quiz scores they send back.
 */
export function PlayerLink({
  book,
  plays,
  tier,
  signedIn,
  onUpgrade,
  onClose,
}: {
  book: LocalPlaybook;
  plays: StoredPlay[];
  tier: Tier;
  signedIn: boolean;
  onUpgrade: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [share, setShare] = useState<ShareInfo | null | undefined>(undefined);
  const [scores, setScores] = useState<QuizScore[]>([]);
  const [busy, setBusy] = useState(false);
  const gate = gateShare(tier);

  const load = useCallback(async () => {
    try {
      const { shares } = await api.listShares();
      const mine = shares.find((s) => s.source === book.id) ?? null;
      setShare(mine);
      setScores(mine ? (await api.shareScores(mine.token)).results : []);
    } catch (e) {
      setShare(null);
      toast((e as Error).message);
    }
    // toast is stable for the life of the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  useEffect(() => {
    if (signedIn && gate.ok) void load();
    else setShare(null);
  }, [signedIn, gate.ok, load]);

  const publish = async () => {
    setBusy(true);
    try {
      await api.shareBook(book.id, toSnapshot(book.name, plays));
      toast(share ? "Players now see the latest plays." : "Player link ready. Send it to your team.");
      await load();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!share) return;
    setBusy(true);
    try {
      await api.stopShare(share.token);
      toast("The link is off. Anyone who opens it sees a note to ask you for a new one.");
      setShare(null);
      setScores([]);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const url = share ? shareUrl(share.token) : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied.");
    } catch {
      toast("Couldn't copy. Select the link and copy it.");
    }
  };

  const best = useMemo(() => {
    // Each player's latest score, by name and letter.
    const seen = new Map<string, QuizScore>();
    for (const s of scores) if (!seen.has(`${s.playerName.toLowerCase()}|${s.letter}`)) seen.set(`${s.playerName.toLowerCase()}|${s.letter}`, s);
    return [...seen.values()];
  }, [scores]);

  return (
    <Modal title={`Player link: ${book.name}`} onClose={onClose}>
      {!signedIn ? (
        <p>Sign in to make a player link. Your playbooks stay on this device until you do.</p>
      ) : !gate.ok ? (
        <>
          <p>{gate.reason}</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={onUpgrade}>
            {gate.cta}
          </button>
        </>
      ) : (
        <div className="pl">
          <p>
            Players open this on their phones, pick their letter, and see only their job on every play, animated. They can take the Griddy
            Quiz and you see their scores here. No accounts.
          </p>
          {plays.length === 0 && <p className="note">Add plays to this playbook first.</p>}
          {plays.length > SHARE_LIMITS.plays && (
            <p className="note">A link holds up to {SHARE_LIMITS.plays} plays. This playbook has {plays.length}.</p>
          )}
          {share === undefined && <p role="status">Checking for a link…</p>}
          {share === null && (
            <button type="button" className="btn btn-primary" onClick={publish} disabled={busy || !plays.length}>
              <Icon name="link" size={15} /> Create the player link
            </button>
          )}
          {share && (
            <>
              <div className="pl-row">
                <Qr text={url} />
                <div className="pl-side">
                  <label className="field">
                    <span>Link to send</span>
                    <input className="input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
                  </label>
                  <div className="pl-actions">
                    <button type="button" className="btn btn-primary btn-sm" onClick={copy}>
                      <Icon name="copy" size={14} /> Copy link
                    </button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={publish} disabled={busy}>
                      Update with my latest plays
                    </button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={stop} disabled={busy}>
                      Turn the link off
                    </button>
                  </div>
                  <p className="note">
                    Shows {share.plays} {share.plays === 1 ? "play" : "plays"}, last updated {new Date(share.updatedAt).toLocaleDateString()}. Changes you make
                    to the playbook reach players when you update the link, and the address stays the same.
                  </p>
                </div>
              </div>
              <h3>Griddy Quiz scores</h3>
              {best.length === 0 ? (
                <p className="note">No scores yet. They show up here after a player finishes the quiz.</p>
              ) : (
                <table className="pl-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Letter</th>
                      <th>Score</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {best.map((s) => (
                      <tr key={s.id}>
                        <td>{s.playerName || "No name"}</td>
                        <td>{s.letter}</td>
                        <td>
                          {s.score} of {s.total}
                        </td>
                        <td>{new Date(s.at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
