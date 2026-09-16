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
  'rice bran oil': ['rice bran oil'],
  'evening primrose oil': ['evening primrose oil refined 9 gla', 'organic evening primrose oil'],
  'black cumin seed oil nigella sativa': ['black cumin seed oil organic'],
  'monoi de tahiti oil': ['monoi de tahiti oil'],
  'mustard oil kachi ghani': ['mustard oil'],
  'rapeseed oil canola': ['rapeseed oil'],
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

/** Explicit low-saponifiable oils — do not infer from incomplete fatty-acid sums. Consulted only
 *  when no SAP is known: a measured SAP outranks this list, which is how abyssinian (168 mg KOH/g,
 *  a triglyceride) ended up here on the strength of a profile summing to 38. */
export const WAX_ESTER_OIL_IDS = new Set([
  'abyssinian-oil',
  'jojoba-oil-a-liquid-wax-ester',
]);

/**
 * Saponification value (sapKoh, as a fraction — multiply by 1000 for mg KOH/g) at or above which
 * an ingredient's mass is esterified fatty acid we can account for.
 *
 * A wax ester carries one ester bond across two long chains, so very little KOH saponifies a
 * gram of it; a triglyceride carries three across a small glycerol backbone. The catalog splits
 * cleanly on this with nothing in between: candelilla 0.049, tars 0.060, carnauba 0.087, jojoba
 * 0.092, beeswax 0.094, lanolin 0.106 — then a 56-point gap — nutmeg butter 0.162, abyssinian
 * 0.168, meadowfoam 0.169. The floor sits in the gap. `validate-canonical` errors if any
 * ingredient's declared category disagrees with its SAP, so the gap cannot silently close.
 */
export const FATTY_ACID_SAP_FLOOR = 0.13;

/**
 * Ingredients whose chemistry says they contribute fatty acids, but whose STORED profile is too
 * incomplete to use. Excluded deliberately, with the reason, until a cited profile replaces it —
 * an entry here is a debt, not a classification. `validate-canonical` reads this so a silent
 * exclusion cannot masquerade as one of these.
 */
export const PROFILE_TOO_INCOMPLETE_TO_USE: Record<string, string> = {
  // Empty, and worth keeping so: abyssinian was the only entry, retired 2026-09-16 by a cited
  // PROFILE_BACKFILL from a measured thesis table. An entry here is a debt — an ingredient whose
  // chemistry says it contributes fatty acids while its stored profile is too incomplete to use —
  // and validate-canonical requires one before it will allow such an exclusion, so nothing can be
  // dropped from the bar scores silently the way stearic acid once was.
};

/**
 * Does this ingredient put a KNOWN fatty-acid makeup into the soap? Free acids do: 100 g of
 * stearic acid neutralizes to sodium stearate exactly as the stearic in a triglyceride
 * saponifies to it, and their stored profiles are complete and definitional (stearic acid is
 * 99% stearic). They were excluded only because the category test named two categories, which
 * dropped them from the bar scores entirely — measured across recipes containing them, 27.6%
 * of property readings were wrong as a result, hardness understated by a median 8.9 points.
 */
export function contributesFattyAcids(
  category: import('./schema.js').OilCategory,
  slug: string,
): boolean {
  if (slug in PROFILE_TOO_INCOMPLETE_TO_USE) return false;
  return category === 'triglyceride' || category === 'blend' || category === 'free_acid';
}

export function inferCategory(
  displayName: string,
  slug: string,
  sapKoh?: number,
): import('./schema.js').OilCategory {
  // Tars and free acids are settled by name first: SAP cannot identify either. A tar's value is
  // a lye-consumption proxy rather than an ester count, and a free acid's is genuinely high (one
  // COOH per molecule, no glycerol to carry) so it would otherwise read as a triglyceride.
  for (const { pattern, category } of WAX_OR_SPECIAL_PATTERNS) {
    if (category === 'tar' || category === 'free_acid') {
      if (pattern.test(displayName)) return category;
    }
  }
  // Then chemistry. A common name may label an ingredient ("japan wax", "soy wax") but it may
  // not overrule what the ingredient measurably is.
  if (typeof sapKoh === 'number' && Number.isFinite(sapKoh) && sapKoh >= FATTY_ACID_SAP_FLOOR) {
    return 'triglyceride';
  }
  for (const { pattern, category } of WAX_OR_SPECIAL_PATTERNS) {
    if (pattern.test(displayName)) return category;
  }
  if (WAX_ESTER_OIL_IDS.has(slug)) return 'wax_ester';
  return 'triglyceride';
}
