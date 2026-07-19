/**
 * Iodine corrections for oils whose stored iodine contradicts their own fatty-acid profile
 * (and published values). Applied in build-canonical AFTER sap resolution, regardless of
 * FNWL match — this is the only iodine path that reaches FNWL-matched (`verified`) oils, which
 * `sap-corrections.ts` (no-FNWL branch only) cannot. INS is recomputed from the corrected
 * iodine. Keyed by baseSlug (== id for all current entries). Values are profile-consistent
 * and confirmed against published sources; validate-canonical asserts the built value matches.
 */
export const IODINE_CORRECTIONS: Record<string, { iodine: number; note: string }> = {
  'pomegranate-seed-oil': {
    iodine: 200,
    note: 'Corrected: legacy iodine (22) is impossible for a ~78%-triene (punicic) oil; published pomegranate seed oil IV is ~195–220. Set to ~200. The profile-derived ~232 over-estimates because punicic acid is conjugated (each C=C adds less iodine in Wijs), so a residual deviation remains and is acknowledged.',
  },
  'sacha-inchi-plukenetia-volubilis': {
    iodine: 193,
    note: 'Corrected: legacy iodine (141) understates a ~48% α-linolenic oil; published sacha inchi IV is ~190–198, matching the profile-derived ~204. Set to ~193.',
  },
  'murumuru-butter': {
    iodine: 13,
    note: 'Corrected: legacy iodine (25) is high for a lauric butter; published murumuru IV is ~10–15, matching the profile-derived ~14. Set to ~13.',
  },
};
