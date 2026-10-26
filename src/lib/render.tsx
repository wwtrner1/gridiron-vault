import type { PathNode, PlayerNode, Scene, SceneNode, ShapeNode, TextNode } from "./types";
import { depthLabel, routeDepths } from "./depth";
import { FIRST_READ } from "./types";
import { dashFor, motionPath, pathData, polygonPoints } from "./geometry";

/** The colour a line is drawn in: the first read always shows cyan. */
export const lineColor = (node: PathNode) => (node.firstRead ? FIRST_READ : node.stroke);

/** Marker definitions shared by the editor, thumbnails and exports. */
export function MarkerDefs({ colors }: { colors: string[] }) {
  const unique = Array.from(new Set(colors));
  return (
    <defs>
      {unique.map((c) => {
        const key = c.replace(/[^a-zA-Z0-9]/g, "");
        return (
          <g key={key}>
            <marker
              id={`arrow-${key}`}
              viewBox="0 0 12 12"
              refX="9"
              refY="6"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 1 1 L 11 6 L 1 11 z" fill={c} />
            </marker>
            <marker
              id={`chevron-${key}`}
              viewBox="0 0 12 12"
              refX="9"
              refY="6"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 2 1 L 11 6 L 2 11" fill="none" stroke={c} strokeWidth="2.4" />
            </marker>
            <marker id={`tee-${key}`} viewBox="0 0 12 12" refX="2" refY="6" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 2 0 L 2 12" stroke={c} strokeWidth="3" />
            </marker>
            <marker id={`dot-${key}`} viewBox="0 0 12 12" refX="6" refY="6" markerWidth="4" markerHeight="4" orient="auto">
              <circle cx="6" cy="6" r="4.5" fill={c} />
            </marker>
          </g>
        );
      })}
    </defs>
  );
}

/**
 * Paint order for every diagram: lines, zones and text by z, then players on
 * top, so a route starts at the edge of its token instead of across the letter.
 */
export function drawOrder<T extends { kind: string; z: number }>(nodes: T[]): T[] {
  const layer = (n: T) => (n.kind === "player" ? 1 : 0);
  return [...nodes].sort((a, b) => layer(a) - layer(b) || a.z - b.z);
}

const markerUrl = (cap: string, color: string) =>
  cap === "none" ? undefined : `url(#${cap}-${color.replace(/[^a-zA-Z0-9]/g, "")})`;

/**
 * Print only: a white ring around each token, so stacked and bunched players
 * stay separate shapes on a small card. Drawn as a fat white outline of the
 * same shape, under the token.
 */
const RING = "#FFFFFF";
const ringWidth = (size: number) => 2.4 + size * 0.18;

function PlayerGlyph({ node, print = false }: { node: PlayerNode; print?: boolean }) {
  const r = node.size / 2;
  const outline = node.outlineStyle ?? "solid";
  // A pre-snap ghost: hollow, dashed and faded, in the player's own color.
  const ghost = !!node.ghostOf;
  const common = ghost
    ? { fill: "#FFFFFF", fillOpacity: 0.7, stroke: node.fill, strokeWidth: 2, strokeDasharray: "4 3" }
    : {
        fill: node.fill,
        stroke: outline === "none" ? "none" : node.stroke,
        strokeWidth: 2.4,
        strokeDasharray: outline === "dash" ? "5 4" : undefined,
      };
  const ring = print && !ghost && node.shape !== "cross" ? { fill: RING, stroke: RING, strokeWidth: ringWidth(node.size) } : null;
  return (
    <g opacity={ghost ? 0.75 : undefined}>
      {node.shade && node.shade !== "transparent" && <circle cx={0} cy={0} r={r * 1.6} fill={node.shade} stroke="none" />}
      {ring && node.shape === "circle" && <circle cx={0} cy={0} r={r} {...ring} />}
      {ring && node.shape === "square" && <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={3} {...ring} />}
      {ring && node.shape === "diamond" && <polygon points={`0,${-r} ${r},0 0,${r} ${-r},0`} {...ring} />}
      {ring && node.shape === "triangle" && <polygon points={`0,${-r} ${r * 0.92},${r * 0.75} ${-r * 0.92},${r * 0.75}`} {...ring} />}
      {ring && node.shape === "ball" && <ellipse cx={0} cy={0} rx={r} ry={r * 0.62} {...ring} />}
      {node.shape === "circle" && <circle cx={0} cy={0} r={r} {...common} />}
      {node.shape === "square" && <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={3} {...common} />}
      {node.shape === "diamond" && <polygon points={`0,${-r} ${r},0 0,${r} ${-r},0`} {...common} />}
      {node.shape === "triangle" && (
        <polygon points={`0,${-r} ${r * 0.92},${r * 0.75} ${-r * 0.92},${r * 0.75}`} {...common} />
      )}
      {node.shape === "cross" && (
        <g stroke={node.stroke} strokeWidth={4.6} strokeLinecap="round">
          <line x1={-r * 0.72} y1={-r * 0.72} x2={r * 0.72} y2={r * 0.72} />
          <line x1={r * 0.72} y1={-r * 0.72} x2={-r * 0.72} y2={r * 0.72} />
        </g>
      )}
      {node.shape === "ball" && <ellipse cx={0} cy={0} rx={r} ry={r * 0.62} {...common} />}
      {node.shape !== "cross" && node.label && (
        <text
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={node.size * 0.6}
          fontWeight={700}
          fill={ghost ? node.fill : node.textColor}
          fontFamily="'Saira Condensed', 'Arial Narrow', sans-serif"
        >
          {node.label}
        </text>
      )}
    </g>
  );
}

