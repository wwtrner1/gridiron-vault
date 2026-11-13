import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { onboarding } from "../lib/onboarding";
import { api, ApiError, isOffline } from "../lib/api";
import type { AssistantRead } from "../lib/assistant";
import { aiUsage } from "../lib/aiUsage";
import { useAuth } from "../lib/auth";
import { griddyFocus } from "../lib/griddyFocus";
import { griddyRoster } from "../lib/griddyRoster";
import { GRIDDY, GRIDDY_LIMITS } from "../lib/griddyLimits";
import type { GriddyAction, GriddyContext, GriddyTurn } from "../lib/griddy";
import { gateAi } from "../lib/plan";
import type { TokenPreset } from "../lib/presets";
import { loadRules } from "../lib/rules";
import { reconcileConnections } from "../lib/scene";
import { store } from "../lib/store";
import { spokenTerms, useStaffTerms, useTerms } from "../lib/terms";
import { useTier } from "../lib/tier";
import type { PlayMeta, Scene, SceneNode, StoredPlay } from "../lib/types";
import { GriddyMascot } from "./GriddyMascot";
import { lazyPage } from "../lib/lazyPage";

// The panel (message box, dictation, quick picks, cards) loads the first time it opens, not with every page;
// lazyPage also fetches it in the background with the screens, so it is there with no signal.
const GriddyPanel = lazyPage(() => import("./GriddyPanel"), "GriddyPanel");

/** The Designer, when it's open: where Griddy's plays can be drawn straight onto the field. */
export type GriddyDrawer = {
  scene: Scene;
  tokens: TokenPreset[];
  play: NonNullable<GriddyContext["play"]>;
  /** The saved play open in the Designer, if it has been saved. */
  playId: string | null;
  onDraw: (nodes: SceneNode[], read: AssistantRead) => void;
  /** Adds nodes to the field as one undoable step and picks them (a defense Griddy laid out). */
  onAdd: (nodes: SceneNode[], label: string) => void;
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
/** Roster talk: only then (or on a roster screen) do the coach's player names go along. */
const NEEDS_ROSTER = /\b(roster|rosters|jerseys?|injur\w*|inactive|kids|athletes?)\b|\b(remove|delete|drop|cut|take off|add|mark)\b[^.?!]*\bplayers?\b/i;
const NEEDS_COVERAGE = /\b(cover(age)?s?|zones?|man|blitz\w*|beats?|beaten|against|quarters|tampa)\b|\bc[0-4]\b/i;

/** What a pass play beats in the Coverage check, cached per play version (each run is a few milliseconds). */
const beatsCache = new Map<string, { at: string; text: string }>();
function beatsOf(p: StoredPlay, rushYards: number, check: typeof import("../lib/coverage")): string {
  if (p.playType !== "pass") return "";
  const hit = beatsCache.get(p.id);
  if (hit && hit.at === p.updatedAt) return hit.text;
  const report = check.checkAll(reconcileConnections(p.scene), { rushYards });
  const text = report.results.some((r) => r.rows.length)
    ? `${report.format}: ${report.results.filter(check.wins).map((r) => r.look.name).join(", ") || "none"}`
    : "";
  beatsCache.set(p.id, { at: p.updatedAt, text });
  return text;
}

/** Plays and playbooks Griddy can search, newest first, and the player looks across all of them. */
function vaultContext(
  vaultLooks: typeof import("../lib/bulkEdit").vaultLooks,
  routeSummary: typeof import("../lib/explain").routeSummary | undefined,
  check?: typeof import("../lib/coverage"),
): Pick<GriddyContext, "vault" | "playbooks" | "looks"> {
  const rush = loadRules().rush || 7;
  const { plays, playbooks } = store.get();
  const books = new Map<string, string[]>();
  for (const b of playbooks) for (const id of b.playIds) books.set(id, [...(books.get(id) ?? []), b.name]);
  return {
    vault: [...plays]
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, GRIDDY_LIMITS.vault)
      .map((p) => ({ id: p.id, name: p.name, formation: p.formation, type: p.playType, field: p.scene.view, tags: p.tags.slice(0, 8), books: (books.get(p.id) ?? []).slice(0, 6), ...(routeSummary ? { routes: routeSummary(p.scene).slice(0, 140) } : {}), ...(check ? { beats: beatsOf(p, rush, check) } : {}) })),
    playbooks: playbooks.map((b) => ({ id: b.id, name: b.name, plays: b.playIds.length })),
    looks: vaultLooks(plays),
  };
}

/**
 * The roster Griddy may change: the one on screen, else My team in this
 * browser while the coach talks about players. Names, numbers and status
 * only; contacts and guardians never leave the page.
 */
