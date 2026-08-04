import { describe, expect, it } from 'vitest';
import {
  computeBottledSolutionGrams,
  computePostCookSuperfat,
  computeRecipeAdditives,
  splitLiquidWaterFraction,
  splitLiquidWaterInputState,
} from './calculateAdditives';
import type { AdditiveLine } from './recipe';
import type { DilutionResult } from '@soap-calc/core';

describe('computeBottledSolutionGrams', () => {
  // Lives beside computeExtrasGrams so "what rides through to the bottle" and "what counts
  // as an extra" stay one tested rule set (code-review 2026-08-01) — the hook previously
  // reconstructed it inline by subtracting mismatched aggregates.
  //
  // dilutionWaterGrams (1,900) is real core arithmetic, not a stand-in: with no
  // measurement the whole point is base === dilution.solutionGrams (4,000 = 1,200
  // anhydrous + 900 cook water + 1,900 dilution water), so this must reduce to the old
  // formula exactly.
  const dilution: DilutionResult = {
    solutionGrams: 4000,
    anhydrousGrams: 1200,
    totalWaterGrams: 2800,
    dilutionWaterGrams: 1900,
    glycerinGrams: 0,
    soapConcentrationPercent: 30,
    targetExceedsPaste: false,
  };

  it('bottled = solution + extras solids (the split liquids WATER is already in the solution) — no measurement, byte-identical to before', () => {
    expect(
      computeBottledSolutionGrams({
        dilution,
        cookWaterGrams: 900,
        extrasGrams: 500,
        splitLiquidPasteWaterGrams: 100,
      }),
    ).toBeCloseTo(4400);
  });

  it('when the target exceeds the paste, the base is the REAL paste, not the target-derived solution — no measurement, byte-identical to before', () => {
    // Core computes solutionGrams purely from the target (anhydrous / soap%) and never
    // reads cookWaterGrams — when totalWater < cook, none of the paste water can be
    // removed, so dilutionWaterGrams is clamped to 0 and the bottled base is anhydrous +
    // cook water, which is LARGER than solutionGrams. The old subtraction shape understated
    // the bottle count twice over here (its comment claimed the split water "is already
    // inside the solution figure", false in this branch).
    const thick: DilutionResult = {
      solutionGrams: 1500,
      anhydrousGrams: 1200,
      totalWaterGrams: 700, // < cook (835), which is what clamps dilutionWaterGrams below
      dilutionWaterGrams: 0,
      glycerinGrams: 0,
      soapConcentrationPercent: 55,
      targetExceedsPaste: true,
    };
    expect(
      computeBottledSolutionGrams({
        dilution: thick,
        cookWaterGrams: 835, // lye water 400 + 435 g of goat-milk water
        extrasGrams: 500, // the 500 g of milk itself
        splitLiquidPasteWaterGrams: 435,
      }),
    ).toBeCloseTo(1200 + 835 + (500 - 435));
  });

  it('clamps the extras solids at zero — no measurement, byte-identical to before', () => {
    expect(
      computeBottledSolutionGrams({
        dilution,
        cookWaterGrams: 900,
        extrasGrams: 80,
        splitLiquidPasteWaterGrams: 100,
      }),
    ).toBeCloseTo(4000);
  });

  it('a valid whole-batch measurement replaces the stale target-exceeds-paste base with the true pot mass (verified trace)', () => {
    // anhydrous 1,000 g, cook water 2,200 g, target 33% soap: solutionGrams =
    // 1,000/0.33 = 3,030.3 g, totalWaterGrams (2,030.3 g) < cook, so targetExceedsPaste
    // clamps dilutionWaterGrams to 0 and the OLD base (anhydrous + cook water) was
    // 3,200 g — stale by 170 g against a genuine 3,000 g measurement. A valid measurement
    // corrects the water needed to 3,030.3 − 3,000 = 30.3 g (correctedDilutionWaterGrams),
    // so the true pot is 3,000 + 30.3 ≈ 3,030 g.
    const anhydrousGrams = 1000;
    const cookWaterGrams = 2200;
    const solutionGrams = anhydrousGrams / 0.33;
    const targetExceeds: DilutionResult = {
      anhydrousGrams,
      solutionGrams,
      totalWaterGrams: solutionGrams - anhydrousGrams,
      dilutionWaterGrams: 0,
      glycerinGrams: 0,
      soapConcentrationPercent: 33,
      targetExceedsPaste: true,
    };
    expect(
      computeBottledSolutionGrams({
        dilution: targetExceeds,
        cookWaterGrams,
        extrasGrams: 0,
        splitLiquidPasteWaterGrams: 0,
        measuredPasteGrams: '3000',
      }),
    ).toBeCloseTo(3030.3, 0);
  });

  it('a REMAINING-declared measurement does not feed the bottled base — a remainder is not the batch', () => {
    const anhydrousGrams = 1000;
    const cookWaterGrams = 2200;
    const solutionGrams = anhydrousGrams / 0.33;
    const targetExceeds: DilutionResult = {
      anhydrousGrams,
      solutionGrams,
      totalWaterGrams: solutionGrams - anhydrousGrams,
      dilutionWaterGrams: 0,
      glycerinGrams: 0,
      soapConcentrationPercent: 33,
      targetExceedsPaste: true,
    };
    expect(
      computeBottledSolutionGrams({
        dilution: targetExceeds,
        cookWaterGrams,
        extrasGrams: 0,
        splitLiquidPasteWaterGrams: 0,
        measuredPasteGrams: '3000',
        measuredPasteIsRemaining: true,
      }),
    ).toBeCloseTo(anhydrousGrams + cookWaterGrams, 0); // 3,200 g, the recipe's own figure
  });
});

