/**
 * The coaching library: hand-picked videos and articles from coaching sites (MOJO, Antonelli
 * Baseball and others), listed by topic with a one-line note in our own words. We only keep
 * the link and credit the source; the video plays in YouTube's privacy-enhanced player and
 * articles open on the source's site. Nothing of theirs is copied (Wes, 2026-11-13).
 *
 * Sport-neutral and pure: copy this file to another Vault as is. Each Vault's own list is
 * `LIBRARY` in `lib/starters/library.ts`.
 */
import { filmEmbed, filmYoutubeId, readTime } from "./filmNotes.ts";

/** drill: a game or drill to run at practice. skill: how to teach one skill. article: reading for the coach. */
export type LibraryKind = "drill" | "skill" | "article";

export type LibraryItem = {
  id: string;
  title: string;
  /** Who made it, shown as the credit. A key of `LIBRARY_SOURCES`. */
  source: string;
  url: string;
  kind: LibraryKind;
  /** The Vault's drill category where one fits, so "Add to my drills" files it there. */
  topic: string;
  /** What it's for, in our words. One or two sentences. */
  note: string;
  /** Who it suits, in the coach's words ("Beginners", "8U and up"). */
  ages?: string;
};

export const LIBRARY_SOURCES: Record<string, { name: string; home: string }> = {
  mojo: { name: "MOJO", home: "https://mojo.sport/coachs-corner/" },
  antonelli: { name: "Antonelli Baseball", home: "https://www.youtube.com/@AntonelliBaseball" },
};

export const KIND_LABEL: Record<LibraryKind, string> = { drill: "Drill or game", skill: "Teach a skill", article: "Read" };

export const sourceName = (item: LibraryItem) => LIBRARY_SOURCES[item.source]?.name ?? item.source;

/** Topics in the order they first appear in the list. */
export function libraryTopics(items: LibraryItem[]): string[] {
  return [...new Set(items.map((i) => i.topic))];
}

const fold = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Items matching a topic, a kind and search words (all words must appear in the title, note, topic or source). */
export function filterLibrary(items: LibraryItem[], f: { topic?: string; kind?: LibraryKind | "all"; q?: string }): LibraryItem[] {
  const words = fold(f.q ?? "").split(" ").filter(Boolean);
  return items.filter((i) => {
    if (f.topic && f.topic !== "all" && i.topic !== f.topic) return false;
    if (f.kind && f.kind !== "all" && i.kind !== f.kind) return false;
    if (!words.length) return true;
    const hay = fold(`${i.title} ${i.note} ${i.topic} ${sourceName(i)} ${i.ages ?? ""}`);
    return words.every((w) => hay.includes(w));
  });
}

/** Where a YouTube link starts, from its t= (seconds, "90s" or "1:30"); 0 otherwise. */
export function videoStart(url: string): number {
  try {
    const t = new URL(url).searchParams.get("t") ?? new URL(url).searchParams.get("start");
    return t ? readTime(t) ?? 0 : 0;
  } catch {
    return 0;
  }
}

/** The privacy-enhanced player for a YouTube item; null for an article or a non-YouTube link. */
export function libraryEmbed(item: LibraryItem, origin: string): string | null {
  const id = filmYoutubeId(item.url);
  return id ? filmEmbed(id, videoStart(item.url), origin) : null;
}

/** True when the item is a video that plays here. */
export const isVideo = (item: LibraryItem) => !!filmYoutubeId(item.url);

/** Every id once and every link https, so a typo in a list is caught by the tests. */
export function libraryProblems(items: LibraryItem[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const i of items) {
    if (seen.has(i.id)) out.push(`${i.id}: id used twice`);
    seen.add(i.id);
    if (!/^https:\/\//.test(i.url)) out.push(`${i.id}: link isn't https`);
    if (!LIBRARY_SOURCES[i.source]) out.push(`${i.id}: unknown source ${i.source}`);
    if (!i.note.trim() || !i.title.trim()) out.push(`${i.id}: needs a title and a note`);
    if (i.kind !== "article" && !filmYoutubeId(i.url)) out.push(`${i.id}: video link isn't YouTube`);
  }
  return out;
}
