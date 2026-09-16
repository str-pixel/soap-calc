// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { PropertyRadar } from './PropertyRadar';
import { SOAP_PROPERTY_GUIDE, type SoapPropertyName } from '@soap-calc/core';
import { RING_INNER, RING_OUTER } from '../lib/radarGeometry';

/** Each recipe vertex's distance from the hub, as a fraction of the outer radius. */
const vertexRadii = (container: HTMLElement): number[] => {
  const svg = container.querySelector('svg')!;
  const cx = Number(svg.getAttribute('data-cx'));
  const cy = Number(svg.getAttribute('data-cy'));
  const R = Number(svg.getAttribute('data-r'));
  return (container.querySelector('[data-testid="radar-recipe"]') as SVGPolygonElement)
    .getAttribute('points')!
    .split(' ')
    .map((p) => {
      const [x, y] = p.split(',').map(Number);
      return Math.hypot(x - cx, y - cy) / R;
    });
};

/** Each axis's three lines, in axis order: name, printed value, and what sits under the value. */
const axisBlocks = (container: HTMLElement): Array<Array<string | null>> =>
  Array.from(container.querySelectorAll('svg g')).map((g) =>
    Array.from(g.querySelectorAll('text')).map((t) => t.textContent),
  );

afterEach(cleanup);

const ORDER: SoapPropertyName[] = [
  'hardness', 'cleansing', 'condition', 'creamy', 'bubbly', 'longevity',
];
const PROPS = {
  hardness: 41, cleansing: 17, condition: 56, creamy: 24, bubbly: 17, longevity: 24,
};

test('renders an aria-hidden svg with a recipe polygon', () => {
  const { container } = render(
    <PropertyRadar properties={PROPS} order={ORDER} lowCoverage={false} />,
  );
  const svg = container.querySelector('svg');
  expect(svg?.getAttribute('aria-hidden')).toBe('true');
  expect(container.querySelector('[data-testid="radar-recipe"]')).toBeTruthy();
});

test('dashes the recipe polygon under low coverage', () => {
  const { container } = render(
    <PropertyRadar properties={PROPS} order={ORDER} lowCoverage />,
  );
  const recipe = container.querySelector('[data-testid="radar-recipe"]') as SVGPolygonElement;
  expect(recipe.style.strokeDasharray).toBe('4 3');
});

test('draws a solid recipe polygon when coverage is not low', () => {
  const { container } = render(
    <PropertyRadar properties={PROPS} order={ORDER} lowCoverage={false} />,
  );
  const recipe = container.querySelector('[data-testid="radar-recipe"]') as SVGPolygonElement;
  expect(recipe.style.strokeDasharray === 'none' || recipe.style.strokeDasharray === '').toBe(true);
});

// Each axis is checked on its own lines. The check this replaced only asked that some verdict
// appear somewhere, and passed with every axis forced to "Too low". The radar also spells
// conditioning out, as the Meters rows and the batch sheet do: the full word fits the chart.
test('labels each axis with its full name, its rounded value and its own verdict', () => {
  const mixed = { hardness: 70.4, cleansing: 5, condition: 56, creamy: 24, bubbly: 50, longevity: 10 };
  const { container } = render(
    <PropertyRadar properties={mixed} order={ORDER} lowCoverage={false} />,
  );
  expect(axisBlocks(container)).toEqual([
    ['Hardness', '70', 'Too high'],
    ['Cleansing', '5', 'Too low'],
    ['Conditioning', '56', 'In range'],
    ['Creamy', '24', 'In range'],
    ['Bubbly', '50', 'Too high'],
    ['Longevity', '10', 'Typical 25–50'],
  ]);
});

