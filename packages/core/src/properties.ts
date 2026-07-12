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
  // even though they count toward cleansing/bubbly. behenic (C22:0) is a long-chain
  // saturated acid, so it hardens like stearic.
  hardness: ['lauric', 'myristic', 'palmitic', 'stearic', 'behenic'],
  longevity: ['palmitic', 'stearic', 'behenic'],
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

/** Typical useful range for bar-soap property bars (common CP calculator convention). */
export const SOAP_PROPERTY_GUIDE: Record<SoapPropertyName, { low: number; high: number }> = {
  bubbly: { low: 14, high: 46 },
  cleansing: { low: 12, high: 22 },
  condition: { low: 44, high: 69 },
  hardness: { low: 29, high: 54 },
  longevity: { low: 14, high: 43 },
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
