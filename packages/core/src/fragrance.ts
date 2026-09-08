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

export type FragranceKind = 'fragrance-oil' | 'essential-oil';
export type VanillinBrowning = 'none' | 'light' | 'deep';
export type AllergenInput = { name: string; percentOfFragrance: number; fragranceGrams: number };
export type LabelAllergen = { name: string; percentOfProduct: number };

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

export function fragranceOverSupplierMax(shareOfProduct: number, supplierMaxPercent: number | null): boolean {
  if (!finite(supplierMaxPercent) || supplierMaxPercent <= 0) return false;
  return shareOfProduct > supplierMaxPercent;
}

/** Only the two the text names: clove and cinnamon essential oils carry eugenol /
 * cinnamaldehyde, react with the lye as accelerants (CP:9531-9537) and irritate — the text
 * advises against cinnamon EO in soap outright (CP:9589-9592). A fragrance OIL named after
 * them is a synthetic blend and never triggers this. */
export function essentialOilCaution(kind: FragranceKind, name: string): boolean {
  if (kind !== 'essential-oil') return false;
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
