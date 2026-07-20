// packages/web/src/lib/pricingStorage.test.ts
// Web unit tests run under environment:'node' (vitest.config.ts) — no global localStorage.
// Mirror moldSizerStorage.test.ts: stub a Storage impl via vi.stubGlobal (NOT a jsdom pragma).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PRICING_PROFILE, normalizePricingProfile } from './pricingProfile';
import { loadPricingProfile, savePricingProfile } from './pricingStorage';

function createStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear() { store.clear(); },
    getItem(key: string) { return store.get(key) ?? null; },
    key(index: number) { return [...store.keys()][index] ?? null; },
    removeItem(key: string) { store.delete(key); },
    setItem(key: string, value: string) { store.set(key, value); },
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage());
});

describe('normalizePricingProfile', () => {
  it('fills defaults for missing/invalid keys', () => {
    const p = normalizePricingProfile({ currencySymbol: '€', outputUnit: 'lb', junk: 1 });
    expect(p.currencySymbol).toBe('€');
    expect(p.outputUnit).toBe('lb');
    expect(p.targetMarginPercent).toBe(DEFAULT_PRICING_PROFILE.targetMarginPercent);
    expect(p.oilPrices).toEqual({});
  });
  it('returns defaults for non-object input', () => {
    expect(normalizePricingProfile(null)).toEqual(DEFAULT_PRICING_PROFILE);
  });
  it('keeps a valid price-book entry', () => {
    const p = normalizePricingProfile({ oilPrices: { 'olive-oil': { price: '4.50', unit: 'kg' } } });
    expect(p.oilPrices['olive-oil']).toEqual({ price: '4.50', unit: 'kg' });
  });
});

describe('load/save round-trip', () => {
  it('persists and reloads a profile', () => {
    const profile = { ...DEFAULT_PRICING_PROFILE, currencySymbol: '£', laborMinutes: '45' };
    savePricingProfile(profile);
    expect(loadPricingProfile()).toEqual(profile);
  });
  it('returns defaults when storage is empty', () => {
    expect(loadPricingProfile()).toEqual(DEFAULT_PRICING_PROFILE);
  });
});
