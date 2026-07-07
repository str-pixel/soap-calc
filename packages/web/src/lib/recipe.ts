import type { AdditiveStage, TarLyeTreatment, WaterMode } from '@soap-calc/core';
import { isWeightUnit, type WeightUnit } from './weightUnits';

export type { WeightUnit };

export type RecipeLine = {
  key: string;
  oilId: string;
  weightGrams: string;
  weightPercent?: string;
  tarLyeTreatment?: TarLyeTreatment;
};

export type AdditiveLine = {
  key: string;
  catalogId: string;
  name: string;
  percentOfOil: string;
  addAt: AdditiveStage;
};

export type SplitLiquidSettings = {
  enabled: boolean;
  name: string;
  percentOfOil: string;
  addAt: 'lye' | 'oils' | 'trace';
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
  splitLiquid: SplitLiquidSettings;
};

export function newLineKey(): string {
  return `line-${crypto.randomUUID()}`;
}

export function newAdditiveKey(): string {
  return `additive-${crypto.randomUUID()}`;
}

export const DEFAULT_SPLIT_LIQUID: SplitLiquidSettings = {
  enabled: false,
  name: '',
  percentOfOil: '',
  addAt: 'trace',
};

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
  splitLiquid: { ...DEFAULT_SPLIT_LIQUID },
};

export function normalizeSplitLiquid(
  partial: Partial<SplitLiquidSettings> | null | undefined,
): SplitLiquidSettings {
  const addAt =
    partial?.addAt === 'lye' || partial?.addAt === 'oils' || partial?.addAt === 'trace'
      ? partial.addAt
      : DEFAULT_SPLIT_LIQUID.addAt;
  return {
    enabled: partial?.enabled === true,
    name: typeof partial?.name === 'string' ? partial.name : '',
    percentOfOil: typeof partial?.percentOfOil === 'string' ? partial.percentOfOil : '',
    addAt,
  };
}

export function normalizeSettings(
  partial: Partial<RecipeSettings> | null | undefined,
): RecipeSettings {
  const weightUnit = isWeightUnit(partial?.weightUnit)
    ? partial.weightUnit
    : DEFAULT_SETTINGS.weightUnit;
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    weightUnit,
    splitLiquid: normalizeSplitLiquid(partial?.splitLiquid),
  };
}

export function createEmptyAdditives(): AdditiveLine[] {
  return [];
}

export function normalizeAdditiveLine(
  partial: Partial<AdditiveLine> & Pick<AdditiveLine, 'key'>,
): AdditiveLine {
  const addAt =
    partial.addAt === 'lye' ||
    partial.addAt === 'oils' ||
    partial.addAt === 'trace' ||
    partial.addAt === 'top'
      ? partial.addAt
      : 'trace';
  return {
    key: partial.key,
    catalogId: typeof partial.catalogId === 'string' ? partial.catalogId : '',
    name: typeof partial.name === 'string' ? partial.name : '',
    percentOfOil: typeof partial.percentOfOil === 'string' ? partial.percentOfOil : '',
    addAt,
  };
}

export function additivesFromSaved(
  saved: Array<Omit<AdditiveLine, 'key'>> | undefined,
): AdditiveLine[] {
  if (!saved?.length) return createEmptyAdditives();
  return saved.map((line) =>
    normalizeAdditiveLine({
      key: newAdditiveKey(),
      catalogId: line.catalogId,
      name: line.name,
      percentOfOil: line.percentOfOil,
      addAt: line.addAt,
    }),
  );
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
