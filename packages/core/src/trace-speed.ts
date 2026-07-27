import { FATTY_ACID_GROUP_KEYS, sumFattyAcids, type FattyAcidProfile } from './fatty-acids.js';

export type TraceSpeed = { score: number; label: 'slow' | 'moderate' | 'fast'; drivers: string[] };

/**
 * Transparent, tunable heuristic — trace speed has no verified constant. Accelerators
 * (saturated + long-chain acids, ricinoleic, sugar-family additives, warm soaping) push
 * the score up; oleic + polyunsaturated acids and cool soaping push it down. Thresholds
 * ±15 split slow/moderate/fast. Weights are deliberate and adjustable; the copy that
 * surfaces this is behavior-only.
 *
 * soapingTempF is calibrated against the CP "average" starting band (120–130 °F): ≥140
 * +15, 120–139 neutral, 100–119 −7, 80–99 −15, below 80 −20. CALLERS pass it only for
 * CP — an HP cook temperature through this calibration would double-count what the HP
 * process already implies. Omitting it reproduces the pre-temperature behavior exactly.
 */
export function estimateTraceSpeed(args: {
  fattyAcids: FattyAcidProfile | null;
  hasAcceleratingAdditive: boolean;
  soapingTempF?: number;
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
  const t = args.soapingTempF;
  const tempBoost =
    t === undefined ? 0 : t >= 140 ? 15 : t >= 120 ? 0 : t >= 100 ? -7 : t >= 80 ? -15 : -20;
  const score = saturated + ricinoleic * 1.5 + sugarBoost + tempBoost - (oleic + poly);
  const drivers: string[] = [];
  if (saturated > 30) drivers.push('high saturated fats');
  if (ricinoleic >= 5) drivers.push('castor / ricinoleic');
  if (sugarBoost) drivers.push('sugar additive');
  if (oleic + poly > 45) drivers.push('high soft (oleic/PUFA) oils');
  if (tempBoost >= 15) drivers.push('warm soaping temperature');
  // The −7 tier is deliberately driverless: near-neutral, not worth a headline.
  if (tempBoost <= -15) drivers.push('cool soaping temperature');
  const label: TraceSpeed['label'] = score > 15 ? 'fast' : score < -15 ? 'slow' : 'moderate';
  return { score, label, drivers };
}