function line(over: Partial<AdditiveLine>): AdditiveLine {
  return { key: 'k', catalogId: '', name: 'X', amount: '', basis: 'oil', unit: 'percent', addAt: 'trace', ...over };
}

describe('calculateAdditives', () => {
  const additives: AdditiveLine[] = [
    {
      key: 'a',
      catalogId: 'honey',
      name: 'Honey',
      amount: '1',
      basis: 'oil',
      unit: 'percent',
      addAt: 'trace',
    },
  ];

  it('computes grams from percent of oil', () => {
    expect(computeRecipeAdditives(additives, { oilGrams: 1000, batchGrams: 1500, solutionGrams: 0 })).toEqual([
      {
        key: 'a',
        catalogId: 'honey',
        name: 'Honey',
        amount: 1,
        unit: 'percent',
        basis: 'oil',
        grams: 10,
        addAt: 'trace',
      },
    ]);
  });



  it('skips invalid or zero percent lines', () => {
    const lines: AdditiveLine[] = [
      { key: 'a', catalogId: '', name: '', amount: 'abc', basis: 'oil', unit: 'percent', addAt: 'trace' },
      { key: 'b', catalogId: '', name: 'Clay', amount: '0', basis: 'oil', unit: 'percent', addAt: 'oils' },
      { key: 'c', catalogId: '', name: '', amount: '2', basis: 'oil', unit: 'percent', addAt: 'trace' },
    ];
    expect(computeRecipeAdditives(lines, { oilGrams: 1000, batchGrams: 1500, solutionGrams: 0 })).toEqual([
      {
        key: 'c',
        catalogId: '',
        name: 'Additive',
        amount: 2,
        unit: 'percent',
        basis: 'oil',
        grams: 20,
        addAt: 'trace',
      },
    ]);
  });
});

describe('computeRecipeAdditives dose basis/unit', () => {
  it('percent of oil uses oil weight', () => {
    const [row] = computeRecipeAdditives([line({ amount: '5' })], { oilGrams: 1000, batchGrams: 1500, solutionGrams: 0 });
    expect(row.grams).toBe(50);
  });
  it('percent of batch uses the wet-batch weight', () => {
    const [row] = computeRecipeAdditives([line({ amount: '1', basis: 'batch' })], { oilGrams: 1000, batchGrams: 1500, solutionGrams: 0 });
    expect(row.grams).toBe(15);
  });
  it('ppt of oil divides by 1000', () => {
    const [row] = computeRecipeAdditives([line({ amount: '3', unit: 'ppt' })], { oilGrams: 1000, batchGrams: 1500, solutionGrams: 0 });
    expect(row.grams).toBe(3);
  });
  it('skips a batch-basis line when batch weight is unavailable', () => {
    expect(computeRecipeAdditives([line({ amount: '1', basis: 'batch' })], { oilGrams: 1000, batchGrams: 0, solutionGrams: 0 })).toEqual([]);
  });
  it('a solution-basis line uses solutionGrams', () => {
    const [row] = computeRecipeAdditives([line({ amount: '2', basis: 'solution' })], { oilGrams: 1000, batchGrams: 1500, solutionGrams: 4000 });
    expect(row.grams).toBe(80); // 2% of 4000
  });
  it('skips a solution-basis line when solutionGrams is 0 (non-LS)', () => {
    expect(computeRecipeAdditives([line({ amount: '2', basis: 'solution' })], { oilGrams: 1000, batchGrams: 1500, solutionGrams: 0 })).toEqual([]);
  });
});

