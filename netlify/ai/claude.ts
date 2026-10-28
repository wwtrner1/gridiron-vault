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

let shared: Anthropic | null = null;
function client(): Anthropic {
  // Trimmed: a space or line break pasted along with the key makes Anthropic answer "invalid x-api-key".
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new AiError("Griddy isn't switched on for this site yet.", 503);
  shared ??= new Anthropic({ apiKey });
  return shared;
}

/** Log the provider's error for us; coaches get plain wording. */
function plain(error: unknown): never {
  if (error instanceof AiError) throw error;
  if (error instanceof Anthropic.RateLimitError) {
    console.error("Claude API rate limit", error.message);
    throw new AiError(BUSY, 503);
  }
  if (error instanceof Anthropic.APIError) {
    console.error("Claude API", error.status, error.message.slice(0, 500), `key ends …${process.env.ANTHROPIC_API_KEY?.trim().slice(-4) ?? "none"}`);
    if (error.status === 529) throw new AiError(BUSY, 503);
    // A rejected or expired key is ours to fix, not the coach's to retry: say so instead of "couldn't read that".
    if (error.status === 401 || error.status === 403) throw new AiError("Griddy is offline while we fix a problem on our side. Your plays are fine. Try again later.", 503);
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
    });
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
      })
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
