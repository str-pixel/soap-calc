import { alternativeLiquidPreset } from '@soap-calc/core';
import { catalogEntryById, isAdditiveOfferedFor, type AdditiveProcess } from '@soap-calc/core';
import { extraLyeForAcid } from '@soap-calc/core';
import {
  gramsFromDose,
  gramsFromPercentOfOil,
  parseDoseAmount,
  parsePercentOfOil,
  type DoseBasis,
  type DoseUnit,
} from '@soap-calc/core';
import type { AcidLyeRecipe, DilutionResult } from '@soap-calc/core';
import {
  correctedPotGramsFor,
  dilutionWaterGramsForPot,
  hasCorrectedPasteBasis,
} from './measuredPaste';
import type { AdditiveLine, RecipeSettings, SplitLiquidSettings } from './recipe';

export type ComputedAdditive = {
  key: string;
  catalogId: string;
  name: string;
  amount: number;
  basis: DoseBasis;
  unit: DoseUnit;
  grams: number;
  addAt: AdditiveLine['addAt'];
  /** Acid additives only (citric): compensation lye this line demands, for display.
   * Present only when computeRecipeAdditives received the acid recipe context. */
  extraLye?: { naohGrams: number; kohGrams: number };
};

export function computeRecipeAdditives(
  additives: AdditiveLine[],
  { oilGrams, batchGrams, solutionGrams }: { oilGrams: number; batchGrams: number; solutionGrams: number },
  acidLyeRecipe?: AcidLyeRecipe,
  /** The recipe's process. A line whose catalog entry is not offered here is INERT: no
   * grams, no batch weight, no dose advice. Optional so core-less callers and tests keep
   * working; when omitted, nothing is withheld. */
  process?: AdditiveProcess,
): ComputedAdditive[] {
  const result: ComputedAdditive[] = [];
  for (const line of additives) {
    // Scoping the offer must scope the behaviour. Filtering only the picker left an
    // imported or pre-gate line (glycerin under CP, say) still resolving grams and still
    // adding batch weight for an additive the app declines to offer there.
    if (process && line.catalogId) {
      const entry = catalogEntryById(line.catalogId);
      if (entry && !isAdditiveOfferedFor(entry, process)) continue;
    }
    const basisWeight =
      line.basis === 'batch' ? batchGrams : line.basis === 'solution' ? solutionGrams : oilGrams;
    if (basisWeight <= 0) continue;
    const amount = parseDoseAmount(line.amount, line.unit);
    if (amount === null || amount === 0) continue;
    const grams = gramsFromDose(basisWeight, amount, line.unit);
    if (grams === null) continue;
    // Acid compensation is a PRE-COOK concept: an acid dosed into the lye/oils/batter
    // consumes alkali that the calc must replace. An after_cook acid neutralizes the
    // finished soap's excess lye (the LS neutralization workflow) — compensating it would
    // add that lye straight back, in any process. Stage decides, not process.
    const factors =
      acidLyeRecipe && line.addAt !== 'after_cook'
        ? catalogEntryById(line.catalogId)?.lyeNeutralization
        : undefined;
    const extraLye = factors ? extraLyeForAcid(factors, grams, acidLyeRecipe!) : undefined;
    result.push({
      key: line.key,
      catalogId: line.catalogId,
      name: line.name.trim() || 'Additive',
      amount,
      basis: line.basis,
      unit: line.unit,
      grams,
      addAt: line.addAt,
      ...(extraLye ? { extraLye } : {}),
    });
  }
  return result;
}


export type ComputedPostCookSuperfatOil = {
  oilId: string;
  percentOfOil: number;
  grams: number;
};

export type ComputedPostCookSuperfat = {
  /** One entry per contributing oil row (percent > 0). */
  oils: ComputedPostCookSuperfatOil[];
  /** Sum of the rows' percent-of-oil — the total post-cook superfat %. */
  percentOfOil: number;
  /** Sum of the rows' grams — the total post-cook superfat weight. */
  grams: number;
};

