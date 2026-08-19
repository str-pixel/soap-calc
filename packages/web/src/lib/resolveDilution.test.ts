import { describe, expect, it } from 'vitest';
import { calculateDilution } from '@soap-calc/core';
import { resolveDilution } from './resolveDilution';

describe('resolveDilution', () => {
  const plan = calculateDilution({
    anhydrousGrams: 1200,
    cookWaterGrams: 1400,
    kohGrams: 240,
    naohGrams: 0,
    soapConcentrationPercent: 30,
    kohPurityPercent: 90,
    naohPurityPercent: 97,
    superfatPercent: 0,
  });
  const same = {
    dilution: plan,
    anhydrousGrams: 1200,
    wholeBatchPasteGrams: 2600,
    cookWaterGrams: 1400,
    measuredPasteGrams: '',
  };

  it('plan arm: governs plan with no record', () => {
    expect(resolveDilution({ ...same, gradualWaterGrams: '' }).governs).toBe('plan');
  });

  it('plan arm: identity with calculateDilution', () => {
    expect(resolveDilution({ ...same, gradualWaterGrams: '' }).plan).toBe(plan);
  });

  it('zero is a record (spec §1)', () => {
    const r0 = resolveDilution({ ...same, gradualWaterGrams: '0' });
    expect(r0.governs).toBe('record');
    expect(r0.record).toEqual({
      potGrams: 2600,
      waterGrams: 0,
      finishedGrams: 2600,
      concentrationPercent: expect.closeTo(46.1538, 3),
    });
  });

  it('a real pour', () => {
    const r = resolveDilution({ ...same, gradualWaterGrams: '1400' });
    expect(r.record!.finishedGrams).toBe(4000);
    expect(r.record!.concentrationPercent).toBeCloseTo(30, 6);
  });

  it('a weighed pot corrects the record arm, target-independently', () => {
    const rw = resolveDilution({ ...same, gradualWaterGrams: '1400', measuredPasteGrams: '2500' });
    expect(rw.record!.potGrams).toBe(2500);
  });

  it('blank is NOT a record; separators are refused by the parser', () => {
    expect(resolveDilution({ ...same, gradualWaterGrams: ' ' }).governs).toBe('plan');
  });
});
