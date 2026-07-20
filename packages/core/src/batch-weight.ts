export interface BatchWeightInput {
  oilGrams: number;
  lyeGrams: number;
  waterGrams: number;
  /** additives + split-liquid + post-cook superfat (the app's extrasGrams) */
  extrasGrams: number;
}

export interface BatchWeightBreakdown {
  oils: number;
  lye: number;
  water: number;
  extras: number;
  total: number;
}

const clamp = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

export function batchWeightBreakdown(input: BatchWeightInput): BatchWeightBreakdown {
  const oils = clamp(input.oilGrams);
  const lye = clamp(input.lyeGrams);
  const water = clamp(input.waterGrams);
  const extras = clamp(input.extrasGrams);
  return { oils, lye, water, extras, total: oils + lye + water + extras };
}
