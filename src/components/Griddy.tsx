import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { trustSaidLetters } from "../lib/assistant";
import type { AssistantRead } from "../lib/assistant";
import { aiUsage } from "../lib/aiUsage";
import { vaultLooks } from "../lib/bulkEdit";
import { routeSummary } from "../lib/explain";
import { useAuth } from "../lib/auth";
import { useDictation } from "../lib/dictation";
import { GRIDDY, GRIDDY_LIMITS } from "../lib/griddy";
import type { GriddyAction, GriddyContext, GriddyTurn } from "../lib/griddy";
import { currentGame } from "../lib/griddyVault";
import { gateAi } from "../lib/plan";
import type { TokenPreset } from "../lib/presets";
import { store } from "../lib/store";
import { useTerms } from "../lib/terms";
import { useTier } from "../lib/tier";
import type { PlayMeta, Scene, SceneNode } from "../lib/types";
import { GriddyActionCard } from "./GriddyCards";
import { GriddyMascot } from "./GriddyMascot";
import { Icon } from "./Icon";

/** The Designer, when it's open: where Griddy's plays can be drawn straight onto the field. */
export type GriddyDrawer = {
  scene: Scene;
  tokens: TokenPreset[];
  play: NonNullable<GriddyContext["play"]>;
  /** The saved play open in the Designer, if it has been saved. */
  playId: string | null;
  onDraw: (nodes: SceneNode[], read: AssistantRead) => void;
  /** Changes the open field in place, as one undoable step (a bulk edit that includes this play). */
  onEdit: (edit: (scene: Scene) => Scene, label: string) => void;
  /** Renames or recategorizes the open play (a flip turns "Trips Right" into "Trips Left"). */
  onMeta: (patch: Partial<Pick<PlayMeta, "name" | "formation" | "playType" | "tags">>) => void;
};

type GriddyValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  turns: GriddyTurn[];
  busy: boolean;
  error: { text: string; plans?: boolean; signIn?: boolean } | null;
  /** Sends a coach message; false when it didn't go (the composer keeps the text). */
  send: (text: string) => Promise<boolean>;
  reset: () => void;
  /** What happened to one of Griddy's cards, told to him with the coach's next message. */
  outcomes: Record<string, string>;
  setOutcome: (actionId: string, outcome: string) => void;
  drawer: GriddyDrawer | null;
  setDrawer: (drawer: GriddyDrawer | null) => void;
  dancing: boolean;
  dance: () => void;
  /** A quick pick typed into the panel's message box; `n` changes on every pick so the same one can be picked twice. */
  draft: { text: string; n: number } | null;
  prefill: (text: string) => void;
};

const GriddyContextValue = createContext<GriddyValue | null>(null);

export function useGriddy() {
  const ctx = useContext(GriddyContextValue);
  if (!ctx) throw new Error("useGriddy must be used inside GriddyProvider");
  return ctx;
}

const NEEDS_ROUTES = /\b(renam|name|label|diagram|route|describe|identify|called)\w*/i;

/** Plays and playbooks Griddy can search, newest first, and the player looks across all of them. */
function vaultContext(withRoutes: boolean): Pick<GriddyContext, "vault" | "playbooks" | "looks"> {
  const { plays, playbooks } = store.get();
  const books = new Map<string, string[]>();
  for (const b of playbooks) for (const id of b.playIds) books.set(id, [...(books.get(id) ?? []), b.name]);
  return {
    vault: [...plays]
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, GRIDDY_LIMITS.vault)
      .map((p) => ({ id: p.id, name: p.name, formation: p.formation, type: p.playType, field: p.scene.view, tags: p.tags.slice(0, 8), books: (books.get(p.id) ?? []).slice(0, 6), ...(withRoutes ? { routes: routeSummary(p.scene).slice(0, 140) } : {}) })),
    playbooks: playbooks.map((b) => ({ id: b.id, name: b.name, plays: b.playIds.length })),
    looks: vaultLooks(plays),
  };
}

