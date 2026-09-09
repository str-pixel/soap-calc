/**
 * WHAT AN INGREDIENT IS MADE FROM, where that is something a customer may need to avoid.
 *
 * This is provenance, not an allergen declaration. The app states what a material is
 * derived from and, where a regulator has said something specific about it in COSMETICS,
 * quotes that; it does not compute a declaration, assert a threshold, or claim compliance.
 * That line matters: unlike the fragrance allergens, which have a labelling concentration
 * to compare against (Annex III, see fragrance.ts), nothing here has arithmetic behind it.
 *
 * The books carry the use case and none of the data — a customer with a coconut allergy is
 * a worked exercise (CP:9212) and cross-contaminated equipment is flagged for "those with
 * allergies" (CP:13602), but no source in the archive lists an allergenic ingredient. So
 * every entry below is web- or regulator-sourced, and cited here. All retrieved 2026-09-09:
 *
 *   [FDA-CARMINE]  https://www.federalregister.gov/documents/2009/01/05/E8-31253/listing-of-color-additives-exempt-from-certification-food-drug-and-cosmetic-labeling-cochineal
 *                  Final rule: cochineal extract and carmine must be declared by name on
 *                  foods AND cosmetics, "prominently and conspicuously at least once in the
 *                  labeling", after reports of severe reactions including anaphylaxis.
 *   [EU-2017/2228] https://legislation.gov.uk/eur/2017/2228/contents/data.html and
 *                  https://ec.europa.eu/health/scientific_committees/consumer_safety/docs/sccs_o_155.pdf
 *                  Annex III entries: refined peanut oil in cosmetics at ≤ 0.5 ppm protein
 *                  (skin sensitisation in infancy), hydrolysed wheat protein peptides at a
 *                  3.5 kDa maximum average molecular weight (contact urticaria, then
 *                  anaphylaxis on eating wheat).
 *   [SCCS-REFINED] SCCS/1526/14, above: refining removes almost all of the protein that
 *                  causes reactions, but whether the traces left can still provoke one in a
 *                  highly susceptible person is explicitly uncertain — which is why "it is
 *                  refined" is not an answer this app gives on a maker's behalf.
 *   [FDA-ALLERGENS] https://www.fda.gov/food/food-labeling-nutrition/food-allergies
 *                  The nine major US food allergens (milk, egg, fish, crustacean shellfish,
 *                  tree nuts, peanuts, wheat, soybeans, sesame). Coconut is treated as a
 *                  tree nut there; the EU's own list does not include it, which is why
 *                  coconut is its own origin here rather than folded into tree nut.
 */

export type AllergenOrigin =
  | 'tree-nut'
  | 'peanut'
  | 'coconut'
  | 'dairy'
  | 'wheat'
  | 'soy'
  | 'sesame'
  | 'oat'
  | 'mustard'
  | 'gluten-grain'
  | 'sulfite'
  | 'insect'
  | 'bee'
  | 'wool';

export type AllergenOriginInfo = {
  label: string;
  /** What the maker needs to know beyond the origin itself — a rule where one exists. */
  note?: string;
};

export const ALLERGEN_ORIGINS: Record<AllergenOrigin, AllergenOriginInfo> = {
  'tree-nut': { label: 'Tree nut' },
  peanut: {
    label: 'Peanut',
    // [EU-2017/2228] + [SCCS-REFINED]
    note: 'Cosmetic peanut oil is held to no more than 0.5 ppm protein in the EU, and only a refined grade reaches that — ask your supplier for the figure rather than assuming it. Refining removes almost all of the protein that causes reactions; whether the traces left can still provoke one is not settled.',
  },
  coconut: {
    label: 'Coconut',
    // [FDA-ALLERGENS]: a tree nut in the US list, not in the EU's.
    note: 'A tree nut in the US list, not in the EU\'s — so "no nuts" may or may not mean this one.',
  },
  dairy: { label: 'Dairy' },
  wheat: { label: 'Wheat' },
  soy: { label: 'Soy' },
  sesame: { label: 'Sesame' },
  oat: { label: 'Oat' },
  mustard: { label: 'Mustard' },
  'gluten-grain': { label: 'Barley or wheat (gluten)' },
  sulfite: { label: 'Sulfites' },
  insect: {
    label: 'Insect (carmine)',
    // [FDA-CARMINE]
    note: 'Carmine and cochineal extract must be named on a cosmetic label in the US — prominently, at least once — because of reported severe reactions. "Colour" or "natural pigment" does not satisfy it.',
  },
  bee: { label: 'Bee products' },
  wool: {
    label: 'Wool (lanolin)',
    note: 'Lanolin is a long-standing contact allergen and sits in the standard patch-test series; it is a skin reaction rather than a food one.',
  },
};

