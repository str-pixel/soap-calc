import { computePricing, type PricingInput, type PricingResult } from '@soap-calc/core';
import { pricePerGram } from './money';
import type { PricedEntry, PricingProfile } from './pricingProfile';

export interface RecipePricingContext {
  oilLines: Array<{ oilId: string; grams: number; name: string }>;
  additives: Array<{ key: string; catalogId: string; name: string; grams: number }>;
  lyeGrams: number;
  totalBatchGrams: number;
}

export function additivePriceKey(a: { key: string; catalogId: string; name: string }): string {
  if (a.catalogId) return a.catalogId;
  const n = a.name.trim().toLowerCase();
  return n && n !== 'additive' ? `name:${n}` : `line:${a.key}`;
}

function entryPerGram(entry: PricedEntry | undefined): number | null {
  return entry ? pricePerGram(entry.price, entry.unit) : null;
}

export function buildPricingInput(ctx: RecipePricingContext, profile: PricingProfile): PricingInput {
  return {
    oilLines: ctx.oilLines.map((o) => ({
      grams: o.grams,
      pricePerGram: entryPerGram(profile.oilPrices[o.oilId]),
    })),
    additiveLines: ctx.additives.map((a) => ({
      grams: a.grams,
      pricePerGram: entryPerGram(profile.additivePrices[additivePriceKey(a)]),
    })),
    lyeGrams: ctx.lyeGrams,
    lyePricePerGram: entryPerGram(profile.lyePrice),
    totalBatchGrams: ctx.totalBatchGrams,
    packagingPerGram: pricePerGram(profile.packagingPerUnit, profile.outputUnit) ?? 0,
    laborMinutes: Number(profile.laborMinutes) || 0,
    hourlyRate: Number(profile.laborRatePerHour) || 0,
    laborBurdenPercent: Number(profile.laborBurdenPercent) || 0,
    overhead:
      profile.overheadMode === 'flat'
        ? { mode: 'flat', amount: Number(profile.overheadFlat) || 0 }
        : { mode: 'percent', percent: Number(profile.overheadPercent) || 0 },
    lever:
      profile.priceLever === 'markup'
        ? { mode: 'markup', markupPercent: Number(profile.markupPercent) || 0 }
        : { mode: 'margin', marginPercent: Number(profile.targetMarginPercent) || 0 },
    outputUnit: profile.outputUnit,
  };
}

export function computeRecipePricing(ctx: RecipePricingContext, profile: PricingProfile): PricingResult {
  return computePricing(buildPricingInput(ctx, profile));
}

export function hasMissingMaterialPrice(ctx: RecipePricingContext, profile: PricingProfile): boolean {
  const oilMissing = ctx.oilLines.some((o) => entryPerGram(profile.oilPrices[o.oilId]) == null);
  const addMissing = ctx.additives.some((a) => entryPerGram(profile.additivePrices[additivePriceKey(a)]) == null);
  return oilMissing || addMissing;
}
