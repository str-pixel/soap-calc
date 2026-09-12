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
import { finite, roundScaled } from './numeric.js';
import { formatPropertyRangePercent } from './property-display.js';

export type VanillinBrowning = 'none' | 'light' | 'deep';

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
 *   2.2% · 2-Hexenal 0.015% (2023 revision) · Benzaldehyde 0.49% · Benzyl benzoate 1.9% ·
 *   1-Octen-3-yl acetate 2.9% · cis-3-Hexenyl isovalerate 0.84% (2023) · Citronellyl acetate
 *   5.4% (2023) · Isoeugenyl acetate 0.20% (2023) · Benzyl cinnamate 3.9% · Cinnamic alcohol
 *   0.76% · o-Methoxycinnamaldehyde 0.84% · alpha-Bisabolol 4.6% · p-Cresol 0.0050% (2023).
 *   Three more are PROHIBITED as such but allowed as a natural constituent up to a level in
 *   the finished product that the standard's notebox sets for every category alike:
 *   7-Methoxycoumarin 0.01%, Benzyl cyanide 0.01%, Safrole 0.01% (with isosafrole and
 *   dihydrosafrole). They sit in this table at that figure.
 *
 * Note what is NOT here. Limonene and linalool carry no Category 9 concentration limit —
 * IFRA's standards for them are about peroxide value, not how much you may use — so the app
 * says nothing rather than inventing a ceiling. A figure of 0.05% for cinnamal circulates in
 * soapmaking guides; IFRA's own standard says 0.49% for this category, so the app follows
 * the standard. Pulegone and menthofuran, the peppermint constituents medicines regulators
 * watch, have no IFRA standard either.
 *
 * IFRA is an industry standard rather than EU law, and it is what a cosmetic safety
 * assessment leans on: the EU sets no general essential-oil dose at all. Where EU law DOES
 * name a limit on a constituent, it is in EU_LAW_RINSE_OFF_LIMIT_PERCENT below.
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
  'Benzyl benzoate': 1.9,
  '1-Octen-3-yl acetate': 2.9,
  'cis-3-Hexenyl isovalerate': 0.84,
  'Citronellyl acetate': 5.4,
  'Isoeugenyl acetate': 0.2,
  'Benzyl cinnamate': 3.9,
  'Cinnamic alcohol': 0.76,
  'o-Methoxycinnamaldehyde': 0.84,
  'alpha-Bisabolol': 4.6,
  'p-Cresol': 0.005,
  '7-Methoxycoumarin': 0.01,
  'Benzyl cyanide': 0.01,
  Safrole: 0.01,
};

/**
 * The constituents of a catalog oil that EU LAW itself limits in the finished product, as a
 * percent of it, each with the annex that says so — the sentence names the annex.
 *   Methyl eugenol — Regulation (EC) 1223/2009 Annex III entry 102: 0.001% in rinse-off
 *   products (0.0002% other leave-on and oral care, 0.01% fine fragrance, 0.004% eau de
 *   toilette), as quoted in the SCCS's tea tree opinion, SCCS/1681/25 p.12 ([SCCS-TTO],
 *   retrieved 2026-09-11:
 *   https://health.ec.europa.eu/document/download/827f8a57-c6f2-4d6d-9bbd-2ef12384ffbf_en?filename=sccs_o_303.pdf),
 *   and read in Annex III itself on 2026-09-08 (legislation.gov.uk mirror; EUR-Lex blocks
 *   fetching). A LIMIT, not a labelling threshold: a clove or tea tree oil carries methyl
 *   eugenol as a trace, and the trace binds long before eugenol's IFRA cap would.
 *   Safrole — Annex II entry 360: prohibited "except for normal content in the natural
 *   essences used and provided the concentration does not exceed: 100 ppm in the finished
 *   product" (read 2026-09-11 on the legislation.gov.uk mirror). 100 ppm is 0.01%, the same
 *   figure IFRA's own notebox sets.
 */
export const EU_LAW_RINSE_OFF_LIMIT_PERCENT: Readonly<Record<string, { percent: number; where: 'Annex III' | 'Annex II' }>> = {
  'Methyl eugenol': { percent: 0.001, where: 'Annex III' },
  Safrole: { percent: 0.01, where: 'Annex II' },
};

