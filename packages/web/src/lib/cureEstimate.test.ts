import { describe, expect, it } from 'vitest';
import { estimateCure, labelWeightGrams } from './cureEstimate';
import { processProfileById } from './processProfile';

describe('estimateCure', () => {
  it('CP cures at least 4 weeks and is not usable at unmold', () => {
    const e = estimateCure(processProfileById('cp'));
    expect(e.minWeeks).toBe(4);
    expect(e.usableAtUnmold).toBe(false);
  });
  it('HTHP is usable at unmold with a 3–4 week cure', () => {
    const e = estimateCure(processProfileById('hp-hthp'));
    expect(e).toMatchObject({ minWeeks: 3, maxWeeks: 4, usableAtUnmold: true });
  });
});

describe('labelWeightGrams', () => {
  it('applies the process water-loss fraction', () => {
    expect(labelWeightGrams(1000, 0.15)).toBeCloseTo(850);
    expect(labelWeightGrams(1000, 0)).toBe(1000);
  });
});
