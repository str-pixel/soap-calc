import { formatPropertyRangePercent, formatSoapPropertyPercent } from '@soap-calc/core';
import { fitRadius, radarAngle, radarPoint, RING_INNER, RING_OUTER } from '../lib/radarGeometry';

export type FattyAcidRadarAxis = {
  key: string;
  /** Short axis name — the Meters rows carry the full group label. */
  label: string;
  /** Percent of oil weight. */
  value: number;
  /** The group's typical band, in percent. */
  low: number;
  high: number;
  /** Whether this reading earns "Too high" — decided upstream by core's fattyAcidIsTooHigh,
   *  so the chart and the Meters rows share one answer. Under the current policy none of the
   *  six drawn groups is warned (the flaggable ones are the catch-alls listed under the
   *  chart), so the panel passes false for every axis; the renderer keeps the path. */
  tooHigh: boolean;
};

type FattyAcidRadarProps = {
  axes: FattyAcidRadarAxis[];
  lowCoverage: boolean;
};

const CX = 230;
const CY = 200;
const R = 112;

/**
 * Radar of the named fatty-acid groups, FITTED PER AXIS: each axis maps its own typical
 * band onto the same shaded ring, so a group in range sits on the ring, too low sits
 * inside it, too high pokes out. The nine groups' typical ranges differ thirty-fold
 * (0–1% linolenic against 32–41% oleic); on a shared percent radius most of them would
 * never leave the hub. Only the geometry is normalised — every axis prints its true
 * percentage, and a verdict only when a high reading is flagged; otherwise it states its
 * typical range in that slot. Decorative (aria-hidden): the panel's sr-only meter list is
 * the accessible source of these readings. A dashed polygon and "Low data" verdicts flag
 * a low-coverage estimate.
 */
export function FattyAcidRadar({ axes, lowCoverage }: FattyAcidRadarProps) {
  const n = axes.length;
  const valuePoints = axes.map((a, i) =>
    radarPoint(CX, CY, i, n, fitRadius(Math.max(0, a.value), a.low, a.high) * R),
  );
  const polygon = valuePoints.map((p) => `${p.x},${p.y}`).join(' ');
  // Only a flagged HIGH reading earns a verdict — see core's fatty-acid-verdict for why and
  // for the measurement behind it. Every other axis states its typical range in that slot,
  // the way the properties panel's longevity axis does. Sitting off the ring is shown by the
  // geometry either way; it is only called a fault where a source says it is one.
  const verdict = (a: FattyAcidRadarAxis) =>
    lowCoverage
      ? 'Low data'
      : a.tooHigh
        ? 'Too high'
        : `Typical ${formatPropertyRangePercent(a.low, a.high)}`;
  const isOut = (a: FattyAcidRadarAxis) => !lowCoverage && a.tooHigh;

  return (
    <svg
      className="fatty-radar"
      viewBox="0 0 460 380"
      role="presentation"
      aria-hidden="true"
      data-cx={CX}
      data-cy={CY}
      data-r={R}
    >
      {/* The ring: a thick-stroked circle IS an annulus, filled with the same soft accent
          the Meters rows use for the suggested band, so the two views share one colour
          language for "typical". Hairlines at its edges and at the rim. */}
      <circle
        data-testid="radar-ring"
        cx={CX}
        cy={CY}
        r={((RING_INNER + RING_OUTER) / 2) * R}
        style={{
          fill: 'none',
          stroke: 'var(--accent-soft)',
          strokeWidth: (RING_OUTER - RING_INNER) * R,
        }}
      />
      {[RING_INNER, RING_OUTER, 1].map((f) => (
        <circle
          key={f}
          cx={CX}
          cy={CY}
          r={R * f}
          style={{ fill: 'none', stroke: 'var(--border)', strokeWidth: 1 }}
        />
      ))}
      {axes.map((a, i) => {
        const tip = radarPoint(CX, CY, i, n, R);
        return (
          <line
            key={a.key}
            x1={CX}
            y1={CY}
            x2={tip.x}
            y2={tip.y}
            style={{ stroke: 'var(--border)', strokeWidth: 1 }}
          />
        );
      })}
      {/* Stroke only: a filled polygon in the ring's own tint blended into it where the two
          overlapped, and this chart's one question — is the red line on the ring? — is
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
      {axes.map((a, i) => {
        const p = valuePoints[i];
        return (
          <circle
            key={a.key}
            cx={p.x}
            cy={p.y}
            r={isOut(a) ? 3 : 2.5}
            style={{ fill: 'var(--accent)' }}
          />
        );
      })}
      {axes.map((a, i) => {
        const out = isOut(a);
        const lab = radarPoint(CX, CY, i, n, R + 30);
        const c = Math.cos(radarAngle(i, n));
        const anchor = c < -0.3 ? 'end' : c > 0.3 ? 'start' : 'middle';
        // Stack the label / value / status block away from the ring so a high vertex can't
        // crowd it: upper axes lift their block above the anchor, lower axes hang below.
        const s = Math.sin(radarAngle(i, n));
        const labelY = lab.y + (s <= -0.7 ? -40 : s < -0.3 ? -20 : 0);
        return (
          <g key={a.key}>
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
              {a.label}
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
              {formatSoapPropertyPercent(a.value)}
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
              {verdict(a)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
