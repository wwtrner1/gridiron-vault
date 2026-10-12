import { unzipSync, strFromU8 } from "fflate";
import { baseNode, CANVAS_H, CANVAS_W, DEFAULT_STROKE } from "./types";
import type { PathNode, PlayerNode, Point, Scene, SceneNode } from "./types";
import { DEFENSE_TOKENS, emptyScene, type TokenPreset } from "./presets";
import { letterColor } from "./colors";

/**
 * PowerPoint import, from the Grid1ron Design canvas (Upload · PowerPoint
 * deck). A .pptx stores every circle, letter and arrow with its exact
 * position, so plays drawn with shapes are rebuilt here without any AI:
 * slide titles become play names and speaker notes become coaching notes.
 */

type Box = { x: number; y: number; w: number; h: number; flipH: boolean; flipV: boolean };
type RawPlayer = { cx: number; cy: number; size: number; label: string; shape: PlayerNode["shape"]; fill: string | null; stroke: string | null };
type RawLine = { points: Point[]; color: string | null; dashed: boolean; head: boolean; tail: boolean };

export type DeckSlide = {
  index: number;
  title: string;
  notes: string;
  hasPlay: boolean;
  reason: string;
  players: RawPlayer[];
  lines: RawLine[];
  letters: string[];
};

export type Deck = { name: string; slides: DeckSlide[] };

const num = (v: string | null | undefined, d = 0) => (v == null ? d : Number(v) || d);
const kids = (el: Element, name: string) => Array.from(el.children).filter((c) => c.tagName === name);
const kid = (el: Element | null | undefined, name: string) => (el ? kids(el, name)[0] ?? null : null);
const deep = (el: Element | null | undefined, name: string) => (el ? el.getElementsByTagName(name)[0] ?? null : null);

function xml(files: Record<string, Uint8Array>, path: string): Document | null {
  const data = files[path];
  if (!data) return null;
  return new DOMParser().parseFromString(strFromU8(data), "application/xml");
}

function rels(files: Record<string, Uint8Array>, path: string): Record<string, string> {
  const doc = xml(files, path);
  const out: Record<string, string> = {};
  if (!doc) return out;
  for (const r of Array.from(doc.getElementsByTagName("Relationship"))) out[r.getAttribute("Id") ?? ""] = r.getAttribute("Target") ?? "";
  return out;
}

/** Resolve "../notesSlides/notesSlide1.xml" against "ppt/slides/". */
function resolve(base: string, target: string) {
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

const text = (el: Element | null) =>
  el
    ? Array.from(el.getElementsByTagName("a:p"))
        .map((p) => Array.from(p.getElementsByTagName("a:t")).map((t) => t.textContent ?? "").join(""))
        .join("\n")
        .trim()
    : "";

function color(el: Element | null): string | null {
  const c = el ? deep(el, "a:srgbClr") : null;
  return c ? `#${(c.getAttribute("val") ?? "").toLowerCase()}` : null;
}

type Xform = (p: Point) => Point;

function boxOf(spPr: Element | null, xf: Xform): Box | null {
  const x = kid(spPr, "a:xfrm");
  if (!x) return null;
  const off = kid(x, "a:off");
  const ext = kid(x, "a:ext");
  if (!off || !ext) return null;
  const a = xf({ x: num(off.getAttribute("x")), y: num(off.getAttribute("y")) });
  const b = xf({ x: num(off.getAttribute("x")) + num(ext.getAttribute("cx")), y: num(off.getAttribute("y")) + num(ext.getAttribute("cy")) });
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y, flipH: x.getAttribute("flipH") === "1", flipV: x.getAttribute("flipV") === "1" };
}

const PLAYER_SHAPES: Record<string, PlayerNode["shape"]> = {
  ellipse: "circle",
  flowChartConnector: "circle",
  donut: "circle",
  rect: "square",
  roundRect: "square",
  flowChartProcess: "square",
  triangle: "triangle",
  diamond: "diamond",
  flowChartDecision: "diamond",
  mathMultiply: "cross",
};
const LINE_SHAPES = /^(line|straightConnector1|bentConnector\d|curvedConnector\d)$/;

