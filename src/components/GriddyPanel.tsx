import { Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { onboarding } from "../lib/onboarding";
import { useDictation } from "../lib/dictation";
import { GRIDDY, GRIDDY_LIMITS } from "../lib/griddyLimits";
import { lazyPage } from "../lib/lazyPage";
import { GriddyMascot } from "./GriddyMascot";
import { Icon } from "./Icon";
import { useGriddy } from "./Griddy";

/**
 * Griddy's panel and message box. Loaded the first time the panel opens
 * (see GriddyProvider in Griddy.tsx, which holds the conversation).
 */

// The cards (and the bulk edit, import and wristband code behind them) load with Griddy's first answer, not with the panel.
const GriddyActionCard = lazyPage(() => import("./GriddyCards"), "GriddyActionCard");

/**
 * Quick picks: tapping one types it into the message box for the coach to
 * finish or change, rather than sending it, so the blanks are theirs.
 */
export const QUICK_PICKS: { label: string; text: string }[] = [
  { label: "Draw a play", text: "Draw: Trips Right, X bubble, Z go, Y corner" },
  { label: "Recolor a letter", text: "Make every Y in my Vault yellow" },
  { label: "Swap a letter", text: "Take the S out of all my plays and put in an H" },
  { label: "Flip plays", text: "Flip my Trips Right plays to the left" },
  { label: "Route colors", text: "Make all of X's routes red" },
  { label: "Call sheet", text: "Build a call sheet for Saturday: 4 openers, 3 red zone, 2 goal line" },
  { label: "Find plays", text: "Find my plays with a " },
  { label: "Paste a playbook", text: "Add these plays to my Vault:\n" },
  { label: "What beats it", text: "What in my Vault beats Cover 2?" },
  { label: "Game plan", text: "Build a call sheet for a Cover 3 team: 4 openers, 3 third down, 2 red zone" },
  { label: "Scout defense", text: "Make a defense for Trips Right and tag every defender's job" },
  { label: "Gap fits", text: "Tag the gap responsibilities on all my defenses" },
];

/** **bold** in Griddy's answers; everything else is plain text. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

export function GriddyPanel() {
  const { open, setOpen, turns, busy, error, reset, prefill, dancing, drawer } = useGriddy();
  const logRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, busy]);

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
  }, [open]);

  /** Closing hands focus back to the launcher (or the Designer's bar), so a keyboard user keeps their place. */
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".gd-launch, .pa-bar .pa-input")?.focus());
  };

  if (!open) return null;
  return (
    <aside
      id="griddy-panel"
      ref={panelRef}
      // In the Designer the panel opens under its top bar, so Save and Export stay in reach.
      className={`gd-panel${drawer ? " is-designer" : ""}`}
      aria-labelledby="gd-h"
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <header className="gd-head">
        <GriddyMascot size={40} dancing={dancing || busy} />
        <div className="gd-head-text">
          <h2 id="gd-h">{GRIDDY}</h2>
          <p>Your coaching assistant. Ask anything, call a play, or drop in a whole list.</p>
        </div>
        {turns.length > 0 && (
          <button type="button" className="gd-icon-btn" onClick={reset} aria-label="Start a new conversation" title="New conversation">
            <Icon name="plus" size={16} />
          </button>
        )}
        <button type="button" className="gd-icon-btn" onClick={close} aria-label={`Close ${GRIDDY}`}>
          <Icon name="close" size={16} />
        </button>
      </header>

      <div className="gd-log" ref={logRef} role="log" aria-live="polite" aria-label={`Conversation with ${GRIDDY}`}>
        {turns.length === 0 && (
          <div className="gd-hello">
            <p>Hey Coach. Tell me a play and I'll draw it, ask me about the game, or paste a list of plays and I'll put them all in your Vault.</p>
            <div className="gd-starters">
              {QUICK_PICKS.map((q) => (
                <button key={q.label} type="button" className="gd-starter" onClick={() => prefill(q.text)}>
                  <strong>{q.label}</strong> {q.text.trim()}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) =>
          t.role === "coach" ? (
            <div key={i} className="gd-msg is-coach">
              <span className="sr-only">You said: </span>
              {t.text.length > 600 ? `${t.text.slice(0, 600)}… (${t.text.length.toLocaleString()} characters)` : t.text}
            </div>
          ) : (
            <div key={i} className="gd-turn">
              {t.text && (
                <div className="gd-msg is-griddy">
                  <span className="sr-only">{GRIDDY} said: </span>
                  <Rich text={t.text} />
                </div>
              )}
              {t.actions.length > 0 && (
                <Suspense fallback={<p className="gd-msg is-griddy">Getting the card ready…</p>}>
                  {t.actions.map((a) => (
                    <GriddyActionCard key={a.id} action={a} />
                  ))}
                </Suspense>
              )}
            </div>
          ),
        )}
        {busy && (
          <p className="gd-thinking" role="status">
            {GRIDDY} is thinking…
          </p>
        )}
      </div>

      {error && (
        <p className="gd-error" role="alert">
          {error.text} {error.plans && <Link to="/pricing">See plans</Link>}
          {error.signIn && <Link to="/signin">Sign in</Link>}
        </p>
      )}
      <GriddyComposer variant="panel" />
    </aside>
  );
}

/** Where the coach types, talks or drops a file. The panel's is a text area; the Designer's a single line. */
export function GriddyComposer({ variant }: { variant: "panel" | "bar" }) {
  const { send, busy, draft, prefill, setOpen, turns } = useGriddy();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  // A quick pick lands in the panel's box, cursor at the end, ready to finish.
  useEffect(() => {
    if (!draft || variant !== "panel") return;
    setText(draft.text);
    requestAnimationFrame(() => {
      const el = boxRef.current;
      el?.focus();
      el?.setSelectionRange(draft.text.length, draft.text.length);
    });
  }, [draft, variant]);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const go = async (value: string) => {
    if (await send(value)) {
      setText("");
      setFileNote(null);
      mic.forgetPhrases();
    }
  };
  const mic = useDictation(text, setText, (value) => void go(value));

  async function attach(file: File) {
    setFileNote(null);
    // A whiteboard photo goes to the photo review, which reads it play by play.
    if (file.type.startsWith("image/")) {
      setOpen(false);
      navigate("/upload", { state: { photo: file } });
      return;
    }
    if (file.size > 2_000_000) return setFileNote("That file is too big. Paste the plays in, or send a smaller file.");
    const body = (await file.text()).trim();
    if (!body) return setFileNote(`${file.name} is empty.`);
    const room = GRIDDY_LIMITS.message - text.length - file.name.length - 40;
    const next = `${text ? `${text}\n\n` : "Add these plays to my Vault.\n\n"}From ${file.name}:\n${body.slice(0, Math.max(0, room))}`;
    setText(next);
    if (body.length > room) setFileNote(`${file.name} was cut to fit one message. Send the rest after this.`);
    boxRef.current?.focus();
  }

  const box = {
    ref: boxRef,
    className: variant === "panel" ? "gd-input" : "pa-input",
    "aria-label": `Message ${GRIDDY}`,
    placeholder: mic.listening ? "Listening… keep talking" : variant === "panel" ? "Ask Griddy, call a play, or paste a list of plays" : "Call a play or ask Griddy, e.g. Trips Right Bunch, X Bubble",
    value: text,
    maxLength: GRIDDY_LIMITS.message,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      mic.forgetPhrases();
      setText(e.target.value);
    },
  };

  return (
    <div className={variant === "panel" ? "gd-compose" : "pa"}>
      {variant === "panel" && turns.length > 0 && (
        <div className="gd-picks" role="group" aria-label="Quick picks">
          {QUICK_PICKS.map((q) => (
            <button key={q.label} type="button" className="gd-pick" onClick={() => prefill(q.text)} title={q.text.trim()}>
              {q.label}
            </button>
          ))}
        </div>
      )}
      <form
        className={variant === "panel" ? "gd-compose-row" : "pa-bar"}
        onSubmit={(e) => {
          e.preventDefault();
          void go(text);
        }}
      >
        {variant === "bar" && (
          <h2 className="pa-title gd-bar-title">
            <GriddyMascot size={22} /> {GRIDDY}
          </h2>
        )}
        <span className={variant === "panel" ? "gd-field" : "pa-field"}>
          {variant === "panel" ? (
            <textarea
              {...box}
              rows={Math.min(6, Math.max(2, text.split("\n").length))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void go(text);
                }
              }}
            />
          ) : (
            <input {...box} type="text" enterKeyHint="send" />
          )}
          {text && (
            <button type="button" className="pa-clear" onClick={mic.clear} aria-label="Clear the message">
              <Icon name="close" size={14} />
            </button>
          )}
        </span>
        {variant === "panel" && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.csv,.md,text/plain,text/csv,text/markdown,image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void attach(f);
              }}
            />
            <button type="button" className="gd-icon-btn" onClick={() => fileRef.current?.click()} aria-label="Attach a list of plays (text or CSV) or a whiteboard photo" title="Attach a list of plays or a whiteboard photo">
              <Icon name="upload" size={16} />
            </button>
          </>
        )}
        {mic.supported && (
          <button
            type="button"
            className={`pa-mic${mic.listening ? " is-on" : ""}`}
            onClick={mic.toggle}
            aria-label={mic.listening ? "Done talking — turn the mic off" : `Talk to ${GRIDDY}`}
            aria-pressed={mic.listening}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
        )}
        <button type="submit" className="pa-btn is-primary gd-send" disabled={!text.trim() || busy}>
          {busy ? "…" : "Send"}
        </button>
      </form>

      {mic.listening && (
        <div className="pa-listen" role="status" aria-live="polite">
          <span className="pa-dot" aria-hidden="true" />
          <span className="pa-heard">
            {mic.heard ? (
              <>
                Hearing: <em>{mic.heard}</em>
              </>
            ) : (
              "Listening. Keep talking; the mic stays on until you tap Done."
            )}
          </span>
          <span className="pa-listen-acts">
            <button type="button" className="pa-btn" onClick={mic.deleteLast} disabled={!text}>
              Delete last
            </button>
            <button type="button" className="pa-btn" onClick={mic.clear} disabled={!text}>
              Clear
            </button>
            <button type="button" className="pa-btn is-primary" onClick={() => mic.stop()}>
              Done
            </button>
          </span>
          <span className="pa-say">Say “scratch that”, “delete last word”, “clear” or “send it”.</span>
        </div>
      )}
      {mic.note && !mic.listening && <p className="pa-error">{mic.note}</p>}
      {fileNote && <p className="pa-error">{fileNote}</p>}
    </div>
  );
}
