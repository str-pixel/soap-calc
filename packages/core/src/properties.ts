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
 * The range a recipe is judged against, per property. THE BOOKS' "Standard" COLUMN,
 * transcribed: CP:11636-11703 ("Common Soap Quality Ranges", p404) and HP:4637-4664
 * ("Average Soap Quality Ranges", p133), whose Standard and Preference columns are
 * identical to each other. `property-guide-source.test.ts` is that transcription, so drift
 * fails against the page rather than passing quietly.
 *
 * Adopted 2026-09-12, replacing the soap-calculator "Suggested Range" column
 * (HP:9914-9941 p367; CP:13106-13123 p456), which differed on two properties — cleansing
 * 12-22 and hardness 29-54. The books support their own column over the calculator's: the
 * Preference column sits inside it, and the CP book's worked teaching example reformulates
 * to cleansing 10 and presents that as the right answer (CP:8942-8948), a reading the
 * calculator column calls "too low".
 *
 * TWO THINGS THE BOOKS DO NOT COVER, both left on the calculator convention:
 * - `longevity` — neither printing has a longevity row, so there is no Standard value to
 *   adopt. It keeps 25-50, corrected from an unsourced 14-43 in commit 7812bc1 (#44).
 * - {@link IODINE_GUIDE} and {@link INS_GUIDE}, which the Standard table does not list.
 *
 * CAVEAT worth knowing before reading a verdict too literally: the books define each
 * quality by the acids it sums, and {@link SOAP_PROPERTY_FATTY_ACIDS} counts MORE than that
 * for four of the five — deliberately, and documented there. Cleansing is the one that
 * moves: the book sums lauric + myristic, this app also counts C8-C10, so a coconut-heavy
 * recipe reads several points above the number the book's 8-20 was written for.
 */
export const SOAP_PROPERTY_GUIDE: Record<SoapPropertyName, { low: number; high: number }> = {
  bubbly: { low: 14, high: 46 },
  cleansing: { low: 8, high: 20 },
  condition: { low: 44, high: 69 },
  hardness: { low: 30, high: 60 },
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
