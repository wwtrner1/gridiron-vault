import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Shell } from "./Shell";
import { Icon } from "./Icon";
import { PlayThumb } from "./PlayThumb";
import { api } from "../lib/api";
import { ACTION_LABEL, nearMatch } from "../lib/assistant";
import { aiUsage } from "../lib/aiUsage";
import { useAuth } from "../lib/auth";
import { gateAi, gateSave } from "../lib/plan";
import { asAssistantRead, letterChanges, photoLayoutNodes, prepareImage, vaultFormatNodes } from "../lib/photo";
import type { PhotoRead } from "../lib/photo";
import { usePositionTokens } from "../lib/positions";
import type { TokenPreset } from "../lib/presets";
import { emptyScene } from "../lib/presets";
import { store, useStore } from "../lib/store";
import { useTerms } from "../lib/terms";
import { useTier } from "../lib/tier";
import { useToast } from "../lib/toast";
import { uid } from "../lib/types";
import type { StoredPlay } from "../lib/types";

const GAME_KEY = "grid1ronvault.formationLib.v1";
export const currentGame = (): "5v5" | "7v7" | "11" => {
  try {
    const g = JSON.parse(localStorage.getItem(GAME_KEY) ?? "{}").game;
    return g === "7v7" || g === "11" ? g : "5v5";
  } catch {
    return "5v5";
  }
};

type Stage = { kind: "reading" } | { kind: "error"; text: string; plans?: boolean } | { kind: "done"; read: PhotoRead };
export type PhotoFormat = "vault" | "photo";

/** The play as it will save: the Formation library's spacing when the formation is known, else as drawn. */
export function photoScene(read: PhotoRead, aspect: number, format: PhotoFormat, tokens: TokenPreset[]) {
  const base = emptyScene(420);
  const useVault = format === "vault" && read.formation !== "Custom";
  const nodes = useVault ? vaultFormatNodes(read, tokens, aspect, base.losY, 1) : photoLayoutNodes(read, tokens, aspect, base.losY, 1);
  return { ...base, nodes };
}

/** One play from a scanned page, already read: checked here, then handed back to the page's list. */
export type PhotoCheck = {
  read: PhotoRead;
  url: string;
  aspect: number;
  format: PhotoFormat;
  onUse: (read: PhotoRead, format: PhotoFormat) => void;
};

/**
 * Review a whiteboard photo, from the Grid1ron Design canvas. The photo is
 * shrunk in the browser, read by Claude through the API function, and
 * rebuilt on the field. Nothing is saved until the coach presses Save.
 * With `check`, the play was already read from a scanned page: nothing is
 * read again, and "Use this version" hands the answers back to that page.
 */
