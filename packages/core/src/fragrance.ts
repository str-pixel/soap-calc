// packages/core/src/fragrance.ts
/**
 * Fragrance math. Dose on total oil weight (CP:9612-9614) — never a flat percent of soap
 * weight or teaspoons (CP:9577-9605) — or on the finished solution for liquid soap.
 * Compliance figures compare against the FINISHED PRODUCT: IFRA Standards express limits
 * "as a Maximum Acceptable Concentration of fragrance ingredients in the finished consumer
 * product, not in the fragrance mixture" (IFRA 51st Amendment, Guidance for the use of the
 * IFRA Standards, p.11, https://ifrafragrance.org/ — retrieved 2026-09-08); bar soap, liquid
 * soap, body washes and shampoo are all Category 9 in its product mapping.
 */

import { gramsFromDose } from './additives.js';

export type VanillinBrowning = 'none' | 'light' | 'deep';
export type AllergenInput = { name: string; percentOfFragrance: number; fragranceGrams: number };
export type LabelAllergen = { name: string; percentOfProduct: number };

/**
 * IFRA's ceiling for a fragrance material in CATEGORY 9 — soap and other rinse-off products
 * for the body — as a percent of the FINISHED PRODUCT, which is the same basis the labelling
 * threshold uses. Read off IFRA's own standard for each substance, all retrieved 2026-09-10
 * from https://d3t14p1xronwr0.cloudfront.net/docs/standards/IFRA_STD_<n>.pdf:
 *   Eugenol 4.9% (STD 035, Amendment 51) · Cinnamal 0.49% (STD 018, "Cinnamic aldehyde") ·
 *   Citral 1.2% (STD 021) · Citronellol 24% (STD 022) · Geraniol 2.8% (STD 037) ·
 *   Farnesol 2.3% (STD 036) · Isoeugenol 0.21% (STD 048) · Benzyl salicylate 14% (STD 011) ·
 *   Coumarin 0.52% (STD 023).
 *
 * Note what is NOT here. Limonene, linalool and benzyl benzoate carry no Category 9
 * concentration limit — IFRA's standards for the first two are about peroxide value, not
 * how much you may use — so the app says nothing rather than inventing a ceiling. And a
 * figure of 0.05% for cinnamal circulates in soapmaking guides; IFRA's own standard says
 * 0.49% for this category, so the app follows the standard.
 *
 * IFRA is an industry standard rather than EU law, and it is what a cosmetic safety
 * assessment leans on: the EU sets no general essential-oil dose at all.
 */
export const IFRA_CATEGORY_NINE_PERCENT: Readonly<Record<string, number>> = {
  Eugenol: 4.9,
  Cinnamal: 0.49,
  Citral: 1.2,
  Citronellol: 24,
  Geraniol: 2.8,
  Farnesol: 2.3,
  Isoeugenol: 0.21,
  'Benzyl salicylate': 14,
  Coumarin: 0.52,
};

/**
 * IFRA's ceiling turned into the basis the maker actually types in. The ceiling is a percent
 * of the FINISHED PRODUCT; a supplier's declaration is a percent of the OIL; the fragrance's
 * share of the product joins them. At a share of S percent, a ceiling of C percent of the
 * product is C ÷ S × 100 percent of the oil — so citral's 1.2% is 52% of a lemongrass that
 * is 2.3% of the bar, and a lemongrass that is typically 70–85% citral is over it at that
 * dose. Null with no dose to work from.
 */
export function ifraCeilingAsPercentOfFragrance(
  ceilingPercentOfProduct: number | null,
  fragranceShareOfProductPercent: number,
): number | null {
  if (!finite(ceilingPercentOfProduct) || ceilingPercentOfProduct <= 0) return null;
  if (!finite(fragranceShareOfProductPercent) || fragranceShareOfProductPercent <= 0) return null;
  return (ceilingPercentOfProduct / fragranceShareOfProductPercent) * 100;
}

/** The Category 9 ceiling for a substance, or null where IFRA sets none. */
export function ifraCategoryNinePercent(substance: string): number | null {
  return IFRA_CATEGORY_NINE_PERCENT[substance.trim()] ?? null;
}

/** Annex III of (EC) 1223/2009: the listed allergens are named on the label when their
 * concentration EXCEEDS 0.01% in a rinse-off product (0.001% leave-on). Regulation (EU)
 * 2023/1545 widens the list for products placed on the market from 31 July 2026
 * (secondary sources, retrieved 2026-09-08: coslaw.eu, sgs.com — EUR-Lex blocks fetching). */
export const ALLERGEN_LABEL_THRESHOLD_RINSE_OFF_PERCENT = 0.01;
/** "Exceeds" is a strict comparison; this guards the float drift of a share that lands
 * on the threshold arithmetically (1e-9 % of product is 0.01 mg in a tonne). */
const THRESHOLD_TOLERANCE = 1e-9;

