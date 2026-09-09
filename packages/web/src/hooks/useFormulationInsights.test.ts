/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { emptyComputedScentColor, type ComputedScentColor } from '../lib/computeScentColor';
import {
  DEFAULT_SETTINGS,
  newAdditiveKey,
  newLineKey,
  type AdditiveLine,
  type RecipeLine,
} from '../lib/recipe';
import { computeRecipeAdditives } from '../lib/calculateAdditives';
import { useRecipeProperties } from './useRecipeProperties';
import { useRecipeCalculation } from './useRecipeCalculation';
import {
  hpYogurtPercentForInsights,
  postCookSuperfatPufaPercent,
  sugarTotalPercentForInsights,
  totalAdditivePercentForInsights,
  useFormulationInsights,
} from './useFormulationInsights';

describe('totalAdditivePercentForInsights', () => {
  it("excludes the COOK's glycerin from the total (deliberate solvent dose, not extras)", () => {
    const total = totalAdditivePercentForInsights(
      [
        { catalogId: 'glycerin', grams: 220, addAt: 'lye' },
        { catalogId: 'clay', grams: 10 },
      ],
      1000,
      [],
    );
    expect(total).toBeCloseTo(1, 5);
  });

  it('counts glycerin stirred into finished soap — nothing about it is solvent', () => {
    // The mirror of the case above: after the cook there is no paste to dissolve and no
    // lye water to be part of, so a quarter of the oil weight landing in the bottle is
    // exactly the load this warning exists for.
    const total = totalAdditivePercentForInsights(
      [
        { catalogId: 'glycerin', grams: 220, addAt: 'after_cook' },
        { catalogId: 'clay', grams: 10 },
      ],
      1000,
      [],
    );
    expect(total).toBeCloseTo(23, 5);
  });

  it('excludes split liquid added in lye water', () => {
    expect(
      totalAdditivePercentForInsights([{ grams: 50 }], 1000, [{ addAt: 'lye', grams: 80 }]),
    ).toBe(5);
  });
  it('includes split liquid rows joining the batter (grams folded back to % of oils)', () => {
    expect(
      totalAdditivePercentForInsights([{ grams: 50 }], 1000, [
        { addAt: 'trace', grams: 60 },
        { addAt: 'oils', grams: 20 },
        { addAt: 'lye', grams: 500 },
      ]),
    ).toBe(13);
  });
  it('sums additive grams as oil-equivalent percent regardless of dose basis/unit', () => {
    // a batch/ppt line contributes grams/oil*100, not its raw amount
    expect(
      totalAdditivePercentForInsights([{ grams: 30 }, { grams: 3 }], 1000, []),
    ).toBeCloseTo(3.3); // (30+3)/1000*100
  });
});

describe('hpYogurtPercentForInsights', () => {
  it('sums grams from yogurt-matching lines as a percent of oil weight', () => {
    expect(
      hpYogurtPercentForInsights(
        [{ catalogId: 'yogurt', name: 'Yogurt', grams: 60 }],
        1000,
      ),
    ).toBe(6);
  });

  it('matches a custom-named yogurt line by keyword, not just catalog id', () => {
    expect(
      hpYogurtPercentForInsights(
        [{ catalogId: 'custom', name: 'Greek yogurt', grams: 40 }],
        1000,
      ),
    ).toBe(4);
  });

  it('ignores non-yogurt lines and returns 0 with no oil weight', () => {
    expect(
      hpYogurtPercentForInsights([{ catalogId: 'honey', name: 'Honey', grams: 20 }], 1000),
    ).toBe(0);
    expect(
      hpYogurtPercentForInsights([{ catalogId: 'yogurt', name: 'Yogurt', grams: 20 }], 0),
    ).toBe(0);
  });
});

