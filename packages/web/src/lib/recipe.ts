import type { TarLyeTreatment, WaterMode } from '@soap-calc/core';
import { isWeightUnit, type WeightUnit } from './weightUnits';

export type { WeightUnit };

export type RecipeLine = {
  key: string;
  oilId: string;
  weightGrams: string;
  weightPercent?: string;
  tarLyeTreatment?: TarLyeTreatment;
};

export type RecipeSettings = {
  weightUnit: WeightUnit;
  batchOilGrams: string;
  superfatPercent: string;
  lyeType: 'naoh' | 'koh';
  waterMode: WaterMode;
  waterPercentOfOils: string;
  lyeConcentrationPercent: string;
  lyeWaterRatio: string;
  naohPurityPercent: string;
  kohPurityPercent: string;
};

export function newLineKey(): string {
  return `line-${crypto.randomUUID()}`;
}

export const DEFAULT_SETTINGS: RecipeSettings = {
  weightUnit: 'g',
  batchOilGrams: '1000',
  superfatPercent: '5',
  lyeType: 'naoh',
  waterMode: 'percent_of_oils',
  waterPercentOfOils: '33',
  lyeConcentrationPercent: '33.33',
  lyeWaterRatio: '2',
  naohPurityPercent: '100',
  kohPurityPercent: '90',
};

export function normalizeSettings(
  partial: Partial<RecipeSettings> | null | undefined,
): RecipeSettings {
  const weightUnit = isWeightUnit(partial?.weightUnit)
    ? partial.weightUnit
    : DEFAULT_SETTINGS.weightUnit;
  return { ...DEFAULT_SETTINGS, ...partial, weightUnit };
}

export function migrateRecipeLines(
  lines: RecipeLine[],
  settings: Pick<RecipeSettings, 'batchOilGrams'>,
): RecipeLine[] {
  const batch = Number(settings.batchOilGrams);
  if (!Number.isFinite(batch) || batch <= 0) return lines;
  return lines.map((line) => {
    if (line.weightGrams !== '' || !line.weightPercent) return line;
    const pct = Number(line.weightPercent);
    if (!Number.isFinite(pct) || pct <= 0) return line;
    return { ...line, weightGrams: String(Math.round((batch * pct) / 100)) };
  });
}

export function createStarterLines(): RecipeLine[] {
  return [
    { key: newLineKey(), oilId: 'olive-oil', weightGrams: '450', weightPercent: '45' },
    { key: newLineKey(), oilId: 'coconut-oil-76', weightGrams: '250', weightPercent: '25' },
    { key: newLineKey(), oilId: 'shea-butter', weightGrams: '300', weightPercent: '30' },
  ];
}

/** @deprecated Use createStarterLines() — keys must be unique per instance. */
export const STARTER_LINES: RecipeLine[] = createStarterLines();