const finite = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

export function fragranceGrams(percent: number | null, basisGrams: number): number {
  if (!finite(percent) || percent <= 0) return 0;
  // The additive multiplier is the one source of percent-of-basis math.
  return gramsFromDose(basisGrams, percent, 'percent') ?? 0;
}

export function fragranceShareOfProduct(fragranceGrams: number, productGrams: number): number {
  if (!finite(fragranceGrams) || fragranceGrams <= 0 || !finite(productGrams) || productGrams <= 0) return 0;
  return (100 * fragranceGrams) / productGrams;
}

/**
 * How much of the OIL an allergen has to be before it must go on the label, at this dose.
 *
 * The declaration compares the allergen's share of the FINISHED PRODUCT against the
 * threshold, and that share is the fragrance's own share times the allergen's share of the
 * fragrance. Turned around: at a fragrance share of S percent, an allergen clears the line
 * once it is more than threshold ÷ S × 100 percent of the oil. At 2% of the bar that is
 * 0.5% of the oil — which is why the answer is almost always "yes, name it" for a main
 * constituent, and why a trace one can be present and still not need naming.
 *
 * Null when there is no dose to work from: with no fragrance in the product there is
 * nothing to clear.
 */
export function allergenBreakEvenPercentOfFragrance(
  shareOfProductPercent: number,
  thresholdPercent = ALLERGEN_LABEL_THRESHOLD_RINSE_OFF_PERCENT,
): number | null {
  if (!finite(shareOfProductPercent) || shareOfProductPercent <= 0) return null;
  if (!finite(thresholdPercent) || thresholdPercent <= 0) return null;
  return (thresholdPercent / shareOfProductPercent) * 100;
}

export function fragranceOverSupplierMax(shareOfProduct: number, supplierMaxPercent: number | null): boolean {
  if (!finite(supplierMaxPercent) || supplierMaxPercent <= 0) return false;
  return shareOfProduct > supplierMaxPercent;
}

/** Only the two the text names: clove and cinnamon essential oils carry eugenol /
 * cinnamaldehyde, react with the lye as accelerants (CP:9531-9537) and irritate — the text
 * advises against cinnamon EO in soap outright (CP:9589-9592). The section holds essential
 * oils only, so the name is the whole test. */
export function essentialOilCaution(name: string): boolean {
  return /clove|cinnamon/i.test(name);
}

/** "A higher vanillin content will cause a deeper browning … while a 1% vanillin
 * concentration will create a lighter shade" (CP:9740). */
export function vanillinBrowning(vanillinPercent: number | null): VanillinBrowning {
  if (!finite(vanillinPercent) || vanillinPercent <= 0) return 'none';
  return vanillinPercent <= 1 ? 'light' : 'deep';
}

/** Vanilla stabilizer, mixed into the fragrance first (CP:9788-9789): 1 part to 2 parts
 * fragrance for less than 10% vanillin, 1 to 1 for more than 10% (CP:9789-9792). */
export function vanillaStabilizerGrams(fragranceGrams: number, vanillinPercent: number | null): number {
  if (!finite(vanillinPercent) || vanillinPercent <= 0 || !finite(fragranceGrams) || fragranceGrams <= 0) return 0;
  return vanillinPercent > 10 ? fragranceGrams : fragranceGrams / 2;
}

export function allergensToLabel(allergens: AllergenInput[], productGrams: number): LabelAllergen[] {
  if (!finite(productGrams) || productGrams <= 0) return [];
  const grams = new Map<string, { name: string; grams: number }>();
  for (const a of allergens) {
    if (!finite(a.percentOfFragrance) || a.percentOfFragrance <= 0 || !finite(a.fragranceGrams) || a.fragranceGrams <= 0) continue;
    const id = a.name.trim().toLowerCase();
    if (!id) continue;
    const g = (a.fragranceGrams * a.percentOfFragrance) / 100;
    const cur = grams.get(id);
    if (cur) cur.grams += g;
    else grams.set(id, { name: a.name.trim(), grams: g });
  }
  const out: LabelAllergen[] = [];
  for (const { name, grams: g } of grams.values()) {
    const percentOfProduct = (100 * g) / productGrams;
    if (percentOfProduct > ALLERGEN_LABEL_THRESHOLD_RINSE_OFF_PERCENT + THRESHOLD_TOLERANCE) out.push({ name, percentOfProduct });
  }
  return out;
}

/** "If using a superfat in the recipe, there is an increased risk of separation … mix equal
 * parts polysorbate 20 to your FO/EO" (LS:16987-16989). */
export function polysorbate20Grams(fragranceGrams: number, deliveredSuperfatPercent: number | null): number {
  if (!finite(deliveredSuperfatPercent) || deliveredSuperfatPercent <= 0) return 0;
  if (!finite(fragranceGrams) || fragranceGrams <= 0) return 0;
  return fragranceGrams;
}