describe('sugarTotalPercentForInsights', () => {
  it('sums grams from a sugar/sorbitol line as a percent of oil weight', () => {
    expect(
      sugarTotalPercentForInsights(
        [{ catalogId: 'sugar-sorbitol', name: 'Sugar / sorbitol', grams: 30 }],
        1000,
      ),
    ).toBe(3);
  });

  it('sums two sugar-family sources (sugar + honey) without double counting', () => {
    expect(
      sugarTotalPercentForInsights(
        [
          { catalogId: 'sugar-sorbitol', name: 'Sugar / sorbitol', grams: 30 },
          { catalogId: 'honey', name: 'Honey', grams: 20 },
        ],
        1000,
      ),
    ).toBe(5);
  });

  it('matches a custom-named sorbitol or yogurt line by keyword, not just catalog id', () => {
    expect(
      sugarTotalPercentForInsights(
        [{ catalogId: 'custom', name: 'Liquid sorbitol', grams: 10 }],
        1000,
      ),
    ).toBe(1);
    expect(
      sugarTotalPercentForInsights(
        [{ catalogId: 'custom', name: 'Greek yogurt', grams: 40 }],
        1000,
      ),
    ).toBe(4);
  });

  it('ignores non-sugar-family lines and returns 0 with no oil weight', () => {
    expect(
      sugarTotalPercentForInsights(
        [{ catalogId: 'salt', name: 'Table salt (NaCl)', grams: 20 }],
        1000,
      ),
    ).toBe(0);
    expect(
      sugarTotalPercentForInsights(
        [{ catalogId: 'sugar-sorbitol', name: 'Sugar / sorbitol', grams: 20 }],
        0,
      ),
    ).toBe(0);
  });

  it('excludes yogurt lines from the total when excludeYogurt is true (HP: covered by hp_yogurt_water instead)', () => {
    expect(
      sugarTotalPercentForInsights(
        [{ catalogId: 'yogurt', name: 'Yogurt', grams: 60 }],
        1000,
        true,
      ),
    ).toBe(0);
  });

  it('still counts yogurt toward the total when excludeYogurt is false/omitted (non-HP)', () => {
    expect(
      sugarTotalPercentForInsights(
        [{ catalogId: 'yogurt', name: 'Yogurt', grams: 60 }],
        1000,
      ),
    ).toBe(6);
  });

  it('excludes only yogurt, still counting other sugar-family lines, when excludeYogurt is true', () => {
    expect(
      sugarTotalPercentForInsights(
        [
          { catalogId: 'yogurt', name: 'Yogurt', grams: 60 },
          { catalogId: 'honey', name: 'Honey', grams: 20 },
        ],
        1000,
        true,
      ),
    ).toBe(2);
  });
});

describe('postCookSuperfatPufaPercent', () => {
  it('returns a single oil linoleic+linolenic total, undefined when no oil has data', () => {
    const coconut = postCookSuperfatPufaPercent([{ oilId: 'coconut-oil-76', grams: 50 }]);
    expect(coconut).toBeDefined();
    expect(coconut!).toBeLessThan(30); // coconut is low-PUFA
    expect(postCookSuperfatPufaPercent([{ oilId: 'not-an-oil', grams: 50 }])).toBeUndefined();
  });

  it('grams-weights the PUFA across a blend', () => {
    // Equal grams of a low-PUFA (coconut) and a high-PUFA (sunflower) oil → the average
    // sits between the two single-oil values.
    const coconut = postCookSuperfatPufaPercent([{ oilId: 'coconut-oil-76', grams: 100 }])!;
    const sunflower = postCookSuperfatPufaPercent([{ oilId: 'sunflower-oil', grams: 100 }])!;
    const blend = postCookSuperfatPufaPercent([
      { oilId: 'coconut-oil-76', grams: 100 },
      { oilId: 'sunflower-oil', grams: 100 },
    ])!;
    expect(blend).toBeGreaterThan(coconut);
    expect(blend).toBeLessThan(sunflower);
    expect(blend).toBeCloseTo((coconut + sunflower) / 2, 5);
  });

  it('skips oils without fatty-acid data when weighting', () => {
    // The unknown oil contributes nothing, so the result equals the known oil alone.
    const known = postCookSuperfatPufaPercent([{ oilId: 'sunflower-oil', grams: 100 }])!;
    const mixed = postCookSuperfatPufaPercent([
      { oilId: 'sunflower-oil', grams: 100 },
      { oilId: 'not-an-oil', grams: 100 },
    ])!;
    expect(mixed).toBeCloseTo(known, 5);
  });
});

