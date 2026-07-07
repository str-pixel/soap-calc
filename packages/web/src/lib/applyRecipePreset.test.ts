import { describe, expect, it } from 'vitest';
import { RECIPE_PRESETS } from '../data/recipe-presets';
import { calculateRecipe } from './calculateRecipe';
import { applyRecipePreset } from './applyRecipePreset';
import { oilById } from './oils';

describe('applyRecipePreset', () => {
  for (const preset of RECIPE_PRESETS) {
    it(`loads and calculates ${preset.id}`, () => {
      for (const line of preset.lines) {
        expect(oilById(line.oilId), `${line.oilId} missing from oil DB`).toBeDefined();
      }

      const applied = applyRecipePreset(preset);
      const percentTotal = applied.lines.reduce(
        (sum, line) => sum + Number(line.weightPercent ?? 0),
        0,
      );
      expect(percentTotal).toBeCloseTo(100, 5);

      const { result, inputErrors } = calculateRecipe(applied.lines, applied.settings);
      expect(inputErrors).toHaveLength(0);
      expect(result).not.toBeNull();
      expect(result!.errors).toHaveLength(0);
      expect(result!.lyeWeightGrams).toBeGreaterThan(0);
    });
  }

  it('enables split liquid on goat milk preset', () => {
    const applied = applyRecipePreset(RECIPE_PRESETS.find((p) => p.id === 'goat-milk-bar')!);
    expect(applied.settings.splitLiquid.enabled).toBe(true);
    expect(applied.settings.splitLiquid.name).toBe('Goat milk');
  });
});
