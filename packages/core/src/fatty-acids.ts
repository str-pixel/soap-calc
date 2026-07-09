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
  const missingOilIds = new Set<string>();

  for (const line of weighted) {
    const oil = oilLookup[line.oilId];
    if (!oil?.propertiesAvailable || !oil.fattyAcids) {
      missingOilIds.add(line.oilId);
      continue;
    }

    coveredWeight += line.weightGrams;

    for (const [acid, pct] of Object.entries(oil.fattyAcids)) {
      profile[acid] = (profile[acid] ?? 0) + pct * line.weightGrams;
    }
  }

  if (coveredWeight <= 0) {
    return { profile: null, coveragePercent: 0, missingOilIds: [] };
  }

  // Renormalize over covered weight so the profile reads as a fatty-acid % of the
  // characterized oils (coveragePercent reports how much of the recipe that is).
  for (const acid of Object.keys(profile)) {
    profile[acid] /= coveredWeight;
  }

  return {
    profile,
    coveragePercent: (coveredWeight / totalWeight) * 100,
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
  'docosenoid',
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
