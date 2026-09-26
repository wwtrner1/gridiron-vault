import type { TokenPreset } from "../lib/presets";

/** A position token as a small glyph for tool trays, keys and preset chips. */
export function TokenGlyph({ preset, size = 26 }: { preset: TokenPreset; size?: number }) {
  const r = 11;
  return (
    <svg width={size} height={size} viewBox="-14 -14 28 28" aria-hidden="true">
      {preset.shape === "circle" && <circle r={r} fill={preset.fill} stroke={preset.stroke} strokeWidth={2} />}
      {preset.shape === "square" && (
        <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={2} fill={preset.fill} stroke={preset.stroke} strokeWidth={2} />
      )}
      {preset.shape === "diamond" && (
        <polygon points={`0,${-r} ${r},0 0,${r} ${-r},0`} fill={preset.fill} stroke={preset.stroke} strokeWidth={2} />
      )}
      {preset.shape === "triangle" && (
        <polygon points={`0,${-r} ${r},${r * 0.8} ${-r},${r * 0.8}`} fill={preset.fill} stroke={preset.stroke} strokeWidth={2} />
      )}
      {preset.shape === "ball" && <ellipse rx={r} ry={r * 0.62} fill={preset.fill} stroke={preset.stroke} strokeWidth={2} />}
      {preset.shape === "cross" && (
        <g stroke={preset.stroke} strokeWidth={3} strokeLinecap="round">
          <line x1={-8} y1={-8} x2={8} y2={8} />
          <line x1={8} y1={-8} x2={-8} y2={8} />
        </g>
      )}
      {preset.shape !== "cross" && preset.label && (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={12}
          fontWeight={700}
          fill={preset.textColor}
          fontFamily="'Saira Condensed', 'Arial Narrow', sans-serif"
        >
          {preset.label}
        </text>
      )}
    </svg>
  );
}