function makeLine(oilId: string, weightGrams: string): RecipeLine {
  return { key: newLineKey(), oilId, weightGrams };
}

// Composes the same hooks useRecipeViewModel wires together (properties + fatty acids +
// lye calc feed useFormulationInsights), so this exercises the real trace-speed wiring
// end to end rather than hand-building a FormulationAnalysisInput.
function useTraceSpeedTestHarness(lines: RecipeLine[], process: 'cp' | 'ls' = 'cp') {
  const { properties, fattyAcids } = useRecipeProperties(lines, DEFAULT_SETTINGS);
  const { result } = useRecipeCalculation(lines, DEFAULT_SETTINGS, 'cp');
  return useFormulationInsights(lines, DEFAULT_SETTINGS, properties, fattyAcids, result, {
    process,
  });
}

describe('useFormulationInsights trace-speed wiring', () => {
  // Hard/saturated CP: tallow + coconut + palm — high lauric/myristic/palmitic/stearic.
  const hardLines = [
    makeLine('lard-pig-tallow', '400'),
    makeLine('coconut-oil-76', '300'),
    makeLine('palm-oil', '300'),
  ];
  // Olive-dominant CP (castile-leaning) — high oleic, low saturated.
  const oliveLines = [makeLine('olive-oil', '700'), makeLine('coconut-oil-76', '300')];

  it('predicts a fast trace for a hard/saturated CP recipe', () => {
    const { result } = renderHook(() => useTraceSpeedTestHarness(hardLines));
    const insight = result.current.insights.find((i) => i.code === 'trace_speed');
    expect(insight).toBeDefined();
    expect(insight!.message).toContain('fast');
  });

  it('end-to-end wires the trace-speed drivers into the insight message', () => {
    // hardLines' saturated fat share is well above 30, so estimateTraceSpeed's
    // 'high saturated fats' driver fires and must reach the rendered message (#4).
    const { result } = renderHook(() => useTraceSpeedTestHarness(hardLines));
    const insight = result.current.insights.find((i) => i.code === 'trace_speed');
    expect(insight!.message).toContain('Driven by:');
    expect(insight!.message).toContain('high saturated fats');
  });

  it('predicts a slow trace for an olive-dominant CP recipe', () => {
    const { result } = renderHook(() => useTraceSpeedTestHarness(oliveLines));
    const insight = result.current.insights.find((i) => i.code === 'trace_speed');
    expect(insight).toBeDefined();
    expect(insight!.message).toContain('slow');
  });

  it('omits the trace-speed insight for liquid soap, even with the same fast-trace oils', () => {
    const { result } = renderHook(() => useTraceSpeedTestHarness(hardLines, 'ls'));
    const codes = result.current.insights.map((i) => i.code);
    expect(codes).not.toContain('trace_speed');
  });

  it('omits the trace-speed insight when fatty-acid coverage is below the low-coverage gate', () => {
    // beeswax carries no fatty-acid profile, so mixing it 30/70 with coconut renormalizes
    // the profile over only the covered (coconut) weight — coverage lands well under 80%,
    // making the predicted trace speed unrepresentative.
    const lowCoverageLines = [
      makeLine('coconut-oil-76', '700'),
      makeLine('beeswax', '300'),
    ];
    const { result: propsResult } = renderHook(() =>
      useRecipeProperties(lowCoverageLines, DEFAULT_SETTINGS),
    );
    expect(propsResult.current.fattyAcids.coveragePercent).toBeLessThan(80);

    const { result } = renderHook(() => useTraceSpeedTestHarness(lowCoverageLines));
    const codes = result.current.insights.map((i) => i.code);
    expect(codes).not.toContain('trace_speed');
  });
});

function saltLine(): AdditiveLine {
  return {
    key: newAdditiveKey(),
    catalogId: 'salt',
    name: 'Table salt (NaCl)',
    amount: '0.5',
    basis: 'oil',
    unit: 'percent',
    addAt: 'lye',
  };
}

function yogurtLine(percent: string): AdditiveLine {
  return {
    key: newAdditiveKey(),
    catalogId: 'yogurt',
    name: 'Yogurt',
    amount: percent,
    basis: 'oil',
    unit: 'percent',
    addAt: 'after_cook',
  };
}

