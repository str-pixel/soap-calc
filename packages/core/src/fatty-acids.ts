import type { FattyAcidProfile, OilForProperties, RecipeOilForProperties } from './properties.js';

export type { FattyAcidProfile };

export type RecipeFattyAcidResult = {
  profile: FattyAcidProfile | null;
  coveragePercent: number;
  missingOilIds: string[];
};

export function calculateRecipeFattyAcids(
  lines: RecipeOilForProperties[],
  oilLookup: Record<string, OilForProperties>,
): RecipeFattyAcidResult {
  const weighted = lines.filter((line) => line.weightGrams > 0);
  const totalWeight = weighted.reduce((sum, line) => sum + line.weightGrams, 0);

  if (totalWeight <= 0) {
    return { profile: null, coveragePercent: 0, missingOilIds: [] };
  }

  const profile: FattyAcidProfile = {};
  let coveredWeight = 0;
  let characterizedWeight = 0;
  const missingOilIds = new Set<string>();

  for (const line of weighted) {
    const oil = oilLookup[line.oilId];
    if (!oil?.propertiesAvailable || !oil.fattyAcids) {
      missingOilIds.add(line.oilId);
      continue;
    }

    coveredWeight += line.weightGrams;
    const profileSum = Object.values(oil.fattyAcids).reduce((sum, pct) => sum + pct, 0);
    // Cap at 100 so a profile that sums slightly over 100 (rounding) can't push coverage past 100%.
    characterizedWeight += line.weightGrams * (Math.min(profileSum, 100) / 100);

    for (const [acid, pct] of Object.entries(oil.fattyAcids)) {
      profile[acid] = (profile[acid] ?? 0) + pct * line.weightGrams;
    }
  }

  if (coveredWeight <= 0) {
    return { profile: null, coveragePercent: 0, missingOilIds: [...missingOilIds] };
  }

  // Scores: renormalize the profile over covered-OIL weight (unchanged) so an oil's scores are
  // identical to before. coveragePercent, however, reflects fatty-acid *completeness*: an oil
  // with a 45%-complete profile is only 45% characterized, so incomplete profiles get flagged
  // as estimates instead of shipping as full-confidence facts.
  for (const acid of Object.keys(profile)) {
    profile[acid] /= coveredWeight;
  }

  return {
    profile,
    coveragePercent: (characterizedWeight / totalWeight) * 100,
    missingOilIds: [...missingOilIds],
  };
}

export function sumFattyAcids(profile: FattyAcidProfile, keys: readonly string[]): number {
  return keys.reduce((sum, key) => sum + (profile[key] ?? 0), 0);
}

const SATURATED_ACIDS = [
  'lauric',
  'myristic',
  'palmitic',
  'stearic',
  'caprylic',
  'capric',
] as const;

const UNSATURATED_ACIDS = [
  'oleic',
  'linoleic',
  'linolenic',
  'ricinoleic',
  'eicosenoic',
  'docosenoic',
  'docosadienoic',
  'erucic',
] as const;

export function saturatedUnsaturatedRatio(profile: FattyAcidProfile): {
  saturated: number;
  unsaturated: number;
} {
  return {
    saturated: sumFattyAcids(profile, SATURATED_ACIDS),
    unsaturated: sumFattyAcids(profile, UNSATURATED_ACIDS),
  };
}

export const FATTY_ACID_GROUP_KEYS = {
  lauricMyristic: ['lauric', 'myristic', 'caprylic', 'capric'] as const,
  palmiticStearic: ['palmitic', 'stearic'] as const,
  polyunsaturated: ['linoleic', 'linolenic'] as const,
} as const;
