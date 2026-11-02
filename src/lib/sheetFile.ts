import { unzipSync } from "fflate";
import { parseTable } from "./teamHub";

/**
 * A roster spreadsheet as rows of text, read in the browser: Excel workbooks
 * (.xlsx, and the older .xls), CSV, tab-separated text, and the "Excel"
 * downloads league sites make that are really an HTML table. Only the first
 * sheet is read. Nothing is uploaded. Loaded on demand by the import dialog.
 */
export class SheetError extends Error {}

export async function readSheetFile(file: File): Promise<string[][]> {
  if (file.size > 10 * 1024 * 1024) throw new SheetError("That file is over 10 MB. Save just the roster sheet and try again.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  return readSheet(bytes);
}

/** Pure, so the browser test and a script read files the same way. */
export function readSheet(bytes: Uint8Array): string[][] {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return readXlsx(bytes);
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return readXls(bytes);
  const text = decodeText(bytes);
  if (/<table[\s>]/i.test(text)) return readHtmlTable(text);
  return parseTable(text);
}

function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  return new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
}

const trimRows = (rows: string[][]) => rows.map((r) => r.map((c) => c.replace(/\s+/g, " ").trim())).filter((r) => r.some(Boolean));

/** Numbers the way a coach typed them: 12, 6155550142, 2031, 41000.5. */
function numberText(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1e9) / 1e9);
}

/* ------------------------------------------------------------------ html --- */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const unescapeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m),
  );

