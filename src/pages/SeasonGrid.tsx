import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { rememberWork } from "../lib/workTabs";
import { Shell } from "../components/Shell";
import { WorkTabs } from "../components/WorkTabs";
import { Icon } from "../components/Icon";
import { Tooltip } from "../components/Tooltip";
import { Modal } from "../components/Modal";
import { PlayThumb } from "../components/PlayThumb";
import { playNamed, store, useStore, type SheetColumn, type SheetDoc, type SheetRow } from "../lib/store";
import { learn, suggest } from "../lib/autofill";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTier } from "../lib/tier";
import { gateGrid } from "../lib/plan";
import { useToast } from "../lib/toast";
import { track } from "../lib/track";
import { uid } from "../lib/types";
import { DEFAULT_SHEET_NAME, blankRow, freshSheet, newColumn } from "../lib/sheet";
import { useSheetView } from "../lib/sheetView";
import { useGriddy } from "../components/Griddy";


// Strong enough to tell apart at a glance on the sideline and on a printout, still
// light enough that black text keeps well over 4.5:1 contrast.
const PAINTS = [
  { id: "", label: "No fill", hex: "" },
  { id: "cyan", label: "Cyan", hex: "#B5ECF8" },
  { id: "green", label: "Green", hex: "#BFE6CF" },
  { id: "amber", label: "Amber", hex: "#FADFA3" },
  { id: "red", label: "Red", hex: "#F7C4B8" },
  { id: "violet", label: "Violet", hex: "#D3CFF4" },
  { id: "slate", label: "Slate", hex: "#CCD7E5" },
  { id: "navy", label: "Navy", hex: "#0B1524" },
];

/** Earlier, paler paint shades; cells painted with them show today's shade (above). */
const LEGACY_PAINT: Record<string, string> = {
  "#DDF6FB": "#B5ECF8",
  "#E2F4EA": "#BFE6CF",
  "#FCF1DA": "#FADFA3",
  "#FBE7E5": "#F7C4B8",
  "#EEECFA": "#D3CFF4",
  "#E7EDF2": "#CCD7E5",
  "#E3F8FD": "#B5ECF8",
  "#E4F4EC": "#BFE6CF",
  "#FDF2DD": "#FADFA3",
  "#FDEEE9": "#F7C4B8",
  "#ECEBFA": "#D3CFF4",
  "#E9EEF5": "#CCD7E5",
};

const paintHex = (hex?: string) => (hex ? LEGACY_PAINT[hex.toUpperCase()] ?? hex : hex);


