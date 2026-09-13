/**
 * Which fatty-acid group readings may be FLAGGED — only a HIGH reading, and only on a group
 * where a source states what goes wrong. Every other group still shows its value and its
 * typical band; it just never earns a "Too low" or "Too high".
 *
 * WHY, MEASURED rather than argued. Ten ordinary bars (the books' two worked recipes, a
 * classic 34/33/33, castile, bastile, tallow, lard, palm-free, a gentle low-cleansing bar,
 * a high-butter bar) and six recipes with a real, named problem (sunflower-heavy,
 * soybean-heavy, hemp and flax, a hydrogenated soy, meadowfoam, broccoli seed):
 *
 *   flag both directions on all nine groups   ordinary flagged 10/10 (26 of 90)   caught 6/6
 *   flag nothing                              ordinary flagged  0/10              caught 0/6
 *   flag high only where a failure is stated  ordinary flagged  0/10              caught 6/6
 *
 * Under the first, the one warning that mattered was buried: the sunflower-heavy recipe
 * raised five flags, four of them noise. A band describing where most recipes sit is not a
 * band of acceptable values.
 *
 * NEVER FLAGGED: lauric + myristic, palmitic + stearic, oleic, ricinoleic. Their bands are
 * Kenna Cote's personal targets (see FORMULATION_FATTY_ACID_GUIDE), and her own survey
 * observed lauric + myristic and palmitic + stearic averaging about 22, below those bands'
 * middles. Reading outside them is a difference of recipe style: the books' own worked basic
 * recipe reads low lauric, low oleic and high ricinoleic at once, and castor oil is optional.
 * Same principle as UNJUDGED_PROPERTIES and FORMULATION_PREFERENCE_GUIDE — a personal target
 * must not decide whether a maker's recipe reads as wrong.
 *
 * NEVER FLAGGED LOW, on any group: less of a rancidity-prone acid is no fault, and 0% trans
 * is the goal.
 *
 * This uses the existing band highs and invents no threshold.
 */
import { FORMULATION_FATTY_ACID_GUIDE } from './formulation-guide.js';
import { rangeVerdict } from './range-verdict.js';

type FattyAcidGroupKey = keyof typeof FORMULATION_FATTY_ACID_GUIDE;

/** The groups whose HIGH reading is flagged, each with the failure it warns of. */
export const FATTY_ACID_HIGH_WARNINGS: Readonly<Partial<Record<FattyAcidGroupKey, string>>> = {
  // Polyunsaturates oxidise. The books: oils "high in linolenic and linoleic polyunsaturated
  // fatty acids will often have a reduced shelf life and are more prone to rancidity and DOS",
  // answering "How much is 'too much'" with "Use a lower concentration of 15-20%
  // polyunsaturated fats per recipe" (CP:5516-5523, p161; HP:4834-4840). DeeAnna Weed: "limit
  // these two fatty acids to 15% or less". The band highs here, 14 and 1, sum to 15.
  linoleic: 'rancidity and DOS',
  linolenic: 'rancidity and DOS',
  // ~0% in natural oils, so a reading above 2% means a partially hydrogenated oil.
  trans: 'a hydrogenated oil',
  // ~0% in ordinary bath oils; a specialty oil (meadowfoam, high-erucic broccoli seed,
  // macadamia's palmitoleic) is what pushes these past 2%.
  otherSaturated: 'an unusual oil',
  otherUnsaturated: 'an unusual oil',
};

/** Whether this group can be flagged at all. */
export function isFattyAcidHighWarned(key: FattyAcidGroupKey): boolean {
  return Object.prototype.hasOwnProperty.call(FATTY_ACID_HIGH_WARNINGS, key);
}

/**
 * Whether a reading earns "Too high": the group is warned AND the figure the panel prints
 * (one decimal) sits above its band. The single source for both the Meters rows and the
 * radar, so the two views cannot disagree.
 */
export function fattyAcidIsTooHigh(key: FattyAcidGroupKey, value: number): boolean {
  if (!isFattyAcidHighWarned(key)) return false;
  const guide = FORMULATION_FATTY_ACID_GUIDE[key];
  return rangeVerdict(value, guide.low, guide.high, 1) === 'high';
}
