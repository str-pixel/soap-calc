import { PRICING_GUIDE } from '@soap-calc/core';
import type { PriceUnit } from './money';

export interface PricedEntry {
  price: string;
  unit: PriceUnit;
}

export interface PricingProfile {
  oilPrices: Record<string, PricedEntry>;
  additivePrices: Record<string, PricedEntry>;
  lyePrice: PricedEntry;
  packagingPerUnit: string;
  laborMinutes: string;
  laborRatePerHour: string;
  laborBurdenPercent: string;
  overheadMode: 'percent' | 'flat';
  overheadPercent: string;
  overheadFlat: string;
  priceLever: 'margin' | 'markup';
  targetMarginPercent: string;
  markupPercent: string;
  outputUnit: PriceUnit;
  currencySymbol: string;
}

export const DEFAULT_PRICING_PROFILE: PricingProfile = {
  oilPrices: {},
  additivePrices: {},
  lyePrice: { price: '', unit: 'kg' },
  packagingPerUnit: '0',
  laborMinutes: '0',
  laborRatePerHour: '0',
  laborBurdenPercent: String(PRICING_GUIDE.defaultLaborBurdenPercent),
  overheadMode: 'percent',
  overheadPercent: String(PRICING_GUIDE.defaultOverheadPercent),
  overheadFlat: '0',
  priceLever: 'margin',
  targetMarginPercent: String(PRICING_GUIDE.defaultTargetMarginPercent),
  markupPercent: '0',
  outputUnit: 'kg',
  currencySymbol: '$',
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function priceUnit(v: unknown, fallback: PriceUnit): PriceUnit {
  return v === 'kg' || v === 'lb' ? v : fallback;
}

function pricedEntry(v: unknown, fallback: PricedEntry): PricedEntry {
  if (!isRecord(v)) return { ...fallback };
  return { price: str(v.price, fallback.price), unit: priceUnit(v.unit, fallback.unit) };
}

function priceBook(v: unknown): Record<string, PricedEntry> {
  if (!isRecord(v)) return {};
  // Object.fromEntries creates own data properties, so a '__proto__' price key
  // (reachable via imported additive catalogIds) stays an own key instead of
  // silently replacing the record's prototype and losing the user's price.
  return Object.fromEntries(
    Object.entries(v)
      .filter((pair): pair is [string, Record<string, unknown>] => {
        const entry = pair[1];
        return isRecord(entry) && typeof entry.price === 'string';
      })
      .map(([key, entry]) => [key, { price: entry.price as string, unit: priceUnit(entry.unit, 'kg') }]),
  );
}

export function normalizePricingProfile(raw: unknown): PricingProfile {
  if (!isRecord(raw)) return { ...DEFAULT_PRICING_PROFILE };
  const d = DEFAULT_PRICING_PROFILE;
  return {
    oilPrices: priceBook(raw.oilPrices),
    additivePrices: priceBook(raw.additivePrices),
    lyePrice: pricedEntry(raw.lyePrice, d.lyePrice),
    packagingPerUnit: str(raw.packagingPerUnit, d.packagingPerUnit),
    laborMinutes: str(raw.laborMinutes, d.laborMinutes),
    laborRatePerHour: str(raw.laborRatePerHour, d.laborRatePerHour),
    laborBurdenPercent: str(raw.laborBurdenPercent, d.laborBurdenPercent),
    overheadMode: raw.overheadMode === 'flat' ? 'flat' : 'percent',
    overheadPercent: str(raw.overheadPercent, d.overheadPercent),
    overheadFlat: str(raw.overheadFlat, d.overheadFlat),
    priceLever: raw.priceLever === 'markup' ? 'markup' : 'margin',
    targetMarginPercent: str(raw.targetMarginPercent, d.targetMarginPercent),
    markupPercent: str(raw.markupPercent, d.markupPercent),
    outputUnit: priceUnit(raw.outputUnit, d.outputUnit),
    currencySymbol: str(raw.currencySymbol, d.currencySymbol),
  };
}