function sugarLine(percent: string): AdditiveLine {
  return {
    key: newAdditiveKey(),
    catalogId: 'sugar-sorbitol',
    name: 'Sugar / sorbitol',
    amount: percent,
    basis: 'oil',
    unit: 'percent',
    addAt: 'trace',
  };
}

function milkPowderLine(percent: string): AdditiveLine {
  return { ...honeyLine(percent), key: newAdditiveKey(), catalogId: 'milk-powder', name: 'Milk powder' };
}

function honeyLine(percent: string): AdditiveLine {
  return {
    key: newAdditiveKey(),
    catalogId: 'honey',
    name: 'Honey',
    amount: percent,
    basis: 'oil',
    unit: 'percent',
    addAt: 'trace',
  };
}

// Composes the same hooks useRecipeViewModel wires together, with `process` and the
// resulting additive grams threaded into useFormulationInsights exactly as the view model
// does — exercises Step 0/5's real wiring (process discriminator + hpYogurtPercent) rather
// than hand-building a FormulationAnalysisInput.
function useProcessWiringHarness(
  lines: RecipeLine[],
  process: 'cp' | 'hp' | 'ls',
  additiveLines: AdditiveLine[] = [],
) {
  const { properties, fattyAcids } = useRecipeProperties(lines, DEFAULT_SETTINGS);
  const { result } = useRecipeCalculation(lines, DEFAULT_SETTINGS, process);
  const additives = result
    ? computeRecipeAdditives(additiveLines, {
        oilGrams: result.totalOilWeightGrams,
        batchGrams: result.totalOilWeightGrams,
        solutionGrams: result.totalOilWeightGrams,
      })
    : [];
  return useFormulationInsights(lines, DEFAULT_SETTINGS, properties, fattyAcids, result, {
    additives,
    process,
  });
}

describe('useFormulationInsights HP process wiring (Step 0 + Step 5)', () => {
  const lines = [makeLine('olive-oil', '700'), makeLine('coconut-oil-76', '300')];

  it('fires hp_thick_phase_suppressant for an HP recipe carrying salt', () => {
    const { result } = renderHook(() => useProcessWiringHarness(lines, 'hp', [saltLine()]));
    const codes = result.current.insights.map((i) => i.code);
    expect(codes).toContain('hp_thick_phase_suppressant');
  });

  it('does NOT fire hp_thick_phase_suppressant for the same salt line on a CP recipe (gating regression)', () => {
    // This is the exact bug the process discriminator prevents: CP is also not LS, so a
    // gate written as `process !== 'ls'` would wrongly fire here too — only the explicit
    // `process === 'hp'` check correctly excludes it.
    const { result } = renderHook(() => useProcessWiringHarness(lines, 'cp', [saltLine()]));
    const codes = result.current.insights.map((i) => i.code);
    expect(codes).not.toContain('hp_thick_phase_suppressant');
  });

  it('fires hp_yogurt_water end-to-end for an HP recipe with a >5% yogurt line', () => {
    const { result } = renderHook(() => useProcessWiringHarness(lines, 'hp', [yogurtLine('6')]));
    const codes = result.current.insights.map((i) => i.code);
    expect(codes).toContain('hp_yogurt_water');
  });

  it('does not fire hp_yogurt_water for an HP recipe with a 4% yogurt line (boundary)', () => {
    const { result } = renderHook(() => useProcessWiringHarness(lines, 'hp', [yogurtLine('4')]));
    const codes = result.current.insights.map((i) => i.code);
    expect(codes).not.toContain('hp_yogurt_water');
  });

  it('does not compute or fire hp_yogurt_water for a CP recipe with the same yogurt line', () => {
    const { result } = renderHook(() => useProcessWiringHarness(lines, 'cp', [yogurtLine('6')]));
    const codes = result.current.insights.map((i) => i.code);
    expect(codes).not.toContain('hp_yogurt_water');
  });
});

