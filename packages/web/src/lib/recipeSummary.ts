import { alternativeLiquidPreset, formatTempDual, type AdditiveStage } from '@soap-calc/core';
import type { ComputedAdditive, ComputedPostCookSuperfat } from './calculateAdditives';
import type { SplitLiquidRow, WeightUnit } from './recipe';
import type { ProcessId } from './process';
import { additiveStageLabel } from './additiveStageLabel';
import { formatGrams } from './format';
import { oilDisplayName } from './oilDisplay';
import { formatWeight } from './weightUnits';

/** The one PCSF line detail both surfaces quote — "140 g · 5% of oil", with the reserve
 * provenance appended when the subtract reserve is applied. Shared by the on-screen Full
 * recipe and the printed batch sheet ("cross-checked at the bench"), so the vocabulary is
 * structurally identical rather than hand-synchronized. "(lye reduced)" explains why the
 * printed lye figures run below plain SAP-table math for this recipe. */
export function postCookSuperfatLineDetail(
  oil: { grams: number; percentOfOil: number },
  weightUnit: WeightUnit,
  isExtra: boolean,
): string {
  return `${formatWeight(oil.grams, weightUnit)} · ${formatGrams(oil.percentOfOil, 1)}% of oil${
    isExtra ? '' : ' · from oils above (lye reduced)'
  }`;
}

/** A single line of the printable "Full recipe" list: a material and its formatted amount. */
export type RecipeItem = { name: string; detail: string };

/** One headed group of the Full recipe manifest. `heading: null` is the unheaded lead-in
 * (the soaping-temperature line). Headings use the source books' vocabulary — "Lye
 * solution", never the cosmetics-industry "water phase". */
export type RecipeSection = { heading: string | null; items: RecipeItem[] };

type FullRecipeInput = {
  /** Resolved soaping temperature from the menu, °F. When present it opens the list,
   * shown °C-first like the batch sheet's Method row. */
  soapingTempF?: number;
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
  /** The PCSF rides with its own applied-state flag — `isExtra: false` means the subtract
   * reserve is actually applied, so the grams are held back from the oils listed above,
   * not extra weight to buy. The flag lives ON the object (stamped by the view model
   * beside cookFactor) so no caller can pass the superfat while forgetting the flag —
   * see calculateAdditives.ts on why it can never be re-derived here. */
  postCookSuperfat?: (ComputedPostCookSuperfat & { isExtra: boolean }) | null;
  process: ProcessId;
};

/**
 * Flatten a finished recipe into an ordered materials list — oils (weight · % of oils), the
 * alkali, water, any alternative liquid, post-cook superfat, and additives — each with its
 * amount preformatted in the active weight unit. Mirrors the figures the Results panel and
 * batch sheet already show, so the on-screen list can never state a different number.
 */
