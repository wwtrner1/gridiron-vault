import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Shell } from "../components/Shell";
import { filterLibrary, isVideo, KIND_LABEL, libraryEmbed, libraryTopics, LIBRARY_SOURCES, sourceName, type LibraryItem, type LibraryKind } from "../lib/coachLibrary";
import { cleanDrill, DRILL_LIMITS, loadDrills, saveDrills, type DrillCategory, type DrillSide } from "../lib/drills";
import { LIBRARY } from "../lib/starters/library";
import "../styles/library.css";

/**
 * Coaching videos (lib/coachLibrary.ts over lib/starters/library.ts): hand-picked drills, skill
 * videos and articles from other coaching sites, with credit and a note in our words. A video
 * plays here in YouTube's privacy-enhanced player; an article opens on its site. "Add to my drills"
 * saves a coach drill in the Drill Vault with the video as its film link and our note as its setup.
 */
const KINDS: (LibraryKind | "all")[] = ["all", "drill", "skill", "article"];

/** The Drill Vault category and side a library topic files under. */
function drillFiling(topic: string): { category: DrillCategory; side: DrillSide } {
  if (topic === "Passing") return { category: "Quarterbacks", side: "offense" };
  if (topic === "Warm-up") return { category: "Team & conditioning", side: "both" };
  if (topic === "Offense") return { category: "Flag football", side: "offense" };
  if (topic === "Defense" || topic === "Flag pulling") return { category: "Flag football", side: "defense" };
  return { category: "Flag football", side: "both" };
}

export function Library() {
  const [topic, setTopic] = useState("all");
  const [kind, setKind] = useState<LibraryKind | "all">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, string>>(() => {
    const byVideo = new Map(loadDrills().custom.filter((d) => d.video).map((d) => [d.video, d.id]));
    return Object.fromEntries(LIBRARY.flatMap((i) => (byVideo.has(i.url) ? [[i.id, byVideo.get(i.url) as string]] : [])));
  });
  const [notice, setNotice] = useState("");
  const topics = useMemo(() => libraryTopics(LIBRARY), []);
  const usedSources = useMemo(() => [...new Set(LIBRARY.map((i) => i.source))].map((k) => LIBRARY_SOURCES[k]).filter(Boolean), []);
  const shown = filterLibrary(LIBRARY, { topic, kind, q });
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const addDrill = (item: LibraryItem) => {
    const saved = loadDrills();
    const have = saved.custom.find((d) => d.video === item.url);
    if (have) {
      setAdded((a) => ({ ...a, [item.id]: have.id }));
      return setNotice(`${item.title} is already in your Drill Vault.`);
    }
    if (saved.custom.length >= DRILL_LIMITS.custom) return setNotice(`Your Drill Vault holds ${DRILL_LIMITS.custom} of your own drills. Delete one there to add this.`);
    const d = cleanDrill({
      name: item.title,
      ...drillFiling(item.topic),
      minutes: 10,
      players: item.ages ?? "",
      setup: `${item.note} Watch the video (${sourceName(item)}) for the full setup, then write it here in your own words.`,
      video: item.url,
    });
    if (!d) return;
    saveDrills({ ...saved, custom: [d, ...saved.custom] });
    setAdded((a) => ({ ...a, [item.id]: d.id }));
    setNotice(`${item.title} is in your Drill Vault with its video. Add your setup there and put it in a practice.`);
  };

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
        <p className="lib-notice" role="status">{notice}</p>
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
                    {item.kind === "drill" &&
                      (added[item.id] ? (
                        <Link className="btn btn-quiet btn-sm" to={`/drills?drill=${added[item.id]}`}>In your Drill Vault ✓ Open</Link>
                      ) : (
                        <button type="button" className="btn btn-quiet btn-sm" onClick={() => addDrill(item)}>+ Add to my drills</button>
                      ))}
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