/** Total off-recipe grams added to the batch: additives + trace split liquid + the
 * post-cook superfat when `pcsfIsExtra` is true (i.e. it isn't actually reserved from
 * the recipe oils). Single source of truth for the view model, ResultsPanel, and
 * BatchSheet — callers must pass the view model's `pcsfIsExtra`, not re-derive it from
 * the raw method string, since a subtract reserve under a lye excess is method:'subtract'
 * but never actually applied (see useRecipeViewModel's cookFactor guard). */
export function computeExtrasGrams(
  additives: Array<{ grams: number }>,
  splitLiquidGrams: number | null,
  postCookSuperfat: ComputedPostCookSuperfat | null,
  pcsfIsExtra: boolean,
): number {
  const additiveGrams = additives.reduce((sum, item) => sum + item.grams, 0);
  const pcsfGrams = pcsfIsExtra ? (postCookSuperfat?.grams ?? 0) : 0;
  return additiveGrams + (splitLiquidGrams ?? 0) + pcsfGrams;
}

/** The mass an LS batch actually bottles, for the volume/bottle estimate. Lives beside
 * computeExtrasGrams so "what counts as an extra" and "what rides through to the bottle"
 * are one tested rule set.
 *
 * TWO ARMS, chosen by the caller's `record` argument and never by a second reading of the
 * recipe's fields (spec §1's resolution rule has exactly one home — `lib/resolveDilution` —
 * and the view model hands this function that function's answer). The RECORD arm is
 * documented at the branch itself; everything below describes the PLAN arm, which is
 * unchanged.
 *
 * Base: the pot's real paste — the whole-batch reading when `correctedPotGramsFor` (the
 * shared pot choice) takes it, else the recipe's own
 * anhydrous + cook water — plus whatever water is still needed to reach the target. That
 * water figure is `dilutionWaterGramsForPot` fed the pot already resolved for the paste
 * term — the very subtraction `correctedDilutionWaterGrams` (the Dilution panel's own water
 * row, Task 5: a measurement outranks the targetExceedsPaste clamp) makes, measured against
 * the SAME pot from the SAME resolution, so this and that row never
 * disagree about what actually gets bottled. With no measurement this reduces exactly to the
 * old formula: unmeasured
 * paste + dilution.dilutionWaterGrams, which is dilution.solutionGrams when the clamp never
 * fired, or anhydrous + cook water when it did (dilutionWaterGrams pinned to 0 in that
 * branch, so the water term drops out and the paste term is all that's left).
 * Extras: everything in extrasGrams except the split liquids' water (counted via the
 * base either way) — additives at every stage, append-mode PCSF oil, split-liquid solids.
 * Those solids are counted here ONCE, and only here: with `wholeBatchPasteGrams` supplied
 * the water term is solutionGrams - (paste including its solids), so the base comes out a
 * solids' worth SHORT of solutionGrams and this extras term puts it back. The pot really
 * does end up at solutionGrams once the prescribed water is in — which is the point of
 * correcting the water figure, and the reason adding the solids on top of an uncorrected
 * water figure priced a bottle heavier than anything the maker was told to pour.
 * Acid-compensation alkali is DELIBERATELY excluded, mirroring the dilution calc's
 * base-result read: its acetate/citrate mass is small, and folding it in here without
 * also touching solutionGrams would be easy to mistake for a double count.
 *
 * "Counted ONCE" holds on BOTH paths, which took a second correction to make true. A
 * whole-batch reading the pot gate accepts makes the water term come back as
 * max(0, solutionGrams - measured), so the base is max(measured, solutionGrams) — the target's
 * own solution for any reading the target can still take water to reach, and the weighed pot
 * itself for one already past it. Either way the solids are already
 * inside it, because the maker put the pot with them in it on the scale. Adding them again
 * through the extras term priced the bottle a solids' worth heavy (4,115 g against a
 * 4,051 g solution on a 200 g canned-milk batch, and it scaled with the liquid). So the
 * term that comes off extrasGrams below is the whole split liquid on the measured path and
 * its water alone on the unmeasured one — the difference being exactly what each base
 * already contains. Both over-counted before the solids work; only the unmeasured one was
 * fixed then, which is how the two came to disagree about one batch. */
