import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { ACTION_LABEL, BLOCK_IDS, nearMatch, readToNodes, ROUTE_IDS } from "../lib/assistant";
import type { Assignment, AssistantRead } from "../lib/assistant";
import type { GameType } from "../lib/formations";
import { aiUsage } from "../lib/aiUsage";
import { gateAi } from "../lib/plan";
import type { TokenPreset } from "../lib/presets";
import { useTerms } from "../lib/terms";
import { useTier } from "../lib/tier";
import type { Scene, SceneNode, StoredPlay } from "../lib/types";
import { useAuth } from "../lib/auth";
import { Icon } from "./Icon";
import { PlayThumb } from "./PlayThumb";

type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};

/** Browser speech-to-text, where the browser has it (Chrome, Edge, Safari). */
function speechRecognition(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const GAME_KEY = "grid1ronvault.formationLib.v1";
function currentGame(): GameType {
  try {
    const g = JSON.parse(localStorage.getItem(GAME_KEY) ?? "{}").game;
    return g === "7v7" || g === "11" ? g : "5v5";
  } catch {
    return "5v5";
  }
}

/**
 * Play assistant, from the Grid1ron Design canvas. The coach types or says a
 * call; the assistant shows how it read each player as chips the coach can
 * fix; nothing reaches the field until "Yes, draw it".
 */
export function PlayAssistant({
  scene,
  tokens,
  plays,
  nextZ,
  onDraw,
}: {
  scene: Scene;
  tokens: TokenPreset[];
  plays: StoredPlay[];
  nextZ: number;
  onDraw: (nodes: SceneNode[], read: AssistantRead) => void;
}) {
  const { account: user } = useAuth();
  const tier = useTier();
  const { terms } = useTerms();
  const [call, setCall] = useState("");
  const [state, setState] = useState<"idle" | "reading" | "error">("idle");
  const [error, setError] = useState<{ text: string; plans?: boolean } | null>(null);
  const [read, setRead] = useState<AssistantRead | null>(null);
  const [listening, setListening] = useState(false);
  const recog = useRef<Recognition | null>(null);
  const firstChip = useRef<HTMLSelectElement>(null);
  const Speech = useMemo(speechRecognition, []);

  useEffect(() => () => recog.current?.stop(), []);

  async function ask() {
    const text = call.trim();
    if (!text) return;
    if (!user) {
      setError({ text: "Sign in to use the Play assistant. It is included with every plan." });
      return;
    }
    const gate = gateAi(tier, "assistant", aiUsage.used("assistant"));
    if (!gate.ok) {
      setError({ text: gate.reason, plans: true });
      return;
    }
    setState("reading");
    setError(null);
    try {
      const res = await api.assistant({
        call: text,
        game: currentGame(),
        terms: terms.map((t) => ({ term: t.term, means: t.means })),
      });
      aiUsage.add("assistant");
      setRead(res.read);
      setState("idle");
    } catch (e) {
      setState("error");
      setError({ text: e instanceof Error ? e.message : "The assistant couldn't read that just now." });
    }
  }

  function listen() {
    if (!Speech) return;
    if (listening) {
      recog.current?.stop();
      return;
    }
    const r = new Speech();
    r.lang = "en-US";
    r.interimResults = false;
    r.onresult = (e) => setCall(e.results[0][0].transcript);
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recog.current = r;
    setListening(true);
    r.start();
  }

  const fix = (i: number, patch: Partial<Assignment>) =>
    setRead((r) => r && { ...r, assignments: r.assignments.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  const proposed = useMemo(() => (read ? readToNodes(read, tokens, scene.losY, nextZ) : []), [read, tokens, scene.losY, nextZ]);
  const match = useMemo(() => (read ? nearMatch(read, plays) : null), [read, plays]);

  return (
    <section className="pa" aria-labelledby="pa-h">
      <form
        className="pa-bar"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <h2 id="pa-h" className="pa-title">
          Play assistant
        </h2>
        <input
          className="pa-input"
          type="text"
          aria-label="Play call"
          placeholder="Type a call, e.g. Trips Right Bunch, Scissors, X Bubble"
          value={call}
          maxLength={400}
          onChange={(e) => setCall(e.target.value)}
        />
        {Speech && (
          <button
            type="button"
            className={`pa-mic${listening ? " is-on" : ""}`}
            onClick={listen}
            aria-label={listening ? "Stop listening" : "Speak a play call"}
            aria-pressed={listening}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
        )}
        <button type="submit" className="dz-top-btn pa-go" disabled={!call.trim() || state === "reading"}>
          {state === "reading" ? "Reading…" : "Read it"}
        </button>
      </form>

      {error && (
        <p className="pa-error" role="alert">
          {error.text} {error.plans && <Link to="/pricing">See plans</Link>}
        </p>
      )}

      {read && (
        <div className="pa-read" aria-live="polite">
          <p className="pa-kicker">Here’s how I read it</p>
          <div className="pa-chips">
            <span className="pa-chip">Formation · {read.formation}</span>
            {read.assignments.length === 0 && <span className="pa-chip">No routes named — the set only</span>}
            {read.assignments.map((a, i) => (
              <label key={i} className={`pa-chip${a.firstRead ? " is-read" : ""}`} title={a.heard ? `From “${a.heard}”` : undefined}>
                {a.player} ·
                <select
                  ref={i === 0 ? firstChip : undefined}
                  value={a.kind === "motion" ? "motion" : a.action}
                  aria-label={`${a.player} assignment`}
                  onChange={(e) => {
                    const v = e.target.value;
                    fix(i, { action: v, kind: v === "motion" ? "motion" : BLOCK_IDS.includes(v) && !ROUTE_IDS.includes(v) ? "block" : "route" });
                  }}
                >
                  <optgroup label="Routes">
                    {ROUTE_IDS.map((r) => (
                      <option key={r} value={r}>
                        {r.replace(/_/g, " ")}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Blocks">
                    {BLOCK_IDS.filter((b) => !ROUTE_IDS.includes(b)).map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </optgroup>
                  <option value="motion">motion</option>
                </select>
                <span className="sr-only">{ACTION_LABEL(a)}</span>
              </label>
            ))}
          </div>
          {read.unsure.length > 0 && (
            <ul className="pa-unsure">
              {read.unsure.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          )}
          <div className="pa-preview">
            <PlayThumb scene={{ ...scene, nodes: proposed }} label={`Preview of ${read.name}`} />
            <span className="pa-badge">Preview · not saved until confirmed</span>
          </div>
          <div className="pa-confirm">
            <span className="pa-q">Is this the play you called?</span>
            {match && (
              <span className="pa-match">
                Near match in your Vault: <Link to={`/build/${match.id}`}>{match.name}</Link>
              </span>
            )}
            <div className="pa-acts">
              <button type="button" className="pa-btn" onClick={() => firstChip.current?.focus()} disabled={!read.assignments.length}>
                Fix a chip
              </button>
              <button type="button" className="pa-btn is-primary" onClick={() => onDraw(proposed, read)}>
                Yes, draw it
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
