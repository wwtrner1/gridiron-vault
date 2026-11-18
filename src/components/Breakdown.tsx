import { useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { matchReps, readBreakdown, REP_LIMITS, withReps } from "../lib/breakdown";
import type { RepGroup } from "../lib/breakdown";
import { markUnsynced } from "../lib/playSync";
import { store, useStore } from "../lib/store";
import { parseTable } from "../lib/teamHub";
import { useToast } from "../lib/toast";
import { Modal } from "./Modal";

/**
 * Film breakdown: a play-by-play CSV (Hudl's breakdown export, or a coach's own
 * sheet) read in the browser and tied to Vault plays by name. The coach checks
 * the matches, names the film, and the reps are kept in each play
 * (`scene.film.reps`), where Run play shows what the film says about it. The
 * file itself is never uploaded or kept.
 */
export function Breakdown() {
  const plays = useStore((s) => s.plays);
  const { account } = useAuth();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [film, setFilm] = useState("");
  const [groups, setGroups] = useState<RepGroup[] | null>(null);
  const sorted = useMemo(() => [...plays].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })), [plays]);

  const take = async (file: File) => {
    setError("");
    if (file.size > REP_LIMITS.bytes) return setError(`${file.name} is over 2 MB. Download one game's breakdown at a time.`);
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) return setError(`${file.name} isn't a CSV. In Hudl, download the breakdown data as a CSV (or save your spreadsheet as CSV) and choose that.`);
    const read = readBreakdown(parseTable(await file.text()));
    if (read.error) return setError(read.error);
    if (!plays.length) return setError("Your Vault has no plays to match yet. Add your plays first, then bring the breakdown in.");
    setGroups(matchReps(read.rows, plays));
    setFilm(file.name.replace(/\.[a-z]+$/i, "").replace(/[_-]+/g, " ").trim().slice(0, REP_LIMITS.game));
  };

  const matched = (groups ?? []).filter((g) => g.playId);
  const reps = matched.reduce((a, g) => a + g.reps.length, 0);
  const all = (groups ?? []).reduce((a, g) => a + g.reps.length, 0);
  const playCount = new Set(matched.map((g) => g.playId)).size;

  const keep = async () => {
    if (!groups || !film.trim() || !reps) return;
    // Two film names tied to one play are kept together.
    const byPlay = new Map<string, RepGroup["reps"]>();
    for (const g of matched) byPlay.set(g.playId!, [...(byPlay.get(g.playId!) ?? []), ...g.reps]);
    const updated = [...byPlay].flatMap(([id, list]) => {
      const p = plays.find((x) => x.id === id);
      return p ? [{ ...p, scene: { ...p.scene, film: { ...p.scene.film, reps: withReps(p.scene.film?.reps, film, list) } }, updatedAt: new Date().toISOString() }] : [];
    });
    updated.forEach((p) => store.upsertPlay(p));
    setGroups(null);
    toast(`${reps} ${reps === 1 ? "rep" : "reps"} from ${film.trim()} added to ${updated.length} ${updated.length === 1 ? "play" : "plays"}. Open a play and press Run play to see them.`);
    if (account) {
      for (const p of updated.filter((x) => x.remote)) {
        try {
          await api.updatePlay(p.id, { scene: p.scene });
        } catch {
          markUnsynced(p.id); // the local copy is already updated; it goes to the account once the signal is back
        }
      }
    }
  };

  return (
    <section className="card up-break" aria-labelledby="up-break-h">
      <h3 id="up-break-h">Film breakdown</h3>
      <p>
        Bring in a game's play-by-play as a CSV (Hudl's breakdown download, or your own sheet with a Play column). Each rep is matched to the Vault play with the same name, so every play shows how often you called it and what it gained.
      </p>
      <label className="btn btn-outline btn-sm up-break-pick">
        Choose a breakdown file
        <input
          ref={input}
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void take(file);
          }}
        />
      </label>
      {error && (
        <p className="error-line" role="alert">
          {error}
        </p>
      )}
      <p className="up-break-note">The file is read here in your browser and never uploaded. Only the reps you keep are saved, inside your own plays.</p>

      {groups && (
        <Modal
          title="Match your film to your plays"
          wide
          onClose={() => setGroups(null)}
          footer={
            <>
              <button type="button" className="btn btn-outline" onClick={() => setGroups(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={!reps || !film.trim()} onClick={() => void keep()}>
                {reps ? `Add ${reps} ${reps === 1 ? "rep" : "reps"} to ${playCount} ${playCount === 1 ? "play" : "plays"}` : "Nothing matched yet"}
              </button>
            </>
          }
        >
          <label className="up-field">
            <span>Name this film</span>
            <input className="input" value={film} maxLength={REP_LIMITS.game} placeholder="Week 3 vs Central" onChange={(e) => setFilm(e.target.value)} />
          </label>
          <p className="up-break-sum" role="status">
            {reps} of {all} reps matched to a Vault play. Pick a play for the rest, or leave them out. Bringing the same film in again replaces its reps.
          </p>
          <table className="up-break-table">
            <thead>
              <tr>
                <th scope="col">On film</th>
                <th scope="col">Reps</th>
                <th scope="col">Vault play</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g, gi) => (
                <tr key={g.name} className={g.playId ? "" : "is-open"}>
                  <th scope="row">
                    {g.name}
                    {g.formation && <span> · {g.formation}</span>}
                  </th>
                  <td>{g.reps.length}</td>
                  <td>
                    <select
                      aria-label={`Vault play for ${g.name}`}
                      value={g.playId ?? ""}
                      onChange={(e) => setGroups(groups.map((x, xi) => (xi === gi ? { ...x, playId: e.target.value || null } : x)))}
                    >
                      <option value="">Leave out</option>
                      {sorted.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name || "Untitled play"}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </section>
  );
}
