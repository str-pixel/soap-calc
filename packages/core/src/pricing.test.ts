import { describe, expect, it } from 'vitest';
import { computePricing, PRICING_GUIDE, type PricingInput } from './pricing.js';

const base: PricingInput = {
  oilLines: [{ grams: 1000, pricePerGram: 0.0045 }],   // $4.50/kg
  additiveLines: [{ grams: 30, pricePerGram: 0.05 }],   // $50/kg fragrance
  lyeGrams: 140, lyePricePerGram: 0.002,                // $2/kg lye
  totalBatchGrams: 1610,
  packagingPerGram: 0,
  laborMinutes: 30, hourlyRate: 20, laborBurdenPercent: 15,
  overhead: { mode: 'percent', percent: 20 },
  lever: { mode: 'margin', marginPercent: 65 },
  outputUnit: 'kg',
};

describe('computePricing', () => {
  it('computes the COGS split', () => {
    const r = computePricing(base);
    expect(r.materialsOils).toBeCloseTo(4.5, 6);
    expect(r.materialsAdditives).toBeCloseTo(1.5, 6);
    expect(r.lyeCost).toBeCloseTo(0.28, 6);
    expect(r.labor).toBeCloseTo((30 / 60) * 20 * 1.15, 6);        // 11.5
    // overhead = 20% of (materials 6.28 + labor 11.5) = 3.556
    expect(r.overhead).toBeCloseTo(0.2 * (6.28 + 11.5), 6);
    expect(r.cogsBatch).toBeCloseTo(6.28 + 11.5 + 0.2 * (6.28 + 11.5), 6);
  });

  it('derives cost & price per kg and round-trips margin', () => {
    const r = computePricing(base);
    expect(r.costPerUnit).toBeCloseTo(r.cogsBatch / (1610 / 1000), 6);
    // price = cost / (1 - 0.65)
    expect(r.suggestedPricePerUnit).toBeCloseTo(r.costPerUnit! / 0.35, 6);
    expect(r.marginPercent).toBeCloseTo(65, 6);         // round-trips the input margin
    expect(r.profitPerUnit).toBeCloseTo(r.suggestedPricePerUnit! - r.costPerUnit!, 6);
  });

  it('converts to per-lb when outputUnit is lb', () => {
    const r = computePricing({ ...base, outputUnit: 'lb' });
    expect(r.costPerUnit).toBeCloseTo(r.cogsBatch / (1610 / 453.59237), 6);
  });

  it('applies markup lever', () => {
    const r = computePricing({ ...base, lever: { mode: 'markup', markupPercent: 200 } });
    expect(r.suggestedPricePerUnit).toBeCloseTo(r.costPerUnit! * 3, 6);
    expect(r.markupPercent).toBeCloseTo(200, 6);
  });

  it('guards zero batch weight and unreachable margin', () => {
    expect(computePricing({ ...base, totalBatchGrams: 0 }).costPerUnit).toBeNull();
    expect(computePricing({ ...base, lever: { mode: 'margin', marginPercent: 100 } }).suggestedPricePerUnit)
      .toBeNull();
  });

  it('guards a non-finite markup percent', () => {
    expect(
      computePricing({ ...base, lever: { mode: 'markup', markupPercent: Infinity } }).suggestedPricePerUnit,
    ).toBeNull();
    expect(
      computePricing({ ...base, lever: { mode: 'markup', markupPercent: NaN } }).suggestedPricePerUnit,
    ).toBeNull();
  });

  it('treats null prices as zero cost', () => {
    const r = computePricing({
      ...base,
      oilLines: [{ grams: 1000, pricePerGram: null }],
      additiveLines: [], lyePricePerGram: null,
    });
    expect(r.materialsOils).toBe(0);
    expect(r.lyeCost).toBe(0);
  });

  it('exposes neutral numeric defaults', () => {
    expect(PRICING_GUIDE.defaultTargetMarginPercent).toBe(65);
    expect(PRICING_GUIDE.defaultLaborBurdenPercent).toBe(15);
    expect(PRICING_GUIDE.defaultOverheadPercent).toBe(20);
  });
});