describe('computePostCookSuperfat', () => {
  it('computes grams from percent of oil for a single oil row', () => {
    expect(
      computePostCookSuperfat({ postCookSuperfatOils: [{ oilId: 'shea-butter', percent: '5' }] }, 1000),
    ).toEqual({
      oils: [{ oilId: 'shea-butter', percentOfOil: 5, grams: 50 }],
      percentOfOil: 5,
      grams: 50,
    });
  });

  it('sums multiple oil rows into the aggregate percent and grams', () => {
    expect(
      computePostCookSuperfat(
        {
          postCookSuperfatOils: [
            { oilId: 'shea-butter', percent: '3' },
            { oilId: 'jojoba-oil', percent: '2' },
          ],
        },
        1000,
      ),
    ).toEqual({
      oils: [
        { oilId: 'shea-butter', percentOfOil: 3, grams: 30 },
        { oilId: 'jojoba-oil', percentOfOil: 2, grams: 20 },
      ],
      percentOfOil: 5,
      grams: 50,
    });
  });

  it('skips empty/zero/invalid rows and returns null when none contribute', () => {
    expect(
      computePostCookSuperfat(
        {
          postCookSuperfatOils: [
            { oilId: 'olive-oil', percent: '' },
            { oilId: 'olive-oil', percent: '0' },
            { oilId: 'olive-oil', percent: 'abc' },
          ],
        },
        1000,
      ),
    ).toBeNull();
  });

  it('drops a zero-percent row but keeps a valid sibling', () => {
    expect(
      computePostCookSuperfat(
        {
          postCookSuperfatOils: [
            { oilId: 'olive-oil', percent: '0' },
            { oilId: 'shea-butter', percent: '4' },
          ],
        },
        1000,
      ),
    ).toEqual({
      oils: [{ oilId: 'shea-butter', percentOfOil: 4, grams: 40 }],
      percentOfOil: 4,
      grams: 40,
    });
  });

  it('returns null for an empty list', () => {
    expect(computePostCookSuperfat({ postCookSuperfatOils: [] }, 1000)).toBeNull();
  });

  it('returns null when total oil weight is not positive', () => {
    expect(
      computePostCookSuperfat({ postCookSuperfatOils: [{ oilId: 'olive-oil', percent: '5' }] }, 0),
    ).toBeNull();
  });
});

describe('splitLiquidWaterFraction', () => {
  it('uses the preset fraction when a preset is selected', () => {
    expect(
      splitLiquidWaterFraction({ presetKey: 'coconut-milk-canned', customWaterPercent: '' }),
    ).toBeCloseTo(0.68, 2);
  });

  it('uses the custom % water for custom liquids', () => {
    expect(
      splitLiquidWaterFraction({ presetKey: '', customWaterPercent: '55' }),
    ).toBeCloseTo(0.55, 2);
  });

  it('reports blank or invalid custom percents as UNKNOWN, not as pure water', () => {
    // Deliberate reversal of the previous contract ("treats blank or invalid custom
    // percents as pure water"). One shared default cannot serve the three consumers: the
    // dilution deduction wants an upper bound on water, the 1:1 lye floor wants a lower
    // bound, and the thick-liquid note cannot fire at all when the fraction is 1. Null
    // makes the unknown explicit so each consumer picks its own safe direction.
    for (const customWaterPercent of ['', '0', '-5', '250', 'abc']) {
      expect(
        splitLiquidWaterFraction({ presetKey: '', customWaterPercent }),
      ).toBeNull();
    }
  });

  it('separates a blank field from a mistyped one', () => {
    expect(splitLiquidWaterInputState({ presetKey: 'milk', customWaterPercent: '' })).toBe('preset');
    expect(splitLiquidWaterInputState({ presetKey: '', customWaterPercent: '55' })).toBe('declared');
    expect(splitLiquidWaterInputState({ presetKey: '', customWaterPercent: '' })).toBe('unknown');
    for (const bad of ['0', '-5', '250', '680', 'abc']) {
      expect(splitLiquidWaterInputState({ presetKey: '', customWaterPercent: bad })).toBe('invalid');
    }
  });
});

