import type { DilutionResult } from '@soap-calc/core';

/**
 * INTERNAL to this module — deliberately not exported. A batch's paste always contains ALL
 * of its anhydrous soap — solids do not evaporate — so a reading below that is not a
 * whole-batch paste. It is a mis-tare (the crock left on the scale) or a PORTION weight.
 * The boundary (measured === anhydrousGrams) is accepted.
 *
 * The shared entry point every surface must go through is {@link measuredPasteRejectionFor}
 * (or {@link measuredPasteIsValidFor} for the yes/no form). This predicate answers only one
 * of the three rules and carries none of the conditions the callers need — it says nothing
 * about blank/unparseable input, and nothing about the `isRemaining` declaration that
 * disables this floor entirely. Its doc used to claim it was "shared by
 * PortionDilutionResults and DilutionPanel", which is how the rejection alerts came to be
 * rendered from one surface only and vanished from the default dilution scope.
 */
function measurementBelowSolids(measuredGrams: number, dilution: DilutionResult): boolean {
  return measuredGrams < dilution.anhydrousGrams;
}

/**
 * INTERNAL to this module — deliberately not exported; see measurementBelowSolids above for
 * why, and go through {@link measuredPasteRejectionFor} instead. A paste heavier than the
 * whole target solution cannot be diluted INTO that solution. The boundary
 * (measured === solutionGrams) is accepted.
 */
function measurementExceedsSolution(measuredGrams: number, dilution: DilutionResult): boolean {
  return measuredGrams > dilution.solutionGrams;
}

/**
 * Parses a measured-paste input string (as stored in App/view-model state) into a finite,
 * positive gram figure, or undefined when blank/invalid. Centralizes the "is there a
 * usable number here" check so every caller that might apply the measurement —
 * PortionDilutionResults, DilutionPanel, the printed batch sheet — reads it identically.
 */
