import { lsPartialDilution, type DilutionResult } from '@soap-calc/core';
import { formatWeight } from '../lib/weightUnits';
import { MEASURED_PASTE_IS_REMAINING, measuredPasteRejectionFor } from '../lib/measuredPaste';
import type { WeightUnit } from '../lib/recipe';

type PortionDilutionResultsProps = {
  dilution: DilutionResult;
  weightUnit: WeightUnit;
  /** Lives in App, not the recipe: it is a "what am I making right now" decision, not a
   * property of the formula. */
  targetMl: string;
  /** The maker's scale reading for the paste, in grams — always the WHOLE batch. There used
   * to be a declaration beside the field letting the maker call it "what's left after earlier
   * dilutions" instead; it is gone (see lib/measuredPaste's MEASURED_PASTE_IS_REMAINING for
   * why, and for where the remaining-mode arithmetic still lives). */
  measuredPasteGrams: string;
  /** The best-known WHOLE-BATCH paste mass (see useRecipeViewModel) — corrects the
   * recipe's own water-only predicted figure for an alternative liquid's non-water
   * solids, which are real mass sitting in the pot the recipe never counts. Used as the
   * ceiling/composition basis for a remaining-mode measurement in place of the
   * uncorrected figure when available, so core and this UI check agree. Falls back to the
   * recipe-computed figure when absent (a recipe with no split liquid, or data built
   * before this field existed). */
  wholeBatchPasteGrams?: number | null;
  /** The recipe's own cook water (lye water plus an alternative liquid's water fraction).
   * Needed alongside `wholeBatchPasteGrams` for one thing only: the paste floor is anhydrous
   * soap plus the liquid's non-water SOLIDS, and the two figures are what identify those
   * solids (lib/measuredPaste's solidsFloorGramsFor). Forwarded by DilutionPanel so this
   * component and the shell's own rejection alert judge one reading by one floor. Absent,
   * the floor falls back to anhydrous alone, exactly as before. */
  cookWaterGrams?: number;
  /** Grams of alternative liquid whose water content was never declared. Forwarded from
   * DilutionPanel (which gets it from App) for one reason only: targetExceedsPaste is
   * derived from the recipe's ASSUMED water content, so above zero the over-dilution
   * verdict is not knowable and must not be stated as fact — the shell and the printed
   * sheet already gate the identical sentence this way. */
  unknownLiquidGrams?: number;
  /** True when the over-dilution verdict holds across the undeclared liquid's whole
   * 0–100% water range, so it can be stated as fact after all. */
  overDilutionCertain?: boolean;
  /** Which control the maker is choosing the dilution with, so a refusal here can name
   * something that is actually on screen. Structurally DilutionPanel's own DilutionMode,
   * spelled out rather than imported to keep the type dependency one-way (the panel
   * imports this module). Defaults to the panel's own default. */
  dilutionMode?: 'concentration' | 'ratio';
  /** True while ratio mode is showing a ratio the write-back has not applied — see
   * DilutionPanel's own `ratioNotAppliedYet`. Everything here is computed from the SAVED
   * target in that state, so a refusal must not name the ratio's own concentration as the
   * thing the paste is past. */
  ratioNotAppliedYet?: boolean;
};

/**
 * What a refusal should call the target it says the paste is past, and what it should tell
 * the maker to do about it. Exported so DilutionPanel's Whole-batch twin of the same
 * refusal words it identically — the two describe one state and used to drift apart.
 *
 * Ratio mode shows no concentration field at all, so "the target above" / "set a target"
 * named a control that is not on screen; and while the ratio is not applied yet, every
 * figure here still runs on the SAVED target, so naming the ratio's own concentration would
 * be wrong in the other direction. The remedy is the same action either way — editing the
 * ratio both applies it and widens it — and points the same way as the exceeds-solution
 * alert: the paste is past the target, so it takes MORE water.
 */
export function dilutionTargetWording(
  dilutionMode: 'concentration' | 'ratio',
  ratioNotAppliedYet: boolean,
): { named: string; remedy: string } {
  if (dilutionMode !== 'ratio') {
    return { named: 'the target above', remedy: 'Lower the target concentration above (more water)' };
  }
  return {
    named: ratioNotAppliedYet ? 'your saved target above' : 'the concentration this ratio lands at',
    remedy: 'Raise the water:paste ratio above (more water)',
  };
}

