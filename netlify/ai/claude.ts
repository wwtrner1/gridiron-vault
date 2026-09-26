/**
 * The one place Grid1ronVault talks to the Claude API. The key lives only in
 * the ANTHROPIC_API_KEY environment variable (secret, set in Netlify) and
 * never reaches the browser.
 */
export const MODELS = {
  /** Play assistant: typed or spoken call → structured play. Cheap and fast. */
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

type Content =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

/**
 * Sends one message and forces a single tool call, so the reply is always the
 * tool's JSON input rather than free text.
 */
export async function callTool<T>(opts: {
  model: string;
  system: string;
  content: Content[];
  tool: { name: string; description: string; input_schema: Record<string, unknown> };
  maxTokens: number;
}): Promise<T> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiError("The play assistant isn't switched on for this site yet.", 503);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      tools: [opts.tool],
      tool_choice: { type: "tool", name: opts.tool.name },
      messages: [{ role: "user", content: opts.content }],
    }),
  });

  if (!res.ok) {
    // Log the provider's status for us; coaches get plain wording.
    console.error("Claude API", res.status, (await res.text()).slice(0, 500));
    if (res.status === 429 || res.status === 529)
      throw new AiError("The assistant is busy right now. Try again in a minute.", 503);
    throw new AiError("The assistant couldn't read that just now. Try again, or draw it by hand.");
  }

  const data = (await res.json()) as { content?: { type: string; name?: string; input?: unknown }[] };
  const use = data.content?.find((c) => c.type === "tool_use" && c.name === opts.tool.name);
  if (!use?.input) throw new AiError("The assistant couldn't read that just now. Try again, or draw it by hand.");
  return use.input as T;
}
