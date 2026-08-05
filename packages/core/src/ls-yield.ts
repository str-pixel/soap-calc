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
  /** What the recipe predicts the WHOLE batch's paste to weigh: anhydrous soap + the water
   * the ARITHMETIC (totalWaterGrams - dilutionWaterGrams) says is already in it, unscaled
   * by the portion's fraction. UNRELIABLE as a drift-comparison basis when the caller's
   * dilutionWaterGrams came from the targetExceedsPaste clamp: that clamp pins
   * dilutionWaterGrams to 0, so this expression silently loses the real cook water and
   * understates the true paste (100 g anhydrous + 150 g cook water reads as 200 g here, not
   * 250 g — the clamp erased the 150). Callers comparing a measurement against "the whole
   * batch's paste" (drift, or a ceiling) must use {@link wholeBatchPasteGrams} instead,
   * which resolves to the caller-supplied clamp-free figure when there is one. This field
   * stays only as the documented, byte-identical FALLBACK wholeBatchPasteGrams itself uses
   * when no corrected basis is available — do not re-derive a "predicted paste" from
   * totalWaterGrams/dilutionWaterGrams elsewhere; it will silently reproduce this trap. */
  predictedPasteGrams: number;
  /** The basis actually used for the remaining-mode composition ratio and its ceiling:
   * `batch.wholeBatchPasteGrams` when the caller supplied one (corrects predictedPasteGrams
   * for an alternative liquid's non-water solids), else predictedPasteGrams unchanged. So
   * callers can show what the measurement was actually checked/derived against without
   * recomputing the same fallback this function already resolves internally. */
  wholeBatchPasteGrams: number;
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
     * right: the cook boils off water the recipe still counts, and nothing on paper knows
     * how much a particular cook drove off. The reference weighs the paste for exactly this
     * reason. (An alternative liquid's non-water solids were the OTHER half of that claim
     * until {@link wholeBatchPasteGrams} started carrying them into the computed paste too —
     * see its own note. A caller that supplies no corrected basis still misses them.)
     * Ignored when non-finite or ≤ 0. */
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
    /** The best-known WHOLE-BATCH paste mass, when available — corrects
     * predictedPasteGrams for mass it structurally misses. predictedPasteGrams counts only
     * the WATER fraction of an alternative liquid (anhydrousGrams + cookWaterGrams); the
     * liquid's non-water solids are real mass sitting in the pot the recipe never counts,
     * so for a split-liquid recipe the TRUE whole-batch paste is heavier than
     * predictedPasteGrams. Used for BOTH the remaining-mode composition ratio and its
     * ceiling — a too-light basis both rejects legitimate remaining readings above it AND
     * (via that same basis feeding the composition ratio) overstates the pot's soap
     * fraction. Falls back to predictedPasteGrams when omitted, non-finite, or ≤ 0, so
     * every caller that doesn't know about split-liquid solids is unaffected.
     *
     * Consumed in remaining mode AND as the UNMEASURED paste itself (see pasteGrams below):
     * an undivided pot really does hold anhydrous + cook water + those solids, so sizing an
     * unmeasured portion off predictedPasteGrams poured water for a lighter paste than the
     * one on the bench — and disagreed with the whole-batch row, which subtracts this same
     * corrected figure from solutionGrams. A MEASUREMENT still outranks both. */
    wholeBatchPasteGrams?: number;
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
  const wb = batch.wholeBatchPasteGrams;
  // The corrected basis when the caller has one (accounts for split-liquid solids
  // predictedPasteGrams misses), else predictedPasteGrams exactly as before — every
  // existing caller that never supplies wholeBatchPasteGrams is byte-identical to round 2.
  const wholeBatchPasteGrams =
    wb !== undefined && Number.isFinite(wb) && wb > 0 ? wb : predictedPasteGrams;
  const isRemaining = pasteMeasured && batch.measuredPasteIsRemaining === true;
  // A remainder cannot weigh more than the whole batch's own paste ever did — solids and
  // the water already in the paste don't appear from nowhere. Left unguarded, a bogus
  // "remaining" reading heavier than the true whole-batch paste scaled to a pot anhydrous
  // bigger than the entire batch's own anhydrous soap: physically impossible input,
  // confidently wrong output. Reject before any arithmetic runs on it. Checked against
  // wholeBatchPasteGrams (the corrected basis), not the raw predictedPasteGrams — round
  // 2's version of this guard rejected legitimate remaining readings above
  // predictedPasteGrams whenever the recipe used a split liquid, since predictedPasteGrams
  // structurally undercounts the liquid's own solids.
  if (isRemaining && (m as number) > wholeBatchPasteGrams) return null;
  // Measured wins outright — the scale is the only figure that can see cook evaporation.
  // Unmeasured, the pot is the corrected whole-batch basis, NOT predictedPasteGrams: an
  // alternative liquid's non-water solids are real mass sitting in it, so the water-only
  // figure sized the portion off a paste lighter than the pot and left Custom amount
  // pouring the solids' worth of extra water — while Whole batch, which subtracts this
  // same corrected figure from solutionGrams, poured the right one.
  //
  // Identical to predictedPasteGrams for every caller that supplies no corrected basis (the
  // fallback above), and — WHILE dilutionWaterGrams is unclamped — for every recipe with no
  // split liquid, where solids = 0 makes the two expressions the same number. That qualifier
  // is load-bearing and was missing here: once the caller's dilutionWaterGrams has been
  // clamped to 0 (targetExceedsPaste), predictedPasteGrams collapses to
  // anhydrousGrams + totalWaterGrams, which is solutionGrams — so it is LIGHTER than a
  // corrected basis even with no split liquid at all, and the two diverge. Worked case:
  // anhydrous 2260.56, totalWater 10175.14, dilutionWater 0, solution 12435.71, basis
  // 15694.47 — this used to return a zero-water portion and now returns null.
  //
  // Not reachable from the only production caller: PortionDilutionResults refuses to call
  // this at all in that state (its pasteAlreadyThinner is targetExceedsPaste with no valid
  // measurement), and it says so on screen rather than sizing a portion from clamped
  // figures. So the divergence is real, is confined to direct callers, and is the correct
  // answer for them — a pot already past its target has no water to divide up, which is the
  // same refusal the measured branch has always given for the same physical situation.
  const pasteGrams = pasteMeasured ? (m as number) : wholeBatchPasteGrams;
  // Whole-batch (default): the pot holds all the recipe's anhydrous soap, and the target
  // solution is the recipe's own fixed solutionGrams. Remaining: the paste is homogeneous,
  // so the pot's own anhydrous soap — and therefore its own target solution — is a
  // proportional share of the measurement rather than the recipe's whole-batch figures.
  // Scaled against wholeBatchPasteGrams (not predictedPasteGrams) for the same reason as
  // the ceiling above: using the water-only figure here understates the pot's true paste
  // mass and so overstates its soap fraction whenever the recipe has a split liquid.
  const potAnhydrousGrams = isRemaining
    ? (m as number) * (batch.anhydrousGrams / wholeBatchPasteGrams)
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
    wholeBatchPasteGrams,
    clamped,
  };
}