/**
 * The portion this component would render — null when either of the two verdicts below
 * suppresses it — resolved once, here, so DilutionPanel's shell can ask the same question
 * without re-deriving it. The shell needs the answer for its density caveat: that caveat explains a
 * gram→millilitre bridge, so it must not print unless a millilitre figure really is on
 * screen, and "an amount was asked for" is not the same question as "a portion rendered"
 * (a rejected measurement, or a paste already thinner than the target, suppresses the
 * portion with the amount still filled in). Same shape as measuredPasteRejectionFor, and
 * for the same reason: two surfaces reading one verdict can never contradict each other.
 */
export function portionDilutionFor({
  dilution,
  targetMl,
  measuredPasteGrams,
  wholeBatchPasteGrams,
  cookWaterGrams,
}: Pick<
  PortionDilutionResultsProps,
  'dilution' | 'targetMl' | 'measuredPasteGrams' | 'wholeBatchPasteGrams' | 'cookWaterGrams'
>) {
  // The physical-impossibility rules — below the anhydrous solids, heavier than the target
  // solution (and, for a declaration this UI no longer offers, a remainder heavier than the
  // whole batch ever was) — live in lib/measuredPaste, together with the long record of the
  // bug each one closed. The measured-paste INPUT is in DilutionPanel's shell, where it is
  // visible in BOTH dilution scopes, and so are the alerts that reject a reading: this
  // component only renders in Custom amount scope, so alerts kept here were unreachable in
  // the default one. Reading the verdict from the same helper the shell uses means the two
  // can never disagree about whether a reading is usable.
  const rejection = measuredPasteRejectionFor(
    measuredPasteGrams,
    dilution,
    MEASURED_PASTE_IS_REMAINING,
    wholeBatchPasteGrams,
    cookWaterGrams,
  );
  const measured = rejection.measuredGrams;
  const measurementRejected = rejection.rejected;
  const hasValidMeasurement = rejection.accepted;
  // targetExceedsPaste is computed from the recipe's ASSUMED cook water — exactly the
  // assumption a measured paste is evidence against (Task 5: a valid measurement outranks
  // the flag). With one, the paste IS recoverable — that's the whole point of weighing it —
  // so only refuse when there is NO valid measurement to fall back on. A rejected
  // measurement (below solids / exceeds solution) gets its own alert above instead of this
  // one, so it is excluded here too.
  const pasteAlreadyThinner =
    dilution.targetExceedsPaste && !hasValidMeasurement && !measurementRejected;
  // A MEASURED reading can no longer make core refuse, and there is no longer a branch here
  // for it. lsPartialDilution returns null when the pot's paste outweighs the solution that
  // pot's own soap makes at the target (ls-yield's `potSolutionGrams - pasteGrams < 0`); with
  // a whole-batch reading that pot IS the recipe's, so the test reduces to
  // solutionGrams < measured — which is exactly `exceedsSolution`, so the reading was already
  // rejected and `hasValidMeasurement` is false. The condition was only reachable through an
  // accepted "what's left" reading, whose own pot is a share of the batch's: that declaration
  // is gone (see lib/measuredPaste's MEASURED_PASTE_IS_REMAINING), and the paragraph that
  // explained it went with it rather than sit here unrenderable. The unmeasured twin below is
  // still live and still needed.
  //
  // The UNMEASURED twin, and the other way core can refuse. Once core sizes an unmeasured pot
  // from the corrected basis rather than the water-only predictedPasteGrams (so Custom amount
  // pours what Whole batch pours), that pot can be heavier than the solution its own soap
  // makes at the target — a big low-water liquid —
  // while the recipe's targetExceedsPaste flag, computed from water alone, stays false. Core
  // then returns null and pasteAlreadyThinner cannot cover it (that flag IS
  // targetExceedsPaste), so both render branches went false and this component emitted an
  // empty fragment: no figures, no alert, nothing saying why.
  //
  // Unreachable off the fallback basis, so no existing caller changes: predictedPasteGrams
  // is anhydrousGrams + cook when totalWater >= cook and anhydrousGrams + totalWater
  // (= solutionGrams) otherwise, and neither can exceed solutionGrams. Nothing any guard
  // computes changes — this only names a null core was already going to return.
  const unmeasuredPasteAlreadyThinner =
    !hasValidMeasurement &&
    !measurementRejected &&
    !pasteAlreadyThinner &&
    dilution.solutionGrams - rejection.wholeBatchPasteBasis < 0;
  const portion =
    pasteAlreadyThinner || measurementRejected || unmeasuredPasteAlreadyThinner
      ? null
      : lsPartialDilution(
          {
            ...dilution,
            measuredPasteGrams: hasValidMeasurement ? measured : undefined,
            // Left at core's own default (undefined = whole batch). Core's remaining-mode
            // arithmetic is intact and tested there; nothing in this app declares a
            // remainder — see lib/measuredPaste's MEASURED_PASTE_IS_REMAINING.
            // Same corrected basis the UI's own ceiling check above uses, so core's
            // composition ratio and this component's rejection never disagree.
            wholeBatchPasteGrams: wholeBatchPasteGrams ?? undefined,
          },
          Number(targetMl),
        );
  return {
    measured,
    pasteAlreadyThinner,
    unmeasuredPasteAlreadyThinner,
    portion,
  };
}

