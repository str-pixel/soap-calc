import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICING_PROFILE } from './pricingProfile';
import {
  additivePriceKey,
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
  it('is false when all oils and additives are priced', () => {
    const profile = {
      ...DEFAULT_PRICING_PROFILE,
      oilPrices: { 'olive-oil': { price: '4.50', unit: 'kg' as const } },
      additivePrices: { fragrance: { price: '50', unit: 'kg' as const } },
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
