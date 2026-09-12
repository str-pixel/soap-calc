import { WEIGHT_UNITS } from './weightUnits';

/**
 * PPO (ounces of additive per pound of oils) → percent of oil weight.
 * Numeric core shared with `recipeFile.ts`'s importer (which formats the result to a
 * rounded string) — one source of truth for the oz/lb ratio, derived from the same
 * verified gram constants as `weightUnits.ts` rather than a re-hardcoded "16".
 */
export function ppoOzToPercentOfOil(ppoOz: number): number | null {
  if (!Number.isFinite(ppoOz) || ppoOz < 0) return null;
  return (WEIGHT_UNITS.oz.gramsPerUnit / WEIGHT_UNITS.lb.gramsPerUnit) * ppoOz * 100;
}