export function PhotoReview({ file, onBack, check }: { file: File; onBack: () => void; check?: PhotoCheck }) {
  const navigate = useNavigate();
  const toast = useToast();
  const tier = useTier();
  const { account } = useAuth();
  const { terms } = useTerms();
  const tokens = usePositionTokens();
  const plays = useStore((s) => s.plays);
  const [img, setImg] = useState<{ url: string; aspect: number } | null>(check ? { url: check.url, aspect: check.aspect } : null);
  const [stage, setStage] = useState<Stage>(check ? { kind: "done", read: check.read } : { kind: "reading" });
  const [format, setFormat] = useState<PhotoFormat>(check?.format ?? "vault");
  const [asked, setAsked] = useState(0);

  useEffect(() => {
    if (check) return;
    let live = true;
    (async () => {
      let prepared;
      try {
        prepared = await prepareImage(file);
      } catch {
        return setStage({
          kind: "error",
          text: `${file.name} couldn't be opened in this browser. HEIC photos from an iPhone open in Safari; elsewhere, save it as JPG and upload that.`,
        });
      }
      if (!live) return;
      // Show the photo first, even if it can't be read yet.
      setImg({ url: prepared.url, aspect: prepared.aspect });
      if (!account) return setStage({ kind: "error", text: "Sign in to have GridIronVault read your photo. It is included with every plan." });
      const gate = gateAi(tier, "photo", aiUsage.used("photo"));
      if (!gate.ok) return setStage({ kind: "error", text: gate.reason, plans: true });
      try {
        const res = await api.photo({ image: prepared.data, game: currentGame(), terms: terms.map((t) => ({ term: t.term, means: t.means })) });
        aiUsage.add("photo");
        if (live) setStage({ kind: "done", read: res.read });
      } catch (e) {
        if (live) setStage({ kind: "error", text: e instanceof Error ? e.message : "The photo couldn't be read just now." });
      }
    })();
    return () => {
      live = false;
    };
    // The photo is read once per file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const read = stage.kind === "done" ? stage.read : null;
  const known = !!read && read.formation !== "Custom";
  const useVault = format === "vault" && known;
  const scene = useMemo(() => (read && img ? photoScene(read, img.aspect, useVault ? "vault" : "photo", tokens) : null), [read, img, useVault, tokens]);
  const match = useMemo(() => (read ? nearMatch(asAssistantRead(read), plays) : null), [read, plays]);
  const question = read?.questions[asked];
  const changes = read ? letterChanges(read) : [];
  const saveGate = gateSave(tier, plays.length);

  const answer = (option: string) => {
    if (!read || !question) return;
    const assignments = read.assignments.map((a) =>
      a.player.toUpperCase() === question.player.toUpperCase() ? { ...a, action: option, kind: "route" as const } : a,
    );
    setStage({ kind: "done", read: { ...read, assignments } });
    setAsked((n) => n + 1);
  };

  function save(open: boolean) {
    if (!read || !scene) return;
    if (!saveGate.ok) return toast(saveGate.reason, true);
    const play: StoredPlay = {
      id: uid("play"),
      name: read.name,
      formation: known ? read.formation : "",
      playType: "pass",
      personnel: "",
      description: `Read from ${file.name}.`,
      tags: ["imported", "whiteboard"],
      isPublic: false,
      ownerName: "You",
      fieldView: "half",
      scene,
      preview: "",
      saveCount: 0,
      updatedAt: new Date().toISOString(),
      remote: false,
    };
    store.upsertPlay(play);
    toast(`${play.name} saved to your Vault.`);
    navigate(open ? `/build/${play.id}` : "/vault");
  }

  return (
    <Shell
      title="Review upload"
      actions={
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <Icon name="upload" size={15} /> {check ? "Back to the page" : "Upload more"}
        </button>
      }
    >
      <div className="up pr">
        <div className="up-head">
          <p className="eyebrow">
            Draft · not saved · <span className="mono">{file.name}</span>
          </p>
          <h2>{read ? (read.isPlay ? "Is this the play on your board?" : "We couldn't find a play here") : stage.kind === "error" ? "Your photo" : "Reading your photo…"}</h2>
        </div>

        {stage.kind === "error" && (
          <p className="error-line" role="alert">
            {stage.text} {stage.plans && <Link to="/pricing">See plans</Link>}
          </p>
        )}

        <div className="pr-pair">
          <figure className="card pr-card">
            <figcaption>
              <b>Your photo</b> <span className="mono">Original</span>
            </figcaption>
            {img ? <img src={img.url} alt={`Photo: ${file.name}`} /> : <div className="pr-wait">Opening the photo…</div>}
          </figure>
          <figure className="card pr-card">
            <figcaption>
              <b>Rebuilt on the field</b> <span className="mono">{read?.name ?? ""}</span>
            </figcaption>
            {scene ? (
              <div className="pr-field">
                <PlayThumb scene={scene} label={read?.name} />
              </div>
            ) : (
              <div className="pr-wait" role="status">
                {stage.kind === "reading" ? "Reading the players and routes — this takes a few seconds." : "Nothing to show yet."}
              </div>
            )}
          </figure>
        </div>

        {read && !read.isPlay && <p className="up-wait">{read.reason || "Try a clearer photo of the board, taken straight on."}</p>}

        {read?.isPlay && (
          <div className="pr-grid">
            <div className="card pr-found">
              <h3>What we found</h3>
              <div className="pr-chips">
                {read.players
                  .filter((p) => p.side === "offense")
                  .map((p, i) => {
                    const a = read.assignments.find((x) => x.player.toUpperCase() === p.vault.toUpperCase());
                    return (
                      <span key={i} className="chip">
                        {p.vault} · {a ? ACTION_LABEL(a) : p.vault === "Q" ? "quarterback" : p.vault === "C" ? "center" : "no route"}
                      </span>
                    );
                  })}
              </div>
              {question && (
                <div className="pr-check" role="group" aria-labelledby="pr-q">
                  <b>One thing to check</b>
                  <p id="pr-q">{question.question}</p>
                  <div className="pr-opts">
                    {question.options.map((o) => (
                      <button key={o} type="button" className="btn btn-ghost btn-sm" onClick={() => answer(o)}>
                        {o.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {changes.length > 0 ? (
                <p className="pr-note">
                  {changes.map(([b, v]) => `Your board used ${b} for the player your Vault calls ${v}.`).join(" ")} They're drawn with your
                  Vault letters.
                </p>
              ) : (
                <p className="pr-note">Your board's letters match your Vault — no letters to map.</p>
              )}
            </div>

            <div className="card pr-format">
              <h3>How should it look?</h3>
              <label className={`pr-opt${useVault ? " is-on" : ""}`}>
                <input type="radio" name="pr-format" checked={useVault} disabled={!known} onChange={() => setFormat("vault")} />
                <span>
                  <b>Use my Vault format</b>
                  <small>
                    {known
                      ? `The Formation library's ${read.formation} spacing, your colors and letters.`
                      : "The board's formation isn't one in the library, so the photo's layout is used."}
                  </small>
                </span>
              </label>
              <label className={`pr-opt${!useVault ? " is-on" : ""}`}>
                <input type="radio" name="pr-format" checked={!useVault} onChange={() => setFormat("photo")} />
                <span>
                  <b>Keep the photo's layout</b>
                  <small>Spacing as drawn, in GridIronVault colors.</small>
                </span>
              </label>
              {match && (
                <p className="pr-note">
                  Near match already in your Vault: <Link to={`/build/${match.id}`}>{match.name}</Link>
                </p>
              )}
            </div>
          </div>
        )}

        {read?.isPlay && check && (
          <div className="pr-acts">
            <button type="button" className="btn btn-primary" onClick={() => check.onUse(read, useVault ? "vault" : "photo")}>
              Use this version
            </button>
            <button type="button" className="btn btn-ghost" onClick={onBack}>
              Back to the page
            </button>
          </div>
        )}

        {read?.isPlay && !check && (
          <div className="pr-acts">
            {!saveGate.ok && (
              <p className="up-gate">
                {saveGate.reason} <Link to="/pricing">See plans</Link>
              </p>
            )}
            <button type="button" className="btn btn-primary" onClick={() => save(false)} disabled={!saveGate.ok}>
              Save to Vault
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => save(true)} disabled={!saveGate.ok}>
              Open in Designer
            </button>
            <button type="button" className="btn btn-ghost" onClick={onBack}>
              Upload a different image
            </button>
          </div>
        )}
      </div>
    </Shell>
  );
}
