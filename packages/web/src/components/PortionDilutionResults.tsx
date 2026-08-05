import { lsPartialDilution, type DilutionResult } from '@soap-calc/core';
import { formatWeight } from '../lib/weightUnits';
import { measuredPasteRejectionFor } from '../lib/measuredPaste';
import type { WeightUnit } from '../lib/recipe';

type PortionDilutionResultsProps = {
  dilution: DilutionResult;
  weightUnit: WeightUnit;
  /** Lives in App, not the recipe: it is a "what am I making right now" decision, not a
   * property of the formula. */
  targetMl: string;
  /** The maker's scale reading for the paste, in grams — the whole batch by default, or
   * what's left after earlier dilutions when `measuredPasteIsRemaining` is set. */
  measuredPasteGrams: string;
  /** True when `measuredPasteGrams` is what's LEFT after part of the batch was already
   * diluted away, not the whole batch. "Lighter than predicted" has two indistinguishable
   * explanations — evaporation during the cook (same soap, less water) or part of the
   * batch already gone (composition unchanged, just less of it) — so the maker must say
   * which. Defaults to whole-batch so existing sessions are unaffected. */
  measuredPasteIsRemaining: boolean;
  /** The best-known WHOLE-BATCH paste mass (see useRecipeViewModel) — corrects the
   * recipe's own water-only predicted figure for an alternative liquid's non-water
   * solids, which are real mass sitting in the pot the recipe never counts. Used as the
   * ceiling/composition basis for a remaining-mode measurement in place of the
   * uncorrected figure when available, so core and this UI check agree. Falls back to the
   * recipe-computed figure when absent (a recipe with no split liquid, or data built
   * before this field existed). */
  wholeBatchPasteGrams?: number | null;
  /** Grams of alternative liquid whose water content was never declared. Forwarded from
   * DilutionPanel (which gets it from App) for one reason only: targetExceedsPaste is
   * derived from the recipe's ASSUMED water content, so above zero the over-dilution
   * verdict is not knowable and must not be stated as fact — the shell and the printed
   * sheet already gate the identical sentence this way. */
  unknownLiquidGrams?: number;
  /** True when the over-dilution verdict holds across the undeclared liquid's whole
   * 0–100% water range, so it can be stated as fact after all. */
  overDilutionCertain?: boolean;
};

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
  measuredPasteIsRemaining,
  wholeBatchPasteGrams,
}: Pick<
  PortionDilutionResultsProps,
  'dilution' | 'targetMl' | 'measuredPasteGrams' | 'measuredPasteIsRemaining' | 'wholeBatchPasteGrams'