function lineFrom(spPr: Element | null, box: Box, prst: string): RawLine {
  const ln = kid(spPr, "a:ln");
  let a = { x: box.x, y: box.y };
  let b = { x: box.x + box.w, y: box.y + box.h };
  if (box.flipH) [a.x, b.x] = [b.x, a.x];
  if (box.flipV) [a.y, b.y] = [b.y, a.y];
  const points = /^bentConnector/.test(prst) ? [a, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b] : [a, b];
  const end = (n: string) => {
    const t = kid(ln, n)?.getAttribute("type");
    return t && t !== "none" ? t : null;
  };
  const tail = end("a:tailEnd");
  const head = end("a:headEnd");
  return {
    points,
    color: color(ln),
    dashed: !!(kid(ln, "a:prstDash") && kid(ln, "a:prstDash")!.getAttribute("val") !== "solid"),
    tail: !!tail,
    head: !!head
  };
}

/** Freehand arrows: the custom geometry's path points, placed in the shape box. */
function freeform(spPr: Element | null, box: Box): RawLine | null {
  const path = deep(spPr, "a:path");
  if (!path) return null;
  const pw = num(path.getAttribute("w"), 1) || 1;
  const ph = num(path.getAttribute("h"), 1) || 1;
  const pts: Point[] = [];
  for (const cmd of Array.from(path.children)) {
    const list = Array.from(cmd.getElementsByTagName("a:pt"));
    const last = list[list.length - 1];
    if (!last) continue;
    let px = num(last.getAttribute("x")) / pw;
    let py = num(last.getAttribute("y")) / ph;
    if (box.flipH) px = 1 - px;
    if (box.flipV) py = 1 - py;
    pts.push({ x: box.x + px * box.w, y: box.y + py * box.h });
  }
  if (pts.length < 2) return null;
  const ln = kid(spPr, "a:ln");
  const tail = kid(ln, "a:tailEnd")?.getAttribute("type");
  const head = kid(ln, "a:headEnd")?.getAttribute("type");
  return { points: pts, color: color(ln), dashed: false, tail: !!tail && tail !== "none", head: !!head && head !== "none" };
}

function walk(tree: Element, xf: Xform, slideW: number, out: { players: RawPlayer[]; lines: RawLine[]; title: string }) {
  for (const el of Array.from(tree.children)) {
    if (el.tagName === "p:grpSp") {
      const x = deep(kid(el, "p:grpSpPr"), "a:xfrm");
      const off = kid(x, "a:off");
      const ext = kid(x, "a:ext");
      const chOff = kid(x, "a:chOff");
      const chExt = kid(x, "a:chExt");
      if (off && ext && chOff && chExt) {
        const sx = num(ext.getAttribute("cx")) / (num(chExt.getAttribute("cx")) || 1);
        const sy = num(ext.getAttribute("cy")) / (num(chExt.getAttribute("cy")) || 1);
        const inner: Xform = (p) =>
          xf({
            x: num(off.getAttribute("x")) + (p.x - num(chOff.getAttribute("x"))) * sx,
            y: num(off.getAttribute("y")) + (p.y - num(chOff.getAttribute("y"))) * sy,
          });
        walk(el, inner, slideW, out);
      } else walk(el, xf, slideW, out);
      continue;
    }
    if (el.tagName !== "p:sp" && el.tagName !== "p:cxnSp") continue;
    const ph = deep(el, "p:ph");
    const phType = ph?.getAttribute("type") ?? "";
    const body = kid(el, "p:txBody");
    const words = text(body);
    if (phType === "title" || phType === "ctrTitle") {
      if (!out.title) out.title = words;
      continue;
    }
    const spPr = kid(el, "p:spPr");
    const box = boxOf(spPr, xf);
    if (!box) continue;
    const prst = deep(spPr, "a:prstGeom")?.getAttribute("prst") ?? (deep(spPr, "a:custGeom") ? "custom" : "");
    if (el.tagName === "p:cxnSp" || LINE_SHAPES.test(prst)) {
      out.lines.push(lineFrom(spPr, box, prst));
      continue;
    }
    if (prst === "custom" && !words) {
      const f = freeform(spPr, box);
      if (f) out.lines.push(f);
      continue;
    }
    // Arrow shapes drawn as block arrows are routes too.
    if (/Arrow$/.test(prst) && !words) {
      const horizontal = box.w >= box.h;
      const flip = prst.startsWith("left") || prst.startsWith("up");
      const a = horizontal ? { x: box.x, y: box.y + box.h / 2 } : { x: box.x + box.w / 2, y: box.y + box.h };
      const b = horizontal ? { x: box.x + box.w, y: box.y + box.h / 2 } : { x: box.x + box.w / 2, y: box.y };
      out.lines.push({ points: flip ? [b, a] : [a, b], color: color(spPr), dashed: false, tail: true, head: false });
      continue;
    }
    const shape = PLAYER_SHAPES[prst];
    const small = Math.max(box.w, box.h) <= slideW * 0.12;
    const squareish = box.w > 0 && box.h > 0 && box.w / box.h > 0.55 && box.w / box.h < 1.8;
    const label = words.replace(/\s+/g, "").toUpperCase();
    // A lone letter in a text box ("X", "O") is a player too.
    const letterBox = !shape && /^[A-Z0-9]{1,2}$/.test(label) && small;
    if ((shape && small && squareish && label.length <= 3) || letterBox) {
      out.players.push({
        cx: box.x + box.w / 2,
        cy: box.y + box.h / 2,
        size: Math.max(box.w, box.h),
        label: label === "O" && shape === "circle" ? "" : label,
        shape: letterBox ? (label === "X" ? "cross" : "circle") : shape,
        fill: color(kid(spPr, "a:solidFill") ? spPr : null),
        stroke: color(kid(spPr, "a:ln")),
      });
    }
  }
}

