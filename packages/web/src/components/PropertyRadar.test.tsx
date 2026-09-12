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

test('labels each axis with its rounded value and a range verdict', () => {
  const { container } = render(
    <PropertyRadar properties={PROPS} order={ORDER} lowCoverage={false} />,
  );
  const text = container.textContent ?? '';
  expect(text).toContain('Hardness');
  expect(text).toContain('41'); // hardness value
  expect(text).toMatch(/In range|Too low|Too high/);
});

test('flags low coverage with tilde values and Low data verdicts, not range verdicts', () => {
  const { container } = render(
    <PropertyRadar properties={PROPS} order={ORDER} lowCoverage />,
  );
  const text = container.textContent ?? '';
  expect(text).toContain('~41');
  expect(text).toContain('Low data');
  expect(text).not.toMatch(/Too low|Too high|In range/);
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