describe('useFormulationInsights LS water-envelope pasteWaterGrams wiring (Task 3a)', () => {
  // 700 g olive + 300 g coconut = 1,000 g oils; 20% of oils water mode → 200 g lye water,
  // below the 25-60% LS envelope on its own.
  const lsLines = [makeLine('olive-oil', '700'), makeLine('coconut-oil-76', '300')];
  const lsSettings = {
    ...DEFAULT_SETTINGS,
    processVariant: 'ls' as const,
    waterMode: 'percent_of_oils' as const,
    waterPercentOfOils: '20',
  };
  function useLsEnvelopeHarness(cookWaterGrams?: number) {
    const { properties, fattyAcids } = useRecipeProperties(lsLines, lsSettings);
    const { result } = useRecipeCalculation(lsLines, lsSettings, 'ls');
    return useFormulationInsights(lsLines, lsSettings, properties, fattyAcids, result, {
      process: 'ls',
      cookWaterGrams,
    });
  }

  it('false-flags below the envelope on lye-only water when no cookWaterGrams is threaded', () => {
    const { result } = renderHook(() => useLsEnvelopeHarness());
    const codes = result.current.insights.map((i) => i.code);
    expect(codes).toContain('ls_water_outside_envelope');
  });

  it("reads cookWaterGrams (lye + split-liquid water) so a split-liquid recipe's real paste water lands inside the envelope", () => {
    // A pre-cook alternative liquid adding 100 g of water brings the paste's real water to
    // 300 g = 30% of oils, inside 25-60% — the false flag above must clear.
    const { result } = renderHook(() => useLsEnvelopeHarness(300));
    const codes = result.current.insights.map((i) => i.code);
    expect(codes).not.toContain('ls_water_outside_envelope');
  });
});

describe('useFormulationInsights sugar aggregator (Step 3b)', () => {
  const lines = [makeLine('olive-oil', '700'), makeLine('coconut-oil-76', '300')];

  it('fires sugar_total_high exactly once when two sugar-family additives sum past 4%', () => {
    const { result } = renderHook(() =>
      useProcessWiringHarness(lines, 'cp', [sugarLine('3'), honeyLine('2')]),
    );
    const codes = result.current.insights.map((i) => i.code);
    expect(codes.filter((c) => c === 'sugar_total_high')).toHaveLength(1);
  });

  it('counts milk powder as sugar family — it carries the sugars hazard, so it counts toward the ceiling', () => {
    const { result } = renderHook(() =>
      useProcessWiringHarness(lines, 'cp', [sugarLine('3'), milkPowderLine('1.5')]),
    );
    const codes = result.current.insights.map((i) => i.code);
    expect(codes.filter((c) => c === 'sugar_total_high')).toHaveLength(1);
  });

  it('does not fire sugar_total_high when the sugar-family total stays at 3%', () => {
    const { result } = renderHook(() =>
      useProcessWiringHarness(lines, 'cp', [sugarLine('2'), honeyLine('1')]),
    );
    const codes = result.current.insights.map((i) => i.code);
    expect(codes).not.toContain('sugar_total_high');
  });

  it('fires hp_yogurt_water but NOT sugar_total_high for an HP recipe with ~6% yogurt and no other sugar-family additive (Finding 1 dedup)', () => {
    const { result } = renderHook(() =>
      useProcessWiringHarness(lines, 'hp', [yogurtLine('6')]),
    );
    const codes = result.current.insights.map((i) => i.code);
    expect(codes).toContain('hp_yogurt_water');
    expect(codes).not.toContain('sugar_total_high');
  });

  it('still fires sugar_total_high for a CP recipe with ~6% yogurt (non-HP keeps yogurt in the sugar total)', () => {
    const { result } = renderHook(() =>
      useProcessWiringHarness(lines, 'cp', [yogurtLine('6')]),
    );
    const codes = result.current.insights.map((i) => i.code);
    expect(codes).toContain('sugar_total_high');
  });
});

