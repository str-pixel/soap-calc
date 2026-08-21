import { describe, expect, it } from 'vitest';
import {
  computeBottledSolutionGrams,
  computePostCookSuperfat,
  computeRecipeAdditives,
  finishedProductGramsFor,
  preservativeDosingBasisGramsFor,
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

  it('a split liquid bottles solutionGrams plus the NON-liquid extras — its solids are counted once, not twice', () => {
    // 200 g of canned coconut milk at 68% water: 136 g of water into the paste (already in
    // cookWaterGrams) and 64 g of non-water solids. The corrected water is solutionGrams
    // minus the real 1,900 + 64 g pot, so the base lands a solids' worth SHORT of
    // solutionGrams and the extras term puts exactly that back — the pot really does finish
    // at solutionGrams once the prescribed water is in.
    //
    // Two mutants survive without this: dropping wholeBatchPasteGrams from the
    // correctedDilutionWaterGrams call here, and useRecipeViewModel not passing it. Both
    // revert to solutionGrams + 64 g — a bottle heavier than anything the maker is told to
    // pour, and silently back to pre-branch behaviour.
    // cookWaterGrams is the fixture's own totalWater − dilutionWater (2,800 − 1,900), so the
    // pot below really is the one this dilution was computed for.
    const cookWaterGrams = 900; // 764 g lye water + 136 g of the milk's water
    const splitLiquidSolidsGrams = 64;
    const wholeBatchPasteGrams =
      dilution.anhydrousGrams + cookWaterGrams + splitLiquidSolidsGrams;
    expect(
      computeBottledSolutionGrams({
        dilution,
        cookWaterGrams,
        extrasGrams: 200 + 50, // the milk itself, plus 50 g of a solution-dosed additive
        splitLiquidPasteWaterGrams: 136,
        wholeBatchPasteGrams,
      }),
      // 4,000 g solution + the 50 g additive. The milk's own 200 g is already inside the
      // solution: 136 g as paste water, 64 g as the solids the corrected water made room for.
    ).toBeCloseTo(dilution.solutionGrams + 50, 6);
    // Control: the same call WITHOUT the corrected basis is the mutant's answer, and it is
    // 64 g heavier — so the assertion above is the correction talking, not arithmetic that
    // would hold either way.
    expect(
      computeBottledSolutionGrams({
        dilution,
        cookWaterGrams,
        extrasGrams: 200 + 50,
        splitLiquidPasteWaterGrams: 136,
      }),
    ).toBeCloseTo(dilution.solutionGrams + 50 + splitLiquidSolidsGrams, 6);
  });

  it('a measured pot counts the liquid\'s solids once too — the maker weighed them', () => {
    // The measured twin of the case above, and the one that used to disagree with it.
    // correctedDilutionWaterGrams measures its pour against the reading on this path
    // (rightly: the measurement IS the pot, whatever it is made of), so for any reading the
    // target can still take water to reach, the base is exactly
    // solutionGrams — with the 64 g of milk solids already inside it. Adding them again
    // through the extras term priced the bottle 64 g heavy against an identical batch with
    // the field left blank.
    const cookWaterGrams = 900; // 764 g lye water + 136 g of the milk's water
    const wholeBatchPasteGrams = dilution.anhydrousGrams + cookWaterGrams + 64;
    const args = {
      dilution,
      cookWaterGrams,
      extrasGrams: 200 + 50, // the milk itself, plus 50 g of a solution-dosed additive
      splitLiquidPasteWaterGrams: 136,
      wholeBatchPasteGrams,
    };
    expect(
      computeBottledSolutionGrams({ ...args, measuredPasteGrams: String(wholeBatchPasteGrams) }),
    ).toBeCloseTo(dilution.solutionGrams + 50, 6);
    // …and it holds for a reading that DRIFTS from the computed pot, which is the whole
    // point of weighing: 64 g lighter (water lost to the cook) buys 64 g more dilution
    // water, so the bottle lands in the same place. The answer must not depend on how close
    // the scale came to the recipe's own figure.
    expect(
      computeBottledSolutionGrams({ ...args, measuredPasteGrams: String(wholeBatchPasteGrams - 64) }),
    ).toBeCloseTo(dilution.solutionGrams + 50, 6);
    // Control: without the corrected basis the solids are unknowable, so this path falls
    // back to the pre-correction formula exactly as the unmeasured one does — 64 g heavier.
    expect(
      computeBottledSolutionGrams({
        ...args,
        wholeBatchPasteGrams: undefined,
        measuredPasteGrams: String(wholeBatchPasteGrams),
      }),
    ).toBeCloseTo(dilution.solutionGrams + 50 + 64, 6);
  });

  it('prices the pot on the scale even when it is past the target’s own solution', () => {
    // THE SPLIT. This base used to be chosen by measuredPasteIsValidFor, whose ceiling asks
    // whether the reading is heavier than the solution the SAVED target dilutes to. In
    // gradual mode that target is what the panel's own record just wrote: a weighed pot with
    // no water recorded lands solutionGrams a hair UNDER the reading roughly half the time,
    // because the write-back rounds to 2 dp. There this fell back to the recipe's COMPUTED
    // pot — so the panel counted from the 1,405 g on the scale while the finished-product
    // figure, the finished volume and the preservative dose all came off 1,600 g.
    //
    // 1,200 g of anhydrous soap; the record writes round2(120000/1405) = 85.41%, and
    // 1,200 / 0.8541 is 1,404.99 g — under the reading.
    //
    // `gradualWaterGrams: '0'` IS that record — the pot before any water at all, which is
    // where gradual's own record starts and what wrote this target. It is also what licenses
    // the widened ceiling the base is chosen by: without a record the reading is judged
    // against solutionGrams exactly, because a target the maker typed was not written from
    // any pot. See correctedPotGramsFor.
    const at8541: DilutionResult = {
      anhydrousGrams: 1200,
      solutionGrams: 1200 / 0.8541,
      totalWaterGrams: 1200 / 0.8541 - 1200,
      dilutionWaterGrams: 0,
      glycerinGrams: 110,
      soapConcentrationPercent: 85.41,
      targetExceedsPaste: true,
    };
    expect(
      computeBottledSolutionGrams({
        dilution: at8541,
        cookWaterGrams: 400,
        extrasGrams: 0,
        splitLiquidPasteWaterGrams: 0,
        measuredPasteGrams: '1405',
        wholeBatchPasteGrams: 1600,
        gradualWaterGrams: '0',
      }),
    ).toBeCloseTo(1405, 6);
    // …and the extras still ride on top of the pot that was weighed, not on a second one.
    expect(
      computeBottledSolutionGrams({
        dilution: at8541,
        cookWaterGrams: 400,
        extrasGrams: 50,
        splitLiquidPasteWaterGrams: 0,
        measuredPasteGrams: '1405',
        wholeBatchPasteGrams: 1600,
        gradualWaterGrams: '0',
      }),
    ).toBeCloseTo(1455, 6);
  });

  it('prices the recipe’s own pot for the same reading with no record behind the target', () => {
    // The other half of the rule, at the surface the dose is taken from. Same reading, same
    // 85.41% — but nothing recorded, so the target is one the maker typed and the reading is
    // simply past the solution it dilutes to. The bottled base falls back to the recipe's own
    // anhydrous + cook water + the water the target still calls for, exactly as it did before
    // the widening existed, and the panel's exceeds-solution alert is on screen saying why.
    const at8541: DilutionResult = {
      anhydrousGrams: 1200,
      solutionGrams: 1200 / 0.8541,
      totalWaterGrams: 1200 / 0.8541 - 1200,
      dilutionWaterGrams: 0,
      glycerinGrams: 110,
      soapConcentrationPercent: 85.41,
      targetExceedsPaste: true,
    };
    expect(
      computeBottledSolutionGrams({
        dilution: at8541,
        cookWaterGrams: 400,
        extrasGrams: 0,
        splitLiquidPasteWaterGrams: 0,
        measuredPasteGrams: '1405',
        wholeBatchPasteGrams: 1600,
      }),
      // anhydrous + cook water, with the water term clamped to 0 against a 1,600 g pot.
    ).toBeCloseTo(1600, 6);
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

describe('preservativeDosingBasisGramsFor', () => {
  // One rule, three readers (the Dilution panel's ≈ Finished product row, the printed
  // sheet's, and the Preservative snippet's dose base) — it used to be the same `??` chain
  // written out three times, and one of those readers multiplies it by a % with a legal
  // ceiling on it.
  const dilution: DilutionResult = {
    solutionGrams: 4000,
    anhydrousGrams: 1200,
    totalWaterGrams: 2800,
    dilutionWaterGrams: 1900,
    glycerinGrams: 0,
    soapConcentrationPercent: 30,
    targetExceedsPaste: false,
  };

  it('prefers the bottled figure, which counts the extras that ride into the bottle', () => {
    expect(preservativeDosingBasisGramsFor(4120, dilution)).toBe(4120);
  });

  it('falls back to the solution for a caller that has no bottled figure', () => {
    // Unreachable from the view model (bottledSolutionGrams is null exactly when dilution
    // is) but live for the component-level callers that pass a dilution and nothing else —
    // both DilutionPanel and BatchSheet default the bottled prop to null.
    expect(preservativeDosingBasisGramsFor(null, dilution)).toBe(4000);
    expect(preservativeDosingBasisGramsFor(undefined, dilution)).toBe(4000);
  });

  it('is null with neither — nothing to dose or to convert to a volume', () => {
    expect(preservativeDosingBasisGramsFor(null, null)).toBeNull();
    expect(preservativeDosingBasisGramsFor(undefined, undefined)).toBeNull();
  });

  it('keeps a real zero rather than falling through it', () => {
    // ?? and not ||: a 0 g bottled figure is an answer, and falling through to a nonzero
    // solution would quote a mass the batch does not have.
    expect(preservativeDosingBasisGramsFor(0, dilution)).toBe(0);
  });
});

describe('finishedProductGramsFor', () => {
  // The inclusive figure (spec §3): the dosing basis plus whatever preservative is dosed
  // against it. Equals the basis exactly when there is no preservative dose, so recipes
  // without one see no change from this split.
  it('adds the preservative dose to the dosing basis', () => {
    expect(finishedProductGramsFor(2400, 12.06)).toBeCloseTo(2412.06, 2);
  });

  it('is null when the dosing basis is null — nothing to add to', () => {
    expect(finishedProductGramsFor(null, 12.06)).toBeNull();
  });

  it('equals the dosing basis exactly when no preservative is dosed', () => {
    expect(finishedProductGramsFor(2400, 0)).toBe(2400);
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

describe('computeBottledSolutionGrams: the record arm (spec §3)', () => {
  // With a record governing, the bottled mass is what is IN THE POT — the pot the record
  // counts from plus the water actually poured — not the target's own solution. The extras
  // term has to net out whatever of the split liquid that pot already holds, or the liquid
  // is priced twice.
  const GLYCERIN = {
    // 300 g anhydrous soap, 400 g of lye water, and 300 g of glycerin (waterFraction 0, so
    // all of it is solids and none of it is cook water).
    dilution: {
      anhydrousGrams: 1200,
      solutionGrams: 4000,
      totalWaterGrams: 2800,
      dilutionWaterGrams: 2400,
      glycerinGrams: 110,
      soapConcentrationPercent: 30,
      targetExceedsPaste: false,
    },
    cookWaterGrams: 400,
    extrasGrams: 300,
    splitLiquidPasteWaterGrams: 0,
    wholeBatchPasteGrams: 1900,
  };

  it('is pot + recorded water + the extras the pot does not already hold', () => {
    // The pot (1,900 g) already contains the glycerin's whole 300 g — it is a solids-aware
    // corrected basis — so the extras term contributes nothing. 1,900 + 2,500 = 4,400 g.
    // The naive pot + record + extras prices 4,700 g: the glycerin, twice.
    expect(
      computeBottledSolutionGrams({
        ...GLYCERIN,
        record: { potGrams: 1900, waterGrams: 2500 },
      }),
    ).toBeCloseTo(4400, 6);
  });

  it('subtracts the liquid\'s WATER only from a bare anhydrous + cook-water pot', () => {
    // With no corrected basis there are no solids to net out — the pot is anhydrous + cook
    // water and holds the liquid's water alone. 1,600 + 2,500 + (300 - 100) = 4,300 g.
    expect(
      computeBottledSolutionGrams({
        ...GLYCERIN,
        splitLiquidPasteWaterGrams: 100,
        wholeBatchPasteGrams: null,
        record: { potGrams: 1600, waterGrams: 2500 },
      }),
    ).toBeCloseTo(4300, 6);
  });

  it('leaves the plan arm exactly as it was when no record is passed', () => {
    expect(computeBottledSolutionGrams(GLYCERIN)).toBeCloseTo(
      computeBottledSolutionGrams({ ...GLYCERIN, record: null }),
      6,
    );
  });
});