async function rosterContext(wanted: boolean): Promise<GriddyContext["roster"]> {
  const shown = griddyRoster();
  let team: string;
  let players: import("../lib/teamHub").HubPlayer[];
  if (shown) ({ team, players } = shown);
  else if (wanted) {
    const { loadMyTeam } = await import("../lib/teamSource");
    const mine = loadMyTeam();
    if (!mine.players.length) return null;
    ({ name: team, players } = mine);
  } else return null;
  return {
    team,
    players: players.slice(0, 150).map((p) => ({
      id: p.id,
      name: [p.firstName, p.lastName].filter(Boolean).join(" "),
      jersey: p.jersey,
      positions: p.positions,
      status: p.status,
    })),
  };
}

/** One conversation with Griddy for the whole visit: it carries across pages. */
export function GriddyProvider({ children }: { children: React.ReactNode }) {
  const { account } = useAuth();
  const tier = useTier();
  const { terms: own } = useTerms();
  const { staff } = useStaffTerms();
  const terms = useMemo(() => spokenTerms(own, staff), [own, staff]);
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
      onboarding.mark("griddy");
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
        const recent = turnsNow.slice(-6).filter((t) => t.role === "coach");
        // What each pass play beats in the Coverage check goes along only while the coach is talking coverages (it costs tokens and time).
        const check = recent.some((t) => NEEDS_COVERAGE.test(t.text)) ? await import("../lib/coverage") : undefined;
        // The route summaries go along only while the coach is talking about names or routes (they cost tokens).
        const explain = recent.some((t) => NEEDS_ROUTES.test(t.text)) ? await import("../lib/explain") : undefined;
        const [{ vaultLooks }, { trustSaidLetters }, { currentGame }, roster] = await Promise.all([
          import("../lib/bulkEdit"),
          import("../lib/assistant"),
          import("../lib/griddyVault"),
          rosterContext(recent.some((t) => NEEDS_ROSTER.test(t.text))),
        ]);
        const { reply } = await api.griddy({
          turns: turnsNow.slice(-GRIDDY_LIMITS.turns),
          context: {
            page: document.title.split(" — ")[0] || "GridIronVault",
            game: currentGame(),
            play: d ? { ...d.play, ...(d.playId ? { id: d.playId } : {}) } : null,
            focus: griddyFocus(),
            roster,
            ...vaultContext(vaultLooks, explain?.routeSummary, check),
          },
          terms: terms.map((t) => ({ term: t.term, means: t.means })),
        });
        // A reply without its parts (a cut-off or odd answer) reads as "try again", never a script error.
        if (!reply || typeof reply.text !== "string" || !Array.isArray(reply.actions)) throw new Error("bad reply");
        aiUsage.add("assistant");
        // The coach's own letters win over Griddy's guess, as they did in the Play assistant.
        const actions: GriddyAction[] = reply.actions.map((a) => (a.tool === "draw_play" ? { ...a, read: trustSaidLetters(a.read) } : a));
        setTurns((t) => [...t, { role: "griddy", text: reply.text, actions }]);
        return true;
      } catch (e) {
        setTurns(before);
        // Only the API's own words reach the coach; a failed download or a script error gets plain wording. The message stays in the box.
        setError({
          text: isOffline(e)
            ? `No signal, so ${GRIDDY} can't answer right now. Your message is still in the box: send it when you're back online.`
            : e instanceof ApiError
              ? e.message
              : `${GRIDDY} couldn't answer just now. Your message is still in the box: try sending it again.`,
        });
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
      {open && (
        <Suspense fallback={null}>
          <GriddyPanel />
        </Suspense>
      )}
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
  onAdd: GriddyDrawer["onAdd"];
  onEdit: GriddyDrawer["onEdit"];
  onMeta: GriddyDrawer["onMeta"];
}) {
  const { setDrawer } = useGriddy();
  const handlers = useRef({ onDraw: opts.onDraw, onAdd: opts.onAdd, onEdit: opts.onEdit, onMeta: opts.onMeta });
  handlers.current = { onDraw: opts.onDraw, onAdd: opts.onAdd, onEdit: opts.onEdit, onMeta: opts.onMeta };
  const { scene, tokens, playId } = opts;
  const { name, formation } = opts.meta;
  useEffect(() => {
    const players = scene.nodes.flatMap((n) => (n.kind === "player" && n.label && !n.hidden && n.side === "offense" ? [n.label] : []));
    const defenders = scene.nodes.filter((n) => n.kind === "player" && !n.hidden && n.side === "defense").length;
    const lines = scene.nodes.filter((n) => n.kind === "path").length;
    setDrawer({
      scene,
      tokens,
      play: { name, formation, players, lines, ...(defenders ? { defenders } : {}), ...(scene.pov === "defense" ? { pov: "defense" as const } : {}) },
      playId,
      onDraw: (nodes, read) => handlers.current.onDraw(nodes, read),
      onAdd: (nodes, label) => handlers.current.onAdd(nodes, label),
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

