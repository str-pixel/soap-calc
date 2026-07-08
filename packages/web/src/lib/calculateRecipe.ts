import { calculateLye } from '@soap-calc/core';
import type { LyeCalculationResult, WaterMode } from '@soap-calc/core';
import type { RecipeLine, RecipeSettings } from './recipe';
import { OIL_LOOKUP, oilById } from './oils';
import { resolveLineWeights } from './resolveLineWeights';

const MAX_SUPERFAT = 50;

function parseNonNegative(value: string, label: string): { n: number | null; error?: string } {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return { n: null, error: `Invalid ${label}` };
  }
  return { n };
}

function parsePositive(value: string, label: string): { n: number | null; error?: string } {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return { n: null, error: `${label} must be greater than 0` };
  }
  return { n };
}

function parsePurity(value: string, label: string): { n: number | null; error?: string } {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 100) {
    return { n: null, error: `${label} must be between 1 and 100` };
  }
  return { n };
}

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

function waterInput(
  settings: RecipeSettings,
  errors: string[],
): {
  waterMode: WaterMode;
  waterPercentOfOils?: number;
  lyeConcentrationPercent?: number;
  lyeWaterRatio?: number;
} {
  const waterMode = settings.waterMode;

  if (waterMode === 'lye_concentration') {
    const conc = parsePositive(settings.lyeConcentrationPercent, 'Lye concentration %');
    if (settings.lyeConcentrationPercent !== '' && conc.error) errors.push(conc.error);
    else if (conc.n !== null && conc.n >= 100) {
      errors.push('Lye concentration % must be less than 100');
    }
    return {
      waterMode,
      lyeConcentrationPercent: conc.n ?? undefined,
    };
  }

  if (waterMode === 'lye_water_ratio') {
    const ratio = parsePositive(settings.lyeWaterRatio, 'Water : lye ratio');
    if (settings.lyeWaterRatio !== '' && ratio.error) errors.push(ratio.error);
    return {
      waterMode,
      lyeWaterRatio: ratio.n ?? undefined,
    };
  }

  const water = parseNonNegative(settings.waterPercentOfOils, 'water %');
  if (water.error) errors.push(water.error);
  return {
    waterMode: 'percent_of_oils',
    waterPercentOfOils: water.n ?? undefined,
  };
}

export function calculateRecipe(
  lines: RecipeLine[],
  settings: RecipeSettings,
): RecipeCalculation {
  const inputErrors: string[] = [];

  const superfat = parseNonNegative(settings.superfatPercent, 'superfat %');
  if (superfat.error) inputErrors.push(superfat.error);
  else if (superfat.n! > MAX_SUPERFAT) {
    inputErrors.push(`Superfat must be between 0 and ${MAX_SUPERFAT}`);
  }

  const naohPurity = parsePurity(settings.naohPurityPercent, 'NaOH purity %');
  const kohPurity = parsePurity(settings.kohPurityPercent, 'KOH purity %');
  if (settings.lyeType === 'naoh' && naohPurity.error) inputErrors.push(naohPurity.error);
  if (settings.lyeType === 'koh' && kohPurity.error) inputErrors.push(kohPurity.error);
  if (settings.lyeType === 'dual') {
    if (naohPurity.error) inputErrors.push(naohPurity.error);
    if (kohPurity.error) inputErrors.push(kohPurity.error);
    const blend = parseNonNegative(settings.kohBlendPercent, 'KOH blend %');
    if (blend.error) inputErrors.push(blend.error);
    else if (blend.n! > 50) inputErrors.push('KOH blend % must be between 0 and 50');
  }

  const waterParams = waterInput(settings, inputErrors);
  const resolved = resolveLineWeights(lines, settings);

  for (const row of resolved.lines) {
    if (row.weightError) {
      const label = oilById(row.line.oilId)?.displayName ?? row.line.oilId;
      inputErrors.push(`Invalid weight for ${label}`);
    }
  }

  for (const err of resolved.errors) {
    if (!inputErrors.includes(err)) inputErrors.push(err);
  }

  if (inputErrors.length) {
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
    superfatPercent: superfat.n!,
    lyeType: settings.lyeType,
    kohBlendPercent:
      settings.lyeType === 'dual' ? Number(settings.kohBlendPercent) || 0 : undefined,
    naohPurityPercent: naohPurity.n!,
    kohPurityPercent: kohPurity.n!,
    ...waterParams,
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