/** Read a .pptx file into slides with their players and lines. */
export function readDeck(name: string, bytes: Uint8Array): Deck {
  const files = unzipSync(bytes);
  const pres = xml(files, "ppt/presentation.xml");
  if (!pres) throw new Error("That file is not a PowerPoint deck (.pptx).");
  const size = deep(pres.documentElement, "p:sldSz");
  const slideW = num(size?.getAttribute("cx"), 9144000);
  const presRels = rels(files, "ppt/_rels/presentation.xml.rels");
  const ids = Array.from(pres.getElementsByTagName("p:sldId")).map((s) => s.getAttribute("r:id") ?? "");
  const slides: DeckSlide[] = ids.map((rid, i) => {
    const path = resolve("ppt/presentation.xml", presRels[rid] ?? "");
    const doc = xml(files, path);
    const out = { players: [] as RawPlayer[], lines: [] as RawLine[], title: "" };
    let notes = "";
    if (doc) {
      const tree = deep(doc.documentElement, "p:spTree");
      if (tree) walk(tree, (p) => p, slideW, out);
      const slideRels = rels(files, path.replace(/slides\/(slide\d+\.xml)$/, "slides/_rels/$1.rels"));
      const notesTarget = Object.values(slideRels).find((t) => /notesSlide/.test(t));
      if (notesTarget) {
        const nd = xml(files, resolve(path, notesTarget));
        if (nd) {
          notes = Array.from(nd.getElementsByTagName("p:sp"))
            .filter((sp) => (deep(sp, "p:ph")?.getAttribute("type") ?? "body") === "body")
            .map((sp) => text(kid(sp, "p:txBody")))
            .join("\n")
            .trim();
        }
      }
    }
    const hasPlay = out.players.length >= 3;
    const firstText = out.title || (doc ? text(deep(doc.documentElement, "p:txBody")) : "");
    return {
      index: i + 1,
      title: (out.title || firstText.split("\n")[0] || "").slice(0, 80),
      notes,
      hasPlay,
      reason: hasPlay ? "Play found" : out.players.length ? "Too few players to be a play" : "No play on this slide",
      players: out.players,
      lines: out.lines,
      letters: [...new Set(out.players.map((p) => p.label).filter(Boolean))].sort(),
    };
  });
  return { name, slides };
}

