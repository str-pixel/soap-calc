import { describe, expect, it } from 'vitest';
import { formatMoney, pricePerGram } from './money';

describe('formatMoney', () => {
  it('formats with symbol prefix and 2 decimals', () => {
    expect(formatMoney(12, '$')).toBe('$12.00');
    expect(formatMoney(1234.5, '$')).toBe('$1,234.50');
    expect(formatMoney(-5, '$')).toBe('-$5.00');
    expect(formatMoney(-0, '$')).toBe('$0.00');
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
