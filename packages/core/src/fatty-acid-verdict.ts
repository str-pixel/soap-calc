/**
 * Which fatty-acid group readings may be FLAGGED — only a HIGH reading, and only on a group
 * whose reading names its own cause. Every other group still shows its value and its typical
 * band; it just never earns a "Too low" or "Too high".
 *
 * FLAGGED HIGH: trans and the two catch-alls. Each sits near 0% in ordinary oils, so a high
 * reading identifies a hydrogenated oil or an unusual one without needing anything else.
 *
 * RANCIDITY IS NOT JUDGED HERE (since 2026-09-13). The formulation insights own it
 * (dos_risk_no_antioxidant, pufa_cap_superfat, high_poly_high_superfat), because the risk
 * depends on things this panel cannot see: the superfat, and whether an antioxidant or
 * chelator is in the recipe. The books frame it the same way: "a lower concentration of
 * 15-20% polyunsaturated fats per recipe" is the first of five listed options for handling
 * the risk, alongside a 3-5% superfat, a stable post-cook superfat, chelating agents and
 * high-oleic oils (CP:5516-5550, p161-162). Measured on the catalog the app loads
 * (canonical-oils-lite): 25 everyday bars, 3 heavy polyunsaturated recipes, and each heavy
 * recipe again with BHT, ROE or EDTA added.
 *
 *   rancidity rule on this panel                everyday flagged  heavy caught     contradicts insights
 *   linoleic > 14 or linolenic > 1 (adcc7f5)         4/25           3/3            4 recipes, 9/9 with an antioxidant
 *   one combined total > 18, 20 or 25                0/25           3/3            9/9 once an antioxidant is added
 *   none: insights only                              0/25           3/3 (insight)  never
 *
 * A limit on this panel cannot avoid the last column: with an antioxidant the insight
 * correctly goes quiet, and a panel that sees only fatty acids keeps flagging. The per-acid
 * rule was worse still, firing on a 20% canola bar at 12.8% total polyunsaturates.
 *
 * Open, and not introduced here: the no-antioxidant insight's 25% gate is marked unsourced in
 * its own comment.
 *
 * NEVER FLAGGED: lauric + myristic, palmitic + stearic, oleic and ricinoleic (recipe style),
 * and linoleic and linolenic (rancidity, above). The four style bands are Kenna Cote's
 * personal targets (see FORMULATION_FATTY_ACID_GUIDE), and her own survey observed lauric +
 * myristic and palmitic + stearic averaging about 22, below those bands' middles. The books'
 * own worked basic recipe reads low lauric, low oleic and high ricinoleic at once, and castor
 * oil is optional. Same principle as UNJUDGED_PROPERTIES and FORMULATION_PREFERENCE_GUIDE: a
 * personal target must not decide whether a maker's recipe reads as wrong.
 *
 * NEVER FLAGGED LOW, on any group: 0% trans is the goal, and the absence of an unusual oil is
 * no fault.
 *
 * This uses the existing band highs and invents no threshold.
 */
import { FORMULATION_FATTY_ACID_GUIDE } from './formulation-guide.js';
import { rangeVerdict } from './range-verdict.js';

type FattyAcidGroupKey = keyof typeof FORMULATION_FATTY_ACID_GUIDE;

/** The groups whose HIGH reading is flagged, each with the fault it names. */
export const FATTY_ACID_HIGH_WARNINGS: Readonly<Partial<Record<FattyAcidGroupKey, string>>> = {
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
