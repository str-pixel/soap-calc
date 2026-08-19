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

  // spec decision 8: a leftover gradualWaterGrams record can survive beside a state where
  // `dilution` is null (a process that doesn't offer dilution, or an invalid target %) — this
  // is real, not hypothetical. Pinning what the implementation actually does there: governs
  // still reads 'record' off the record alone, but with no plan to anchor a pot,
  // weighedOrComputedPotGramsFor refuses to fabricate one, so both plan and record come back
  // null rather than inventing a figure.
  it('a record survives a null dilution (spec decision 8) — nothing is fabricated', () => {
    const r = resolveDilution({
      dilution: null,
      gradualWaterGrams: '1400',
      anhydrousGrams: 1200,
      wholeBatchPasteGrams: 2600,
      cookWaterGrams: 1400,
      measuredPasteGrams: '',
    });
    expect(r.governs).toBe('record');
    expect(r.plan).toBeNull();
    expect(r.record).toBeNull();
  });

  it('a zero record survives a null dilution too — still no fabricated pot', () => {
    const r0 = resolveDilution({
      dilution: null,
      gradualWaterGrams: '0',
      anhydrousGrams: 1200,
      wholeBatchPasteGrams: 2600,
      cookWaterGrams: 1400,
      measuredPasteGrams: '',
    });
    expect(r0.governs).toBe('record');
    expect(r0.plan).toBeNull();
    expect(r0.record).toBeNull();
  });
});