export function computeBottledSolutionGrams(input: {
  dilution: DilutionResult;
  cookWaterGrams: number;
  extrasGrams: number;
  splitLiquidPasteWaterGrams: number;
  /** The maker's scale reading for the WHOLE batch's paste — same App/view-model state
   * DilutionPanel and PortionDilutionResults read. Optional so callers/tests with no measurement
   * are unaffected. */
  measuredPasteGrams?: string;
  /** The view model's corrected whole-batch paste (anhydrous + cook water + an alternative
   * liquid's non-water solids). Threaded through for one reason: it is the pot the water
   * subtraction from solutionGrams is measured against (the same one
   * `correctedDilutionWaterGrams` resolves), so the water term below
   * must be the same one the panel and the sheet pour. Leaving it out here would have this
   * function price a bottle from more water than the maker is told to add — overstating the
   * batch by the solids, which then arrive again through `extrasGrams`. Optional: absent,
   * the water term is the recipe's own figure and this reduces to the previous formula
   * exactly. */
  wholeBatchPasteGrams?: number | null;
  /** THE RECORD ARM (spec §3). Non-null exactly when `resolveDilution` says the record
   * governs — the caller passes `resolvedDilution.record`, never a second derivation of it,
   * so the mass this prices and the mass the panel prints as "Finished so far" come from one
   * resolution. Null (or omitted) is the plan arm, byte-identical to before this parameter
   * existed. */
  record?: { potGrams: number; waterGrams: number } | null;
}): number {
  const {
    dilution,
    cookWaterGrams,
    extrasGrams,
    splitLiquidPasteWaterGrams,
    measuredPasteGrams,
    wholeBatchPasteGrams,
    record,
  } = input;
  // The alternative liquid's non-water solids — needed by BOTH arms, off the same corrected
  // basis the water subtraction from solutionGrams is measured against, never re-derived from
  // the split-liquid rows, so this and the water figure the panel prints can never disagree
  // about the same pot. Zero without a corrected basis, exactly as the water correction is: a
  // caller that supplies none cannot know the solids are there, and both paths then fall back
  // to the pre-correction formula together.
  const splitLiquidSolidsGrams = hasCorrectedPasteBasis(wholeBatchPasteGrams)
    ? Math.max(0, wholeBatchPasteGrams - (dilution.anhydrousGrams + cookWaterGrams))
    : 0;
  if (record) {
    // THE RECORD ARM: what is in the pot, not what the target predicts. The pot is
    // `resolveDilution`'s own — `weighedOrComputedPotGramsFor`, the reading when it describes
    // a possible pot, else the recipe's solids-aware corrected basis — plus the water the
    // maker actually poured. No ceiling is consulted, deliberately: the record derives its own
    // concentration from this pot, so a target-derived bound on it would let an output pick
    // its own input (the render loop measuredPasteDescribesPotFor documents).
    //
    // THE EXTRAS TERM IS WHERE THE DOUBLE COUNT LIVES, and it is the same one the plan arm's
    // `splitLiquidInBaseGrams` closes — generalized, because BOTH of this arm's pots already
    // hold the whole liquid. A weighed pot holds it because the maker put the pot with the
    // liquid in it on the scale; the corrected basis holds it because it is anhydrous + cook
    // water + those very solids. So the term to net out is the liquid's water AND its solids,
    // where the plan arm nets water alone on its unmeasured path. Verified on a 300 g-glycerin
    // recipe (waterFraction 0, so all 300 g are solids): a 1,900 g pot with 2,500 g recorded
    // bottles 4,400 g, and the naive `pot + record + extras` prices 4,700 — the glycerin
    // twice, which is the priced-a-solids'-worth-heavy bug the plan arm's own note records
    // fixing. Only the bare anhydrous + cook-water fallback pot (no corrected basis at all)
    // nets the water alone, and `splitLiquidSolidsGrams` is already 0 there.
    return (
      record.potGrams +
      record.waterGrams +
      Math.max(0, extrasGrams - (splitLiquidPasteWaterGrams + splitLiquidSolidsGrams))
    );
  }
  // THE SAME POT the water term below is measured against, from the same call, so this base
  // and that subtraction can never describe different batches. Both corrected-basis figures
  // go into the gate, not only into the water term: the paste floor counts an alternative
  // liquid's solids (lib/measuredPaste), so a reading lighter than the pot's own
  // undissolvable contents is refused here exactly as the panel and the printed sheet refuse
  // it — otherwise this would price a bottle from a pot the maker is being told on screen
  // cannot exist.
  //
  // correctedPotGramsFor, which is measuredPasteIsValidFor's own ceiling exactly: a reading
  // past solutionGrams (the loaded crockpot, 3 kg of stoneware included) is refused here and
  // this prices the recipe's own pot instead.
  const pot = correctedPotGramsFor(dilution, measuredPasteGrams, wholeBatchPasteGrams, cookWaterGrams);
  const measuredPaste = pot?.fromMeasurement ? pot.grams : undefined;
  const base =
    (measuredPaste ?? dilution.anhydrousGrams + cookWaterGrams) +
    dilutionWaterGramsForPot(dilution, pot);
  // What the base ALREADY holds of the split liquid, and the whole difference between the
  // two paths. Unmeasured, the base is built from anhydrous + cookWaterGrams, so it carries
  // the liquid's water only and the extras term has to put its solids back. Measured, the
  // base is the pot the maker weighed — water and solids both — so putting the solids back
  // would count them twice.
  const splitLiquidInBaseGrams =
    splitLiquidPasteWaterGrams + (measuredPaste !== undefined ? splitLiquidSolidsGrams : 0);
  return base + Math.max(0, extrasGrams - splitLiquidInBaseGrams);
}

