import type { LyeType, WaterMode } from '@soap-calc/core';
import type { RecipeSettings } from './recipe';
import { PROCESS_DEFINITIONS, type ProcessId } from './process';

/**
 * Keys of RecipeSettings whose value type is exactly `string` — the only fields a
 * free-text numeric input may bind to. `string extends T` (not `T extends string`)
 * excludes the enum/union fields (weightUnit/lyeType/waterMode) and object fields
 * (splitLiquid), so only genuine free-text string fields qualify.
 */
type SettingsNumericKey = {
  [K in keyof RecipeSettings]: string extends RecipeSettings[K] ? K : never;
}[keyof RecipeSettings];

type NumericFieldSpec = {
  key: SettingsNumericKey;
  label: string;
  min: number;
  max?: number;
  step: number;
  help?: string;
};

export const PURITY_FIELDS = {
  naoh: {
    key: 'naohPurityPercent',
    label: 'NaOH purity %',
    min: 1,
    max: 100,
    step: 0.1,
    help: 'The percent of actual sodium hydroxide in your lye. Lower it if your supplier’s lye isn’t 100% pure.',
  },
  koh: {
    key: 'kohPurityPercent',
    label: 'KOH purity %',
    min: 1,
    max: 100,
    step: 0.1,
    help: 'The percent of actual potassium hydroxide in your lye — flake KOH is often around 90%.',
  },
} satisfies Record<'naoh' | 'koh', NumericFieldSpec>;

export function purityFieldsFor(lyeType: RecipeSettings['lyeType']): NumericFieldSpec[] {
  if (lyeType === 'naoh') return [PURITY_FIELDS.naoh];
  if (lyeType === 'koh') return [PURITY_FIELDS.koh];
  return [PURITY_FIELDS.naoh, PURITY_FIELDS.koh];
}

export const WATER_FIELDS = {
  percent_of_oils: {
    key: 'waterPercentOfOils',
    label: 'Water % of oils',
    min: 0,
    step: 1,
    help: 'Total water as a percent of oil weight. More water gives a thinner batter and a longer cure.',
  },
  lye_concentration: {
    key: 'lyeConcentrationPercent',
    label: 'Lye concentration %',
    min: 0.1,
    max: 99.9,
    step: 0.1,
    help: 'Lye as a percent of the lye-water solution. Higher means less water, a harder bar, and faster trace.',
  },
  lye_water_ratio: {
    key: 'lyeWaterRatio',
    label: 'Water : lye ratio',
    min: 0.1,
    step: 0.1,
    help: 'Parts of water per part of lye. A lower ratio means less water and a batter that traces faster.',
  },
} satisfies Record<RecipeSettings['waterMode'], NumericFieldSpec>;

export const LYE_TYPE_LABELS: Record<LyeType, string> = {
  naoh: 'NaOH (bar soap)',
  koh: 'KOH (liquid soap)',
  dual: 'NaOH + KOH blend',
};

export const WATER_MODE_LABELS: Record<WaterMode, string> = {
  percent_of_oils: '% of oils',
  lye_concentration: 'Lye concentration %',
  lye_water_ratio: 'Water : lye ratio',
};

export function lyeChoicesFor(process: ProcessId): LyeType[] {
  return PROCESS_DEFINITIONS[process].lyeChoices;
}

export function waterModeChoicesFor(process: ProcessId): WaterMode[] {
  return PROCESS_DEFINITIONS[process].waterModeChoices;
}
