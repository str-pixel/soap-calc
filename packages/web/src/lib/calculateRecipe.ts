import { calculateLye } from '@soap-calc/core';
import type { LyeCalculationResult } from '@soap-calc/core';
import type { RecipeLine, RecipeSettings } from './recipe';
import { OIL_LOOKUP, oilById } from './oils';
import { resolveLineWeights } from './resolveLineWeights';
import { parseRecipeSettings } from './parseRecipeSettings';
import type { ProcessId } from './process';

export type RecipeDisplayTotals = {
  recipeOilWeightGrams: number;
  excludedFromLyeOilWeightGrams: number;
  batchWeightGrams: number;
};

export type RecipeCalculation = {
  result: LyeCalculationResult | null;
  inputErrors: string[];
  linePercents: Map<string, number>;
  displayTotals: RecipeDisplayTotals | null;
};

export function calculateRecipe(
  lines: RecipeLine[],
  settings: RecipeSettings,
  process?: ProcessId,
): RecipeCalculation {
  const parsed = parseRecipeSettings(settings, { allowNegativeSuperfat: process === 'ls' });
  const inputErrors: string[] = parsed.ok ? [] : [...parsed.errors];

  const resolved = resolveLineWeights(lines, settings);

  for (const row of resolved.lines) {
    if (row.weightError) {
      const label = oilById(row.line.oilId)?.displayName ?? row.line.oilId;
      const message = `Invalid weight for ${label}`;
      if (!inputErrors.includes(message)) inputErrors.push(message);
    }
  }

  for (const err of resolved.errors) {
    if (!inputErrors.includes(err)) inputErrors.push(err);
  }

  if (inputErrors.length || !parsed.ok) {
    return { result: null, inputErrors, linePercents: new Map(), displayTotals: null };
  }

  const recipeOilWeightGrams = resolved.recipeOilWeightGrams;

  const oils = resolved.lines
    .map((row) => ({
      oilId: row.line.oilId,
      weightGrams: row.weightGrams,
      tarLyeTreatment: row.line.tarLyeTreatment,
    }))
    .filter((line) => line.weightGrams > 0);

  const linePercents = new Map(
    resolved.lines.map((row) => [
      row.line.key,
      recipeOilWeightGrams > 0 ? (row.weightGrams / recipeOilWeightGrams) * 100 : 0,
    ]),
  );

  const result = calculateLye({
    oils,
    oilLookup: OIL_LOOKUP,
    ...parsed.values,
  });

  const lyeIncludedOilWeightGrams = result.lines
    .filter((line) => line.includedInLye)
    .reduce((sum, line) => sum + line.weightGrams, 0);

  const excludedFromLyeOilWeightGrams = Math.max(
    0,
    recipeOilWeightGrams - lyeIncludedOilWeightGrams,
  );

  return {
    result,
    inputErrors: [],
    linePercents,
    displayTotals: {
      recipeOilWeightGrams,
      excludedFromLyeOilWeightGrams,
      batchWeightGrams:
        recipeOilWeightGrams + result.lyeWeightGrams + result.waterWeightGrams,
    },
  };
}
