import { FATTY_ACID_GROUP_KEYS, sumFattyAcids, type FattyAcidProfile } from './fatty-acids.js';

export type TraceSpeed = { score: number; label: 'slow' | 'moderate' | 'fast'; drivers: string[] };

/**
 * Transparent, tunable heuristic — trace speed has no verified constant. Accelerators
 * (saturated + long-chain acids, ricinoleic, sugar-family additives) push the score up;
 * oleic + polyunsaturated acids push it down. Thresholds ±15 split slow/moderate/fast.
 * Weights are deliberate and adjustable; the copy that surfaces this is behavior-only.
 */
export function estimateTraceSpeed(args: {
  fattyAcids: FattyAcidProfile | null;
  hasAcceleratingAdditive: boolean;
}): TraceSpeed | null {
  const fa = args.fattyAcids;
  if (!fa) return null;
  const saturated =
    sumFattyAcids(fa, FATTY_ACID_GROUP_KEYS.lauricMyristic) +
    sumFattyAcids(fa, FATTY_ACID_GROUP_KEYS.palmiticStearic);
  const ricinoleic = fa.ricinoleic ?? 0;
  const oleic = fa.oleic ?? 0;
  const poly = sumFattyAcids(fa, FATTY_ACID_GROUP_KEYS.polyunsaturated);
  const sugarBoost = args.hasAcceleratingAdditive ? 15 : 0;
  const score = saturated + ricinoleic * 1.5 + sugarBoost - (oleic + poly);
  const drivers: string[] = [];
  if (saturated > 30) drivers.push('high saturated fats');
  if (ricinoleic >= 5) drivers.push('castor / ricinoleic');
  if (sugarBoost) drivers.push('sugar additive');
  if (oleic + poly > 45) drivers.push('high soft (oleic/PUFA) oils');
  const label: TraceSpeed['label'] = score > 15 ? 'fast' : score < -15 ? 'slow' : 'moderate';
  return { score, label, drivers };
}
