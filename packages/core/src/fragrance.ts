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

import { gramsFromDose, type AdditiveProcess } from './additives.js';
import { formatPropertyRangePercent } from './property-display.js';

export type VanillinBrowning = 'none' | 'light' | 'deep';
export type AllergenInput = { name: string; percentOfFragrance: number; fragranceGrams: number };
export type LabelAllergen = { name: string; percentOfProduct: number };

/**
 * IFRA's ceiling for a fragrance material in CATEGORY 9 — soap and other rinse-off products
 * for the body — as a percent of the FINISHED PRODUCT, which is the same basis the labelling
 * threshold uses. Read off IFRA's own standards, consolidated at the 51st Amendment
 * ([IFRA-51], retrieved 2026-09-11 and text-extracted locally:
 * https://d3t14p1xronwr0.cloudfront.net/docs/Standards-Documentation/ifra-standards-51st-amendment.pdf):
 *   Eugenol 4.9% (2023 revision) · Cinnamal 0.49% ("Cinnamic aldehyde") · Citral 1.2%, whose
 *   standard names geranial and neral in scope · Citronellol 24% · Geraniol 2.8% (2023
 *   revision) · Farnesol 2.3% · Isoeugenol 0.21% · Benzyl salicylate 14% · Coumarin 0.52% ·
 *   Cedrene 2.9%, α- and β- both in scope · Methyl eugenol 0.0017% (2023 revision) ·
 *   Estragole 0.0041% (2023 revision) · Carvone 0.18% · Citronellal 1.4% · Benzyl alcohol
 *   2.2% · 2-Hexenal 0.015% (2023 revision) · Benzaldehyde 0.49%.
 *
 * Note what is NOT here. Limonene and linalool carry no Category 9 concentration limit —
 * IFRA's standards for them are about peroxide value, not how much you may use — and benzyl
 * benzoate has no standard at all, so the app says nothing rather than inventing a ceiling.
 * A figure of 0.05% for cinnamal circulates in soapmaking guides; IFRA's own standard says
 * 0.49% for this category, so the app follows the standard. Pulegone and menthofuran, the
 * peppermint constituents medicines regulators watch, have no IFRA standard either.
 *
 * IFRA is an industry standard rather than EU law, and it is what a cosmetic safety
 * assessment leans on: the EU sets no general essential-oil dose at all. Where EU law DOES
 * name a limit on a constituent, it is in EU_ANNEX_III_RINSE_OFF_LIMIT_PERCENT below.
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
  Cedrene: 2.9,
  'Methyl eugenol': 0.0017,
  Estragole: 0.0041,
  Carvone: 0.18,
  Citronellal: 1.4,
  'Benzyl alcohol': 2.2,
  '2-Hexenal': 0.015,
  Benzaldehyde: 0.49,
};

/**
 * The one constituent of a catalog oil that EU LAW itself limits in a rinse-off product, as
 * a percent of the finished product. Regulation (EC) 1223/2009 Annex III entry 102, methyl
 * eugenol: 0.001% in rinse-off products (0.0002% other leave-on and oral care, 0.01% fine
 * fragrance, 0.004% eau de toilette) — quoted in the SCCS's tea tree opinion, SCCS/1681/25
 * p.12 ([SCCS-TTO], retrieved 2026-09-11:
 * https://health.ec.europa.eu/document/download/827f8a57-c6f2-4d6d-9bbd-2ef12384ffbf_en?filename=sccs_o_303.pdf),
 * and read in Annex III itself on 2026-09-08 (legislation.gov.uk mirror; EUR-Lex blocks
 * fetching). It is a LIMIT, not a labelling threshold: a clove or tea tree oil carries methyl
 * eugenol as a trace, and the trace binds long before eugenol's IFRA cap would.
 */
export const EU_ANNEX_III_RINSE_OFF_LIMIT_PERCENT: Readonly<Record<string, number>> = {
  'Methyl eugenol': 0.001,
};

/**
 * What a bar or a bottle USUALLY carries, in the basis the maker doses in. Bars: 2–6% of
 * total oil weight (CP:9612-9614, 16777); liquid soap: 0.5–3% of the finished solution, 3%
 * at most (LS:2950-2953, 16991-16998). Not a safety ceiling — an oil's own ceiling
 * (essentialOilCeiling) is that — but past the top of it no book and no standard stands
 * behind the dose, and the app says so. Every sentence that quotes the range is built from
 * this one record, so the number and the words cannot drift apart.
 */
export const USUAL_DOSE_RANGE_PERCENT: Readonly<Record<AdditiveProcess, { low: number; high: number }>> = {
  cp: { low: 2, high: 6 },
  hp: { low: 2, high: 6 },
  ls: { low: 0.5, high: 3 },
};

