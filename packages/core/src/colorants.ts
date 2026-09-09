// packages/core/src/colorants.ts
import { gramsFromDose, type AdditiveProcess, type AdditiveStage } from './additives.js';
import { superfatShiftFromLiquidFat } from './alternative-liquids.js';
import { GRAMS_PER_OZ } from './units.js';

/**
 * Colorant math. There is no sourced dose for a colorant — the cold-process text says so
 * ("There isn't a 'set' amount", CP:9376) and then gives a rule of thumb whose own worked
 * example disagrees with it (0.1% stated; 4 g per 450 g ≈ 0.89% shown; CP:9389-9391). The
 * trade doses by volume (½–2 tsp per lb of oils). Every percent here is DERIVED and the
 * guidance copy says so; the dose field starts empty everywhere.
 */

export type ColorantKind = 'mica' | 'oxide' | 'natural' | 'dye' | 'other';

export type ColorantDispersal =
  | { method: 'carrier-oil'; carrierGrams: number | null }
  | { method: 'hot-sugar-water'; waterGramsLow: number; waterGramsHigh: number }
  /** HP whole-batter: straight into the warmed oils, no slurry (HP:11330-11334). */
  | { method: 'recipe-oil' }
  | { method: 'warm-water' };

export type ColorantGuidance = {
  tspPerLbLow: number;
  tspPerLbHigh: number;
  percentLow: number;
  percentHigh: number;
};

/** "add 0.25-0.50 ounces water per colorant" with a little sugar (HP:11319-11321). */
export const HP_COLORANT_WATER_GRAMS = { low: 0.25 * GRAMS_PER_OZ, high: 0.5 * GRAMS_PER_OZ };

/**
 * Derived ranges. Volume figures: micas ½–2 tsp per lb of oils, 1 typical; oxides and
 * ultramarines 1 tsp/lb, HALF OR LESS for brown and red; natural powders ½–1 tsp/lb
 * (supplier usage pages; the per-colour rates were re-fetched and pinned 2026-09-09 — the
 * URLs are listed in colorant-catalog.ts, which carries the per-material figures. These
 * per-KIND bands stay a broad fallback for a colour the catalog does not name. Never in copy.) Weight derivation: a supplier FAQ puts its micas at 12–18 tsp/oz = 1.6–2.4 g/tsp,
 * so ½ tsp/lb = 0.18–0.26% and 1 tsp/lb = 0.35–0.53% of oils; the CP text's own example
 * (4 g per 450 g, CP:9389-9391) is 0.89%. The band below spans that whole spread. Dyes are
 * "to shade" (LS:13256-13262) and "other" is unknown by definition: no range.
 */
export const COLORANT_GUIDANCE: Record<ColorantKind, ColorantGuidance | null> = {
  mica: { tspPerLbLow: 0.5, tspPerLbHigh: 1, percentLow: 0.2, percentHigh: 0.9 },
  oxide: { tspPerLbLow: 0.5, tspPerLbHigh: 1, percentLow: 0.2, percentHigh: 0.9 },
  natural: { tspPerLbLow: 0.5, tspPerLbHigh: 1, percentLow: 0.2, percentHigh: 0.9 },
  dye: null,
  other: null,
};

const finite = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

export function portionOilGrams(totalOilGrams: number, portionPercent: number | null): number {
  if (!finite(totalOilGrams) || totalOilGrams <= 0) return 0;
  if (!finite(portionPercent) || portionPercent <= 0) return totalOilGrams;
  return (totalOilGrams * portionPercent) / 100;
}

/** The book's rate is for a single-colour soap; each colour is dosed against the oils it
 * actually colours, or a three-way swirl would carry three times the pigment. The rule it
 * serves is the source's own: colour belongs to the soap rather than the lather, and too
 * much of it migrates into the lather and stains tub, towels and skin (CP:9378-9385). */
export function colorantGrams(percent: number | null, portionOilGrams: number): number | null {
  if (!finite(percent) || percent <= 0) return null;
  // The additive multiplier is the one source of percent-of-basis math.
  const grams = gramsFromDose(portionOilGrams, percent, 'percent');
  return grams === null || grams <= 0 ? null : grams;
}

/** CP: "mixed at a 1:1 ratio with a light carrier oil" — glycerin or water discouraged
 * (CP:9395-9400). HP: the sugar-water pitchers are for colouring the COOKED paste
 * (HP:11319-11321); a single, whole-batter colorant goes "directly to your oils" at the
 * start instead (HP:11330-11334). LS: dyes dissolve in water (LS:13256); micas settle
 * (LS:13390). `hasPortion` is the same flag colorantStage reads, so dispersal and stage
 * cannot disagree. */
export function colorantDispersal(
  process: AdditiveProcess,
  colorantGrams: number | null,
  hasPortion: boolean,
): ColorantDispersal {
  if (process === 'cp') return { method: 'carrier-oil', carrierGrams: colorantGrams };
  if (process === 'hp') {
    if (!hasPortion) return { method: 'recipe-oil' };
    return { method: 'hot-sugar-water', waterGramsLow: HP_COLORANT_WATER_GRAMS.low, waterGramsHigh: HP_COLORANT_WATER_GRAMS.high };
  }
  return { method: 'warm-water' };
}

/** The carrier is unsaponified oil riding on the recipe oils: 1:1 at a 1% colorant is a
 * full superfat point — the same rule an alternative liquid's fat follows, so it IS that
 * function under the colorant's name. */
export const carrierOilSuperfatShift: (carrierGrams: number, totalOilGrams: number) => number =
  superfatShiftFromLiquidFat;

/** A whole-batter colour goes into the oils at the start (CP:9401-9404; HP:11330-11334); a
 * portion colour at the design stage — CP trace, HP after the cook. LS dyes are "added
 * directly to your soap after the dilution" (LS:13262), portions or not. */
export function colorantStage(process: AdditiveProcess, hasPortion: boolean): AdditiveStage {
  if (process === 'ls') return 'after_cook';
  if (!hasPortion) return 'oils';
  return process === 'cp' ? 'trace' : 'after_cook';
}

export function portionsTotalPercent(portions: Array<{ percent: number | null }>): { total: number; over100: boolean } {
  const total = portions.reduce((sum, p) => sum + (finite(p.percent) && p.percent > 0 ? p.percent : 0), 0);
  return { total, over100: total > 100 };
}
