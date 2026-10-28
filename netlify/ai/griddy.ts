import type Anthropic from "@anthropic-ai/sdk";
import { GAME_TYPES, type GameType } from "../../src/lib/formations.js";
import {
  GRIDDY_LIMITS,
  GRIDDY_SYSTEM,
  GRIDDY_TOOLS,
  griddyContextText,
  type GriddyAction,
  type GriddyContext,
  type GriddyReply,
  type GriddyRequest,
  type GriddyTurn,
} from "../../src/lib/griddy.js";
import type { AssistantRead } from "../../src/lib/assistant.js";
import { bulkColor, cleanFilter, cleanOpenChange, LETTER, MAX_BULK_CHANGES, MAX_LOOKS, type BulkChange, type BulkScope } from "../../src/lib/bulkEdit.js";
import { normalizeHex } from "../../src/lib/colors.js";
import { MAX_CALL_LINES } from "../../src/lib/griddy.js";
import { AiError, converse, MODELS } from "./claude.js";
import { cleanRead } from "./reads.js";

const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
const TOOL_ID = /^[A-Za-z0-9_-]{1,80}$/;
const TOOL_NAMES = new Set<string>(GRIDDY_TOOLS.map((t) => t.name));

/** The browser's request, checked and trimmed: it is the coach's own history, but still untrusted input. */
function cleanRequest(body: Partial<GriddyRequest>): GriddyRequest {
  const turns = (Array.isArray(body.turns) ? body.turns : []).slice(-GRIDDY_LIMITS.turns).flatMap((t): GriddyTurn[] => {
    if (t?.role === "coach")
      return [
        {
          role: "coach",
          text: str(t.text, GRIDDY_LIMITS.message),
          results: (Array.isArray(t.results) ? t.results : [])
            .filter((r) => TOOL_ID.test(String(r?.id)))
            .slice(0, 8)
            .map((r) => ({ id: String(r.id), outcome: str(r.outcome, 2000) })),
        },
      ];
    if (t?.role === "griddy")
      return [
        {
          role: "griddy",
          text: str(t.text, 6000),
          actions: (Array.isArray(t.actions) ? t.actions : [])
            .filter((a) => a && TOOL_ID.test(String(a.id)) && TOOL_NAMES.has(a.tool))
            .slice(0, 4),
        },
      ];
    return [];
  });
  // The conversation has to open with the coach and end on the coach's new message.
  while (turns.length && turns[0].role !== "coach") turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== "coach") throw new AiError("Say something to Griddy first.", 400);

  const c = (body.context ?? {}) as Partial<GriddyContext>;
  const game: GameType = GAME_TYPES.some((g) => g.id === c.game) ? (c.game as GameType) : "5v5";
  const context: GriddyContext = {
    page: str(c.page, 60) || "GridIronVault",
    game,
    play: c.play
      ? {
          name: str(c.play.name, 120),
          formation: str(c.play.formation, 60),
          players: (Array.isArray(c.play.players) ? c.play.players : []).slice(0, 22).map((p) => str(p, 3)),
          lines: Math.max(0, Math.min(999, Number(c.play.lines) || 0)),
        }
      : null,
    vault: (Array.isArray(c.vault) ? c.vault : []).slice(0, GRIDDY_LIMITS.vault).map((p) => ({
      id: str(p?.id, 64),
      name: str(p?.name, 120),
      formation: str(p?.formation, 60),
      type: str(p?.type, 20),
      field: str(p?.field, 12),
      tags: (Array.isArray(p?.tags) ? p.tags : []).slice(0, 8).map((t) => str(t, 30)),
      books: (Array.isArray(p?.books) ? p.books : []).slice(0, 6).map((b) => str(b, 120)),
      routes: str(p?.routes, 160),
    })),
    playbooks: (Array.isArray(c.playbooks) ? c.playbooks : []).slice(0, 60).map((b) => ({
      id: str(b?.id, 64),
      name: str(b?.name, 120),
      plays: Math.max(0, Number(b?.plays) || 0),
    })),
    looks: (Array.isArray(c.looks) ? c.looks : []).slice(0, MAX_LOOKS).flatMap((l) => {
      const letter = str(l?.letter, 3).trim().toUpperCase();
      const color = normalizeHex(str(l?.color, 10));
      return LETTER.test(letter) && color ? [{ letter, color, plays: Math.max(0, Math.min(100000, Number(l?.plays) || 0)) }] : [];
    }),
  };
  const terms = (Array.isArray(body.terms) ? body.terms : [])
    .slice(0, 80)
    .map((t) => ({ term: str(t?.term, 60), means: str(t?.means, 200) }))
    .filter((t) => t.term);
  return { turns, context, terms };
}

