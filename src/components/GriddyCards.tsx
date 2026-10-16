import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { ACTION_LABEL, BLOCK_IDS, nearMatch, PLAYER_LETTERS, readToNodes, ROUTE_IDS, trustSaidLetters } from "../lib/assistant";
import type { Assignment, AssistantRead } from "../lib/assistant";
import { useAuth } from "../lib/auth";
import { GRIDDY } from "../lib/griddy";
import type { GriddyAction, ImportItem } from "../lib/griddy";
import { currentGame, playFromRead, savePlays } from "../lib/griddyVault";
import { gateSave } from "../lib/plan";
import { usePositionTokens } from "../lib/positions";
import { emptyScene } from "../lib/presets";
import { nextZ } from "../lib/scene";
import { useStore } from "../lib/store";
import { useTerms } from "../lib/terms";
import { useTier } from "../lib/tier";
import { useToast } from "../lib/toast";
import { useGriddy } from "./Griddy";
import { Icon } from "./Icon";
import { PlayThumb } from "./PlayThumb";

export function GriddyActionCard({ action }: { action: GriddyAction }) {
  if (action.tool === "draw_play") return <DrawCard id={action.id} initial={action.read} />;
  if (action.tool === "import_plays") return <ImportCard id={action.id} plays={action.plays} playbook={action.playbook} />;
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
              <button type="button" className="pa-btn is-primary" onClick={() => navigate("/build")}>
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
