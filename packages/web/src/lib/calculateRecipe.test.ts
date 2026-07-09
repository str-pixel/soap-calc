import { describe, expect, it } from 'vitest';
import { calculateRecipe } from './calculateRecipe';
import { createStarterLines, DEFAULT_SETTINGS } from './recipe';

const STARTER_LINES = createStarterLines();

describe('calculateRecipe', () => {
  it('calculates starter recipe NaOH with 5% superfat', () => {
    const { result, inputErrors, displayTotals } = calculateRecipe(STARTER_LINES, DEFAULT_SETTINGS);
    expect(inputErrors).toHaveLength(0);
    expect(result).not.toBeNull();
    expect(result!.totalOilWeightGrams).toBe(1000);
    expect(result!.lyeWeightGrams).toBeGreaterThan(100);
    expect(result!.errors).toHaveLength(0);
    expect(displayTotals!.recipeOilWeightGrams).toBe(1000);
    expect(displayTotals!.excludedFromLyeOilWeightGrams).toBe(0);
  });

  it('reports unknown oil as line error but still calculates valid oils', () => {
    const lines = [
      { key: 'a', oilId: 'not-real', weightGrams: '200' },
      { key: 'b', oilId: 'olive-oil', weightGrams: '800' },
    ];
    const { result, linePercents, displayTotals } = calculateRecipe(lines, DEFAULT_SETTINGS);
    expect(result!.errors).toContain('Unknown oil id: not-real');
    expect(result!.totalOilWeightGrams).toBe(800);
    expect(result!.lyeWeightGrams).toBeGreaterThan(0);
    expect(linePercents.get('a')).toBeCloseTo(20, 1);
    expect(linePercents.get('b')).toBeCloseTo(80, 1);
    expect(displayTotals!.recipeOilWeightGrams).toBe(1000);
    expect(displayTotals!.excludedFromLyeOilWeightGrams).toBe(200);
  });

  it('excludes birch tar from lye when additive', () => {
    const withTar = calculateRecipe(
      [
        { key: 'a', oilId: 'olive-oil', weightGrams: '900' },
        { key: 'b', oilId: 'birch-tar', weightGrams: '100', tarLyeTreatment: 'additive' },
      ],
      DEFAULT_SETTINGS,
    );
    const withoutTar = calculateRecipe(
      [{ key: 'a', oilId: 'olive-oil', weightGrams: '900' }],
      DEFAULT_SETTINGS,
    );
    expect(withTar.result!.lyeWeightGrams).toBeCloseTo(withoutTar.result!.lyeWeightGrams, 1);
    expect(withTar.displayTotals!.recipeOilWeightGrams).toBe(1000);
    expect(withTar.displayTotals!.excludedFromLyeOilWeightGrams).toBe(100);
  });

  it('rejects zero NaOH purity', () => {
    const { inputErrors, result } = calculateRecipe(STARTER_LINES, {
      ...DEFAULT_SETTINGS,
      naohPurityPercent: '0',
    });
    expect(inputErrors.some((e) => e.includes('NaOH purity'))).toBe(true);
    expect(result).toBeNull();
  });

  it('rejects invalid oil line weights', () => {
    const { inputErrors, result } = calculateRecipe(
      [{ key: 'a', oilId: 'olive-oil', weightGrams: '-10' }],
      DEFAULT_SETTINGS,
    );
    expect(inputErrors.some((e) => e.includes('Invalid weight'))).toBe(true);
    expect(result).toBeNull();
  });

  it('returns empty hint state when no weights entered', () => {
    const { result, displayTotals } = calculateRecipe(
      [{ key: 'a', oilId: 'olive-oil', weightGrams: '' }],
      DEFAULT_SETTINGS,
    );
    expect(result!.totalOilWeightGrams).toBe(0);
    expect(result!.lyeWeightGrams).toBe(0);
    expect(displayTotals!.recipeOilWeightGrams).toBe(0);
  });

  it('calculates water from lye concentration mode', () => {
    const { result } = calculateRecipe(STARTER_LINES, {
      ...DEFAULT_SETTINGS,
      waterMode: 'lye_concentration',
      lyeConcentrationPercent: '33.33',
    });
    expect(result!.waterWeightGrams).toBeCloseTo(result!.lyeWeightGrams * 2, 0);
  });

  it('calculates water from lye : water ratio mode', () => {
    const { result } = calculateRecipe(STARTER_LINES, {
      ...DEFAULT_SETTINGS,
      waterMode: 'lye_water_ratio',
      lyeWaterRatio: '2.5',
    });
    expect(result!.waterWeightGrams).toBeCloseTo(result!.lyeWeightGrams * 2.5, 0);
  });

  it('calculates from synced weight and percent values', () => {
    const lines = [
      { key: 'a', oilId: 'olive-oil', weightGrams: '700', weightPercent: '70' },
      { key: 'b', oilId: 'coconut-oil-76', weightGrams: '300', weightPercent: '30' },
    ];
    const { result, displayTotals } = calculateRecipe(lines, DEFAULT_SETTINGS);
    expect(result!.totalOilWeightGrams).toBe(1000);
    expect(displayTotals!.recipeOilWeightGrams).toBe(1000);
    expect(result!.lyeWeightGrams).toBeGreaterThan(0);
  });

  it('calculates dual NaOH + KOH blend', () => {
    const { result, inputErrors } = calculateRecipe(STARTER_LINES, {
      ...DEFAULT_SETTINGS,
      lyeType: 'dual',
      kohBlendPercent: '5',
    });
    expect(inputErrors).toHaveLength(0);
    expect(result).not.toBeNull();
    expect(result!.naohWeightGrams).toBeGreaterThan(0);
    expect(result!.kohWeightGrams).toBeGreaterThan(0);
    expect((result!.kohWeightGrams / result!.lyeWeightGrams) * 100).toBeCloseTo(5, 1);
  });

  it('falls back to the default water % when the Water% field is cleared', () => {
    const lines = [{ key: 'a', oilId: 'olive-oil', weightGrams: '1000', weightPercent: '100' }];
    const settings = {
      ...DEFAULT_SETTINGS,
      waterMode: 'percent_of_oils' as const,
      batchOilGrams: '1000',
      waterPercentOfOils: '',
    };
    const { result, inputErrors } = calculateRecipe(lines, settings);
    expect(inputErrors).toHaveLength(0);
    expect(result?.waterWeightGrams).toBeCloseTo(330, 0);
  });
});
