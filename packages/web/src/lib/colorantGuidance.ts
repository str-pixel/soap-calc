// packages/web/src/lib/colorantGuidance.ts
import {
  COLORANT_STABILITY_TEXT,
  colorantEntryById,
  COLORANT_GUIDANCE,
  HP_COLORANT_WATER_GRAMS,
  type ColorantDispersal,
  type ColorantKind,
} from '@soap-calc/core';
import { formatWeight, WEIGHT_UNITS, type WeightUnit } from './weightUnits';

/** Derived from the unit table, never re-hardcoded. */
const LB_PER_KG = WEIGHT_UNITS.kg.gramsPerUnit / WEIGHT_UNITS.lb.gramsPerUnit;
const isMetric = (unit: WeightUnit) => unit === 'g' || unit === 'kg';

/** The spoon fractions a maker actually owns, smallest first. Turmeric's sourced low end
 * is a thirty-second of a teaspoon, so rounding to halves would print it as nothing. */
const SPOON_FRACTIONS: ReadonlyArray<[value: number, label: string]> = [
  [1 / 32, '¹⁄₃₂'],
  [1 / 16, '¹⁄₁₆'],
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
];

/** ⅛, ½, 1, 1½, 2 … — the way a spoon is read. Below half a spoon the nearest common
 * fraction is used; above it, halves. */
export function tsp(n: number): string {
  if (n <= 0) return '0';
  if (n < 0.75) {
    let best = SPOON_FRACTIONS[0];
    for (const f of SPOON_FRACTIONS) {
      if (Math.abs(Math.log(n / f[0])) < Math.abs(Math.log(n / best[0]))) best = f;
    }
    return best[1];
  }
  const half = Math.round(n * 2) / 2;
  const whole = Math.floor(half);
  return half - whole ? `${whole}½` : String(whole);
}

/** One rate, rendered per pound or per kilo of oils. */
function rateText(tspPerLbLow: number, tspPerLbHigh: number, unit: WeightUnit): string {
  const metric = isMetric(unit);
  const low = tsp(metric ? tspPerLbLow * LB_PER_KG : tspPerLbLow);
  const high = tsp(metric ? tspPerLbHigh * LB_PER_KG : tspPerLbHigh);
  const per = metric ? 'kg' : 'lb';
  return low === high ? `About ${low} tsp per ${per} of oils` : `About ${low}–${high} tsp per ${per} of oils`;
}

/** The dose guidance for a row: a catalog entry's own band when it has one, otherwise the
 * band for its kind. Null when neither is sourceable — the maker doses to shade. */
export function colorantGuidanceText(kind: ColorantKind, unit: WeightUnit, catalogId = ''): string | null {
  const entry = catalogId ? colorantEntryById(catalogId) : undefined;
  // A catalog pick ships ITS OWN sourced rate. No weight percent is quoted with it: grams
  // per teaspoon varies by product, so converting would manufacture a precision the source
  // does not have — the maker weighs the spoonful once and types the percent.
  if (entry) {
    if (entry.tspPerLbLow === null || entry.tspPerLbHigh === null) return null;
    return `${rateText(entry.tspPerLbLow, entry.tspPerLbHigh, unit)} — weigh a spoonful once to fix your own percent, and start low.`;
  }
  const g = COLORANT_GUIDANCE[kind];
  if (!g) return null;
  const half = kind === 'oxide' ? ' half or less for brown and red;' : '';
  return `${rateText(g.tspPerLbLow, g.tspPerLbHigh, unit)} — roughly ${g.percentLow}–${g.percentHigh}% by weight;${half} density varies by product, start low.`;
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
    case 'into-solution':
      // No source prescribes a temperature; a dye is water soluble and often already liquid.
      return 'Stir straight into the diluted soap';
  }
}

/** The shade ladder as one line: "Teaspoons per lb of oils: ⅛ light grey · ½ medium grey".
 * The unit is named once in the lead-in rather than repeated on every rung — but it IS
 * named, because a bare "¼ light grey" is a quarter of nothing. Null when the colour has no
 * sourced ladder. */
export function colorantShadeLadder(catalogId: string, unit: WeightUnit): string | null {
  const entry = catalogId ? colorantEntryById(catalogId) : undefined;
  if (!entry?.shades?.length) return null;
  const metric = isMetric(unit);
  const per = metric ? 'kg' : 'lb';
  const rungs = entry.shades
    .map((s) => `${tsp(metric ? s.tspPerLb * LB_PER_KG : s.tspPerLb)} ${s.colour}`)
    .join(' · ');
  return `Teaspoons per ${per} of oils: ${rungs}.`;
}

/** What months of light and alkali do to this colour, or null when no source says. */
export function colorantStabilityText(catalogId: string): string | null {
  const entry = catalogId ? colorantEntryById(catalogId) : undefined;
  return entry?.stability ? COLORANT_STABILITY_TEXT[entry.stability] : null;
}
