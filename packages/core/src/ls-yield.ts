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
  /** The basis actually used for the unmeasured pot's paste (see `pasteGrams` above):
   * `batch.wholeBatchPasteGrams` when the caller supplied one (corrects predictedPasteGrams
   * for an alternative liquid's non-water solids), else predictedPasteGrams unchanged. So
   * callers can show what the measurement was actually checked/derived against without
   * recomputing the same fallback this function already resolves internally. */
  wholeBatchPasteGrams: number;
  /** True when more was asked for than the batch holds, so the figures are the whole batch. */
  clamped: boolean;
};

/**
 * The anhydrous soap in ONE WEIGHED POT of a batch's paste. The paste is homogeneous, so a
 * pot is a proportional share of it: `potPasteGrams × anhydrousGrams / wholeBatchPasteGrams`.
 * Null when the inputs cannot describe a share — a non-positive figure anywhere, or a pot
 * heavier than the whole batch's paste ever was (solids and the water already in the paste
 * do not appear from nowhere; the boundary, pot === batch, is a legitimate share of 1).
 *
 * Used to be {@link lsPartialDilution}'s remaining-mode arithmetic, extracted rather than
 * copied so there was exactly one derivation of the ratio and one ceiling under it. That mode
 * is gone from lsPartialDilution now — its pot is always the whole batch — so this function's
 * only remaining consumer is the UI's own weighed-jar caller below.
 *
 * Extracted because the UI has a caller that needs the share and NOTHING else:
 * DilutionPanel's Custom-amount Gradual mode, where the maker weighs a jar out and records
 * the water they poured into it, and the jar's concentration is that share ÷ (paste +
 * water). Asking lsPartialDilution for it meant asking a question about the recipe's own
 * TARGET at the same time — that function needs a target volume and refuses outright when
 * the saved target implies a solution lighter than the pot (see the batchWaterGrams guard
 * below) — so a jar figure that has nothing to do with the target vanished from the screen
 * whenever the target happened to be a low-water one. The share does not depend on the
 * target and now does not ask about it.
 */
export function lsPotAnhydrousShare(input: {
  /** The whole batch's anhydrous soap. */
  anhydrousGrams: number;
  /** The whole batch's paste — the corrected, solids-aware figure where the caller has one. */
  wholeBatchPasteGrams: number;
  /** The pot on the scale: a weighed-out jar. */
  potPasteGrams: number;
}): number | null {
  const { anhydrousGrams, wholeBatchPasteGrams, potPasteGrams } = input;
  if (!Number.isFinite(anhydrousGrams) || anhydrousGrams <= 0) return null;
  if (!Number.isFinite(wholeBatchPasteGrams) || wholeBatchPasteGrams <= 0) return null;
  if (!Number.isFinite(potPasteGrams) || potPasteGrams <= 0) return null;
  if (potPasteGrams > wholeBatchPasteGrams) return null;
  return potPasteGrams * (anhydrousGrams / wholeBatchPasteGrams);
}

/**
 * Dilute a portion of the paste rather than the whole batch — the common workflow when a
 * paste is stored and drawn down over time, since paste keeps far better than diluted soap.
 * Everything scales linearly with the share of the batch taken, so the target volume simply
 * sets the fraction. Note the volume→fraction step carries the density estimate; the
 * resulting paste and water are exact masses for that fraction.
 *
 * This function's pot is always the WHOLE batch. A caller asking what a jar holding only
 * PART of the paste itself contains (deriving ITS OWN concentration, not a share of what
 * the recipe's target wants) reads {@link lsPotAnhydrousShare} directly instead.
 */
