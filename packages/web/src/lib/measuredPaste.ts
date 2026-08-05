import type { DilutionResult } from '@soap-calc/core';

/**
 * The mass in the pot that CANNOT leave during the cook, and so the physical floor under any
 * whole-batch paste reading: the batch's anhydrous soap plus an alternative liquid's
 * non-water SOLIDS.
 *
 * Cook water is deliberately NOT in this floor, and must never be added to it. Water boils
 * off — that is the entire reason the reference has the maker weigh the paste (LS:2172), and
 * a reading lighter than the recipe predicts is the expected, meaningful case this feature
 * exists to accept. Solids are the opposite: an alternative liquid's non-water fraction is
 * dissolved or suspended in the paste and is still in the crock when the cook ends, so a
 * reading below anhydrous + solids describes a pot that cannot exist.
 *
 * The floor was `anhydrousGrams` alone until this correction, which accepted readings
 * physically short by the whole solids mass: a 1,930 g pot (1,215 g anhydrous, 330 g lye
 * water, 385 g glycerin — all of it solids) took a typed 1,400 g, cleared every guard, and
 * the panel printed a pour and a measurement-corrected bottled mass off a pot 200 g lighter
 * than its own undissolvable contents.
 *
 * Solids are derived exactly as every other surface on this branch derives them —
 * `wholeBatchPasteGrams - (anhydrousGrams + cookWaterGrams)`, clamped at zero — rather than
 * from `totalWaterGrams - dilutionWaterGrams`, which recovers 0 rather than the real cook
 * water once the targetExceedsPaste clamp has fired (see calculateDilution's own note) and
 * would invent a floor out of the clamp on a recipe with no split liquid at all.
 *
 * Both inputs are needed to know the solids are there, so the floor falls back to
 * `anhydrousGrams` — today's behaviour, byte-identical — whenever either is missing or
 * unusable: a recipe with no split liquid (where the corrected basis IS anhydrous + cook
 * water, so the solids term is exactly 0), and any caller that supplies neither.
 */
function solidsFloorGramsFor(
  dilution: DilutionResult,
  wholeBatchPasteGrams?: number | null,
  cookWaterGrams?: number | null,
): number {
  const hasCorrectedBasis =
    wholeBatchPasteGrams !== undefined &&
    wholeBatchPasteGrams !== null &&
    Number.isFinite(wholeBatchPasteGrams) &&
    wholeBatchPasteGrams > 0;
  const hasCookWater =
    cookWaterGrams !== undefined &&
    cookWaterGrams !== null &&
    Number.isFinite(cookWaterGrams) &&
    cookWaterGrams >= 0;
  if (!hasCorrectedBasis || !hasCookWater) return dilution.anhydrousGrams;
  const solidsGrams = Math.max(
    0,
    (wholeBatchPasteGrams as number) - (dilution.anhydrousGrams + (cookWaterGrams as number)),
  );
  return dilution.anhydrousGrams + solidsGrams;
}

/**
 * INTERNAL to this module — deliberately not exported. A batch's paste always contains ALL
 * of its anhydrous soap AND all of the solids an alternative liquid put in the pot — neither
 * evaporates — so a reading below that is not a whole-batch paste. It is a mis-tare (the
 * crock left on the scale) or a PORTION weight. The boundary (measured === the floor) is
 * accepted. See {@link solidsFloorGramsFor} for the floor itself and why cook water is not
 * part of it.
 *
 * The shared entry point every surface must go through is {@link measuredPasteRejectionFor}
 * (or {@link measuredPasteIsValidFor} for the yes/no form). This predicate answers only one
 * of the three rules and carries none of the conditions the callers need — it says nothing
 * about blank/unparseable input, and nothing about the `isRemaining` declaration that
 * disables this floor entirely. Its doc used to claim it was "shared by
 * PortionDilutionResults and DilutionPanel", which is how the rejection alerts came to be
 * rendered from one surface only and vanished from the default dilution scope.
 */
function measurementBelowSolids(measuredGrams: number, solidsFloorGrams: number): boolean {
  return measuredGrams < solidsFloorGrams;
}