const NAOH_RECIPE = { lyeType: 'naoh' as const, kohBlendPercent: 0, naohPurityPercent: 100, kohPurityPercent: 100 };

describe('per-line acid extra lye', () => {
  it('attaches extraLye to a citric line when the acid recipe context is passed', () => {
    const [line] = computeRecipeAdditives(
      [{ key: 'c', catalogId: 'citric-acid', name: 'Citric acid (anhydrous)', amount: '2', basis: 'oil', unit: 'percent', addAt: 'lye' }],
      { oilGrams: 1000, batchGrams: 1500, solutionGrams: 0 },
      NAOH_RECIPE,
    );
    expect(line.grams).toBe(20);
    expect(line.extraLye?.naohGrams).toBeCloseTo(20 * 0.6246, 2);
    expect(line.extraLye?.kohGrams).toBe(0);
  });

  it('never attaches extraLye to an after_cook citric line (post-cook acid is never compensated)', () => {
    const [line] = computeRecipeAdditives(
      [{ key: 'c', catalogId: 'citric-acid', name: 'Citric', amount: '2', basis: 'oil', unit: 'percent', addAt: 'after_cook' }],
      { oilGrams: 1000, batchGrams: 1500, solutionGrams: 0 },
      NAOH_RECIPE,
    );
    expect(line.extraLye).toBeUndefined();
  });

  it('attaches no extraLye without the context or for factor-less entries', () => {
    const noContext = computeRecipeAdditives(
      [{ key: 'c', catalogId: 'citric-acid', name: 'Citric', amount: '2', basis: 'oil', unit: 'percent', addAt: 'lye' }],
      { oilGrams: 1000, batchGrams: 1500, solutionGrams: 0 },
    );
    expect(noContext[0].extraLye).toBeUndefined();
    const sugar = computeRecipeAdditives(
      [{ key: 's', catalogId: 'sugar-sorbitol', name: 'Sugar', amount: '2', basis: 'oil', unit: 'percent', addAt: 'trace' }],
      { oilGrams: 1000, batchGrams: 1500, solutionGrams: 0 },
      NAOH_RECIPE,
    );
    expect(sugar[0].extraLye).toBeUndefined();
  });
});

describe('process scoping reaches the computation, not just the picker', () => {
  const line = (catalogId: string) => ({
    key: catalogId, catalogId, name: catalogId, amount: '10',
    unit: 'percent' as const, basis: 'oil' as const, stage: 'lye' as const, addAt: 'lye' as const,
  });
  const basis = { oilGrams: 1000, batchGrams: 1500, solutionGrams: 3000 };

  it('withholds a line whose additive the process does not offer', () => {
    // Glycerin is LS-only. Before this, a CP recipe carrying the line (imported, or saved
    // before the gate) still resolved 100 g and still added it to the batch — the picker
    // filter never reached the dose computation.
    expect(computeRecipeAdditives([line('glycerin')], basis, undefined, 'cp')).toEqual([]);
    expect(computeRecipeAdditives([line('glycerin')], basis, undefined, 'hp')).toEqual([]);
  });

  it('still computes it for the process that does offer it', () => {
    const rows = computeRecipeAdditives([line('glycerin')], basis, undefined, 'ls');
    expect(rows).toHaveLength(1);
    expect(rows[0].grams).toBeCloseTo(100, 3);
  });

  it('withholds every additive CP does not offer, not just glycerin', () => {
    for (const id of ['glycerin', 'yogurt', 'guar', 'hec', 'pearlizer', 'wd-shea', 'finished-soap']) {
      expect(computeRecipeAdditives([line(id)], basis, undefined, 'cp')).toEqual([]);
    }
  });

  it('leaves unscoped additives alone, and withholds nothing when no process is given', () => {
    expect(computeRecipeAdditives([line('sugar-sorbitol')], basis, undefined, 'cp')).toHaveLength(1);
    // Omitting the process keeps every existing caller working unchanged.
    expect(computeRecipeAdditives([line('glycerin')], basis)).toHaveLength(1);
  });
});
