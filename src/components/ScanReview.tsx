import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Shell } from "./Shell";
import { Icon } from "./Icon";
import { PlayThumb } from "./PlayThumb";
import { currentGame, PhotoReview, photoScene, type PhotoFormat } from "./PhotoReview";
import { api } from "../lib/api";
import { aiUsage } from "../lib/aiUsage";
import { useAuth } from "../lib/auth";
import { gateAi, gateSave } from "../lib/plan";
import type { PhotoRead } from "../lib/photo";
import { usePositionTokens } from "../lib/positions";
import { canvasJpeg, cropPlay, imagePage, isPdf, MAX_PDF_PAGES, pdfPages } from "../lib/scan";
import type { Jpeg, ScanBox } from "../lib/scan";
import { store, useStore } from "../lib/store";
import { useTerms } from "../lib/terms";
import { useTier } from "../lib/tier";
import { useToast } from "../lib/toast";
import { uid } from "../lib/types";
import type { StoredPlay } from "../lib/types";

type Item = {
  id: string;
  page: number;
  box: ScanBox;
  crop: Jpeg;
  state: "found" | "reading" | "read" | "failed" | "empty";
  read?: PhotoRead;
  keep: boolean;
  name: string;
  format: PhotoFormat;
};
type Page = { n: number; url: string; aspect: number; reason?: string; error?: string };
type Phase = { kind: "opening" } | { kind: "finding"; page: number; of: number } | { kind: "ready" } | { kind: "error"; text: string; plans?: boolean };

const count = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;

/** Plays read from a page at the same time. */
const AT_ONCE = 2;

const label = (files: File[]) => (files.length === 1 ? files[0].name : `${files.length} scanned pages`);
const bookName = (files: File[]) => (files.length === 1 ? files[0].name.replace(/\.[a-z0-9]+$/i, "") : "Scanned plays");

/**
 * Scanned pages and PDFs, from Upload: every page is looked over once for
 * play diagrams, each play is cropped and read like a whiteboard photo, and
 * the coach checks, renames or drops each one before anything saves. A
 * single photo with one play goes back to the one-play review (`onSingle`).
 */
