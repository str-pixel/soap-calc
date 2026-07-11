import { describe, expect, it } from 'vitest';
import { radarPoint, polygonPoints, ringPath } from './radarGeometry';

describe('radarPoint', () => {
  it('places the first axis at 12 o\'clock (straight up)', () => {
    const p = radarPoint(0, 6, 100, 50, 60);
    expect(p.x).toBeCloseTo(60, 5); // centered horizontally
    expect(p.y).toBeCloseTo(10, 5); // center(60) - radius(50)
  });

  it('scales value 0..100 to 0..radius', () => {
    const zero = radarPoint(0, 6, 0, 50, 60);
    expect(zero.x).toBeCloseTo(60, 5);
    expect(zero.y).toBeCloseTo(60, 5); // at center
  });

  it('clamps out-of-range values', () => {
    const over = radarPoint(0, 6, 250, 50, 60);
    const at100 = radarPoint(0, 6, 100, 50, 60);
    expect(over).toEqual(at100);
    const under = radarPoint(0, 6, -50, 50, 60);
    const at0 = radarPoint(0, 6, 0, 50, 60);
    expect(under).toEqual(at0);
  });
});

describe('polygonPoints', () => {
  it('emits one "x,y" pair per value', () => {
    const pts = polygonPoints([100, 100, 100, 100, 100, 100], 50, 60);
    expect(pts.split(' ')).toHaveLength(6);
  });
});

describe('ringPath', () => {
  it('produces a two-subpath (M…Z M…Z) path for evenodd fill', () => {
    const d = ringPath([10, 10, 10, 10, 10, 10], [90, 90, 90, 90, 90, 90], 50, 60);
    expect((d.match(/M/g) ?? []).length).toBe(2);
    expect((d.match(/Z/g) ?? []).length).toBe(2);
  });
});
