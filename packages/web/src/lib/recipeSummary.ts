import { alternativeLiquidPreset, formatTempDual, isSolventLiquid, type AdditiveStage } from '@soap-calc/core';
import type { AppliedPostCookSuperfat, ComputedAdditive } from './calculateAdditives';
import type { SplitLiquidRow, WeightUnit } from './recipe';
import { lyeSolutionBeforeOils, type ProcessId } from './process';
import { additiveStageLabel } from './additiveStageLabel';
import { formatGrams, joinNames } from './format';
import { oilDisplayName } from './oilDisplay';
import { formatWeight } from './weightUnits';

/** The one provenance phrase every surface appends to an APPLIED subtract reserve — the
 * results-grid row, the Full recipe line, and the printed sheet. "from oils above" says
 * where the grams come from; "(lye reduced)" explains why the lye figures run below plain
 * SAP-table math. Empty for an extra. Fails SAFE: only `false` earns the note, so a PCSF
 * that somehow arrives without its applied state reads as extra weight (harmless) rather
 * than as a reserve the lye was never scaled for. */
export function postCookSuperfatProvenance(isExtra: boolean): string {
  return isExtra === false ? ' · from oils above (lye reduced)' : '';
}

/** The one PCSF line detail the Full recipe and the printed sheet quote —
 * "140 g · 5% of oil" plus the shared provenance phrase — so the two are structurally
 * identical rather than hand-synchronized. */
export function postCookSuperfatLineDetail(
  oil: { grams: number; percentOfOil: number },
  weightUnit: WeightUnit,
  isExtra: boolean,
): string {
  return `${formatWeight(oil.grams, weightUnit)} · ${formatGrams(oil.percentOfOil, 1)}% of oil${postCookSuperfatProvenance(isExtra)}`;
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
  /** The vm's stamped PCSF (see AppliedPostCookSuperfat) — its own applied state decides
   * whether the line reads as reserved from the oils above or as extra weight. */
  postCookSuperfat?: AppliedPostCookSuperfat | null;
  process: ProcessId;
};

/** One manifest line plus the grams behind its formatted detail — the number the list is
 * ordered by, dropped before the section is returned. */
type WeighedItem = RecipeItem & { grams: number };

/** Heaviest first: within a group a list of materials reads as a weighing order, so the
 * oils that carry the recipe (and the additives that matter most by weight) come off the
 * scale first. Ties keep their entered order — Array#sort is stable. THE one ordering
 * rule for every "what goes into this batch" list: the Full recipe manifest, the printed
 * sheet's oils table and post-cook superfat, and the aggregate PCSF line all call it, so
 * the surfaces cannot disagree about sequence any more than they may about a number. */
export function heaviestFirst<T>(items: readonly T[], grams: (item: T) => number): T[] {
  return [...items].sort((a, b) => grams(b) - grams(a));
}

/** heaviestFirst over manifest lines, dropping the grams the sort read. */
function byAmount(items: WeighedItem[]): RecipeItem[] {
  return heaviestFirst(items, (item) => item.grams).map(({ name, detail }) => ({ name, detail }));
}

