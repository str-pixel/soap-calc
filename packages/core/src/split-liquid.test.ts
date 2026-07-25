import { describe, expect, it } from 'vitest';
import {
  lyeConcentrationPercent,
  lyeSolutionWaterStatus,
  suggestLyeWaterWithSplitLiquid,
} from './split-liquid.js';

describe('lyeConcentrationPercent', () => {
  it('computes lye share of the lye solution', () => {
    expect(lyeConcentrationPercent(135, 135)).toBeCloseTo(50, 1);
    expect(lyeConcentrationPercent(135, 330)).toBeCloseTo(29, 0);
  });
});

describe('suggestLyeWaterWithSplitLiquid', () => {
  it('suggests reduced lye water capped at 1:1 water:lye minimum', () => {
    const suggestion = suggestLyeWaterWithSplitLiquid({
      waterGrams: 330,
      lyeGrams: 135,
      totalOilGrams: 1000,
      splitLiquidGrams: 200,
      waterMode: 'percent_of_oils',
    });

    expect(suggestion).not.toBeNull();
    expect(suggestion!.reductionGrams).toBe(195);
    expect(suggestion!.suggestedWaterGrams).toBe(135);
    expect(suggestion!.suggestedWaterPercentOfOils).toBeCloseTo(13.5, 1);
  });

  it('returns null when split liquid is zero', () => {
    expect(
      suggestLyeWaterWithSplitLiquid({
        waterGrams: 330,
        lyeGrams: 135,
        totalOilGrams: 1000,
        splitLiquidGrams: 0,
        waterMode: 'percent_of_oils',
      }),
    ).toBeNull();
  });

  it('omits percent suggestion for non-percent water modes', () => {
    const suggestion = suggestLyeWaterWithSplitLiquid({
      waterGrams: 270,
      lyeGrams: 135,
      totalOilGrams: 1000,
      splitLiquidGrams: 50,
      waterMode: 'lye_water_ratio',
    });

    expect(suggestion!.suggestedWaterGrams).toBe(220);
    expect(suggestion!.suggestedWaterPercentOfOils).toBeNull();
  });
});

describe('lyeSolutionWaterStatus', () => {
  it('reports a shortfall when the liquid cannot dissolve the lye at the 1:1 floor', () => {
    // Greek yogurt as the entire lye liquid: 165 g at 81% water is only 133.65 g of
    // real water against a 135 g lye floor — the supersaturation trap.
    const status = lyeSolutionWaterStatus({
      waterGrams: 0,
      lyeGrams: 135,
      splitLiquidGrams: 165,
      waterFraction: 0.81,
    });
    expect(status).not.toBeNull();
    expect(status!.effectiveWaterGrams).toBeCloseTo(133.65, 2);
    expect(status!.floorGrams).toBe(135);
    expect(status!.shortfallGrams).toBeCloseTo(1.35, 2);
  });

  it('reports no shortfall when plain water already meets the floor', () => {
    const status = lyeSolutionWaterStatus({
      waterGrams: 135,
      lyeGrams: 135,
      splitLiquidGrams: 100,
      waterFraction: 0.81,
    });
    expect(status!.effectiveWaterGrams).toBeCloseTo(216, 0);
    expect(status!.shortfallGrams).toBe(0);
  });

  it('treats an unknown liquid as pure water (no false warnings for custom entries)', () => {
    const status = lyeSolutionWaterStatus({
      waterGrams: 100,
      lyeGrams: 135,
      splitLiquidGrams: 40,
      waterFraction: 1,
    });
    expect(status!.effectiveWaterGrams).toBe(140);
    expect(status!.shortfallGrams).toBe(0);
  });

  it('rejects invalid inputs', () => {
    expect(
      lyeSolutionWaterStatus({ waterGrams: -1, lyeGrams: 135, splitLiquidGrams: 10, waterFraction: 0.9 }),
    ).toBeNull();
    expect(
      lyeSolutionWaterStatus({ waterGrams: 100, lyeGrams: 0, splitLiquidGrams: 10, waterFraction: 0.9 }),
    ).toBeNull();
    expect(
      lyeSolutionWaterStatus({ waterGrams: 100, lyeGrams: 135, splitLiquidGrams: 10, waterFraction: 1.5 }),
    ).toBeNull();
  });
});

describe('lyeConcentrationPercent input guards (deep-review)', () => {
  it('rejects negative water instead of reporting impossible concentrations', () => {
    expect(lyeConcentrationPercent(135, -35)).toBeNull();
    expect(lyeConcentrationPercent(135, 0)).not.toBeNull();
  });
});