describe('the double-dosing check reaches the rule only for a real double dose', () => {
  const lines = [makeLine('olive-oil', '700'), makeLine('coconut-oil-76', '300')];
  const charcoalAdditive = {
    key: 'a1', catalogId: 'charcoal', name: 'Charcoal', amount: 1, unit: 'percent' as const,
    basis: 'oil' as const, grams: 10, addAt: 'oils' as const,
  };
  function harness(colorants: ComputedScentColor['colorants'], additives = [charcoalAdditive]) {
    const { properties, fattyAcids } = useRecipeProperties(lines, DEFAULT_SETTINGS);
    const { result } = useRecipeCalculation(lines, DEFAULT_SETTINGS, 'cp');
    return useFormulationInsights(lines, DEFAULT_SETTINGS, properties, fattyAcids, result, {
      process: 'cp',
      additives,
      scentColor: { ...emptyComputedScentColor(), colorants },
    });
  }
  const colorant = (over: Partial<ComputedScentColor['colorants'][number]>) => ({
    key: 'c1', catalogId: '', name: '', kind: 'natural' as const, percent: 1, grams: 10,
    portionKey: '', portionName: '', portionPercent: null, portionShareMissing: false, viaLye: false, mixedWith: 'oil' as const,
    stage: 'oils' as const, dispersal: { method: 'carrier-oil' as const, carrierGrams: 10 },
    ...over,
  });
  const fired = (colorants: ComputedScentColor['colorants'], additives?: typeof harness extends never ? never : Parameters<typeof harness>[1]) => {
    const { result } = renderHook(() => harness(colorants, additives));
    return result.current.insights.some((i) => i.code === 'colorant_also_additive');
  };

  it('fires when the same material carries a dose under both sections', () => {
    expect(fired([colorant({ catalogId: 'activated-charcoal', name: 'Activated charcoal' })])).toBe(true);
  });

  it('stays quiet for a colour left "to shade" — there is no second dose to add up', () => {
    expect(fired([colorant({ catalogId: 'activated-charcoal', name: 'Activated charcoal', percent: null, grams: null })])).toBe(false);
  });

  it('raises a bucket pairing as a question, never as a claim', () => {
    // "Clay (bentonite, kaolin)" covers nine clays. Dosing bentonite for slip and colouring
    // with dead sea mud may be two materials or one — the app cannot tell, so it asks.
    const clayAdditive = { ...charcoalAdditive, catalogId: 'clay', name: 'Clay (bentonite, kaolin)' };
    const { result } = renderHook(() => harness([colorant({ catalogId: 'kaolin-clay', name: 'Kaolin clay' })], [clayAdditive]));
    const msg = result.current.insights.find((i) => i.code === 'colorant_also_additive')!.message;
    expect(msg).toMatch(/if that is the same jar/);
    expect(msg).toContain('Clay (bentonite, kaolin)');
    // and it does not assert the doses add up, the way a one-to-one pairing does
    expect(msg).not.toMatch(/so the two doses add up/);
  });

  it('asserts the double dose only for a one-to-one pairing', () => {
    const { result } = renderHook(() => harness([colorant({ catalogId: 'activated-charcoal', name: 'Activated charcoal' })]));
    const msg = result.current.insights.find((i) => i.code === 'colorant_also_additive')!.message;
    expect(msg).toMatch(/so the two doses add up in the batch/);
    expect(msg).not.toMatch(/if that is the same jar/);
  });

  it('names a doubled material once, however many rows carry it', () => {
    const { result } = renderHook(() => harness([
      colorant({ key: 'c1', catalogId: 'activated-charcoal', name: 'Activated charcoal' }),
      colorant({ key: 'c2', catalogId: 'activated-charcoal', name: 'Activated charcoal' }),
    ]));
    const msg = result.current.insights.find((i) => i.code === 'colorant_also_additive')!.message;
    expect(msg.match(/Activated charcoal/g)).toHaveLength(1);
  });
});

