import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Shell } from "./Shell";
import { Icon } from "./Icon";
import { PlayThumb } from "./PlayThumb";
import { currentGame, PhotoReview, photoScene } from "./PhotoReview";
import { api, coachError } from "../lib/api";
import { aiUsage } from "../lib/aiUsage";
import { useAuth } from "../lib/auth";
import { gateAi, gateSave } from "../lib/plan";
import type { Tier } from "../lib/plan";
import { correctionsBetween } from "../lib/photo";
import type { TokenPreset } from "../lib/presets";
import { usePositionTokens } from "../lib/positions";
import { canvasJpeg, cropPlay, imagePage, isPdf, MAX_PDF_PAGES, pdfPages } from "../lib/scan";
import { CHECKED, scanBookName, scanBusy, scanJob, scanLabel, TO_CHECK, useScanJob } from "../lib/scanJob";
import type { ScanItem, ScanJob } from "../lib/scanJob";
import { store, useStore } from "../lib/store";
import { useTerms } from "../lib/terms";
import { useTier } from "../lib/tier";
import { useToast } from "../lib/toast";
import { uid } from "../lib/types";
import type { StoredPlay } from "../lib/types";

const count = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;

/** Plays read from a page at the same time. */
const AT_ONCE = 2;

/** What a running scan needs from the screen that started it, taken once so it can keep going after the coach leaves. */
type Deps = { tier: Tier; signedIn: boolean; terms: { term: string; means: string }[]; tokens: TokenPreset[] };

const left = (tier: Tier) => Math.max(0, tier.photoReviews - aiUsage.used("photo"));

/** Opens every page, finds the plays on each, and (when the coach asked) reads and files them. */
async function runScan(job: ScanJob, deps: Deps) {
  const id = job.id;
  const { files } = job;
  const set = (patch: Parameters<typeof scanJob.set>[1]) => scanJob.set(id, patch);
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
      if (files.length === 1 && !isPdf(file)) return set({ single: file });
      return set({
        phase: {
          kind: "error",
          text: isPdf(file)
            ? `${file.name} couldn't be opened. If it has a password, print it to a new PDF first; if it's very large, upload the pages with plays.`
            : `${file.name} couldn't be opened in this browser. Save it as JPG or PNG and try again.`,
        },
      });
    }
  }
  if (!scanJob.live(id)) return;
  if (!canvases.length) return set({ phase: { kind: "error", text: "That PDF has no pages to read." } });
  const single = files.length === 1 && !isPdf(files[0]) ? files[0] : null;
  set({
    pages: canvases.map((c, i) => ({ n: i + 1, ...canvasJpeg(c, 900) })),
    note: skipped ? `Only the first ${MAX_PDF_PAGES} pages are read at a time. Upload the rest as a second PDF.` : "",
  });

  // 2. Signed in, with photo reviews left — or the one-play review explains why not.
  if (!deps.signedIn) {
    if (single) return set({ single });
    return set({ phase: { kind: "error", text: "Sign in to have GridIronVault read your pages. It is included with every plan." } });
  }
  const gate = gateAi(deps.tier, "photo", aiUsage.used("photo"));
  if (!gate.ok) {
    if (single) return set({ single });
    return set({ phase: { kind: "error", text: gate.reason, plans: true } });
  }

  // 3. Find the plays on each page.
  const found: ScanItem[] = [];
  let stopped = false;
  for (let i = 0; i < canvases.length; i++) {
    if (!set({ phase: { kind: "finding", page: i + 1, of: canvases.length } })) return;
    try {
      const res = await api.scan({ image: canvasJpeg(canvases[i]).data });
      if (!scanJob.live(id)) return;
      if (single && res.plays.length <= 1) return set({ single });
      if (!res.plays.length)
        set((j) => ({ pages: j.pages.map((p) => (p.n === i + 1 ? { ...p, reason: res.reason || "No play diagrams on this page." } : p)) }));
      for (const box of res.plays)
        found.push({ id: uid("scan"), page: i + 1, box, crop: canvasJpeg(cropPlay(canvases[i], box)), state: "found", keep: true, name: box.title, format: "vault" });
    } catch (e) {
      if (!scanJob.live(id)) return;
      const text = coachError(e, "This page couldn't be read just now.");
      // A plan or daily limit stops every page after it too.
      if (/limit|plan|Sign in/i.test(text)) {
        set({ phase: { kind: "error", text, plans: /plan/i.test(text) } });
        stopped = true;
        break;
      }
      set((j) => ({ pages: j.pages.map((p) => (p.n === i + 1 ? { ...p, error: text } : p)) }));
    }
  }
  // Pre-check only as many plays as this month's photo reviews cover.
  const room = left(deps.tier);
  set((j) => ({ items: found.map((it, i) => ({ ...it, keep: i < room })), phase: j.phase.kind === "error" ? j.phase : { kind: "ready" } }));
  if (!stopped && scanJob.get()?.toVault) {
    await readPicked(id, deps);
    const after = scanJob.get();
    if (after?.id === id && after.toVault) saveScan(id, deps);
  }
}

