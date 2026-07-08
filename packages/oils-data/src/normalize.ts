/** Normalize oil names for exact matching across datasets. */
export function normalizeOilName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(organic|virgin|refined|unrefined|extra virgin|deg|raw|rbd)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(name: string): string {
  return normalizeOilName(name).replace(/\s+/g, '-');
}

/** Latin names normalize; non-Latin aliases (e.g. Cyrillic) are kept lowercased. */
export function canonicalAlias(alias: string): string {
  const normalized = normalizeOilName(alias);
  if (normalized) return normalized;
  return alias.toLowerCase().trim();
}

/**
 * Explicit bridges: normalized legacy name → FNWL catalog names (any form; normalized on lookup).
 * Keys MUST be normalizeOilName(legacy display name).
 */
export const LEGACY_TO_FNWL_ALIASES: Record<string, string[]> = {
  // Coconut — FNWL "Coconut Oil, RBD" / "Organic Virgin..." both normalize to "coconut oil"
  'coconut oil 76': ['coconut oil'],
  'coconut oil 92': ['coconut oil'],
  'coconut oil fractionated': ['fractionated coconut oil'],

  // Typos / naming variants
  'apricot kernal oil': ['apricot kernel oil'],
  'almond oil sweet': ['almond oil sweet'],

  // Plant oils
  'grapeseed oil': ['grape seed oil'],
  'hemp oil': ['hemp seed oil'],
  'flax oil linseed': ['flax seed oil'],
  'canola oil': ['canola oil'],
  'canola oil high oleic': ['canola oil'],
  'sunflower oil': ['sunflower oil refined organic', 'sunflower oil'],
  'sunflower oil high oleic': ['sunflower oil refined organic', 'sunflower oil'],
  'safflower oil': ['high linoleic safflower oil', 'safflower oil organic high oleic refined'],
  'safflower oil high oleic': ['safflower oil organic high oleic refined', 'safflower oil'],
  'rice bran oil refined': ['rice bran oil'],
  'evening primrose oil': ['evening primrose oil refined 9 gla', 'organic evening primrose oil'],
  'black cumin seed oil nigella sativa': ['black cumin seed oil organic'],
  'monoi de tahiti oil': ['monoi de tahiti oil'],
  'mustard oil kachi ghani': ['mustard oil'],
  'rapeseed oil unrefined canola': ['rapeseed oil'],
  'raspberry seed oil': ['red raspberry seed oil'],

  // Animal fats
  'lard pig tallow manteca': ['lard'],
  'tallow beef': ['beef tallow'],

  // FNWL name differs from legacy catalog
  'tamanu oil kamani': ['tamanu foraha oil'],

  // Waxes / specialty
  'jojoba oil a liquid wax ester': ['jojoba oil natural', 'jojoba oil golden organic'],
  'candelilla wax': ['candelilla wax pellets'],
  'carnauba copernicia cerifera wax': ['carnauba wax flakes'],

  // Butters / palm
  'palm oil': ['palm oil'],
  'palm kernel oil': ['palm kernel oil'],
  'palm kernel oil flakes hydrogenated': ['palm kernel oil'],
  'castor oil': ['castor oil organic', 'castor oil black'],
  'shea butter': ['shea butter', 'nilotica shea butter organic'],
  'shea oil fractionated': ['shea oil'],

  // Misc
  'yangu cape chestnut': ['yangu cape chestnut oil'],
};

export const WAX_OR_SPECIAL_PATTERNS: Array<{ pattern: RegExp; category: 'wax' | 'wax_ester' | 'tar' | 'free_acid' }> = [
  { pattern: /jojoba/i, category: 'wax_ester' },
  { pattern: /wax|beeswax|candelilla|carnauba|lanolin/i, category: 'wax' },
  { pattern: /pine tar|birch tar|betula.*tar|берёзовый дёготь|березовый деготь/i, category: 'tar' },
  { pattern: /lauric acid|stearic acid|oleic acid|myristic acid|palmitic acid/i, category: 'free_acid' },
];

/** Explicit low-saponifiable oils — do not infer from incomplete fatty-acid sums. */
export const WAX_ESTER_OIL_IDS = new Set([
  'abyssinian-oil',
  'jojoba-oil-a-liquid-wax-ester',
]);

export function inferCategory(
  displayName: string,
  slug: string,
): import('./schema.js').OilCategory {
  for (const { pattern, category } of WAX_OR_SPECIAL_PATTERNS) {
    if (pattern.test(displayName)) return category;
  }
  if (WAX_ESTER_OIL_IDS.has(slug)) return 'wax_ester';
  return 'triglyceride';
}
