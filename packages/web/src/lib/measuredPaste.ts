import type { DilutionResult } from '@soap-calc/core';

/**
 * A batch's paste always contains ALL of its anhydrous soap — solids do not evaporate — so
 * a reading below that is not a whole-batch paste. It is a mis-tare (the crock left on the
 * scale) or a PORTION weight. Shared by PartialDilution and DilutionPanel so a measured
 * paste is validated against the same rule everywhere it corrects a figure. The boundary
 * (measured === anhydrousGrams) is accepted.
 */
export function measurementBelowSolids(measuredGrams: number, dilution: DilutionResult): boolean {
  return measuredGrams < dilution.anhydrousGrams;
}

/**
 * A paste heavier than the whole target solution cannot be diluted INTO that solution.
 * The boundary (measured === solutionGrams) is accepted.
 */
export function measurementExceedsSolution(measuredGrams: number, dilution: DilutionResult): boolean {
  return measuredGrams > dilution.solutionGrams;
}

/**
 * Parses a measured-paste input string (as stored in App/view-model state) into a finite,
 * positive gram figure, or undefined when blank/invalid. Centralizes the "is there a
 * usable number here" check so every caller that might apply the measurement —
 * PartialDilution, DilutionPanel, the printed batch sheet — reads it identically.
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
 * corrects a BATCH-level figure with it — PartialDilution's own portion arithmetic
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
 * The batch's dilution-water figure, corrected by a valid measured paste — the same
 * arithmetic DilutionPanel and PartialDilution already apply: solutionGrams is fixed by
 * the target concentration, so solutionGrams - measured is what is still needed to reach
 * it, and a valid measurement OUTRANKS the recipe's own dilutionWaterGrams (Task 5's
 * measured-paste-outranks-targetExceedsPaste principle — that flag is derived from the
 * recipe's ASSUMED cook water, the measurement is direct evidence against it). Falls back
 * to the recipe's computed figure with no valid measurement. Shared by DilutionPanel's
 * batch row and the printed BatchSheet so both surfaces always show the same number.
 */
export function correctedDilutionWaterGrams(
  dilution: DilutionResult,
  measuredPasteGrams: string | undefined,
  isRemaining = false,
): number {
  if (measuredPasteIsValidFor(measuredPasteGrams, dilution, isRemaining)) {
    return dilution.solutionGrams - (parseMeasuredPasteGrams(measuredPasteGrams) as number);
  }
  return dilution.dilutionWaterGrams;
}