/**
 * The preservative-free dosing basis of the WHOLE batch: the bottled figure when there is
 * one, else the dilution's own solution. Three surfaces quote this number — the Dilution
 * panel's ≈ Finished product row, the printed sheet's, and the Preservative snippet's
 * batch-scope dose base — and they wrote the same `??` chain out three times. It lives here
 * now, beside the function that computes the bottled figure, so a rule that decides a DOSE
 * (the snippet multiplies it by a % with a legal ceiling on it) cannot drift between its
 * readers.
 *
 * The fallback arm is unreachable from the view model — `bottledSolutionGrams` is null
 * exactly when `dilution` is (useRecipeViewModel computes it as `dilution && result ? … :
 * null`, and `dilution` itself is null whenever `result` is) — so App, DilutionPanel and
 * BatchSheet fed from the view model always take the first arm. It is kept for the
 * component-level callers that supply a `dilution` and nothing else: both components
 * default the bottled prop to null, and their tests exercise exactly that. Verified, not
 * assumed — dropping the arm would silently blank the panel's volume row for those callers.
 *
 * DOUBLE-COUNT WARNING for the dose base. `computeBottledSolutionGrams` adds `extrasGrams`
 * on top of the solution, and additives are part of extras. A maker who ALSO records their
 * preservative as a solution-basis additive therefore inflates the very mass the snippet
 * doses against: the preservative's own grams push the base up, and the dose computed from
 * that base is larger again. The error is small (a 1% additive moves the base 1%) and
 * always toward a bigger dose, so it can push a ceiling-height dose slightly over the
 * ceiling in reality. It cannot be netted out here: nothing in the additive catalog marks a
 * line as a preservative (there is no preservative entry at all — such a line is always a
 * free-text custom one), so this function cannot tell which grams are the double count.
 */
export function preservativeDosingBasisGramsFor(
  bottledSolutionGrams: number | null | undefined,
  dilution: Pick<DilutionResult, 'solutionGrams'> | null | undefined,
): number | null {
  return bottledSolutionGrams ?? dilution?.solutionGrams ?? null;
}

