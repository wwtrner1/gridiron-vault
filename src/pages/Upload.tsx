import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Icon } from "../components/Icon";
import { PlayThumb } from "../components/PlayThumb";
import { PhotoReview } from "../components/PhotoReview";
import { ScanReview } from "../components/ScanReview";
import { store, useStore } from "../lib/store";
import { useTier } from "../lib/tier";
import { gateSave } from "../lib/plan";
import { useToast } from "../lib/toast";
import { usePositionTokens } from "../lib/positions";
import { readDeck, slideToScene, type Deck, type ImportOptions } from "../lib/pptx";
import { uid } from "../lib/types";
import type { StoredPlay } from "../lib/types";
import "../styles/upload.css";

const MAX_BYTES = 50 * 1024 * 1024;
const KNOWN = new Set(["Q", "C", "X", "Y", "Z", "H", "S"]);
/** Common deck letters for backs, pre-mapped to GridIronVault's H (running back). */
const SUGGEST: Record<string, string> = { R: "H", F: "H", B: "H", T: "H", RB: "H", HB: "H", FB: "S", QB: "Q", W: "S", A: "S" };

const SOURCES = [
  { icon: "board", title: "PowerPoint deck", body: "Upload a .pptx playbook. Every slide with a play becomes a draft you can import in one batch.", ready: true },
  { icon: "upload", title: "Whiteboard photo", body: "Snap the board after practice. Marker circles, Xs and arrows are read as players and routes.", ready: true },
  { icon: "print", title: "Scanned page or PDF", body: "Binder pages and playbook PDFs. Every play on a page is found, cut out and redrawn, up to 20 pages at a time.", ready: true },
  { icon: "sparkle", title: "Screenshot", body: "Plays from another app, a clinic slide or a text from your coordinator.", ready: true },
];

/**
 * Upload plays, from the Grid1ron Design canvas (Upload · choose a source,
 * Upload · PowerPoint deck, Upload · review a whiteboard photo). Decks are
 * read in the browser; photos, scans and PDF pages (drawn to images in the
 * browser) go to the Play reader (Claude, through the API function): a page
 * is looked over for plays first, so a binder page with six plays becomes six.
 */