/** Print only: white casing each side of a route, so crossing routes and a route along the line of scrimmage stay apart. */
const casingWidth = (width: number) => width * 2.2;

function PathGlyph({ node, print = false }: { node: PathNode; print?: boolean }) {
  const d = node.style === "motion" ? motionPath(node.points) : pathData(node);
  if (!d) return null;
  const stroke = lineColor(node);
  return (
    <>
      {node.closed && node.fill !== "none" && (
        <path d={pathData({ ...node, closed: true })} fill={node.fill} fillOpacity={node.fillOpacity} stroke="none" />
      )}
      {print && !node.closed && (
        <path d={d} fill="none" stroke={RING} strokeWidth={casingWidth(node.width)} strokeLinecap="round" strokeLinejoin="round" />
      )}
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={node.width}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dashFor(node.style, node.width)}
        markerStart={markerUrl(node.startCap, stroke)}
        markerEnd={markerUrl(node.endCap, stroke)}
      />
      <RouteTag node={node} color={stroke} />
    </>
  );
}

/** Longest route tag a coach can type; longer text would cover the field. */
export const TAG_MAX = 24;
/** Route tag type size, in canvas units, before any print boost. */
export const TAG_SIZE = 13;

/**
 * A route's tag, drawn in the path's own frame but turned back upright so it
 * reads the same on a flipped or rotated route. It sits just past the end of
 * the route, along its last leg; on a zone it sits in the middle.
 */
export type TagLayout = { text: string; at: { x: number; y: number }; ox: number; oy: number; halfW: number; halfH: number; fontSize: number };

/** Where a route's tag sits: its anchor in the path's own points, and its offset and half-size in world units. */
export function tagLayout(node: PathNode): TagLayout | null {
  const text = node.tag?.trim().slice(0, TAG_MAX);
  const pts = node.points;
  if (!text || pts.length < 2) return null;
  const fontSize = TAG_SIZE * (node.tagScale ?? 1);
  const halfW = (text.length * fontSize * 0.56) / 2 + 6;
  const halfH = fontSize * 0.75;
  let at = pts[pts.length - 1];
  let ox = 0;
  let oy = 0;
  if (node.closed) {
    at = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  } else {
    const prev = pts[pts.length - 2];
    const a = (node.rotation * Math.PI) / 180;
    const lx = (at.x - prev.x) * node.scaleX;
    const ly = (at.y - prev.y) * node.scaleY;
    const wx = lx * Math.cos(a) - ly * Math.sin(a);
    const wy = lx * Math.sin(a) + ly * Math.cos(a);
    const len = Math.hypot(wx, wy) || 1;
    const ux = wx / len;
    const uy = wy / len;
    const gap = 10 + halfW * Math.abs(ux) + halfH * Math.abs(uy);
    ox = ux * gap;
    oy = uy * gap;
  }
  return { text, at, ox, oy, halfW, halfH, fontSize };
}

