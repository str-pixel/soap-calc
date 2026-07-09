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
    'linoleic',
    'linolenic',
    'eicosenoic',
    'docosenoid',
    'docosadienoic',
    'erucic',
  ],
  hardness: ['lauric', 'myristic', 'palmitic', 'stearic', 'caprylic', 'capric'],
  longevity: ['palmitic', 'stearic'],
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

export function calculateRecipeProperties(
  lines: RecipeOilForProperties[],
  oilLookup: Record<string, OilForProperties>,
): RecipePropertiesResult {
  const weighted = lines.filter((line) => line.weightGrams > 0);
  const totalWeight = weighted.reduce((sum, line) => sum + line.weightGrams, 0);

  if (totalWeight <= 0) {
    return { properties: null, coveragePercent: 0, missingOilIds: [] };
  }

  const properties = {
    bubbly: 0,
    cleansing: 0,
    condition: 0,
    hardness: 0,
    longevity: 0,
    creamy: 0,
  } satisfies SoapProperties;

  let coveredWeight = 0;
  const missingOilIds = new Set<string>();

  for (const line of weighted) {
    const oil = oilLookup[line.oilId];
    if (!oil?.propertiesAvailable || !oil.fattyAcids) {
      missingOilIds.add(line.oilId);
      continue;
    }

    coveredWeight += line.weightGrams;
    const oilProps = oilPropertiesFromFattyAcids(oil.fattyAcids);

    for (const key of Object.keys(properties) as SoapPropertyName[]) {
      properties[key] += oilProps[key] * line.weightGrams;
    }
  }

  if (coveredWeight <= 0) {
    return { properties: null, coveragePercent: 0, missingOilIds: [] };
  }

  // Renormalize over the oils we have data for, so the value stays on the same 0-100
  // scale as SOAP_PROPERTY_GUIDE. coveragePercent (below) reports how much is covered.
  for (const key of Object.keys(properties) as SoapPropertyName[]) {
    properties[key] /= coveredWeight;
  }

  return {
    properties,
    coveragePercent: (coveredWeight / totalWeight) * 100,
    missingOilIds: [...missingOilIds],
  };
}
