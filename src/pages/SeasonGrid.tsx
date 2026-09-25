import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Icon } from "../components/Icon";
import { Tooltip } from "../components/Tooltip";
import { Modal } from "../components/Modal";
import { PlayThumb } from "../components/PlayThumb";
import { store, useStore, type SheetColumn, type SheetDoc, type SheetRow } from "../lib/store";
import { learn, suggest } from "../lib/autofill";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTier } from "../lib/tier";
import { gateGrid } from "../lib/plan";
import { useToast } from "../lib/toast";
import { track } from "../lib/track";
import { uid } from "../lib/types";

const DEFAULT_HEADERS = ["#", "Play Name", "Group", "Run", "Pass", "Down", "Distance", "Hash", "YL", "Route", "Position"];

const PAINTS = [
  { id: "", label: "No fill", hex: "" },
  { id: "cyan", label: "Cyan", hex: "#DDF6FB" },
  { id: "green", label: "Green", hex: "#E2F4EA" },
  { id: "amber", label: "Amber", hex: "#FCF1DA" },
  { id: "red", label: "Red", hex: "#FBE7E5" },
  { id: "violet", label: "Violet", hex: "#EEECFA" },
  { id: "slate", label: "Slate", hex: "#E7EDF2" },
  { id: "navy", label: "Navy", hex: "#0B1524" },
];

const newColumn = (label: string): SheetColumn => ({ id: uid("col"), label, width: label === "Play Name" ? 220 : 96, type: "text" });

const blankRow = (columns: SheetColumn[], index: number): SheetRow => ({
  id: uid("row"),
  cells: Object.fromEntries(columns.map((c) => [c.id, c.label === "#" ? String(index + 1) : ""])),
  colors: {},
  playId: null,
});

function freshSheet(name = "Season Grid"): SheetDoc {
  const columns = DEFAULT_HEADERS.map(newColumn);
  return {
    id: uid("sheet"),
    name,
    columns,
    rows: Array.from({ length: 12 }, (_, i) => blankRow(columns, i)),
    updatedAt: new Date().toISOString(),
    remoteId: null,
  };
}

