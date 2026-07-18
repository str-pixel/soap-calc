/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  DEFAULT_SETTINGS,
  DEFAULT_SPLIT_LIQUID,
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
  it('excludes split liquid added in lye water', () => {
    expect(
      totalAdditivePercentForInsights([{ grams: 50 }], 1000, {
        ...DEFAULT_SPLIT_LIQUID, enabled: true, percentOfOil: '25', addAt: 'lye',
      }),
    ).toBe(5);
  });
  it('includes split liquid added at trace', () => {
    expect(
      totalAdditivePercentForInsights([{ grams: 50 }], 1000, {
        ...DEFAULT_SPLIT_LIQUID, enabled: true, percentOfOil: '8', addAt: 'trace',
      }),
    ).toBe(13);
  });
  it('sums additive grams as oil-equivalent percent regardless of dose basis/unit', () => {
    // a batch/ppt line contributes grams/oil*100, not its raw amount
    expect(
      totalAdditivePercentForInsights([{ grams: 30 }, { grams: 3 }], 1000, { ...DEFAULT_SPLIT_LIQUID }),
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
  it('returns the oil linoleic+linolenic total, undefined for unknown oil', () => {
    const coconut = postCookSuperfatPufaPercent('coconut-oil-76');
    expect(coconut).toBeDefined();
    expect(coconut!).toBeLessThan(30); // coconut is low-PUFA
    expect(postCookSuperfatPufaPercent('not-an-oil')).toBeUndefined();
  });
});

function makeLine(oilId: string, weightGrams: string): RecipeLine {
  return { key: newLineKey(), oilId, weightGrams };
}

// Composes the same hooks useRecipeViewModel wires together (properties + fatty acids +
// lye calc feed useFormulationInsights), so this exercises the real trace-speed wiring
// end to end rather than hand-building a FormulationAnalysisInput.
function useTraceSpeedTestHarness(lines: RecipeLine[], isLiquidSoap = false) {
  const { properties, fattyAcids } = useRecipeProperties(lines, DEFAULT_SETTINGS);
  const { result } = useRecipeCalculation(lines, DEFAULT_SETTINGS, 'cp');
  return useFormulationInsights(lines, DEFAULT_SETTINGS, properties, fattyAcids, result, {
    isLiquidSoap,
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
    const { result } = renderHook(() => useTraceSpeedTestHarness(hardLines, true));
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
    isLiquidSoap: process === 'ls',
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
    // This is the exact bug the process discriminator prevents: CP is also
    // !isLiquidSoap, so a gate written as !isLiquidSoap would wrongly fire here too.
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

describe('useFormulationInsights sugar aggregator (Step 3b)', () => {
  const lines = [makeLine('olive-oil', '700'), makeLine('coconut-oil-76', '300')];

  it('fires sugar_total_high exactly once when two sugar-family additives sum past 4%', () => {
    const { result } = renderHook(() =>
      useProcessWiringHarness(lines, 'cp', [sugarLine('3'), honeyLine('2')]),
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
