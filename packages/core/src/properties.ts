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

/**
 * What each quality sums. THE CALCULATORS DO NOT AGREE ON THIS, so the choice matters as
 * much as the bands do (checked 2026-09-12 against each calculator's own shipped code):
 *
 * - SoapCalc, LyeCalc, Modern Soapmaking, Classic Bells: cleansing = lauric + myristic.
 *   SoapCalc's data model has no caprylic or capric column at all.
 * - Soapee and Soapmaking Friend: cleansing = lauric + myristic + caprylic + capric, and
 *   they put C8-C10 into hardness and bubbly too.
 *
 * This app follows the Soapee / Soapmaking Friend convention, which is its actual lineage —
 * the inherited misspelling `docosenoid`, corrected to `docosenoic` here, is Soapee's.
 * Both conventions display the same "12 - 22" guidance for quantities that are not the same
 * quantity; a coconut, palm-kernel or babassu recipe scores several points higher under this
 * one. See {@link SOAP_PROPERTY_GUIDE} for which band that is judged against.
 *
 * Three deliberate departures from that lineage, each argued in the comments below:
 * C8-C10 are excluded from hardness; the long-chain saturates and elaidic are added to
 * hardness and longevity; palmitoleic is added to conditioning.
 */
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
 * Properties shown with a typical range but NEVER given a pass/fail verdict.
 *
 * `longevity` is the only one, and it is here because no source publishes a range that
 * survives contact with real recipes:
 * - Its 25-50 has no published rationale anywhere. Three calculators carry it identically
 *   (Soapee, Soapmaking Friend, LyeCalc) and the books reprint it, but that is one figure
 *   propagated, not four findings.
 * - The one range with a stated rationale, DeeAnna Weed's 30-40 "sweet spot", flags the
 *   source books' OWN worked recipes (they score 29 and 26). Measured over twelve ordinary
 *   recipes it flags ten.
 * - 25-50 itself flags six of those twelve as "too low", castile among them — and a castile
 *   bar is famously long-lived. The metric is palmitic + stearic, so it cannot see what
 *   makes a high-oleic bar last. The band is not the only thing at fault; the sum is.
 *
 * So the number and its typical range are shown, and no verdict is drawn from them. This is
 * exactly how {@link IODINE_GUIDE} and {@link INS_GUIDE} already read in the panel — a value
 * with "(typical 41-70)" beside it and no judgement. Inventing a wider band to stop the
 * false alarms would have been the other way out; this app does not invent numbers.
 */
export const UNJUDGED_PROPERTIES: ReadonlySet<SoapPropertyName> = new Set<SoapPropertyName>([
  'longevity',
]);

/** Whether a verdict (Too low / In range / Too high) may be drawn for this property. */
export function isJudgedProperty(key: SoapPropertyName): boolean {
  return !UNJUDGED_PROPERTIES.has(key);
}

/**
 * The range a recipe is judged against, per property. THE BOOKS' "Standard" COLUMN,
 * transcribed: CP:11636-11703 ("Common Soap Quality Ranges", p404) and HP:4637-4664
 * ("Average Soap Quality Ranges", p133), whose Standard and Preference columns are
 * identical to each other. `property-guide-source.test.ts` is that transcription, so drift
 * fails against the page rather than passing quietly.
 *
 * Adopted 2026-09-12, replacing the calculator's "Suggested Range" column, which differed
 * on two properties — cleansing 12-22 and hardness 29-54. The books support their own
 * column: the Preference column sits inside it, and the CP book's worked teaching example
 * reformulates to cleansing 10 and presents that as the right answer (CP:8942-8948), a
 * reading the calculator column calls "too low".
 *
 * KNOW THIS BEFORE REVISITING THE CHOICE: the quality-ranges table above is printed ONCE
 * per book, while every worked recipe in both books displays the calculator's column
 * instead (e.g. CP:13106-13123 p456; HP:9914-9941 p367). Both conventions are the authors'.
 *
 * THE TWO VALUES NOT FROM THAT TABLE:
 * - `longevity` — the quality-ranges table has no longevity row and no book text anywhere
 *   defines which acids it sums. Its 25-50 is still the authors' own: they typeset it as
 *   the recommended range in three worked recipes (CP:13113-13114 p456; HP:9930-9932 p367;
 *   HP:10116-10118 p370), pages that carry no screenshot. Corrected from an unsourced
 *   14-43 in commit 7812bc1 (#44). Note the books' own oil cards compute longevity as
 *   palmitic + stearic exactly, where this app also counts C20/C22/C24 and elaidic; their
 *   data model has no column for those, so it can neither confirm nor refute the extras.
 * - {@link IODINE_GUIDE} and {@link INS_GUIDE}, which the Standard table does not list.
 *
 * CAVEAT worth knowing before reading a verdict too literally: the books define each
 * quality by the acids it sums, and {@link SOAP_PROPERTY_FATTY_ACIDS} counts MORE than that
 * for four of the five — deliberately, and documented there. Cleansing is the one that
 * moves. The book sums lauric + myristic and the calculators it screenshots carry no C8-C10
 * column at all (their oil cards' profiles fall short of 100% by about the missing C8+C10),
 * so 8-20 was written for a narrower number than this app computes. Measured against the
 * catalog: this app first reads "too high" at ~26% coconut, where the book's own definition
 * would first read it at ~31%.
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
