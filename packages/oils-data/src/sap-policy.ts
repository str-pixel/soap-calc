import { sapKohToSapNaoh } from '@soap-calc/core';

export const VERIFIED_DELTA_PCT = 5;
export const DISPUTED_DELTA_PCT = 10;

export type SapResolution = {
  sapKoh: number;
  sapNaoh: number;
  primarySource: 'fnwl' | 'legacy_catalog';
  confidence: 'verified' | 'estimated' | 'legacy_only';
  deltaPct: number;
  strategy: 'fnwl_agrees' | 'profile_closest' | 'midpoint';
};

export function sapDeltaPercent(legacy: number, fnwl: number): number {
  return (Math.abs(legacy - fnwl) / legacy) * 100;
}

/**
 * Choose primary SAP for lye calculations when the legacy catalog and FNWL disagree.
 * - ≤5% delta: they agree, trust FNWL.
 * - >5% delta: pick the source closest to the **profile-derived** SAP (the independent
 *   chemistry oracle). A higher SAP is NOT "safer" — it means more lye and less superfat.
 *   When the profile can't judge (incomplete/absent), fall back to the midpoint, never the max.
 */
export function resolvePrimarySap(
  legacySapKoh: number,
  fnwlSapKoh: number,
  profileDerivedSapKoh?: number,
): SapResolution {
  const deltaPct = sapDeltaPercent(legacySapKoh, fnwlSapKoh);

  if (deltaPct <= VERIFIED_DELTA_PCT + 1e-9) {
    const sapKoh = fnwlSapKoh;
    return {
      sapKoh,
      sapNaoh: sapKohToSapNaoh(sapKoh),
      primarySource: 'fnwl',
      confidence: 'verified',
      deltaPct,
      strategy: 'fnwl_agrees',
    };
  }

  if (profileDerivedSapKoh !== undefined) {
    const useFnwl =
      Math.abs(fnwlSapKoh - profileDerivedSapKoh) <=
      Math.abs(legacySapKoh - profileDerivedSapKoh);
    const sapKoh = useFnwl ? fnwlSapKoh : legacySapKoh;
    return {
      sapKoh,
      sapNaoh: sapKohToSapNaoh(sapKoh),
      primarySource: useFnwl ? 'fnwl' : 'legacy_catalog',
      confidence: 'estimated',
      deltaPct,
      strategy: 'profile_closest',
    };
  }

  const sapKoh = (legacySapKoh + fnwlSapKoh) / 2;
  return {
    sapKoh,
    sapNaoh: sapKohToSapNaoh(sapKoh),
    // The value is a blend of neither source; report the nearer label, `estimated` conveys it.
    primarySource: fnwlSapKoh >= legacySapKoh ? 'fnwl' : 'legacy_catalog',
    confidence: 'estimated',
    deltaPct,
    strategy: 'midpoint',
  };
}