export function SeasonGrid() {
  const navigate = useNavigate();
  const toast = useToast();
  const tier = useTier();
  const { account } = useAuth();
  const sheets = useStore((s) => s.sheets);
  const plays = useStore((s) => s.plays);

  // The Call Sheet work tab (?sheet=) opens the sheet the coach was last on.
  const [params] = useSearchParams();
  const [activeId, setActiveId] = useState<string | null>(() => params.get("sheet"));
  useEffect(() => {
    if (activeId && sheets.some((s) => s.id === activeId)) rememberWork({ sheetId: activeId });
  }, [activeId, sheets]);
  const [sortBy, setSortBy] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [paint, setPaint] = useState<string>("");
  const [painting, setPainting] = useState(false);
  const [dragCol, setDragCol] = useState<number | null>(null);
  const [dropCol, setDropCol] = useState<number | null>(null);
  const [dragRow, setDragRow] = useState<number | null>(null);
  const [dropRow, setDropRow] = useState<number | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ row: string; col: string } | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [hintIndex, setHintIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const { setOpen: openGriddy, prefill } = useGriddy();
  const cellRef = useRef<HTMLInputElement | null>(null);
  const [linkQuery, setLinkQuery] = useState("");
  const linkable = useMemo(() => {
    const q = linkQuery.trim().toLowerCase();
    return q ? plays.filter((p) => `${p.name} ${p.formation}`.toLowerCase().includes(q)) : plays;
  }, [plays, linkQuery]);

  // Open the coach's grid, or lay a fresh one out on the first visit.
  useEffect(() => {
    if (sheets.length === 0) {
      const sheet = freshSheet();
      store.upsertSheet(sheet);
      setActiveId(sheet.id);
    } else if (!activeId || !sheets.some((s) => s.id === activeId)) {
      setActiveId(sheets[0].id);
    }
    track("call_sheet_opened", { sheets: sheets.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheets.length]);

  const sheet = useMemo(() => sheets.find((s) => s.id === activeId) ?? sheets[0] ?? null, [sheets, activeId]);

  const { view, change: changeView, toggle: toggleView } = useSheetView(sheet?.id);

  // The grid was called "Season Grid" before it became the Call Sheet; keep a coach's own names.
  useEffect(() => {
    if (sheet && sheet.name === "Season Grid") store.upsertSheet({ ...sheet, name: DEFAULT_SHEET_NAME });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet?.id]);

  const update = (patch: Partial<SheetDoc>) => {
    if (!sheet) return;
    store.upsertSheet({ ...sheet, ...patch, updatedAt: new Date().toISOString() });
  };

  const rows = useMemo(() => {
    if (!sheet) return [];
    const q = query.trim().toLowerCase();
    const numberCol = sheet.columns.find((c) => c.label === "#")?.id;
    const kept = sheet.rows.filter((r) => {
      const values = Object.entries(r.cells).filter(([id]) => id !== numberCol).map(([, v]) => v);
      if (view.hideEmpty && !values.some((v) => v.trim())) return false;
      return !q || values.some((v) => v.toLowerCase().includes(q));
    });
    if (!sortBy) return kept;
    const col = sortBy.col;
    return [...kept].sort((a, b) => {
      const av = a.cells[col] ?? "";
      const bv = b.cells[col] ?? "";
      const an = Number(av);
      const bn = Number(bv);
      if (av && bv && !Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * sortBy.dir;
      return av.localeCompare(bv) * sortBy.dir;
    });
  }, [sheet, sortBy, query, view.hideEmpty]);

  if (!sheet) {
    return (
      <Shell title="Call Sheet" tabs={<WorkTabs current="sheet" />}>
        <div className="page">
          <div className="empty">
            <Icon name="table" size={44} />
            <h2>Setting up your call sheet</h2>
            <p>One moment.</p>
          </div>
        </div>
      </Shell>
    );
  }

  /* ------------------------------------------------------------- mutations */

  const setCell = (rowId: string, colId: string, value: string) =>
    update({ rows: sheet.rows.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r)) });

  const isNameCol = (colId: string) => sheet.columns.find((c) => c.id === colId)?.label.trim().toLowerCase() === "play name";

  const commitCell = (rowId: string, colId: string) => {
    const col = sheet.columns.find((c) => c.id === colId);
    const row = sheet.rows.find((r) => r.id === rowId);
    const value = row?.cells[colId] ?? "";
    if (col) learn(col.label, value);
    setFocus(null);
    setHints([]);
    if (!row || !isNameCol(colId)) return;
    // A name that matches a saved play links the row to its diagram; clearing the name unlinks it.
    const match = playNamed(plays, value);
    if (match && row.playId !== match.id) linkPlay(rowId, match.id, true);
    else if (!value.trim() && row.playId) update({ rows: sheet.rows.map((r) => (r.id === rowId ? { ...r, playId: null } : r)) });
  };

  /** Puts a suggestion in a cell; in Play Name, a saved play's name links the row too. */
  const takeHint = (rowId: string, colId: string, value: string) => {
    setHints([]);
    const match = isNameCol(colId) ? playNamed(plays, value) : undefined;
    if (match) linkPlay(rowId, match.id, true);
    else setCell(rowId, colId, value);
  };

  const paintCell = (rowId: string, colId: string) => {
    const hex = PAINTS.find((p) => p.id === paint)?.hex ?? "";
    update({
      rows: sheet.rows.map((r) =>
        r.id === rowId ? { ...r, colors: { ...r.colors, [colId]: hex } } : r,
      ),
    });
  };

  const paintRow = (rowId: string) => {
    const hex = PAINTS.find((p) => p.id === paint)?.hex ?? "";
    update({
      rows: sheet.rows.map((r) =>
        r.id === rowId ? { ...r, colors: Object.fromEntries(sheet.columns.map((c) => [c.id, hex])) } : r,
      ),
    });
  };

  const addRow = () => update({ rows: [...sheet.rows, blankRow(sheet.columns, sheet.rows.length)] });

  const addColumn = () => {
    const col = newColumn("New column");
    update({ columns: [...sheet.columns, col], rows: sheet.rows.map((r) => ({ ...r, cells: { ...r.cells, [col.id]: "" } })) });
  };

  const removeColumn = (id: string) => {
    if (sheet.columns.length <= 1) return;
    update({ columns: sheet.columns.filter((c) => c.id !== id) });
  };

  const removeRow = (id: string) => update({ rows: sheet.rows.filter((r) => r.id !== id) });

  const numberCol = sheet.columns.find((c) => c.label === "#")?.id;

  /** A copy of a row right under it (same play, same paint); its # is left blank until Renumber. */
  const duplicateRow = (rowId: string) => {
    const at = sheet.rows.findIndex((r) => r.id === rowId);
    if (at < 0) return;
    const src = sheet.rows[at];
    const copy: SheetRow = { ...src, id: uid("row"), cells: { ...src.cells }, colors: { ...src.colors } };
    if (numberCol) copy.cells[numberCol] = "";
    const next = [...sheet.rows];
    next.splice(at + 1, 0, copy);
    update({ rows: next });
    toast("Row copied below. Renumber puts the # column back in order.");
  };

  const insertRowBelow = (rowId: string) => {
    const at = sheet.rows.findIndex((r) => r.id === rowId);
    if (at < 0) return;
    const blank = blankRow(sheet.columns, at);
    if (numberCol) blank.cells[numberCol] = "";
    const next = [...sheet.rows];
    next.splice(at + 1, 0, blank);
    update({ rows: next });
  };

  /** Numbers the # column 1, 2, 3 in the coach's order, so wristband numbers follow the sheet. */
  const renumber = () => {
    if (!numberCol) {
      toast("This sheet has no # column to number.", true);
      return;
    }
    update({ rows: sheet.rows.map((r, i) => ({ ...r, cells: { ...r.cells, [numberCol]: String(i + 1) } })) });
    toast(`Numbered ${sheet.rows.length} rows in your order.`);
  };

  const askGriddy = () => {
    prefill("Build a call sheet for Saturday: 4 openers, 3 red zone, 2 goal line");
    openGriddy(true);
  };

  const folded = view.cols.filter((id) => sheet.columns.some((c) => c.id === id)).length + view.rows.filter((id) => sheet.rows.some((r) => r.id === id)).length;
  const rowSummary = (row: SheetRow) =>
    sheet.columns.map((c) => (row.cells[c.id] ?? "").trim()).filter(Boolean).join(" · ") || "Empty row";

  const moveColumn = (from: number, to: number) => {
    const next = [...sheet.columns];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    update({ columns: next });
  };

  const moveRow = (from: number, to: number) => {
    const next = [...sheet.rows];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    update({ rows: next });
    setSortBy(null);
  };

  /** One step up or down in the coach's own order (any sort is cleared so the move is visible). */
  const nudgeRow = (rowId: string, step: -1 | 1) => {
    const from = sheet.rows.findIndex((r) => r.id === rowId);
    const to = from + step;
    if (from < 0 || to < 0 || to >= sheet.rows.length) return;
    moveRow(from, to);
  };

  const linkPlay = (rowId: string, playId: string, typed = false) => {
    const play = plays.find((p) => p.id === playId);
    if (!play) return;
    const byLabel = (label: string) => sheet.columns.find((c) => c.label.trim().toLowerCase() === label)?.id;
    const nameCol = byLabel("play name");
    const groupCol = byLabel("group");
    const passCol = byLabel("pass");
    const runCol = byLabel("run");
    const routeCol = byLabel("route");
    update({
      rows: sheet.rows.map((r) => {
        if (r.id !== rowId) return r;
        const cells = { ...r.cells };
        if (nameCol) cells[nameCol] = play.name;
        if (groupCol && !cells[groupCol]) cells[groupCol] = play.formation;
        if (play.playType === "pass" && passCol && !cells[passCol]) cells[passCol] = "Yes";
        if (play.playType === "run" && runCol && !cells[runCol]) cells[runCol] = "Yes";
        if (routeCol && !cells[routeCol] && play.tags.length) cells[routeCol] = play.tags[0];
        return { ...r, cells, playId: play.id };
      }),
    });
    setLinking(null);
    toast(
      typed
        ? `${play.name} is in your Vault, so this row is linked to its diagram and it will print on wristbands.`
        : `${play.name} linked. The diagram is one click away from the grid.`,
    );
  };

  async function syncUp() {
    if (!account) {
      toast("Sign in and your call sheet follows you to any device.", true);
      return;
    }
    setSaving(true);
    try {
      const payload = { name: sheet.name, columns: sheet.columns, rows: sheet.rows };
      const res = sheet.remoteId ? await api.updateSheet(sheet.remoteId, payload) : await api.createSheet(payload);
      update({ remoteId: res.sheet.id });
      toast("Call sheet saved to your account.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "The call sheet did not reach the cloud. It is safe in this browser.", true);
    } finally {
      setSaving(false);
    }
  }

  const newGrid = () => {
    const gate = gateGrid(tier, sheets.length);
    if (!gate.ok) {
      toast(gate.reason, true);
      navigate("/pricing");
      return;
    }
    const sheetDoc = freshSheet(`${DEFAULT_SHEET_NAME} ${sheets.length + 1}`);
    store.upsertSheet(sheetDoc);
    setActiveId(sheetDoc.id);
  };

  /* ---------------------------------------------------------------- render */

  return (
    <Shell
      title="Call Sheet"
      tabs={<WorkTabs current="sheet" />}
      actions={
        <>
          <Tooltip title="Print the call sheet" hint="Prints what you see, landscape, with the paint colours intact. Minimized rows and columns stay off the page." side="bottom">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.print()}>
              <Icon name="print" size={15} /> Print
            </button>
          </Tooltip>
          <Tooltip
            title="Print wristbands from this grid"
            hint="Opens the wristband builder with this grid's calls, numbered as they are here. Rows linked to a saved play print its diagram."
            side="bottom"
          >
            <Link to={`/wristbands?source=${encodeURIComponent(`grid:${sheet.id}`)}`} className="btn btn-ghost btn-sm">
              <Icon name="wristband" size={15} /> Wristbands
            </Link>
          </Tooltip>
          <button type="button" className="btn btn-ghost btn-sm" onClick={newGrid}>
            <Icon name="plus" size={15} /> New sheet
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={syncUp} disabled={saving}>
            <Icon name="save" size={15} /> {saving ? "Saving…" : "Save sheet"}
          </button>
        </>
      }
    >
      <div className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Game plan</p>
            <input
              className="input"
              style={{ fontFamily: "var(--display)", fontSize: 26, fontWeight: 700, height: 42, border: "none", padding: 0, background: "none", width: 340 }}
              value={sheet.name}
              onChange={(e) => update({ name: e.target.value })}
              aria-label="Call sheet name"
            />
            <p className="hint" style={{ margin: 0 }}>
              {sheet.rows.length} rows · {sheet.columns.length} columns. Rename any header, drag it anywhere, minimize what you don't need
              on the field, and type whatever your system calls it.
            </p>
          </div>
          {sheets.length > 1 && (
            <select className="select" style={{ width: 180 }} value={sheet.id} onChange={(e) => setActiveId(e.target.value)} aria-label="Switch call sheet">
              {sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="filters">
          <Tooltip
            title="Paint mode"
            hint="Turn this on, pick a colour, then click any cell to fill it. Click the row grip to paint a whole row."
            side="bottom"
          >
            <button
              type="button"
              className={`btn btn-sm ${painting ? "btn-dark" : "btn-ghost"}`}
              onClick={() => setPainting((v) => !v)}
              aria-pressed={painting}
            >
              <Icon name="paint" size={15} /> {painting ? "Paint mode on" : "Paint cells"}
            </button>
          </Tooltip>
          <div className="paint-row">
            {PAINTS.map((p) => (
              <Tooltip key={p.id} title={p.label} hint={p.id ? "Click a cell to fill it with this colour." : "Clears the fill from a cell."} side="bottom">
                <button
                  type="button"
                  className={`paint-dot${paint === p.id ? " is-on" : ""}`}
                  style={{ background: p.hex || "repeating-linear-gradient(45deg,#fff 0 4px,#E7EDF2 4px 8px)" }}
                  onClick={() => (setPaint(p.id), setPainting(true))}
                  aria-label={p.label}
                  aria-pressed={paint === p.id}
                />
              </Tooltip>
            ))}
          </div>
          <span style={{ marginLeft: "auto" }} />
          <input
            className="input sheet-find"
            type="search"
            placeholder="Find a play or call"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Find in this call sheet"
          />
          <Tooltip title="Compact rows" hint="Tighter rows so more of the sheet fits on screen." side="bottom">
            <button type="button" className={`btn btn-sm ${view.compact ? "btn-dark" : "btn-ghost"}`} onClick={() => changeView({ compact: !view.compact })} aria-pressed={view.compact}>
              Compact
            </button>
          </Tooltip>
          <Tooltip title="Hide empty rows" hint="Hides rows with nothing typed in them. They are still there; turn this off to see them." side="bottom">
            <button type="button" className={`btn btn-sm ${view.hideEmpty ? "btn-dark" : "btn-ghost"}`} onClick={() => changeView({ hideEmpty: !view.hideEmpty })} aria-pressed={view.hideEmpty}>
              Hide empty
            </button>
          </Tooltip>
          <Tooltip title="Minimize every row" hint="Folds each row down to one line. Click a row to open it again." side="bottom">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => changeView({ rows: view.rows.length >= sheet.rows.length ? [] : sheet.rows.map((r) => r.id) })}>
              {view.rows.length >= sheet.rows.length ? "Open all rows" : "Minimize rows"}
            </button>
          </Tooltip>
          <Tooltip title="Renumber" hint="Numbers the # column 1, 2, 3 in your order, so wristband numbers match." side="bottom">
            <button type="button" className="btn btn-ghost btn-sm" onClick={renumber}>
              Renumber
            </button>
          </Tooltip>
          <Tooltip title="Ask Griddy" hint="Griddy builds a call sheet from your Vault by situation. You review it before anything is saved." side="bottom">
            <button type="button" className="btn btn-ghost btn-sm" onClick={askGriddy}>
              <Icon name="sparkle" size={14} /> Ask Griddy
            </button>
          </Tooltip>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addColumn}>
            <Icon name="plus" size={14} /> Add column
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}>
            <Icon name="plus" size={14} /> Add row
          </button>
          {sortBy && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setSortBy(null)}>
              Back to my order
            </button>
          )}
        </div>
        {(folded > 0 || query || view.hideEmpty) && (
          <p className="hint sheet-status" role="status">
            Showing {rows.length} of {sheet.rows.length} rows
            {view.cols.length > 0 && ` · ${view.cols.length} column${view.cols.length === 1 ? "" : "s"} minimized`}
            {view.rows.length > 0 && ` · ${view.rows.length} row${view.rows.length === 1 ? "" : "s"} minimized`}.{" "}
            <button
              type="button"
              className="link"
              onClick={() => (setQuery(""), changeView({ cols: [], rows: [], hideEmpty: false }))}
            >
              Show everything
            </button>
          </p>
        )}

        <div className="grid-wrap">
          <table className={`sheet${view.compact ? " is-compact" : ""}`}>
            <caption className="sr-only">
              {sheet.name} — {sheet.rows.length} rows across {sheet.columns.length} columns. Every header can be renamed, reordered and
              sorted.
            </caption>
            <thead>
              <tr>
                <th scope="col" style={{ width: 34 }}>
                  <span className="sr-only">Row order</span>
                </th>
                {sheet.columns.map((col, index) =>
                  view.cols.includes(col.id) ? (
                    <th key={col.id} scope="col" className="col-min">
                      <Tooltip title={`Show ${col.label || "column"}`} hint="Opens this column again." side="bottom">
                        <button type="button" onClick={() => toggleView("cols", col.id)} aria-label={`Show ${col.label || "column"}`}>
                          <span>{col.label || "Column"}</span>
                        </button>
                      </Tooltip>
                    </th>
                  ) : (
                  <th
                    key={col.id}
                    scope="col"
                    aria-sort={sortBy?.col === col.id ? (sortBy.dir === 1 ? "ascending" : "descending") : "none"}
                    style={{ minWidth: col.width }}
                    className={dropCol === index ? "is-drop" : ""}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDropCol(index);
                    }}
                    onDrop={() => {
                      if (dragCol !== null && dragCol !== index) moveColumn(dragCol, index);
                      setDragCol(null);
                      setDropCol(null);
                    }}
                  >
                    <div className="th-inner">
                      <Tooltip title="Drag to reorder" hint="Grab the dots and slide the column to where you read it." side="bottom">
                        <span
                          className="th-drag"
                          draggable
                          onDragStart={() => setDragCol(index)}
                          onDragEnd={() => (setDragCol(null), setDropCol(null))}
                          aria-label={`Reorder ${col.label}`}
                        >
                          ⠿
                        </span>
                      </Tooltip>
                      <input
                        value={col.label}
                        onChange={(e) =>
                          update({ columns: sheet.columns.map((c) => (c.id === col.id ? { ...c, label: e.target.value } : c)) })
                        }
                        aria-label={`Rename ${col.label}`}
                      />
                      <Tooltip
                        title={`Sort by ${col.label || "column"}`}
                        hint="Click once for A–Z or low-to-high, again to flip it, a third time to go back to your own order."
                        side="bottom"
                      >
                        <button
                          type="button"
                          className={`th-sort${sortBy?.col === col.id ? " is-on" : ""}`}
                          onClick={() =>
                            setSortBy((s) =>
                              s?.col !== col.id ? { col: col.id, dir: 1 } : s.dir === 1 ? { col: col.id, dir: -1 } : null,
                            )
                          }
                          aria-label={
                            sortBy?.col !== col.id
                              ? `Sort by ${col.label}, ascending`
                              : sortBy.dir === 1
                                ? `Sort by ${col.label}, descending`
                                : `Clear the sort on ${col.label}`
                          }
                        >
                          <Icon name="sort" size={13} />
                        </button>
                      </Tooltip>
                      <Tooltip title="Minimize column" hint="Folds this column down to a thin strip for more room. Nothing is deleted." side="bottom">
                        <button type="button" className="th-sort" onClick={() => toggleView("cols", col.id)} aria-label={`Minimize ${col.label}`}>
                          <span aria-hidden="true">–</span>
                        </button>
                      </Tooltip>
                      <Tooltip title="Remove column" hint="Deletes this column from the call sheet. The rest of your data stays." side="bottom">
                        <button type="button" className="th-sort" onClick={() => removeColumn(col.id)} aria-label={`Remove ${col.label}`}>
                          <Icon name="close" size={12} />
                        </button>
                      </Tooltip>
                    </div>
                  </th>
                  ),
                )}
                <th scope="col" style={{ width: 40 }}>
                  <span className="sr-only">Row tools</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) =>
                view.rows.includes(row.id) ? (
                  <tr key={row.id} className="row-min">
                    <th scope="row" className="row-grip">
                      <span aria-hidden="true">⠿</span>
                      <span className="sr-only">Row {rowIndex + 1}</span>
                    </th>
                    <td colSpan={sheet.columns.length}>
                      <button type="button" className="row-min-open" onClick={() => toggleView("rows", row.id)} aria-label={`Open row ${rowIndex + 1}: ${rowSummary(row)}`}>
                        <span aria-hidden="true">▸</span> {rowSummary(row)}
                      </button>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {row.playId && (
                        <button type="button" className="th-sort" onClick={() => navigate(`/build/${row.playId}`)} aria-label="Open linked play">
                          <Icon name="board" size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                <tr
                  key={row.id}
                  className={dropRow === rowIndex ? "is-drop" : ""}
                  onDragOver={(e) => {
                    if (dragRow === null) return;
                    e.preventDefault();
                    setDropRow(rowIndex);
                  }}
                  onDrop={() => {
                    if (dragRow !== null && dragRow !== rowIndex) moveRow(dragRow, rowIndex);
                    setDragRow(null);
                    setDropRow(null);
                  }}
                >
                  <th
                    scope="row"
                    className="row-grip"
                    draggable
                    onDragStart={() => setDragRow(rowIndex)}
                    onDragEnd={() => (setDragRow(null), setDropRow(null))}
                  >
                    {painting ? (
                      <button type="button" onClick={() => paintRow(row.id)} aria-label={`Paint row ${rowIndex + 1}`}>
                        ⠿
                      </button>
                    ) : (
                      <span aria-hidden="true">⠿</span>
                    )}
                    <span className="sr-only">Row {rowIndex + 1}</span>
                  </th>
                  {sheet.columns.map((col) => {
                    const value = row.cells[col.id] ?? "";
                    const fill = paintHex(row.colors[col.id]);
                    if (view.cols.includes(col.id)) {
                      return <td key={col.id} className="col-min" style={{ background: fill || undefined }} title={value || undefined} />;
                    }
                    const isFocus = focus?.row === row.id && focus?.col === col.id;
                    return (
                      <td key={col.id} style={{ background: fill || undefined, position: "relative" }}>
                        {painting ? (
                          <button
                            type="button"
                            className="cell-input"
                            style={{ textAlign: "left", color: fill === "#0B1524" ? "#fff" : undefined }}
                            onClick={() => paintCell(row.id, col.id)}
                            aria-label={`Paint ${col.label || "cell"}, row ${rowIndex + 1}`}
                          >
                            {value}
                          </button>
                        ) : (
                          <input
                            ref={isFocus ? cellRef : undefined}
                            className="cell-input"
                            style={{ color: fill === "#0B1524" ? "#fff" : undefined }}
                            value={value}
                            aria-label={`${col.label || "Column"}, row ${rowIndex + 1}`}
                            role="combobox"
                            aria-autocomplete="list"
                            aria-expanded={isFocus && hints.length > 0}
                            aria-controls={`hints-${row.id}-${col.id}`}
                            aria-activedescendant={
                              isFocus && hints.length > 0 ? `hint-${row.id}-${col.id}-${hintIndex}` : undefined
                            }
                            onChange={(e) => {
                              setCell(row.id, col.id, e.target.value);
                              const extra =
                                col.label.trim().toLowerCase() === "play name" ? plays.map((p) => p.name) : [];
                              setHints(suggest(col.label, e.target.value, extra));
                              setHintIndex(0);
                            }}
                            onFocus={(e) => {
                              setFocus({ row: row.id, col: col.id });
                              const extra = col.label.trim().toLowerCase() === "play name" ? plays.map((p) => p.name) : [];
                              setHints(suggest(col.label, e.target.value, extra));
                            }}
                            onBlur={() => window.setTimeout(() => commitCell(row.id, col.id), 120)}
                            onKeyDown={(e) => {
                              if (!hints.length) return;
                              if (e.key === "ArrowDown") {
                                e.preventDefault();
                                setHintIndex((i) => (i + 1) % hints.length);
                              }
                              if (e.key === "ArrowUp") {
                                e.preventDefault();
                                setHintIndex((i) => (i - 1 + hints.length) % hints.length);
                              }
                              if (e.key === "Tab" || e.key === "Enter") {
                                if (hints[hintIndex]) {
                                  e.preventDefault();
                                  takeHint(row.id, col.id, hints[hintIndex]);
                                }
                              }
                              if (e.key === "Escape") setHints([]);
                            }}
                          />
                        )}
                        {isFocus && hints.length > 0 && !painting && (
                          <ul
                            className="suggest"
                            style={{ top: "100%", left: 0 }}
                            id={`hints-${row.id}-${col.id}`}
                            role="listbox"
                            aria-label={`Suggestions for ${col.label || "this column"}`}
                          >
                            {hints.map((h, i) => (
                              <li
                                key={h}
                                id={`hint-${row.id}-${col.id}-${i}`}
                                role="option"
                                aria-selected={i === hintIndex}
                                className={i === hintIndex ? "is-on" : ""}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  takeHint(row.id, col.id, h);
                                }}
                              >
                                {h}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    );
                  })}
                  <td className="row-tools-cell">
                   <div className="row-tools">
                    {row.playId ? (
                      <Tooltip title="Open the diagram" hint="This row is linked to a saved play. Opens it in the designer." side="top">
                        <button type="button" className="th-sort" onClick={() => navigate(`/build/${row.playId}`)} aria-label="Open linked play">
                          <Icon name="board" size={14} />
                        </button>
                      </Tooltip>
                    ) : (
                      <Tooltip title="Link a saved play" hint="Pulls the name and formation from your Vault and keeps the diagram attached." side="top">
                        <button type="button" className="th-sort" onClick={() => (setLinkQuery(""), setLinking(row.id))} aria-label="Link a saved play">
                          <Icon name="connect" size={14} />
                        </button>
                      </Tooltip>
                    )}
                    {/* Dragging the grip needs a mouse; fingers and keyboards move rows with these. */}
                    <button
                      type="button"
                      className="th-sort row-move"
                      onClick={() => nudgeRow(row.id, -1)}
                      disabled={sheet.rows[0]?.id === row.id}
                      aria-label={`Move row ${rowIndex + 1} up`}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="th-sort row-move"
                      onClick={() => nudgeRow(row.id, 1)}
                      disabled={sheet.rows[sheet.rows.length - 1]?.id === row.id}
                      aria-label={`Move row ${rowIndex + 1} down`}
                    >
                      ▼
                    </button>
                    <Tooltip title="Minimize row" hint="Folds this row to one line. Click it to open it again." side="top">
                      <button type="button" className="th-sort" onClick={() => toggleView("rows", row.id)} aria-label={`Minimize row ${rowIndex + 1}`}>
                        <span aria-hidden="true">–</span>
                      </button>
                    </Tooltip>
                    <Tooltip title="Copy row" hint="Puts a copy right below, with the same play and paint." side="top">
                      <button type="button" className="th-sort" onClick={() => duplicateRow(row.id)} aria-label={`Copy row ${rowIndex + 1}`}>
                        <Icon name="copy" size={13} />
                      </button>
                    </Tooltip>
                    <Tooltip title="Add a row below" hint="Opens a blank row right under this one." side="top">
                      <button type="button" className="th-sort" onClick={() => insertRowBelow(row.id)} aria-label={`Add a row below row ${rowIndex + 1}`}>
                        <Icon name="plus" size={13} />
                      </button>
                    </Tooltip>
                    <button type="button" className="th-sort" onClick={() => removeRow(row.id)} aria-label="Remove row">
                      <Icon name="close" size={12} />
                    </button>
                   </div>
                  </td>
                </tr>
                ),
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: 9, marginTop: 14, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}>
            <Icon name="plus" size={14} /> Add a row
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() =>
              update({ rows: sheet.rows.map((r) => ({ ...r, colors: {} })) })
            }
          >
            Clear all paint
          </button>
          <p className="hint" style={{ margin: "6px 0 0 auto", maxWidth: 460, textAlign: "right" }}>
            Type freely — the call sheet learns what you enter in each column and offers it back next time. Tab accepts a suggestion. Type
            the name of a play in your Vault and the row links to its diagram, ready for wristbands.
          </p>
        </div>
      </div>

      {linking && (
        <Modal title="Link a saved play" onClose={() => setLinking(null)} wide>
          {plays.length === 0 ? (
            <>
              <p className="lede">Nothing in your Vault yet. Draw a play and it will be available to link here.</p>
              <Link to="/build" className="btn btn-primary" style={{ marginTop: 14 }}>
                Draft a play
              </Link>
            </>
          ) : (
            <>
            <input
              className="input"
              type="search"
              placeholder={`Search ${plays.length} plays by name or formation`}
              value={linkQuery}
              onChange={(e) => setLinkQuery(e.target.value)}
              aria-label="Search your plays"
              autoFocus
              style={{ marginBottom: 14 }}
            />
            {linkable.length === 0 && <p className="hint">No play matches “{linkQuery}”.</p>}
            <div className="play-grid">
              {linkable.map((p) => (
                <button key={p.id} type="button" className="card play-card" style={{ textAlign: "left" }} onClick={() => linkPlay(linking, p.id)}>
                  <div className="play-thumb">
                    <PlayThumb scene={p.scene} label={p.name} />
                  </div>
                  <div className="play-body">
                    <h3>{p.name || "Untitled play"}</h3>
                    <p className="hint" style={{ margin: 0 }}>
                      {p.formation || "No formation"} · {p.playType}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            </>
          )}
        </Modal>
      )}
    </Shell>
  );
}
