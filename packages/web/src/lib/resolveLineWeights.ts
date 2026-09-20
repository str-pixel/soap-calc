import type { RecipeLine, RecipeSettings } from './recipe';

function parseNonNegative(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export type ResolvedLine = {
  line: RecipeLine;
  weightGrams: number;
  weightError?: string;
};

export type ResolvedWeights = {
  lines: ResolvedLine[];
  recipeOilWeightGrams: number;
};

export function resolveLineWeights(
  lines: RecipeLine[],
  _settings: RecipeSettings,
): ResolvedWeights {
  const resolved = lines.map((line) => {
    const weightGrams = parseNonNegative(line.weightGrams);
    const weightError =
      line.weightGrams !== '' && weightGrams === null ? 'Invalid weight' : undefined;
    return {
      line,
      weightGrams: weightGrams ?? 0,
      weightError,
    };
  });

  const recipeOilWeightGrams = resolved.reduce(
    (sum, row) => sum + (row.weightGrams > 0 ? row.weightGrams : 0),
    0,
  );

  return { lines: resolved, recipeOilWeightGrams };
}