/**
 * What the books' own recipes run to, in the basis the maker doses in, and where a dose
 * starts. Bars: the cold-process text sets no general range — it says rates differ by oil
 * and to follow the supplier's tested rate (CP:9547-9552, 9565-9600) — and its recipes dose
 * essential oils at 3% (lavender CP:17556, lemongrass CP:17667, eucalyptus CP:17670), 5%
 * (tea tree CP:16761) and 6% (lemon CP:17084) of total oil weight, so 3–6% is what the
 * recipes run and 3% is where an oil the text does not dose itself starts. Liquid soap:
 * "fragrance concentration in liquid soap is 0.5-3%, with 3% at a maximum. Most FO/EOs
 * will only require 0.5-1%" (LS:13214-13215) — so 0.5–3%, and a start at the top of the
 * 0.5–1% most oils need. Not a safety ceiling — an oil's own ceiling (essentialOilCeiling)
 * is that — but past the top of the range no book and no standard stands behind the dose,
 * and the app says so. Every sentence that quotes these figures is built from this one
 * record, so the numbers and the words cannot drift apart.
 */
export const USUAL_DOSE_RANGE_PERCENT: Readonly<Record<AdditiveProcess, { low: number; high: number; start: number }>> = {
  cp: { low: 3, high: 6, start: 3 },
  hp: { low: 3, high: 6, start: 3 },
  ls: { low: 0.5, high: 3, start: 1 },
};

export function fragranceOverUsualRange(percent: number | null, process: AdditiveProcess): boolean {
  return finite(percent) && percent > USUAL_DOSE_RANGE_PERCENT[process].high;
}

/** "the bar recipes in the cold-process text run 3–6% of oil weight" / "liquid soap takes
 * 0.5–3% of the finished solution, 3% at most, and most oils need only 0.5–1%". The HP panel
 * says the same as the CP one: the hot-process text carries no fragrance figures of its own. */
export function usualDoseClause(process: AdditiveProcess): string {
  const { low, high, start } = USUAL_DOSE_RANGE_PERCENT[process];
  return process === 'ls'
    ? `liquid soap takes ${formatPropertyRangePercent(low, high, 1)} of the finished solution, ${high}% at most, and most oils need only ${formatPropertyRangePercent(low, start, 1)}`
    : `the bar recipes in the cold-process text run ${formatPropertyRangePercent(low, high)} of oil weight`;
}

/** The same range as the thing a dose is past: "the 3–6% of oil weight the cold-process
 * text's bar recipes run to". */
export function usualDosePastClause(process: AdditiveProcess): string {
  const { low, high } = USUAL_DOSE_RANGE_PERCENT[process];
  return process === 'ls'
    ? `the ${high}% of the finished solution liquid soap takes at most`
    : `the ${formatPropertyRangePercent(low, high)} of oil weight the cold-process text's bar recipes run to`;
}

/** "most oils need only 0.5–1% of a liquid soap for a potent scent" — the LS start's reason. */
export function lsPotentDoseClause(): string {
  const { low, start } = USUAL_DOSE_RANGE_PERCENT.ls;
  return `most oils need only ${formatPropertyRangePercent(low, start, 1)} of a liquid soap for a potent scent`;
}

/** A dose printed beside the verdict that it is past the usual range: rounded UP at two
 * decimals, so a 6.004 that is over a 6 never prints as "6% is past 6%". */
export function formatDosePastUsualRange(percent: number): string {
  return formatPercentToward(percent, 2, 'up');
}

/**
 * How many decimals a ceiling and everything compared with it are printed at: one from 1%
 * up (1.4, 9.6), two below (0.65). A ceiling and a dose in one sentence share the figure.
 */
function ceilingDigits(ceilingPercent: number): number {
  return ceilingPercent >= 1 ? 1 : 2;
}

/** A percent at a fixed number of decimals, rounded the way the caller says (core
 * roundScaled), trailing zeros dropped (1, not 1.0). */
export function formatPercentToward(value: number, digits: number, direction: 'down' | 'up' | 'nearest'): string {
  return String(roundScaled(value, 10 ** digits, direction));
}

/** The relative tolerance of the ceiling verdict: a share that lands ON the ceiling
 * arithmetically (a dose typed at the figure the row printed) is not over it. */
const CEILING_TOLERANCE = 1e-9;

/** THE verdict on a ceiling — the compute step, the panel and the rule all read this one
 * predicate, so no two surfaces can disagree about "over". */
export function fragranceOverCeiling(shareOfProduct: number, ceilingPercentOfProduct: number | null): boolean {
  if (!finite(ceilingPercentOfProduct) || ceilingPercentOfProduct <= 0) return false;
  return shareOfProduct > 0 && shareOfProduct > ceilingPercentOfProduct * (1 + CEILING_TOLERANCE);
}

/**
 * A dose and its ceiling, printed so that the figures never contradict the verdict they
 * sit beside — and never overstate the dose to do it. The ceiling is rounded DOWN, so
 * typing the printed figure never lands over it; so is the ceiling turned into the dose
 * basis. The dose prints to the nearest at the ceiling's decimals. Where it is over but
 * the nearest figure would read at or below the printed ceiling, it prints at one more
 * decimal ("Up to 1% … This dose is 1.04% — over it", not "1% … 1% — over it" and not a
 * rounded-up "1.1%"), rounded up at that finer decimal only as a last resort. Where it is
 * under but the nearest figure would read above the printed ceiling, it prints rounded
 * down instead. The verdict itself is fragranceOverCeiling's, derived here, never passed in.
 */