/** The tool call as Claude made it, so the history replays exactly what he did. */
function toolInput(a: GriddyAction): unknown {
  if (a.tool === "draw_play") return a.read;
  if (a.tool === "import_plays") return a.playbook ? { plays: a.plays, playbook: a.playbook } : { plays: a.plays };
  if (a.tool === "build_call_sheet") return { name: a.name, lines: a.lines };
  if (a.tool === "bulk_edit") {
    const scope =
      a.scope.kind === "playbook" ? { scope: "playbook", playbook: a.scope.name } : a.scope.kind === "plays" ? { scope: "plays", ids: a.scope.ids } : { scope: "vault" };
    return { ...scope, ...(a.filter ? { filter: a.filter } : {}), changes: a.changes };
  }
  return { ids: a.ids };
}

/**
 * Turns into Claude messages. Every tool call gets its result at the start of
 * the coach's next message, as the API requires: what the coach did with the
 * card, or that it is still open.
 */
function toMessages(req: GriddyRequest): Anthropic.Beta.BetaMessageParam[] {
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  let pending: GriddyAction[] = [];
  for (const turn of req.turns) {
    if (turn.role === "griddy") {
      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      if (turn.text) content.push({ type: "text", text: turn.text });
      for (const a of turn.actions) content.push({ type: "tool_use", id: a.id, name: a.tool, input: toolInput(a) });
      if (!content.length) content.push({ type: "text", text: "…" });
      messages.push({ role: "assistant", content });
      pending = turn.actions;
      continue;
    }
    const outcomes = new Map((turn.results ?? []).map((r) => [r.id, r.outcome]));
    const content: Anthropic.Beta.BetaContentBlockParam[] = pending.map((a) => ({
      type: "tool_result",
      tool_use_id: a.id,
      content: outcomes.get(a.id) || "Shown to the coach. They haven't acted on it yet.",
    }));
    content.push({ type: "text", text: turn.text || "(no message)" });
    messages.push({ role: "user", content });
    pending = [];
  }
  // What the coach is looking at right now, with operator authority, after their latest words.
  messages.push({ role: "system", content: griddyContextText(req.context, req.terms) });
  return messages;
}