/**
 * The Full recipe manifest: headed sections in procedure order, optionally led by the
 * soaping-temperature line. Oils (weight · % of oils) and the Lye solution (water → dry
 * in-lye additives → alkali → in-lye liquids, solvents before the alkali) come in the
 * process's own order (lyeSolutionBeforeOils), then the timed stages that have anything
 * in them, then the post-cook superfat last. WITHIN each group the lines run biggest
 * amount to smallest; the groups themselves keep their procedure order, because the lye
 * solution's sequence is a mixing instruction (lye into water, never the reverse), not a
 * list. Every amount is preformatted in the active weight unit and mirrors the figures the
 * Results panel and batch sheet already show, so the on-screen list can never state a
 * different number.
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
  const staged: Record<AdditiveStage, WeighedItem[]> = {
    lye: [],
    oils: [],
    trace: [],
    top: [],
    after_cook: [],
  };
  // Where an in-lye liquid joins is ONE decision, splitLiquidSlot's, rendered here as
  // order and in the steps as phrasing: a solvent (glycerin) is what the alkali dissolves
  // into, so it lists with the water before the alkali; any other liquid joins the
  // finished, cooled solution after it.
  const lyeLiquids: WeighedItem[] = [];
  for (const { row, grams } of splitLiquidRows ?? []) {
    if (grams == null || grams <= 0) continue;
    const item = {
      name: row.name.trim() || 'Alternative liquid',
      detail: formatWeight(grams, weightUnit),
      grams,
    };
    if (splitLiquidSlot(row) === 'lye_after_alkali') lyeLiquids.push(item);
    else staged[row.addAt].push(item);
  }
  for (const additive of additives) {
    staged[additive.addAt].push({
      name: additive.name,
      detail: formatWeight(additive.grams, weightUnit),
      grams: additive.grams,
    });
  }

  const oilItems: WeighedItem[] = [];
  for (const line of lines) {
    if (line.weightGrams <= 0) continue;
    const percent = recipeOilWeightGrams > 0 ? (line.weightGrams / recipeOilWeightGrams) * 100 : 0;
    oilItems.push({
      name: oilDisplayName(line.oilId),
      detail: `${formatWeight(line.weightGrams, weightUnit)} · ${formatGrams(percent, 1)}%`,
      grams: line.weightGrams,
    });
  }
  // The oils rank among themselves and the with-oils additives among themselves: a clay at
  // 4 g must not push a 5 g oil down the list, because the oils above it are the block that
  // sums to 100%.
  const oilsSection: RecipeItem[] = [...byAmount(oilItems), ...byAmount(staged.oils)];

  // The lye solution reads in mixing order: water first, anything dissolved in it next
  // (dry additives, a solvent liquid), THEN the alkali goes in (never the reverse) — and
  // any other in-lye liquid last, stirred into the finished solution.
  const lyeItems: RecipeItem[] = [
    {
      name: process === 'ls' ? 'Water' : 'Distilled water',
      detail: formatWeight(waterGrams, weightUnit),
    },
    ...byAmount(staged.lye),
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
  lyeItems.push(...byAmount(lyeLiquids));
  if (lyeSolutionBeforeOils(process)) {
    push('Lye solution', lyeItems);
    push('Oils', oilsSection);
  } else {
    push('Oils', oilsSection);
    push('Lye solution', lyeItems);
  }

  push(additiveStageLabel('trace', process), byAmount(staged.trace));
  push(additiveStageLabel('top', process), byAmount(staged.top));
  push(additiveStageLabel('after_cook', process), byAmount(staged.after_cook));

  // Its own section, last and never among the recipe oils (those sum to 100% without
  // it) — the UG2HP convention, and the heading is the book's own term. Present only
  // when a PCSF is actually set in the calculator. An applied subtract reserve says its
  // grams come out of the oils already listed, so the manifest never reads as extra
  // shopping weight.
  if (postCookSuperfat) {
    push(
      'Post-cook superfat',
      byAmount(
        postCookSuperfat.oils.map((oil) => ({
          name: oilDisplayName(oil.oilId),
          detail: postCookSuperfatLineDetail(oil, weightUnit, postCookSuperfat.isExtra),
          grams: oil.grams,
        })),
      ),
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
  /** Resolved menu temperature, °F — quoted in the CP warm/cool steps so the steps can
   * never disagree with the Full recipe's lead line. Absent → the generic CP band. */
  soapingTempF?: number;
  /** Additive lines by stage. Each is NAMED in the step for its stage — the same stage the
   * Full recipe files it under, in the same heaviest-first order — so the manifest and the
   * steps tell one story. */
  additives?: Array<{ name: string; addAt: AdditiveStage; grams: number }>;
};

/** The split-liquid procedure step, phrased for where it joins the batch, or null when the
 * split is off. In-lye liquids get a scorch caution when the preset carries a sugars flag —
 * the one advisory that must survive onto the printed sheet. */