/** The finished, ready-for-use mass INCLUDING the preservative (spec §3): what the
 * bottle weighs and what the volume row converts. Equals the dosing basis exactly when
 * no preservative is dosed, so recipes without one see no change. */
export function finishedProductGramsFor(
  dosingBasisGrams: number | null,
  preservativeDoseGrams: number,
): number | null {
  if (dosingBasisGrams === null) return null;
  return dosingBasisGrams + Math.max(0, preservativeDoseGrams);
}

/** The post-cook superfat: one or more oils added after cook/dilution with no lye effect.
 * Each row is a % of recipe oil weight (same basis as additives/split-liquid); the aggregate
 * `percentOfOil`/`grams` sum the contributing rows. `null` when no row has a valid, non-zero
 * percent or there's no recipe oil weight yet. */
export function computePostCookSuperfat(
  settings: Pick<RecipeSettings, 'postCookSuperfatOils'>,
  totalOilGrams: number,
): ComputedPostCookSuperfat | null {
  if (totalOilGrams <= 0) return null;
  const oils: ComputedPostCookSuperfatOil[] = [];
  for (const row of settings.postCookSuperfatOils) {
    const percent = parsePercentOfOil(row.percent);
    if (percent === null || percent === 0) continue;
    const grams = gramsFromPercentOfOil(totalOilGrams, percent);
    if (grams === null) continue;
    oils.push({ oilId: row.oilId, percentOfOil: percent, grams });
  }
  if (oils.length === 0) return null;
  return {
    oils,
    percentOfOil: oils.reduce((sum, o) => sum + o.percentOfOil, 0),
    grams: oils.reduce((sum, o) => sum + o.grams, 0),
  };
}

/** Resolve the fraction of a split liquid that is actually water. Presets carry their own
 * value; custom liquids use the optional % water input, and fall back to pure water when
 * it is blank or out of range — the assumption is disclosed in the panel. */
/** How a split-liquid row's water content is known. Distinguishing 'unknown' from
 * 'invalid' lets the panel say "declare it" vs "that value is being ignored". */
export type SplitLiquidWaterInputState = 'preset' | 'declared' | 'unknown' | 'invalid';

export function splitLiquidWaterInputState(
  splitLiquid: Pick<SplitLiquidSettings, 'presetKey' | 'customWaterPercent'>,
): SplitLiquidWaterInputState {
  if (alternativeLiquidPreset(splitLiquid.presetKey)) return 'preset';
  if (splitLiquid.customWaterPercent.trim() === '') return 'unknown';
  const percent = Number(splitLiquid.customWaterPercent);
  return Number.isFinite(percent) && percent > 0 && percent <= 100 ? 'declared' : 'invalid';
}

/**
 * The fraction of a split liquid that is water, or NULL when it is genuinely unknown.
 *
 * Null rather than a silent 1. The old default was safe for the 1:1 lye-dissolution floor
 * (assuming plenty of water avoids false shortfall alarms) and unsafe for the dilution
 * deduction added later (assuming plenty of water deducts the maximum, under-diluting the
 * soap) — the same fallback with opposite risk polarity per consumer. Making the unknown
 * explicit forces each consumer to pick its own safe direction, and forces the next one to
 * think about it. Consumers must handle null; there is no correct shared default.
 */
export function splitLiquidWaterFraction(
  splitLiquid: Pick<SplitLiquidSettings, 'presetKey' | 'customWaterPercent'>,
): number | null {
  const preset = alternativeLiquidPreset(splitLiquid.presetKey);
  if (preset) return preset.waterFraction;
  const percent = Number(splitLiquid.customWaterPercent);
  if (
    splitLiquid.customWaterPercent.trim() !== '' &&
    Number.isFinite(percent) &&
    percent > 0 &&
    percent <= 100
  ) {
    return percent / 100;
  }
  return null;
}