function RouteTag({ node, color }: { node: PathNode; color: string }) {
  const layout = tagLayout(node);
  if (!layout) return null;
  const { text, at, ox, oy, halfW, halfH, fontSize } = layout;
  return (
    <g transform={`translate(${at.x} ${at.y}) scale(${1 / (node.scaleX || 1)} ${1 / (node.scaleY || 1)}) rotate(${-node.rotation})`}>
      <rect
        x={ox - halfW}
        y={oy - halfH}
        width={halfW * 2}
        height={halfH * 2}
        rx={4 * (node.tagScale ?? 1)}
        fill="#FFFFFF"
        stroke={color}
        strokeWidth={1.4 * (node.tagScale ?? 1)}
      />
      <text
        x={ox}
        y={oy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight={700}
        fill="#10202B"
        fontFamily="'Barlow', system-ui, sans-serif"
      >
        {text}
      </text>
    </g>
  );
}

function ShapeGlyph({ node }: { node: ShapeNode }) {
  const common = {
    fill: node.fill,
    fillOpacity: node.fillOpacity,
    stroke: node.stroke,
    strokeWidth: node.width,
    strokeDasharray: dashFor(node.dash, node.width),
  };
  if (node.shapeType === "ellipse")
    return <ellipse cx={0} cy={0} rx={node.w / 2} ry={node.h / 2} {...common} />;
  if (node.shapeType === "polygon") return <polygon points={polygonPoints(node)} {...common} />;
  return <rect x={-node.w / 2} y={-node.h / 2} width={node.w} height={node.h} rx={node.radius} {...common} />;
}

function TextGlyph({ node }: { node: TextNode }) {
  const width = Math.max(40, node.text.length * node.fontSize * 0.56);
  return (
    <>
      {node.boxed && (
        <rect
          x={-width / 2 - 8}
          y={-node.fontSize * 0.82}
          width={width + 16}
          height={node.fontSize * 1.64}
          rx={5}
          fill="#FFFFFF"
          stroke="#C6D0C6"
          strokeWidth={1.2}
        />
      )}
      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={node.fontSize}
        fontWeight={node.weight}
        fill={node.color}
        fontFamily="'Barlow', system-ui, sans-serif"
      >
        {node.text}
      </text>
    </>
  );
}

/** `print` adds the white token rings and route casings that keep a small printed diagram readable. */
export function NodeGlyph({ node, print = false }: { node: SceneNode; print?: boolean }) {
  if (node.hidden) return null;
  if (node.kind === "player") return <PlayerGlyph node={node} print={print} />;
  if (node.kind === "path") return <PathGlyph node={node} print={print} />;
  if (node.kind === "shape") return <ShapeGlyph node={node} />;
  return <TextGlyph node={node} />;
}

export function NodeLayer({
  node,
  print,
  children,
  ...rest
}: { node: SceneNode; print?: boolean; children?: React.ReactNode } & React.SVGProps<SVGGElement>) {
  return (
    <g
      transform={`translate(${node.x} ${node.y}) rotate(${node.rotation}) scale(${node.scaleX} ${node.scaleY})`}
      {...rest}
    >
      <NodeGlyph node={node} print={print} />
      {children}
    </g>
  );
}

export const strokeColors = (nodes: SceneNode[]) =>
  nodes.filter((n): n is PathNode => n.kind === "path").map(lineColor);

/**
 * Yards past the line of scrimmage at each route's break, drawn as a small
 * pill on the outside of the turn. `scale` grows it on small print cards.
 */
export function DepthLayer({ scene, scale = 1 }: { scene: Scene; scale?: number }) {
  const marks = routeDepths(scene);
  if (!marks.length) return null;
  return (
    <g pointerEvents="none" aria-hidden="true">
      {marks.map((m, i) => {
        const l = depthLabel(m, scale);
        return (
          <g key={`${m.pathId}-${i}`}>
            <rect x={l.x - l.halfW} y={l.y - l.halfH} width={l.halfW * 2} height={l.halfH * 2} rx={3 * scale} fill="#FFFFFF" fillOpacity={0.92} stroke="#5B7085" strokeWidth={0.8 * scale} />
            <text x={l.x} y={l.y} textAnchor="middle" dominantBaseline="central" fontSize={l.size} fontWeight={700} fill="#10202B" fontFamily="'IBM Plex Mono', ui-monospace, monospace">
              {m.yards}
            </text>
          </g>
        );
      })}
    </g>
  );
}
