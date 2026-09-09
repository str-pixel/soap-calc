// packages/core/src/colorants.test.ts
import { describe, expect, it } from 'vitest';
import { colorantEntryById } from './colorant-catalog.js';
import {
  COLORANT_GUIDANCE,
  GRAMS_PER_TSP_COLORANT,
  tspPerLbToPercentOfOils,
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
  it('HP portion colour: 0.25–0.50 oz hot water per colorant plus a little sugar (HP:11320-11329) = 7.1–14.2 g', () => {
    expect(HP_COLORANT_WATER_GRAMS.low).toBeCloseTo(7.1, 1);
    expect(HP_COLORANT_WATER_GRAMS.high).toBeCloseTo(14.2, 1);
    expect(colorantDispersal('hp', 4, true)).toEqual({ method: 'hot-sugar-water', waterGramsLow: HP_COLORANT_WATER_GRAMS.low, waterGramsHigh: HP_COLORANT_WATER_GRAMS.high });
  });
  it('HP whole-batter colour goes straight into the oils, no slurry (HP:11331-11338)', () => {
    expect(colorantDispersal('hp', 4, false)).toEqual({ method: 'recipe-oil' });
  });
  it('LS: a dye goes straight into the diluted soap (LS:13253-13262)', () => {
    expect(colorantDispersal('ls', 4, false)).toEqual({ method: 'into-solution' });
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
    ['cp', false, 'oils'], ['cp', true, 'trace'],           // CP:9396-9404
    ['hp', false, 'oils'], ['hp', true, 'after_cook'],      // HP:11331-11338
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
  it('each kind falls back to its own sourced generic rate, and only "other" gets none', () => {
    expect(COLORANT_GUIDANCE.mica).toEqual({ tspPerLbLow: 0.5, tspPerLbHigh: 2 });
    expect(COLORANT_GUIDANCE.oxide).toEqual({ tspPerLbLow: 0.25, tspPerLbHigh: 2 });
    // The book's own general starting rate, since the named naturals span 1/32 to 3 tsp.
    expect(COLORANT_GUIDANCE.natural).toEqual({ tspPerLbLow: 1, tspPerLbHigh: 1 });
    expect(COLORANT_GUIDANCE.dye).toEqual({ tspPerLbLow: 0.25, tspPerLbHigh: 0.25 });
    expect(COLORANT_GUIDANCE.other).toBeNull();
  });

  it('the fallback band never contradicts a catalog entry of the same family', () => {
    // These used to disagree — the oxide band said half a teaspoon where the iron oxide
    // entry said one — which put two answers for one material on the same screen.
    expect(COLORANT_GUIDANCE.oxide!.tspPerLbLow).toBe(colorantEntryById('iron-oxide')!.tspPerLbLow);
    expect(COLORANT_GUIDANCE.oxide!.tspPerLbHigh).toBe(colorantEntryById('iron-oxide')!.tspPerLbHigh);
    expect(COLORANT_GUIDANCE.mica!.tspPerLbHigh).toBe(2);
  });

  it("converts a teaspoon rate to a percent through the book's own anchor", () => {
    // "approximately 4g of colorant per 450g or 1 teaspoon per pound of oil" (CP:9389-9391)
    expect(GRAMS_PER_TSP_COLORANT).toBe(4);
    expect(tspPerLbToPercentOfOils(1)).toBeCloseTo(0.882, 3);
    expect(tspPerLbToPercentOfOils(0.5)).toBeCloseTo(0.441, 3);
    // turmeric's thirty-second of a teaspoon survives as a real, typeable figure
    expect(tspPerLbToPercentOfOils(0.03)).toBeCloseTo(0.026, 3);
    expect(tspPerLbToPercentOfOils(0)).toBe(0);
    expect(tspPerLbToPercentOfOils(-1)).toBe(0);
  });
});

describe('the per-process rules follow the sources, including where a source offers a choice', () => {
  it('HP splits on the stage, not on taste: whole batter into the oils, a portion in sugar water', () => {
    // The source lists oil, glycerin, water, yogurt and milk as solvents and states hot
    // sugar water as its own preference; the app derives that preference and the panel copy
    // names the alternatives. What is NOT a preference is the whole-batter route: a single
    // colorant goes into the oils at the start (HP:11331-11334).
    expect(colorantDispersal('hp', 10, false)).toEqual({ method: 'recipe-oil' });
    expect(colorantDispersal('hp', 10, true).method).toBe('hot-sugar-water');
  });

  it('LS prescribes no temperature, because no source does', () => {
    // "A dye ... shows color when it is dissolved", most are water soluble, and the cosmetic
    // ones go straight into the diluted soap — often bought already liquid (LS:13253-13262).
    expect(colorantDispersal('ls', 10, false)).toEqual({ method: 'into-solution' });
    expect(colorantDispersal('ls', 10, true)).toEqual({ method: 'into-solution' });
  });

  it('CP disperses in oil whatever the stage — the source discourages water and glycerin', () => {
    expect(colorantDispersal('cp', 10, false).method).toBe('carrier-oil');
    expect(colorantDispersal('cp', 10, true).method).toBe('carrier-oil');
  });
});

describe('the lye-solution route, where a source puts a colour there', () => {
  it('overrides the derived stage and needs no other solvent', () => {
    expect(colorantStage('cp', false, true)).toBe('lye');
    // In the pot before the oils are, so a portion cannot claim it.
    expect(colorantStage('cp', true, true)).toBe('lye');
    expect(colorantDispersal('cp', 10, false, true)).toEqual({ method: 'lye-solution' });
  });

  it('leaves the derived stage alone when the route is not taken', () => {
    expect(colorantStage('cp', false, false)).toBe('oils');
    expect(colorantStage('cp', true, false)).toBe('trace');
    expect(colorantStage('hp', true, false)).toBe('after_cook');
    expect(colorantDispersal('cp', 10, false, false).method).toBe('carrier-oil');
  });
});