/** Reads every kept play that isn't read yet, two at a time. */
async function readPicked(id: string, deps: Deps) {
  const job = scanJob.get();
  if (!job || job.id !== id || job.reading) return;
  const queue = job.items.filter((it) => it.keep && (it.state === "found" || it.state === "failed"));
  if (!queue.length) return;
  const gate = gateAi(deps.tier, "photo", aiUsage.used("photo") + queue.length - 1);
  if (!gate.ok) return scanJob.set(id, { note: `${gate.reason} Uncheck some plays to read fewer.` });
  scanJob.set(id, { note: "", reading: true });
  let stop = "";
  const game = currentGame();
  const next = async (): Promise<void> => {
    const it = queue.shift();
    if (!it || stop || !scanJob.live(id)) return;
    scanJob.item(id, it.id, { state: "reading" });
    try {
      const { read } = await api.photo({ image: it.crop.data, game, terms: deps.terms });
      aiUsage.add("photo");
      scanJob.item(
        id,
        it.id,
        read.isPlay ? { state: "read", read, original: read, name: it.box.title || read.name } : { state: "empty", read, keep: false },
      );
    } catch (e) {
      stop = coachError(e, "A play couldn't be read just now.");
      scanJob.item(id, it.id, { state: "failed" });
    }
    return next();
  };
  await Promise.all(Array.from({ length: AT_ONCE }, next));
  scanJob.set(id, { reading: false, ...(stop ? { note: `${stop} Plays already read are kept; press Read again to try the rest.` } : {}) });
}

/**
 * Saves the kept, read plays to the Vault (and a playbook). A play the coach
 * didn't check saves tagged "to-check" ("Needs a check" in the Vault) until
 * it's saved from the Designer; a checked one saves with a green check.
 */
function saveScan(id: string, deps: Deps): { count: number; reason?: string } {
  const job = scanJob.get();
  if (!job || job.id !== id) return { count: 0 };
  const ready = job.items.filter((it) => it.state === "read" && it.keep && it.read?.isPlay);
  if (!ready.length) return { count: 0 };
  const { plays, playbooks } = store.get();
  const gate = gateSave(deps.tier, plays.length + ready.length - 1);
  if (!gate.ok) {
    scanJob.set(id, { toVault: false, note: `${gate.reason} Uncheck some plays, then save.` });
    return { count: 0, reason: gate.reason };
  }
  const now = new Date().toISOString();
  const source = scanLabel(job.files);
  const made: StoredPlay[] = ready.map((it) => {
    const read = it.read!;
    const defense = read.playType === "defense";
    return {
      id: uid("play"),
      name: it.name.trim() || read.name,
      formation: read.formation !== "Custom" ? read.formation : "",
      playType: defense ? "defense" : "pass",
      personnel: "",
      description: [it.box.notes, defense && read.coverage ? `Coverage: ${read.coverage}.` : "", `Read from ${source}${job.pages.length > 1 ? `, page ${it.page}` : ""}.`]
        .filter(Boolean)
        .join("\n\n"),
      tags: ["imported", "scan", it.checked ? CHECKED : TO_CHECK],
      isPublic: false,
      ownerName: "You",
      fieldView: "half",
      scene: photoScene(read, it.crop.aspect, it.format, deps.tokens),
      preview: "",
      saveCount: 0,
      updatedAt: now,
      remote: false,
    };
  });
  made.forEach((p) => store.upsertPlay(p));
  let bookName: string | undefined;
  if (job.target !== "none") {
    const existing = playbooks.find((b) => b.id === job.target);
    const book = existing ?? {
      id: uid("book"),
      name: job.newName.trim() || scanBookName(job.files),
      description: `Read from ${source}`,
      color: "#16C8E8",
      isPublic: false,
      playIds: [],
    };
    bookName = book.name;
    store.upsertPlaybook({ ...book, playIds: [...book.playIds, ...made.map((p) => p.id)], updatedAt: now });
  }
  scanJob.set(id, { phase: { kind: "saved", count: made.length, book: bookName }, toVault: false });
  return { count: made.length };
}

