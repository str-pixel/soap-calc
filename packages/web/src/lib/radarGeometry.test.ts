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

  it('proceeds clockwise: index 1 of 4 lands at 3 o\'clock', () => {
    const p = radarPoint(1, 4, 100, 50, 60);
    expect(p.x).toBeCloseTo(110, 5); // center(60) + radius(50)
    expect(p.y).toBeCloseTo(60, 5); // centered vertically
  });

  it('scales a mid-range value to half the radius', () => {
    const p = radarPoint(0, 6, 50, 50, 60);
    expect(p.x).toBeCloseTo(60, 5); // centered horizontally
    expect(p.y).toBeCloseTo(35, 5); // center(60) - radius(50)*0.5
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

  it('aligns each low value with its own axis, not a reversed order', () => {
    // Non-uniform lows: each property has its own suggested-low bound.
    const d = ringPath([5, 20, 80, 5, 20, 80], [90, 90, 90, 90, 90, 90], 50, 60);
    // Inner subpath starts after the second 'M'.
    // Axis 0 low = 5 -> radarPoint(0, 6, 5, 50, 60) = { x: 60, y: 60 - 2.5 } = (60, 57.5).
    const inner = d.split('M')[2];
    expect(inner.trim().startsWith('60.00 57.50')).toBe(true);
  });
});