export function ScanReview({ files, onBack, onSingle }: { files: File[]; onBack: () => void; onSingle: (file: File) => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const tier = useTier();
  const { account } = useAuth();
  const { terms } = useTerms();
  const tokens = usePositionTokens();
  const plays = useStore((s) => s.plays);
  const playbooks = useStore((s) => s.playbooks);
  const [phase, setPhase] = useState<Phase>({ kind: "opening" });
  const [pages, setPages] = useState<Page[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [note, setNote] = useState("");
  const [reading, setReading] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [target, setTarget] = useState("new");
  const live = useRef(true);

  const left = () => Math.max(0, tier.photoReviews - aiUsage.used("photo"));

  useEffect(() => {
    live.current = true;
    (async () => {
      // 1. Every page as a canvas, in the browser. Nothing is uploaded to be stored.
      const canvases: HTMLCanvasElement[] = [];
      let skipped = 0;
      for (const file of files) {
        try {
          if (isPdf(file)) {
            const { pages: got, total } = await pdfPages(file);
            canvases.push(...got);
            skipped += total - got.length;
          } else canvases.push(await imagePage(file));
        } catch {
          if (!live.current) return;
          if (files.length === 1 && !isPdf(file)) return onSingle(file);
          return setPhase({
            kind: "error",
            text: isPdf(file)
              ? `${file.name} couldn't be opened. If it has a password, print it to a new PDF first; if it's very large, upload the pages with plays.`
              : `${file.name} couldn't be opened in this browser. Save it as JPG or PNG and try again.`,
          });
        }
      }
      if (!live.current) return;
      if (!canvases.length) return setPhase({ kind: "error", text: "That PDF has no pages to read." });
      if (skipped) setNote(`Only the first ${MAX_PDF_PAGES} pages are read at a time. Upload the rest as a second PDF.`);
      const single = files.length === 1 && !isPdf(files[0]) ? files[0] : null;
      setPages(canvases.map((c, i) => ({ n: i + 1, ...canvasJpeg(c, 900) })));

      // 2. Signed in, with photo reviews left — or the one-play review explains why not.
      if (!account) {
        if (single) return onSingle(single);
        return setPhase({ kind: "error", text: "Sign in to have GridIronVault read your pages. It is included with every plan." });
      }
      const gate = gateAi(tier, "photo", aiUsage.used("photo"));
      if (!gate.ok) {
        if (single) return onSingle(single);
        return setPhase({ kind: "error", text: gate.reason, plans: true });
      }

      // 3. Find the plays on each page.
      const found: Item[] = [];
      for (let i = 0; i < canvases.length; i++) {
        setPhase({ kind: "finding", page: i + 1, of: canvases.length });
        try {
          const res = await api.scan({ image: canvasJpeg(canvases[i]).data });
          if (!live.current) return;
          if (single && res.plays.length <= 1) return onSingle(single);
          if (!res.plays.length) setPages((ps) => ps.map((p) => (p.n === i + 1 ? { ...p, reason: res.reason || "No play diagrams on this page." } : p)));
          for (const box of res.plays)
            found.push({ id: uid("scan"), page: i + 1, box, crop: canvasJpeg(cropPlay(canvases[i], box)), state: "found", keep: true, name: box.title, format: "vault" });
        } catch (e) {
          if (!live.current) return;
          const text = e instanceof Error ? e.message : "This page couldn't be read just now.";
          // A plan or daily limit stops every page after it too.
          if (/limit|plan|Sign in/i.test(text)) {
            setPhase({ kind: "error", text, plans: /plan/i.test(text) });
            break;
          }
          setPages((ps) => ps.map((p) => (p.n === i + 1 ? { ...p, error: text } : p)));
        }
      }
      if (!live.current) return;
      // Pre-check only as many plays as this month's photo reviews cover.
      const room = left();
      setItems(found.map((it, i) => ({ ...it, keep: i < room })));
      setPhase((p) => (p.kind === "error" ? p : { kind: "ready" }));
    })();
    return () => {
      live.current = false;
    };
    // The files are read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const update = (id: string, patch: Partial<Item>) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  async function readPicked() {
    const queue = items.filter((it) => it.keep && (it.state === "found" || it.state === "failed"));
    if (!queue.length) return;
    const gate = gateAi(tier, "photo", aiUsage.used("photo") + queue.length - 1);
    if (!gate.ok) return setNote(`${gate.reason} Uncheck some plays to read fewer.`);
    setNote("");
    setReading(true);
    let stop = "";
    const game = currentGame();
    const coachTerms = terms.map((t) => ({ term: t.term, means: t.means }));
    const next = async (): Promise<void> => {
      const it = queue.shift();
      if (!it || stop || !live.current) return;
      update(it.id, { state: "reading" });
      try {
        const { read } = await api.photo({ image: it.crop.data, game, terms: coachTerms });
        aiUsage.add("photo");
        update(it.id, read.isPlay ? { state: "read", read, name: it.box.title || read.name } : { state: "empty", read, keep: false });
      } catch (e) {
        stop = e instanceof Error ? e.message : "A play couldn't be read just now.";
        update(it.id, { state: "failed" });
      }
      return next();
    };
    await Promise.all(Array.from({ length: AT_ONCE }, next));
    if (!live.current) return;
    setReading(false);
    if (stop) setNote(`${stop} Plays already read are kept; press Read again to try the rest.`);
  }

  const ready = items.filter((it) => it.state === "read" && it.keep);
  const unread = items.filter((it) => it.keep && (it.state === "found" || it.state === "failed"));
  const saveGate = gateSave(tier, plays.length + ready.length - 1);
  const scenes = useMemo(
    () => Object.fromEntries(items.filter((it) => it.read?.isPlay).map((it) => [it.id, photoScene(it.read!, it.crop.aspect, it.format, tokens)])),
    [items, tokens],
  );

  function save() {
    if (!ready.length) return;
    if (!saveGate.ok) return toast(saveGate.reason, true);
    const now = new Date().toISOString();
    const source = label(files);
    const made: StoredPlay[] = ready.map((it) => ({
      id: uid("play"),
      name: it.name.trim() || it.read!.name,
      formation: it.read!.formation !== "Custom" ? it.read!.formation : "",
      playType: "pass",
      personnel: "",
      description: [it.box.notes, `Read from ${source}${pages.length > 1 ? `, page ${it.page}` : ""}.`].filter(Boolean).join("\n\n"),
      tags: ["imported", "scan"],
      isPublic: false,
      ownerName: "You",
      fieldView: "half",
      scene: scenes[it.id],
      preview: "",
      saveCount: 0,
      updatedAt: now,
      remote: false,
    }));
    made.forEach((p) => store.upsertPlay(p));
    if (target !== "none") {
      const existing = playbooks.find((b) => b.id === target);
      const book = existing ?? { id: uid("book"), name: bookName(files), description: `Read from ${source}`, color: "#16C8E8", isPublic: false, playIds: [] };
      store.upsertPlaybook({ ...book, playIds: [...book.playIds, ...made.map((p) => p.id)], updatedAt: now });
    }
    toast(`${made.length} ${made.length === 1 ? "play" : "plays"} saved to your Vault. Open any one to fine-tune it.`);
    navigate("/vault");
  }

  const open = checking ? items.find((it) => it.id === checking) : undefined;
  if (open?.read) {
    return (
      <PhotoReview
        file={new File([], `${label(files)} · page ${open.page}`)}
        onBack={() => setChecking(null)}
        check={{
          read: open.read,
          url: open.crop.url,
          aspect: open.crop.aspect,
          format: open.format,
          onUse: (read, format) => {
            update(open.id, { read, format, keep: true });
            setChecking(null);
          },
        }}
      />
    );
  }

  const busy = phase.kind === "opening" || phase.kind === "finding";
  const heading =
    phase.kind === "opening"
      ? "Opening your pages…"
      : phase.kind === "finding"
        ? `Finding plays on page ${phase.page} of ${phase.of}…`
        : items.length
          ? `${items.length} ${items.length === 1 ? "play" : "plays"} found on ${pages.length} ${pages.length === 1 ? "page" : "pages"}`
          : "No plays found";

  return (
    <Shell
      title="Review scan"
      actions={
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <Icon name="upload" size={15} /> Upload more
        </button>
      }
    >
      <div className="up sc">
        <div className="up-head">
          <p className="eyebrow">
            Draft · not saved · <span className="mono">{label(files)}</span>
          </p>
          <h2 aria-live="polite">{heading}</h2>
          <p>
            Each play is cut from its page and redrawn on the field. Check the ones you want, press Read, then fix anything that
            looks off before saving. Every play read uses one photo review ({left()} left this month).
          </p>
        </div>

        {phase.kind === "error" && (
          <p className="error-line" role="alert">
            {phase.text} {phase.plans && <Link to="/pricing">See plans</Link>}
          </p>
        )}
        {note && (
          <p className="up-wait" role="status">
            <Icon name="sparkle" size={16} /> {note}
          </p>
        )}

        {pages.length > 0 && (
          <div className="sc-pages" aria-label="Pages">
            {pages.map((p) => (
              <figure key={p.n} className="card sc-page">
                <div className="sc-page-art">
                  <img src={p.url} alt={`Page ${p.n}`} />
                  {items
                    .filter((it) => it.page === p.n)
                    .map((it) => (
                      <span
                        key={it.id}
                        className={`sc-box${it.keep ? " is-on" : ""}`}
                        style={{ left: `${it.box.x * 100}%`, top: `${it.box.y * 100}%`, width: `${it.box.w * 100}%`, height: `${it.box.h * 100}%` }}
                      >
                        {items.indexOf(it) + 1}
                      </span>
                    ))}
                  {busy && phase.kind === "finding" && phase.page === p.n && <span className="sc-scan" aria-hidden="true" />}
                </div>
                <figcaption>
                  <span className="mono">Page {p.n}</span> {p.error ?? p.reason ?? count(items.filter((it) => it.page === p.n).length, "play")}
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        {items.length > 0 && (
          <>
            <div className="up-bulk">
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setItems((l) => l.map((it) => ({ ...it, keep: it.state !== "empty" })))}>
                Select all plays
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setItems((l) => l.map((it) => ({ ...it, keep: false })))}>
                Clear
              </button>
            </div>
            <div className="sc-list">
              {items.map((it, i) => (
                <div key={it.id} className={`card sc-item${it.keep ? "" : " is-off"}`}>
                  <div className="up-slide-top">
                    <input
                      type="checkbox"
                      aria-label={`Keep play ${i + 1}`}
                      checked={it.keep}
                      disabled={it.state === "empty"}
                      onChange={(e) => update(it.id, { keep: e.target.checked })}
                    />
                    <span className="mono">
                      #{i + 1} · Page {it.page}
                    </span>
                    <span className={`pill ${it.state === "read" ? "pill-green" : "pill-special"}`}>
                      {it.state === "found" ? "Not read yet" : it.state === "reading" ? "Reading…" : it.state === "read" ? "Read" : it.state === "failed" ? "Try again" : "No play"}
                    </span>
                  </div>
                  <div className="sc-pair">
                    <img src={it.crop.url} alt={`Play ${i + 1} as scanned`} />
                    {scenes[it.id] ? (
                      <div className="up-slide-art">
                        <PlayThumb scene={scenes[it.id]} label={it.name} />
                      </div>
                    ) : (
                      <div className="sc-wait">{it.state === "reading" ? "Reading…" : it.state === "empty" ? it.read?.reason || "No play in this box." : "Redrawn here once read"}</div>
                    )}
                  </div>
                  <input
                    className="input"
                    aria-label={`Name for play ${i + 1}`}
                    placeholder={it.read?.name ?? "Play name"}
                    value={it.name}
                    onChange={(e) => update(it.id, { name: e.target.value })}
                  />
                  {it.state === "read" && (
                    <div className="sc-item-acts">
                      {it.read!.questions.length > 0 && (
                        <span className="pill pill-special">
                          {it.read!.questions.length} {it.read!.questions.length === 1 ? "thing" : "things"} to check
                        </span>
                      )}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setChecking(it.id)}>
                        Check and fix
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {phase.kind === "ready" && !items.length && (
          <div className="empty">
            <Icon name="board" size={40} />
            <h3>No play diagrams on {pages.length === 1 ? "this page" : "these pages"}</h3>
            <p>Try a straighter, brighter scan of the page, or a photo of one play at a time.</p>
            <button type="button" className="btn btn-ghost" onClick={onBack}>
              Upload another file
            </button>
          </div>
        )}

        {items.length > 0 && (
          <div className="card up-apply">
            <div className="up-apply-grid">
              <label className="up-field">
                <span>Add to playbook</span>
                <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="new">{bookName(files)} (new)</option>
                  {playbooks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                  <option value="none">Don’t add to a playbook</option>
                </select>
              </label>
            </div>
            {!saveGate.ok && (
              <p className="up-gate" role="note">
                {saveGate.reason} Uncheck some plays, or <Link to="/pricing">see plans</Link>.
              </p>
            )}
            <div className="up-apply-acts sc-acts">
              {unread.length > 0 && (
                <button type="button" className={`btn ${ready.length ? "btn-ghost" : "btn-primary"}`} disabled={reading || busy} onClick={readPicked}>
                  <Icon name="sparkle" size={15} /> {reading ? "Reading…" : `Read ${unread.length} ${unread.length === 1 ? "play" : "plays"}`}
                </button>
              )}
              <button type="button" className="btn btn-primary" disabled={!ready.length || !saveGate.ok || reading} onClick={save}>
                Save {ready.length} {ready.length === 1 ? "play" : "plays"} to Vault
              </button>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
