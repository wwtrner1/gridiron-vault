import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { ACTION_LABEL, BLOCK_IDS, nearMatch, PLAYER_LETTERS, readToNodes, ROUTE_IDS, trustSaidLetters } from "../lib/assistant";
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
  continuous: boolean;
  onresult: (e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void;
  onend: () => void;
  onerror: (e: { error?: string }) => void;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

/** iPhone and iPad Safari: continuous listening is unreliable there, so each phrase restarts the mic. */
const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1));

/** How long the mic waits for more speech before it turns itself off. */
const IDLE_MS = 60000;

/** Spoken edits, so a coach can fix the call without touching the keyboard. */
const VOICE_EDITS: { re: RegExp; edit: "phrase" | "word" | "clear" | "stop" | "read" }[] = [
  { re: /^(scratch|delete|undo|remove) (that|the last (part|phrase|bit))$/, edit: "phrase" },
  { re: /^(delete|remove|back) (the )?last word$/, edit: "word" },
  { re: /^(clear( it| all| everything)?|start over)$/, edit: "clear" },
  { re: /^(done|stop|stop listening|that's it|that is it)$/, edit: "stop" },
  { re: /^(read it|go|draw it)$/, edit: "read" },
];

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
  const [heard, setHeard] = useState("");
  const [micNote, setMicNote] = useState<string | null>(null);
  const recog = useRef<Recognition | null>(null);
  // The coach wants the mic on: browsers end a session after a pause, and it restarts until they say Done.
  const wantMic = useRef(false);
  const idle = useRef<number | undefined>(undefined);
  /** Each spoken phrase added to the call, so "scratch that" takes back exactly the last one. */
  const phrases = useRef<string[]>([]);
  const firstChip = useRef<HTMLSelectElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const Speech = useMemo(speechRecognition, []);

  useEffect(
    () => () => {
      wantMic.current = false;
      window.clearTimeout(idle.current);
      recog.current?.abort?.();
    },
    [],
  );

  async function ask(override?: string) {
    const text = (override ?? call).trim();
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
      setRead(trustSaidLetters(res.read));
      setState("idle");
    } catch (e) {
      setState("error");
      setError({ text: e instanceof Error ? e.message : "The assistant couldn't read that just now." });
    }
  }

  function stopListening(note: string | null = null) {
    wantMic.current = false;
    window.clearTimeout(idle.current);
    recog.current?.stop();
    setListening(false);
    setHeard("");
    setMicNote(note);
  }

  function armIdle() {
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => stopListening("The mic turned off after a minute of quiet. Tap it to keep going."), IDLE_MS);
  }

  // The call as it stands right now, so spoken edits stack correctly between renders.
  const callRef = useRef(call);
  callRef.current = call;
  const edit = (fn: (c: string) => string) => {
    const next = fn(callRef.current);
    callRef.current = next;
    setCall(next);
  };

  /** One finished phrase: a spoken edit, or more of the call. */
  function takePhrase(raw: string) {
    const said = raw.trim();
    if (!said) return;
    const cmd = VOICE_EDITS.find((v) => v.re.test(said.toLowerCase().replace(/[.!?,]/g, "")));
    if (cmd?.edit === "phrase") {
      const last = phrases.current.pop();
      edit((c) => (last && c.endsWith(last) ? c.slice(0, -last.length) : c.replace(/\s*\S+\s*$/, "")).trimEnd());
      return;
    }
    if (cmd?.edit === "word") {
      phrases.current = [];
      edit((c) => c.replace(/\s*\S+\s*$/, ""));
      return;
    }
    if (cmd?.edit === "clear") {
      phrases.current = [];
      edit(() => "");
      return;
    }
    if (cmd?.edit === "stop") {
      stopListening();
      return;
    }
    if (cmd?.edit === "read") {
      stopListening();
      void ask(callRef.current);
      return;
    }
    edit((c) => {
      const piece = c && !/\s$/.test(c) ? ` ${said}` : said;
      phrases.current.push(piece);
      return `${c}${piece}`;
    });
  }

  function startSession() {
    if (!Speech) return;
    // One recognizer for the whole session; iOS chimes and stalls when a new one starts each time.
    const r = recog.current ?? new Speech();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = !isIOS();
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) takePhrase(res[0].transcript);
        else live += res[0].transcript;
      }
      setHeard(live);
      armIdle();
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        stopListening("Your browser blocked the microphone. Allow it for this site in the browser's settings, then tap the mic again.");
      } else if (e.error === "audio-capture") {
        stopListening("No microphone was found. Plug one in or type the call instead.");
      }
      // "no-speech" and "aborted" fall through to onend, which restarts while the coach still wants the mic.
    };
    r.onend = () => {
      setHeard("");
      if (!wantMic.current) {
        setListening(false);
        return;
      }
      window.setTimeout(() => {
        if (!wantMic.current) return;
        try {
          r.start();
        } catch {
          /* already starting — the next end will try again */
        }
      }, 250);
    };
    recog.current = r;
    try {
      r.start();
    } catch {
      /* already running */
    }
  }

  function listen() {
    if (!Speech) return;
    if (listening) {
      stopListening();
      return;
    }
    wantMic.current = true;
    phrases.current = [];
    setMicNote(null);
    setListening(true);
    armIdle();
    startSession();
  }

  /** Delete button: the last spoken phrase if there is one, else the last word. */
  function deleteLast() {
    const last = phrases.current.pop();
    edit((c) => (last && c.endsWith(last) ? c.slice(0, -last.length) : c.replace(/\s*\S+\s*$/, "")).trimEnd());
  }

  const fix = (i: number, patch: Partial<Assignment>) =>
    setRead((r) => r && { ...r, assignments: r.assignments.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  const proposed = useMemo(() => (read ? readToNodes(read, tokens, scene.losY, nextZ) : []), [read, tokens, scene.losY, nextZ]);
  // Anyone the call gave a job who still isn't on the field, so no route goes missing quietly.
  const missing = useMemo(() => {
    if (!read) return [];
    const on = new Set(proposed.flatMap((n) => (n.kind === "player" && n.label ? [n.label.toUpperCase()] : [])));
    return [...new Set(read.assignments.map((a) => a.player.toUpperCase()))].filter((l) => !on.has(l));
  }, [read, proposed]);
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
        <span className="pa-field">
          <input
            ref={inputRef}
            className="pa-input"
            type="text"
            aria-label="Play call"
            placeholder={listening ? "Listening… say the call" : "Type or say a call, e.g. Trips Right Bunch, X Bubble"}
            value={call}
            maxLength={400}
            enterKeyHint="go"
            onChange={(e) => setCall(e.target.value)}
          />
          {call && (
            <button
              type="button"
              className="pa-clear"
              onClick={() => {
                phrases.current = [];
                setCall("");
                inputRef.current?.focus({ preventScroll: true });
              }}
              aria-label="Clear the call"
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </span>
        {Speech && (
          <button
            type="button"
            className={`pa-mic${listening ? " is-on" : ""}`}
            onClick={listen}
            aria-label={listening ? "Done talking — turn the mic off" : "Speak a play call"}
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

      {listening && (
        <div className="pa-listen" role="status" aria-live="polite">
          <span className="pa-dot" aria-hidden="true" />
          <span className="pa-heard">
            {heard ? <>Hearing: <em>{heard}</em></> : "Listening. Keep talking; the mic stays on until you tap Done."}
          </span>
          <span className="pa-listen-acts">
            <button type="button" className="pa-btn" onClick={deleteLast} disabled={!call}>
              Delete last
            </button>
            <button type="button" className="pa-btn" onClick={() => (phrases.current = [], setCall(""))} disabled={!call}>
              Clear
            </button>
            <button type="button" className="pa-btn is-primary" onClick={() => stopListening()}>
              Done
            </button>
          </span>
          <span className="pa-say">Say “scratch that”, “delete last word”, “clear” or “read it”.</span>
        </div>
      )}
      {micNote && !listening && <p className="pa-error">{micNote}</p>}

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
              <span key={i} className={`pa-chip${a.firstRead ? " is-read" : ""}`} title={a.heard ? `From “${a.heard}”` : undefined}>
                {/* Either half of a chip can be changed: who runs it, and what he runs. */}
                <select
                  className="pa-chip-player"
                  value={a.player.toUpperCase()}
                  aria-label={`Player for ${ACTION_LABEL(a)}`}
                  onChange={(e) => fix(i, { player: e.target.value })}
                >
                  {!PLAYER_LETTERS.some((l) => l.letter === a.player.toUpperCase()) && <option value={a.player.toUpperCase()}>{a.player.toUpperCase()}</option>}
                  {PLAYER_LETTERS.map((l) => (
                    <option key={l.letter} value={l.letter}>
                      {l.letter} · {l.means}
                    </option>
                  ))}
                </select>
                ·
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
                <button
                  type="button"
                  className="pa-chip-x"
                  onClick={() => setRead((r) => r && { ...r, assignments: r.assignments.filter((_, j) => j !== i) })}
                  aria-label={`Remove ${a.player} ${ACTION_LABEL(a)}`}
                >
                  <Icon name="close" size={11} />
                </button>
              </span>
            ))}
            <button
              type="button"
              className="pa-chip pa-chip-add"
              onClick={() =>
                setRead((r) => {
                  if (!r) return r;
                  const used = new Set(r.assignments.map((x) => x.player.toUpperCase()));
                  const free = PLAYER_LETTERS.find((l) => !used.has(l.letter))?.letter ?? "X";
                  return { ...r, assignments: [...r.assignments, { player: free, kind: "route", action: "go", heard: "" }] };
                })
              }
            >
              + Add a player
            </button>
          </div>
          {(read.unsure.length > 0 || missing.length > 0) && (
            <ul className="pa-unsure">
              {missing.map((l) => (
                <li key={`missing-${l}`}>
                  {read.formation} has no {l} here, so {l}'s route isn't drawn. Pick another formation or add {l} after drawing.
                </li>
              ))}
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
              <button type="button" className="pa-btn is-primary" onClick={() => {
                  onDraw(proposed, read);
                  setRead(null);
                }}
              >
                Yes, draw it
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