describe('a colour dosed past its own sourced rate is flagged', () => {
  const lines = [makeLine('olive-oil', '700'), makeLine('coconut-oil-76', '300')];
  function harness(colorants: ComputedScentColor['colorants']) {
    const { properties, fattyAcids } = useRecipeProperties(lines, DEFAULT_SETTINGS);
    const { result } = useRecipeCalculation(lines, DEFAULT_SETTINGS, 'cp');
    return useFormulationInsights(lines, DEFAULT_SETTINGS, properties, fattyAcids, result, {
      process: 'cp',
      scentColor: { ...emptyComputedScentColor(), colorants },
    });
  }
  const colour = (over: Partial<ComputedScentColor['colorants'][number]>) => ({
    key: 'c1', catalogId: 'activated-charcoal', name: 'Activated charcoal', kind: 'natural' as const,
    percent: 1, grams: 10, portionKey: '', portionName: '', portionPercent: null,
    portionShareMissing: false, viaLye: false, mixedWith: 'oil' as const, stage: 'oils' as const,
    dispersal: { method: 'carrier-oil' as const, carrierGrams: 10 },
    ...over,
  });
  const msg = (colorants: ComputedScentColor['colorants']) => {
    const { result } = renderHook(() => harness(colorants));
    return result.current.insights.find((i) => i.code === 'colorant_over_sourced_rate')?.message;
  };

  it('fires above that material own ceiling, and names both figures', () => {
    // charcoal tops out at 3 tsp per lb of oils, printed as 2.6%
    const m = msg([colour({ percent: 5 })]);
    expect(m).toMatch(/Activated charcoal at 5\.00% against 2\.60%/);
    expect(m).toMatch(/washes out onto the tub/);
  });

  it('stays quiet inside the band, and at the ceiling itself', () => {
    expect(msg([colour({ percent: 2 })])).toBeUndefined();
    expect(msg([colour({ percent: 2.6 })])).toBeUndefined();
  });

  it('never fires on the figure the panel itself printed', () => {
    // The raw ceiling for a 1 tsp entry is 0.881849%, which prints as "0.9". Judging
    // against the raw figure told a maker who typed 0.9 that they had overdosed.
    expect(msg([colour({ catalogId: 'kaolin-clay', name: 'Kaolin clay', percent: 0.9 })])).toBeUndefined();
    // and the mica ladder's top rung prints 1.8 against a raw 1.7637
    expect(msg([colour({ catalogId: 'mica', name: 'Mica', percent: 1.8 })])).toBeUndefined();
  });

  it('says nothing in liquid soap, where the panel shows no band to exceed', () => {
    const lsHarness = (colorants: ComputedScentColor['colorants']) => {
      const { properties, fattyAcids } = useRecipeProperties(lines, DEFAULT_SETTINGS);
      const { result } = useRecipeCalculation(lines, DEFAULT_SETTINGS, 'cp');
      return useFormulationInsights(lines, DEFAULT_SETTINGS, properties, fattyAcids, result, {
        process: 'ls',
        scentColor: { ...emptyComputedScentColor(), colorants },
      });
    };
    const { result } = renderHook(() => lsHarness([colour({ percent: 20 })]));
    expect(result.current.insights.some((i) => i.code === 'colorant_over_sourced_rate')).toBe(false);
  });

  it('never fires for a custom colour, which has no sourced band to exceed', () => {
    expect(msg([colour({ catalogId: '', name: 'Mine', percent: 40 })])).toBeUndefined();
  });

  it('never fires for a colour the sources give no rate for', () => {
    expect(msg([colour({ catalogId: 'alkanet-root', name: 'Alkanet root', percent: 40 })])).toBeUndefined();
  });
});

