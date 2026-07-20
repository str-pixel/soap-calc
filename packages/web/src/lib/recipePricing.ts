import { computePricing, type PricingInput, type PricingResult } from '@soap-calc/core';
import { pricePerGram } from './money';
import { oilDisplayName } from './oilDisplay';
import { bookEntry, type PricedEntry, type PricingProfile } from './pricingProfile';

export interface RecipePricingContext {
  oilLines: Array<{ key: string; oilId: string; grams: number; name: string }>;
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
      pricePerGram: entryPerGram(bookEntry(profile.oilPrices, o.oilId)),
    })),
    additiveLines: ctx.additives.map((a) => ({
      grams: a.grams,
      pricePerGram: entryPerGram(bookEntry(profile.additivePrices, additivePriceKey(a))),
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
  const oilMissing = ctx.oilLines.some((o) => entryPerGram(bookEntry(profile.oilPrices, o.oilId)) == null);
  const addMissing = ctx.additives.some((a) => entryPerGram(bookEntry(profile.additivePrices, additivePriceKey(a))) == null);
  // Lye is a real material: leaving it blank used to silently price it at $0 while
  // every output rendered as a definite figure.
  const lyeMissing = ctx.lyeGrams > 0 && entryPerGram(profile.lyePrice) == null;
  return oilMissing || addMissing || lyeMissing;
}

export interface RecipePricingSource {
  lines: Array<{ key: string; oilId: string; weightGrams: string | number }>;
  computedAdditives: Array<{ key: string; catalogId: string; name: string; grams: number }>;
  lyeGrams: number;
  batchWeightWithExtras: number;
  /** Enabled split liquid, if any — a real material the batch weight already includes. */
  splitLiquid: { name: string; grams: number } | null;
  /** Post-cook superfat; `isExtra` (append mode) means the grams are ADDED to the batch
   * and must be priced — subtract mode reserves oil already priced in `lines`. */
  postCookSuperfat: { oilId: string; grams: number; isExtra: boolean } | null;
}

/** Single source for what the pricing panel can price. Everything included in
 * `batchWeightWithExtras` (the cost divisor) must be priceable here, or per-unit
 * cost is silently understated. */
export function buildRecipePricingContext(src: RecipePricingSource): RecipePricingContext {
  const oilLines = src.lines
    .filter((l) => (Number(l.weightGrams) || 0) > 0)
    .map((l) => ({
      key: l.key,
      oilId: l.oilId,
      grams: Number(l.weightGrams) || 0,
      name: oilDisplayName(l.oilId),
    }));
  if (src.postCookSuperfat && src.postCookSuperfat.isExtra && src.postCookSuperfat.grams > 0) {
    oilLines.push({
      key: 'post-cook-superfat',
      oilId: src.postCookSuperfat.oilId,
      grams: src.postCookSuperfat.grams,
      name: oilDisplayName(src.postCookSuperfat.oilId),
    });
  }
  const additives = src.computedAdditives.map((a) => ({
    key: a.key,
    catalogId: a.catalogId,
    name: a.name,
    grams: a.grams,
  }));
  if (src.splitLiquid && src.splitLiquid.grams > 0) {
    additives.push({
      key: 'split-liquid',
      // Id-stable synthetic catalogId: keying by the user-editable name orphaned the
      // stored price on every rename (and collided with a same-named custom additive).
      catalogId: 'split-liquid',
      name: src.splitLiquid.name.trim() || 'Alternative liquid',
      grams: src.splitLiquid.grams,
    });
  }
  return {
    oilLines,
    additives,
    lyeGrams: src.lyeGrams,
    totalBatchGrams: src.batchWeightWithExtras,
  };
}
