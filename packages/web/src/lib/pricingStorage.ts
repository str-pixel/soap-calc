import {
  DEFAULT_PRICING_PROFILE,
  normalizePricingProfile,
  type PricingProfile,
} from './pricingProfile';

export const PRICING_STORAGE_KEY = 'soap-calc:pricing';
const PRICING_STORAGE_VERSION = 1;

export function loadPricingProfile(): PricingProfile {
  try {
    const raw = localStorage.getItem(PRICING_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PRICING_PROFILE };
    const data = JSON.parse(raw) as unknown;
    const payload =
      typeof data === 'object' && data !== null && 'profile' in data
        ? (data as { profile: unknown }).profile
        : data;
    return normalizePricingProfile(payload);
  } catch {
    return { ...DEFAULT_PRICING_PROFILE };
  }
}

export function savePricingProfile(profile: PricingProfile): void {
  try {
    localStorage.setItem(
      PRICING_STORAGE_KEY,
      JSON.stringify({ version: PRICING_STORAGE_VERSION, profile }),
    );
  } catch {
    // ignore quota errors
  }
}
