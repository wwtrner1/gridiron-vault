import type { Context } from "@netlify/edge-functions";
// Netlify's edge bundler resolves npm packages from the project's
// node_modules via a bare specifier; a Deno-style "npm:turndown" specifier
// is not resolvable here. The version is pinned in package.json.
import TurndownService from "turndown";

/**
 * Serves a Markdown rendition of a content page to clients that ask for it,
 * so AI agents can read the page without paying for the HTML shell.
 *
 * ── Try it ───────────────────────────────────────────────────────────────────
 *   curl -H "Accept: text/markdown" https://your-site.netlify.app/path
 *
 * Anything that does not send `Accept: text/markdown` is passed straight
 * through, so browsers keep getting the normal HTML page.
 *
 * ── Changing which paths are covered ─────────────────────────────────────────
 * The scope lives in `netlify.toml` under `[[edge_functions]]`. Each block is
 * one route:
 *
 *   [[edge_functions]]
 *   function = "markdown"
 *   path = "/guides/*"
 *   excludedPath = ["/guides/assets/*"]
 *
 * Add a page by adding a block with its path; remove a page by deleting its
 * block. Keep asset directories (images, CSS, JS) and API routes out of the
 * scope: converting them wastes edge time and returns nothing useful.
 *
 * ── Testing locally ─────────────────────────────────────────────────────────
 *   netlify dev --port 8889
 *   curl -H "Accept: text/markdown" http://localhost:8889/
 *
 * Add `-i` to the curl command to inspect the response headers, including the
 * estimated token count in `X-Markdown-Tokens`.
 */

/** Wrapper elements that carry chrome rather than page content. */
const CHROME_ELEMENTS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "nav",
  "header",
  "footer",
  "aside",
  "dialog",
  "iframe",
  "object",
  "video",
  "audio",
  "canvas",
  "form",
  "button",
  "label",
  "select",
  "textarea",
  "kbd",
];

/** Void or metadata elements that never wrap content. */
const VOID_ELEMENTS = ["link", "meta", "base", "source", "track", "input"];

/**
 * Inline elements safe to strip by regex when marked `aria-hidden` — they are
 * decorative, and none of them nest inside themselves on a content page.
 */
const DECORATIVE_INLINE = ["span", "i", "b", "em", "strong", "small", "abbr"];

function createTurndown() {
  const turndown = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
  });
  // Belt and braces: drop chrome that survived the string-level strip.
  turndown.remove(CHROME_ELEMENTS);
  return turndown;
}

/** Narrow the document to its content region before conversion. */
function extractContent(html: string): string {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (main) return main[1];
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (article) return article[1];
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return body ? body[1] : html;
}

function stripChrome(fragment: string): string {
  let output = fragment.replace(/<!--[\s\S]*?-->/g, "");
  for (const tag of CHROME_ELEMENTS) {
    output = output
      .replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "")
      .replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
  }
  for (const tag of VOID_ELEMENTS) {
    output = output.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
  }
  // Elements hidden from everyone carry no content worth converting.
  output = output.replace(/<([a-z][\w-]*)\b[^>]*\shidden(?:=(?:""|'')|\s|>)[\s\S]*?<\/\1\s*>/gi, "");
  // Decorative inline elements exist for sighted layout only.
  for (const tag of DECORATIVE_INLINE) {
    output = output.replace(
      new RegExp(`<${tag}\\b[^>]*aria-hidden=["']?true["']?[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"),
      "",
    );
  }
  // Adjacent inline tags would otherwise collide into one run of text.
  output = output.replace(/<\/(strong|em|b|i|small|span|code)\s*>(?=<[a-z])/gi, "</$1> ");
  return output;
}

function documentTitle(html: string): string | null {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return title ? title[1].replace(/\s+/g, " ").trim() || null : null;
}

function tidy(markdown: string): string {
  return markdown
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

function htmlToMarkdown(html: string): string {
  const fragment = stripChrome(extractContent(html));
  let markdown = tidy(createTurndown().turndown(fragment));
  // Keep the page title when the content region has no heading of its own.
  if (!/^#\s/m.test(markdown)) {
    const title = documentTitle(html);
    if (title) markdown = `# ${title}\n\n${markdown}`;
  }
  return markdown;
}

export default async (request: Request, context: Context) => {
  const accept = request.headers.get("accept")?.toLowerCase() ?? "";
  if (!accept.includes("text/markdown")) return; // Pass through untouched.

  const response = await context.next();

  try {
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!response.ok || !contentType.includes("text/html")) return response;

    const html = await response.clone().text();
    const markdown = htmlToMarkdown(html);
    if (!markdown) return response;

    return new Response(markdown, {
      status: response.status,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "X-Markdown-Tokens": String(Math.ceil(markdown.length / 4)),
        "Content-Signal": "ai-train=yes, search=yes, ai-input=yes",
        "Vary": "Accept",
      },
    });
  } catch (error) {
    console.error("Markdown conversion failed, serving HTML instead:", error);
    return response;
  }
};
