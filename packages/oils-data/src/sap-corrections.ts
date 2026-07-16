/**
 * SAP corrections for legacy-only oils whose catalog value is inconsistent with their own
 * recorded fatty-acid profile (and with published values for the same oil). Applied only when
 * no FNWL match exists. The original legacy value stays in `sources` for provenance; the
 * replacement is a fatty-acid-profile-derived estimate, so confidence becomes `estimated`.
 *
 * `iodine`, when present, replaces a legacy iodine value that is itself inconsistent with the
 * profile — needed because the corrected INS is recomputed as SAP(mg KOH/g) − iodine, so a bad
 * iodine would just re-poison the INS. Also profile-derived.
 *
 * Shared by build-canonical (applies them) and validate-canonical (asserts the built value
 * matches), so the corrected number lives in exactly one place.
 */
export const LEGACY_SAP_CORRECTIONS: Record<
  string,
  { sapKoh: number; iodine?: number; note: string }
> = {
  'carrot-seed-oil-cold-pressed': {
    sapKoh: 0.191,
    iodine: 95,
    note: 'Corrected: legacy SAP (0.144) is below the minimum saponification value of any common-fatty-acid triglyceride, and legacy iodine (56) is far below the ~95 implied by the recorded ~80% oleic profile; both replaced with fatty-acid-profile-derived estimates.',
  },
  'papaya-seed-oil-carica-papaya': {
    sapKoh: 0.192,
    note: 'Corrected: legacy SAP (0.158) is inconsistent with the recorded ~76% oleic profile (implies an average fatty acid heavier than any common one); replaced with a fatty-acid-profile-derived estimate.',
  },
  'coffee-bean-oil-roasted': {
    sapKoh: 0.195,
    note: 'Corrected: legacy SAP (0.18) is low for a palmitic/linoleic-dominant oil. The Phase-5 backfilled profile derives 0.196, matching Böger et al. 2021 measured roasted-arabica 195.26 mg KOH/g; replaced with 0.195. No FNWL match, so the correction applies here.',
  },
  'cohune-oil': {
    sapKoh: 0.246,
    iodine: 11,
    note: 'Corrected: legacy SAP (0.205) is impossibly low for a lauric palm-kernel oil — below the saponification value of any lauric composition, and inconsistent with cohune’s own fatty-acid profile (which derives ~0.246). Replaced with the Phase-5-backfilled-profile-derived 0.246, which matches measured relatives (babassu 0.237, indaiá 0.241). No FNWL match, so the correction applies here. Legacy iodine (30) is likewise high vs the profile-derived ~11 (cohune is ~96% saturated); corrected to 11 so the recomputed INS is not re-poisoned.',
  },
};