export function fragranceOverUsualRange(percent: number | null, process: AdditiveProcess): boolean {
  return finite(percent) && percent > USUAL_DOSE_RANGE_PERCENT[process].high;
}

/** "bars usually carry 2–6% of oil weight" / "liquid soap usually carries 0.5–3% of the
 * finished solution, 3% at most". */
export function usualDoseClause(process: AdditiveProcess): string {
  const { low, high } = USUAL_DOSE_RANGE_PERCENT[process];
  return process === 'ls'
    ? `liquid soap usually carries ${formatPropertyRangePercent(low, high, 1)} of the finished solution, ${high}% at most`
    : `bars usually carry ${formatPropertyRangePercent(low, high)} of oil weight`;
}

/** The same range as the thing a dose is past: "the 2–6% of oil weight bars usually carry". */
export function usualDosePastClause(process: AdditiveProcess): string {
  const { low, high } = USUAL_DOSE_RANGE_PERCENT[process];
  return process === 'ls'
    ? `the ${high}% of the finished solution liquid soap carries at most`
    : `the ${formatPropertyRangePercent(low, high)} of oil weight bars usually carry`;
}

/**
 * How many decimals a ceiling and everything compared with it are printed at: one from 1%
 * up (1.4, 9.6), two below (0.65). A ceiling and a dose in one sentence share the figure.
 */
export function ceilingDigits(ceilingPercent: number): number {
  return ceilingPercent >= 1 ? 1 : 2;
}

/** A percent at a fixed number of decimals, rounded the way the caller says, trailing
 * zeros dropped (1, not 1.0). The epsilon keeps 1.1 × 10 = 11.000000000000002 from
 * ceiling to 1.2. */
export function formatPercentToward(value: number, digits: number, direction: 'down' | 'up' | 'nearest'): string {
  const f = 10 ** digits;
  const eps = 1e-9;
  const n =
    direction === 'down' ? Math.floor(value * f + eps)
    : direction === 'up' ? Math.ceil(value * f - eps)
    : Math.round(value * f);
  return String(n / f);
}

/**
 * A dose and its ceiling, printed so that the figures never contradict the verdict they
 * sit beside. The ceiling is rounded DOWN, so typing the printed figure never lands over
 * it. A dose that is over is rounded UP, so it always prints above the ceiling ("Up to 1%
 * … This dose is 1.1% — over it", never "1% … 1% — over it"). A dose that is under is
 * printed to the nearest, and rounded down instead only when nearest would put it above
 * the printed ceiling.
 */
export function formatShareAgainstCeiling(
  shareOfProduct: number,
  ceilingPercentOfProduct: number,
  over: boolean,
): { share: string; ceiling: string } {
  const d = ceilingDigits(ceilingPercentOfProduct);
  const ceiling = formatPercentToward(ceilingPercentOfProduct, d, 'down');
  let share = formatPercentToward(shareOfProduct, d, over ? 'up' : 'nearest');
  if (!over && Number(share) > Number(ceiling)) share = formatPercentToward(shareOfProduct, d, 'down');
  return { share, ceiling };
}

/**
 * A product-basis ceiling turned into the basis the maker types in, for one recipe. The
 * product carries the oil itself and whatever rides with the dose (polysorbate 20 at 1:1
 * in liquid soap, a vanilla stabilizer), so the most of the oil that fits is solved, not
 * scaled: with the rest of the product at R grams, a ceiling of c (a fraction) and k grams
 * of extras per gram of oil, g ÷ (R + g + k·g) = c gives g = c·R ÷ (1 − c·(1 + k)); over
 * the dose basis that is the percent to type. Null until the product weight is known.
 */
export function fragranceDoseAtCeiling(
  ceilingPercentOfProduct: number | null,
  productGrams: number | null,
  fragranceGrams: number,
  extrasWithDoseGrams: number,
  doseBasisGrams: number,
): number | null {
  if (!finite(ceilingPercentOfProduct) || !finite(productGrams) || productGrams <= 0 || doseBasisGrams <= 0) return null;
  const c = ceilingPercentOfProduct / 100;
  if (c <= 0 || c >= 1) return null;
  const k = fragranceGrams > 0 ? Math.max(0, extrasWithDoseGrams) / fragranceGrams : 0;
  const rest = Math.max(0, productGrams - fragranceGrams * (1 + k));
  const denominator = 1 - c * (1 + k);
  if (denominator <= 0) return null;
  return (100 * ((c * rest) / denominator)) / doseBasisGrams;
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