function readHtmlTable(html: string): string[][] {
  const table = html.match(/<table[\s\S]*?<\/table>/i)?.[0] ?? html;
  const rows: string[][] = [];
  for (const tr of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []).map((td) => unescapeXml(td.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")));
    rows.push(cells);
  }
  return trimRows(rows);
}

/* ------------------------------------------------------------------ xlsx --- */

/** "AB12" → 27 (zero-based column). */
function colOf(ref: string): number {
  let n = 0;
  for (const ch of ref.toUpperCase()) {
    if (ch < "A" || ch > "Z") break;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

/** Every text run inside one `<si>` or `<is>`, joined, with phonetic hints left out. */
const runs = (xml: string) => unescapeXml((xml.replace(/<rPh[\s\S]*?<\/rPh>/g, "").match(/<t(?:\s[^>]*)?>[\s\S]*?<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join(""));

function readXlsx(bytes: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new SheetError("That workbook didn't open. Save it again from Excel or Google Sheets as .xlsx and try again.");
  }
  const text = (name: string) => (files[name] ? new TextDecoder().decode(files[name]) : "");
  if (!files["xl/workbook.xml"]) throw new SheetError("That file isn't an Excel workbook. Save it as .xlsx or .csv and try again.");

  // The first sheet in the workbook's own order, not the first file in the zip.
  let sheetPath = "xl/worksheets/sheet1.xml";
  const firstSheet = text("xl/workbook.xml").match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1] ?? text("xl/workbook.xml").match(/<sheet\b[^>]*\bid="([^"]+)"/)?.[1];
  if (firstSheet) {
    const rel = text("xl/_rels/workbook.xml.rels").match(new RegExp(`<Relationship\\b[^>]*\\bId="${firstSheet}"[^>]*>`))?.[0];
    const target = rel?.match(/\bTarget="([^"]+)"/)?.[1];
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  const sheet = text(sheetPath);
  if (!sheet) throw new SheetError("That workbook has no sheet we could read. Save it as .csv and try again.");

  const shared = (text("xl/sharedStrings.xml").match(/<si>[\s\S]*?<\/si>|<si\/>/g) ?? []).map(runs);
  const rows: string[][] = [];
  for (const row of sheet.match(/<row\b[\s\S]*?<\/row>/g) ?? []) {
    const cells: string[] = [];
    for (const c of row.match(/<c\b[^>]*\/>|<c\b[\s\S]*?<\/c>/g) ?? []) {
      const attrs = c.match(/^<c\b([^>]*)>?/)?.[1] ?? "";
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      const type = attrs.match(/\bt="([a-zA-Z]+)"/)?.[1] ?? "n";
      const v = c.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = runs(c.match(/<is>[\s\S]*?<\/is>/)?.[0] ?? "");
      else if (type === "b") value = v === "1" ? "TRUE" : v === undefined ? "" : "FALSE";
      else if (type === "str" || type === "e") value = v === undefined ? "" : unescapeXml(v);
      else if (v !== undefined) value = numberText(Number(v));
      const col = ref ? colOf(ref) : cells.length;
      while (cells.length < col) cells.push("");
      cells[col] = value;
    }
    rows.push(cells);
  }
  return trimRows(rows);
}

/* ------------------------------------------------------------------- xls --- */

const END = 0xfffffffe;
const FREE = 0xffffffff;

/** The workbook stream out of an old Excel (.xls) compound file. */
function workbookStream(b: Uint8Array): Uint8Array {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const ssz = 1 << dv.getUint16(30, true);
  const msz = 1 << dv.getUint16(32, true);
  const sector = (sid: number) => b.subarray((sid + 1) * ssz, (sid + 2) * ssz);
  const sectors = Math.floor(b.length / ssz) - 1;

  // The FAT's own sectors: 109 named in the header, the rest in the DIFAT chain.
  const fatSids: number[] = [];
  for (let i = 0; i < 109; i++) {
    const sid = dv.getUint32(76 + i * 4, true);
    if (sid < sectors) fatSids.push(sid);
  }
  let difat = dv.getUint32(68, true);
  for (let guard = 0; difat < sectors && guard < 10000; guard++) {
    const s = new DataView(b.buffer, b.byteOffset + (difat + 1) * ssz, ssz);
    for (let i = 0; i < ssz / 4 - 1; i++) {
      const sid = s.getUint32(i * 4, true);
      if (sid < sectors) fatSids.push(sid);
    }
    difat = s.getUint32(ssz - 4, true);
  }
  const fat: number[] = [];
  for (const sid of fatSids) {
    const s = new DataView(b.buffer, b.byteOffset + (sid + 1) * ssz, ssz);
    for (let i = 0; i < ssz / 4; i++) fat.push(s.getUint32(i * 4, true));
  }
  const chain = (start: number, table: number[], limit: number) => {
    const out: number[] = [];
    for (let sid = start; sid !== END && sid !== FREE && sid < limit && out.length < limit; sid = table[sid]) out.push(sid);
    return out;
  };
  const join = (parts: Uint8Array[], size: number) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out.subarray(0, Math.min(size, out.length));
  };

  const dir = join(chain(dv.getUint32(48, true), fat, sectors).map(sector), Infinity);
  const ddv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  type Entry = { name: string; type: number; start: number; size: number };
  const entries: Entry[] = [];
  for (let at = 0; at + 128 <= dir.length; at += 128) {
    const len = Math.max(0, Math.min(64, ddv.getUint16(at + 64, true)) - 2);
    let name = "";
    for (let i = 0; i < len; i += 2) name += String.fromCharCode(ddv.getUint16(at + i, true));
    entries.push({ name, type: dir[at + 66], start: ddv.getUint32(at + 116, true), size: ddv.getUint32(at + 120, true) });
  }
  const root = entries.find((e) => e.type === 5);
  const book = entries.find((e) => e.type === 2 && /^(workbook|book)$/i.test(e.name));
  if (!book) throw new SheetError("That .xls file has no workbook inside. Save it again from Excel as .xlsx and try again.");
  if (book.size >= dv.getUint32(56, true) || !root) return join(chain(book.start, fat, sectors).map(sector), book.size);

  // A small workbook lives in the mini stream.
  const mini = join(chain(root.start, fat, sectors).map(sector), root.size);
  const minifatBytes = join(chain(dv.getUint32(60, true), fat, sectors).map(sector), Infinity);
  const mdv = new DataView(minifatBytes.buffer, minifatBytes.byteOffset, minifatBytes.byteLength);
  const minifat: number[] = [];
  for (let i = 0; i + 4 <= minifatBytes.length; i += 4) minifat.push(mdv.getUint32(i, true));
  const miniSectors = Math.floor(mini.length / msz);
  return join(chain(book.start, minifat, miniSectors).map((sid) => mini.subarray(sid * msz, (sid + 1) * msz)), book.size);
}

/** An Excel RK number: a 30-bit integer or the top of a double, maybe ÷ 100. */
function rk(v: number): number {
  let n: number;
  if (v & 2) n = v >> 2;
  else {
    const dv = new DataView(new ArrayBuffer(8));
    dv.setUint32(0, v & 0xfffffffc, false);
    dv.setUint32(4, 0, false);
    n = dv.getFloat64(0, false);
  }
  return v & 1 ? n / 100 : n;
}

/**
 * A BIFF8 string from `data` at `at`. `bounds` are the offsets where a
 * CONTINUE record began: a string's characters can run across one, and the
 * next record then starts with a fresh "wide or narrow" flag byte.
 */
function biffString(data: Uint8Array, at: number, bounds: number[] = [], short = false): { text: string; next: number } {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = at;
  const count = short ? data[pos++] : dv.getUint16(pos, true);
  if (!short) pos += 2;
  const flags = data[pos++];
  let wide = (flags & 1) === 1;
  let runsCount = 0;
  let ext = 0;
  if (flags & 8) {
    runsCount = dv.getUint16(pos, true);
    pos += 2;
  }
  if (flags & 4) {
    ext = dv.getUint32(pos, true);
    pos += 4;
  }
  let text = "";
  let left = count;
  while (left > 0 && pos < data.length) {
    const edge = bounds.find((x) => x > pos) ?? data.length;
    const fit = Math.min(left, Math.floor((edge - pos) / (wide ? 2 : 1)));
    for (let i = 0; i < fit; i++) {
      text += String.fromCharCode(wide ? dv.getUint16(pos, true) : data[pos]);
      pos += wide ? 2 : 1;
    }
    left -= fit;
    if (left > 0) {
      if (pos !== edge) break;
      wide = (data[pos] & 1) === 1;
      pos++;
    }
  }
  return { text, next: pos + runsCount * 4 + ext };
}

function readXls(bytes: Uint8Array): string[][] {
  let stream: Uint8Array;
  try {
    stream = workbookStream(bytes);
  } catch (e) {
    if (e instanceof SheetError) throw e;
    throw new SheetError("That .xls file didn't open. Save it again from Excel as .xlsx and try again.");
  }
  const dv = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const rows: string[][] = [];
  const put = (r: number, c: number, v: string) => {
    if (r > 5000 || c > 200) return;
    while (rows.length <= r) rows.push([]);
    const row = rows[r];
    while (row.length < c) row.push("");
    row[c] = v;
  };

  let sst: string[] = [];
  let sheets = 0;
  let inSheet = false;
  let pendingFormula: [number, number] | null = null;
  let pos = 0;
  while (pos + 4 <= stream.length) {
    const type = dv.getUint16(pos, true);
    const len = dv.getUint16(pos + 2, true);
    const start = pos + 4;
    pos = start + len;
    if (pos > stream.length) break;
    const rec = stream.subarray(start, start + len);
    const r = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);

    if (type === 0x0809) {
      const kind = len >= 4 ? r.getUint16(2, true) : 0;
      const version = len >= 2 ? r.getUint16(0, true) : 0;
      if (version !== 0x0600 && sheets === 0 && !inSheet && kind === 0x0005)
        throw new SheetError("That is a very old Excel file. Open it in Excel or Google Sheets, save it as .xlsx, and try again.");
      if (kind === 0x0010) {
        sheets++;
        inSheet = sheets === 1;
      }
      continue;
    }
    if (type === 0x002f) throw new SheetError("That workbook has a password. Open it, save a copy without the password, and try again.");
    if (type === 0x000a) {
      if (inSheet) break;
      continue;
    }
    if (type === 0x00fc) {
      // The shared strings, with any CONTINUE records that follow joined on.
      const parts = [rec];
      const bounds: number[] = [];
      let size = rec.length;
      while (pos + 4 <= stream.length && dv.getUint16(pos, true) === 0x003c) {
        const l = dv.getUint16(pos + 2, true);
        bounds.push(size);
        parts.push(stream.subarray(pos + 4, pos + 4 + l));
        size += l;
        pos += 4 + l;
      }
      const all = new Uint8Array(size);
      let at = 0;
      for (const p of parts) {
        all.set(p, at);
        at += p.length;
      }
      const unique = new DataView(all.buffer).getUint32(4, true);
      sst = [];
      let s = 8;
      for (let i = 0; i < unique && s < all.length; i++) {
        const got = biffString(all, s, bounds);
        sst.push(got.text);
        s = got.next;
      }
      continue;
    }
    if (type === 0x0207 && inSheet && pendingFormula) {
      put(pendingFormula[0], pendingFormula[1], biffString(rec, 0).text);
      pendingFormula = null;
      continue;
    }
    if (!inSheet || len < 6) continue;
    const row = r.getUint16(0, true);
    const col = r.getUint16(2, true);
    if (type === 0x00fd && len >= 10) put(row, col, sst[r.getUint32(6, true)] ?? "");
    else if (type === 0x0203 && len >= 14) put(row, col, numberText(r.getFloat64(6, true)));
    else if (type === 0x027e && len >= 10) put(row, col, numberText(rk(r.getUint32(6, true))));
    else if (type === 0x00bd) {
      const last = r.getUint16(len - 2, true);
      for (let c = col, at = 4; c <= last && at + 6 <= len - 2; c++, at += 6) put(row, c, numberText(rk(r.getUint32(at + 2, true))));
    } else if (type === 0x0204 && len >= 9) put(row, col, biffString(rec, 6).text);
    else if (type === 0x00d6 && len >= 9) put(row, col, biffString(rec, 6).text);
    else if (type === 0x0205 && len >= 8) put(row, col, rec[7] ? "" : rec[6] ? "TRUE" : "FALSE");
    else if (type === 0x0006 && len >= 14) {
      if (r.getUint16(12, true) === 0xffff) {
        const kind = rec[6];
        if (kind === 0) pendingFormula = [row, col];
        else if (kind === 1) put(row, col, rec[8] ? "TRUE" : "FALSE");
      } else put(row, col, numberText(r.getFloat64(6, true)));
    }
  }
  return trimRows(rows);
}
