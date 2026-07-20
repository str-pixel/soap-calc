import { describe, expect, it } from 'vitest';
import { formatCostBreakdown, formatMoney, pricePerGram } from './money';

describe('formatMoney', () => {
  it('formats with symbol prefix and 2 decimals', () => {
    expect(formatMoney(12, '$')).toBe('$12.00');
    expect(formatMoney(1234.5, '$')).toBe('$1,234.50');
    expect(formatMoney(-5, '$')).toBe('-$5.00');
    expect(formatMoney(-0, '$')).toBe('$0.00');
  });
});

describe('formatCostBreakdown', () => {
  it('joins non-zero components with middle dots', () => {
    expect(
      formatCostBreakdown({ materials: 11.4, labour: 0.6, overhead: 2.28, packaging: 1.47 }, '$'),
    ).toBe('materials $11.40 · labour $0.60 · overhead $2.28 · packaging $1.47');
  });

  it('skips zero components', () => {
    expect(formatCostBreakdown({ materials: 4.5, labour: 0, overhead: 0.9, packaging: 0 }, '$')).toBe(
      'materials $4.50 · overhead $0.90',
    );
  });

  it('returns null when every component is zero', () => {
    expect(formatCostBreakdown({ materials: 0, labour: 0, overhead: 0, packaging: 0 }, '$')).toBeNull();
  });

  it('treats negative or non-finite components as absent', () => {
    expect(formatCostBreakdown({ materials: 2, labour: -1, overhead: NaN, packaging: 0 }, '$')).toBe(
      'materials $2.00',
    );
  });
});

describe('pricePerGram', () => {
  it('converts per-kg and per-lb prices to per-gram', () => {
    expect(pricePerGram('4.50', 'kg')).toBeCloseTo(0.0045, 8);
    expect(pricePerGram('4.50', 'lb')).toBeCloseTo(4.5 / 453.59237, 8);
  });
  it('returns null for blank or invalid input', () => {
    expect(pricePerGram('', 'kg')).toBeNull();
    expect(pricePerGram('abc', 'kg')).toBeNull();
    expect(pricePerGram('-2', 'kg')).toBeNull();
  });
});
