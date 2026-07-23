import { describe, expect, it } from 'vitest';
import type { ComputedAdditive } from './calculateAdditives';
import { additivesToDoses, computeWorkability } from './workabilityInput';

const additive = (over: Partial<ComputedAdditive>): ComputedAdditive => ({
  key: 'k', catalogId: 'sodium-lactate', name: 'Sodium lactate', amount: 3,
  basis: 'oil', unit: 'percent', grams: 15, addAt: 'lye', ...over,
});

describe('additivesToDoses', () => {
  it('converts grams to percent-of-oil regardless of the stored basis/unit', () => {
    // 15g against 500g oils = 3%
    expect(additivesToDoses([additive({ grams: 15 })], 500)).toEqual([{ id: 'sodium-lactate', dosePercent: 3 }]);
  });
  it('returns [] when there is no oil weight', () => {
    expect(additivesToDoses([additive({})], 0)).toEqual([]);
  });
});

describe('computeWorkability', () => {
  it('assembles inputs and returns a CP estimate', () => {
    const e = computeWorkability({
      hardness: 47, coveragePercent: 100, lyeConcentrationPercent: 33,
      superfatPercent: '5', process: 'cp', gelMode: 'natural', additives: [], totalOilGrams: 500,
    });
    expect(e).not.toBeNull();
    expect(e!.stamp).not.toBeNull();
  });
  it('returns null when the lye result is missing (non-finite)', () => {
    const e = computeWorkability({
      hardness: 47, coveragePercent: 100, lyeConcentrationPercent: null,
      superfatPercent: '5', process: 'cp', gelMode: 'natural', additives: [], totalOilGrams: 500,
    });
    expect(e).toBeNull();
  });
  it('treats an empty superfat field as 0% (still returns an estimate, not null)', () => {
    const e = computeWorkability({
      hardness: 47, coveragePercent: 100, lyeConcentrationPercent: 33,
      superfatPercent: '', process: 'cp', gelMode: 'natural', additives: [], totalOilGrams: 500,
    });
    expect(e).not.toBeNull();
  });
});
