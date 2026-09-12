import { describe, expect, it } from 'vitest';
import { ppoOzToPercentOfOil } from './doseConverters';

describe('doseConverters', () => {
  it('ppo (oz per lb of oil) → % of oil', () => {
    expect(ppoOzToPercentOfOil(1)).toBeCloseTo((28.349523125 / 453.59237) * 100, 3); // ~6.25%
    expect(ppoOzToPercentOfOil(NaN)).toBeNull();
  });

  it('is null on negative ppo', () => {
    expect(ppoOzToPercentOfOil(-1)).toBeNull();
  });
});
