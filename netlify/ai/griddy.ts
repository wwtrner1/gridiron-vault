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
import { bulkColor, LETTER, MAX_BULK_CHANGES, type BulkChange, type BulkScope } from "../../src/lib/bulkEdit.js";
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
      tags: (Array.isArray(p?.tags) ? p.tags : []).slice(0, 8).map((t) => str(t, 30)),
    })),
    playbooks: (Array.isArray(c.playbooks) ? c.playbooks : []).slice(0, 60).map((b) => ({
      id: str(b?.id, 64),
      name: str(b?.name, 120),
      plays: Math.max(0, Number(b?.plays) || 0),
    })),
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
  if (a.tool === "bulk_edit") {
    const scope =
      a.scope.kind === "playbook" ? { scope: "playbook", playbook: a.scope.name } : a.scope.kind === "plays" ? { scope: "plays", ids: a.scope.ids } : { scope: "vault" };
    return { ...scope, changes: a.changes };
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
    if (u.name === "bulk_edit") {
      const changes = (Array.isArray(input.changes) ? input.changes : []).slice(0, MAX_BULK_CHANGES).flatMap((c): BulkChange[] => {
        const letter = (v: unknown) => str(v, 3).trim().toUpperCase();
        if (c?.op === "recolor") {
          const color = bulkColor(str(c.color, 30));
          return LETTER.test(letter(c.letter)) && color ? [{ op: "recolor", letter: letter(c.letter), color }] : [];
        }
        if (c?.op === "swap")
          return LETTER.test(letter(c.from)) && LETTER.test(letter(c.to)) && letter(c.from) !== letter(c.to)
            ? [{ op: "swap", from: letter(c.from), to: letter(c.to) }]
            : [];
        return [];
      });
      let scope: BulkScope = { kind: "vault" };
      if (input.scope === "playbook" && str(input.playbook, 120).trim()) scope = { kind: "playbook", name: str(input.playbook, 120).trim() };
      if (input.scope === "plays") {
        const ids = (Array.isArray(input.ids) ? input.ids : []).map((id) => String(id)).filter((id) => vaultIds.has(id));
        // Plays it named that aren't in the Vault would quietly widen to everything; drop the card instead.
        if (!ids.length) return [];
        scope = { kind: "plays", ids: [...new Set(ids)] };
      }
      return changes.length ? [{ id: u.id, tool: "bulk_edit", scope, changes }] : [];
    }
    if (u.name === "show_plays") {
      const ids = (Array.isArray(input.ids) ? input.ids : []).map((id) => String(id)).filter((id) => vaultIds.has(id));
      return ids.length ? [{ id: u.id, tool: "show_plays", ids: [...new Set(ids)].slice(0, 24) }] : [];
    }
    return [];
  });
}

/** One coach message in, Griddy's answer and any cards out. */
export async function griddy(body: Partial<GriddyRequest>): Promise<GriddyReply> {
  const req = cleanRequest(body);
  const { text, uses } = await converse({
    model: MODELS.griddy,
    system: GRIDDY_SYSTEM,
    tools: GRIDDY_TOOLS.map((t) => ({ ...t, input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema })),
    messages: toMessages(req),
    maxTokens: 16000,
  });
  const actions = toActions(uses, req.context);
  if (!text && !actions.length) return { text: "I didn't catch that. Try saying it another way.", actions };
  return { text, actions };
}