export function parseMeasuredPasteGrams(measuredPasteGrams: string | undefined): number | undefined {
  if (measuredPasteGrams === undefined) return undefined;
  const trimmed = measuredPasteGrams.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * True when a parsed measured-paste reading is valid FOR this dilution: not below the
 * anhydrous solids floor (measurementBelowSolids) and not above the target solution
 * ceiling (measurementExceedsSolution) — the shared bar every caller that lets a
 * measurement override a computed figure must clear first.
 *
 * `isRemaining` gates this for the BATCH row specifically: a reading declared as what's
 * LEFT after earlier dilutions describes a smaller pot, not the whole batch, so it can
 * never be valid for a caller (DilutionPanel's batch row, the printed BatchSheet) that
 * corrects a BATCH-level figure with it — PortionDilutionResults' own portion arithmetic
 * doesn't go through this gate, since a remaining reading is exactly what it wants.
 */
export function measuredPasteIsValidFor(
  measuredPasteGrams: string | undefined,
  dilution: DilutionResult,
  isRemaining = false,
): boolean {
  if (isRemaining) return false;
  const measured = parseMeasuredPasteGrams(measuredPasteGrams);
  return (
    measured !== undefined &&
    !measurementBelowSolids(measured, dilution) &&
    !measurementExceedsSolution(measured, dilution)
  );
}

/**
 * Everything a surface needs to say about a measured-paste reading: which of the three
 * physical-impossibility rules it broke, whether it is usable at all, and the whole-batch
 * paste mass the remaining-mode ceiling was checked against.
 */
export type MeasuredPasteRejection = {
  /** The field holds a number that is not a weight at all — zero or negative. Applies under
   * either declaration, and is exclusive of the three rules below. */
  nonPositive: boolean;
  /** The reading is lighter than the batch's own anhydrous soap (whole-batch mode only). */
  belowSolids: boolean;
  /** The reading is heavier than the whole solution the target dilutes to. */
  exceedsSolution: boolean;
  /** A remaining reading is heavier than the whole batch's paste ever was. */
  exceedsRemainingCeiling: boolean;
  /** Any of the three above fired. */
  rejected: boolean;
  /** There is a usable reading AND nothing rejected it — safe to compute from. */
  accepted: boolean;
  /** The field holds something; says nothing about whether it parses. */
  hasMeasurement: boolean;
  /** The reading as `Number()` saw it — NaN when unparseable, 0 when blank. */
  measuredGrams: number;
  /** The whole-batch paste mass the remaining-mode ceiling was checked against, and the
   * figure the ceiling alert must quote. */
  wholeBatchPasteBasis: number;
};

/**
 * The single source for whether a measured-paste reading is physically possible. The
 * measured-paste INPUT lives in DilutionPanel's shell, visible in both dilution scopes,
 * while PortionDilutionResults consumes the same reading to decide whether to compute a
 * portion from it — so both read the verdict from here rather than each deciding for
 * itself. The three rules and the reasons they exist are documented on the branches below;
 * they were moved here verbatim from PortionDilutionResults, where they used to live
 * beside the alert paragraphs.
 *
 * `wholeBatchPasteGrams` is the view model's corrected whole-batch paste mass; omit it and
 * the ceiling falls back to the recipe's own water-only predicted figure, exactly as core
 * does when its matching param is omitted.
 */
export function measuredPasteRejectionFor(
  measuredPasteGrams: string | undefined,
  dilution: DilutionResult,
  isRemaining: boolean,
  wholeBatchPasteGrams?: number | null,
): MeasuredPasteRejection {
  const raw = measuredPasteGrams ?? '';
  const hasMeasurement = raw.trim() !== '';
  const measured = Number(raw);
  // Mirrors core's own predictedPasteGrams (anhydrous + the water already in the paste) —
  // computed here too so the UI can refuse a physically impossible remaining reading
  // BEFORE calling lsPartialDilution, the same way pasteBelowSolids/pasteExceedsSolution
  // already do for their own guards. This counts only the WATER fraction of an
  // alternative liquid, though — see wholeBatchPasteBasis just below for the corrected
  // figure that actually gates the remaining-mode ceiling.
  const predictedPasteGrams =
    dilution.anhydrousGrams + Math.max(0, dilution.totalWaterGrams - dilution.dilutionWaterGrams);
  // Review round 3: predictedPasteGrams structurally misses an alternative liquid's
  // non-water solids (real mass sitting in the pot), so the TRUE whole-batch paste is
  // heavier than predictedPasteGrams whenever the recipe has a split liquid. The corrected
  // figure (wholeBatchPasteGrams, from the view model) is used for the ceiling below —
  // and passed straight through to lsPartialDilution for the composition ratio too, so
  // the UI's own rejection and core's arithmetic always agree on the same basis. Falls
  // back to the uncorrected predictedPasteGrams (round 2's basis) when absent — the exact
  // same fallback core itself applies when its own wholeBatchPasteGrams param is omitted.
  const wholeBatchPasteBasis =
    wholeBatchPasteGrams !== undefined &&
    wholeBatchPasteGrams !== null &&
    Number.isFinite(wholeBatchPasteGrams) &&
    wholeBatchPasteGrams > 0
      ? wholeBatchPasteGrams
      : predictedPasteGrams;
  // Review round 4, finding 8: a scale reading of zero or less is not a paste weight under
  // EITHER declaration — it is below the anhydrous floor trivially, and a remainder of
  // nothing has nothing left to dilute. The `measured > 0` guards on belowSolids and
  // exceedsRemainingCeiling below, and on `accepted` at the bottom, were written to exempt
  // the BLANK field (Number('') === 0) — but hasMeasurement already covers that case, so
  // what those guards actually did was let a typed -500 through as
  // {rejected: false, accepted: false}: no alert anywhere, and the batch row silently
  // falling back to the recipe's computed figure with the impossible number still on
  // screen above it. min={1} on a type="number" input is only enforced on submit, and this
  // form has none, so it is typeable. This owns the verdict alone rather than folding into
  // belowSolids: that rule's remedy ("switch the declaration to what's left after earlier
  // dilutions") is no help for a negative number, and it is disabled in remaining mode,
  // which would have left that declaration silent all over again.
  const nonPositive = hasMeasurement && Number.isFinite(measured) && measured <= 0;
  // A batch's paste always contains ALL of its anhydrous soap — solids do not evaporate —
  // so a WHOLE-BATCH reading below that is not physically possible. It is a mis-tare (the
  // crock left on the scale) or a PORTION weight, and the reference's own ratio method does
  // weigh the portion, which makes the mistake an easy one. Left unguarded the app answered
  // with confident nonsense: a 900 g reading on a 1,200 g-soap batch reported "lighter than
  // predicted — water lost to the cook", which cannot be true of water that was never there.
  // The floor does not apply once the reading is declared REMAINING: what's left after an
  // earlier dilution can legitimately be less than the recipe's whole anhydrous soap — that
  // is the entire point of the declaration, and rejecting it left no way to enter an honest
  // measurement (the batch no longer exists at full weight to "enter instead").
  const belowSolids =
    !isRemaining &&
    hasMeasurement &&
    Number.isFinite(measured) &&
    measured > 0 &&
    measurementBelowSolids(measured, dilution);
  // Likewise, a paste heavier than the whole target solution cannot be diluted INTO that
  // solution. Core returns null for it; saying so beats the figures silently vanishing.
  // Kept as-is for whole-batch mode — unaffected by the remaining-only ceiling below.
  // `!nonPositive` rather than `measured > 0`: a negative reading is never above the
  // solution, so this is only belt-and-braces, but it keeps all three rules uniformly
  // exclusive of the new one so the shell can never render two paragraphs for one reading.
  const exceedsSolution =
    hasMeasurement &&
    Number.isFinite(measured) &&
    !nonPositive &&
    measurementExceedsSolution(measured, dilution);
  // Review round 2, finding 2: a REMAINING reading cannot weigh more than the whole
  // batch's own paste ever did — solids and the water already in the paste don't appear
  // from nowhere. Left unguarded, a bogus reading (e.g. 3,000 g against a 1,700 g true
  // paste) scaled to a pot anhydrous bigger than the entire batch's own anhydrous soap:
  // physically impossible input, confidently wrong output. Checked against
  // wholeBatchPasteBasis (round 3's corrected figure, not the water-only
  // predictedPasteGrams — see its own comment above) so a legitimate remaining reading on
  // a split-liquid recipe isn't falsely rejected. Core rejects this too (returns null,
  // checked against the same basis via the wholeBatchPasteGrams param), so the bad
  // value can never reach the arithmetic either way — this mirrors that guard at the UI
  // layer so the maker sees why, not just a vanished result.
  const exceedsRemainingCeiling =
    isRemaining &&
    hasMeasurement &&
    Number.isFinite(measured) &&
    measured > 0 &&
    measured > wholeBatchPasteBasis;
  const rejected = nonPositive || belowSolids || exceedsSolution || exceedsRemainingCeiling;
  return {
    nonPositive,
    belowSolids,
    exceedsSolution,
    exceedsRemainingCeiling,
    rejected,
    accepted: hasMeasurement && Number.isFinite(measured) && measured > 0 && !rejected,
    hasMeasurement,
    measuredGrams: measured,
    wholeBatchPasteBasis,
  };
}

/**
 * The batch's dilution-water figure, corrected for the two things the recipe's own
 * `dilutionWaterGrams` cannot see. Shared by DilutionPanel's batch row, the printed
 * BatchSheet and computeBottledSolutionGrams so no surface can pour a different number.
 *
 * 1. A valid measured paste — the same arithmetic DilutionPanel and PortionDilutionResults
 *    already apply: solutionGrams is fixed by the target concentration, so
 *    solutionGrams - measured is what is still needed to reach it, and a valid measurement
 *    OUTRANKS the recipe's own dilutionWaterGrams (Task 5's
 *    measured-paste-outranks-targetExceedsPaste principle — that flag is derived from the
 *    recipe's ASSUMED cook water, the measurement is direct evidence against it).
 *
 * 2. An alternative liquid's non-water SOLIDS, when the view model's corrected
 *    `wholeBatchPasteGrams` is supplied. calculateDilution works from anhydrous + water
 *    alone, so its dilutionWaterGrams is solutionGrams - anhydrous - cookWater — it leaves
 *    the solids out of the pot entirely and prescribes water for a paste lighter than the
 *    one on the scale. DilutionPanel's ratio mode already derives its pour from the
 *    corrected paste (pasteGrams x ratio), so before this the ratio block and every
 *    concentration-derived surface disagreed by exactly the solids: 5,000 g on screen
 *    against 5,450 g on the batch sheet for a 900 g liquid at 50% water. Subtracting the
 *    corrected paste from the same solutionGrams is the ratio block's own basis, so the
 *    two now land on one number.
 *
 * Falls back to the recipe's computed figure when neither correction is available, which
 * is byte-identical for a recipe with no split liquid: wholeBatchPasteGrams is then exactly
 * anhydrous + cookWater, and solutionGrams - that IS dilutionWaterGrams.
 *
 * Clamped at zero, matching calculateDilution's own clamp on dilutionWaterGrams: the
 * corrected paste can exceed the target solution (a big low-water liquid) while the
 * recipe's water-only targetExceedsPaste flag stays false, and a negative pour figure is
 * never an instruction. It prints as "0 g" — the honest answer, where the uncorrected
 * figure was a positive number that would have pushed the batch past its target.
 */
export function correctedDilutionWaterGrams(
  dilution: DilutionResult,
  measuredPasteGrams: string | undefined,
  isRemaining = false,
  wholeBatchPasteGrams?: number | null,
): number {
  if (measuredPasteIsValidFor(measuredPasteGrams, dilution, isRemaining)) {
    return dilution.solutionGrams - (parseMeasuredPasteGrams(measuredPasteGrams) as number);
  }
  if (
    wholeBatchPasteGrams !== undefined &&
    wholeBatchPasteGrams !== null &&
    Number.isFinite(wholeBatchPasteGrams) &&
    wholeBatchPasteGrams > 0
  ) {
    return Math.max(0, dilution.solutionGrams - wholeBatchPasteGrams);
  }
  return dilution.dilutionWaterGrams;
}
