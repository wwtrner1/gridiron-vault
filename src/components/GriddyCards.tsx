import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { ACTION_LABEL, BLOCK_IDS, nearMatch, PLAYER_LETTERS, readToNodes, ROUTE_IDS, trustSaidLetters } from "../lib/assistant";
import type { Assignment, AssistantRead } from "../lib/assistant";
import { useAuth } from "../lib/auth";
import { describeChange, editScene, planBulkEdit, restorePlayers } from "../lib/bulkEdit";
import type { BulkEdit, BulkFiling, BulkTarget } from "../lib/bulkEdit";
import { colorName } from "../lib/colors";
import { GRIDDY } from "../lib/griddy";
import type { CallSheetLine, GriddyAction, ImportItem } from "../lib/griddy";
import { currentGame, playFromRead, savePlays } from "../lib/griddyVault";
import { gateGrid, gateSave } from "../lib/plan";
import { gridFromPlays } from "../lib/sheet";
import { usePositionTokens } from "../lib/positions";
import { emptyScene } from "../lib/presets";
import { nextZ } from "../lib/scene";
import { store, useStore } from "../lib/store";
import { useTerms } from "../lib/terms";
import { useTier } from "../lib/tier";
import type { StoredPlay } from "../lib/types";
import { useToast } from "../lib/toast";
import { chooseBandPreset } from "../lib/wristbands";
import { useGriddy } from "./Griddy";
import { Icon } from "./Icon";
import { PlayThumb } from "./PlayThumb";

export function GriddyActionCard({ action }: { action: GriddyAction }) {
  if (action.tool === "draw_play") return <DrawCard id={action.id} initial={action.read} />;
  if (action.tool === "import_plays") return <ImportCard id={action.id} plays={action.plays} playbook={action.playbook} />;
  if (action.tool === "bulk_edit") return <BulkCard id={action.id} edit={{ scope: action.scope, changes: action.changes }} />;
  if (action.tool === "build_call_sheet") return <CallSheetCard id={action.id} name={action.name} lines={action.lines} />;
  return <PlaysCard ids={action.ids} />;
}