/**
 * Dilute only part of the batch. Paste keeps far better than diluted soap — it stores
 * sealed, refrigerates and freezes — so the common workflow is to cook one batch of paste
 * and draw it down over time. Whole batch scope answers "dilute it all"; this answers
 * "make just this much now".
 *
 * The paste weight can be measured rather than computed, and should be: the reference has
 * the maker weigh the paste before picking a water:paste ratio, and marks its own dilution
 * table as estimates for that reason — no printed figure can know how much water a
 * particular cook drove off (LS:2172).
 *
 * A computed paste used to be wrong in two directions at once. One of them is fixed:
 * `wholeBatchPasteGrams` carries an alternative liquid's non-water solids into the basis
 * this component and core both size from, so the paste figures below DO include that mass —
 * which is why the estimate caveat they carry no longer says otherwise. What survives is
 * evaporation, which no arithmetic can see: given a measurement the water figure absorbs
 * the whole difference and every portion below is exact arithmetic. A caller that supplies
 * no corrected basis still misses the solids, and falls back to the recipe's own water-only
 * paste exactly as before.
 */
export function PortionDilutionResults({
  dilution,
  weightUnit,
  targetMl,
  measuredPasteGrams,
  wholeBatchPasteGrams,
  cookWaterGrams,
  unknownLiquidGrams = 0,
  overDilutionCertain = false,
  dilutionMode = 'concentration',
  ratioNotAppliedYet = false,
}: PortionDilutionResultsProps) {
  const { measured, pasteAlreadyThinner, unmeasuredPasteAlreadyThinner, portion } =
    portionDilutionFor({
      dilution,
      targetMl,
      measuredPasteGrams,
      wholeBatchPasteGrams,
      cookWaterGrams,
    });
  // What the recipe predicted, for the drift readout. NOT portion.predictedPasteGrams:
  // that figure is anhydrous + max(0, totalWater - dilutionWater), and dilutionWater is
  // ZEROED by the targetExceedsPaste clamp — so predictedPasteGrams silently loses the
  // real cook water in that branch and understates the whole batch's paste (round 2's bug:
  // 100 g anhydrous + 150 g cook water reads as a 200 g predicted paste, not 250 g).
  // portion.wholeBatchPasteGrams is core's own clamp-free resolution of the SAME basis
  // measuredPasteRejectionFor resolves (wholeBatchPasteBasis) — using it here means the drift
  // note and the rejection thresholds can never quote two different "whole batch's paste"
  // figures for the same reading. Falls back to predictedPasteGrams itself when no
  // corrected basis was supplied (core's own fallback), so a no-split-liquid, non-clamped
  // recipe is unaffected.
  const driftGrams = portion?.pasteMeasured ? measured - portion.wholeBatchPasteGrams : 0;

  // Whether the paste really is thinner than the target is a claim about the recipe's
  // ASSUMED water content, so an alternative liquid with no declared % water makes it
  // unknowable — the same certainty test the shell's own over-dilution alert uses, and the
  // printed sheet with it. Without this, Custom amount scope stated the verdict flat while
  // the shell two paragraphs below said it could not be told: one panel, one state, two
  // opposite answers. Only the WORDING turns on this; pasteAlreadyThinner still suppresses
  // the portion either way, because the clamped figures it would be computed from are
  // unusable regardless of what the liquid turns out to contain.
  const overDilutionKnowable = unknownLiquidGrams === 0 || overDilutionCertain;
  // Both refusals below used to say "the target above" and "set a target", which names a
  // field ratio mode does not show — its inputs are the ratio, the measured paste and the
  // amount. See dilutionTargetWording for the full reasoning, including why an unapplied
  // ratio must not be named as the target these figures were computed against.
  const { named: dilutionTargetNamed, remedy: dilutionTargetRemedy } = dilutionTargetWording(
    dilutionMode,
    ratioNotAppliedYet,
  );
  return (
    <>
      {/* unmeasuredPasteAlreadyThinner rides this paragraph rather than earning one of its
          own: it says exactly what that case needs, down to the "weigh the whole batch's
          paste above" remedy, which is the one thing that can still size a portion here. It
          takes the KNOWABLE branch unconditionally — the two are mutually exclusive (see its
          own derivation), and unlike targetExceedsPaste it is not a water-derived claim at
          all: it compares solutionGrams against the pot's whole mass, and both are fixed
          however the undeclared liquid's water turns out to be split. */}
      {(pasteAlreadyThinner || unmeasuredPasteAlreadyThinner) &&
        (overDilutionKnowable || unmeasuredPasteAlreadyThinner ? (
          <p className="results-hint">
            The paste is already more dilute than {dilutionTargetNamed}, so there is no
            dilution water to divide up. {dilutionTargetRemedy} until the paste can reach it,
            or weigh the whole batch&apos;s paste above to size a portion from your
            measurement instead.
          </p>
        ) : (
          <p className="results-hint">
            No portion can be sized yet: {formatWeight(unknownLiquidGrams, weightUnit)} of
            alternative liquid has no declared water content, so how much dilution water
            there is to divide up — if any — is unknown. Declare its % water in Split liquid,
            or weigh the whole batch&apos;s paste above and size the portion from your
            measurement instead.
          </p>
        ))}
      {portion && (
        <>
          <dl className="results-grid">
            <div className="results-grid__item results-grid__item--primary">
              <dt>Water to add</dt>
              <dd>{formatWeight(portion.waterGrams, weightUnit)}</dd>
            </div>
            <div className="results-grid__item">
              <dt>Paste to weigh out</dt>
              <dd>{formatWeight(portion.pasteGrams, weightUnit)}</dd>
            </div>
            <div className="results-grid__item">
              <dt>Makes</dt>
              <dd>{Math.round(portion.volumeMl).toLocaleString('en-US')} ml</dd>
            </div>
            <div className="results-grid__item">
              <dt>Portion</dt>
              <dd>{Math.round(portion.fraction * 100)}% of the batch</dd>
            </div>
            <div className="results-grid__item">
              <dt>Water : paste</dt>
              {/* Below 0.1 a single decimal rounds a real water figure down to "0.0",
                  which reads as no water beside a nonzero water-to-add amount above.
                  A second decimal keeps that case legible; above 0.1 one decimal
                  already matches the reference's own ratio notation (1:1, 2:1, 3:1). */}
              <dd>
                {portion.waterPasteRatio < 0.1
                  ? portion.waterPasteRatio.toFixed(2)
                  : portion.waterPasteRatio.toFixed(1)} : 1
              </dd>
            </div>
          </dl>
          {/* One wording, because there is one kind of pot: the batch. This used to branch on
              the measured-paste declaration ("more than the remaining paste holds") — see
              lib/measuredPaste's MEASURED_PASTE_IS_REMAINING for where that control went. */}
          {portion.clamped && (
            <p className="results-hint">
              That is more than the batch holds — the figures above are the whole batch.
            </p>
          )}
          {portion.pasteMeasured ? (
            Math.abs(driftGrams) >= 1 && (
              <p className="results-hint">
                Your paste is {formatWeight(Math.abs(driftGrams), weightUnit)}{' '}
                {driftGrams < 0 ? 'lighter' : 'heavier'} than predicted
                {driftGrams < 0 ? ' — water lost to the cook' : ''}. Whole batch scope uses
                your measurement too, not just these figures.
              </p>
            )
          ) : (
            <p className="results-hint">
              {/* The solids half of this caveat had to go: "Paste to weigh out" now runs on
                  the corrected whole-batch pot, which counts an alternative liquid's
                  non-water solids, so telling the maker they are missing from the figure
                  directly above described the opposite of what it prints. Evaporation is
                  the half that survives — no arithmetic can see it — and it is the half
                  that makes weighing the fix. Left unconditional rather than branched on
                  whether a corrected basis was supplied: it is true either way, and a
                  clause about alternative liquids is noise on the many recipes that have
                  none. The solids correction itself is documented on this component and on
                  lsPartialDilution, where the next editor will look. */}
              Paste weight here is computed from the recipe, so treat it as an estimate: the
              cook boils off water the recipe still counts, and no figure on paper knows how
              much yours drove off. Weigh your paste and enter it above for exact figures.
            </p>
          )}
        </>
      )}
    </>
  );
}
