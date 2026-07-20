import { describe, expect, it } from 'vitest';
import { batchWeightBreakdown } from './batch-weight.js';

describe('batchWeightBreakdown', () => {
  it('sums the four components and totals them', () => {
    expect(batchWeightBreakdown({ oilGrams: 1000, lyeGrams: 138, waterGrams: 330, extrasGrams: 144 }))
      .toEqual({ oils: 1000, lye: 138, water: 330, extras: 144, total: 1612 });
  });

  it('clamps negative and non-finite components to 0', () => {
    expect(batchWeightBreakdown({ oilGrams: -5, lyeGrams: NaN, waterGrams: 100, extrasGrams: Infinity }))
      .toEqual({ oils: 0, lye: 0, water: 100, extras: 0, total: 100 });
  });
});