/** Only actions we can check: known tools, known routes, and Vault ids the coach actually has. */
function toActions(uses: Anthropic.Beta.BetaToolUseBlock[], ctx: GriddyContext): GriddyAction[] {
  const vaultIds = new Set(ctx.vault.map((p) => p.id));
  return uses.flatMap((u): GriddyAction[] => {
    const input = (u.input ?? {}) as Record<string, unknown>;
    if (u.name === "draw_play") {
      const read = cleanRead(input as Partial<AssistantRead>, ctx.game, "Griddy's play");
      return [{ id: u.id, tool: "draw_play", read }];
    }
    if (u.name === "import_plays") {
      const plays = (Array.isArray(input.plays) ? input.plays : [])
        .map((p: { name?: unknown; call?: unknown }) => ({ name: str(p?.name, 80).trim(), call: str(p?.call, 400).trim() }))
        .filter((p) => p.call)
        .slice(0, GRIDDY_LIMITS.importPlays)
        .map((p) => ({ ...p, name: p.name || p.call.slice(0, 60) }));
      const playbook = str(input.playbook, 120).trim() || null;
      return plays.length ? [{ id: u.id, tool: "import_plays", plays, playbook }] : [];
    }
    if (u.name === "build_call_sheet") {
      const lines = (Array.isArray(input.lines) ? input.lines : [])
        .filter((l) => l && vaultIds.has(String(l.playId)))
        .slice(0, MAX_CALL_LINES)
        .map((l) => {
          const line: { playId: string; group?: string; down?: string; distance?: string; hash?: string } = { playId: String(l.playId) };
          for (const k of ["group", "down", "distance", "hash"] as const) if (str(l[k], 40).trim()) line[k] = str(l[k], 40).trim();
          return line;
        });
      return lines.length ? [{ id: u.id, tool: "build_call_sheet", name: str(input.name, 80).trim() || "Game plan", lines }] : [];
    }
    if (u.name === "bulk_edit") {
      // Invalid entries are dropped first, so they can't use up the cap on changes.
      const changes = (Array.isArray(input.changes) ? input.changes : []).slice(0, 40).flatMap((c): BulkChange[] => {
        const letter = (v: unknown) => str(v, 3).trim().toUpperCase();
        // "Only the green Xs": a color that doesn't parse would widen the change to every X, so the change is dropped.
        const only = c?.only == null || c.only === "" ? undefined : bulkColor(str(c.only, 30));
        if (only === null) return [];
        const narrow = only ? { only } : {};
        if (c?.op === "recolor") {
          const color = bulkColor(str(c.color, 30));
          return LETTER.test(letter(c.letter)) && color ? [{ op: "recolor", letter: letter(c.letter), color, ...narrow }] : [];
        }
        if (c?.op === "route_color") {
          const color = bulkColor(str(c.color, 30));
          return LETTER.test(letter(c.letter)) && color ? [{ op: "route_color", letter: letter(c.letter), color, ...narrow }] : [];
        }
        if (c?.op === "rename") {
          // Row numbers in the list Griddy was shown, mapped to real Vault ids; anything else is dropped.
          const seen = new Set<string>();
          const names = (Array.isArray(c.names) ? c.names : []).slice(0, GRIDDY_LIMITS.vault).flatMap((r: Record<string, unknown>) => {
            const play = ctx.vault[Number(r?.n) - 1];
            const name = str(r?.name, 120).trim();
            if (!play || !name || seen.has(play.id)) return [];
            seen.add(play.id);
            const formation = str(r?.formation, 60).trim();
            return [{ id: play.id, name, ...(formation ? { formation } : {}) }];
          });
          return names.length ? [{ op: "rename" as const, names }] : [];
        }
        if (["style", "wristband", "field", "meta", "file"].includes(c?.op)) {
          const open = cleanOpenChange(c);
          return open ? [open] : [];
        }
        if (c?.op === "mirror") return [{ op: "mirror" }];
        if (c?.op === "remove_text") return [{ op: "remove_text" }];
        if (c?.op === "clear_letters") {
          if (c.letter == null || c.letter === "") return [{ op: "clear_letters", ...narrow }];
          return LETTER.test(letter(c.letter)) ? [{ op: "clear_letters", letter: letter(c.letter), ...narrow }] : [];
        }
        if (c?.op === "swap") {
          const color = c.color == null || c.color === "" ? undefined : bulkColor(str(c.color, 30));
          if (color === null) return [];
          return LETTER.test(letter(c.from)) && LETTER.test(letter(c.to)) && letter(c.from) !== letter(c.to)
            ? [{ op: "swap", from: letter(c.from), to: letter(c.to), ...(color ? { color } : {}), ...narrow }]
            : [];
        }
        return [];
      }).slice(0, MAX_BULK_CHANGES);
      let scope: BulkScope = { kind: "vault" };
      if (input.scope === "playbook") {
        const name = str(input.playbook, 120).trim();
        // A playbook with no name would quietly widen to the whole Vault, like unknown ids below; drop the card instead.
        if (!name) return [];
        scope = { kind: "playbook", name };
      }
      if (input.scope === "plays") {
        const ids = (Array.isArray(input.ids) ? input.ids : []).map((id) => String(id)).filter((id) => vaultIds.has(id));
        // Plays it named that aren't in the Vault would quietly widen to everything; drop the card instead.
        if (!ids.length) return [];
        scope = { kind: "plays", ids: [...new Set(ids)] };
      }
      // A filter Griddy sent that names nothing usable would widen the edit; drop the card instead.
      const filter = cleanFilter(input.filter);
      if (input.filter && typeof input.filter === "object" && Object.keys(input.filter).length && !filter) return [];
      return changes.length ? [{ id: u.id, tool: "bulk_edit", scope, ...(filter ? { filter } : {}), changes }] : [];
    }
    if (u.name === "show_plays") {
      const ids = (Array.isArray(input.ids) ? input.ids : []).map((id) => String(id)).filter((id) => vaultIds.has(id));
      return ids.length ? [{ id: u.id, tool: "show_plays", ids: [...new Set(ids)].slice(0, 24) }] : [];
    }
    return [];
  });
}

const TOOL_MENTION = new RegExp(`\\b(${GRIDDY_TOOLS.map((t) => t.name).join("|")})\\b`);

/**
 * Drops any sentence that talks about Griddy's own tools ("Single play, so
 * draw_play."): that's Griddy thinking out loud, not something for the coach.
 */
export function forCoach(text: string): string {
  return text
    .split(/\n/)
    .map((line) => (line.match(/[^.!?]+[.!?]*\s*/g) ?? [line]).filter((s) => !TOOL_MENTION.test(s)).join("").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** One coach message in, Griddy's answer and any cards out. */
export async function griddy(body: Partial<GriddyRequest>): Promise<GriddyReply> {
  const req = cleanRequest(body);
  const { text: said, uses } = await converse({
    model: MODELS.griddy,
    system: GRIDDY_SYSTEM,
    tools: GRIDDY_TOOLS.map((t) => ({ ...t, input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema })),
    messages: toMessages(req),
    maxTokens: 16000,
  });
  const actions = toActions(uses, req.context);
  const text = forCoach(said);
  if (!text && !actions.length) return { text: "I didn't catch that. Try saying it another way.", actions };
  return { text, actions };
}
