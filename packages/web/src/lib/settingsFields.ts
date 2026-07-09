import type { RecipeSettings } from './recipe';

type NumericFieldSpec = { key: keyof RecipeSettings; label: string; min: number; max?: number; step: number };

export const PURITY_FIELDS = {
  naoh: { key: 'naohPurityPercent', label: 'NaOH purity %', min: 1, max: 100, step: 0.1 },
  koh: { key: 'kohPurityPercent', label: 'KOH purity %', min: 1, max: 100, step: 0.1 },
} satisfies Record<'naoh' | 'koh', NumericFieldSpec>;

export function purityFieldsFor(lyeType: RecipeSettings['lyeType']): NumericFieldSpec[] {
  if (lyeType === 'naoh') return [PURITY_FIELDS.naoh];
  if (lyeType === 'koh') return [PURITY_FIELDS.koh];
  return [PURITY_FIELDS.naoh, PURITY_FIELDS.koh];
}

export const WATER_FIELDS = {
  percent_of_oils: { key: 'waterPercentOfOils', label: 'Water % of oils', min: 0, step: 1 },
  lye_concentration: { key: 'lyeConcentrationPercent', label: 'Lye concentration %', min: 0.1, max: 99.9, step: 0.1 },
  lye_water_ratio: { key: 'lyeWaterRatio', label: 'Water : lye ratio', min: 0.1, step: 0.1 },
} satisfies Record<RecipeSettings['waterMode'], NumericFieldSpec>;
