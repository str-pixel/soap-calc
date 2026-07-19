import { WEIGHT_UNITS } from './weightUnits';

/** Grams per US teaspoon for typical additive densities — verified (roadmap CP 308). */
export const GRAMS_PER_TSP = 4.1;

/**
 * teaspoons of an additive → percent of total oil weight.
 * Null when the inputs aren't usable (non-finite tsp, or oil weight that's non-finite or ≤ 0).
 */
export function tspToPercentOfOil(tsp: number, totalOilGrams: number): number | null {
  if (!Number.isFinite(tsp) || !Number.isFinite(totalOilGrams) || totalOilGrams <= 0) {
    return null;
  }
  return ((tsp * GRAMS_PER_TSP) / totalOilGrams) * 100;
}

/**
 * PPO (ounces of additive per pound of oils) → percent of oil weight.
 * Numeric core shared with `recipeFile.ts`'s importer (which formats the result to a
 * rounded string) — one source of truth for the oz/lb ratio, derived from the same
 * verified gram constants as `weightUnits.ts` rather than a re-hardcoded "16".
 */
export function ppoOzToPercentOfOil(ppoOz: number): number | null {
  if (!Number.isFinite(ppoOz)) return null;
  return (WEIGHT_UNITS.oz.gramsPerUnit / WEIGHT_UNITS.lb.gramsPerUnit) * ppoOz * 100;
}
