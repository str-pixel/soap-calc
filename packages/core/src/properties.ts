import { calculateRecipeFattyAcids } from './fatty-acids.js';

export type FattyAcidProfile = Record<string, number>;

export type SoapPropertyName =
  | 'bubbly'
  | 'cleansing'
  | 'condition'
  | 'hardness'
  | 'longevity'
  | 'creamy';

export type SoapProperties = Record<SoapPropertyName, number>;

export const SOAP_PROPERTY_FATTY_ACIDS: Record<SoapPropertyName, readonly string[]> = {
  bubbly: ['lauric', 'myristic', 'ricinoleic', 'caprylic', 'capric'],
  cleansing: ['lauric', 'myristic', 'caprylic', 'capric'],
  condition: [
    'ricinoleic',
    'oleic',
    'palmitoleic',
    'linoleic',
    'linolenic',
    'eicosenoic',
    'docosenoic',
    'docosadienoic',
    'erucic',
  ],
  // C8/C10 stay out of hardness: their soaps are too soluble to harden a bar,
  // even though they count toward cleansing/bubbly. The long-chain saturates
  // arachidic (C20:0), behenic (C22:0) and lignoceric (C24:0) harden like stearic.
  // elaidic (trans-C18:1) hardens like a saturated acid — sodium elaidate is a hard, high-melting
  // soap, unlike soft sodium oleate — so it counts toward hardness/longevity, NOT conditioning.
  hardness: ['lauric', 'myristic', 'palmitic', 'stearic', 'arachidic', 'behenic', 'lignoceric', 'elaidic'],
  longevity: ['palmitic', 'stearic', 'arachidic', 'behenic', 'lignoceric', 'elaidic'],
  creamy: ['palmitic', 'stearic', 'ricinoleic'],
};

export const SOAP_PROPERTY_LABELS: Record<SoapPropertyName, string> = {
  bubbly: 'Bubbly lather',
  cleansing: 'Cleansing',
  condition: 'Conditioning',
  hardness: 'Hardness',
  longevity: 'Longevity',
  creamy: 'Creamy lather',
};

/**
 * The calculator's recommended range per property — the column a soapmaker compares against
 * across tools, and what this app judges a recipe by. Transcribed from the "Suggested Range"
 * column (HP:9914-9941, book p367; reprinted CP:13106-13123, p456).
 *
 * NOT the only convention in the sources, and the difference is not an error to be tidied
 * away: the same books ALSO print a wider "Standard" column — cleansing 8-20 rather than
 * 12-22, hardness 30-60 rather than 29-54 (CP:11636-11703, p404) — and carry no longevity
 * row at all. What ships is deliberately the calculator column; see
 * docs/superpowers/plans/2026-07-17-multiprocess-remaining-roadmap.md:123. `longevity`'s
 * 25-50 was corrected to match the calculator in commit 7812bc1 (#44).
 */
export const SOAP_PROPERTY_GUIDE: Record<SoapPropertyName, { low: number; high: number }> = {
  bubbly: { low: 14, high: 46 },
  cleansing: { low: 12, high: 22 },
  condition: { low: 44, high: 69 },
  hardness: { low: 29, high: 54 },
  longevity: { low: 25, high: 50 },
  creamy: { low: 16, high: 48 },
};

/**
 * Below this fatty-acid-data coverage, renormalized properties/indexes rest on a small
 * known base, so they are treated as estimates: the UI marks them "~"/"estimated" and
 * suppresses out-of-range flags, and threshold-based insights are not asserted.
 */
export const LOW_COVERAGE_PERCENT = 80;

export function oilPropertiesFromFattyAcids(
  fattyAcids: FattyAcidProfile,
): SoapProperties {
  const result = {} as SoapProperties;

  for (const [property, acids] of Object.entries(SOAP_PROPERTY_FATTY_ACIDS) as [
    SoapPropertyName,
    readonly string[],
  ][]) {
    result[property] = acids.reduce(
      (sum, acid) => sum + (fattyAcids[acid] ?? 0),
      0,
    );
  }

  return result;
}

export type OilForProperties = {
  id: string;
  propertiesAvailable?: boolean;
  fattyAcids?: FattyAcidProfile;
};

export type RecipeOilForProperties = {
  oilId: string;
  weightGrams: number;
};

export type RecipePropertiesResult = {
  properties: SoapProperties | null;
  /** Share of recipe oil weight with fatty-acid data (0–100). */
  coveragePercent: number;
  /** Oils in the recipe that lack property data. */
  missingOilIds: string[];
};

// Properties are linear sums of fatty-acid percentages, so the weighted-average
// property equals the property of the weighted-average profile. The fatty-acid
// aggregation (with its renormalization over covered weight) is the single source
// of truth; see calculateRecipeFattyAcids for the coverage semantics.
export function calculateRecipeProperties(
  lines: RecipeOilForProperties[],
  oilLookup: Record<string, OilForProperties>,
): RecipePropertiesResult {
  const { profile, coveragePercent, missingOilIds } = calculateRecipeFattyAcids(
    lines,
    oilLookup,
  );
  return {
    properties: profile ? oilPropertiesFromFattyAcids(profile) : null,
    coveragePercent,
    missingOilIds,
  };
}
