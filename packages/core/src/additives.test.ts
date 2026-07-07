import { describe, expect, it } from 'vitest';
import {
  ADDITIVE_CATALOG,
  gramsFromPercentOfOil,
  LATHER_SUPPORT_PACK,
  MAX_ADDITIVE_NAME_LENGTH,
  MAX_RECIPE_ADDITIVES,
  parsePercentOfOil,
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
});
