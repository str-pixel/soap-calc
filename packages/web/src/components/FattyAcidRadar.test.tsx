// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { FattyAcidRadar, type FattyAcidRadarAxis } from './FattyAcidRadar';
import { RING_INNER, RING_OUTER } from '../lib/radarGeometry';

afterEach(cleanup);

// `tooHigh` is decided upstream by core's fattyAcidIsTooHigh; the radar only draws it.
const AXES: FattyAcidRadarAxis[] = [
  { key: 'lauricMyristic', label: 'Lauric', value: 25, low: 20, high: 30, tooHigh: false }, // mid-band
  { key: 'palmiticStearic', label: 'Palmitic', value: 24, low: 20, high: 30, tooHigh: false },
  { key: 'oleic', label: 'Oleic', value: 47.3, low: 32, high: 41, tooHigh: false }, // above, not a fault
  { key: 'linoleic', label: 'Linoleic', value: 20, low: 7, high: 14, tooHigh: true }, // synthetic: exercises the renderer; no drawn axis is warned in the app
  { key: 'linolenic', label: 'Linolenic', value: 0.5, low: 0, high: 1, tooHigh: false },
  { key: 'ricinoleic', label: 'Ricinoleic', value: 0, low: 4, high: 7, tooHigh: false }, // below: no castor
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

test('labels each axis with its true percentage, and speaks up only for a flagged high', () => {
  const { container } = render(<FattyAcidRadar axes={AXES} lowCoverage={false} />);
  const block = (label: string) => {
    const t = container.textContent ?? '';
    const i = t.indexOf(label);
    return t.slice(i, i + label.length + 22);
  };
  expect(block('Oleic')).toContain('47.3%'); // the number is never normalised, only the geometry
  // Linoleic over its band is the one warning here.
  expect(block('Linoleic')).toContain('Too high');
  // Oleic above and ricinoleic below are recipe style, not faults: they state their typical
  // range where a verdict would go, and never say "Too low" or "In range".
  expect(block('Oleic')).toMatch(/Typical 32–41%/);
  expect(block('Ricinoleic')).toMatch(/Typical 4–7%/);
  const text = container.textContent ?? '';
  expect(text).not.toMatch(/Too low|In range/);
  expect(text.match(/Too high/g)?.length).toBe(1);
});

test('draws only a flagged axis in accent', () => {
  const { container } = render(<FattyAcidRadar axes={AXES} lowCoverage={false} />);
  const values = Array.from(container.querySelectorAll('text')).filter((t) =>
    /%$/.test(t.textContent ?? ''),
  );
  const accented = values.filter((t) => (t as SVGTextElement).style.fill === 'var(--accent)');
  expect(accented.map((t) => t.textContent)).toEqual(['20%']);
});

test('flags low coverage with tilde values, Low data verdicts, and a dashed polygon', () => {
  const { container } = render(<FattyAcidRadar axes={AXES} lowCoverage />);
  const text = container.textContent ?? '';
  expect(text).toContain('~47.3%');
  expect(text).toContain('Low data');
  expect(text).not.toMatch(/Too low|Too high|In range|Typical/);
  const recipe = container.querySelector('[data-testid="radar-recipe"]') as SVGPolygonElement;
  expect(recipe.style.strokeDasharray).toBe('4 3');
});
