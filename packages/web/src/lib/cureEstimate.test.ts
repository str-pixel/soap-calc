import { describe, expect, it } from 'vitest';
import type { WorkabilityEstimate } from '@soap-calc/core';
import { estimateCure, labelWeightGrams, computeCureModel } from './cureEstimate';
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
  it('includes a passed workability estimate; usableAtUnmold unchanged', () => {
    const wk = { unmold: { minHours: 12, maxHours: 36 } } as unknown as WorkabilityEstimate;
    const cpProfile = processProfileById('cp');
    const e = estimateCure(cpProfile, wk);
    expect(e.workability).toBe(wk);
    expect(e.usableAtUnmold).toBe(false); // CP still not usable at unmold (D5)
  });
  it('defaults workability to null when omitted', () => {
    const cpProfile = processProfileById('cp');
    expect(estimateCure(cpProfile).workability ?? null).toBeNull();
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

describe('computeCureModel', () => {
  const OLIVE = { oleic: 69, stearic: 3, linoleic: 12, palmitic: 14, linolenic: 1 };

  it('null FA profile -> null (fallback to the fixed window)', () => {
    expect(
      computeCureModel({ faProfile: null, coveragePercent: 100, lyeConcentrationPercent: 33, process: 'cp' }),
    ).toBeNull();
  });
  it('null lye concentration -> null (mid-edit recipes never show a bogus window)', () => {
    expect(
      computeCureModel({ faProfile: OLIVE, coveragePercent: 100, lyeConcentrationPercent: null, process: 'cp' }),
    ).toBeNull();
  });
  it('CP castile produces the two milestones', () => {
    const m = computeCureModel({ faProfile: OLIVE, coveragePercent: 100, lyeConcentrationPercent: 33, process: 'cp' });
    expect(m).not.toBeNull();
    expect(m!.usable.minWeeks).toBeGreaterThan(6);
    expect(m!.second.kind).toBe('best');
  });
  it('estimateCure threads the model through; fixed-window fields stay unchanged', () => {
    const cpProfile = processProfileById('cp');
    const model = computeCureModel({
      faProfile: OLIVE, coveragePercent: 100, lyeConcentrationPercent: 33, process: 'cp',
    });
    const e = estimateCure(cpProfile, null, model);
    expect(e.model).toBe(model);
    expect(e.minWeeks).toBe(cpProfile.finish.minWeeks); // fallback data still present
  });
  it('estimateCure defaults model to null when omitted (existing callers unaffected)', () => {
    expect(estimateCure(processProfileById('cp')).model ?? null).toBeNull();
  });
});