// The Meters rows' rule, written at .property-meters__value--outside in index.css: an
// out-of-range figure is accent like its dot, and the "Too low" / "Too high" word is amber,
// the caution. The radar painted the word accent as well, so one verdict wore two colours.
test('colours an out-of-range axis the way the meters do: accent figure, amber verdict', () => {
  const mixed = { hardness: 70, cleansing: 17, condition: 56, creamy: 24, bubbly: 17, longevity: 10 };
  const { container } = render(
    <PropertyRadar properties={mixed} order={ORDER} lowCoverage={false} />,
  );
  const fills = Array.from(container.querySelectorAll('svg g')).map((g) =>
    Array.from(g.querySelectorAll('text'))
      .slice(1)
      .map((t) => (t as SVGTextElement).style.fill),
  );
  expect(fills[0]).toEqual(['var(--accent)', 'var(--warn)']); // hardness 70: too high
  expect(fills[1]).toEqual(['var(--text)', 'var(--label)']); // cleansing 17: in range
  expect(fills[5]).toEqual(['var(--text)', 'var(--label)']); // longevity: never judged
});

test('flags low coverage with tilde values and Low data verdicts, not range verdicts', () => {
  const { container } = render(
    <PropertyRadar properties={PROPS} order={ORDER} lowCoverage />,
  );
  const text = container.textContent ?? '';
  expect(text).toContain('~41');
  expect(text).not.toMatch(/Too low|Too high|In range/);
  // "Low data" stands in for a verdict, so only the five judged axes carry it. Longevity has
  // no verdict to withhold and keeps its typical range, as its Meters row and the
  // screen-reader list do.
  const blocks = axisBlocks(container);
  expect(blocks.slice(0, 5).map((b) => b[2])).toEqual(Array(5).fill('Low data'));
  expect(blocks[5]).toEqual(['Longevity', '~24', 'Typical 25–50']);
});

// THE SHAPE MUST MEAN SOMETHING. With radius = raw score, a recipe sitting exactly mid-band
// on all six axes drew radii from 0.14 to 0.56 — a fourfold spread that looks badly
// unbalanced — while a recipe scoring 30 everywhere drew a perfect hexagon despite being
// too high on cleansing and too low on conditioning. Regularity did not mean balance and
// balance did not look regular. Each axis is fitted to its own band now, exactly as the
// fatty-acid radar does, so the ideal bar draws a circle ON the ring.
test('a recipe mid-band on every axis draws a circle, not a lopsided shape', () => {
  const mid = Object.fromEntries(
    ORDER.map((k) => [k, (SOAP_PROPERTY_GUIDE[k].low + SOAP_PROPERTY_GUIDE[k].high) / 2]),
  ) as typeof PROPS;
  const { container } = render(<PropertyRadar properties={mid} order={ORDER} lowCoverage={false} />);
  const radii = vertexRadii(container);
  const want = (RING_INNER + RING_OUTER) / 2;
  // Not exactly the ring's centre line: the vertex rides the figure the axis PRINTS, and
  // conditioning's mid-band is 56.5, which prints as 57. Half a score point of slack.
  for (const r of radii) expect(r).toBeCloseTo(want, 1);
  const spread = Math.max(...radii) - Math.min(...radii);
  expect(spread).toBeLessThan(0.02);
  // For contrast, the same recipe under the old radius-is-the-score rule; this is the
  // lopsidedness that made the shape unreadable.
  const oldSpread =
    Math.max(...ORDER.map((k) => mid[k] / 100)) - Math.min(...ORDER.map((k) => mid[k] / 100));
  expect(oldSpread).toBeGreaterThan(0.4);
});

test('band low lands on the ring inner edge and band high on the outer, every axis', () => {
  for (const [edge, want] of [['low', RING_INNER], ['high', RING_OUTER]] as const) {
    cleanup();
    const at = Object.fromEntries(
      ORDER.map((k) => [k, SOAP_PROPERTY_GUIDE[k][edge]]),
    ) as typeof PROPS;
    const { container } = render(<PropertyRadar properties={at} order={ORDER} lowCoverage={false} />);
    for (const r of vertexRadii(container)) expect(r).toBeCloseTo(want, 5);
  }
});