export function SeasonGrid() {
  const navigate = useNavigate();
  const toast = useToast();
  const tier = useTier();
  const { account } = useAuth();
  const sheets = useStore((s) => s.sheets);
  const plays = useStore((s) => s.plays);

  const [activeId, setActiveId] = useState<string | null>(null);
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
  const cellRef = useRef<HTMLInputElement | null>(null);

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

  const update = (patch: Partial<SheetDoc>) => {
    if (!sheet) return;
    store.upsertSheet({ ...sheet, ...patch, updatedAt: new Date().toISOString() });
  };

  const rows = useMemo(() => {
    if (!sheet) return [];
    if (!sortBy) return sheet.rows;
    const col = sortBy.col;
    return [...sheet.rows].sort((a, b) => {
      const av = a.cells[col] ?? "";
      const bv = b.cells[col] ?? "";
      const an = Number(av);
      const bn = Number(bv);
      if (av && bv && !Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * sortBy.dir;
      return av.localeCompare(bv) * sortBy.dir;
    });
  }, [sheet, sortBy]);

  if (!sheet) {
    return (
      <Shell title="Season Grid">
        <div className="page">
          <div className="empty">
            <Icon name="table" size={44} />
            <h2>Setting up your grid</h2>
            <p>One moment.</p>
          </div>
        </div>
      </Shell>
    );
  }

  /* ------------------------------------------------------------- mutations */

  const setCell = (rowId: string, colId: string, value: string) =>
    update({ rows: sheet.rows.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r)) });

  const commitCell = (rowId: string, colId: string) => {
    const col = sheet.columns.find((c) => c.id === colId);
    const value = sheet.rows.find((r) => r.id === rowId)?.cells[colId] ?? "";
    if (col) learn(col.label, value);
    setFocus(null);
    setHints([]);
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

  const linkPlay = (rowId: string, playId: string) => {
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
    toast(`${play.name} linked. The diagram is one click away from the grid.`);
  };

  async function syncUp() {
    if (!account) {
      toast("Sign in and your grid follows you to any device.", true);
      return;
    }
    setSaving(true);
    try {
      const payload = { name: sheet.name, columns: sheet.columns, rows: sheet.rows };
      const res = sheet.remoteId ? await api.updateSheet(sheet.remoteId, payload) : await api.createSheet(payload);
      update({ remoteId: res.sheet.id });
      toast("Grid saved to your account.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "The grid did not reach the cloud. It is safe in this browser.", true);
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
    const sheetDoc = freshSheet(`Grid ${sheets.length + 1}`);
    store.upsertSheet(sheetDoc);
    setActiveId(sheetDoc.id);
  };

  /* ---------------------------------------------------------------- render */

  return (
    <Shell
      title="Season Grid"
      actions={
        <>
          <Tooltip title="Print the grid" hint="Prints exactly what you see, landscape, with the paint colours intact." side="bottom">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.print()}>
              <Icon name="print" size={15} /> Print
            </button>
          </Tooltip>
          <button type="button" className="btn btn-ghost btn-sm" onClick={newGrid}>
            <Icon name="plus" size={15} /> New grid
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={syncUp} disabled={saving}>
            <Icon name="save" size={15} /> {saving ? "Saving…" : "Save grid"}
          </button>
        </>
      }
    >
      <div className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Playcaller's table</p>
            <input
              className="input"
              style={{ fontFamily: "var(--display)", fontSize: 26, fontWeight: 700, height: 42, border: "none", padding: 0, background: "none", width: 340 }}
              value={sheet.name}
              onChange={(e) => update({ name: e.target.value })}
              aria-label="Grid name"
            />
            <p className="hint" style={{ margin: 0 }}>
              {sheet.rows.length} rows · {sheet.columns.length} columns. Rename any header, drag it anywhere, and type whatever your
              system calls it.
            </p>
          </div>
          {sheets.length > 1 && (
            <select className="select" style={{ width: 180 }} value={sheet.id} onChange={(e) => setActiveId(e.target.value)} aria-label="Switch grid">
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

        <div className="grid-wrap">
          <table className="sheet">
            <caption className="sr-only">
              {sheet.name} — {sheet.rows.length} rows across {sheet.columns.length} columns. Every header can be renamed, reordered and
              sorted.
            </caption>
            <thead>
              <tr>
                <th scope="col" style={{ width: 34 }}>
                  <span className="sr-only">Row order</span>
                </th>
                {sheet.columns.map((col, index) => (
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
                      <Tooltip title="Remove column" hint="Deletes this column from the grid. The rest of your data stays." side="bottom">
                        <button type="button" className="th-sort" onClick={() => removeColumn(col.id)} aria-label={`Remove ${col.label}`}>
                          <Icon name="close" size={12} />
                        </button>
                      </Tooltip>
                    </div>
                  </th>
                ))}
                <th scope="col" style={{ width: 40 }}>
                  <span className="sr-only">Row tools</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
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
                    const fill = row.colors[col.id];
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
                                  setCell(row.id, col.id, hints[hintIndex]);
                                  setHints([]);
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
                                  setCell(row.id, col.id, h);
                                  setHints([]);
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
                  <td style={{ textAlign: "center" }}>
                    {row.playId ? (
                      <Tooltip title="Open the diagram" hint="This row is linked to a saved play. Opens it in the designer." side="top">
                        <button type="button" className="th-sort" onClick={() => navigate(`/build/${row.playId}`)} aria-label="Open linked play">
                          <Icon name="board" size={14} />
                        </button>
                      </Tooltip>
                    ) : (
                      <Tooltip title="Link a saved play" hint="Pulls the name and formation from your Vault and keeps the diagram attached." side="top">
                        <button type="button" className="th-sort" onClick={() => setLinking(row.id)} aria-label="Link a saved play">
                          <Icon name="connect" size={14} />
                        </button>
                      </Tooltip>
                    )}
                    <button type="button" className="th-sort" onClick={() => removeRow(row.id)} aria-label="Remove row">
                      <Icon name="close" size={12} />
                    </button>
                  </td>
                </tr>
              ))}
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
            Type freely — the grid learns what you enter in each column and offers it back next time. Tab accepts a suggestion.
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
            <div className="play-grid">
              {plays.slice(0, 24).map((p) => (
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
          )}
        </Modal>
      )}
    </Shell>
  );
}