>) {
  // The three physical-impossibility rules — below the anhydrous solids, heavier than the
  // target solution, a remainder heavier than the whole batch ever was — live in
  // lib/measuredPaste, together with the long record of the bug each one closed. The
  // measured-paste INPUT is in DilutionPanel's shell, where it is visible in BOTH dilution
  // scopes, and so are the alerts that reject a reading: this component only renders in
  // Custom amount scope, so alerts kept here were unreachable in the default one. Reading
  // the verdict from the same helper the shell uses means the two can never disagree about
  // whether a reading is usable.
  const rejection = measuredPasteRejectionFor(
    measuredPasteGrams,
    dilution,
    measuredPasteIsRemaining,
    wholeBatchPasteGrams,
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
  // lsPartialDilution has a feasibility test of its own that none of the rules above can
  // see: it returns null whenever the pot's paste already weighs more than the solution
  // that pot's own soap makes at the target (ls-yield's `potSolutionGrams - pasteGrams <
  // 0`). The three rejection rules bound the READING against whole-batch figures; this
  // depends on the RECIPE, so a reading all three accept can still land here — and
  // pasteAlreadyThinner cannot cover it, because that flag requires there to be NO valid
  // measurement. Both render branches then went false and this component emitted an empty
  // fragment: no figures, no alert, nothing saying why. Reachable two ways, both with an
  // accepted "what's left" reading: a split liquid's non-water solids can make the true
  // whole-batch paste heavier than the target solution while the recipe's own
  // targetExceedsPaste flag (computed from water alone) stays false, and a set
  // targetExceedsPaste is itself exactly that condition.
  //
  // Re-derived with core's own expressions, in core's own order, off the same basis
  // (wholeBatchPasteBasis resolves identically to core's wholeBatchPasteGrams — same
  // preference, same predictedPasteGrams fallback), so the two can never disagree about
  // which side of zero this falls on. Nothing any guard computes changes: adding it to the
  // suppression below only names a null core was already going to return.
  const potSolutionGrams =
    hasValidMeasurement && measuredPasteIsRemaining
      ? measured *
        (dilution.anhydrousGrams / rejection.wholeBatchPasteBasis) *
        (dilution.solutionGrams / dilution.anhydrousGrams)
      : dilution.solutionGrams;
  const measuredPasteAlreadyThinner = hasValidMeasurement && potSolutionGrams - measured < 0;
  const portion =
    pasteAlreadyThinner || measurementRejected || measuredPasteAlreadyThinner
      ? null
      : lsPartialDilution(
          {
            ...dilution,
            measuredPasteGrams: hasValidMeasurement ? measured : undefined,
            measuredPasteIsRemaining: hasValidMeasurement ? measuredPasteIsRemaining : undefined,
            // Same corrected basis the UI's own ceiling check above uses, so core's
            // composition ratio and this component's rejection never disagree.
            wholeBatchPasteGrams: wholeBatchPasteGrams ?? undefined,
          },
          Number(targetMl),
        );
  return { measured, pasteAlreadyThinner, measuredPasteAlreadyThinner, portion };
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
 * particular cook drove off (LS:2172). A computed paste is wrong in two directions at once
 * — the cook boils off water the recipe still counts, and an alternative liquid's non-water
 * solids are mass the recipe never counted. Given a measurement, the water figure absorbs
 * the whole difference and every portion below is exact arithmetic.
 */
export function PortionDilutionResults({
  dilution,
  weightUnit,
  targetMl,
  measuredPasteGrams,
  measuredPasteIsRemaining,
  wholeBatchPasteGrams,
  unknownLiquidGrams = 0,
  overDilutionCertain = false,
}: PortionDilutionResultsProps) {
  const { measured, pasteAlreadyThinner, measuredPasteAlreadyThinner, portion } = portionDilutionFor({
    dilution,
    targetMl,
    measuredPasteGrams,
    measuredPasteIsRemaining,
    wholeBatchPasteGrams,
  });
  // What the recipe predicted, for the drift readout. NOT portion.predictedPasteGrams:
  // that figure is anhydrous + max(0, totalWater - dilutionWater), and dilutionWater is
  // ZEROED by the targetExceedsPaste clamp — so predictedPasteGrams silently loses the
  // real cook water in that branch and understates the whole batch's paste (round 2's bug:
  // 100 g anhydrous + 150 g cook water reads as a 200 g predicted paste, not 250 g).
  // portion.wholeBatchPasteGrams is core's own clamp-free resolution of the SAME basis the
  // remaining-mode ceiling above already checks against (wholeBatchPasteBasis) — using it
  // here means the drift note and the ceiling can never quote two different "whole batch's
  // paste" figures for the same reading. Falls back to predictedPasteGrams itself when no
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
  return (
    <>
      {pasteAlreadyThinner &&
        (overDilutionKnowable ? (
          <p className="results-hint">
            The paste is already more dilute than the target above, so there is no dilution
            water to divide up. Set a target the paste can actually reach, or weigh the whole
            batch&apos;s paste above to size a portion from your measurement instead.
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
      {/* The other half of "a suppressed portion always says why" — see
          measuredPasteAlreadyThinner's own derivation above. Deliberately not a
          role="alert": nothing about the reading is impossible, so it is not a rejection.
          The paste is simply past the target already, which is a fact about the recipe and
          the target, not a mistake at the scale. Mutually exclusive with the paragraph
          above (that one requires no valid measurement; this one requires one). */}
      {measuredPasteAlreadyThinner && (
        <p className="results-hint">
          The paste your reading describes is already more dilute than the target above:
          the soap in it makes less solution at that target than the paste itself weighs,
          so there is no dilution water to divide up. Set a target it can reach, or
          re-check the reading.
        </p>
      )}
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
          {portion.clamped && (
            <p className="results-hint">
              {measuredPasteIsRemaining
                ? "That is more than the remaining paste holds — the figures above use all of it."
                : 'That is more than the batch holds — the figures above are the whole batch.'}
            </p>
          )}
          {portion.pasteMeasured ? (
            measuredPasteIsRemaining ? (
              <p className="results-hint">
                Treated as what&apos;s left after earlier dilutions: this portion&apos;s
                anhydrous soap is scaled down from your{' '}
                {/* Grams, not weightUnit: the measured-paste field in DilutionPanel's shell
                    is grams-only, and its own rejection alerts already hardcode grams for
                    this reason. Every other figure here is a bench readout and follows the
                    display unit; this one is the maker's own typed entry echoed back. */}
                {formatWeight(measured, 'g')} reading, assuming the paste&apos;s
                composition hasn&apos;t changed — not from the recipe&apos;s whole-batch
                figure. Switch to Whole batch to see the recipe&apos;s own computed
                figures — a remaining-paste reading is not the batch.
              </p>
            ) : (
              Math.abs(driftGrams) >= 1 && (
                <p className="results-hint">
                  Your paste is {formatWeight(Math.abs(driftGrams), weightUnit)}{' '}
                  {driftGrams < 0 ? 'lighter' : 'heavier'} than predicted
                  {driftGrams < 0 ? ' — water lost to the cook' : ''}. Whole batch scope uses
                  your measurement too, not just these figures.
                </p>
              )
            )
          ) : (
            <p className="results-hint">
              Paste weight here is computed from the recipe, so treat it as an estimate:
              the cook evaporates water the recipe still counts, and an alternative
              liquid&apos;s solids are mass it never counted. Weigh your paste and enter
              it above for exact figures.
            </p>
          )}
        </>
      )}
    </>
  );
}
