// packages/web/src/lib/colorantGuidance.ts
import { COLORANT_GUIDANCE, HP_COLORANT_WATER_GRAMS, type ColorantDispersal, type ColorantKind } from '@soap-calc/core';
import { formatWeight, WEIGHT_UNITS, type WeightUnit } from './weightUnits';

/** Derived from the unit table, never re-hardcoded. */
const LB_PER_KG = WEIGHT_UNITS.kg.gramsPerUnit / WEIGHT_UNITS.lb.gramsPerUnit;
const isMetric = (unit: WeightUnit) => unit === 'g' || unit === 'kg';

/** ½, 1, 1½, 2 … — the way a spoon is read. */
function tsp(n: number): string {
  const half = Math.round(n * 2) / 2;
  const whole = Math.floor(half);
  const frac = half - whole;
  if (whole === 0) return frac ? '½' : '0';
  return frac ? `${whole}½` : String(whole);
}

export function colorantGuidanceText(kind: ColorantKind, unit: WeightUnit): string | null {
  const g = COLORANT_GUIDANCE[kind];
  if (!g) return null;
  const metric = isMetric(unit);
  const low = tsp(metric ? g.tspPerLbLow * LB_PER_KG : g.tspPerLbLow);
  const high = tsp(metric ? g.tspPerLbHigh * LB_PER_KG : g.tspPerLbHigh);
  const per = metric ? 'kg' : 'lb';
  const half = kind === 'oxide' ? ' half or less for brown and red;' : '';
  return `About ${low}–${high} tsp per ${per} of oils — roughly ${g.percentLow}–${g.percentHigh}% by weight;${half} density varies by product, start low.`;
}

export function hpWaterText(unit: WeightUnit): string {
  return isMetric(unit)
    ? `${Math.round(HP_COLORANT_WATER_GRAMS.low)}–${Math.round(HP_COLORANT_WATER_GRAMS.high)} g hot water and a pinch of sugar`
    : '¼–½ oz hot water and a pinch of sugar';
}

/** How a colour is dispersed, as the panel, the Full recipe and the printed sheet all say
 * it — one phrase per method (no closing stop: the manifest joins it with "·"), so the HP
 * water figure cannot read two ways. */
export function colorantDispersalText(d: ColorantDispersal, unit: WeightUnit): string {
  switch (d.method) {
    case 'carrier-oil':
      return d.carrierGrams !== null
        ? `Mix 1:1 with a light carrier oil (${formatWeight(d.carrierGrams, unit)})`
        : 'Mix 1:1 with a light carrier oil';
    case 'hot-sugar-water':
      return `Disperse in ${hpWaterText(unit)}`;
    case 'recipe-oil':
      return 'Stir straight into the warmed oils — no slurry for a single colour';
    case 'warm-water':
      return 'Dissolve in a little warm water';
  }
}