/** Where a split liquid joins the batch — the one decision the Full recipe (order), the
 * Add-in-order steps (position + phrasing) and the printed sheet all render. A SOLVENT
 * (glycerin) is what the alkali dissolves into, so it goes in with the water before the
 * alkali; any other in-lye liquid (milk, juice) is stirred into the finished, cooled
 * solution, since sugars scorch in hot lye. */
export type SplitLiquidSlot = 'lye_before_alkali' | 'lye_after_alkali' | 'oils' | 'trace';
export function splitLiquidSlot(row: SplitLiquidRow): SplitLiquidSlot {
  if (row.addAt !== 'lye') return row.addAt;
  return isSolventLiquid(row.presetKey) ? 'lye_before_alkali' : 'lye_after_alkali';
}

export function splitLiquidProcedureStep(input: {
  row: SplitLiquidRow;
  grams: number | null;
  weightUnit: WeightUnit;
  process: ProcessId;
}): { step: string; addAt: SplitLiquidRow['addAt']; slot: SplitLiquidSlot } | null {
  const { row, grams, weightUnit, process } = input;
  if (grams == null || grams <= 0) return null;
  const amount = formatWeight(grams, weightUnit);
  const name = row.name.trim() || 'the alternative liquid';
  const flags = alternativeLiquidPreset(row.presetKey)?.flags ?? [];
  const sugary = flags.includes('sugars');
  const slot = splitLiquidSlot(row);
  if (slot === 'lye_before_alkali') {
    // Solvent liquids (glycerin) NEED heat to take the lye up, and there is nothing in
    // them to scorch: the alkali goes into water and glycerin together.
    return {
      addAt: 'lye',
      slot,
      step: `Weigh ${amount} ${name} with the water — the lye goes into both; heat gently until it fully dissolves, it takes longer than in water alone.`,
    };
  }
  if (slot === 'lye_after_alkali') {
    const note = sugary ? ' — keep it cool; sugars scorch in hot lye' : '';
    return { addAt: 'lye', slot, step: `Stir ${amount} ${name} into the cooled lye solution${note}.` };
  }
  if (slot === 'oils') {
    return { addAt: 'oils', slot, step: `Blend ${amount} ${name} into the oils before the lye goes in.` };
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
  return { addAt: 'trace', slot: 'trace', step: trace };
}

/** One step of the Add-in-order list: its text, the additive stages it HOSTS (each named
 * in it), and the split-liquid slots that attach to it and on which side. Every process's
 * plan hosts all five stages and all four slots exactly once — a test pins that — so
 * nothing the Full recipe renders can vanish from the steps. */
type AddOrderStep = {
  key: 'lye' | 'oils' | string;
  hosts: AdditiveStage[];
  liquids: Array<{ slot: SplitLiquidSlot; where: 'before' | 'after' }>;
  text: string;
};

type StepContext = {
  process: ProcessId;
  oil: string;
  lye: string;
  water: string;
  alkali: string;
  temp: string;
  unmoldText?: string | null;
  cureText?: string | null;
  /** Names hosted by a step, "the X and Y", or null when it hosts none. */
  named: (stages: AdditiveStage[]) => string | null;
  /** Whether any additive line exists — with none, the steps keep their generic copy. */
  anyAdditives: boolean;
};

function addOrderSteps(ctx: StepContext): AddOrderStep[] {
  const { process, oil, lye, water, alkali, temp, unmoldText, cureText, named, anyAdditives } = ctx;
  // Dry or liquid, an in-lye additive is stirred into the water BEFORE the alkali goes in.
  const intoWater = (n: string | null) => (n ? ` stir ${n} into the water first, then` : '');
  const intoOils = (n: string | null) => (n ? ` Blend in ${n}.` : '');
  const onTop = (n: string | null) => (n ? `, finish the top with ${n}` : '');
  const inLye = { slot: 'lye_before_alkali' as const, where: 'before' as const };
  const afterLye = { slot: 'lye_after_alkali' as const, where: 'after' as const };

  if (process === 'ls') {
    const dilute = named(['after_cook', 'top']);
    return [
      { key: 'oils', hosts: ['oils'], liquids: [{ slot: 'oils', where: 'after' }],
        text: `Weigh the oils — ${oil} total — and heat to melt.${intoOils(named(['oils']))}` },
      { key: 'lye', hosts: ['lye'], liquids: [inLye, afterLye],
        text: `Weigh ${lye} KOH and ${water} water;${intoWater(named(['lye']))} add the KOH to the water and stir until clear.` },
      // trace liquids land after this step — between blending to trace and the cook, never
      // in the diluted soap, which the process forbids.
      { key: 'blend', hosts: ['trace'], liquids: [{ slot: 'trace', where: 'after' }],
        text: `Combine the lye solution with the oils${named(['trace']) ? `, stir in ${named(['trace'])},` : ''} and blend to trace.` },
      { key: 'cook', hosts: [], liquids: [], text: 'Cook to a thick, translucent paste.' },
      { key: 'dilute', hosts: ['after_cook', 'top'], liquids: [],
        text: `Dilute the paste with hot water${dilute ? `, then blend in ${dilute}` : anyAdditives ? '' : ', then blend in fragrance and additives'}.` },
      { key: 'bottle', hosts: [], liquids: [], text: 'Bottle and rest 1–2 weeks before use.' },
    ];
  }

  if (process === 'hp') {
    const afterCook = named(['after_cook']);
    return [
      { key: 'oils', hosts: ['oils'], liquids: [{ slot: 'oils', where: 'after' }],
        text: `Weigh each oil — ${oil} total — and heat until melted.${intoOils(named(['oils']))}` },
      { key: 'lye', hosts: ['lye'], liquids: [inLye, afterLye],
        text: `Weigh ${lye} ${alkali} and ${water} distilled water;${intoWater(named(['lye']))} add the lye to the water, never the reverse.` },
      // A trace liquid is stirred into the cooked paste (its own step text), so it lands after.
      { key: 'cook', hosts: ['trace'], liquids: [{ slot: 'trace', where: 'after' }],
        text: `Blend the lye solution into the oils${named(['trace']) ? `, stir in ${named(['trace'])} at trace,` : ''} and cook to a thick, translucent paste.` },
      { key: 'after', hosts: ['after_cook'], liquids: [],
        text: `After the cook, stir in ${afterCook ? `${afterCook} and any post-cook superfat` : anyAdditives ? 'any post-cook superfat' : 'fragrance, additives, and any post-cook superfat'}.` },
      { key: 'mold', hosts: ['top'], liquids: [],
        text: `Pack into the mold${onTop(named(['top']))}; unmold once firm and use after a short cure.` },
    ];
  }

  // CP. An after-cook line (a stray from a process switch) has no cook to follow here; the
  // last moment anything goes into the batter is trace, so it is named there.
  const atTrace = named(['trace', 'after_cook']);
  return [
    { key: 'lye', hosts: ['lye'], liquids: [inLye, afterLye],
      text: `Weigh ${lye} ${alkali} and ${water} distilled water;${intoWater(named(['lye']))} add the lye to the water (never the reverse) and cool to ${temp}.` },
    { key: 'oils', hosts: ['oils'], liquids: [{ slot: 'oils', where: 'after' }],
      text: `Weigh each oil — ${oil} total — and warm to ${temp}.${intoOils(named(['oils']))}` },
    { key: 'blend', hosts: [], liquids: [], text: 'Pour the lye solution into the oils and blend to light trace.' },
    { key: 'trace', hosts: ['trace', 'after_cook'], liquids: [{ slot: 'trace', where: 'before' }],
      text: atTrace ? `Stir in ${atTrace} at trace.` : anyAdditives ? 'Blend on to a pourable trace.' : 'Stir in fragrance and any additives at trace.' },
    { key: 'pour', hosts: ['top'], liquids: [],
      text: `Pour into the mold${onTop(named(['top']))}; unmold ${unmoldText ?? 'in 24–48 h'} and cure ${cureText ?? '4–6 weeks'}.` },
  ];
}

/** The lye and oils steps come in the process's own order (lyeSolutionBeforeOils); the rest
 * keep their place. */
function inProcedureOrder(steps: AddOrderStep[], process: ProcessId): AddOrderStep[] {
  const lyeAt = steps.findIndex((s) => s.key === 'lye');
  const oilsAt = steps.findIndex((s) => s.key === 'oils');
  const lyeFirst = lyeSolutionBeforeOils(process);
  if (lyeFirst === lyeAt < oilsAt) return steps;
  const swapped = [...steps];
  [swapped[lyeAt], swapped[oilsAt]] = [steps[oilsAt], steps[lyeAt]];
  return swapped;
}

/** The stage/slot plan per process, text-free — what the exhaustiveness test pins. */
export function addOrderStepPlan(process: ProcessId): Array<Pick<AddOrderStep, 'key' | 'hosts' | 'liquids'>> {
  return inProcedureOrder(
    addOrderSteps({
      process, oil: '', lye: '', water: '', alkali: '', temp: '', named: () => null, anyAdditives: false,
    }),
    process,
  ).map(({ key, hosts, liquids }) => ({ key, hosts, liquids }));
}

/**
 * Process-aware "add in this order" steps for the finished batch, quoting the recipe's own
 * lye and water weights, the menu temperature, and each additive at its own stage.
 * Original, concise cold-process/hot-process/liquid-soap copy — always lye into water,
 * never the reverse. The lye-vs-oils order comes from the process definition
 * (lyeSolutionBeforeOils), the same table the Full recipe and the sheet read.
 */
export function buildAddOrderSteps(input: AddOrderInput): string[] {
  const {
    process, lyeType, totalOilGrams, lyeGrams, waterGrams, weightUnit, unmoldText, cureText,
    soapingTempF, additives = [],
  } = input;
  const byStage: Record<AdditiveStage, string[]> = { lye: [], oils: [], trace: [], top: [], after_cook: [] };
  // Same order the manifest lists them in, so "stir in the fragrance and the clay" reads
  // down the Full recipe's trace section rather than across it.
  for (const a of heaviestFirst(additives, (item) => item.grams)) byStage[a.addAt].push(a.name);
  const named = (stages: AdditiveStage[]) => {
    const names = stages.flatMap((stage) => byStage[stage]);
    return names.length ? `the ${joinNames(names)}` : null;
  };
  const steps = inProcedureOrder(
    addOrderSteps({
      process,
      oil: formatWeight(totalOilGrams, weightUnit),
      lye: formatWeight(lyeGrams, weightUnit),
      water: formatWeight(waterGrams, weightUnit),
      alkali: lyeType === 'dual' ? 'lye' : lyeType === 'koh' ? 'KOH' : 'NaOH',
      // The menu temperature the Full recipe opens with; the generic band survives only
      // when none was resolved.
      temp: soapingTempF !== undefined ? formatTempDual(soapingTempF) : '38–43 °C',
      unmoldText,
      cureText,
      named,
      anyAdditives: additives.length > 0,
    }),
    process,
  );
  const texts = steps.map((s) => s.text);
  // Liquids splice in at the step that declares their slot, before or after it. Later
  // insertions go first so earlier indices are not shifted by the splice.
  const liquids = (input.splitLiquidRows ?? [])
    .map(({ row, grams }) => splitLiquidProcedureStep({ row, grams, weightUnit, process }))
    .filter((step): step is NonNullable<typeof step> => step !== null)
    .map((liquid) => {
      const at = steps.findIndex((s) => s.liquids.some((l) => l.slot === liquid.slot));
      const where = steps[at].liquids.find((l) => l.slot === liquid.slot)!.where;
      return { text: liquid.step, index: where === 'before' ? at : at + 1 };
    })
    .sort((a, b) => b.index - a.index);
  for (const liquid of liquids) texts.splice(liquid.index, 0, liquid.text);
  return texts;
}
