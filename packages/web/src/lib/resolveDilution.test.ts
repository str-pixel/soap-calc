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

  it('a batch-scope call carries no jar verdict at all', () => {
    expect(resolveDilution({ ...same, gradualWaterGrams: '900' }).jar).toBeNull();
  });
});

describe('resolveDilution: the portion scope parameter (spec §1)', () => {
  // The same fixture resolveDilution's own batch describe block uses (anhydrousGrams 1200,
  // wholeBatchPasteGrams 2600) — reused here so a 200 g / 20 g jar lands at the exact 41.96%
  // the brief's own worked example names, and the panel-level test for the same wiring can
  // point at the identical figure.
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
  const portionArgs = {
    dilution: plan,
    gradualWaterGrams: '',
    anhydrousGrams: 1200,
    wholeBatchPasteGrams: 2600,
    cookWaterGrams: 1400,
    measuredPasteGrams: '',
    scope: 'portion' as const,
  };

  it('noJar: nothing typed, plan governs, no jar verdict', () => {
    const r = resolveDilution({ ...portionArgs, jar: { pasteGrams: '', waterGrams: '' } });
    expect(r.governs).toBe('plan');
    expect(r.record).toBeNull();
    expect(r.jar).toEqual({
      hasBothFigures: false,
      pasteExceedsBatch: false,
      batchPasteGrams: 2600,
      pasteSubTenthPrecision: false,
      waterSubTenthPrecision: false,
    });
  });

  it('halfJar: only one field typed, plan still governs', () => {
    const r = resolveDilution({ ...portionArgs, jar: { pasteGrams: '200', waterGrams: '' } });
    expect(r.governs).toBe('plan');
    expect(r.record).toBeNull();
    expect(r.jar!.hasBothFigures).toBe(false);
  });

  it('fullJar: both figures, the jar governs and resolves — 200 g paste + 20 g water at 41.96%', () => {
    const r = resolveDilution({ ...portionArgs, jar: { pasteGrams: '200', waterGrams: '20' } });
    expect(r.governs).toBe('record');
    expect(r.record).toEqual({
      potGrams: 200,
      waterGrams: 20,
      finishedGrams: 220,
      concentrationPercent: expect.closeTo(41.9580, 3),
    });
    expect(r.jar).toEqual({
      hasBothFigures: true,
      pasteExceedsBatch: false,
      batchPasteGrams: 2600,
      pasteSubTenthPrecision: false,
      waterSubTenthPrecision: false,
    });
  });

  it('zero water is a legitimate jar reading, same rule as the batch record', () => {
    const r = resolveDilution({ ...portionArgs, jar: { pasteGrams: '200', waterGrams: '0' } });
    expect(r.governs).toBe('record');
    expect(r.record!.finishedGrams).toBe(200);
  });

  it('pasteExceedsBatch: the jar governs, but nothing can be shown — the 2a cell', () => {
    const r = resolveDilution({ ...portionArgs, jar: { pasteGrams: '3000', waterGrams: '20' } });
    expect(r.governs).toBe('record');
    expect(r.record).toBeNull();
    expect(r.jar).toEqual({
      hasBothFigures: true,
      pasteExceedsBatch: true,
      batchPasteGrams: 2600,
      pasteSubTenthPrecision: false,
      waterSubTenthPrecision: false,
    });
  });

  it('a swallowed thousands separator refuses the jar, on either field', () => {
    // The browser reads a typed comma as a decimal point before this function ever sees the
    // string, so the fixture is the string AFTER that conversion (a typed 1,300 arrives as
    // '1.300'), exactly as subTenthPrecisionFingerprint's own doc describes.
    const pasteTyped = resolveDilution({
      ...portionArgs,
      jar: { pasteGrams: '1.300', waterGrams: '20' },
    });
    expect(pasteTyped.governs).toBe('plan');
    expect(pasteTyped.jar).toEqual({
      hasBothFigures: false,
      pasteExceedsBatch: false,
      batchPasteGrams: 2600,
      pasteSubTenthPrecision: true,
      waterSubTenthPrecision: false,
    });
    const waterTyped = resolveDilution({
      ...portionArgs,
      jar: { pasteGrams: '200', waterGrams: '2.000' },
    });
    expect(waterTyped.governs).toBe('plan');
    expect(waterTyped.jar!.waterSubTenthPrecision).toBe(true);
  });

  it('the batch record never participates in portion scope', () => {
    // A leftover whole-batch record beside an empty jar must not make the jar arm govern —
    // spec §2's "the batch record participates nowhere in portion scope", enforced structurally
    // by resolvePortionScope never reading `gradualWaterGrams` at all.
    const r = resolveDilution({
      ...portionArgs,
      gradualWaterGrams: '900',
      jar: { pasteGrams: '', waterGrams: '' },
    });
    expect(r.governs).toBe('plan');
  });
});
