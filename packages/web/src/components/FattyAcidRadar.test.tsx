// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { FattyAcidRadar, type FattyAcidRadarAxis } from './FattyAcidRadar';
import { RING_INNER, RING_OUTER } from '../lib/radarGeometry';

afterEach(cleanup);

const AXES: FattyAcidRadarAxis[] = [
  { key: 'lauricMyristic', label: 'Lauric', value: 25, low: 20, high: 30 }, // mid-band
  { key: 'palmiticStearic', label: 'Palmitic', value: 24, low: 20, high: 30 },
  { key: 'oleic', label: 'Oleic', value: 47.3, low: 32, high: 41 }, // above its band
  { key: 'linoleic', label: 'Linoleic', value: 20, low: 7, high: 14 }, // above its band
  { key: 'linolenic', label: 'Linolenic', value: 0.5, low: 0, high: 1 },
  { key: 'ricinoleic', label: 'Ricinoleic', value: 0, low: 4, high: 7 }, // below: no castor
];

const vertices = (container: HTMLElement) =>
  (container.querySelector('[data-testid="radar-recipe"]') as SVGPolygonElement)
    .getAttribute('points')!
    .split(' ')
    .map((p) => p.split(',').map(Number) as [number, number]);

test('renders an aria-hidden svg with one recipe vertex per axis and a shaded ring', () => {
  const { container } = render(<FattyAcidRadar axes={AXES} lowCoverage={false} />);
  expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  expect(vertices(container).length).toBe(6);
  expect(container.querySelector('[data-testid="radar-ring"]')).toBeTruthy();
});

test('fits every axis to the ring: in band lands on it, above pokes out, below sits inside', () => {
  const { container } = render(<FattyAcidRadar axes={AXES} lowCoverage={false} />);
  const svg = container.querySelector('svg')!;
  const cx = Number(svg.getAttribute('data-cx'));
  const cy = Number(svg.getAttribute('data-cy'));
  const R = Number(svg.getAttribute('data-r'));
  const radiusOf = ([x, y]: [number, number]) => Math.hypot(x - cx, y - cy) / R;
  const v = vertices(container);
  // Lauric 25 in 20–30: the middle of the ring.
  expect(radiusOf(v[0])).toBeCloseTo((RING_INNER + RING_OUTER) / 2, 5);
  // Oleic 47.3 over 32–41: outside the ring, short of the rim.
  expect(radiusOf(v[2])).toBeGreaterThan(RING_OUTER);
  expect(radiusOf(v[2])).toBeLessThan(1);
  // Ricinoleic 0 under 4–7: the hub.
  expect(radiusOf(v[5])).toBeCloseTo(0, 5);
  // Linolenic 0.5 in 0–1: on the ring even though the number is tiny.
  expect(radiusOf(v[4])).toBeGreaterThanOrEqual(RING_INNER);
  expect(radiusOf(v[4])).toBeLessThanOrEqual(RING_OUTER);
});

test('labels each axis with its true percentage and its typical range, never a verdict', () => {
  const { container } = render(<FattyAcidRadar axes={AXES} lowCoverage={false} />);
  const block = (label: string) => {
    const t = container.textContent ?? '';
    const i = t.indexOf(label);
    return t.slice(i, i + label.length + 22);
  };
  expect(block('Oleic')).toContain('47.3%'); // the number is never normalised, only the geometry
  // Above its band, below it, or on it: every axis states its typical range where a verdict
  // would go. Where a reading sits is shown by the geometry, and judged nowhere.
  expect(block('Oleic')).toMatch(/Typical 32–41%/);
  expect(block('Linoleic')).toMatch(/Typical 7–14%/);
  expect(block('Ricinoleic')).toMatch(/Typical 4–7%/);
  expect(container.textContent).not.toMatch(/Too low|Too high|In range/);
});

test('draws no axis in accent, however far past its band', () => {
  const { container } = render(<FattyAcidRadar axes={AXES} lowCoverage={false} />);
  const texts = Array.from(container.querySelectorAll('text')) as SVGTextElement[];
  expect(texts.filter((t) => t.style.fill === 'var(--accent)')).toEqual([]);
  // Every vertex dot is the same size: none is enlarged to single out a reading.
  const dots = Array.from(container.querySelectorAll('circle')).filter(
    (c) => (c as SVGCircleElement).style.fill === 'var(--accent)',
  );
  expect(new Set(dots.map((c) => c.getAttribute('r')))).toEqual(new Set(['2.5']));
});

// "Low data" used to fill the slot under each value at low coverage. On this chart that slot
// only ever holds the typical range, since nothing is judged, so replacing it hid the range
// while the Meters view kept printing it. The "~" values and the dashed polygon mark the
// estimate.
test('marks low coverage with tilde values and a dashed polygon, and keeps every typical range', () => {
  const { container } = render(<FattyAcidRadar axes={AXES} lowCoverage />);
  const text = container.textContent ?? '';
  expect(text).toContain('~47.3%');
  expect(text).not.toMatch(/Low data|Too low|Too high|In range/);
  expect(text.match(/Typical/g)?.length).toBe(6);
  expect(text).toContain('Typical 32–41%');
  const recipe = container.querySelector('[data-testid="radar-recipe"]') as SVGPolygonElement;
  expect(recipe.style.strokeDasharray).toBe('4 3');
});