/** Sends what the coach fixed to the account, so the reader reads their boards (and, once many coaches agree, everyone's) better. */
export function teachReader(before: ScanItem["read"], after: ScanItem["read"]) {
  if (!before || !after) return;
  const corrections = correctionsBetween(before, after);
  if (corrections.length) api.teachReader(corrections).catch(() => {});
}

/**
 * Scanned pages and PDFs, from Upload: every page is looked over once for
 * play diagrams, each play is cropped and read like a whiteboard photo, and
 * the coach checks, fixes or drops each one before anything saves. The job
 * keeps running when the coach leaves the page (`lib/scanJob.ts`); a single
 * photo with one play goes back to the one-play review (`onSingle`).
 */
export function ScanReview({ onBack, onSingle }: { onBack: () => void; onSingle: (file: File) => void }) {
  const toast = useToast();
  const tier = useTier();
  const { account } = useAuth();
  const { terms } = useTerms();
  const tokens = usePositionTokens();
  const plays = useStore((s) => s.plays);
  const playbooks = useStore((s) => s.playbooks);
  const job = useScanJob();
  const [checking, setChecking] = useState<string | null>(null);

  const deps = (): Deps => ({ tier, signedIn: !!account, terms: terms.map((t) => ({ term: t.term, means: t.means })), tokens });

  useEffect(() => {
    if (!job || job.started) return;
    scanJob.set(job.id, { started: true });
    void runScan(job, deps());
    // Started once per job; it keeps running after this screen closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  useEffect(() => {
    if (job?.single) {
      const file = job.single;
      scanJob.clear();
      onSingle(file);
    }
  }, [job?.single, onSingle]);

  const items = job?.items ?? [];
  const scenes = useMemo(
    () => Object.fromEntries(items.filter((it) => it.read?.isPlay).map((it) => [it.id, photoScene(it.read!, it.crop.aspect, it.format, tokens)])),
    [items, tokens],
  );
  if (!job) return null;
  const { files, pages, phase, note, reading } = job;
  const update = (itemId: string, patch: Partial<ScanItem>) => scanJob.item(job.id, itemId, patch);
  const setItems = (fn: (l: ScanItem[]) => ScanItem[]) => scanJob.set(job.id, (j) => ({ items: fn(j.items) }));

  const ready = items.filter((it) => it.state === "read" && it.keep);
  const unread = items.filter((it) => it.keep && (it.state === "found" || it.state === "failed"));
  const checkedCount = ready.filter((it) => it.checked).length;
  const saveGate = gateSave(tier, plays.length + ready.length - 1);

  const save = () => {
    const res = saveScan(job.id, deps());
    if (res.reason) toast(res.reason, true);
  };
  const sendLater = () => {
    scanJob.set(job.id, { toVault: true });
    if (phase.kind === "ready") {
      void readPicked(job.id, deps()).then(() => {
        if (scanJob.get()?.id === job.id && scanJob.get()?.toVault) saveScan(job.id, deps());
      });
    }
  };

  const open = checking ? items.find((it) => it.id === checking) : undefined;
  if (open?.read) {
    return (
      <PhotoReview
        file={new File([], `${scanLabel(files)} · page ${open.page}`)}
        onBack={() => setChecking(null)}
        check={{
          read: open.read,
          original: open.original,
          url: open.crop.url,
          aspect: open.crop.aspect,
          format: open.format,
          onUse: (read, format) => {
            teachReader(open.read, read);
            update(open.id, { read, format, keep: true, checked: true });
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
            Draft · not saved · <span className="mono">{scanLabel(files)}</span>
          </p>
          <h2 aria-live="polite">{heading}</h2>
          <p>
            Each play is cut from its page and redrawn on the field. Check the ones you want, press Read, then fix anything that
            looks off before saving. Every play read uses one photo review ({left(tier)} left this month). You can leave this page
            while it reads: the plays wait here for you.
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

        {(busy || reading || job.toVault || items.length > 0) && phase.kind !== "error" && (
          <div className="card sc-later" role="group" aria-label="While it reads">
            {job.toVault ? (
              <p>
                <Icon name="check" size={15} /> When every play is read, they go to your Vault marked <b>Needs a check</b>
                {job.target === "none" ? "" : ` in ${playbooks.find((b) => b.id === job.target)?.name ?? (job.newName || scanBookName(files))}`}. You
                can leave this page.
              </p>
            ) : (
              <p>Busy? Leave this page and the plays wait here for you, or send them to your Vault to check later.</p>
            )}
            {!job.toVault ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={sendLater}>
                <Icon name="folder" size={14} /> Send to my Vault to check later
              </button>
            ) : (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => scanJob.set(job.id, { toVault: false })}>
                Keep them here instead
              </button>
            )}
          </div>
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
              {ready.length > 0 && (
                <span className="hint sc-tally" role="status">
                  {checkedCount} of {count(ready.length, "play")} checked
                </span>
              )}
            </div>
            <div className="sc-list">
              {items.map((it, i) => {
                const asks = it.read?.questions.length ?? 0;
                return (
                  <div key={it.id} className={`card sc-item${it.keep ? "" : " is-off"}${it.checked ? " is-checked" : ""}`}>
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
                        {it.state === "found"
                          ? "Not read yet"
                          : it.state === "reading"
                            ? "Reading…"
                            : it.state === "read"
                              ? it.read?.playType === "defense"
                                ? "Read · defense"
                                : "Read"
                              : it.state === "failed"
                                ? "Try again"
                                : "No play"}
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
                        {it.checked ? (
                          <span className="pill pill-green sc-done" aria-label="Checked and fixed">
                            <Icon name="check" size={12} /> Checked
                          </span>
                        ) : asks > 0 ? (
                          <span className="pill pill-special">
                            {asks} {asks === 1 ? "thing" : "things"} to check
                          </span>
                        ) : (
                          <span className="pill pill-amber">Not checked yet</span>
                        )}
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setChecking(it.id)}>
                          {it.checked ? "Fix again" : "Check and fix"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
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
                <select className="select" value={job.target} onChange={(e) => scanJob.set(job.id, { target: e.target.value })}>
                  <option value="new">New playbook…</option>
                  {playbooks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                  <option value="none">Don’t add to a playbook</option>
                </select>
              </label>
              {job.target === "new" && (
                <label className="up-field">
                  <span>New playbook name</span>
                  <input
                    className="input"
                    value={job.newName}
                    onChange={(e) => scanJob.set(job.id, { newName: e.target.value })}
                    placeholder={scanBookName(files)}
                    maxLength={80}
                  />
                </label>
              )}
            </div>
            {!saveGate.ok && (
              <p className="up-gate" role="note">
                {saveGate.reason} Uncheck some plays, or <Link to="/pricing">see plans</Link>.
              </p>
            )}
            {ready.length > checkedCount && (
              <p className="hint" style={{ margin: 0 }}>
                Plays you haven't checked save marked <b>Needs a check</b>. Saving one in the Designer gives it the green check.
              </p>
            )}
            <div className="up-apply-acts sc-acts">
              {unread.length > 0 && (
                <button type="button" className={`btn ${ready.length ? "btn-ghost" : "btn-primary"}`} disabled={reading || busy} onClick={() => void readPicked(job.id, deps())}>
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
