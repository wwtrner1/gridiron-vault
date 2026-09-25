import type { PathNode, PlayerNode, SceneNode, ShapeNode, TextNode } from "./types";
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

const markerUrl = (cap: string, color: string) =>
  cap === "none" ? undefined : `url(#${cap}-${color.replace(/[^a-zA-Z0-9]/g, "")})`;

function PlayerGlyph({ node }: { node: PlayerNode }) {
  const r = node.size / 2;
  const common = { fill: node.fill, stroke: node.stroke, strokeWidth: 2.4 };
  return (
    <>
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
          fill={node.textColor}
          fontFamily="'Saira Condensed', 'Arial Narrow', sans-serif"
        >
          {node.label}
        </text>
      )}
    </>
  );
}

function PathGlyph({ node }: { node: PathNode }) {
  const d = node.style === "motion" ? motionPath(node.points) : pathData(node);
  if (!d) return null;
  const stroke = lineColor(node);
  return (
    <>
      {node.closed && node.fill !== "none" && (
        <path d={pathData({ ...node, closed: true })} fill={node.fill} fillOpacity={node.fillOpacity} stroke="none" />
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
    </>
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

export function NodeGlyph({ node }: { node: SceneNode }) {
  if (node.hidden) return null;
  if (node.kind === "player") return <PlayerGlyph node={node} />;
  if (node.kind === "path") return <PathGlyph node={node} />;
  if (node.kind === "shape") return <ShapeGlyph node={node} />;
  return <TextGlyph node={node} />;
}

export function NodeLayer({
  node,
  children,
  ...rest
}: { node: SceneNode; children?: React.ReactNode } & React.SVGProps<SVGGElement>) {
  return (
    <g
      transform={`translate(${node.x} ${node.y}) rotate(${node.rotation}) scale(${node.scaleX} ${node.scaleY})`}
      {...rest}
    >
      <NodeGlyph node={node} />
      {children}
    </g>
  );
}

export const strokeColors = (nodes: SceneNode[]) =>
  nodes.filter((n): n is PathNode => n.kind === "path").map(lineColor);
