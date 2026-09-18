import {
  FORMULATION_PREFERENCE_GUIDE,
  isJudgedProperty,
  rangeVerdict,
  SOAP_PROPERTY_GUIDE,
} from '@soap-calc/core';
import type { SoapProperties, SoapPropertyName } from '@soap-calc/core';
import { fitRadius, radarAngle, radarPoint, RING_INNER, RING_OUTER } from '../lib/radarGeometry';

type PropertyRadarProps = {
  properties: SoapProperties;
  order: SoapPropertyName[];
  lowCoverage: boolean;
};

// Uppercase axis labels for the radar, the same words the Meters rows and the batch sheet use.
// The longest, CONDITIONING on the right-hand side, ends at x≈455 of the 460-wide viewBox
// (measured in Chromium, 2026-09-13), so none needs shortening.
const AXIS_LABEL: Record<SoapPropertyName, string> = {
  hardness: 'Hardness',
  cleansing: 'Cleansing',
  condition: 'Conditioning',
  creamy: 'Creamy',
  bubbly: 'Bubbly',
  longevity: 'Longevity',
};

const CX = 230;
const CY = 200;
const R = 112;
const RINGS = [RING_INNER, RING_OUTER, 1];

const angle = (i: number, n: number): number => radarAngle(i, n);
const point = (i: number, n: number, radius: number): { x: number; y: number } =>
  radarPoint(CX, CY, i, n, radius);

/**
 * The tighter target band, drawn as a RIBBON rather than a second ring.
 *
 * The ring works because every axis maps its own suggested range onto the same annulus. The
 * target band gets no such luck: fitted to each axis's suggested range it lands somewhere
 * different on every one — 0.54–0.61 on cleansing against 0.61–0.68 on hardness — and creamy's
 * outer edge falls at 0.737, OUTSIDE the ring at 0.72, because the source's own creamy target
 * high (50) exceeds its suggested high (48). Longevity has no target band at all, so the shape
 * also has to be able to stop.
 *
 * So it is an irregular band that follows the axes that have one and leaves a gap across the
 * axes that do not: outward along the target highs, back along the target lows. Runs are found
 * circularly, so the shape survives a reordering of the axes, and a run of one axis is skipped
 * because a two-point ribbon has no area.
 */
function targetRibbonPaths(
  order: SoapPropertyName[],
  point: (i: number, n: number, radius: number) => { x: number; y: number },
  fitted: (key: SoapPropertyName, value: number) => number,
): string[] {
  const n = order.length;
  const band = order.map((key) => FORMULATION_PREFERENCE_GUIDE[key]);
  if (band.every((b) => b)) {
    // Every axis has one: a closed donut, outer ring then inner ring, evenodd-filled.
    const ring = (pick: 'low' | 'high') =>
      order
        .map((key, i) => {
          const p = point(i, n, fitted(key, band[i]![pick]));
          return `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`;
        })
        .join(' ') + ' Z';
    return [`${ring('high')} ${ring('low')}`];
  }
  const runs: number[][] = [];
  let current: number[] = [];
  // Two laps so a run that wraps past the last axis is found whole.
  for (let step = 0; step < n * 2; step++) {
    const i = step % n;
    if (band[i] && !current.includes(i)) current.push(i);
    else if (!band[i]) {
      if (current.length > 1) runs.push(current);
      current = [];
    }
    if (current.length === n) break;
  }
  if (current.length > 1) runs.push(current);
  // A wrapped run and its unwrapped halves can both be collected; keep the longest per member.
  const seen = new Set<number>();
  return runs
    .sort((a, b) => b.length - a.length)
    .filter((run) => {
      if (run.some((i) => seen.has(i))) return false;
      run.forEach((i) => seen.add(i));
      return true;
    })
    .map((run) => {
      const outer = run.map((i) => point(i, n, fitted(order[i], band[i]!.high)));
      const inner = [...run].reverse().map((i) => point(i, n, fitted(order[i], band[i]!.low)));
      return (
        [...outer, ...inner]
          .map((p, k) => `${k === 0 ? 'M' : 'L'}${p.x},${p.y}`)
          .join(' ') + ' Z'
      );
    });
}