/** Oils, by the catalog's own ids. Nut oils are grouped by what a customer would call them,
 * not by botany: a customer avoiding tree nuts means the whole group. */
export const OIL_ALLERGEN_ORIGINS: Readonly<Record<string, readonly AllergenOrigin[]>> = {
  'almond-oil-sweet': ['tree-nut'],
  'almond-butter': ['tree-nut'],
  'brazil-nut-oil': ['tree-nut'],
  'hazelnut-oil': ['tree-nut'],
  'macadamia-nut-oil': ['tree-nut'],
  'macadamia-nut-butter': ['tree-nut'],
  'pecan-oil': ['tree-nut'],
  'pistachio-oil': ['tree-nut'],
  'walnut-oil': ['tree-nut'],
  'peanut-oil': ['peanut'],
  'coconut-oil-76': ['coconut'],
  'coconut-oil-92': ['coconut'],
  'coconut-oil-fractionated': ['coconut'],
  'sesame-oil': ['sesame'],
  'soybean-oil': ['soy'],
  'soybean-27-5-hydrogenated': ['soy'],
  'soybean-fully-hydrogenated': ['soy'],
  'wheat-germ-oil': ['wheat'],
  'oat-oil': ['oat'],
  'mustard-oil-kachi-ghani': ['mustard'],
  'lanolin-liquid-wax': ['wool'],
  beeswax: ['bee'],
};

/** Additives, by catalog id. */
export const ADDITIVE_ALLERGEN_ORIGINS: Readonly<Record<string, readonly AllergenOrigin[]>> = {
  'milk-powder': ['dairy'],
  yogurt: ['dairy'],
  honey: ['bee'],
  oatmeal: ['oat'],
};

/** Colorants, by catalog id. Black walnut is a nut hull — easy to miss in a colour. */
export const COLORANT_ALLERGEN_ORIGINS: Readonly<Record<string, readonly AllergenOrigin[]>> = {
  cochineal: ['insect'],
  'black-walnut': ['tree-nut'],
};

/** Alternative liquids, by preset key. */
export const LIQUID_ALLERGEN_ORIGINS: Readonly<Record<string, readonly AllergenOrigin[]>> = {
  milk: ['dairy'],
  buttermilk: ['dairy'],
  yogurt: ['dairy'],
  'yogurt-greek': ['dairy'],
  'heavy-cream': ['dairy'],
  'coconut-milk-canned': ['coconut'],
  'coconut-water': ['coconut'],
  beer: ['gluten-grain'],
  wine: ['sulfite'],
};

export type AllergenOriginHit = {
  origin: AllergenOrigin;
  label: string;
  note?: string;
  /** What in THIS recipe carries it, in the order the caller listed them. */
  ingredients: string[];
};

/** Every origin a recipe carries, with the ingredients that bring it. Names come from the
 * caller (the catalogs' own display names), so nothing here has to know how to spell them. */
export function allergenOriginsFor(
  items: ReadonlyArray<{ name: string; origins: readonly AllergenOrigin[] }>,
): AllergenOriginHit[] {
  const byOrigin = new Map<AllergenOrigin, string[]>();
  for (const item of items) {
    for (const origin of item.origins) {
      const name = item.name.trim();
      if (!name) continue;
      const list = byOrigin.get(origin) ?? [];
      if (!list.includes(name)) list.push(name);
      byOrigin.set(origin, list);
    }
  }
  // A stable order: the registry's own, so two recipes never list the same set differently.
  return (Object.keys(ALLERGEN_ORIGINS) as AllergenOrigin[])
    .filter((origin) => byOrigin.has(origin))
    .map((origin) => ({
      origin,
      label: ALLERGEN_ORIGINS[origin].label,
      note: ALLERGEN_ORIGINS[origin].note,
      ingredients: byOrigin.get(origin) as string[],
    }));
}
