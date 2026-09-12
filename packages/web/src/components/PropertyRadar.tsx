import { isJudgedProperty, rangeVerdict, SOAP_PROPERTY_GUIDE } from '@soap-calc/core';
import type { SoapProperties, SoapPropertyName } from '@soap-calc/core';
import { radarAngle, radarPoint } from '../lib/radarGeometry';

type PropertyRadarProps = {
  properties: SoapProperties;
  order: SoapPropertyName[];
  lowCoverage: boolean;
};

// Compact uppercase axis labels for the radar — short enough to sit around the ring without
// wrapping (the Meters view carries the longer names + tooltips).
const AXIS_LABEL: Record<SoapPropertyName, string> = {
  hardness: 'Hardness',
  cleansing: 'Cleansing',
  condition: 'Condition',
  creamy: 'Creamy',
  bubbly: 'Bubbly',
  longevity: 'Longevity',
};

const CX = 230;
const CY = 200;
const R = 112;
const RINGS = [0.25, 0.5, 0.75, 1];

const angle = (i: number, n: number): number => radarAngle(i, n);
const point = (i: number, n: number, radius: number): { x: number; y: number } =>
  radarPoint(CX, CY, i, n, radius);

/**
 * Radar of the six 0–100 bar-property scores. Radius IS the score, so the suggested range
 * cannot be one circle — every axis has its own band (cleansing 12–22 against conditioning
 * 44–69). It is drawn as a zone instead: the polygon through each axis's band high with the
 * polygon through each band low punched out of it. Same rule as the fatty-acid radar beside
 * it on the page — the shaded region is exactly the region the verdict is computed against,
 * so "in range" reads as "on the shading" in both charts even though they scale differently.
 *
 * Concentric hairline rings, a red recipe polygon with accent vertices, and each axis
 * labelled with its rounded value and an In range / Too low / Too high verdict (accent when
 * out of the suggested range). Decorative (aria-hidden) — the panel's sr-only meter list is
 * the accessible source of these readings. A dashed polygon and "Low data" verdicts flag a
 * low-coverage estimate.
 */
export function PropertyRadar({ properties, order, lowCoverage }: PropertyRadarProps) {
  const n = order.length;
  // The vertex rides the figure the axis PRINTS (a rounded score), so the dot, the number
  // under the label and the verdict are one reading — see core's rangeVerdict.
  const valuePoints = order.map((key, i) => {
    const v = Math.max(0, Math.min(100, Math.round(properties[key])));
    return point(i, n, (v / 100) * R);
  });
  const polygon = valuePoints.map((p) => `${p.x},${p.y}`).join(' ');
  // The suggested-range zone. Outer subpath first, inner second, filled evenodd so the
  // middle is punched out — a band that follows each axis's own guide rather than a ring.
  const boundary = (pick: (g: { low: number; high: number }) => number): string =>
    `M${order
      .map((key, i) => {
        const p = point(i, n, (pick(SOAP_PROPERTY_GUIDE[key]) / 100) * R);
        return `${p.x},${p.y}`;
      })
      .join(' ')}Z`;
  const bandPath = `${boundary((g) => g.high)}${boundary((g) => g.low)}`;

  return (
    <svg
      className="property-radar"
      viewBox="0 0 460 380"
      role="presentation"
      aria-hidden="true"
      data-cx={CX}
      data-cy={CY}
      data-r={R}
    >
      <path
        data-testid="radar-band"
        d={bandPath}
        fillRule="evenodd"
        style={{ fill: 'var(--accent-soft)', stroke: 'none' }}
      />
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
      {/* Stroke only: a filled polygon in the band's own tint blended into it where the two
          overlapped, and this chart's question — is the red line on the shading? — is
          answered by the line. */}
      <polygon
        data-testid="radar-recipe"
        points={polygon}
        style={{
          fill: 'none',
          stroke: 'var(--accent)',
          strokeWidth: 2,
          strokeLinejoin: 'round',
          strokeDasharray: lowCoverage ? '4 3' : 'none',
        }}
      />
      {order.map((key, i) => {
        const guide = SOAP_PROPERTY_GUIDE[key];
        const out =
          !lowCoverage &&
          isJudgedProperty(key) &&
          rangeVerdict(properties[key], guide.low, guide.high, 0) !== 'in';
        const p = valuePoints[i];
        return (
          <circle key={key} cx={p.x} cy={p.y} r={out ? 3 : 2.5} style={{ fill: 'var(--accent)' }} />
        );
      })}
      {order.map((key, i) => {
        const value = properties[key];
        const guide = SOAP_PROPERTY_GUIDE[key];
        const judged = isJudgedProperty(key);
        const verdict = rangeVerdict(value, guide.low, guide.high, 0);
        const out = !lowCoverage && judged && verdict !== 'in';
        const lab = point(i, n, R + 30);
        const c = Math.cos(angle(i, n));
        const anchor = c < -0.3 ? 'end' : c > 0.3 ? 'start' : 'middle';
        // Stack the label / value / status block away from the ring so a high vertex can't
        // crowd it: upper axes lift their block above the anchor, lower axes hang below.
        const s = Math.sin(angle(i, n));
        const labelY = lab.y + (s <= -0.7 ? -40 : s < -0.3 ? -20 : 0);
        // An unjudged axis states its typical range in the slot the verdict would fill —
        // the same thing the panel already prints beside iodine and INS.
        const status = lowCoverage
          ? 'Low data'
          : !judged
            ? `Typical ${guide.low}–${guide.high}`
            : verdict === 'low'
              ? 'Too low'
              : verdict === 'high'
                ? 'Too high'
                : 'In range';
        return (
          <g key={key}>
            <text
              x={lab.x}
              y={labelY}
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
              y={labelY + 22}
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
              y={labelY + 37}
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