/**
 * Radar of the six bar-property scores, FITTED PER AXIS: each axis maps its own suggested
 * range onto the same shaded ring, so a score in range sits on the ring, too low sits inside
 * it and too high pokes out. Identical device to the fatty-acid radar beside it on the page.
 *
 * Radius used to be the raw score, which made the SHAPE lie. The six bands are nothing like
 * each other — cleansing 8–20 against conditioning 44–69 — so a recipe sitting exactly
 * mid-band on every axis, the ideal bar, drew radii from 0.14 to 0.56 and looked badly
 * unbalanced, while a recipe scoring 30 on everything drew a clean hexagon while being too
 * high on cleansing and too low on conditioning. Regularity did not mean balance and balance
 * did not look regular. Fitted, the ideal bar draws a circle on the ring.
 *
 * Only the geometry is normalised: every axis still prints its true score. Decorative
 * (aria-hidden) — the panel's sr-only meter list is the accessible source of these readings.
 * A dashed polygon and "Low data" verdicts flag a low-coverage estimate, and an unjudged
 * property states its typical range where a verdict would go, at any coverage: it has no
 * verdict to withhold.
 */
export function PropertyRadar({ properties, order, lowCoverage }: PropertyRadarProps) {
  const n = order.length;
  // The vertex rides the figure the axis PRINTS (a rounded score), so the dot, the number
  // under the label and the verdict are one reading — see core's rangeVerdict.
  const valuePoints = order.map((key, i) => {
    const v = Math.max(0, Math.min(100, Math.round(properties[key])));
    const guide = SOAP_PROPERTY_GUIDE[key];
    return point(i, n, fitRadius(v, guide.low, guide.high) * R);
  });
  const polygon = valuePoints.map((p) => `${p.x},${p.y}`).join(' ');

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
      {/* The suggested range: a thick-stroked circle IS an annulus, in the same soft accent
          the Meters rows shade their band with, so both views share one colour language. */}
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
      {RINGS.map((f) => (
        <circle
          key={f}
          cx={CX}
          cy={CY}
          r={R * f}
          style={{ fill: 'none', stroke: 'var(--border)', strokeWidth: 1 }}
        />
      ))}
      {/* The target band. Under the axis lines and the recipe polygon: it is context, and the
          red line is the reading. Drawn at ANY coverage, including low, where the verdicts are
          withheld: a verdict judges this recipe and thin data cannot support one, but the band
          judges nothing — it is where the target sits, which is exactly what a reader needs to
          place an estimate. The meters keep shading theirs at low coverage for the same reason. */}
      {targetRibbonPaths(
        order,
        point,
        (key, value) => fitRadius(value, SOAP_PROPERTY_GUIDE[key].low, SOAP_PROPERTY_GUIDE[key].high) * R,
      ).map((d) => (
        <path
          key={d}
          data-testid="radar-target-band"
          d={d}
          fillRule="evenodd"
          style={{ fill: 'var(--accent-band)', stroke: 'none' }}
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
      {/* Stroke only: a filled polygon in the ring's own tint blended into it where the two
          overlapped, and this chart's question — is the red line on the ring? — is answered
          by the line. */}
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
        // the same thing the panel already prints beside iodine and INS. "Low data" stands in
        // for a withheld verdict, so it never replaces that range.
        const status = !judged
          ? `Typical ${guide.low}–${guide.high}`
          : lowCoverage
            ? 'Low data'
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
                // Amber, like the Meters row's verdict word (.property-meters__status): the
                // figure above is the reading and goes accent with its dot; the word is the
                // caution.
                fill: out ? 'var(--warn)' : 'var(--label)',
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
