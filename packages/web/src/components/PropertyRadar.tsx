import { SOAP_PROPERTY_GUIDE } from '@soap-calc/core';
import type { SoapProperties, SoapPropertyName } from '@soap-calc/core';

type PropertyRadarProps = {
  properties: SoapProperties;
  order: SoapPropertyName[];
  lowCoverage: boolean;
};

// Compact uppercase axis labels for the radar — short enough to sit around the ring without
// wrapping (the Bars view carries the longer names + tooltips).
const AXIS_LABEL: Record<SoapPropertyName, string> = {
  hardness: 'Hardness',
  cleansing: 'Cleansing',
  condition: 'Condition',
  creamy: 'Creamy',
  bubbly: 'Bubbly',
  longevity: 'Longevity',
};

const CX = 230;
const CY = 162;
const R = 112;
const RINGS = [0.25, 0.5, 0.75, 1];

const angle = (i: number, n: number): number => (-90 + (i * 360) / n) * (Math.PI / 180);
const point = (i: number, n: number, radius: number): { x: number; y: number } => ({
  x: CX + radius * Math.cos(angle(i, n)),
  y: CY + radius * Math.sin(angle(i, n)),
});

/**
 * Radar of the six 0–100 bar-property scores. Concentric hairline rings, a red recipe polygon
 * with accent vertices, and each axis labelled with its rounded value and an In range / Too low
 * / Too high verdict (accent when out of the suggested range). Decorative (aria-hidden) — the
 * panel's sr-only meter list is the accessible source of these readings. A dashed polygon and
 * "Low data" verdicts flag a low-coverage estimate.
 */
export function PropertyRadar({ properties, order, lowCoverage }: PropertyRadarProps) {
  const n = order.length;
  const valuePoints = order.map((key, i) => {
    const v = Math.max(0, Math.min(100, properties[key]));
    return point(i, n, (v / 100) * R);
  });
  const polygon = valuePoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <svg className="property-radar" viewBox="0 0 460 350" role="presentation" aria-hidden="true">
      {RINGS.map((f) => (
        <circle
          key={f}
          cx={CX}
          cy={CY}
          r={R * f}
          style={{ fill: 'none', stroke: 'var(--border)', strokeWidth: 1 }}
        />
      ))}
      {order.map((key, i) => {
        const tip = point(i, n, R);
        return (
          <line
            key={key}
            x1={CX}
            y1={CY}
            x2={tip.x}
            y2={tip.y}
            style={{ stroke: 'var(--border)', strokeWidth: 1 }}
          />
        );
      })}
      <polygon
        data-testid="radar-recipe"
        points={polygon}
        style={{
          fill: 'var(--accent-soft)',
          stroke: 'var(--accent)',
          strokeWidth: 2,
          strokeLinejoin: 'round',
          strokeDasharray: lowCoverage ? '4 3' : 'none',
        }}
      />
      {order.map((key, i) => {
        const value = properties[key];
        const guide = SOAP_PROPERTY_GUIDE[key];
        const out = !lowCoverage && (value < guide.low || value > guide.high);
        const p = valuePoints[i];
        return (
          <circle key={key} cx={p.x} cy={p.y} r={out ? 3 : 2.5} style={{ fill: 'var(--accent)' }} />
        );
      })}
      {order.map((key, i) => {
        const value = properties[key];
        const guide = SOAP_PROPERTY_GUIDE[key];
        const out = !lowCoverage && (value < guide.low || value > guide.high);
        const lab = point(i, n, R + 30);
        const c = Math.cos(angle(i, n));
        const anchor = c < -0.3 ? 'end' : c > 0.3 ? 'start' : 'middle';
        const status = lowCoverage
          ? 'Low data'
          : value < guide.low
            ? 'Too low'
            : value > guide.high
              ? 'Too high'
              : 'In range';
        return (
          <g key={key}>
            <text
              x={lab.x}
              y={lab.y}
              textAnchor={anchor}
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 12.5,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                fill: 'var(--label)',
              }}
            >
              {AXIS_LABEL[key]}
            </text>
            <text
              x={lab.x}
              y={lab.y + 22}
              textAnchor={anchor}
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 21,
                fontWeight: 800,
                fill: out ? 'var(--accent)' : 'var(--text)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {lowCoverage ? '~' : ''}
              {Math.round(value)}
            </text>
            <text
              x={lab.x}
              y={lab.y + 37}
              textAnchor={anchor}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8.5,
                fontWeight: 500,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                fill: out ? 'var(--accent)' : 'var(--label)',
              }}
            >
              {status}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
