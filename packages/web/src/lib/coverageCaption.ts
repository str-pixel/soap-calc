import { formatCoveragePercent, isLowCoverage, isPartialCoverage } from '@soap-calc/core';
import { oilDisplayName } from './oilDisplay';

/**
 * The coverage wording the result panels and the batch sheet print, built in one place so no two
 * of them word or round the same figure differently.
 *
 * The figure is how much of the recipe's oil weight the data covers. For fatty acids each oil
 * counts by its weight times how complete its profile is (core calculateRecipeFattyAcids), so
 * 100% hazelnut oil, whose listed acids sum to 93%, reads 93 with no oil missing. For iodine and
 * INS it is the weight share of the oils that carry both values.
 */
type Coverage = { coveragePercent: number; missingOilIds: readonly string[] };

/** " (no data: Beeswax, Pine Tar)", or '' when no oil lacks data. */
export function missingOilsSuffix(missingOilIds: readonly string[]): string {
  return missingOilIds.length > 0 ? ` (no data: ${missingOilIds.map(oilDisplayName).join(', ')})` : '';
}

const basedOn = (c: Coverage): string => (isLowCoverage(c.coveragePercent) ? 'estimated from' : 'based on');
const isPartial = (c: Coverage): boolean => isPartialCoverage(c.coveragePercent, c.missingOilIds.length);

/**
 * What the fatty-acid percentages are a percent of, and how much of the recipe the data covers.
 * With an oil missing, core rescales the profile over the oils that have data, so each reading is
 * a percent of THEIR weight: 500 g grapeseed beside 500 g of a no-data oil reads linoleic 68%,
 * which is 34% of the recipe's oils.
 */
export function fattyAcidBasisCaption(c: Coverage): string {
  const base = c.missingOilIds.length > 0 ? 'Percent of the weight of oils with data' : 'Percent of oil weight';
  if (!isPartial(c)) return base;
  return `${base}, ${basedOn(c)} fatty-acid data for ${formatCoveragePercent(c.coveragePercent)}% of recipe oil weight${missingOilsSuffix(c.missingOilIds)}`;
}

/** The bar-property scores' coverage line, or null when the fatty-acid data is complete. */
export function scoresCoverageCaption(c: Coverage): string | null {
  if (!isPartial(c)) return null;
  return `Scores ${basedOn(c)} fatty-acid data for ${formatCoveragePercent(c.coveragePercent)}% of recipe oil weight${missingOilsSuffix(c.missingOilIds)}`;
}

/** Iodine and INS's coverage line, or null when every oil carries both values. */
export function indexesCoverageCaption(c: Coverage): string | null {
  if (!isPartial(c)) return null;
  return `Iodine/INS ${basedOn(c)} ${formatCoveragePercent(c.coveragePercent)}% of recipe oil weight${missingOilsSuffix(c.missingOilIds)}`;
}