export function buildFullRecipe(input: FullRecipeInput): RecipeSection[] {
  const {
    soapingTempF,
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

  const sections: RecipeSection[] = [];
  const push = (heading: string | null, items: RecipeItem[]) => {
    if (items.length > 0) sections.push({ heading, items });
  };

  if (soapingTempF !== undefined) {
    push(null, [
      { name: 'Soaping temperature', detail: formatTempDual(soapingTempF) },
    ]);
  }

  // Every timed material files into its stage bucket, then the buckets become sections
  // (or, for the oils/lye stages, fold into those sections) at their procedure slot.
  // The section heading carries the stage, so the lines themselves no longer repeat it.
  const staged: Record<AdditiveStage, RecipeItem[]> = {
    lye: [],
    oils: [],
    trace: [],
    top: [],
    after_cook: [],
  };
  // In-lye LIQUIDS are kept apart from in-lye additives: a dry additive dissolves in the
  // water before the alkali goes in, but a liquid joins the finished (cooled) solution —
  // splitLiquidProcedureStep below owns that rule ("sugars scorch in hot lye"), and the
  // manifest's order must tell the same story.
  const lyeLiquids: RecipeItem[] = [];
  for (const { row, grams } of splitLiquidRows ?? []) {
    if (grams == null || grams <= 0) continue;
    const item = {
      name: row.name.trim() || 'Alternative liquid',
      detail: formatWeight(grams, weightUnit),
    };
    if (row.addAt === 'lye') lyeLiquids.push(item);
    else staged[row.addAt].push(item);
  }
  for (const additive of additives) {
    staged[additive.addAt].push({
      name: additive.name,
      detail: formatWeight(additive.grams, weightUnit),
    });
  }

  const oilItems: RecipeItem[] = [];
  for (const line of lines) {
    if (line.weightGrams <= 0) continue;
    const percent = recipeOilWeightGrams > 0 ? (line.weightGrams / recipeOilWeightGrams) * 100 : 0;
    oilItems.push({
      name: oilDisplayName(line.oilId),
      detail: `${formatWeight(line.weightGrams, weightUnit)} · ${formatGrams(percent, 1)}%`,
    });
  }
  push('Oils', [...oilItems, ...staged.oils]);

  // The lye solution reads in mixing order: water first, dry additives dissolved in it
  // next, THEN the alkali goes in (never the reverse) — and any in-lye liquid last,
  // stirred into the finished solution.
  const lyeItems: RecipeItem[] = [
    {
      name: process === 'ls' ? 'Water' : 'Distilled water',
      detail: formatWeight(waterGrams, weightUnit),
    },
    ...staged.lye,
  ];
  if (lyeType === 'dual') {
    lyeItems.push({ name: 'Sodium hydroxide (NaOH)', detail: formatWeight(naohGrams, weightUnit) });
    // Only state the blend share when it's actually set — never invent "0%".
    const kohShare = kohBlendPercent?.trim();
    lyeItems.push({
      name: kohShare ? `Potassium hydroxide (KOH, ${kohShare}%)` : 'Potassium hydroxide (KOH)',
      detail: formatWeight(kohGrams, weightUnit),
    });
  } else {
    lyeItems.push({
      name: lyeType === 'koh' ? 'Potassium hydroxide (KOH)' : 'Sodium hydroxide (NaOH)',
      detail: formatWeight(lyeGrams, weightUnit),
    });
  }
  lyeItems.push(...lyeLiquids);
  push('Lye solution', lyeItems);

  push(additiveStageLabel('trace', process), staged.trace);
  push(additiveStageLabel('top', process), staged.top);
  push(additiveStageLabel('after_cook', process), staged.after_cook);

  // Its own section, last and never among the recipe oils (those sum to 100% without
  // it) — the UG2HP convention, and the heading is the book's own term. Present only
  // when a PCSF is actually set in the calculator. An applied subtract reserve says its
  // grams come out of the oils already listed, so the manifest never reads as extra
  // shopping weight.
  if (postCookSuperfat) {
    push(
      'Post-cook superfat',
      postCookSuperfat.oils.map((oil) => ({
        name: oilDisplayName(oil.oilId),
        detail: postCookSuperfatLineDetail(oil, weightUnit, postCookSuperfat.isExtra),
      })),
    );
  }

  return sections;
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
        ? // Before the cook, never into the diluted soap: the cook is what sterilises a
          // sugary or proteinaceous liquid, and a liquid soap sits at room temperature for
          // months afterwards. The dilution stage is plain distilled water only.
          `Blend in ${amount} ${name} at trace, before the cook — never into the diluted soap.`
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
        `Combine the lye solution with the oils and blend to trace.`,
        `Cook to a thick, translucent paste.`,
        `Dilute the paste with hot water, then blend in fragrance and additives.`,
        `Bottle and rest 1–2 weeks before use.`,
      ],
      // trace: 3 — between blending to trace and the cook. Splitting the old combined
      // "combine and cook" step is what gives an at-trace liquid an honest home; slotting
      // it at the end would have put it in the diluted soap, which the process forbids.
      { oils: 1, lye: 2, trace: 3 },
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
