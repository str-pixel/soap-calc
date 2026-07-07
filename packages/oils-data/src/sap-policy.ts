import { sapKohToSapNaoh } from '@soap-calc/core';

export const VERIFIED_DELTA_PCT = 5;
export const DISPUTED_DELTA_PCT = 10;

export type SapResolution = {
  sapKoh: number;
  sapNaoh: number;
  primarySource: 'fnwl' | 'legacy_catalog';
  confidence: 'verified' | 'estimated' | 'legacy_only';
  deltaPct: number;
  strategy: 'fnwl_agrees' | 'conservative_blend' | 'legacy_retained' | 'fnwl_preferred';
};

export function sapDeltaPercent(legacy: number, fnwl: number): number {
  return (Math.abs(legacy - fnwl) / legacy) * 100;
}

/**
 * Choose primary SAP for lye calculations.
 * - ≤5% delta: trust FNWL
 * - 5–10% delta: use higher SAP (more lye = safer)
 * - >10% delta: keep legacy unless FNWL is higher (more lye = safer)
 */
export function resolvePrimarySap(legacySapKoh: number, fnwlSapKoh: number): SapResolution {
  const deltaPct = sapDeltaPercent(legacySapKoh, fnwlSapKoh);

  if (deltaPct <= VERIFIED_DELTA_PCT) {
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

  if (deltaPct <= DISPUTED_DELTA_PCT) {
    const sapKoh = Math.max(legacySapKoh, fnwlSapKoh);
    return {
      sapKoh,
      sapNaoh: sapKohToSapNaoh(sapKoh),
      primarySource: fnwlSapKoh >= legacySapKoh ? 'fnwl' : 'legacy_catalog',
      confidence: 'estimated',
      deltaPct,
      strategy: 'conservative_blend',
    };
  }

  const usingFnwl = fnwlSapKoh > legacySapKoh;
  const sapKoh = usingFnwl ? fnwlSapKoh : legacySapKoh;
  return {
    sapKoh,
    sapNaoh: sapKohToSapNaoh(sapKoh),
    primarySource: usingFnwl ? 'fnwl' : 'legacy_catalog',
    confidence: usingFnwl ? 'estimated' : 'legacy_only',
    deltaPct,
    strategy: usingFnwl ? 'fnwl_preferred' : 'legacy_retained',
  };
}
