import type { Config, Context } from "@netlify/edge-functions";
import { getPageMetadata } from "../../src/lib/pageMetadata.ts";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
}

/** Social crawlers receive route metadata even when they do not execute React. */
export default async function pageMetadata(request: Request, context: Context) {
  if (request.method !== "GET" && request.method !== "HEAD") return;
  const response = await context.next();
  if (!response.headers.get("content-type")?.includes("text/html")) return response;
  const html = await response.text();
  // Leave standalone HTML resources (forms, verification files, etc.) alone.
  if (!html.includes('<div id="root"></div>')) return new Response(html, response);
  const page = getPageMetadata(new URL(request.url).pathname);
  const tags = [
    `<title>${escapeHtml(page.title)}</title>`,
    ...(page.indexable ? [`<link rel="canonical" href="${escapeHtml(page.url)}" />`] : []),
    ...Object.entries({ description: page.description, "twitter:card": "summary",
      "twitter:title": page.title, "twitter:description": page.description,
      ...(!page.indexable ? { robots: "noindex" } : {}),
    }).map(([name, content]) => `<meta name="${name}" content="${escapeHtml(content)}" />`),
    ...Object.entries({ "og:title": page.title, "og:description": page.description,
      "og:url": page.url, "og:type": page.type,
    }).map(([property, content]) => `<meta property="${property}" content="${escapeHtml(content)}" />`),
  ].join("\n    ");
  const updated = html.replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, (head) => head
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\b[^>]*>/gi, (tag) => /(?:name|property)\s*=\s*["'](?:description|robots|og:(?:title|description|url|type)|twitter:(?:card|title|description))["']/i.test(tag) ? "" : tag)
    .replace(/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/gi, "")
    .replace(/<\/head>/i, `${tags}\n  </head>`));
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("etag");
  return new Response(updated, { status: response.status, statusText: response.statusText, headers });
}

export const config: Config = {
  path: "/*",
  excludedPath: ["/.netlify/*", "/api/*", "/assets/*", "/fonts/*", "/pdfjs/*"],
};
