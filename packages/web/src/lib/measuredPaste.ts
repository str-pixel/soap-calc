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
