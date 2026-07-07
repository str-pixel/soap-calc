import type { RecipeLine, RecipeSettings } from './recipe';

function parseNonNegative(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export type ResolvedLine = {
  line: RecipeLine;
  weightGrams: number;
  weightPercent: number;
  weightError?: string;
};

export type ResolvedWeights = {
  lines: ResolvedLine[];
  recipeOilWeightGrams: number;
  errors: string[];
};

export function resolveLineWeights(
  lines: RecipeLine[],
  settings: RecipeSettings,
): ResolvedWeights {
  const errors: string[] = [];

  if (settings.entryMode === 'grams') {
    const resolved = lines.map((line) => {
      const weightGrams = parseNonNegative(line.weightGrams);
      const weightError =
        line.weightGrams !== '' && weightGrams === null ? 'Invalid weight' : undefined;
      return {
        line,
        weightGrams: weightGrams ?? 0,
        weightPercent: 0,
        weightError,
      };
    });

    const recipeOilWeightGrams = resolved.reduce(
      (sum, row) => sum + (row.weightGrams > 0 ? row.weightGrams : 0),
      0,
    );

    for (const row of resolved) {
      row.weightPercent =
        recipeOilWeightGrams > 0 && row.weightGrams > 0
          ? (row.weightGrams / recipeOilWeightGrams) * 100
          : 0;
    }

    return { lines: resolved, recipeOilWeightGrams, errors };
  }

  const batchGrams = parseNonNegative(settings.batchOilGrams);
  if (settings.batchOilGrams !== '' && batchGrams === null) {
    errors.push('Invalid batch oil weight');
  } else if (batchGrams !== null && batchGrams <= 0) {
    errors.push('Batch oil weight must be greater than 0');
  }

  const resolved = lines.map((line) => {
    const percent = parseNonNegative(line.weightPercent ?? '');
    const weightError =
      (line.weightPercent ?? '') !== '' && percent === null ? 'Invalid percent' : undefined;

    const weightPercent = percent ?? 0;
    const weightGrams =
      batchGrams && batchGrams > 0 ? (batchGrams * weightPercent) / 100 : 0;

    return {
      line,
      weightGrams,
      weightPercent,
      weightError,
    };
  });

  const hasPercentErrors = resolved.some((row) => row.weightError);
  const percentTotal = resolved.reduce((sum, row) => sum + row.weightPercent, 0);
  if (!hasPercentErrors && Math.abs(percentTotal - 100) > 0.05) {
    errors.push('Oil percentages must total 100%');
  }

  const recipeOilWeightGrams =
    batchGrams && batchGrams > 0
      ? batchGrams
      : resolved.reduce((sum, row) => sum + (row.weightGrams > 0 ? row.weightGrams : 0), 0);

  return { lines: resolved, recipeOilWeightGrams, errors };
}
