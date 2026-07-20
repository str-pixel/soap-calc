import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICING_PROFILE } from './pricingProfile';
import {
  additivePriceKey,
  buildRecipePricingContext,
  buildPricingInput,
  computeRecipePricing,
  hasMissingMaterialPrice,
  type RecipePricingContext,
} from './recipePricing';

const ctx: RecipePricingContext = {
  oilLines: [{ key: 'a', oilId: 'olive-oil', grams: 1000, name: 'Olive Oil' }],
  additives: [{ key: 'k1', catalogId: 'fragrance', name: 'Fragrance', grams: 30 }],
  lyeGrams: 140,
  totalBatchGrams: 1610,
};

describe('additivePriceKey', () => {
  it('prefers catalogId', () => {
    expect(additivePriceKey({ key: 'k1', catalogId: 'fragrance', name: 'X' })).toBe('fragrance');
  });
  it('falls back to a name key, then the line key', () => {
    expect(additivePriceKey({ key: 'k1', catalogId: '', name: 'My Blend' })).toBe('name:my blend');
    expect(additivePriceKey({ key: 'k1', catalogId: '', name: 'Additive' })).toBe('line:k1');
    expect(additivePriceKey({ key: 'k1', catalogId: '', name: '' })).toBe('line:k1');
  });
});

describe('buildPricingInput', () => {
  it('maps price-book entries to per-gram prices', () => {
    const profile = {
      ...DEFAULT_PRICING_PROFILE,
      oilPrices: { 'olive-oil': { price: '4.50', unit: 'kg' as const } },
      additivePrices: { fragrance: { price: '50', unit: 'kg' as const } },
      lyePrice: { price: '2', unit: 'kg' as const },
    };
    const input = buildPricingInput(ctx, profile);
    expect(input.oilLines[0].pricePerGram).toBeCloseTo(0.0045, 8);
    expect(input.additiveLines[0].pricePerGram).toBeCloseTo(0.05, 8);
    expect(input.lyePricePerGram).toBeCloseTo(0.002, 8);
    expect(input.totalBatchGrams).toBe(1610);
  });
});

describe('hasMissingMaterialPrice', () => {
  it('is true when an oil has no price', () => {
    expect(hasMissingMaterialPrice(ctx, DEFAULT_PRICING_PROFILE)).toBe(true);
  });
  it('is false when all oils, additives, and the lye are priced', () => {
    const profile = {
      ...DEFAULT_PRICING_PROFILE,
      oilPrices: { 'olive-oil': { price: '4.50', unit: 'kg' as const } },
      additivePrices: { fragrance: { price: '50', unit: 'kg' as const } },
      lyePrice: { price: '3.00', unit: 'kg' as const },
    };
    expect(hasMissingMaterialPrice(ctx, profile)).toBe(false);
  });
});

describe('computeRecipePricing', () => {
  it('returns a full PricingResult', () => {
    const profile = {
      ...DEFAULT_PRICING_PROFILE,
      oilPrices: { 'olive-oil': { price: '4.50', unit: 'kg' as const } },
    };
    const r = computeRecipePricing(ctx, profile);
    expect(r.materialsOils).toBeCloseTo(4.5, 6);
    expect(r.costPerUnit).not.toBeNull();
  });
});

describe('lye pricing gate (deep-review)', () => {
  const ctx = {
    oilLines: [{ key: 'a', oilId: 'olive-oil', grams: 1000, name: 'Olive Oil' }],
    additives: [],
    lyeGrams: 140,
    totalBatchGrams: 1470,
  };
  const pricedOils = {
    ...DEFAULT_PRICING_PROFILE,
    oilPrices: { 'olive-oil': { price: '4.50', unit: 'kg' as const } },
  };

  it('flags a blank lye price as incomplete when the recipe uses lye', () => {
    expect(hasMissingMaterialPrice(ctx, pricedOils)).toBe(true);
  });

  it('is satisfied once lye is priced', () => {
    const profile = { ...pricedOils, lyePrice: { price: '3.00', unit: 'kg' as const } };
    expect(hasMissingMaterialPrice(ctx, profile)).toBe(false);
  });

  it('ignores lye when the recipe has none', () => {
    expect(hasMissingMaterialPrice({ ...ctx, lyeGrams: 0 }, pricedOils)).toBe(false);
  });
});

describe('buildRecipePricingContext (deep-review)', () => {
  const lines = [
    { key: 'l1', oilId: 'olive-oil', weightGrams: '900' },
    { key: 'l2', oilId: 'coconut-oil-76f', weightGrams: '0' },
  ];

  it('includes only positive-weight oil lines', () => {
    const out = buildRecipePricingContext({
      lines, computedAdditives: [], lyeGrams: 130, batchWeightWithExtras: 1400,
      splitLiquid: null, postCookSuperfat: null,
    });
    expect(out.oilLines).toHaveLength(1);
    expect(out.oilLines[0].oilId).toBe('olive-oil');
  });

  it('prices an append-mode post-cook superfat oil via its oil id', () => {
    const out = buildRecipePricingContext({
      lines, computedAdditives: [], lyeGrams: 130, batchWeightWithExtras: 1450,
      splitLiquid: null,
      postCookSuperfat: { oilId: 'jojoba-oil', grams: 50, isExtra: true },
    });
    expect(out.oilLines.some((o) => o.oilId === 'jojoba-oil' && o.grams === 50)).toBe(true);
  });

  it('leaves a subtract-mode (reserved) superfat out — those grams are already priced', () => {
    const out = buildRecipePricingContext({
      lines, computedAdditives: [], lyeGrams: 130, batchWeightWithExtras: 1400,
      splitLiquid: null,
      postCookSuperfat: { oilId: 'jojoba-oil', grams: 50, isExtra: false },
    });
    expect(out.oilLines.some((o) => o.oilId === 'jojoba-oil')).toBe(false);
  });

  it('exposes an enabled split liquid as a priceable material', () => {
    const out = buildRecipePricingContext({
      lines, computedAdditives: [], lyeGrams: 130, batchWeightWithExtras: 1700,
      splitLiquid: { name: 'goat milk', grams: 300 }, postCookSuperfat: null,
    });
    expect(out.additives.some((a) => a.name === 'goat milk' && a.grams === 300)).toBe(true);
    // and an unpriced split liquid must trip the incomplete gate
    const profile = {
      ...DEFAULT_PRICING_PROFILE,
      oilPrices: { 'olive-oil': { price: '4.50', unit: 'kg' as const } },
      lyePrice: { price: '3.00', unit: 'kg' as const },
    };
    expect(hasMissingMaterialPrice(out, profile)).toBe(true);
  });
});
