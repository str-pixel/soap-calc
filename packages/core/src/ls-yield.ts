/**
 * Diluted liquid-soap solution density, g/ml. This is a documented estimation proxy — most
 * diluted LS solutions (water + KOH/NaOH soap + glycerin) sit slightly above water's 1.0
 * g/ml — not a cited/verified constant like {@link import('./mold-sizer.js').SOAP_FILL_DENSITY_G_PER_CM3}.
 * Callers who have a measured density for their own solution should pass it explicitly.
 */
export const LS_SOLUTION_DENSITY_G_PER_ML = 1.03;

/** Finished liquid-soap volume from diluted solution weight. Null on non-finite/≤0 input. */
export function lsFinishedVolumeMl(
  solutionGrams: number,
  densityGPerMl: number = LS_SOLUTION_DENSITY_G_PER_ML,
): number | null {
  if (!Number.isFinite(solutionGrams) || solutionGrams <= 0) return null;
  if (!Number.isFinite(densityGPerMl) || densityGPerMl <= 0) return null;
  return solutionGrams / densityGPerMl;
}

/** Whole bottles a diluted solution fills at a given bottle size (floored — no partial bottles). */
export function lsBottleCount(
  solutionGrams: number,
  bottleMl: number,
  densityGPerMl: number = LS_SOLUTION_DENSITY_G_PER_ML,
): number | null {
  if (!Number.isFinite(bottleMl) || bottleMl <= 0) return null;
  const volumeMl = lsFinishedVolumeMl(solutionGrams, densityGPerMl);
  if (volumeMl === null) return null;
  return Math.floor(volumeMl / bottleMl);
}
