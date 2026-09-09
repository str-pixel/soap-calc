// packages/web/src/lib/colorantGuidance.ts
import {
  COLORANT_STABILITY_TEXT,
  colorantEntryById,
  tspPerLbToPercentOfOils,
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

/** A dose as the FIELD takes it — percent of oils — ROUNDED FOR READING. One decimal is
 * enough on screen; below a tenth of a percent it takes two, so a thirty-second of a
 * teaspoon does not round away to nothing. */
export function percentText(tspPerLb: number): string {
  const pct = tspPerLbToPercentOfOils(tspPerLb);
  return pct < 0.1 ? pct.toFixed(2) : pct.toFixed(1);
}

/** The same dose as a VALUE to put in the field. Two decimals, because the reading round
 * is a tenth of a percent wide and seeding 0.1 where the source says 0.11 would quietly
 * shave a tenth off the gentlest dose the source gives. Trailing zeros go. */
export function percentValue(tspPerLb: number): string {
  const pct = tspPerLbToPercentOfOils(tspPerLb);
  return String(Number(pct.toFixed(2)));
}

/** One rate, in percent first because that is the field's own unit, with the trade's
 * teaspoon figure alongside it. */
function rateText(tspPerLbLow: number, tspPerLbHigh: number, unit: WeightUnit): string {
  const metric = isMetric(unit);
  const per = metric ? 'kg' : 'lb';
  const spoonLow = tsp(metric ? tspPerLbLow * LB_PER_KG : tspPerLbLow);
  const spoonHigh = tsp(metric ? tspPerLbHigh * LB_PER_KG : tspPerLbHigh);
  const pctLow = percentText(tspPerLbLow);
  const pctHigh = percentText(tspPerLbHigh);
  const pct = pctLow === pctHigh ? `${pctLow}%` : `${pctLow}–${pctHigh}%`;
  const spoons = spoonLow === spoonHigh ? `${spoonLow} tsp per ${per}` : `${spoonLow}–${spoonHigh} tsp per ${per}`;
  return `About ${pct} of the oils, which is ${spoons}`;
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
    return `${rateText(entry.tspPerLbLow, entry.tspPerLbHigh, unit)}. Powders differ in density, so start at the low end, weigh your spoonful once, and go by the scale after that.`;
  }
  const g = COLORANT_GUIDANCE[kind];
  if (!g) return null;
  return `${rateText(g.tspPerLbLow, g.tspPerLbHigh, unit)}. Powders differ in density, so start at the low end, weigh your spoonful once, and go by the scale after that.`;
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
  // Percent first: it is what the dose field takes, so the ladder is directly actionable.
  const rungs = entry.shades
    .map((s) => `${percentText(s.tspPerLb)}% ${s.colour}`)
    .join(' · ');
  const spoons = `${tsp(metric ? entry.shades[0].tspPerLb * LB_PER_KG : entry.shades[0].tspPerLb)}` +
    `–${tsp(metric ? entry.shades[entry.shades.length - 1].tspPerLb * LB_PER_KG : entry.shades[entry.shades.length - 1].tspPerLb)}` +
    ` tsp per ${per}`;
  return `${rungs}. That is ${spoons} of oils.`;
}

/** The top of a colour's band as the panel PRINTS it. The guard has to judge against this
 * and not the raw figure: 1 tsp per pound is 0.881849% but reads as "0.9", and a maker who
 * types the number they were shown must not be told they have overdosed. */
export function colorantCeilingPercent(catalogId: string): number | null {
  const entry = catalogId ? colorantEntryById(catalogId) : undefined;
  if (!entry || entry.tspPerLbHigh === null) return null;
  return Number(percentText(entry.tspPerLbHigh));
}

/** What months of light and alkali do to this colour, or null when no source says. */
export function colorantStabilityText(catalogId: string): string | null {
  const entry = catalogId ? colorantEntryById(catalogId) : undefined;
  return entry?.stability ? COLORANT_STABILITY_TEXT[entry.stability] : null;
}
