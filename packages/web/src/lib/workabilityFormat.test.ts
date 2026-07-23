import { describe, expect, it } from 'vitest';
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
});