/**
 * INTERNAL to this module — deliberately not exported; see measurementBelowSolids above for
 * why, and go through {@link measuredPasteRejectionFor} instead. A paste heavier than the
 * whole target solution cannot be diluted INTO that solution. The boundary
 * (measured === solutionGrams) is accepted.
 */
function measurementExceedsSolution(measuredGrams: number, dilution: DilutionResult): boolean {
  return measuredGrams > dilution.solutionGrams;
}

/**
 * Parses a measured-paste input string (as stored in App/view-model state) into a finite,
 * positive gram figure, or undefined when blank/invalid. Centralizes the "is there a
 * usable number here" check so every caller that might apply the measurement —
 * PortionDilutionResults, DilutionPanel, the printed batch sheet — reads it identically.
 */
export function parseMeasuredPasteGrams(measuredPasteGrams: string | undefined): number | undefined {
  if (measuredPasteGrams === undefined) return undefined;
  const trimmed = measuredPasteGrams.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * True when a parsed measured-paste reading is valid FOR this dilution: not below the
 * non-evaporable solids floor (measurementBelowSolids) and not above the target solution
 * ceiling (measurementExceedsSolution) — the shared bar every caller that lets a
 * measurement override a computed figure must clear first.
 *
 * `isRemaining` gates this for the BATCH row specifically: a reading declared as what's
 * LEFT after earlier dilutions describes a smaller pot, not the whole batch, so it can
 * never be valid for a caller (DilutionPanel's batch row, the printed BatchSheet) that
 * corrects a BATCH-level figure with it — PortionDilutionResults' own portion arithmetic
 * doesn't go through this gate, since a remaining reading is exactly what it wants.
 *
 * `wholeBatchPasteGrams`/`cookWaterGrams` are the two figures the floor needs to see an
 * alternative liquid's solids (see {@link solidsFloorGramsFor}). They MUST be passed by
 * every caller that also renders {@link measuredPasteRejectionFor}'s verdict, or the panel
 * would reject a reading in one place and apply it in another; omitting both is the
 * documented, byte-identical fallback to the anhydrous-only floor.
 */
export function measuredPasteIsValidFor(
  measuredPasteGrams: string | undefined,
  dilution: DilutionResult,
  isRemaining = false,
  wholeBatchPasteGrams?: number | null,
  cookWaterGrams?: number | null,
): boolean {
  if (isRemaining) return false;
  const measured = parseMeasuredPasteGrams(measuredPasteGrams);
  return (
    measured !== undefined &&
    !measurementBelowSolids(
      measured,
      solidsFloorGramsFor(dilution, wholeBatchPasteGrams, cookWaterGrams),
    ) &&
    !measurementExceedsSolution(measured, dilution)
  );
}

/**
 * Everything a surface needs to say about a measured-paste reading: which of the three
 * physical-impossibility rules it broke, whether it is usable at all, and the whole-batch
 * paste mass the remaining-mode ceiling was checked against.
 */
export type MeasuredPasteRejection = {
  /** The field holds a number that is not a weight at all — zero or negative. Applies under
   * either declaration, and is exclusive of the three rules below. */
  nonPositive: boolean;
  /** The reading is lighter than the batch's own non-evaporable mass — its anhydrous soap
   * plus an alternative liquid's solids (whole-batch mode only). Yields to
   * `exceedsSolution`: the floor can sit ABOVE the ceiling once the solids outweigh the
   * target's whole water allowance, and a reading in that gap gets the ceiling's refusal
   * alone — see the rule's own note for why. */
  belowSolids: boolean;
  /** The reading is heavier than the whole solution the target dilutes to. The rule that
   * yields to nothing: `nonPositive` and `belowSolids` both exclude it explicitly, so among
   * the WHOLE-BATCH rules it always wins. Not gated on the declaration, so it can fire
   * alongside `exceedsRemainingCeiling` — see that field. */
  exceedsSolution: boolean;
  /** A remaining reading is heavier than the whole batch's paste ever was.
   *
   * The one rule that does NOT exclude `exceedsSolution`, and the one place the "one
   * paragraph per reading" property does not hold: a remaining reading above both the target
   * solution and the pot sets both flags, and the surfaces render the two branches
   * independently, so both paragraphs appear (a remaining 4,100 g against a 4,000 g solution
   * and a 2,050 g pot prints "lower the target concentration" above "it cannot be what is
   * left of it" — and the first is the wrong advice for a remainder, whose problem is not
   * the target). Long-standing, untouched by the floor correction, and left alone
   * deliberately: closing it moves the remaining-mode ceiling. Fix it there, not by widening
   * this rule. */
  exceedsRemainingCeiling: boolean;
  /** Any of the four above fired. */
  rejected: boolean;
  /** There is a usable reading AND nothing rejected it — safe to compute from. */
  accepted: boolean;
  /** The field holds something; says nothing about whether it parses. */
  hasMeasurement: boolean;
  /** The reading as `Number()` saw it — NaN when unparseable, 0 when blank. */
  measuredGrams: number;
  /** The whole-batch paste mass the remaining-mode ceiling was checked against, and the
   * figure the ceiling alert must quote. */
  wholeBatchPasteBasis: number;
  /** The floor `belowSolids` was checked against — anhydrous soap plus whatever solids an
   * alternative liquid put in the pot — and the figure the belowSolids alert must quote, for
   * the same reason `wholeBatchPasteBasis` exists: a surface that re-derives the bound it is
   * explaining can drift from the guard that applied it. Exactly `anhydrousGrams` when there
   * are no solids, or when no corrected basis / cook water was supplied.
   *
   * Reported whether or not `belowSolids` fired, so it is NOT on its own evidence that a
   * reading was refused by the floor: it can exceed `solutionGrams`, in which case the
   * ceiling owns every reading above it and `belowSolids` stays false. Read the flag. */
  solidsFloorGrams: number;
};

/**
 * The single source for whether a measured-paste reading is physically possible. The
 * measured-paste INPUT lives in DilutionPanel's shell, visible in both dilution scopes,
 * while PortionDilutionResults consumes the same reading to decide whether to compute a
 * portion from it — so both read the verdict from here rather than each deciding for
 * itself. The three rules and the reasons they exist are documented on the branches below;
 * they were moved here verbatim from PortionDilutionResults, where they used to live
 * beside the alert paragraphs.
 *
 * `wholeBatchPasteGrams` is the view model's corrected whole-batch paste mass; omit it and
 * the ceiling falls back to the recipe's own water-only predicted figure, exactly as core
 * does when its matching param is omitted. `cookWaterGrams` is the recipe's own cook water,
 * needed alongside it for the solids floor alone (see {@link solidsFloorGramsFor}) — it is
 * NOT part of the ceiling, and does not touch `wholeBatchPasteBasis`.
 */
export function measuredPasteRejectionFor(
  measuredPasteGrams: string | undefined,
  dilution: DilutionResult,
  isRemaining: boolean,
  wholeBatchPasteGrams?: number | null,
  cookWaterGrams?: number | null,
): MeasuredPasteRejection {
  const raw = measuredPasteGrams ?? '';
  const hasMeasurement = raw.trim() !== '';
  const measured = Number(raw);
  // Mirrors core's own predictedPasteGrams (anhydrous + the water already in the paste) —
  // computed here too so the UI can refuse a physically impossible remaining reading
  // BEFORE calling lsPartialDilution, the same way pasteBelowSolids/pasteExceedsSolution
  // already do for their own guards. This counts only the WATER fraction of an
  // alternative liquid, though — see wholeBatchPasteBasis just below for the corrected
  // figure that actually gates the remaining-mode ceiling.
  const predictedPasteGrams =
    dilution.anhydrousGrams + Math.max(0, dilution.totalWaterGrams - dilution.dilutionWaterGrams);
  // Review round 3: predictedPasteGrams structurally misses an alternative liquid's
  // non-water solids (real mass sitting in the pot), so the TRUE whole-batch paste is
  // heavier than predictedPasteGrams whenever the recipe has a split liquid. The corrected
  // figure (wholeBatchPasteGrams, from the view model) is used for the ceiling below —
  // and passed straight through to lsPartialDilution for the composition ratio too, so
  // the UI's own rejection and core's arithmetic always agree on the same basis. Falls
  // back to the uncorrected predictedPasteGrams (round 2's basis) when absent — the exact
  // same fallback core itself applies when its own wholeBatchPasteGrams param is omitted.
  const wholeBatchPasteBasis =
    wholeBatchPasteGrams !== undefined &&
    wholeBatchPasteGrams !== null &&
    Number.isFinite(wholeBatchPasteGrams) &&
    wholeBatchPasteGrams > 0
      ? wholeBatchPasteGrams
      : predictedPasteGrams;
  // Review round 4, finding 8: a scale reading of zero or less is not a paste weight under
  // EITHER declaration — it is below the anhydrous floor trivially, and a remainder of
  // nothing has nothing left to dilute. The `measured > 0` guards on belowSolids and
  // exceedsRemainingCeiling below, and on `accepted` at the bottom, were written to exempt
  // the BLANK field (Number('') === 0) — but hasMeasurement already covers that case, so
  // what those guards actually did was let a typed -500 through as
  // {rejected: false, accepted: false}: no alert anywhere, and the batch row silently
  // falling back to the recipe's computed figure with the impossible number still on
  // screen above it. min={1} on a type="number" input is only enforced on submit, and this
  // form has none, so it is typeable. This owns the verdict alone rather than folding into
  // belowSolids: that rule's remedy ("switch the declaration to what's left after earlier
  // dilutions") is no help for a negative number, and it is disabled in remaining mode,
  // which would have left that declaration silent all over again.
  const nonPositive = hasMeasurement && Number.isFinite(measured) && measured <= 0;
  // A batch's paste always contains ALL of its anhydrous soap AND all of the solids an
  // alternative liquid put in the pot — neither evaporates — so a WHOLE-BATCH reading below
  // that is not physically possible. It is a mis-tare (the crock left on the scale) or a
  // PORTION weight, and the reference's own ratio method does weigh the portion, which makes
  // the mistake an easy one. Left unguarded the app answered with confident nonsense: a
  // 900 g reading on a 1,200 g-soap batch reported "lighter than predicted — water lost to
  // the cook", which cannot be true of water that was never there.
  //
  // The floor counts SOLIDS and not cook water, which is the whole of the distinction: cook
  // water boils off, so a reading lighter than the recipe predicts is the expected case this
  // feature exists to accept, while an alternative liquid's non-water fraction stays in the
  // crock. Anhydrous alone was the floor until this correction and let a reading short by the
  // entire solids mass through — see solidsFloorGramsFor for the worked case and for why the
  // floor falls back to anhydrous when the caller supplies no corrected basis.
  //
  // The floor does not apply once the reading is declared REMAINING: what's left after an
  // earlier dilution can legitimately be less than the recipe's whole anhydrous soap — that
  // is the entire point of the declaration, and rejecting it left no way to enter an honest
  // measurement (the batch no longer exists at full weight to "enter instead").
  //
  // `!measurementExceedsSolution` is what keeps this rule disjoint from the ceiling, and it
  // became load-bearing the moment the floor stopped being `anhydrousGrams`. That old floor
  // was strictly below `solutionGrams` for any target under 100% (solutionGrams is anhydrous
  // ÷ the target), so the two rules could not both fire and no exclusion was needed. The
  // corrected floor CAN outrun the ceiling: floor > ceiling reduces to
  // solids > totalWaterGrams — the liquid's undissolvable mass outweighing the target's
  // whole water allowance — which is reachable on a real recipe at a typable target (400 g
  // of glycerin on the starter recipe at 78%: a 1,615 g floor against a 1,558 g ceiling).
  // A reading in the gap between them then tripped both rules and the shell printed two
  // refusals that contradict each other: "check the scale was tared, it cannot be all of the
  // paste" beside "it already weighs more than the target dilutes to, lower the target".
  //
  // The ceiling wins there, and must: it is the rule with the actionable remedy in that
  // state (the reading is above what this target can hold, so the target is what moves),
  // while the floor's remedies — re-tare, or re-declare as a remainder — answer a mistake
  // that is not the one being made. `rejected` is unaffected either way, so nothing this
  // exclusion touches becomes acceptable; only the redundant paragraph goes.
  const solidsFloorGrams = solidsFloorGramsFor(dilution, wholeBatchPasteGrams, cookWaterGrams);
  const belowSolids =
    !isRemaining &&
    hasMeasurement &&
    Number.isFinite(measured) &&
    measured > 0 &&
    !measurementExceedsSolution(measured, dilution) &&
    measurementBelowSolids(measured, solidsFloorGrams);
  // Likewise, a paste heavier than the whole target solution cannot be diluted INTO that
  // solution. Core returns null for it; saying so beats the figures silently vanishing.
  // Kept as-is for whole-batch mode — unaffected by the remaining-only ceiling below.
  // `!nonPositive` rather than `measured > 0`: a negative reading is never above the
  // solution, so this is only belt-and-braces, but it is what makes the three WHOLE-BATCH
  // rules mutually exclusive, so the shell renders one paragraph for one whole-batch
  // reading. That exclusivity is asserted, not incidental: this rule yields to nothing, and
  // nonPositive and belowSolids each defer to it explicitly (see belowSolids' own note for
  // the case where the floor outruns the ceiling and this rule is the only one standing).
  //
  // WHOLE-BATCH, and not a claim about all four. This rule is not gated on the declaration,
  // and exceedsRemainingCeiling does not exclude it, so a REMAINING reading above both the
  // solution and the pot still sets two flags and still prints two paragraphs — the one
  // surviving hole in "one refusal per reading", pinned by the sweep in measuredPaste.test
  // rather than papered over here. It predates the solids floor by two rounds and is
  // untouched by it; the earlier wording of this note claimed the property held for all four
  // and had never been swept. Closing it means moving the remaining-mode ceiling, which is
  // where the fix belongs — not in widening this rule to swallow the other's case.
  const exceedsSolution =
    hasMeasurement &&
    Number.isFinite(measured) &&
    !nonPositive &&
    measurementExceedsSolution(measured, dilution);
  // Review round 2, finding 2: a REMAINING reading cannot weigh more than the whole
  // batch's own paste ever did — solids and the water already in the paste don't appear
  // from nowhere. Left unguarded, a bogus reading (e.g. 3,000 g against a 1,700 g true
  // paste) scaled to a pot anhydrous bigger than the entire batch's own anhydrous soap:
  // physically impossible input, confidently wrong output. Checked against
  // wholeBatchPasteBasis (round 3's corrected figure, not the water-only
  // predictedPasteGrams — see its own comment above) so a legitimate remaining reading on
  // a split-liquid recipe isn't falsely rejected. Core rejects this too (returns null,
  // checked against the same basis via the wholeBatchPasteGrams param), so the bad
  // value can never reach the arithmetic either way — this mirrors that guard at the UI
  // layer so the maker sees why, not just a vanished result.
  const exceedsRemainingCeiling =
    isRemaining &&
    hasMeasurement &&
    Number.isFinite(measured) &&
    measured > 0 &&
    measured > wholeBatchPasteBasis;
  const rejected = nonPositive || belowSolids || exceedsSolution || exceedsRemainingCeiling;
  return {
    nonPositive,
    belowSolids,
    exceedsSolution,
    exceedsRemainingCeiling,
    rejected,
    accepted: hasMeasurement && Number.isFinite(measured) && measured > 0 && !rejected,
    hasMeasurement,
    measuredGrams: measured,
    wholeBatchPasteBasis,
    solidsFloorGrams,
  };
}

/**
 * The batch's dilution-water figure, corrected for the two things the recipe's own
 * `dilutionWaterGrams` cannot see. Shared by DilutionPanel's WHOLE-BATCH row, the printed
 * BatchSheet and computeBottledSolutionGrams.
 *
 * Those three, and no more: Custom amount's water comes from core's `lsPartialDilution`,
 * which does its own `potSolutionGrams - pasteGrams` off the same corrected basis. An
 * earlier version of this note claimed "no surface can pour a different number", which read
 * as a guarantee this function is in no position to give — and was false while
 * lsPartialDilution still sized an unmeasured pot from the water-only predictedPasteGrams,
 * leaving Custom amount and Whole batch a solids' worth apart. Both correction rules below
 * have to hold on both paths; keep them in step by hand, and pin them against each other
 * (DilutionPanel.test's "Whole batch and Custom amount pour one figure").
 *
 * 1. A valid measured paste — the same arithmetic DilutionPanel and PortionDilutionResults
 *    already apply: solutionGrams is fixed by the target concentration, so
 *    solutionGrams - measured is what is still needed to reach it, and a valid measurement
 *    OUTRANKS the recipe's own dilutionWaterGrams (Task 5's
 *    measured-paste-outranks-targetExceedsPaste principle — that flag is derived from the
 *    recipe's ASSUMED cook water, the measurement is direct evidence against it).
 *
 * 2. An alternative liquid's non-water SOLIDS, when the view model's corrected
 *    `wholeBatchPasteGrams` is supplied. calculateDilution works from anhydrous + water
 *    alone, so its dilutionWaterGrams is solutionGrams - anhydrous - cookWater — it leaves
 *    the solids out of the pot entirely and prescribes water for a paste lighter than the
 *    one on the scale. DilutionPanel's ratio mode already derives its pour from the
 *    corrected paste (pasteGrams x ratio), so before this the ratio block and every
 *    concentration-derived surface disagreed by exactly the solids: 5,000 g on screen
 *    against 5,450 g on the batch sheet for a 900 g liquid at 50% water. Subtracting the
 *    corrected paste from the same solutionGrams is the ratio block's own basis, so the
 *    two now land on one number.
 *
 * Falls back to the recipe's computed figure when neither correction is available, which
 * is byte-identical for a recipe with no split liquid: wholeBatchPasteGrams is then exactly
 * anhydrous + cookWater, and solutionGrams - that IS dilutionWaterGrams.
 *
 * Clamped at zero, matching calculateDilution's own clamp on dilutionWaterGrams: the
 * corrected paste can exceed the target solution (a big low-water liquid) while the
 * recipe's water-only targetExceedsPaste flag stays false, and a negative pour figure is
 * never an instruction. It prints as "0 g" — the honest answer, where the uncorrected
 * figure was a positive number that would have pushed the batch past its target.
 *
 * That "0 g" used to reach the screen and the printed sheet with NO alert beside it: every
 * explanatory branch was gated on targetExceedsPaste (false here) or on a rejected
 * MEASUREMENT (none here). Both surfaces now carry a branch keyed on the clamp's own
 * condition instead — DilutionPanel's pasteAlreadyPastTarget and BatchSheet's twin of it —
 * so the zero is never printed bare. Any new surface pouring this figure owes the maker the
 * same account; the clamp fires exactly when wholeBatchPasteGrams > solutionGrams.
 *
 * The measured branch above still returns before the wholeBatchPasteGrams correction, and
 * must: solutionGrams is the pot's target mass and the measurement is the pot, so
 * solutionGrams - measured is what is left to pour whatever the pot is made of. What that
 * short-circuit cost was downstream, in computeBottledSolutionGrams, which read the base as
 * solids-free and added them on top of a pot weighed WITH them. Corrected there, at the
 * point that knows the difference, rather than here.
 */
export function correctedDilutionWaterGrams(
  dilution: DilutionResult,
  measuredPasteGrams: string | undefined,
  isRemaining = false,
  wholeBatchPasteGrams?: number | null,
  cookWaterGrams?: number | null,
): number {
  // wholeBatchPasteGrams/cookWaterGrams are forwarded into the validity gate, not just used
  // by the correction below it: the floor a reading is judged against has to be the same one
  // the rejection alert names, or this row would pour from a reading the panel is refusing
  // one paragraph above.
  if (
    measuredPasteIsValidFor(
      measuredPasteGrams,
      dilution,
      isRemaining,
      wholeBatchPasteGrams,
      cookWaterGrams,
    )
  ) {
    return dilution.solutionGrams - (parseMeasuredPasteGrams(measuredPasteGrams) as number);
  }
  if (
    wholeBatchPasteGrams !== undefined &&
    wholeBatchPasteGrams !== null &&
    Number.isFinite(wholeBatchPasteGrams) &&
    wholeBatchPasteGrams > 0
  ) {
    return Math.max(0, dilution.solutionGrams - wholeBatchPasteGrams);
  }
  return dilution.dilutionWaterGrams;
}