export type ImportOptions = {
  /** "vault": default position colors; "slide": keep the deck's own colors. */
  format: "vault" | "slide";
  /** Deck letter → GridIronVault letter, e.g. { F: "H" }. */
  letterMap: Record<string, string>;
  /** The coach's offense tokens (default position colors). */
  offense: TokenPreset[];
};

/** Rebuild one slide as an editable scene on the field. */
export function slideToScene(slide: DeckSlide, opts: ImportOptions): Scene {
  const scene = emptyScene();
  const all = [...slide.players.flatMap((p) => [{ x: p.cx - p.size / 2, y: p.cy - p.size / 2 }, { x: p.cx + p.size / 2, y: p.cy + p.size / 2 }]), ...slide.lines.flatMap((l) => l.points)];
  if (!all.length) return scene;
  const minX = Math.min(...all.map((p) => p.x));
  const maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const maxY = Math.max(...all.map((p) => p.y));
  const margin = 70;
  const k = Math.min((CANVAS_W - margin * 2) / (maxX - minX || 1), (CANVAS_H - margin * 2) / (maxY - minY || 1));
  const ox = (CANVAS_W - (maxX - minX) * k) / 2;
  const oy = (CANVAS_H - (maxY - minY) * k) / 2;
  const at = (p: Point): Point => ({ x: ox + (p.x - minX) * k, y: oy + (p.y - minY) * k });

  const defense = DEFENSE_TOKENS[0];
  const nodes: SceneNode[] = [];
  const players = slide.players.map((p, i) => {
    const pos = at({ x: p.cx, y: p.cy });
    const letter = opts.letterMap[p.label] ?? p.label;
    const token = opts.offense.find((t) => t.label === letter && t.side === "offense");
    const isDefense = p.shape === "triangle" || p.shape === "cross";
    const base: PlayerNode = {
      ...baseNode({ x: pos.x, y: pos.y, z: 200 + i, name: letter ? `Player ${letter}` : "Player" }),
      kind: "player",
      shape: p.shape,
      label: letter,
      size: 36,
      fill: "#ffffff",
      stroke: "#0b1524",
      textColor: "#0b1524",
      side: isDefense ? "defense" : "offense",
    };
    if (opts.format === "slide") {
      const fill = p.fill ?? (isDefense ? defense.fill : "#ffffff");
      return { ...base, fill: p.shape === "cross" ? "none" : fill, stroke: p.stroke ?? fill, textColor: p.shape === "cross" ? p.stroke ?? "#0b1524" : letterColor(fill) };
    }
    if (isDefense) return { ...base, fill: p.shape === "cross" ? "none" : defense.fill, stroke: p.shape === "cross" ? "#0b1524" : defense.stroke, textColor: "#ffffff" };
    if (token) return { ...base, shape: token.shape, fill: token.fill, stroke: token.stroke, textColor: token.textColor };
    return base;
  });
  nodes.push(...players);

  slide.lines.forEach((l, i) => {
    const pts = l.points.map(at);
    const start = pts[0];
    const color = opts.format === "slide" && l.color ? l.color : "#0B1524";
    const path: PathNode = {
      ...baseNode({ x: start.x, y: start.y, z: 100 + i, name: "Route" }),
      kind: "path",
      points: pts.map((p) => ({ x: p.x - start.x, y: p.y - start.y })),
      handles: {},
      style: l.dashed ? "dashed" : "solid",
      curve: pts.length > 3 ? "spline" : "straight",
      startCap: l.head ? "arrow" : "none",
      endCap: l.tail ? "arrow" : "none",
      stroke: color,
      width: DEFAULT_STROKE,
      closed: false,
      fill: "none",
      fillOpacity: 0.16,
      fromId: null,
      toId: null,
    };
    nodes.push(path);
  });

  // Line of scrimmage: in front of the center if there is one, else the
  // middle row of offensive players.
  const center = players.find((p) => p.label === "C");
  const offenseYs = players.filter((p) => p.side === "offense").map((p) => p.y).sort((a, b) => a - b);
  const losY = center ? center.y - 22 : offenseYs.length ? offenseYs[Math.floor(offenseYs.length / 2)] - 22 : scene.losY;
  return { ...scene, losY: Math.max(90, Math.min(600, Math.round(losY))), nodes };
}
