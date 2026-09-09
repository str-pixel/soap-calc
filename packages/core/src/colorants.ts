// packages/core/src/colorants.ts
import { gramsFromDose, type AdditiveProcess, type AdditiveStage } from './additives.js';
import { superfatShiftFromLiquidFat } from './alternative-liquids.js';
import { GRAMS_PER_LB, GRAMS_PER_OZ } from './units.js';

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
  /** HP whole-batter: straight into the warmed oils, no slurry (HP:11331-11338). */
  | { method: 'recipe-oil' }
  /** LS: a water-soluble dye goes straight into the diluted soap (LS:13253-13262). */
  | { method: 'into-solution' };

export type ColorantGuidance = {
  tspPerLbLow: number;
  tspPerLbHigh: number;
};

/**
 * The book's own equivalence, and the one bridge between the volume rates the trade
 * publishes and the weight percent this app doses in: "approximately 4g of colorant per
 * 450g or 1 teaspoon per pound of oil" (CP:9389-9391). So a teaspoon of colorant powder is
 * about 4 g, and a teaspoon per pound of oils is about 0.9% of them.
 *
 * ONE anchor across materials whose density genuinely differs — a mica runs lighter than a
 * clay — so every percent derived from it is approximate, and the guidance copy says to
 * weigh a spoonful once and trust the scale after that. The alternative was to publish no
 * percent at all, which left the maker holding a teaspoon figure and a field that takes
 * percents.
 */
export const GRAMS_PER_TSP_COLORANT = 4;


/** "add 0.25-0.50 ounces water per colorant" with a little sugar (HP:11320-11329). */
export const HP_COLORANT_WATER_GRAMS = { low: 0.25 * GRAMS_PER_OZ, high: 0.5 * GRAMS_PER_OZ };

/**
 * The fallback band for a colorant the catalog does not name, per kind. Each figure is the
 * sourced rate for its family: mica ½–2 tsp per pound of oils, pastel to bold; oxides and
 * ultramarines ¼ to 2, because the family really does run that wide — a black reads at the
 * bottom of it and a red at the top; dyes ¼. A natural powder falls back to the book's own
 * general starting rate, 1 teaspoon per pound (CP:9389-9391), because the named naturals
 * run from a thirty-second of a teaspoon to three and no single band describes them.
 * "Other" gets none: glitter and a coated neon are not dosed alike.
 *
 * Every figure is a VOLUME rate; the percent the app shows is derived from it through
 * GRAMS_PER_TSP_COLORANT above, and is approximate for exactly the reason stated there.
 * The per-material rates and their URLs live in colorant-catalog.ts, and supplier names
 * stay in these comments and out of the interface (AGENTS.md).
 *
 * These deliberately match the catalog entries for the same families. They used to disagree
 * — the oxide band said half a teaspoon while the iron oxide entry said one — which put two
 * different answers for one material on the same screen.
 */
export const COLORANT_GUIDANCE: Record<ColorantKind, ColorantGuidance | null> = {
  mica: { tspPerLbLow: 0.5, tspPerLbHigh: 2 },
  // The whole oxide family, not the generic midpoint: a black reads at a quarter of a
  // teaspoon per pound where a red wants two, and a band that held only the middle made
  // the iron oxide entry's own note prescribe an over-dose.
  oxide: { tspPerLbLow: 0.25, tspPerLbHigh: 2 },
  natural: { tspPerLbLow: 1, tspPerLbHigh: 1 },
  dye: { tspPerLbLow: 0.25, tspPerLbHigh: 0.25 },
  other: null,
};

const finite = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

/** Teaspoons per pound of oils → percent of oils, through the book's own anchor. */
export function tspPerLbToPercentOfOils(tspPerLb: number): number {
  if (!finite(tspPerLb) || tspPerLb <= 0) return 0;
  return (tspPerLb * GRAMS_PER_TSP_COLORANT * 100) / GRAMS_PER_LB;
}

export function portionOilGrams(totalOilGrams: number, portionPercent: number | null): number {
  if (!finite(totalOilGrams) || totalOilGrams <= 0) return 0;
  if (!finite(portionPercent) || portionPercent <= 0) return totalOilGrams;
  return (totalOilGrams * portionPercent) / 100;
}

/** The book's rate is for a single-colour soap; each colour is dosed against the oils it
 * actually colours, or a three-way swirl would carry three times the pigment. The rule it
 * serves is the source's own: colour belongs to the soap rather than the lather, and too
 * much of it migrates into the lather and stains tub, towels and skin (CP:9378-9388).
 * Null = to shade: the maker has not fixed a dose, and both render paths read that. */
export function colorantGrams(percent: number | null, portionOilGrams: number): number | null {
  if (!finite(percent) || percent <= 0) return null;
  // The additive multiplier is the one source of percent-of-basis math.
  const grams = gramsFromDose(portionOilGrams, percent, 'percent');
  return grams === null || grams <= 0 ? null : grams;
}

/** CP: "mixed at a 1:1 ratio with a light carrier oil" — glycerin or water discouraged
 * (CP:9395-9400).
 *
 * HP: the source offers a CHOICE of solvent — oil, glycerin, water, yogurt, milk — and
 * states hot sugar water as the author's own preference, with oil "an excellent option"
 * that many makers combine with the post-cook superfat, and glycerin the one it advises
 * against (HP:11296-11312). The app has to derive one answer, so it derives the stated
 * preference and the panel copy names the alternatives rather than hiding them. Sugar-water
 * quantities at HP:11320-11329. A single, whole-batter colorant goes "directly to your
 * oils" at the start instead, which also lets the immersion blender do the mixing
 * (HP:11331-11338).
 *
 * LS: a dye "shows color when it is dissolved", most are water soluble, and the cosmetic
 * ones go "directly to your soap after the dilution" — often bought already liquid
 * (LS:13253-13262). No source prescribes a temperature for it, so the app does not either.
 * Pigments and coarse particles sediment instead (LS:13307-13310, LS:13380-13390).
 *
 * `hasPortion` is the same flag colorantStage reads, so dispersal and stage cannot
 * disagree. */
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
  return { method: 'into-solution' };
}

/** The carrier is unsaponified oil riding on the recipe oils: 1:1 at a 1% colorant is a
 * full superfat point — the same rule an alternative liquid's fat follows, so it IS that
 * function under the colorant's name. */
export const carrierOilSuperfatShift: (carrierGrams: number, totalOilGrams: number) => number =
  superfatShiftFromLiquidFat;

/** A whole-batter colour goes into the oils at the start (CP:9396-9404; HP:11331-11338); a
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
