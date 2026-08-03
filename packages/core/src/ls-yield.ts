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

/** What diluting only PART of a paste batch takes and makes. */
export type LsPartialDilution = {
  /** Share of the whole batch this portion represents, 0–1. */
  fraction: number;
  /** Paste to weigh out (anhydrous soap + the water already in it). */
  pasteGrams: number;
  /** Dilution water to add to that portion. */
  waterGrams: number;
  /** What the portion makes, by mass and by volume. */
  solutionGrams: number;
  volumeMl: number;
  /** Parts of dilution water per 1 part paste — the reference's own ratio-dilution unit
   * (1:1, 2:1, 3:1). Portion-invariant: both sides scale together. */
  waterPasteRatio: number;
  /** True when the paste figure came from the maker's scale rather than the recipe. */
  pasteMeasured: boolean;
  /** True when more was asked for than the batch holds, so the figures are the whole batch. */
  clamped: boolean;
};

/**
 * Dilute a portion of the paste rather than the whole batch — the common workflow when a
 * paste is stored and drawn down over time, since paste keeps far better than diluted soap.
 * Everything scales linearly with the share of the batch taken, so the target volume simply
 * sets the fraction. Note the volume→fraction step carries the density estimate; the
 * resulting paste and water are exact masses for that fraction.
 */
export function lsPartialDilution(
  batch: {
    anhydrousGrams: number;
    totalWaterGrams: number;
    dilutionWaterGrams: number;
    solutionGrams: number;
    /** The maker's own scale reading for the WHOLE batch's paste. Preferred over the
     * computed figure whenever it is available, because a computed paste cannot be right:
     * the cook evaporates water the recipe still counts, and an alternative liquid's
     * non-water solids are mass the recipe never counted. The reference weighs the paste
     * for exactly this reason. Ignored when non-finite or ≤ 0. */
    measuredPasteGrams?: number;
  },
  targetVolumeMl: number,
  densityGPerMl: number = LS_SOLUTION_DENSITY_G_PER_ML,
): LsPartialDilution | null {
  if (!Number.isFinite(targetVolumeMl) || targetVolumeMl <= 0) return null;
  const fullVolumeMl = lsFinishedVolumeMl(batch.solutionGrams, densityGPerMl);
  if (fullVolumeMl === null) return null;
  // Paste is what sits in the pot before dilution water. Computed, that is the anhydrous
  // soap plus the water the lye and any alternative liquid brought in; measured, it is
  // simply what the scale says.
  const m = batch.measuredPasteGrams;
  const pasteMeasured = m !== undefined && Number.isFinite(m) && m > 0;
  const pasteGrams = pasteMeasured
    ? (m as number)
    : batch.anhydrousGrams + Math.max(0, batch.totalWaterGrams - batch.dilutionWaterGrams);
  // The solution is fixed by the recipe (anhydrous ÷ target concentration), so the water
  // to add is whatever the paste does NOT already supply. Without a measurement this is
  // identical to the recipe's own dilutionWaterGrams; with one it absorbs the difference,
  // which is what makes a measured paste self-correcting.
  const batchWaterGrams = batch.solutionGrams - pasteGrams;
  if (batchWaterGrams < 0) return null; // paste is already thinner than the target
  const clamped = targetVolumeMl > fullVolumeMl;
  const fraction = clamped ? 1 : targetVolumeMl / fullVolumeMl;
  const solutionGrams = batch.solutionGrams * fraction;
  return {
    fraction,
    pasteGrams: pasteGrams * fraction,
    waterGrams: batchWaterGrams * fraction,
    solutionGrams,
    volumeMl: solutionGrams / densityGPerMl,
    waterPasteRatio: pasteGrams > 0 ? batchWaterGrams / pasteGrams : 0,
    pasteMeasured,
    clamped,
  };
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