/** One conversation with Griddy for the whole visit: it carries across pages. */
export function GriddyProvider({ children }: { children: React.ReactNode }) {
  const { account } = useAuth();
  const tier = useTier();
  const { terms } = useTerms();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<GriddyTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<GriddyValue["error"]>(null);
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<GriddyDrawer | null>(null);
  const [dancing, setDancing] = useState(false);
  const [draft, setDraft] = useState<GriddyValue["draft"]>(null);
  const prefill = useCallback((text: string) => {
    setOpen(true);
    setDraft((d) => ({ text, n: (d?.n ?? 0) + 1 }));
  }, []);
  const danceTimer = useRef<number | undefined>(undefined);
  // The latest state, so send() never works from a stale render.
  const live = useRef({ turns, outcomes, drawer, busy });
  live.current = { turns, outcomes, drawer, busy };

  const setOutcome = useCallback((id: string, outcome: string) => setOutcomes((o) => ({ ...o, [id]: outcome })), []);

  const dance = useCallback(() => {
    window.clearTimeout(danceTimer.current);
    setDancing(true);
    danceTimer.current = window.setTimeout(() => setDancing(false), 2400);
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim().slice(0, GRIDDY_LIMITS.message);
      if (!text || live.current.busy) return false;
      setOpen(true);
      if (!account) {
        setError({ text: `Sign in to talk to ${GRIDDY}. He comes with every plan.`, signIn: true });
        return false;
      }
      const gate = gateAi(tier, "assistant", aiUsage.used("assistant"));
      if (!gate.ok) {
        setError({ text: gate.reason, plans: true });
        return false;
      }
      const { turns: before, outcomes: done, drawer: d } = live.current;
      const prev = before[before.length - 1];
      const results =
        prev?.role === "griddy" ? prev.actions.flatMap((a) => (done[a.id] ? [{ id: a.id, outcome: done[a.id] }] : [])) : [];
      const turnsNow: GriddyTurn[] = [...before, { role: "coach", text, results }];
      setTurns(turnsNow);
      setBusy(true);
      setError(null);
      try {
        const { reply } = await api.griddy({
          turns: turnsNow.slice(-GRIDDY_LIMITS.turns),
          context: {
            page: document.title.split(" — ")[0] || "GridIronVault",
            game: currentGame(),
            play: d?.play ?? null,
            // What each diagram draws goes along only while the coach is talking about names or routes (it costs tokens).
            ...vaultContext(turnsNow.slice(-6).some((t) => t.role === "coach" && NEEDS_ROUTES.test(t.text))),
          },
          terms: terms.map((t) => ({ term: t.term, means: t.means })),
        });
        aiUsage.add("assistant");
        // The coach's own letters win over Griddy's guess, as they did in the Play assistant.
        const actions: GriddyAction[] = reply.actions.map((a) => (a.tool === "draw_play" ? { ...a, read: trustSaidLetters(a.read) } : a));
        setTurns((t) => [...t, { role: "griddy", text: reply.text, actions }]);
        return true;
      } catch (e) {
        setTurns(before);
        setError({ text: e instanceof Error ? e.message : `${GRIDDY} couldn't answer just now. Try again.` });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [account, tier, terms],
  );

  const reset = useCallback(() => {
    setTurns([]);
    setOutcomes({});
    setError(null);
  }, []);

  useEffect(() => () => window.clearTimeout(danceTimer.current), []);

  const value = useMemo<GriddyValue>(
    () => ({ open, setOpen, turns, busy, error, send, reset, outcomes, setOutcome, drawer, setDrawer, dancing, dance, draft, prefill }),
    [open, turns, busy, error, send, reset, outcomes, setOutcome, drawer, dancing, dance, draft, prefill],
  );

  return (
    <GriddyContextValue.Provider value={value}>
      {children}
      <GriddyLauncher />
      <GriddyPanel />
    </GriddyContextValue.Provider>
  );
}

/**
 * The Designer hands Griddy its field, so his plays draw straight onto it.
 * Only a change to the field or the play's name re-registers; the draw
 * handler is read fresh each time.
 */
export function useGriddyDrawer(opts: {
  scene: Scene;
  tokens: TokenPreset[];
  meta: { name: string; formation: string };
  playId: string | null;
  onDraw: GriddyDrawer["onDraw"];
  onEdit: GriddyDrawer["onEdit"];
  onMeta: GriddyDrawer["onMeta"];
}) {
  const { setDrawer } = useGriddy();
  const handlers = useRef({ onDraw: opts.onDraw, onEdit: opts.onEdit, onMeta: opts.onMeta });
  handlers.current = { onDraw: opts.onDraw, onEdit: opts.onEdit, onMeta: opts.onMeta };
  const { scene, tokens, playId } = opts;
  const { name, formation } = opts.meta;
  useEffect(() => {
    const players = scene.nodes.flatMap((n) => (n.kind === "player" && n.label && !n.hidden ? [n.label] : []));
    const lines = scene.nodes.filter((n) => n.kind === "path").length;
    setDrawer({
      scene,
      tokens,
      play: { name, formation, players, lines },
      playId,
      onDraw: (nodes, read) => handlers.current.onDraw(nodes, read),
      onEdit: (edit, label) => handlers.current.onEdit(edit, label),
      onMeta: (patch) => handlers.current.onMeta(patch),
    });
  }, [scene, tokens, name, formation, playId, setDrawer]);
  useEffect(() => () => setDrawer(null), [setDrawer]);
}

/* ------------------------------------------------------------------ pieces */

/** Pages with their own way in (the Designer's bar) or none at all (signing in). */
const NO_LAUNCHER = ["/signin", "/build", "/team", "/join"];

function GriddyLauncher() {
  const { open, setOpen, dancing } = useGriddy();
  const { pathname } = useLocation();
  if (open || NO_LAUNCHER.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return (
    <button
      type="button"
      className="gd-launch"
      onClick={() => setOpen(true)}
      aria-label={`Ask ${GRIDDY}`}
      aria-expanded={false}
      aria-controls="griddy-panel"
    >
      <GriddyMascot size={34} dancing={dancing} />
      <span aria-hidden="true">Ask {GRIDDY}</span>
    </button>
  );
}

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
  { label: "Ask the coach", text: "What beats Cover 2 in 5v5?" },
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

function GriddyPanel() {
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
              {t.actions.map((a) => (
                <GriddyActionCard key={a.id} action={a} />
              ))}
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
