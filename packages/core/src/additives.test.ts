import { describe, expect, it } from 'vitest';
import {
  ADDITIVE_CATALOG,
  ADDITIVE_STAGE_LABELS,
  gramsFromDose,
  gramsFromPercentOfOil,
  LATHER_SUPPORT_PACK,
  MAX_ADDITIVE_NAME_LENGTH,
  MAX_RECIPE_ADDITIVES,
  parsePercentOfOil,
  parseDoseAmount,
  type AdditiveStage,
} from './additives.js';

describe('additives', () => {
  it('computes grams from percent of oil weight', () => {
    expect(gramsFromPercentOfOil(1000, 1)).toBe(10);
    expect(gramsFromPercentOfOil(500, 2.5)).toBe(12.5);
  });

  it('rejects invalid percent input', () => {
    expect(parsePercentOfOil('')).toBeNull();
    expect(parsePercentOfOil('abc')).toBeNull();
    expect(parsePercentOfOil('101')).toBeNull();
    expect(parsePercentOfOil('1.5')).toBe(1.5);
  });

  it('ships lather support pack at 1% each', () => {
    expect(LATHER_SUPPORT_PACK).toHaveLength(3);
    expect(LATHER_SUPPORT_PACK.every((item) => item.percentOfOil === 1)).toBe(true);
    expect(ADDITIVE_CATALOG.some((e) => e.id === 'chelator')).toBe(true);
  });

  it('exports import limits', () => {
    expect(MAX_RECIPE_ADDITIVES).toBeGreaterThan(0);
    expect(MAX_ADDITIVE_NAME_LENGTH).toBeGreaterThan(0);
  });

  it('includes an after_cook stage labeled "After cook"', () => {
    const stage: AdditiveStage = 'after_cook';
    expect(ADDITIVE_STAGE_LABELS[stage]).toBe('After cook');
  });
});

describe('parseDoseAmount', () => {
  it('accepts percent up to 100 and rejects above', () => {
    expect(parseDoseAmount('5', 'percent')).toBe(5);
    expect(parseDoseAmount('100', 'percent')).toBe(100);
    expect(parseDoseAmount('100.1', 'percent')).toBeNull();
  });
  it('accepts ppt up to 1000 and rejects above', () => {
    expect(parseDoseAmount('3', 'ppt')).toBe(3);
    expect(parseDoseAmount('1000', 'ppt')).toBe(1000);
    expect(parseDoseAmount('1001', 'ppt')).toBeNull();
  });
  it('rejects empty, negative, and non-numeric', () => {
    expect(parseDoseAmount('', 'percent')).toBeNull();
    expect(parseDoseAmount('-1', 'ppt')).toBeNull();
    expect(parseDoseAmount('abc', 'percent')).toBeNull();
  });
});

describe('gramsFromDose', () => {
  it('percent divides by 100, ppt divides by 1000', () => {
    expect(gramsFromDose(1000, 5, 'percent')).toBe(50);
    expect(gramsFromDose(1000, 3, 'ppt')).toBe(3);
  });
  it('returns null for negative basis or amount', () => {
    expect(gramsFromDose(-1, 5, 'percent')).toBeNull();
    expect(gramsFromDose(1000, -5, 'ppt')).toBeNull();
  });
});
