import type { LyeType, WaterMode } from '@soap-calc/core';
import type { RecipeSettings } from './recipe';

const MAX_SUPERFAT = 50;

export type ParsedSettings = {
  superfatPercent: number;
  lyeType: LyeType;
  waterMode: WaterMode;
  kohBlendPercent?: number;
  naohPurityPercent?: number;
  kohPurityPercent?: number;
  waterPercentOfOils?: number;
  lyeConcentrationPercent?: number;
  lyeWaterRatio?: number;
};

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

  if (settings.waterPercentOfOils === '') {
    return { waterMode: 'percent_of_oils', waterPercentOfOils: undefined };
  }
  const water = parseNonNegative(settings.waterPercentOfOils, 'water %');
  if (water.error) errors.push(water.error);
  return {
    waterMode: 'percent_of_oils',
    waterPercentOfOils: water.n ?? undefined,
  };
}

export function parseRecipeSettings(settings: RecipeSettings): {
  values: ParsedSettings | null;
  errors: string[];
} {
  const errors: string[] = [];

  const superfat = parseNonNegative(settings.superfatPercent, 'superfat %');
  if (superfat.error) errors.push(superfat.error);
  else if (superfat.n! > MAX_SUPERFAT) {
    errors.push(`Superfat must be between 0 and ${MAX_SUPERFAT}`);
  }

  const naohPurity = parsePurity(settings.naohPurityPercent, 'NaOH purity %');
  const kohPurity = parsePurity(settings.kohPurityPercent, 'KOH purity %');
  if (settings.lyeType === 'naoh' && naohPurity.error) errors.push(naohPurity.error);
  if (settings.lyeType === 'koh' && kohPurity.error) errors.push(kohPurity.error);

  let blend: { n: number | null; error?: string } | undefined;
  if (settings.lyeType === 'dual') {
    if (naohPurity.error) errors.push(naohPurity.error);
    if (kohPurity.error) errors.push(kohPurity.error);
    blend = parseNonNegative(settings.kohBlendPercent, 'KOH blend %');
    if (blend.error) errors.push(blend.error);
    else if (blend.n! > 50) errors.push('KOH blend % must be between 0 and 50');
  }

  const waterParams = waterInput(settings, errors);

  if (errors.length) {
    return { values: null, errors };
  }

  return {
    values: {
      superfatPercent: superfat.n!,
      lyeType: settings.lyeType,
      waterMode: waterParams.waterMode,
      kohBlendPercent: settings.lyeType === 'dual' ? blend!.n ?? undefined : undefined,
      naohPurityPercent: naohPurity.n ?? undefined,
      kohPurityPercent: kohPurity.n ?? undefined,
      waterPercentOfOils: waterParams.waterPercentOfOils,
      lyeConcentrationPercent: waterParams.lyeConcentrationPercent,
      lyeWaterRatio: waterParams.lyeWaterRatio,
    },
    errors: [],
  };
}
