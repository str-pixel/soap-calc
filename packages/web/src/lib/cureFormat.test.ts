import { expect, test } from 'vitest';
import { formatCureRange } from './cureFormat';

test('weeks-scale range renders in half-week precision', () => {
  expect(formatCureRange({ minWeeks: 4.21, maxWeeks: 6.32 })).toBe('≈ 4–6.5 weeks');
});

test('coconut floor window renders in whole weeks', () => {
  expect(formatCureRange({ minWeeks: 2, maxWeeks: 3 })).toBe('≈ 2–3 weeks');
});

test('months threshold: maxWeeks >= 13 switches the whole range to months', () => {
  // castile best: 24.8–39.7 wk ≈ 6–9 months (spec anchor)
  expect(formatCureRange({ minWeeks: 24.8, maxWeeks: 39.68 })).toBe('≈ 6–9 months');
});

test('a point window collapses to a single value', () => {
  expect(formatCureRange({ minWeeks: 13, maxWeeks: 13 })).toBe('≈ 3 months');
  expect(formatCureRange({ minWeeks: 4, maxWeeks: 4 })).toBe('≈ 4 weeks');
});

test('boundary: a range just crossing 13 weeks renders in months', () => {
  expect(formatCureRange({ minWeeks: 10, maxWeeks: 13 })).toBe('≈ 2–3 months');
});