export function Upload() {
  const [deck, setDeck] = useState<Deck | null>(null);
  const location = useLocation();
  // A whiteboard photo dropped into Griddy's chat arrives here to be reviewed.
  const [photo, setPhoto] = useState<File | null>(() => {
    const handed = (location.state as { photo?: unknown } | null)?.photo;
    return handed instanceof File ? handed : null;
  });
  const [scan, setScan] = useState<File[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function take(files: File[]) {
    setError("");
    const file = files[0];
    if (!file) return;
    // Several scans or photos at once are pages of one scan.
    const pages = files.filter((f) => f.type.startsWith("image/") || f.type === "application/pdf" || /\.(jpe?g|png|heic|webp|pdf)$/i.test(f.name));
    if (files.length > 1) {
      if (!pages.length) return setError("Those files can't be read here. Use JPG, PNG, HEIC or PDF, or one PowerPoint deck at a time.");
      const big = pages.find((f) => f.size > MAX_BYTES);
      if (big) return setError(`${big.name} is over 50 MB. Split it into smaller files.`);
      return setScan(pages.slice(0, 20));
    }
    if (file.size > MAX_BYTES) return setError(`${file.name} is over 50 MB. Split the deck or export fewer slides.`);
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    if (ext === "pptx") {
      setBusy(true);
      try {
        setDeck(readDeck(file.name, new Uint8Array(await file.arrayBuffer())));
      } catch {
        setError(`${file.name} could not be read as a PowerPoint deck. Save it as .pptx from PowerPoint or Keynote and try again.`);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (ext === "ppt") return setError("That is an older .ppt file. Open it in PowerPoint, save it as .pptx, and upload that.");
    if (ext === "pdf" || file.type === "application/pdf") return setScan([file]);
    if (["jpg", "jpeg", "png", "heic", "webp"].includes(ext) || file.type.startsWith("image/")) {
      if (file.size > 20 * 1024 * 1024) return setError(`${file.name} is over 20 MB. Use a smaller photo.`);
      return setScan([file]);
    }
    setError(`${file.name} isn’t a file GridIronVault can read. Use JPG, PNG, HEIC, PDF or PPTX.`);
  }

  // Paste anywhere on the page (Ctrl+V).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        take(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  if (deck) return <DeckReview deck={deck} onBack={() => setDeck(null)} />;
  if (photo) return <PhotoReview file={photo} onBack={() => setPhoto(null)} />;
  if (scan)
    return (
      <ScanReview
        files={scan}
        onBack={() => setScan(null)}
        onSingle={(file) => {
          setScan(null);
          setPhoto(file);
        }}
      />
    );

  return (
    <Shell
      title="Upload plays"
      actions={
        <Link to="/vault" className="btn btn-ghost btn-sm">
          <Icon name="folder" size={15} /> The Vault
        </Link>
      }
    >
      <div className="up">
        <div className="up-head">
          <p className="eyebrow">Upload plays</p>
          <h2>Bring plays in from anywhere</h2>
          <p>
            Every coach has plays living somewhere else — a photo on your phone, an old PowerPoint, a binder. Drop them here and they
            come out as real, editable Vault plays.
          </p>
        </div>

        <div
          className={`up-drop${over ? " is-over" : ""}`}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            take(Array.from(e.dataTransfer.files));
          }}
        >
          <Icon name="upload" size={34} />
          <b>Drop plays here</b>
          <p>
            A whiteboard photo, a screenshot, scanned binder pages, a playbook PDF or a PowerPoint deck. GridIronVault finds every
            play, redraws it on the field and lets you check it before it goes in the Vault.
          </p>
          <div className="up-drop-acts">
            <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()} disabled={busy}>
              <Icon name="upload" size={15} /> {busy ? "Reading…" : "Choose files"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={async () => {
                try {
                  const items = await navigator.clipboard.read();
                  for (const it of items) {
                    const type = it.types.find((t) => t.startsWith("image/"));
                    if (type) return take([new File([await it.getType(type)], "pasted-image.png", { type })]);
                  }
                  setError("There is no image on your clipboard. Copy a play first, or press Ctrl+V here.");
                } catch {
                  setError("Your browser blocked clipboard access. Press Ctrl+V on this page instead.");
                }
              }}
            >
              Paste from clipboard
            </button>
          </div>
          <small>JPG · PNG · HEIC · PDF · PPTX · or press Ctrl+V anywhere on this page</small>
          <input
            ref={inputRef}
            type="file"
            hidden
            multiple
            accept=".jpg,.jpeg,.png,.heic,.webp,.pdf,.pptx,.ppt"
            onChange={(e) => (take(Array.from(e.target.files ?? [])), (e.target.value = ""))}
          />
        </div>

        {error && (
          <p className="error-line" role="alert">
            {error}
          </p>
        )}

        <div className="up-sources">
          {SOURCES.map((s) => (
            <div key={s.title} className="card up-source">
              <Icon name={s.icon} size={20} />
              <b>{s.title}</b>
              <p>{s.body}</p>
              <span className={`pill ${s.ready ? "pill-green" : "pill-special"}`}>{s.ready ? "Ready now" : "Coming soon"}</span>
            </div>
          ))}
        </div>

        <p className="up-note">
          Nothing is saved until you press Import or Save. Your files stay on your own plays and are never shared with other coaches.
        </p>
      </div>
    </Shell>
  );
}

function DeckReview({ deck, onBack }: { deck: Deck; onBack: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const tier = useTier();
  const plays = useStore((s) => s.plays);
  const playbooks = useStore((s) => s.playbooks);
  const offense = usePositionTokens();

  const found = deck.slides.filter((s) => s.hasPlay);
  const [picked, setPicked] = useState<number[]>(found.map((s) => s.index));
  const [format, setFormat] = useState<ImportOptions["format"]>("vault");
  const deckName = deck.name.replace(/\.pptx$/i, "");
  const [target, setTarget] = useState<string>("new");
  const unknown = useMemo(
    () => [...new Set(found.flatMap((s) => s.letters))].filter((l) => !KNOWN.has(l) && !/^\d+$/.test(l)),
    [found],
  );
  const [letterMap, setLetterMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(unknown.filter((l) => SUGGEST[l]).map((l) => [l, SUGGEST[l]])),
  );

  const opts: ImportOptions = { format, letterMap, offense };
  const scenes = useMemo(
    () => Object.fromEntries(found.map((s) => [s.index, slideToScene(s, opts)])),
    [deck, format, letterMap, offense],
  );

  const room = tier.playLimit - plays.length;
  const count = picked.length;
  const gate = gateSave(tier, plays.length + count - 1);

  function importPlays() {
    const now = new Date().toISOString();
    const made: StoredPlay[] = found
      .filter((s) => picked.includes(s.index))
      .map((s) => ({
        id: uid("play"),
        name: s.title || `${deckName} — slide ${s.index}`,
        formation: "",
        playType: "pass",
        personnel: "",
        description: s.notes,
        tags: ["imported"],
        isPublic: false,
        ownerName: "You",
        fieldView: "half",
        scene: scenes[s.index],
        preview: "",
        saveCount: 0,
        updatedAt: now,
        remote: false,
      }));
    made.forEach((p) => store.upsertPlay(p));
    if (target !== "none") {
      const existing = playbooks.find((b) => b.id === target);
      const book = existing ?? { id: uid("book"), name: deckName, description: `Imported from ${deck.name}`, color: "#16C8E8", isPublic: false, playIds: [] };
      store.upsertPlaybook({ ...book, playIds: [...book.playIds, ...made.map((p) => p.id)], updatedAt: now });
    }
    toast(`${made.length} ${made.length === 1 ? "play" : "plays"} imported into your Vault. Open any one to check it.`);
    navigate("/vault");
  }

  return (
    <Shell
      title="Import PowerPoint"
      actions={
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <Icon name="upload" size={15} /> Upload more
        </button>
      }
    >
      <div className="up">
        <div className="up-head">
          <p className="eyebrow">
            Draft · not saved · {deck.name} · {deck.slides.length} slides
          </p>
          <h2>
            {found.length} {found.length === 1 ? "play" : "plays"} found in your deck
          </h2>
          <p>
            Each slide with a play is redrawn from its shapes and arrows. Slide titles become play names, speaker notes become
            coaching notes. Uncheck anything you don’t want.
          </p>
          <div className="up-bulk">
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPicked(found.map((s) => s.index))}>
              Select all plays
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPicked([])}>
              Clear
            </button>
          </div>
        </div>

        {found.length === 0 && (
          <div className="empty">
            <Icon name="board" size={40} />
            <h3>No plays drawn with shapes in this deck</h3>
            <p>
              Plays drawn with PowerPoint circles, letters and arrows import from the deck. If your plays are pictures pasted into
              slides, save the deck as a PDF and upload that: every play on every slide is read.
            </p>
            <button type="button" className="btn btn-ghost" onClick={onBack}>
              Upload another file
            </button>
          </div>
        )}

        <div className="up-slides">
          {deck.slides.map((s) => (
            <label key={s.index} className={`card up-slide${s.hasPlay ? "" : " is-skipped"}`}>
              <div className="up-slide-top">
                <input
                  type="checkbox"
                  aria-label={`Import slide ${s.index}`}
                  disabled={!s.hasPlay}
                  checked={picked.includes(s.index)}
                  onChange={(e) => setPicked((l) => (e.target.checked ? [...l, s.index] : l.filter((x) => x !== s.index)))}
                />
                <span className="mono">Slide {s.index}</span>
                <span className={`pill ${s.hasPlay ? "pill-green" : "pill-special"}`}>{s.hasPlay ? "Play found" : "Skipped"}</span>
              </div>
              {s.hasPlay ? (
                <div className="up-slide-art">
                  <PlayThumb scene={scenes[s.index]} label={s.title || `Slide ${s.index}`} />
                </div>
              ) : (
                <p className="up-slide-why">{s.reason}</p>
              )}
              <b className="up-slide-title">{s.title || "Untitled slide"}</b>
            </label>
          ))}
        </div>

        {found.length > 0 && (
          <div className="card up-apply">
            <div className="up-apply-grid">
              <div className="up-field" role="radiogroup" aria-labelledby="up-format">
                <span id="up-format">Apply to every play</span>
                <label className="switch">
                  <input type="radio" name="format" checked={format === "vault"} onChange={() => setFormat("vault")} />
                  Use my Vault format (default position colors)
                </label>
                <label className="switch">
                  <input type="radio" name="format" checked={format === "slide"} onChange={() => setFormat("slide")} />
                  Keep slide layout and colors
                </label>
              </div>
              <label className="up-field">
                <span>Add to playbook</span>
                <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="new">{deckName} (new)</option>
                  {playbooks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                  <option value="none">Don’t add to a playbook</option>
                </select>
              </label>
              {unknown.length > 0 && (
                <div className="up-field">
                  <span>Letters</span>
                  {unknown.map((l) => (
                    <label key={l} className="up-letter">
                      Deck uses <b>{l}</b> →
                      <select
                        className="select"
                        value={letterMap[l] ?? ""}
                        onChange={(e) => setLetterMap((m) => ({ ...m, [l]: e.target.value }))}
                        aria-label={`Map deck letter ${l}`}
                      >
                        <option value="">Keep {l}</option>
                        {["Q", "C", "X", "Y", "Z", "H", "S"].map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {!gate.ok && (
              <p className="up-gate" role="note">
                Your {tier.name} Vault has room for {Math.max(0, room)} more {room === 1 ? "play" : "plays"}. Uncheck some slides, or{" "}
                <Link to="/pricing">see plans</Link>.
              </p>
            )}
            <div className="up-apply-acts">
              <button type="button" className="btn btn-primary" disabled={!count || !gate.ok} onClick={importPlays}>
                Import {count} {count === 1 ? "play" : "plays"} to Vault
              </button>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
