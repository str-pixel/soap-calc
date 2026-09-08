import { computePricing, type PricingInput, type PricingResult } from '@soap-calc/core';
import { pricePerGram } from './money';
import { oilDisplayName } from './oilDisplay';
import { bookEntry, type PricedEntry, type PricingProfile } from './pricingProfile';
import type { ComputedScentColor } from './computeScentColor';

export interface RecipePricingContext {
  oilLines: Array<{ key: string; oilId: string; grams: number; name: string }>;
  /** `group` sorts the panel's rows: the Fragrance & colorants section prices under its
   * own heading; absent means a plain additive (or split liquid). */
  additives: Array<{ key: string; catalogId: string; name: string; grams: number; group?: 'additive' | 'scent' }>;
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

/** The price book entry for an additive row. A fragrance row is keyed by its name; a price
 * saved before the section existed sits under the retired catalog key `fragrance`, and
 * stands in until a per-name price is entered — the panel's row writes the new key. */
export function additivePriceEntry(
  profile: PricingProfile,
  a: { key: string; catalogId: string; name: string },
): PricedEntry | undefined {
  const own = bookEntry(profile.additivePrices, additivePriceKey(a));
  if (own) return own;
  return a.catalogId.startsWith('fragrance:name:') ? bookEntry(profile.additivePrices, 'fragrance') : undefined;
}

export function buildPricingInput(ctx: RecipePricingContext, profile: PricingProfile): PricingInput {
  return {
    oilLines: ctx.oilLines.map((o) => ({
      grams: o.grams,
      pricePerGram: entryPerGram(bookEntry(profile.oilPrices, o.oilId)),
    })),
    additiveLines: ctx.additives.map((a) => ({
      grams: a.grams,
      pricePerGram: entryPerGram(additivePriceEntry(profile, a)),
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
  const addMissing = ctx.additives.some((a) => entryPerGram(additivePriceEntry(profile, a)) == null);
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
  /** Alternative liquids, if any — real materials the batch weight already includes. */
  splitLiquids: Array<{ key: string; name: string; grams: number }>;
  /** Post-cook superfat oils; `isExtra` (append mode) means the grams are ADDED to the batch
   * and must be priced — subtract mode reserves oil already priced in `lines`. */
  postCookSuperfat: { oils: { oilId: string; grams: number }[]; isExtra: boolean } | null;
  /** The Fragrance & colorants section — every gram of it is in batchWeightWithExtras. */
  scentColor?: ComputedScentColor;
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
  if (src.postCookSuperfat && src.postCookSuperfat.isExtra) {
    src.postCookSuperfat.oils.forEach((o, i) => {
      if (o.grams <= 0) return;
      oilLines.push({
        key: `post-cook-superfat-${i}`,
        oilId: o.oilId,
        grams: o.grams,
        name: oilDisplayName(o.oilId),
      });
    });
  }
  const additives: RecipePricingContext['additives'] = src.computedAdditives.map((a) => ({
    key: a.key,
    catalogId: a.catalogId,
    name: a.name,
    grams: a.grams,
  }));
  for (const liquid of src.splitLiquids) {
    if (liquid.grams <= 0) continue;
    additives.push({
      key: `split-liquid-${liquid.key}`,
      // Id-stable synthetic catalogId keyed by the ROW key: the user-editable name would
      // orphan the stored price on every rename (and collide with same-named additives).
      catalogId: `split-liquid-${liquid.key}`,
      name: liquid.name.trim() || 'Alternative liquid',
      grams: liquid.grams,
    });
  }
  // Fragrance & colorants: keyed by NAME (lower-cased), not row key — a maker prices "rose
  // absolute" once and every recipe that names it finds the price; a row key would forget
  // it on the next recipe. The helpers are one material each, so they take a fixed key.
  const scent = src.scentColor;
  if (scent) {
    const nameKey = (prefix: string, name: string) => `${prefix}:name:${name.trim().toLowerCase() || 'unnamed'}`;
    for (const f of scent.fragrances) {
      if (f.grams <= 0) continue;
      additives.push({ key: `fragrance-${f.key}`, catalogId: nameKey('fragrance', f.name), name: f.name.trim() || 'Fragrance', grams: f.grams, group: 'scent' });
    }
    if (scent.stabilizerGrams > 0) {
      additives.push({ key: 'vanilla-stabilizer', catalogId: 'vanilla-stabilizer', name: 'Vanilla stabilizer', grams: scent.stabilizerGrams, group: 'scent' });
    }
    if (scent.polysorbateGrams > 0) {
      additives.push({ key: 'polysorbate-20', catalogId: 'polysorbate-20', name: 'Polysorbate 20', grams: scent.polysorbateGrams, group: 'scent' });
    }
    for (const c of scent.colorants) {
      if (c.grams === null || c.grams <= 0) continue;
      additives.push({ key: `colorant-${c.key}`, catalogId: nameKey('colorant', c.name), name: c.name.trim() || 'Colorant', grams: c.grams, group: 'scent' });
    }
    if (scent.carrierOilGrams > 0) {
      additives.push({ key: 'carrier-oil', catalogId: 'carrier-oil', name: 'Carrier oil (colorants)', grams: scent.carrierOilGrams, group: 'scent' });
    }
  }
  return {
    oilLines,
    additives,
    lyeGrams: src.lyeGrams,
    totalBatchGrams: src.batchWeightWithExtras,
  };
}
