import { deriveChemistryFromProfile } from '@soap-calc/core';

/** Stored iodine is flagged only when it disagrees with the profile-derived value by
 * BOTH at least this many iodine-value units AND at least IODINE_REL_THRESHOLD_PCT. The
 * absolute floor kills low-IV noise (a 1-unit gap on a near-saturated oil is not a defect). */
export const IODINE_ABS_THRESHOLD = 10;
export const IODINE_REL_THRESHOLD_PCT = 8;
/** A flagged deviation this large (relative) on a trusted value is a gross contradiction —
 * the corruption band that blocks the build. 25% is a heuristic beyond measurement noise
 * and PUFA-rounding, not a physical law. */
export const IODINE_GROSS_PCT = 25;

/**
 * Oils whose stored iodine disagrees with their own complete fatty-acid profile beyond
 * threshold for a REVIEWED reason (unsaponifiables, conjugated acids, no compositional
 * standard). Unlike SAP, profile-derived iodine is a noisy oracle, so most flagged oils are
 * a review backlog (warn tier), NOT acknowledged here — this map is real explanations only.
 */
export const KNOWN_PROFILE_IODINE_DEVIATIONS: Record<string, string> = {
  'nutmeg-butter':
    'trimyristin + volatile unsaponifiables: measured iodine far exceeds the near-saturated triglyceride profile',
  'tallow-deer': 'community-only animal fat, no compositional standard to reconcile against',
};

export type ProfileIodineDeviationTier = 'error' | 'warn' | 'acknowledged';

export type ProfileIodineDeviation = {
  id: string;
  /** Signed stored − derived, iodine-value units, rounded to 0.1. */
  absDelta: number;
  /** Signed (stored − derived)/derived, %, rounded to 0.1. */
  relDeltaPct: number;
  tier: ProfileIodineDeviationTier;
  /** Present only for acknowledged (documented) deviations. */
  reason?: string;
};

type OilLike = {
  id: string;
  category: string;
  confidence?: string;
  iodine?: number;
  fattyAcids?: Record<string, number>;
};

/**
 * Classify every oil whose stored iodine contradicts its own fatty-acid profile. Only
 * triglycerides/blends with a ≥93%-mapped profile are judgeable (derive returns null below
 * that). Tiering respects the trust-asymmetry vs SAP: a mere deviation does NOT block the
 * build; only a gross (≥IODINE_GROSS_PCT) contradiction on a trusted value does.
 *  - documented in KNOWN_PROFILE_IODINE_DEVIATIONS → `acknowledged` (non-blocking)
 *  - else gross AND verified/estimated → `error` (block until corrected or acknowledged)
 *  - else → `warn` (review backlog; profile is the noisier side, human decides)
 */
export function classifyProfileIodineDeviations(oils: OilLike[]): ProfileIodineDeviation[] {
  const out: ProfileIodineDeviation[] = [];
  for (const oil of oils) {
    if (oil.category !== 'triglyceride' && oil.category !== 'blend') continue;
    if (!oil.fattyAcids || oil.iodine == null) continue;
    const derived = deriveChemistryFromProfile(oil.fattyAcids);
    if (!derived) continue; // incomplete profile — not judgeable
    const absDelta = oil.iodine - derived.iodineValue;
    const relDeltaPct = (absDelta / derived.iodineValue) * 100;
    if (Math.abs(absDelta) < IODINE_ABS_THRESHOLD) continue;
    if (Math.abs(relDeltaPct) < IODINE_REL_THRESHOLD_PCT) continue;
    const reason = KNOWN_PROFILE_IODINE_DEVIATIONS[oil.id];
    const tier: ProfileIodineDeviationTier = reason
      ? 'acknowledged'
      : Math.abs(relDeltaPct) >= IODINE_GROSS_PCT &&
          (oil.confidence === 'verified' || oil.confidence === 'estimated')
        ? 'error'
        : 'warn';
    out.push({
      id: oil.id,
      absDelta: Math.round(absDelta * 10) / 10,
      relDeltaPct: Math.round(relDeltaPct * 10) / 10,
      tier,
      reason,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
