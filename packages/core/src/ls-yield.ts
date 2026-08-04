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
  /** What the recipe predicts the WHOLE batch's paste to weigh (anhydrous soap + the water
   * already in it), unscaled by the portion's fraction. Present whether or not a
   * measurement was given, so callers can diff it against a measurement (drift) without
   * recomputing the same expression this function already evaluates internally. */
  predictedPasteGrams: number;
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
    /** The maker's own scale reading for the paste — the WHOLE batch by default, or what's
     * LEFT after earlier dilutions when {@link measuredPasteIsRemaining} is set. Preferred
     * over the computed figure whenever it is available, because a computed paste cannot be
     * right: the cook evaporates water the recipe still counts, and an alternative liquid's
     * non-water solids are mass the recipe never counted. The reference weighs the paste
     * for exactly this reason. Ignored when non-finite or ≤ 0. */
    measuredPasteGrams?: number;
    /** True when {@link measuredPasteGrams} is what is LEFT after part of the batch was
     * already diluted away, not the whole batch. "Measured paste is lighter than
     * predicted" has two indistinguishable explanations — evaporation during the cook (same
     * soap, less water: MORE concentrated), or part of the batch already gone (composition
     * unchanged, just less of it) — so this must be told apart rather than assumed. The
     * paste is homogeneous, so the pot's own anhydrous soap is a proportional share of the
     * measurement (measured × anhydrousGrams / predictedPasteGrams) rather than the
     * recipe's whole anhydrousGrams — and unlike the whole-batch case, there is no
     * anhydrous floor to enforce: any positive remainder is legitimate. Ignored without a
     * measurement. */
    measuredPasteIsRemaining?: boolean;
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
  const predictedPasteGrams =
    batch.anhydrousGrams + Math.max(0, batch.totalWaterGrams - batch.dilutionWaterGrams);
  const isRemaining = pasteMeasured && batch.measuredPasteIsRemaining === true;
  // A remainder cannot weigh more than the whole batch's own paste ever did — solids and
  // the water already in the paste don't appear from nowhere. Left unguarded, a bogus
  // "remaining" reading heavier than predictedPasteGrams scaled to a pot anhydrous bigger
  // than the entire batch's own anhydrous soap: physically impossible input, confidently
  // wrong output. Reject before any arithmetic runs on it.
  if (isRemaining && (m as number) > predictedPasteGrams) return null;
  const pasteGrams = pasteMeasured ? (m as number) : predictedPasteGrams;
  // Whole-batch (default): the pot holds all the recipe's anhydrous soap, and the target
  // solution is the recipe's own fixed solutionGrams. Remaining: the paste is homogeneous,
  // so the pot's own anhydrous soap — and therefore its own target solution — is a
  // proportional share of the measurement rather than the recipe's whole-batch figures.
  const potAnhydrousGrams = isRemaining
    ? (m as number) * (batch.anhydrousGrams / predictedPasteGrams)
    : batch.anhydrousGrams;
  const potSolutionGrams = isRemaining
    ? potAnhydrousGrams * (batch.solutionGrams / batch.anhydrousGrams)
    : batch.solutionGrams;
  // The pot's solution is fixed by its own target concentration, so the water to add is
  // whatever the paste does NOT already supply. Without a measurement this is identical to
  // the recipe's own dilutionWaterGrams; with one it absorbs the difference, which is what
  // makes a measured paste self-correcting.
  const batchWaterGrams = potSolutionGrams - pasteGrams;
  if (batchWaterGrams < 0) return null; // paste is already thinner than the target
  // "Amount to make" must make that amount: the requested volume is a share of what THIS
  // POT can achieve, not the recipe's original output. In whole-batch mode the pot IS the
  // batch, so this is fullVolumeMl unchanged (byte-identical to before). In remaining mode
  // the pot is smaller than the original recipe (part of it was already diluted away), so
  // its own achievable volume is smaller too — using the recipe's fullVolumeMl here (an
  // earlier, incorrect version of this fix) understated the achievable fraction and made
  // "Makes" print less than what was actually asked for (1,200 ml asked, ~1,078 ml shown).
  const potFullVolumeMl = isRemaining
    ? lsFinishedVolumeMl(potSolutionGrams, densityGPerMl)
    : fullVolumeMl;
  if (potFullVolumeMl === null) return null; // degenerate pot (potSolutionGrams <= 0)
  const clamped = targetVolumeMl > potFullVolumeMl;
  const fraction = clamped ? 1 : targetVolumeMl / potFullVolumeMl;
  const solutionGrams = potSolutionGrams * fraction;
  return {
    fraction,
    pasteGrams: pasteGrams * fraction,
    waterGrams: batchWaterGrams * fraction,
    solutionGrams,
    volumeMl: solutionGrams / densityGPerMl,
    waterPasteRatio: pasteGrams > 0 ? batchWaterGrams / pasteGrams : 0,
    pasteMeasured,
    predictedPasteGrams,
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
