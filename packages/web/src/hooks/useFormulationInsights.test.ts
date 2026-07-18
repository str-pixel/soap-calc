/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { DEFAULT_SETTINGS, DEFAULT_SPLIT_LIQUID, newLineKey, type RecipeLine } from '../lib/recipe';
import { useRecipeProperties } from './useRecipeProperties';
import { useRecipeCalculation } from './useRecipeCalculation';
import {
  postCookSuperfatPufaPercent,
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
