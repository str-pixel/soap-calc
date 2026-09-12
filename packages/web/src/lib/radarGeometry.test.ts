import { expect, test } from 'vitest';
import { fitRadius, RING_INNER, RING_OUTER, radarAngle, radarPoint } from './radarGeometry';

test('the ring is a proper annulus inside the rim', () => {
  expect(RING_INNER).toBeGreaterThan(0);
  expect(RING_OUTER).toBeGreaterThan(RING_INNER);
  expect(RING_OUTER).toBeLessThan(1);
});

test('a value inside its band sits on the ring, from inner edge to outer edge', () => {
  expect(fitRadius(20, 20, 30)).toBeCloseTo(RING_INNER);
  expect(fitRadius(30, 20, 30)).toBeCloseTo(RING_OUTER);
  expect(fitRadius(25, 20, 30)).toBeCloseTo((RING_INNER + RING_OUTER) / 2);
});

test('a value below its band sits inside the ring, reaching the hub at zero', () => {
  expect(fitRadius(10, 20, 30)).toBeCloseTo(RING_INNER / 2);
  // No castor at all: 0 against a 4–7 band is the hub, not a phantom vertex.
  expect(fitRadius(0, 4, 7)).toBe(0);
});

test('a band that starts at zero has no "below": zero is on the inner edge, in range', () => {
  expect(fitRadius(0, 0, 2)).toBeCloseTo(RING_INNER);
  expect(fitRadius(2, 0, 2)).toBeCloseTo(RING_OUTER);
  expect(fitRadius(1, 0, 2)).toBeCloseTo((RING_INNER + RING_OUTER) / 2);
});

test('a value above its band pokes outside the ring and is clamped at the rim', () => {
  // Overshoot runs from the outer edge to the rim across max(band width, 5) points.
  expect(fitRadius(35, 20, 30)).toBeCloseTo(RING_OUTER + (1 - RING_OUTER) / 2);
  expect(fitRadius(40, 20, 30)).toBeCloseTo(1);
  expect(fitRadius(70, 20, 30)).toBe(1);
  // Never a hair over the rim: the sum of the two fractions is not exactly 1 in binary.
  for (const [low, high] of [[20, 30], [8, 20], [44, 69], [0, 1]] as const) {
    for (const v of [high + 5, high + 40, 100, 1000]) {
      expect(fitRadius(v, low, high), `${v} against ${low}-${high}`).toBeLessThanOrEqual(1);
    }
  }
  // A hairline band (0–1) gets the 5-point floor, so 6% linolenic reaches the rim, not 2%.
  expect(fitRadius(2, 0, 1)).toBeLessThan(1);
  expect(fitRadius(6, 0, 1)).toBeCloseTo(1);
});

test('more value never means less radius', () => {
  const bands: Array<[number, number]> = [[20, 30], [0, 2], [0, 1], [4, 7], [32, 41]];
  for (const [low, high] of bands) {
    let last = -1;
    for (let v = 0; v <= 100; v += 0.5) {
      const r = fitRadius(v, low, high);
      expect(r, `${v} against ${low}–${high}`).toBeGreaterThanOrEqual(last);
      expect(r).toBeLessThanOrEqual(1);
      last = r;
    }
  }
});

test('axes start at twelve o clock and run clockwise', () => {
  expect(radarPoint(100, 100, 0, 6, 50)).toEqual({ x: 100, y: 50 });
  const east = radarPoint(100, 100, 1, 4, 50);
  expect(east.x).toBeCloseTo(150);
  expect(east.y).toBeCloseTo(100);
  expect(radarAngle(0, 6)).toBeCloseTo(-Math.PI / 2);
});