/** One play, as chips the coach can fix, a preview, and nothing drawn or saved until they say so. */
function DrawCard({ id, initial }: { id: string; initial: AssistantRead }) {
  const { drawer, outcomes, setOutcome, setOpen, dance } = useGriddy();
  const navigate = useNavigate();
  const toast = useToast();
  const tier = useTier();
  const { account } = useAuth();
  const plays = useStore((s) => s.plays);
  const ownTokens = usePositionTokens();
  const [read, setRead] = useState(initial);
  const [edited, setEdited] = useState(false);
  const firstChip = useRef<HTMLSelectElement>(null);
  const done = outcomes[id];

  const scene = drawer?.scene ?? emptyScene();
  const tokens = drawer?.tokens ?? ownTokens;
  const proposed = useMemo(() => readToNodes(read, tokens, scene.losY, drawer ? nextZ(scene) : 1), [read, tokens, scene, drawer]);
  // Anyone the call gave a job who still isn't on the field, so no route goes missing quietly.
  const missing = useMemo(() => {
    const on = new Set(proposed.flatMap((n) => (n.kind === "player" && n.label ? [n.label.toUpperCase()] : [])));
    return [...new Set(read.assignments.map((a) => a.player.toUpperCase()))].filter((l) => !on.has(l));
  }, [read, proposed]);
  const match = useMemo(() => nearMatch(read, plays), [read, plays]);

  const change = (fn: (r: AssistantRead) => AssistantRead) => {
    setRead(fn);
    setEdited(true);
  };
  const fix = (i: number, patch: Partial<Assignment>) =>
    change((r) => ({ ...r, assignments: r.assignments.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));
  const final = () => (edited ? ` The coach fixed the chips first; final play: ${JSON.stringify(read)}` : "");

  function draw() {
    if (!drawer) return;
    drawer.onDraw(proposed, read);
    setOutcome(id, `The coach drew "${read.name}" on the field in the Designer.${final()}`);
    dance();
    if (window.matchMedia("(max-width: 900px)").matches) setOpen(false);
  }

  async function save() {
    const gate = gateSave(tier, plays.length);
    if (!gate.ok) return toast(gate.reason, true);
    const play = playFromRead(read, tokens, { note: `Drawn by ${GRIDDY}.`, tags: ["griddy"] });
    const [saved] = await savePlays([play], { playbook: null, signedIn: Boolean(account) });
    setOutcome(id, `The coach saved "${saved.name}" to the Vault (id ${saved.id}).${final()}`);
    toast(`${saved.name} saved to your Vault.`);
    dance();
  }

  return (
    <div className="pa-read gd-card">
      <p className="pa-kicker">Here’s how I read it · {read.name}</p>
      <div className="pa-chips">
        <span className="pa-chip">Formation · {read.formation}</span>
        {read.assignments.length === 0 && <span className="pa-chip">No routes named — the set only</span>}
        {read.assignments.map((a, i) => (
          <span key={i} className={`pa-chip${a.firstRead ? " is-read" : ""}`} title={a.heard ? `From “${a.heard}”` : undefined}>
            {/* Either half of a chip can be changed: who runs it, and what he runs. */}
            <select
              className="pa-chip-player"
              value={a.player.toUpperCase()}
              aria-label={`Player for ${ACTION_LABEL(a)}`}
              onChange={(e) => fix(i, { player: e.target.value })}
              disabled={Boolean(done)}
            >
              {!PLAYER_LETTERS.some((l) => l.letter === a.player.toUpperCase()) && <option value={a.player.toUpperCase()}>{a.player.toUpperCase()}</option>}
              {PLAYER_LETTERS.map((l) => (
                <option key={l.letter} value={l.letter}>
                  {l.letter} · {l.means}
                </option>
              ))}
            </select>
            ·
            <select
              ref={i === 0 ? firstChip : undefined}
              value={a.kind === "motion" ? "motion" : a.action}
              aria-label={`${a.player} assignment`}
              disabled={Boolean(done)}
              onChange={(e) => {
                const v = e.target.value;
                fix(i, { action: v, kind: v === "motion" ? "motion" : BLOCK_IDS.includes(v) && !ROUTE_IDS.includes(v) ? "block" : "route" });
              }}
            >
              <optgroup label="Routes">
                {ROUTE_IDS.map((r) => (
                  <option key={r} value={r}>
                    {r.replace(/_/g, " ")}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Blocks">
                {BLOCK_IDS.filter((b) => !ROUTE_IDS.includes(b)).map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </optgroup>
              <option value="motion">motion</option>
            </select>
            <span className="sr-only">{ACTION_LABEL(a)}</span>
            {!done && (
              <button
                type="button"
                className="pa-chip-x"
                onClick={() => change((r) => ({ ...r, assignments: r.assignments.filter((_, j) => j !== i) }))}
                aria-label={`Remove ${a.player} ${ACTION_LABEL(a)}`}
              >
                <Icon name="close" size={11} />
              </button>
            )}
          </span>
        ))}
        {!done && (
          <button
            type="button"
            className="pa-chip pa-chip-add"
            onClick={() =>
              change((r) => {
                const used = new Set(r.assignments.map((x) => x.player.toUpperCase()));
                const free = PLAYER_LETTERS.find((l) => !used.has(l.letter))?.letter ?? "X";
                return { ...r, assignments: [...r.assignments, { player: free, kind: "route", action: "go", heard: "" }] };
              })
            }
          >
            + Add a player
          </button>
        )}
      </div>
      {(read.unsure.length > 0 || missing.length > 0) && !done && (
        <ul className="pa-unsure">
          {missing.map((l) => (
            <li key={`missing-${l}`}>
              {read.formation} has no {l} here, so {l}'s route isn't drawn. Pick another formation or add {l} after drawing.
            </li>
          ))}
          {read.unsure.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      )}
      <div className="pa-preview">
        <PlayThumb scene={{ ...scene, nodes: proposed }} label={`Preview of ${read.name}`} />
        <span className="pa-badge">{done ? "Done" : "Preview · not saved until confirmed"}</span>
      </div>
      {done ? (
        <p className="gd-done">
          <Icon name="check" size={14} /> {done.split(" The coach fixed")[0].replace(/ \(id [^)]+\)/, "").replace(/^The coach/, "You")}
        </p>
      ) : (
        <div className="pa-confirm">
          <span className="pa-q">Is this the play you called?</span>
          {match && (
            <span className="pa-match">
              Near match in your Vault: <Link to={`/build/${match.id}`}>{match.name}</Link>
            </span>
          )}
          <div className="pa-acts">
            <button type="button" className="pa-btn" onClick={() => firstChip.current?.focus()} disabled={!read.assignments.length}>
              Fix a chip
            </button>
            <button type="button" className="pa-btn" onClick={() => void save()}>
              Save to Vault
            </button>
            {drawer ? (
              <button type="button" className="pa-btn is-primary" onClick={draw}>
                Yes, draw it
              </button>
            ) : (
              <button type="button" className="pa-btn is-primary" onClick={() => navigate("/build", { state: { skipSetup: true } })}>
                Open the Designer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type Row = ImportItem & { key: number; include: boolean; status: "waiting" | "reading" | "ready" | "failed"; read?: AssistantRead; problem?: string };

/** How many plays are read at once: quick, without tripping the provider's rate limit. */
const AT_ONCE = 3;

/**
 * A dump of plays: Griddy split it, each play is read on its own (the same
 * read as one called play), and the coach checks them before one tap puts
 * them all in the Vault.
 */
function ImportCard({ id, plays, playbook }: { id: string; plays: ImportItem[]; playbook: string | null }) {
  const { outcomes, setOutcome, dance } = useGriddy();
  const { account } = useAuth();
  const { terms } = useTerms();
  const tier = useTier();
  const toast = useToast();
  const tokens = usePositionTokens();
  const vaultSize = useStore((s) => s.plays.length);
  const [rows, setRows] = useState<Row[]>(() => plays.map((p, key) => ({ ...p, key, include: true, status: "waiting" })));
  const [book, setBook] = useState(playbook ?? "");
  const [running, setRunning] = useState(false);
  const [stopped, setStopped] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const done = outcomes[id];
  const base = useMemo(() => emptyScene(), []);

  const patch = (key: number, p: Partial<Row>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...p } : r)));

  async function readAll() {
    setRunning(true);
    setStopped(null);
    const queue = rows.filter((r) => r.include && r.status !== "ready");
    let halt: string | null = null;
    const worker = async () => {
      for (let row = queue.shift(); row && !halt; row = queue.shift()) {
        patch(row.key, { status: "reading", problem: undefined });
        try {
          const res = await api.assistant({
            call: row.call,
            game: currentGame(),
            terms: terms.map((t) => ({ term: t.term, means: t.means })),
            bulk: true,
          });
          patch(row.key, { status: "ready", read: trustSaidLetters({ ...res.read, name: row.name || res.read.name }) });
        } catch (e) {
          const text = e instanceof Error ? e.message : "Couldn't read that one.";
          patch(row.key, { status: "failed", problem: text });
          // A daily limit or a busy service stops the rest instead of failing each one.
          if (/daily limit|busy|switched on/i.test(text)) halt = text;
        }
      }
    };
    await Promise.all(Array.from({ length: AT_ONCE }, worker));
    setRunning(false);
    if (halt) setStopped(halt);
  }

  const ready = rows.filter((r) => r.include && r.status === "ready" && r.read);
  const room = tier.playLimit - vaultSize;
  const full = gateSave(tier, vaultSize + ready.length - 1);

  async function saveAll() {
    if (!full.ok) return toast(`${ready.length} plays won't fit: your ${tier.name} Vault has room for ${Math.max(0, room)} more.`, true);
    setSaving(true);
    try {
      const made = ready.map((r) =>
        playFromRead(r.read!, tokens, { name: r.name, note: `Imported by ${GRIDDY} from: ${r.call}`, tags: ["griddy", "imported"] }),
      );
      const saved = await savePlays(made, { playbook: book.trim() || null, signedIn: Boolean(account) });
      const left = rows.filter((r) => !(r.include && r.status === "ready"));
      const where = book.trim() ? ` and filed them in the playbook "${book.trim()}"` : "";
      setOutcome(
        id,
        `The coach saved ${saved.length} plays to the Vault${where}.${left.length ? ` Not saved: ${left.map((r) => `"${r.name}"${r.problem ? ` (${r.problem})` : ""}`).join(", ")}.` : ""}`,
      );
      toast(`${saved.length} plays saved to your Vault.`);
      dance();
    } finally {
      setSaving(false);
    }
  }

  const readCount = rows.filter((r) => r.status === "ready").length;
  const included = rows.filter((r) => r.include).length;

  return (
    <div className="gd-card gd-import">
      <p className="pa-kicker">
        {plays.length} plays from your list · {readCount} drawn
      </p>
      <ol className="gd-import-list">
        {rows.map((r) => (
          <li key={r.key} className={`gd-import-row is-${r.status}${r.include ? "" : " is-out"}`}>
            <label className="gd-import-pick">
              <input
                type="checkbox"
                checked={r.include}
                disabled={Boolean(done) || running}
                onChange={(e) => patch(r.key, { include: e.target.checked })}
                aria-label={`Include ${r.name}`}
              />
            </label>
            <div className="gd-import-text">
              <input
                className="gd-import-name"
                value={r.name}
                aria-label="Play name"
                disabled={Boolean(done)}
                onChange={(e) => patch(r.key, { name: e.target.value })}
              />
              <input
                className="gd-import-call"
                value={r.call}
                aria-label={`Call for ${r.name}`}
                disabled={Boolean(done) || r.status === "reading"}
                onChange={(e) => patch(r.key, { call: e.target.value, status: "waiting", read: undefined })}
              />
              {r.problem && <span className="gd-import-problem">{r.problem}</span>}
            </div>
            <div className="gd-import-thumb" aria-live="polite">
              {r.read ? (
                <PlayThumb scene={{ ...base, nodes: readToNodes(r.read, tokens, base.losY, 1) }} label={r.name} />
              ) : (
                <span>{r.status === "reading" ? "Drawing…" : r.status === "failed" ? "Couldn't draw" : "Waiting"}</span>
              )}
            </div>
          </li>
        ))}
      </ol>
      {stopped && <p className="pa-error">{stopped}</p>}
      {done ? (
        <p className="gd-done">
          <Icon name="check" size={14} /> {done.replace(/^The coach/, "You")}
        </p>
      ) : (
        <div className="gd-import-acts">
          <label className="gd-import-book">
            <span>Playbook (optional)</span>
            <input value={book} onChange={(e) => setBook(e.target.value)} placeholder="Just the Vault" maxLength={120} />
          </label>
          <div className="pa-acts">
            <button type="button" className="pa-btn" onClick={() => void readAll()} disabled={running || !rows.some((r) => r.include && r.status !== "ready")}>
              {running ? `Drawing ${readCount}/${included}…` : readCount ? "Draw the rest" : `Draw all ${included}`}
            </button>
            <button type="button" className="pa-btn is-primary" onClick={() => void saveAll()} disabled={running || saving || !ready.length}>
              {saving ? "Saving…" : `Save ${ready.length} to Vault`}
            </button>
          </div>
          {ready.length > 0 && !full.ok && (
            <p className="pa-error">
              Your {tier.name} Vault has room for {Math.max(0, room)} more. Untick some, or <Link to="/pricing">see plans</Link>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Plays Griddy found in the coach's Vault. */
function PlaysCard({ ids }: { ids: string[] }) {
  const all = useStore((s) => s.plays);
  const found = ids.flatMap((id) => all.filter((p) => p.id === id));
  if (!found.length) return <p className="gd-done">Those plays aren't in this Vault any more.</p>;
  return (
    <ul className="gd-card gd-plays">
      {found.map((p) => (
        <li key={p.id}>
          <Link to={`/build/${p.id}`} className="gd-play">
            <PlayThumb scene={p.scene} label={p.name} />
            <span>{p.name}</span>
            {p.formation && <small>{p.formation}</small>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Saved plays changed in place: this browser first, then the account copy of any play that has one. */
async function writePlays(plays: StoredPlay[], signedIn: boolean) {
  plays.forEach((p) => store.upsertPlay(p));
  if (!signedIn) return;
  for (const p of plays.filter((x) => x.remote)) {
    try {
      await api.updatePlay(p.id, { scene: p.scene, fieldView: p.scene.view, name: p.name, formation: p.formation, playType: p.playType, tags: p.tags });
    } catch {
      /* the local copy is already updated; it syncs on the next save */
    }
  }
}

/** Playbooks a bulk edit files plays in: written in this browser, and a new one made on the account too. */
async function writeFilings(filings: BulkFiling[], signedIn: boolean, back = false) {
  for (const f of filings) {
    const current = store.get().playbooks.find((b) => b.id === f.book.id);
    if (back) {
      // Only a playbook still as the edit left it goes back; one made by the edit goes away.
      if (!current || JSON.stringify(current.playIds) !== JSON.stringify(f.after)) continue;
      if (f.created) store.removePlaybook(f.book.id);
      else store.upsertPlaybook({ ...current, playIds: f.before, updatedAt: new Date().toISOString() });
      continue;
    }
    store.upsertPlaybook({ ...(current ?? f.book), playIds: f.after, updatedAt: new Date().toISOString() });
  }
}

/**
 * Many plays changed at once ("every Y yellow", "S out, H in"). The card
 * counts what changes and shows a before and after; nothing is written until
 * the coach applies it, and Undo puts every play back as it was.
 */
function BulkCard({ id, edit }: { id: string; edit: BulkEdit }) {
  const { outcomes, setOutcome, drawer, dance } = useGriddy();
  const { account } = useAuth();
  const toast = useToast();
  const tokens = usePositionTokens();
  const plays = useStore((s) => s.plays);
  const books = useStore((s) => s.playbooks);
  const live = useMemo(() => planBulkEdit(edit, plays, books, tokens), [edit, plays, books, tokens]);
  /** What was written, kept for Undo. */
  const [applied, setApplied] = useState<{ targets: BulkTarget[]; filings: BulkFiling[] } | null>(null);
  const [undone, setUndone] = useState(false);
  const [busy, setBusy] = useState(false);
  const done = outcomes[id];

  const changes = edit.changes.map((c) => describeChange(c, (hex) => colorName(hex).toLowerCase()));
  const where =
    edit.scope.kind === "vault" ? "your whole Vault" : edit.scope.kind === "playbook" ? `the playbook "${edit.scope.name}"` : `${edit.scope.ids.length} picked plays`;
  const targets = applied?.targets ?? live.targets;
  const filings = applied?.filings ?? live.filings;
  const band = edit.changes.find((c) => c.op === "wristband");
  const bandBook = edit.scope.kind === "playbook" ? books.find((b) => b.name.trim().toLowerCase() === (edit.scope as { name: string }).name.trim().toLowerCase()) : undefined;
  // Filing touches every play in scope, even ones whose field doesn't change.
  const count = filings.length ? Math.max(targets.length, live.inScope) : targets.length;
  // A wristband look on plays that already have it still sets the Wristbands page.
  const anything = targets.length > 0 || filings.length > 0 || Boolean(band);
  const players = targets.reduce((n, t) => n + t.players, 0);
  const doubled = targets.filter((t) => t.doubled.length);
  const changeLabel = `Griddy: ${changes.join(", ")}`;

  async function apply() {
    const list = live.targets;
    const books = live.filings;
    if (!list.length && !books.length && !band) return;
    setBusy(true);
    try {
      await writePlays(
        list.map((t) => t.after),
        Boolean(account),
      );
      await writeFilings(books, Boolean(account));
      if (band?.op === "wristband") chooseBandPreset(band.format);
      // The play open in the Designer changes on the field too, so its next save keeps the edit.
      const open = list.find((t) => t.before.id === drawer?.playId);
      if (drawer && open) {
        drawer.onEdit((field) => editScene(field, edit.changes, tokens).scene, changeLabel);
        // A flip renames "Trips Right" to "Trips Left", and a category change sets the type and tags; the Designer's copy follows, or its next save puts them back.
        drawer.onMeta({ name: open.after.name, formation: open.after.formation, playType: open.after.playType, tags: open.after.tags });
      }
      setApplied({ targets: list, filings: books });
      setOutcome(
        id,
        `The coach applied ${changes.join(", ")} to ${list.length} plays in ${where} (${list.reduce((n, t) => n + t.players, 0)} players, lines or text boxes changed${books.length ? `; playbooks updated: ${books.map((f) => f.book.name).join(", ")}` : ""}).${band?.op === "wristband" ? " The Wristbands page is set to that card layout." : ""}${doubled.length ? ` ${doubled.length} plays now have two of the same letter.` : ""}${live.firstReads ? ` ${live.firstReads} first-read ${live.firstReads === 1 ? "route stays" : "routes stay"} cyan.` : ""}`,
      );
      toast(
        list.length
          ? `${list.length} ${list.length === 1 ? "play" : "plays"} updated.`
          : books.length
            ? `${books.map((f) => f.book.name).join(", ")} updated.`
            : "Your Wristbands page is set to that card layout.",
      );
      dance();
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!applied) return;
    setBusy(true);
    try {
      // Only plays still exactly as the bulk edit left them go back; anything edited since is kept.
      const current = new Map(store.get().plays.map((p) => [p.id, p]));
      // Compared by content: a Vault refresh can swap in an equal copy of the play.
      const same = (t: BulkTarget) =>
        JSON.stringify(current.get(t.after.id)?.scene) === JSON.stringify(t.after.scene) && current.get(t.after.id)?.name === t.after.name;
      const back = applied.targets.filter(same).map((t) => ({ ...t.before, updatedAt: new Date().toISOString() }));
      await writePlays(back, Boolean(account));
      await writeFilings(applied.filings, Boolean(account), true);
      const open = applied.targets.find((t) => t.before.id === drawer?.playId);
      if (drawer && open) {
        drawer.onEdit((field) => restorePlayers(field, open.before.scene, open.after.scene), `Undo ${changeLabel}`);
        drawer.onMeta({ name: open.before.name, formation: open.before.formation, playType: open.before.playType, tags: open.before.tags });
      }
      setUndone(true);
      const kept = applied.targets.length - back.length;
      setOutcome(
        id,
        `The coach applied the change, then undid it: ${back.length} plays are back as they were.${kept ? ` ${kept} had been edited since and were left alone.` : ""}`,
      );
      toast(`${back.length} ${back.length === 1 ? "play is" : "plays are"} back the way they were.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gd-card gd-bulk">
      <p className="pa-kicker">Bulk change · {where}</p>
      <div className="pa-chips">
        {changes.map((c) => (
          <span key={c} className="pa-chip">
            {c}
          </span>
        ))}
      </div>
      {live.missingBook && !applied ? (
        <p className="pa-error">There's no playbook called "{live.missingBook}". Tell me which one you mean.</p>
      ) : !anything ? (
        <p className="gd-done">None of the {live.inScope} plays here have anything to change.</p>
      ) : (
        <>
          {filings.length > 0 && (
            <p className="gd-bulk-count">
              {filings.map((f) => `${f.book.name}${f.created ? " (new)" : ""}: ${f.before.length} → ${f.after.length} plays`).join(" · ")}
            </p>
          )}
          {targets.length > 0 && (
          <p className="gd-bulk-count">
            <strong>{targets.length}</strong> of {applied ? targets.length : live.inScope} plays
            {players > 0 && (
              <>
                {" "}· <strong>{players}</strong> {players === 1 ? "change" : "changes"} on the field
              </>
            )}
          </p>
          )}
          <ul className="gd-bulk-list">
            {targets.slice(0, 3).map((t) => (
              <li key={t.before.id}>
                <span className="gd-bulk-name">{t.after.name !== t.before.name ? `${t.before.name} → ${t.after.name}` : t.before.name}</span>
                {t.players > 0 && (
                <span className="gd-bulk-pair">
                  <PlayThumb scene={t.before.scene} label={`${t.before.name} before`} />
                  <Icon name="chevron" size={14} aria-hidden="true" />
                  <PlayThumb scene={t.after.scene} label={`${t.before.name} after`} />
                </span>
                )}
              </li>
            ))}
          </ul>
          {live.firstReads > 0 && !applied && (
            <p className="gd-bulk-count">
              {live.firstReads} first-read {live.firstReads === 1 ? "route stays" : "routes stay"} cyan, so the read still stands out.
            </p>
          )}
          {edit.changes.some((c) => c.op === "clear_letters") && !applied && (
            <p className="gd-bulk-count">Cleared players keep their colors and routes, but changes by letter won't find them until they're relettered.</p>
          )}
          {targets.length > 3 && (
            <details className="gd-bulk-more">
              <summary>And {targets.length - 3} more</summary>
              <p>{targets.slice(3).map((t) => (t.after.name !== t.before.name ? `${t.before.name} → ${t.after.name}` : t.before.name)).join(" · ")}</p>
            </details>
          )}
          {doubled.length > 0 && (
            <p className="pa-error">
              {doubled.length} {doubled.length === 1 ? "play already has" : "plays already have"} a {doubled[0].doubled.join("/")}, so{" "}
              {doubled.length === 1 ? "it ends up" : "they end up"} with two: {doubled.slice(0, 4).map((t) => t.before.name).join(", ")}
              {doubled.length > 4 ? "…" : ""}. Open {doubled.length === 1 ? "it" : "them"} afterwards to relabel one.
            </p>
          )}
        </>
      )}
      {done ? (
        <div className="gd-bulk-done">
          <p className="gd-done">
            <Icon name="check" size={14} /> {undone ? done.replace(/^The coach applied the change, then undid it: /, "Undone. ") : count ? `Applied to ${count} ${count === 1 ? "play" : "plays"}.` : "Done."}
          </p>
          {band?.op === "wristband" && !undone && (
            <p className="gd-bulk-count">
              Your Wristbands page is set to {band.format === "bold" ? "Wristband bold" : "Sideline 2×4"}.{" "}
              <Link to={bandBook ? `/wristbands?source=book:${bandBook.id}` : "/wristbands"}>Print {bandBook ? bandBook.name : "wristbands"}</Link>
            </p>
          )}
          {applied && !undone && (
            <button type="button" className="pa-btn" onClick={() => void undo()} disabled={busy}>
              Undo this change
            </button>
          )}
        </div>
      ) : (
        anything &&
        !live.missingBook && (
          <div className="pa-acts">
            <button type="button" className="pa-btn is-primary" onClick={() => void apply()} disabled={busy}>
              {busy ? "Applying…" : count ? `Apply to ${count} ${count === 1 ? "play" : "plays"}` : "Set the Wristbands card"}
            </button>
          </div>
        )
      )}
    </div>
  );
}

/**
 * A game-day call sheet Griddy laid out from the Vault. The coach can drop
 * rows and rename it; "Create the call sheet" makes a Call Sheet with every row
 * linked to its play, so it prints on wristbands like any other grid.
 */
function CallSheetCard({ id, name: suggested, lines }: { id: string; name: string; lines: CallSheetLine[] }) {
  const { outcomes, setOutcome, setOpen, dance } = useGriddy();
  const { account } = useAuth();
  const tier = useTier();
  const toast = useToast();
  const navigate = useNavigate();
  const plays = useStore((s) => s.plays);
  const sheets = useStore((s) => s.sheets);
  const [name, setName] = useState(suggested);
  const [dropped, setDropped] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const done = outcomes[id];

  const rows = lines.flatMap((l, i) => {
    const play = plays.find((p) => p.id === l.playId);
    return play && !dropped.has(i) ? [{ i, line: l, play }] : [];
  });
  const sections = [...new Set(rows.map((r) => r.line.group || r.play.formation || "Plays"))];

  async function create() {
    const gate = gateGrid(tier, sheets.length);
    if (!gate.ok) return toast(gate.reason, true);
    setBusy(true);
    try {
      const sheet = gridFromPlays(name.trim() || "Game plan", rows.map((r) => ({ play: r.play, ...r.line })));
      store.upsertSheet(sheet);
      if (account) {
        try {
          const res = await api.createSheet({ name: sheet.name, columns: sheet.columns, rows: sheet.rows });
          store.upsertSheet({ ...sheet, remoteId: res.sheet.id });
        } catch (e) {
          toast(e instanceof Error ? e.message : "The call sheet is saved in this browser. It syncs the next time you save it.", true);
        }
      }
      setOutcome(id, `The coach created the Call Sheet "${sheet.name}" with ${rows.length} plays.`);
      toast(`${sheet.name} is ready in your Call Sheet.`);
      dance();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gd-card gd-sheet">
      <p className="pa-kicker">Call sheet · {rows.length} plays</p>
      <label className="gd-import-book">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} disabled={Boolean(done)} />
      </label>
      {sections.map((sec) => (
        <div key={sec} className="gd-sheet-section">
          <p className="gd-sheet-head">{sec}</p>
          <ol className="gd-sheet-rows">
            {rows
              .filter((r) => (r.line.group || r.play.formation || "Plays") === sec)
              .map((r) => (
                <li key={r.i}>
                  <span className="gd-sheet-name">{r.play.name}</span>
                  <span className="gd-sheet-meta">{[r.line.down && `${r.line.down} & ${r.line.distance ?? "?"}`, r.line.hash, r.play.playType].filter(Boolean).join(" · ")}</span>
                  {!done && (
                    <button type="button" className="pa-chip-x" onClick={() => setDropped((d) => new Set(d).add(r.i))} aria-label={`Drop ${r.play.name}`}>
                      <Icon name="close" size={11} />
                    </button>
                  )}
                </li>
              ))}
          </ol>
        </div>
      ))}
      {done ? (
        <div className="gd-bulk-done">
          <p className="gd-done">
            <Icon name="check" size={14} /> Grid created.
          </p>
          <button
            type="button"
            className="pa-btn"
            onClick={() => {
              setOpen(false);
              navigate("/grid");
            }}
          >
            Open Call Sheet
          </button>
        </div>
      ) : (
        <div className="pa-acts">
          <button type="button" className="pa-btn is-primary" onClick={() => void create()} disabled={busy || !rows.length}>
            {busy ? "Creating…" : "Create the call sheet"}
          </button>
        </div>
      )}
    </div>
  );
}
