import {
  additivesFromSaved,
  createEmptyAdditives,
  migrateRecipeLines,
  newLineKey,
  normalizeSettings,
  normalizeSplitLiquid,
  type AdditiveLine,
  type RecipeLine,
  type RecipeSettings,
} from './recipe';
import type { RecipePreset } from '../data/recipe-presets';

export type AppliedRecipePreset = {
  name: string;
  lines: RecipeLine[];
  settings: RecipeSettings;
  additives: AdditiveLine[];
};

export function applyRecipePreset(preset: RecipePreset): AppliedRecipePreset {
  const { splitLiquid: splitLiquidPartial, ...restSettings } = preset.settings;
  const settings = normalizeSettings({
    ...restSettings,
    batchOilGrams: preset.batchOilGrams,
    splitLiquid: normalizeSplitLiquid(splitLiquidPartial),
  });

  const lines: RecipeLine[] = preset.lines.map((line) => ({
    key: newLineKey(),
    oilId: line.oilId,
    weightGrams: '',
    weightPercent: line.weightPercent,
  }));

  const migratedLines = migrateRecipeLines(lines, settings);
  const additives = preset.additives?.length
    ? additivesFromSaved(preset.additives)
    : createEmptyAdditives();

  return {
    name: preset.name,
    lines: migratedLines,
    settings,
    additives,
  };
}
