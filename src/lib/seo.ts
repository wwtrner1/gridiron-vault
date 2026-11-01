import { getPageMetadata } from "./pageMetadata";

/** Update one tag and remove any duplicates left by other head writers. */
function tag(selector: string, make: () => HTMLElement): HTMLElement {
  const [existing, ...duplicates] = document.head.querySelectorAll<HTMLElement>(selector);
  duplicates.forEach((el) => el.remove());
  if (existing) return existing;
  const el = make();
  document.head.appendChild(el);
  return el;
}

const meta = (attr: "name" | "property", key: string, content: string) =>
  tag(`meta[${attr}="${key}"]`, () => {
    const m = document.createElement("meta");
    m.setAttribute(attr, key);
    return m;
  }).setAttribute("content", content);

/** Shared RouteChrome applies metadata on every client-side navigation. */
export function applySeo(path: string) {
  const page = getPageMetadata(path);
  // A page kept out of search carries no canonical address.
  if (!page.indexable) document.head.querySelectorAll('link[rel="canonical"]').forEach((el) => el.remove());
  else {
    const canonical = tag('link[rel="canonical"]', () => {
      const l = document.createElement("link");
      l.rel = "canonical";
      return l;
    });
    canonical.setAttribute("href", page.url);
  }
  if (page.indexable) {
    document.head.querySelectorAll('meta[name="robots"]').forEach((el) => el.remove());
  } else {
    meta("name", "robots", "noindex");
  }
  meta("name", "description", page.description);
  meta("property", "og:title", page.title);
  meta("property", "og:description", page.description);
  meta("property", "og:url", page.url);
  meta("property", "og:type", page.type);
  meta("name", "twitter:card", "summary");
  meta("name", "twitter:title", page.title);
  meta("name", "twitter:description", page.description);
}
