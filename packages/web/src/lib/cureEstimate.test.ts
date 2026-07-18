import { describe, expect, it } from 'vitest';
import { estimateCure, labelWeightGrams } from './cureEstimate';
import { processProfileById } from './processProfile';

describe('estimateCure', () => {
  it('CP cures at least 4 weeks and is not usable at unmold, labeled "Cure"', () => {
    const e = estimateCure(processProfileById('cp'));
    expect(e.minWeeks).toBe(4);
    expect(e.usableAtUnmold).toBe(false);
    expect(e.finishingLabel).toBe('Cure');
  });
  it('HTHP is usable at unmold with a 3–4 week cure, labeled "Cure"', () => {
    const e = estimateCure(processProfileById('hp-hthp'));
    expect(e).toMatchObject({ minWeeks: 3, maxWeeks: 4, usableAtUnmold: true, finishingLabel: 'Cure' });
  });
  it('an LS variant is labeled "Sequester"', () => {
    const e = estimateCure(processProfileById('ls-cpls'));
    expect(e.finishingLabel).toBe('Sequester');
  });
});

describe('labelWeightGrams', () => {
  it('applies the process water-loss fraction to only the evaporating base', () => {
    expect(labelWeightGrams(1000, 1000, 0.15)).toBeCloseTo(850);
  });
  it('loss of 0 leaves the batch weight unchanged', () => {
    expect(labelWeightGrams(1000, 1000, 0)).toBe(1000);
  });
  it('non-evaporating extras beyond the base do not lose water', () => {
    // 1000 g total batch = 800 g water-bearing base + 200 g after-cook extras (e.g.
    // fragrance). Only the 800 g base loses water; the 200 g extras pass through untouched.
    expect(labelWeightGrams(1000, 800, 0.15)).toBeCloseTo(1000 - 800 * 0.15);
  });
});
