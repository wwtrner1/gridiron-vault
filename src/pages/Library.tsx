import { useMemo, useState } from "react";
import { Shell } from "../components/Shell";
import { filterLibrary, isVideo, KIND_LABEL, libraryEmbed, libraryTopics, LIBRARY_SOURCES, sourceName, type LibraryKind } from "../lib/coachLibrary";
import { LIBRARY } from "../lib/starters/library";
import "../styles/library.css";

/**
 * Coaching videos (lib/coachLibrary.ts over lib/starters/library.ts): hand-picked drills, skill
 * videos and articles from other coaching sites, with credit and a note in our words. A video
 * plays here in YouTube's privacy-enhanced player; an article opens on its site.
 */
const KINDS: (LibraryKind | "all")[] = ["all", "drill", "skill", "article"];

export function Library() {
  const [topic, setTopic] = useState("all");
  const [kind, setKind] = useState<LibraryKind | "all">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const topics = useMemo(() => libraryTopics(LIBRARY), []);
  const usedSources = useMemo(() => [...new Set(LIBRARY.map((i) => i.source))].map((k) => LIBRARY_SOURCES[k]).filter(Boolean), []);
  const shown = filterLibrary(LIBRARY, { topic, kind, q });
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <Shell title="Coaching videos">
      <div className="page lib-page">
        <div className="page-head">
          <div>
            <h2>Coaching videos</h2>
            <p>
              Drills, skills and reading we picked from coaches we trust. Videos play here; articles open on their site. Credit stays with the people who made them:{" "}
              {usedSources.map((s, i, all) => (
                <span key={s.name}>
                  <a href={s.home} target="_blank" rel="noopener noreferrer">{s.name}</a>
                  {i < all.length - 1 ? ", " : "."}
                </span>
              ))}
            </p>
          </div>
        </div>

        <div className="lib-filters">
          <label className="lib-search">
            <span className="sr-only">Search the videos</span>
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, skill or age" />
          </label>
          <div className="lib-chips" role="group" aria-label="Kind">
            {KINDS.map((k) => (
              <button key={k} type="button" className={`chip${kind === k ? " is-on" : ""}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
                {k === "all" ? "Everything" : KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <label className="lib-topic">
            <span>Topic</span>
            <select className="select" value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="all">All topics</option>
              {topics.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>

        <p className="lib-count" aria-live="polite">{shown.length} of {LIBRARY.length}</p>
        {shown.length === 0 ? (
          <p className="lib-empty">Nothing matches. Try fewer words or All topics.</p>
        ) : (
          <ul className="lib-list">
            {shown.map((item) => {
              const embed = open === item.id ? libraryEmbed(item, origin) : null;
              const video = isVideo(item);
              return (
                <li key={item.id} className="lib-card">
                  <div className="lib-meta">
                    <span className={`lib-kind is-${item.kind}`}>{KIND_LABEL[item.kind]}</span>
                    <span>{item.topic}</span>
                    {item.ages && <span>{item.ages}</span>}
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.note}</p>
                  <p className="lib-credit">From {sourceName(item)}</p>
                  {embed && (
                    <div className="lib-frame">
                      <iframe src={embed} title={`${item.title} (${sourceName(item)})`} allow="encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
                    </div>
                  )}
                  <div className="lib-acts">
                    {video && (
                      <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open === item.id} onClick={() => setOpen(open === item.id ? null : item.id)}>
                        {open === item.id ? "Hide video" : "▶ Watch"}
                      </button>
                    )}
                    <a className="btn btn-quiet btn-sm" href={item.url} target="_blank" rel="noopener noreferrer">
                      {video ? "Open in YouTube ↗" : `Read on ${sourceName(item)} ↗`}
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Shell>
  );
}