test('below the band falls inside the ring and above it pokes outside', () => {
  const below = Object.fromEntries(
    ORDER.map((k) => [k, SOAP_PROPERTY_GUIDE[k].low / 2]),
  ) as typeof PROPS;
  const { container } = render(<PropertyRadar properties={below} order={ORDER} lowCoverage={false} />);
  for (const r of vertexRadii(container)) expect(r).toBeLessThan(RING_INNER);
  cleanup();
  const above = Object.fromEntries(
    ORDER.map((k) => [k, SOAP_PROPERTY_GUIDE[k].high + 20]),
  ) as typeof PROPS;
  const c2 = render(<PropertyRadar properties={above} order={ORDER} lowCoverage={false} />).container;
  for (const r of vertexRadii(c2)) {
    expect(r).toBeGreaterThan(RING_OUTER);
    // Epsilon because this reads the radius back out of the plotted x/y through hypot and
    // cos/sin, not because the geometry overshoots — radarGeometry pins that exactly.
    expect(r).toBeLessThanOrEqual(1 + 1e-9);
  }
});

test('shades the suggested range as one ring, the same device the fatty-acid radar uses', () => {
  const { container } = render(
    <PropertyRadar properties={PROPS} order={ORDER} lowCoverage={false} />,
  );
  const ring = container.querySelector('[data-testid="radar-ring"]') as SVGCircleElement;
  expect(ring).toBeTruthy();
  const R = Number(container.querySelector('svg')!.getAttribute('data-r'));
  // One stroked circle whose width IS the band: centred between the two edges.
  expect(Number(ring.getAttribute('r'))).toBeCloseTo(((RING_INNER + RING_OUTER) / 2) * R, 5);
  expect(parseFloat(ring.style.strokeWidth)).toBeCloseTo((RING_OUTER - RING_INNER) * R, 5);
});

/** Every point of the drawn target band, as a fraction of the outer radius, in path order. */
const targetBandRadii = (container: HTMLElement): number[] => {
  const svg = container.querySelector('svg')!;
  const cx = Number(svg.getAttribute('data-cx'));
  const cy = Number(svg.getAttribute('data-cy'));
  const R = Number(svg.getAttribute('data-r'));
  const d = container.querySelector('[data-testid="radar-target-band"]')!.getAttribute('d')!;
  return [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) =>
    Math.hypot(Number(m[1]) - cx, Number(m[2]) - cy) / R,
  );
};

const BAND_SCORES: Record<SoapPropertyName, number> = {
  hardness: 42, cleansing: 14, condition: 55, creamy: 30, bubbly: 25, longevity: 35,
};

// The target band cannot be a ring: fitted to each axis's own suggested range it lands somewhere
// different on every one. These are the two facts that make that true, pinned so a future
// "tidy it into a circle" cannot pass.
test('the target band sits at a different radius on each axis, and creamy overflows the ring', () => {
  const { container } = render(
    <PropertyRadar properties={BAND_SCORES} order={ORDER} lowCoverage={false} />,
  );
  const radii = targetBandRadii(container);
  // Ten points: five axes, each visited on the way out and on the way back.
  expect(radii.length).toBe(10);
  // No two axes share an outer radius — that is exactly why a ring will not do.
  const outward = radii.slice(0, 5).map((r) => r.toFixed(3));
  expect(new Set(outward).size).toBe(5);
  // Creamy is the fourth axis out. Its target high (50) exceeds its own suggested high (48), so
  // its band genuinely pokes past the ring; clamping it would hide the source's own anomaly.
  expect(radii[3]).toBeGreaterThan(RING_OUTER);
  // Every other outward point stays within the ring.
  for (const i of [0, 1, 2, 4]) expect(radii[i]).toBeLessThanOrEqual(RING_OUTER + 1e-9);
  // and the whole band sits outside the hub.
  for (const r of radii) expect(r).toBeGreaterThan(RING_INNER * 0.9);
});
