import type { ComputedAdditive, ComputedPostCookSuperfat } from './calculateAdditives';
import type { SplitLiquidSettings, WeightUnit } from './recipe';
import type { ProcessId } from './process';
import { additiveStageLabel } from './additiveStageLabel';
import { formatGrams } from './format';
import { oilDisplayName } from './oilDisplay';
import { formatWeight } from './weightUnits';

/** A single line of the printable "Full recipe" list: a material and its formatted amount. */
export type RecipeItem = { name: string; detail: string };

type FullRecipeInput = {
  /** The calc's per-oil lines (oilId + resolved grams). Only lines with weight > 0 are listed. */
  lines: { oilId: string; weightGrams: number }[];
  /** Denominator for each oil's percent — the recipe oil weight the figures are shown against. */
  recipeOilWeightGrams: number;
  weightUnit: WeightUnit;
  lyeType: 'naoh' | 'koh' | 'dual';
  naohGrams: number;
  kohGrams: number;
  lyeGrams: number;
  kohBlendPercent?: string;
  waterGrams: number;
  additives: ComputedAdditive[];
  splitLiquid?: SplitLiquidSettings;
  splitLiquidGrams?: number | null;
  postCookSuperfat?: ComputedPostCookSuperfat | null;
  postCookSuperfatName?: string | null;
  process: ProcessId;
};

/**
 * Flatten a finished recipe into an ordered materials list — oils (weight · % of oils), the
 * alkali, water, any alternative liquid, post-cook superfat, and additives — each with its
 * amount preformatted in the active weight unit. Mirrors the figures the Results panel and
 * batch sheet already show, so the on-screen list can never state a different number.
 */
export function buildFullRecipe(input: FullRecipeInput): RecipeItem[] {
  const {
    lines,
    recipeOilWeightGrams,
    weightUnit,
    lyeType,
    naohGrams,
    kohGrams,
    lyeGrams,
    kohBlendPercent,
    waterGrams,
    additives,
    splitLiquid,
    splitLiquidGrams,
    postCookSuperfat,
    postCookSuperfatName,
    process,
  } = input;

  const items: RecipeItem[] = [];

  for (const line of lines) {
    if (line.weightGrams <= 0) continue;
    const percent = recipeOilWeightGrams > 0 ? (line.weightGrams / recipeOilWeightGrams) * 100 : 0;
    items.push({
      name: oilDisplayName(line.oilId),
      detail: `${formatWeight(line.weightGrams, weightUnit)} · ${formatGrams(percent, 1)}%`,
    });
  }

  if (lyeType === 'dual') {
    items.push({ name: 'Sodium hydroxide (NaOH)', detail: formatWeight(naohGrams, weightUnit) });
    // Only state the blend share when it's actually set — never invent "0%".
    const kohShare = kohBlendPercent?.trim();
    items.push({
      name: kohShare ? `Potassium hydroxide (KOH, ${kohShare}%)` : 'Potassium hydroxide (KOH)',
      detail: formatWeight(kohGrams, weightUnit),
    });
  } else {
    items.push({
      name: lyeType === 'koh' ? 'Potassium hydroxide (KOH)' : 'Sodium hydroxide (NaOH)',
      detail: formatWeight(lyeGrams, weightUnit),
    });
  }

  items.push({
    name: process === 'ls' ? 'Water' : 'Distilled water',
    detail: formatWeight(waterGrams, weightUnit),
  });

  if (splitLiquid?.enabled && splitLiquidGrams != null && splitLiquidGrams > 0) {
    items.push({
      name: splitLiquid.name.trim() || 'Alternative liquid',
      detail: `${formatWeight(splitLiquidGrams, weightUnit)} · ${additiveStageLabel(splitLiquid.addAt, process)}`,
    });
  }

  if (postCookSuperfat) {
    items.push({
      name: `${postCookSuperfatName ?? 'Post-cook superfat'} (post-cook superfat)`,
      detail: `${formatWeight(postCookSuperfat.grams, weightUnit)} · ${formatGrams(postCookSuperfat.percentOfOil, 1)}%`,
    });
  }

  for (const additive of additives) {
    items.push({
      name: additive.name,
      detail: `${formatWeight(additive.grams, weightUnit)} · ${additiveStageLabel(additive.addAt, process)}`,
    });
  }

  return items;
}

type AddOrderInput = {
  process: ProcessId;
  lyeType: 'naoh' | 'koh' | 'dual';
  totalOilGrams: number;
  lyeGrams: number;
  waterGrams: number;
  weightUnit: WeightUnit;
  /** Preformatted unmold window from the workability estimate (e.g. "≈ 11–34 h"). When
   * present it replaces the generic CP timing so this list can never disagree with the
   * Workability rows above it. */
  unmoldText?: string | null;
  /** Preformatted usable-from window from the cure model (e.g. "≈ 5–7.5 weeks") — same
   * single-sourcing contract as unmoldText, against the cure milestone rows. */
  cureText?: string | null;
};

/**
 * Process-aware "add in this order" steps for the finished batch, quoting the recipe's own
 * lye and water weights. Original, concise cold-process/hot-process/liquid-soap copy — always
 * lye into water, never the reverse.
 */
export function buildAddOrderSteps(input: AddOrderInput): string[] {
  const { process, lyeType, totalOilGrams, lyeGrams, waterGrams, weightUnit, unmoldText, cureText } = input;
  const oil = formatWeight(totalOilGrams, weightUnit);
  const lye = formatWeight(lyeGrams, weightUnit);
  const water = formatWeight(waterGrams, weightUnit);
  const alkali = lyeType === 'dual' ? 'lye' : lyeType === 'koh' ? 'KOH' : 'NaOH';

  if (process === 'ls') {
    return [
      `Weigh the oils — ${oil} total — and heat to melt.`,
      `Weigh ${lye} KOH and ${water} water; add the KOH to the water and stir until clear.`,
      `Combine the lye solution with the oils and cook to a thick, translucent paste.`,
      `Dilute the paste with hot water, then blend in fragrance and additives.`,
      `Bottle and rest 1–2 weeks before use.`,
    ];
  }

  if (process === 'hp') {
    return [
      `Weigh each oil — ${oil} total — and heat until melted.`,
      `Weigh ${lye} ${alkali} and ${water} distilled water; add the lye to the water, never the reverse.`,
      `Blend the lye solution into the oils and cook to a thick, translucent paste.`,
      `After the cook, stir in fragrance, additives, and any post-cook superfat.`,
      `Pack into the mold; unmold once firm and use after a short cure.`,
    ];
  }

  return [
    `Weigh each oil — ${oil} total — and warm to 38–43 °C.`,
    `Weigh ${lye} ${alkali} and ${water} distilled water; add the lye to the water (never the reverse) and cool to 38–43 °C.`,
    `Pour the lye solution into the oils and blend to light trace.`,
    `Stir in fragrance and any additives at trace.`,
    `Pour into the mold; unmold ${unmoldText ?? 'in 24–48 h'} and cure ${cureText ?? '4–6 weeks'}.`,
  ];
}
