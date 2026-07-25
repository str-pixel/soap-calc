import { describe, expect, it } from 'vitest';
import { WORKABILITY_TUNING } from '@soap-calc/core';
import { formatWorkabilityRange } from './workabilityFormat';

describe('formatWorkabilityRange', () => {
  it('renders hours when both endpoints are under 48 h', () => {
    expect(formatWorkabilityRange({ minHours: 12, maxHours: 36 })).toBe('≈ 12–36 h');
  });
  it('mixes units when the range straddles the 48 h seam (hours till 48 h, days after)', () => {
    // 40h stays in hours; 56h/24 = 2.33 → 2.5 days
    expect(formatWorkabilityRange({ minHours: 40, maxHours: 56 })).toBe('≈ 40 h – 2.5 days');
  });
  it('renders days (rounded to 0.5) when both endpoints are past 48 h', () => {
    expect(formatWorkabilityRange({ minHours: 50, maxHours: 66 })).toBe('≈ 2–3 days');
  });
  it('renders weeks between 10 and 14 days', () => {
    // 240h/168 = 1.43 → 1.5; 300h/168 = 1.79 → 2.0
    expect(formatWorkabilityRange({ minHours: 240, maxHours: 300 })).toBe('≈ 1.5–2 weeks');
  });
  it('mixes days and weeks across the 240 h seam', () => {
    // 120h = 5 days; 300h/168 = 1.79 → 2 weeks
    expect(formatWorkabilityRange({ minHours: 120, maxHours: 300 })).toBe('≈ 5 days – 2 weeks');
  });
  it('collapses a range whose endpoints round to the same figure', () => {
    expect(formatWorkabilityRange({ minHours: 48, maxHours: 50 })).toBe('≈ 2 days');
  });
  it('chooses the endpoint unit from the rounded value (47.6 h is 2 days, not "48 h")', () => {
    expect(formatWorkabilityRange({ minHours: 47.6, maxHours: 60 })).toBe('≈ 2–2.5 days');
  });
  it('renders the open-ended ceiling at/over 14 days', () => {
    expect(formatWorkabilityRange({ minHours: 332, maxHours: 581 })).toBe('≈ 2+ weeks');
    expect(formatWorkabilityRange({ minHours: 300, maxHours: 336 })).toBe('≈ 2+ weeks');
  });

  it('derives the ceiling label from tuning (no baked-in "2")', () => {
    const expected = `≈ ${WORKABILITY_TUNING.ceilingHours / 168}+ weeks`;
    expect(formatWorkabilityRange({ minHours: 400, maxHours: 400 })).toBe(expected);
  });

  it('formats per endpoint — time till 48h in hours, past it in days', () => {
    // unmold sits fully under the seam and stays in hours; cut straddles it and mixes;
    // stamp sits fully past it and reads in days.
    expect(formatWorkabilityRange({ minHours: 15.6, maxHours: 46.8 })).toBe('≈ 16–47 h');
    expect(formatWorkabilityRange({ minHours: 19.6, maxHours: 50.8 })).toBe('≈ 20 h – 2 days');
    expect(formatWorkabilityRange({ minHours: 50.8, maxHours: 66.2 })).toBe('≈ 2–3 days');
  });
});
