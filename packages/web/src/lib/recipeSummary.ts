import { alternativeLiquidPreset } from '@soap-calc/core';
import type { ComputedAdditive, ComputedPostCookSuperfat } from './calculateAdditives';
import type { SplitLiquidRow, WeightUnit } from './recipe';
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
  splitLiquidRows?: Array<{ row: SplitLiquidRow; grams: number | null }>;
  postCookSuperfat?: ComputedPostCookSuperfat | null;
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
    splitLiquidRows,
    postCookSuperfat,
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

  for (const { row, grams } of splitLiquidRows ?? []) {
    if (grams == null || grams <= 0) continue;
    items.push({
      name: row.name.trim() || 'Alternative liquid',
      detail: `${formatWeight(grams, weightUnit)} · ${additiveStageLabel(row.addAt, process)}`,
    });
  }

  if (postCookSuperfat) {
    for (const oil of postCookSuperfat.oils) {
      items.push({
        name: `${oilDisplayName(oil.oilId)} (post-cook superfat)`,
        detail: `${formatWeight(oil.grams, weightUnit)} · ${formatGrams(oil.percentOfOil, 1)}%`,
      });
    }
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
  /** Alternative-liquid rows + resolved grams: each gains an explicit "add the {liquid}"
   * step at the right point, so the printed sheet never omits one. */
  splitLiquidRows?: Array<{ row: SplitLiquidRow; grams: number | null }>;
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
/** The split-liquid procedure step, phrased for where it joins the batch, or null when the
 * split is off. In-lye liquids get a scorch caution when the preset carries a sugars flag —
 * the one advisory that must survive onto the printed sheet. */
export function splitLiquidProcedureStep(input: {
  row: SplitLiquidRow;
  grams: number | null;
  weightUnit: WeightUnit;
  process: ProcessId;
}): { step: string; addAt: SplitLiquidRow['addAt'] } | null {
  const { row, grams, weightUnit, process } = input;
  if (grams == null || grams <= 0) return null;
  const amount = formatWeight(grams, weightUnit);
  const name = row.name.trim() || 'the alternative liquid';
  const flags = alternativeLiquidPreset(row.presetKey)?.flags ?? [];
  const sugary = flags.includes('sugars');
  const solvent = flags.includes('solvent');

  if (row.addAt === 'lye') {
    // Solvent liquids (glycerin) are the opposite of sugary ones: they NEED heat to take
    // the lye up, and there is nothing in them to scorch.
    const note = solvent
      ? ' — heat gently until the lye fully dissolves; it takes longer than water'
      : sugary
        ? ' — keep it cool; sugars scorch in hot lye'
        : '';
    return {
      addAt: 'lye',
      step: `Stir ${amount} ${name} into the ${solvent ? 'lye solution' : 'cooled lye solution'}${note}.`,
    };
  }
  if (row.addAt === 'oils') {
    return { addAt: 'oils', step: `Blend ${amount} ${name} into the oils before the lye goes in.` };
  }
  const trace =
    process === 'hp'
      ? `Stir ${amount} ${name} into the cooked paste.`
      : process === 'ls'
        ? `Add ${amount} ${name} to the diluted soap.`
        : `Blend in ${amount} ${name} at light trace.`;
  return { addAt: 'trace', step: trace };
}

export function buildAddOrderSteps(input: AddOrderInput): string[] {
  const { process, lyeType, totalOilGrams, lyeGrams, waterGrams, weightUnit, unmoldText, cureText } = input;
  const oil = formatWeight(totalOilGrams, weightUnit);
  const lye = formatWeight(lyeGrams, weightUnit);
  const water = formatWeight(waterGrams, weightUnit);
  const alkali = lyeType === 'dual' ? 'lye' : lyeType === 'koh' ? 'KOH' : 'NaOH';
  const liquids = (input.splitLiquidRows ?? [])
    .map(({ row, grams }) => splitLiquidProcedureStep({ row, grams, weightUnit, process }))
    .filter((step): step is NonNullable<typeof step> => step !== null);
  // Where the liquid steps slot in, per process: after the oils step for 'oils', after the
  // lye step for 'lye', and at the process's own late stage for 'trace'. Later insertions
  // go first so earlier positions aren't shifted by the splice.
  const withLiquid = (steps: string[], positions: { lye: number; oils: number; trace: number }) => {
    const ordered = [...liquids].sort((a, b) => positions[b.addAt] - positions[a.addAt]);
    for (const liquid of ordered) {
      steps.splice(positions[liquid.addAt], 0, liquid.step);
    }
    return steps;
  };

  if (process === 'ls') {
    return withLiquid(
      [
        `Weigh the oils — ${oil} total — and heat to melt.`,
        `Weigh ${lye} KOH and ${water} water; add the KOH to the water and stir until clear.`,
        `Combine the lye solution with the oils and cook to a thick, translucent paste.`,
        `Dilute the paste with hot water, then blend in fragrance and additives.`,
        `Bottle and rest 1–2 weeks before use.`,
      ],
      { oils: 1, lye: 2, trace: 4 },
    );
  }

  if (process === 'hp') {
    return withLiquid(
      [
        `Weigh each oil — ${oil} total — and heat until melted.`,
        `Weigh ${lye} ${alkali} and ${water} distilled water; add the lye to the water, never the reverse.`,
        `Blend the lye solution into the oils and cook to a thick, translucent paste.`,
        `After the cook, stir in fragrance, additives, and any post-cook superfat.`,
        `Pack into the mold; unmold once firm and use after a short cure.`,
      ],
      { oils: 1, lye: 2, trace: 3 },
    );
  }

  return withLiquid(
    [
      `Weigh each oil — ${oil} total — and warm to 38–43 °C.`,
      `Weigh ${lye} ${alkali} and ${water} distilled water; add the lye to the water (never the reverse) and cool to 38–43 °C.`,
      `Pour the lye solution into the oils and blend to light trace.`,
      `Stir in fragrance and any additives at trace.`,
      `Pour into the mold; unmold ${unmoldText ?? 'in 24–48 h'} and cure ${cureText ?? '4–6 weeks'}.`,
    ],
    { oils: 1, lye: 2, trace: 3 },
  );
}