export function formatShareAgainstCeiling(
  shareOfProduct: number | null,
  ceilingPercentOfProduct: number,
  ceilingPercentOfBasis: number | null = null,
): { share: string | null; ceiling: string; basis: string | null; over: boolean } {
  const d = ceilingDigits(ceilingPercentOfProduct);
  const ceiling = formatPercentToward(ceilingPercentOfProduct, d, 'down');
  const basis = finite(ceilingPercentOfBasis) ? formatPercentToward(ceilingPercentOfBasis, d, 'down') : null;
  if (!finite(shareOfProduct) || shareOfProduct <= 0) return { share: null, ceiling, basis, over: false };
  const over = fragranceOverCeiling(shareOfProduct, ceilingPercentOfProduct);
  let share = formatPercentToward(shareOfProduct, d, 'nearest');
  if (over) {
    if (Number(share) <= Number(ceiling)) share = formatPercentToward(shareOfProduct, d + 1, 'nearest');
    if (Number(share) <= Number(ceiling)) share = formatPercentToward(shareOfProduct, d + 1, 'up');
  } else if (Number(share) > Number(ceiling)) {
    share = formatPercentToward(shareOfProduct, d, 'down');
  }
  return { share, ceiling, basis, over };
}

/**
 * A product-basis ceiling turned into the basis the maker types in, for one recipe. The
 * product grows by m grams for every gram of oil put in — the oil itself, what rides with
 * it (polysorbate 20 at 1:1 in liquid soap, a vanilla stabilizer) and, in liquid soap, the
 * preservative dosed on the whole pot — so the most of the oil that fits is solved, not
 * scaled: with the rest of the product at R grams and a ceiling of c (a fraction),
 * g ÷ (R + m·g) = c gives g = c·R ÷ (1 − c·m); over the dose basis that is the percent to
 * type. m is known from the recipe before any dose is typed, so the figure does not move
 * when one is. Null until the product weight is known, or where c·m reaches 1 (no dose
 * fits under the ceiling).
 */
export function fragranceDoseAtCeiling(
  ceilingPercentOfProduct: number | null,
  productGrams: number | null,
  fragranceGrams: number,
  productGramsPerGramOfOil: number,
  doseBasisGrams: number,
): number | null {
  if (!finite(ceilingPercentOfProduct) || !finite(productGrams) || productGrams <= 0 || !(doseBasisGrams > 0)) return null;
  const c = ceilingPercentOfProduct / 100;
  if (c <= 0 || c >= 1) return null;
  const m = finite(productGramsPerGramOfOil) && productGramsPerGramOfOil >= 1 ? productGramsPerGramOfOil : 1;
  const rest = Math.max(0, productGrams - Math.max(0, fragranceGrams) * m);
  const denominator = 1 - c * m;
  if (denominator <= 0) return null;
  return (100 * ((c * rest) / denominator)) / doseBasisGrams;
}

/** Annex III of (EC) 1223/2009: the listed allergens are named on the label when their
 * concentration EXCEEDS 0.01% in a rinse-off product (0.001% leave-on). Regulation (EU)
 * 2023/1545 widens the list for products placed on the market from 31 July 2026
 * (secondary sources, retrieved 2026-09-08: coslaw.eu, sgs.com — EUR-Lex blocks fetching). */
export const ALLERGEN_LABEL_THRESHOLD_RINSE_OFF_PERCENT = 0.01;
export function fragranceGrams(percent: number | null, basisGrams: number): number {
  if (!finite(percent) || percent <= 0) return 0;
  // The additive multiplier is the one source of percent-of-basis math.
  return gramsFromDose(basisGrams, percent, 'percent') ?? 0;
}

export function fragranceShareOfProduct(fragranceGrams: number, productGrams: number): number {
  if (!finite(fragranceGrams) || fragranceGrams <= 0 || !finite(productGrams) || productGrams <= 0) return 0;
  return (100 * fragranceGrams) / productGrams;
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

/** "If using a superfat in the recipe, there is an increased risk of separation … mix equal
 * parts polysorbate 20 to your FO/EO" (LS:16987-16989). */
export function polysorbate20Grams(fragranceGrams: number, deliveredSuperfatPercent: number | null): number {
  if (!finite(deliveredSuperfatPercent) || deliveredSuperfatPercent <= 0) return 0;
  if (!finite(fragranceGrams) || fragranceGrams <= 0) return 0;
  return fragranceGrams;
}
