import { useEffect, useState } from "react";
import { api, coachError } from "../lib/api";
import { useAuth } from "../lib/auth";

type Lesson = { id: string; kind: string; from: string; to: string; times: number };

const say = (l: Lesson) =>
  l.kind === "letter"
    ? `Your boards write "${l.from}" for the player GridIronVault calls ${l.to}.`
    : `A line that looks like a ${l.from.replace(/_/g, " ")} is often your ${l.to.replace(/_/g, " ")}.`;

/**
 * What the reader learned from this coach's fixes to scanned and photographed
 * plays (netlify/ai/lessons.ts), on Upload: each lesson, and Forget for one
 * or all. Their lessons only shape their own reads.
 */
export function ReaderMemory() {
  const { account } = useAuth();
  const [list, setList] = useState<Lesson[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!account) return;
    api
      .readLessons()
      .then((r) => setList(r.lessons))
      .catch(() => setList(null));
  }, [account]);
  if (!account || !list?.length) return null;

  const forget = async (id?: string) => {
    try {
      await api.forgetLesson(id);
      setList((l) => (id ? (l ?? []).filter((x) => x.id !== id) : []));
    } catch (e) {
      setError(coachError(e, "That didn't reach your account. Try again in a moment."));
    }
  };

  return (
    <section className="card up-memory" aria-labelledby="up-memory-title">
      <div className="re-head">
        <h3 id="up-memory-title">What the reader learned from your fixes</h3>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => forget()}>
          Forget all
        </button>
      </div>
      <p className="pr-note">Every time you fix a scanned play, the next read of your pages follows it. Only your reads use these.</p>
      <ul>
        {list.map((l) => (
          <li key={l.id}>
            <span>
              {say(l)} <span className="mono">×{l.times}</span>
            </span>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => forget(l.id)} aria-label={`Forget: ${say(l)}`}>
              Forget
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p className="error-line" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
