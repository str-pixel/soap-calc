import { deriveChemistryFromProfile } from '@soap-calc/core';

/** Stored SAP disagreeing with the profile-derived SAP by more than this % is a contradiction. */
export const SAP_DEVIATION_THRESHOLD_PCT = 8;

/**
 * Oils whose stored SAP disagrees with their own (complete) fatty-acid profile by more than
 * {@link SAP_DEVIATION_THRESHOLD_PCT} — each a deliberate, reviewed exception (see reason). A
 * NEW oil deviating that is not listed here means its stored SAP contradicts its own chemistry
 * and needs human review (the carrot/papaya class). Keeping this list exact is the drift guard
 * (see `profile-sap-consistency.test.ts`); the build validator errors on any undocumented
 * verified/estimated deviation.
 */
export const KNOWN_PROFILE_SAP_DEVIATIONS: Record<string, string> = {
  'nutmeg-butter': 'trimyristin + volatile unsaponifiables; profile over-estimates SAP',
  'buriti-oil': 'carotenoid unsaponifiables; profile over-estimates SAP',
  // cohune-oil was here (legacy SAP 0.205 vs profile). Phase 5 corrected the SAP to 0.246 (profile-derived,
  // via LEGACY_SAP_CORRECTIONS) and backfilled the profile, so the deviation is resolved — no longer a deviation.
  'ucuuba-butter': 'legacy_only high-myristic butter; unresolved vs profile',
  // murumuru-butter was here (fnwl 0.253 vs truncated-profile 0.233, ~8.6%). Phase 5 backfilled its
  // full profile (restored C8/C10); it now derives 0.238, within threshold, so it's no longer a deviation.
};

export type ProfileSapDeviationTier = 'error' | 'warn' | 'acknowledged';

export type ProfileSapDeviation = {
  id: string;
  /** Signed (stored − derived)/derived, in %, rounded to 0.1. */
  deltaPct: number;
  tier: ProfileSapDeviationTier;
  /** Present only for acknowledged (documented) deviations. */
  reason?: string;
};

type OilLike = {
  id: string;
  category: string;
  confidence?: string;
  sapKoh: number;
  fattyAcids?: Record<string, number>;
};

/**
 * Classify every oil whose stored SAP contradicts its own fatty-acid profile. Only triglycerides
 * and blends are judgeable — the derivation assumes a glyceride backbone, so waxes/tars/free acids
 * are excluded. Oils with an incomplete profile (<93% mapped → derive returns null) can't be
 * judged and are skipped. Severity is tiered by how much the stored SAP is trusted:
 *  - documented in {@link KNOWN_PROFILE_SAP_DEVIATIONS} → `acknowledged` (reviewed, non-blocking)
 *  - otherwise `verified`/`estimated` SAP → `error` (a trusted value contradicting its chemistry
 *    is the carrot class; block the build until reviewed or acknowledged)
 *  - otherwise `legacy_only` → `warn` (low-confidence value; surface but don't block)
 * Sorted by id for stable output.
 */
export function classifyProfileSapDeviations(oils: OilLike[]): ProfileSapDeviation[] {
  const out: ProfileSapDeviation[] = [];
  for (const oil of oils) {
    if (oil.category !== 'triglyceride' && oil.category !== 'blend') continue;
    if (!oil.fattyAcids) continue;
    const derived = deriveChemistryFromProfile(oil.fattyAcids);
    if (!derived) continue; // incomplete profile — not judgeable here
    const deltaPct = ((oil.sapKoh - derived.sapKoh) / derived.sapKoh) * 100;
    if (Math.abs(deltaPct) <= SAP_DEVIATION_THRESHOLD_PCT) continue;
    const reason = KNOWN_PROFILE_SAP_DEVIATIONS[oil.id];
    const tier: ProfileSapDeviationTier = reason
      ? 'acknowledged'
      : oil.confidence === 'verified' || oil.confidence === 'estimated'
        ? 'error'
        : 'warn';
    out.push({ id: oil.id, deltaPct: Math.round(deltaPct * 10) / 10, tier, reason });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
