// packages/core/src/colorants.test.ts
import { describe, expect, it } from 'vitest';
import {
  COLORANT_GUIDANCE,
  HP_COLORANT_WATER_GRAMS,
  carrierOilSuperfatShift,
  colorantDispersal,
  colorantGrams,
  colorantStage,
  portionOilGrams,
  portionsTotalPercent,
} from './colorants';

describe('colorant dosing is against the PORTION\'s oils (a single-colour rule applied per colour)', () => {
  it('a 40% portion at 1% of 1000 g oils takes 4 g, not 10 g', () => {
    expect(portionOilGrams(1000, 40)).toBe(400);
    expect(colorantGrams(1, portionOilGrams(1000, 40))).toBe(4);
  });
  it('the whole batter is the whole oil weight', () => {
    expect(portionOilGrams(1000, null)).toBe(1000);
    expect(colorantGrams(1, 1000)).toBe(10);
  });
  it('an empty or invalid percent is "to shade": no grams', () => {
    expect(colorantGrams(null, 1000)).toBeNull();
    expect(colorantGrams(0, 1000)).toBeNull();
    expect(colorantGrams(NaN, 1000)).toBeNull();
  });
});

describe('dispersal per process', () => {
  it('CP: 1:1 with a light carrier oil, by weight (CP:9395-9400)', () => {
    expect(colorantDispersal('cp', 4, false)).toEqual({ method: 'carrier-oil', carrierGrams: 4 });
    expect(colorantDispersal('cp', null, true)).toEqual({ method: 'carrier-oil', carrierGrams: null });
  });
  it('HP portion colour: 0.25–0.50 oz hot water per colorant plus a little sugar (HP:11319-11321) = 7.1–14.2 g', () => {
    expect(HP_COLORANT_WATER_GRAMS.low).toBeCloseTo(7.1, 1);
    expect(HP_COLORANT_WATER_GRAMS.high).toBeCloseTo(14.2, 1);
    expect(colorantDispersal('hp', 4, true)).toEqual({ method: 'hot-sugar-water', waterGramsLow: HP_COLORANT_WATER_GRAMS.low, waterGramsHigh: HP_COLORANT_WATER_GRAMS.high });
  });
  it('HP whole-batter colour goes straight into the oils, no slurry (HP:11330-11334)', () => {
    expect(colorantDispersal('hp', 4, false)).toEqual({ method: 'recipe-oil' });
  });
  it('LS: dyes dissolve in a little warm water (LS:13256)', () => {
    expect(colorantDispersal('ls', 4, false)).toEqual({ method: 'warm-water' });
  });
});

describe('the carrier oil is extra unsaponified oil — a superfat shift', () => {
  it('10 g carrier on 1000 g oils is +1.00 point', () => {
    expect(carrierOilSuperfatShift(10, 1000)).toBeCloseTo(1, 6);
    expect(carrierOilSuperfatShift(0, 1000)).toBe(0);
    expect(carrierOilSuperfatShift(10, 0)).toBe(0);
  });
});

describe('stage: whole-batter colour into the oils; a portion at the design stage; LS after dilution', () => {
  it.each([
    ['cp', false, 'oils'], ['cp', true, 'trace'],           // CP:9401-9404
    ['hp', false, 'oils'], ['hp', true, 'after_cook'],      // HP:11330-11334
    ['ls', false, 'after_cook'], ['ls', true, 'after_cook'], // LS:13262
  ] as const)('%s hasPortion=%s → %s', (process, hasPortion, stage) => {
    expect(colorantStage(process, hasPortion)).toBe(stage);
  });
});

describe('portionsTotalPercent', () => {
  it('sums, and flags past 100', () => {
    expect(portionsTotalPercent([{ percent: 40 }, { percent: 60 }])).toEqual({ total: 100, over100: false });
    expect(portionsTotalPercent([{ percent: 70 }, { percent: 40 }])).toEqual({ total: 110, over100: true });
    expect(portionsTotalPercent([{ percent: null }])).toEqual({ total: 0, over100: false });
  });
});

describe('guidance ranges are derived, and say so', () => {
  it('micas/oxides carry the tsp-per-lb range and its weight derivation; dyes and "other" carry none', () => {
    expect(COLORANT_GUIDANCE.mica).toEqual({ tspPerLbLow: 0.5, tspPerLbHigh: 1, percentLow: 0.2, percentHigh: 0.9 });
    // Oxides share the mica band; the brown/red "half or less" is copy, not a second halving.
    expect(COLORANT_GUIDANCE.oxide).toEqual({ tspPerLbLow: 0.5, tspPerLbHigh: 1, percentLow: 0.2, percentHigh: 0.9 });
    expect(COLORANT_GUIDANCE.natural).toEqual({ tspPerLbLow: 0.5, tspPerLbHigh: 1, percentLow: 0.2, percentHigh: 0.9 });
    expect(COLORANT_GUIDANCE.dye).toBeNull();
    expect(COLORANT_GUIDANCE.other).toBeNull();
  });
});
