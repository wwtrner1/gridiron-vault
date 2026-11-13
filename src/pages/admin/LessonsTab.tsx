import { useEffect, useState } from "react";
import { api } from "../../lib/api";

type Lesson = { kind: string; from: string; to: string; coaches: number; times: number; off: boolean; live: boolean };

const say = (l: Lesson) =>
  l.kind === "letter" ? `A board mark "${l.from}" means ${l.to}` : `A line read as "${l.from.replace(/_/g, " ")}" was really "${l.to.replace(/_/g, " ")}"`;

/**
 * The reader's memory across coaches (netlify/ai/lessons.ts): every fix
 * coaches made to scanned plays, how many coaches made it, and whether it
 * goes into everyone's reads (three or more coaches, not switched off).
 */
export function LessonsTab() {
  const [list, setList] = useState<Lesson[] | null>(null);
  const [error, setError] = useState("");
  const load = () =>
    api
      .admin<{ lessons: Lesson[] }>("lessons")
      .then((r) => setList(r.lessons))
      .catch((e) => setError(e instanceof Error ? e.message : "The reader's memory didn't load."));
  useEffect(() => {
    void load();
  }, []);

  const act = async (l: Lesson, what: "switch" | "purge") => {
    try {
      await api.admin(`lessons/${what}`, { method: "POST", body: JSON.stringify({ kind: l.kind, from: l.from, to: l.to, off: !l.off }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through.");
    }
  };

  if (error) return <p className="adm-note adm-bad">{error}</p>;
  if (!list) return <p className="hint">Loading the reader's memory…</p>;
  return (
    <div className="adm-arch">
      <p className="hint" style={{ margin: 0 }}>
        Each coach's fixes go into their own next reads at once. A fix goes into every coach's reads (and Griddy's) once three or more
        coaches have made it. Switch one off to keep it out of everyone's, or purge it to forget it everywhere.
      </p>
      <div className="adm-scroll">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Lesson</th>
              <th>Coaches</th>
              <th>Fixes</th>
              <th>In everyone's reads</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((l) => (
              <tr key={`${l.kind}|${l.from}|${l.to}`}>
                <td>{say(l)}</td>
                <td>{l.coaches}</td>
                <td>{l.times}</td>
                <td>{l.off ? "Switched off" : l.live ? "Yes" : `Not yet (needs 3 coaches)`}</td>
                <td>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => act(l, "switch")}>
                    {l.off ? "Switch on" : "Switch off"}
                  </button>{" "}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => act(l, "purge")}>
                    Purge
                  </button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={5}>No fixes yet. They appear as coaches check scanned plays.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
