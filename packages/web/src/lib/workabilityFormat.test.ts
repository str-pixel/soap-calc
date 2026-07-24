import { describe, expect, it } from 'vitest';
import { WORKABILITY_TUNING } from '@soap-calc/core';
import { formatWorkabilityRange } from './workabilityFormat';

describe('formatWorkabilityRange', () => {
  it('renders hours when maxHours < 48', () => {
    expect(formatWorkabilityRange({ minHours: 12, maxHours: 36 })).toBe('≈ 12–36 h');
  });
  it('renders days (rounded to 0.5) for the mid range, chosen from maxHours', () => {
    expect(formatWorkabilityRange({ minHours: 40, maxHours: 56 })).toBe('≈ 1.5–2.5 days');
  });
  it('renders weeks between 10 and 14 days', () => {
    // 240h/168 = 1.43 → 1.5; 300h/168 = 1.79 → 2.0
    expect(formatWorkabilityRange({ minHours: 240, maxHours: 300 })).toBe('≈ 1.5–2 weeks');
  });
  it('renders the open-ended ceiling at/over 14 days', () => {
    expect(formatWorkabilityRange({ minHours: 332, maxHours: 581 })).toBe('≈ 2+ weeks');
    expect(formatWorkabilityRange({ minHours: 300, maxHours: 336 })).toBe('≈ 2+ weeks');
  });

  it('derives the ceiling label from tuning (no baked-in "2")', () => {
    const expected = `≈ ${WORKABILITY_TUNING.ceilingHours / 168}+ weeks`;
    expect(formatWorkabilityRange({ minHours: 400, maxHours: 400 })).toBe(expected);
  });

  it('a shared unit basis keeps adjacent rows in one unit (fixes the mixed-unit seam)', () => {
    // unmold {15.6, 46.8} + cut {19.6, 50.8}: independently these mix hours+days and
    // overstate the cut min (19.6h → "1 day"). With the block basis = unmold.max they agree.
    const basis = 46.8;
    expect(formatWorkabilityRange({ minHours: 15.6, maxHours: 46.8 }, basis)).toBe('≈ 16–47 h');
    expect(formatWorkabilityRange({ minHours: 19.6, maxHours: 50.8 }, basis)).toBe('≈ 20–51 h');
    // (independent formatting is what produced the mixed units)
    expect(formatWorkabilityRange({ minHours: 19.6, maxHours: 50.8 })).toBe('≈ 1–2 days');
  });
});
