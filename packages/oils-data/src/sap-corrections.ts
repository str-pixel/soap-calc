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
};
