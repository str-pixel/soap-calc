/**
 * Old oil-id → the id that should serve it now. Two kinds of entry, same mechanism:
 *  - **Rename**: the oil is still built, under a new emitted id (the internal build slug is
 *    unchanged, so FNWL/INCI/backfill lookups and provenance are preserved).
 *  - **Dedup-merge**: the old id is EXCLUDED from the build (see excluded-oils.json) and its
 *    recipes redirect to a surviving duplicate.
 * Either way the map is emitted into the lite DB (`idMigrations`) and the web resolves the old id
 * everywhere (oilById + the lye/property lookups), so a rename or merge never breaks saved recipes.
 *
 * Use sparingly: ids are stable keys.
 */
export const OIL_ID_OVERRIDES: Record<string, string> = {
  // Rename: high-erucic rapeseed was mislabeled with a "canola" slug (a separate canola-oil entry
  // exists); renamed so a "canola" search no longer surfaces it via the id-substring match.
  'rapeseed-oil-canola': 'rapeseed-oil-high-erucic',
  // Dedup-merge: "Linseed Oil, flax" is the same oil as "Flax Oil, linseed" (identical INCI +
  // profile, SoapCalc cruft). linseed-oil-flax is excluded; recipes redirect to flax-oil-linseed.
  'linseed-oil-flax': 'flax-oil-linseed',
};
