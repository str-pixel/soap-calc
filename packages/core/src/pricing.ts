const GRAMS_PER_KG = 1000;
const GRAMS_PER_LB = 453.59237;

/** Neutral numeric defaults (informed, not copied). Follows the *_GUIDE convention. */
export const PRICING_GUIDE = {
  defaultTargetMarginPercent: 65,
  defaultLaborBurdenPercent: 15,
  defaultOverheadPercent: 20,
} as const;

export interface PricingLine {
  grams: number;
  pricePerGram: number | null;
}

export interface PricingInput {
  oilLines: PricingLine[];
  additiveLines: PricingLine[];
  lyeGrams: number;
  lyePricePerGram: number | null;
  /** = the app's batchWeightWithExtras; the cost-per-unit divisor */
  totalBatchGrams: number;
  packagingPerGram: number;
  laborMinutes: number;
  hourlyRate: number;
  laborBurdenPercent: number;
  overhead: { mode: 'percent'; percent: number } | { mode: 'flat'; amount: number };
  lever: { mode: 'margin'; marginPercent: number } | { mode: 'markup'; markupPercent: number };
  outputUnit: 'kg' | 'lb';
}

export interface PricingResult {
  materialsOils: number;
  materialsAdditives: number;
  lyeCost: number;
  labor: number;
  overhead: number;
  packaging: number;
  cogsBatch: number;
  costPerUnit: number | null;
  suggestedPricePerUnit: number | null;
  profitPerUnit: number | null;
  marginPercent: number | null;
  markupPercent: number | null;
}

const pos = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

function sumLines(lines: PricingLine[]): number {
  // pos() on the price too: a negative price is treated as unpriced (0), matching
  // the web layer's pricePerGram which rejects negatives — COGS can never go negative.
  return lines.reduce((s, l) => s + pos(l.grams) * pos(l.pricePerGram ?? 0), 0);
}

export function computePricing(input: PricingInput): PricingResult {
  const materialsOils = sumLines(input.oilLines);
  const materialsAdditives = sumLines(input.additiveLines);
  const lyeCost = pos(input.lyeGrams) * pos(input.lyePricePerGram ?? 0);

  const labor = (pos(input.laborMinutes) / 60) * pos(input.hourlyRate) * (1 + pos(input.laborBurdenPercent) / 100);
  const materials = materialsOils + materialsAdditives + lyeCost;
  const overhead =
    input.overhead.mode === 'flat'
      ? pos(input.overhead.amount)
      : (pos(input.overhead.percent) / 100) * (materials + labor);
  const packaging = pos(input.packagingPerGram) * pos(input.totalBatchGrams);
  const cogsBatch = materials + labor + overhead + packaging;

  const unitGrams = input.outputUnit === 'lb' ? GRAMS_PER_LB : GRAMS_PER_KG;
  const costPerUnit = input.totalBatchGrams > 0 ? cogsBatch / (input.totalBatchGrams / unitGrams) : null;

  let suggestedPricePerUnit: number | null = null;
  if (costPerUnit != null) {
    if (input.lever.mode === 'margin') {
      const m = input.lever.marginPercent;
      suggestedPricePerUnit = Number.isFinite(m) && m < 100 ? costPerUnit / (1 - m / 100) : null;
    } else {
      suggestedPricePerUnit = Number.isFinite(input.lever.markupPercent)
        ? costPerUnit * (1 + input.lever.markupPercent / 100)
        : null;
    }
  }

  const profitPerUnit =
    costPerUnit != null && suggestedPricePerUnit != null ? suggestedPricePerUnit - costPerUnit : null;
  const marginPercent =
    costPerUnit != null && suggestedPricePerUnit != null && suggestedPricePerUnit > 0
      ? ((suggestedPricePerUnit - costPerUnit) / suggestedPricePerUnit) * 100
      : null;
  const markupPercent =
    costPerUnit != null && suggestedPricePerUnit != null && costPerUnit > 0
      ? ((suggestedPricePerUnit - costPerUnit) / costPerUnit) * 100
      : null;

  return {
    materialsOils, materialsAdditives, lyeCost, labor, overhead, packaging, cogsBatch,
    costPerUnit, suggestedPricePerUnit, profitPerUnit, marginPercent, markupPercent,
  };
}