export function lsPartialDilution(
  batch: {
    anhydrousGrams: number;
    totalWaterGrams: number;
    dilutionWaterGrams: number;
    solutionGrams: number;
    /** The maker's own scale reading for the whole batch's paste. Preferred over the
     * computed figure whenever it is available, because a computed paste cannot be right:
     * the cook boils off water the recipe still counts, and nothing on paper knows how much
     * a particular cook drove off. The reference weighs the paste for exactly this reason.
     * (An alternative liquid's non-water solids were the OTHER half of that claim until
     * {@link wholeBatchPasteGrams} started carrying them into the computed paste too — see
     * its own note. A caller that supplies no corrected basis still misses them.) Ignored
     * when non-finite or ≤ 0. */
    measuredPasteGrams?: number;
    /** The best-known WHOLE-BATCH paste mass, when available — corrects
     * predictedPasteGrams for mass it structurally misses. predictedPasteGrams counts only
     * the WATER fraction of an alternative liquid (anhydrousGrams + cookWaterGrams); the
     * liquid's non-water solids are real mass sitting in the pot the recipe never counts,
     * so for a split-liquid recipe the TRUE whole-batch paste is heavier than
     * predictedPasteGrams. Falls back to predictedPasteGrams when omitted, non-finite, or
     * ≤ 0, so every caller that doesn't know about split-liquid solids is unaffected.
     *
     * Consumed as the UNMEASURED paste itself (see pasteGrams below): an undivided pot
     * really does hold anhydrous + cook water + those solids, so sizing an unmeasured
     * portion off predictedPasteGrams poured water for a lighter paste than the one on the
     * bench — and disagreed with the whole-batch row, which subtracts this same corrected
     * figure from solutionGrams. A MEASUREMENT still outranks both. */
    wholeBatchPasteGrams?: number;
  },
  targetVolumeMl: number,
  densityGPerMl: number = LS_SOLUTION_DENSITY_G_PER_ML,
): LsPartialDilution | null {
  if (!Number.isFinite(targetVolumeMl) || targetVolumeMl <= 0) return null;
  // anhydrousGrams, totalWaterGrams and dilutionWaterGrams feed batchWaterGrams and the
  // paste figures below through plain arithmetic — addition, subtraction, Math.max — which
  // propagates a bad value as an ordinary-looking number rather than throwing. The guard
  // further down cannot be trusted to catch it: `batchWaterGrams < 0` can't catch a NaN at
  // all (NaN < 0 is false). Only checking these three here, before any of them is used,
  // stops both.
  //
  // anhydrousGrams and totalWaterGrams are rejected at <= 0, matching every sibling check in
  // this file — including {@link lsPotAnhydrousShare}'s own check on the identically-named
  // anhydrousGrams — because a batch with no soap or no water isn't a real batch, it's
  // corrupt input. Both a NaN AND a merely-negative value need this: a negative
  // totalWaterGrams (e.g. -500, still finite) reaches the same
  // `Math.max(0, totalWaterGrams - dilutionWaterGrams)` clamp two lines below that an
  // infinite dilutionWaterGrams did, and the subtraction goes negative and gets clamped to 0
  // either way — silently producing the same wrong predictedPasteGrams (1,200 instead of
  // 1,600) with no NaN in sight. Finiteness alone would have missed this.
  //
  // dilutionWaterGrams alone stays finiteness-only, not <= 0: 0 is a legitimate, documented
  // state here (the targetExceedsPaste clamp elsewhere in this codebase pins it to exactly
  // 0 when the target is below the paste already in hand), so rejecting it would refuse a
  // real caller, not just corrupt input.
  if (!Number.isFinite(batch.anhydrousGrams) || batch.anhydrousGrams <= 0) return null;
  if (!Number.isFinite(batch.totalWaterGrams) || batch.totalWaterGrams <= 0) return null;
  if (!Number.isFinite(batch.dilutionWaterGrams)) return null;
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
  // The pot holds all the recipe's anhydrous soap, and the target solution is the recipe's
  // own fixed solutionGrams. The water to add is whatever the paste does NOT already
  // supply. Without a measurement this is identical to the recipe's own dilutionWaterGrams;
  // with one it absorbs the difference, which is what makes a measured paste self-correcting.
  const batchWaterGrams = batch.solutionGrams - pasteGrams;
  if (batchWaterGrams < 0) return null; // paste is already thinner than the target
  // "Amount to make" must make that amount: the requested volume is a share of what the
  // batch can achieve.
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
    predictedPasteGrams,
    wholeBatchPasteGrams,
    clamped,
  };
}
