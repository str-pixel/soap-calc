import { describe, expect, it } from 'vitest';
import { GRAMS_PER_TSP, ppoOzToPercentOfOil, tspToPercentOfOil } from './doseConverters';

describe('doseConverters', () => {
  it('tsp→% of oil uses 4.1 g/tsp', () => {
    expect(GRAMS_PER_TSP).toBe(4.1);
    expect(tspToPercentOfOil(1, 100)).toBeCloseTo(4.1); // 4.1 g / 100 g oil
    expect(tspToPercentOfOil(1, 0)).toBeNull();
  });

  it('is null on non-finite inputs', () => {
    expect(tspToPercentOfOil(NaN, 100)).toBeNull();
    expect(tspToPercentOfOil(1, -50)).toBeNull();
    expect(tspToPercentOfOil(1, Infinity)).toBeNull();
  });

  it('ppo (oz per lb of oil) → % of oil', () => {
    expect(ppoOzToPercentOfOil(1)).toBeCloseTo((28.349523125 / 453.59237) * 100, 3); // ~6.25%
    expect(ppoOzToPercentOfOil(NaN)).toBeNull();
  });
});
