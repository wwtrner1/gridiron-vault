import Anthropic from "@anthropic-ai/sdk";

/**
 * The one place GridIronVault talks to the Claude API. Calls go through
 * Netlify AI Gateway: with no ANTHROPIC_API_KEY set on the site, Netlify
 * injects ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL into the function and the
 * SDK reads both (usage is billed in Netlify credits). Setting our own
 * ANTHROPIC_API_KEY in Netlify overrides the gateway. Neither reaches the browser.
 */
export const MODELS = {
  /** Griddy's conversation: football talk, tool choice, splitting a dump of plays. */
  griddy: "claude-opus-5-5",
  /** One play call → structured play. Griddy uses it for every play in a bulk import. Cheap and fast. */
  assistant: "claude-haiku-4-5-20251001",
  /** Whiteboard photo review: reading hand-drawn routes. */
  photo: "claude-sonnet-5",
} as const;

export class AiError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

const BUSY = "Griddy is busy right now. Try again in a minute.";
const MISREAD = "Griddy couldn't read that just now. Try again, or draw it by hand.";
const SLOW = "Griddy took too long to answer. Try again, or ask for less at once.";
const OURS = "Griddy is offline while we fix a problem on our side. Your plays are fine. Try again later.";
/**
 * Deploy Previews get no working AI Gateway token: Netlify answers 401 with no
 * body there (seen on Deploy Preview #328 while gridiron-vault.com answered),
 * so a preview says where Griddy does answer instead of "offline".
 */
const PREVIEW = "Griddy doesn't answer on test previews. Open gridiron-vault.com to talk to him; your plays are fine.";
let previewDeploy = false;
/** Set from the request's host once per call, like the phone check's `noteHost`. */
export const noteAiHost = (host: string) => {
  previewDeploy = /^deploy-preview-\d+--/.test(host);
};

/**
 * Netlify ends a synchronous function at 60 s and the coach then gets the
 * platform's own error page. Every call (retries included) gives up before
 * that, so the coach reads our words and we stop paying for an answer nobody
 * will see.
 */
const DEADLINE_MS = 50_000;
const deadline = () => ({ signal: AbortSignal.timeout(DEADLINE_MS) });

/**
 * The key as Netlify holds it, cleaned of what gets pasted along with it: spaces, line breaks, quotes and
 * the angle brackets of a "<your key>" placeholder. Any of them makes Anthropic answer "invalid x-api-key"
 * (on 2026-11-02 the site's key ended in ">", and Griddy read "offline" on gridiron-vault.com).
 */
export const cleanKey = (raw: string | undefined) => raw?.trim().replace(/^[<"'`\s]+|[>"'`\s]+$/g, "") || undefined;

let shared: Anthropic | null = null;
function client(): Anthropic {
  const apiKey = cleanKey(process.env.ANTHROPIC_API_KEY);
  if (!apiKey) throw new AiError("Griddy isn't switched on for this site yet.", 503);
  shared ??= new Anthropic({ apiKey });
  return shared;
}

/** Enough of the key to tell which one the site sent, never the secret part. */
function keyHint(): string {
  const raw = process.env.ANTHROPIC_API_KEY;
  const key = cleanKey(raw);
  if (!key) return "key: none";
  const via = process.env.ANTHROPIC_BASE_URL ? "via gateway" : "direct";
  return `key ${key.slice(0, 7)}…${key.slice(-4)} (${key.length} chars, ${via}${raw?.trim() !== key ? ", cleaned" : ""})`;
}

/** Log the provider's error for us; coaches get plain wording. */
function plain(error: unknown): never {
  if (error instanceof AiError) throw error;
  if (error instanceof Anthropic.APIUserAbortError || error instanceof Anthropic.APIConnectionTimeoutError) {
    console.error("Claude API timed out", error.message);
    throw new AiError(SLOW, 504);
  }
  if (error instanceof Anthropic.RateLimitError) {
    console.error("Claude API rate limit", error.message);
    throw new AiError(BUSY, 503);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    // The function couldn't reach the API at all (the coach's own signal is fine, or the request wouldn't be here).
    // Checked before APIError, which it extends with no status.
    console.error("Claude API unreachable", error.message);
    throw new AiError(BUSY, 503);
  }
  if (error instanceof Anthropic.APIError) {
    console.error("Claude API", error.status, error.message.slice(0, 500), keyHint());
    // Overloaded, or the gateway itself failing: nothing the coach wrote caused it, so say "busy", not "couldn't read that".
    if (error.status === 529 || (error.status ?? 0) >= 500) throw new AiError(BUSY, 503);
    // A rejected or expired key, or no credit left (the AI Gateway answers 402), is ours to fix, not the coach's to retry.
    if (error.status === 401 || error.status === 402 || error.status === 403) throw new AiError(previewDeploy ? PREVIEW : OURS, 503);
    throw new AiError(MISREAD);
  }
  console.error("Claude API unreachable", error);
  throw new AiError(MISREAD);
}

/**
 * Sends one message and forces a single tool call, so the reply is always the
 * tool's JSON input rather than free text. (Haiku 4.5 and Sonnet 5 allow a
 * forced tool; Griddy's model does not, so he goes through `converse`.)
 */
export async function callTool<T>(opts: {
  model: string;
  system: string;
  content: Anthropic.ContentBlockParam[];
  /** Schemas live in src/lib beside the browser code, so they arrive as plain objects. */
  tool: { name: string; description: string; input_schema: Record<string, unknown> };
  maxTokens: number;
}): Promise<T> {
  const tool = opts.tool as Anthropic.Tool;
  let message: Anthropic.Message;
  try {
    message = await client().messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content: opts.content }],
    }, deadline());
  } catch (error) {
    plain(error);
  }
  const use = message.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use" && c.name === tool.name);
  if (!use?.input) throw new AiError(MISREAD);
  return use.input as T;
}

/**
 * One turn of a conversation with tools the model may choose to use. The
 * stable system prompt is cached; the per-turn context arrives as a system
 * message after the coach's latest words. Thinking blocks are never sent back
 * (the browser holds the history as text and tool calls), so an edited
 * history can't invalidate them. On a policy decline the API retries on its
 * default fallback model inside the same call.
 */
export async function converse(opts: {
  model: string;
  system: string;
  tools: Anthropic.Beta.BetaTool[];
  messages: Anthropic.Beta.BetaMessageParam[];
  maxTokens: number;
}): Promise<{ text: string; uses: Anthropic.Beta.BetaToolUseBlock[] }> {
  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await client()
      .beta.messages.stream({
        model: opts.model,
        max_tokens: opts.maxTokens,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // Chat on the sideline: quick answers matter more than deep deliberation.
        output_config: { effort: "low" },
        system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
        tools: opts.tools,
        tool_choice: { type: "auto" },
        messages: opts.messages,
      }, deadline())
      .finalMessage();
  } catch (error) {
    plain(error);
  }
  if (message.stop_reason === "refusal")
    return { text: "That's not something I can help with. Ask me about a play, your Vault or the game.", uses: [] };
  const text = message.content
    .filter((c): c is Anthropic.Beta.BetaTextBlock => c.type === "text")
    .map((c) => c.text)
    .join("\n\n")
    .trim();
  const uses = message.content.filter((c): c is Anthropic.Beta.BetaToolUseBlock => c.type === "tool_use");
  if (message.stop_reason === "max_tokens" && !uses.length)
    return { text: `${text}\n\n(I ran out of room there. Ask me to keep going.)`.trim(), uses };
  return { text, uses };
}
