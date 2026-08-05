import type { WaterMode } from './lye.js';

export type SplitLiquidWaterSuggestion = {
  suggestedWaterGrams: number;
  reductionGrams: number;
  /** When water mode is % of oils, equivalent suggested water %. */
  suggestedWaterPercentOfOils: number | null;
};

export function lyeConcentrationPercent(lyeGrams: number, waterGrams: number): number | null {
  if (!Number.isFinite(lyeGrams) || !Number.isFinite(waterGrams) || lyeGrams <= 0 || waterGrams < 0) {
    return null;
  }
  const total = lyeGrams + waterGrams;
  if (total <= 0) return null;
  return (lyeGrams / total) * 100;
}

export type LyeSolutionWaterStatus = {
  /** Water actually available to dissolve the lye: plain water plus the water fraction of
   * an alternative liquid added to the lye solution. */
  effectiveWaterGrams: number;
  /** The 1:1 water:lye dissolving floor. */
  floorGrams: number;
  /** How far the effective water falls below the floor (0 when the floor is met). */
  shortfallGrams: number;
};

/** Checks whether the lye solution still has enough real water to dissolve the lye when an
 * alternative liquid (which is never 100% water) is part of it. Liquids like canned coconut
 * milk (~68% water) or greek yogurt (~81%) can silently starve a 1:1 solution. */
export function lyeSolutionWaterStatus(input: {
  waterGrams: number;
  lyeGrams: number;
  splitLiquidGrams: number;
  waterFraction: number;
}): LyeSolutionWaterStatus | null {
  const { waterGrams, lyeGrams, splitLiquidGrams, waterFraction } = input;
  if (
    !Number.isFinite(waterGrams) ||
    !Number.isFinite(lyeGrams) ||
    !Number.isFinite(splitLiquidGrams) ||
    !Number.isFinite(waterFraction) ||
    waterGrams < 0 ||
    lyeGrams <= 0 ||
    splitLiquidGrams < 0 ||
    waterFraction <= 0 ||
    waterFraction > 1
  ) {
    return null;
  }

  const effectiveWaterGrams = waterGrams + splitLiquidGrams * waterFraction;
  const floorGrams = lyeGrams;
  const shortfallGrams = Math.max(0, floorGrams - effectiveWaterGrams);
  return { effectiveWaterGrams, floorGrams, shortfallGrams };
}

/**
 * Water the alternative liquids carry into the paste, across every split-liquid stage.
 *
 * Only liquid soap has a use for this. A bar recipe's split liquid IS the batch's water,
 * and nothing further is added; but LS cooks a paste and then dilutes it to a target soap
 * concentration, so every gram of water already in that paste is a gram of dilution water
 * that must NOT be added again. All three split-liquid stages (lye, oils, trace) happen
 * before the cook, so all three count — the stage changes when the water arrives, not
 * whether it is there at dilution time.
 *
 * Glycerin (waterFraction 0) correctly adds nothing HERE — it carries no water, and water
 * is all this function is asked for. That is not the same as being ignored: its whole mass
 * is non-water solids, and the caller's corrected whole-batch paste (the web view model's
 * wholeBatchPasteGrams, = anhydrous + this + the liquids' solids) picks all of it up, which
 * is what takes the dilution water down by the glycerin's own weight. This note used to say
 * glycerin "reduces the dilution water through its solvent action, which has no numeric
 * model", which conflated the two: the MASS is modelled, downstream of here; the extra
 * solvent effect — a paste that dissolves faster and reaches its target consistency early —
 * is the part with no numeric model.
 */
export function splitLiquidPasteWaterGrams(
  rows: readonly { grams: number | null; waterFraction: number }[],
): number {
  let waterGrams = 0;
  for (const { grams, waterFraction } of rows) {
    if (grams === null || !Number.isFinite(grams) || grams <= 0) continue;
    if (!Number.isFinite(waterFraction) || waterFraction <= 0) continue;
    waterGrams += grams * waterFraction;
  }
  return waterGrams;
}

export function suggestLyeWaterWithSplitLiquid(input: {
  waterGrams: number;
  lyeGrams: number;
  totalOilGrams: number;
  splitLiquidGrams: number;
  waterMode: WaterMode;
}): SplitLiquidWaterSuggestion | null {
  const { waterGrams, lyeGrams, totalOilGrams, splitLiquidGrams, waterMode } = input;
  if (
    !Number.isFinite(waterGrams) ||
    !Number.isFinite(lyeGrams) ||
    !Number.isFinite(totalOilGrams) ||
    !Number.isFinite(splitLiquidGrams) ||
    splitLiquidGrams <= 0 ||
    totalOilGrams <= 0 ||
    waterGrams <= 0 ||
    lyeGrams <= 0
  ) {
    return null;
  }

  const minWaterGrams = lyeGrams;
  const maxReplaceable = Math.max(0, waterGrams - minWaterGrams);
  const reductionGrams = Math.min(splitLiquidGrams, maxReplaceable);
  const suggestedWaterGrams = waterGrams - reductionGrams;

  const suggestedWaterPercentOfOils =
    waterMode === 'percent_of_oils'
      ? (suggestedWaterGrams / totalOilGrams) * 100
      : null;

  return {
    suggestedWaterGrams,
    reductionGrams,
    suggestedWaterPercentOfOils,
  };
}