describe('a purée colour in the lye is a liquid the water budget should know about', () => {
  const lines = [makeLine('olive-oil', '700'), makeLine('coconut-oil-76', '300')];
  const puree = (over: Partial<ComputedScentColor['colorants'][number]> = {}) => ({
    key: 'c1', catalogId: 'carrot-puree', name: 'Carrot puree', kind: 'natural' as const,
    percent: null, grams: null, portionKey: '', portionName: '', portionPercent: null,
    portionShareMissing: false, viaLye: true, mixedWith: 'oil' as const, stage: 'lye' as const,
    dispersal: { method: 'lye-solution' as const },
    ...over,
  });
  type Row = { addAt: 'lye' | 'oils' | 'trace'; grams: number | null; presetKey: string; sizeMode: 'percent_of_oils' | 'grams' | 'percent_of_liquid' | 'rest' };
  function harness(colorants: ComputedScentColor['colorants'], splitLiquidRows: Row[] = []) {
    const { properties, fattyAcids } = useRecipeProperties(lines, DEFAULT_SETTINGS);
    const { result } = useRecipeCalculation(lines, DEFAULT_SETTINGS, 'cp');
    return useFormulationInsights(lines, DEFAULT_SETTINGS, properties, fattyAcids, result, {
      process: 'cp',
      splitLiquidRows,
      scentColor: { ...emptyComputedScentColor(), colorants },
    });
  }
  const msg = (colorants: ComputedScentColor['colorants'], rows: Row[] = []) => {
    const { result } = renderHook(() => harness(colorants, rows));
    return result.current.insights.find((i) => i.code === 'colorant_puree_as_liquid')?.message;
  };
  const doubleMsg = (colorants: ComputedScentColor['colorants'], rows: Row[] = []) => {
    const { result } = renderHook(() => harness(colorants, rows));
    return result.current.insights.find((i) => i.code === 'colorant_liquid_double_count')?.message;
  };
  const carved: Row = { addAt: 'lye', grams: 120, presetKey: 'puree', sizeMode: 'percent_of_liquid' };
  const onTop: Row = { addAt: 'lye', grams: 120, presetKey: 'puree', sizeMode: 'grams' };

  it('says so while the purée is only a colour', () => {
    expect(msg([puree()])).toMatch(/Carrot puree \(as fruit or vegetable puree\)/);
    expect(msg([puree()])).toMatch(/comes out of the water budget/);
  });

  it('goes quiet once the liquid is carved out of the water budget', () => {
    expect(msg([puree()], [carved])).toBeUndefined();
    expect(msg([puree()], [{ ...carved, sizeMode: 'rest' }])).toBeUndefined();
    // A different liquid is not that liquid, and an unsized row has not changed the water.
    expect(msg([puree()], [{ ...carved, presetKey: 'milk' }])).toBeTruthy();
    expect(msg([puree()], [{ ...carved, grams: null }])).toBeTruthy();
  });

  it('keeps talking when the row was stacked ON TOP of the water instead of carved out', () => {
    // The two additive size modes leave the water exactly where it was, so the row exists
    // but the water figure is still the full plain-water figure — the case the notice is for.
    for (const sizeMode of ['grams', 'percent_of_oils'] as const) {
      const text = msg([puree()], [{ ...onTop, sizeMode }]);
      expect(text).toMatch(/on top of the water rather than out of it/);
      expect(text).toMatch(/% of total liquid/);
      // and it does not also give the "add it under Split liquid" advice for a row that exists
      expect(text).not.toMatch(/Add it under Split liquid/);
    }
    // One carved row settles it even beside a stacked one — the water did come out.
    expect(msg([puree()], [onTop, carved])).toBeUndefined();
  });

  it('asks about a double count when the same material is dosed here AND sized there', () => {
    // Dosed as a colour and entered as a liquid: both weights land in the batch.
    expect(doubleMsg([puree({ percent: 1, grams: 10 })], [carved]))
      .toMatch(/Carrot puree carries a dose here.*counted twice/);
    // The preset is a bucket — carrot the colour and pumpkin the liquid are not the same
    // jar — so it is put as a question, never as a statement.
    expect(doubleMsg([puree({ percent: 1, grams: 10 })], [carved])).toMatch(/if that is the same jar/);
    // An undosed colour adds no weight, and a colour with no liquid row cannot double up.
    expect(doubleMsg([puree()], [carved])).toBeUndefined();
    expect(doubleMsg([puree({ percent: 1, grams: 10 })], [])).toBeUndefined();
    // It does not depend on the lye route: the two weights add up wherever the colour goes.
    expect(doubleMsg([puree({ percent: 1, grams: 10, viaLye: false, stage: 'oils' })], [carved])).toBeTruthy();
  });

  it('says nothing about a purée that is not going through the lye', () => {
    expect(msg([puree({ viaLye: false, stage: 'oils' })])).toBeUndefined();
    // and nothing about a powder, which really does ride on top of the water
    expect(msg([puree({ catalogId: 'madder-root', name: 'Madder root' })])).toBeUndefined();
  });

  it('names each purée once, however many rows carry it', () => {
    const both = msg([puree(), puree({ key: 'c2' }), puree({ key: 'c3', catalogId: 'pumpkin-puree', name: 'Pumpkin puree' })]);
    expect(both!.match(/Carrot puree/g)).toHaveLength(1);
    expect(both).toMatch(/Pumpkin puree/);
  });
});
