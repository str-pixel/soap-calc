import { lsPartialDilution, type DilutionResult } from '@soap-calc/core';
import { formatWeight, formatWeightWithAlternates } from '../lib/weightUnits';
import { measurementBelowSolids, measurementExceedsSolution } from '../lib/measuredPaste';
import type { WeightUnit } from '../lib/recipe';

type PartialDilutionProps = {
  dilution: DilutionResult | null;
  weightUnit: WeightUnit;
  /** Lifted to App beside the bottle size, so both snippets survive a collapse or a
   * process switch the same way. Neither belongs in the recipe: they are "what am I
   * making right now" decisions, not properties of the formula. */
  targetMl: string;
  onTargetMlChange: (value: string) => void;
  /** The maker's scale reading for the paste, in grams — the whole batch by default, or
   * what's left after earlier dilutions when `measuredPasteIsRemaining` is set. */
  measuredPasteGrams: string;
  onMeasuredPasteGramsChange: (value: string) => void;
  /** True when `measuredPasteGrams` is what's LEFT after part of the batch was already
   * diluted away, not the whole batch. "Lighter than predicted" has two indistinguishable
   * explanations — evaporation during the cook (same soap, less water) or part of the
   * batch already gone (composition unchanged, just less of it) — so the maker must say
   * which. Defaults to whole-batch so existing sessions are unaffected. */
  measuredPasteIsRemaining?: boolean;
  onMeasuredPasteIsRemainingChange?: (value: boolean) => void;
  /** The best-known WHOLE-BATCH paste mass (see useRecipeViewModel) — corrects the
   * recipe's own water-only predicted figure for an alternative liquid's non-water
   * solids, which are real mass sitting in the pot the recipe never counts. Used as the
   * ceiling/composition basis for a remaining-mode measurement in place of the
   * uncorrected figure when available, so core and this UI check agree. Falls back to the
   * recipe-computed figure when absent (a recipe with no split liquid, or data built
   * before this field existed). */
  wholeBatchPasteGrams?: number | null;
};

/**
 * Dilute only part of the batch. Paste keeps far better than diluted soap — it stores
 * sealed, refrigerates and freezes — so the common workflow is to cook one batch of paste
 * and draw it down over time. The batch figures above answer "dilute it all"; this answers
 * "make just this much now".
 *
 * The paste weight can be measured rather than computed, and should be: the reference
 * weighs it, noting its own tables are estimates "due to possible water evaporation during
 * the process". A computed paste is wrong in two directions at once — the cook boils off
 * water the recipe still counts, and an alternative liquid's non-water solids are mass the
 * recipe never counted. Given a measurement, the water figure absorbs the whole difference
 * and every portion below is exact arithmetic.
 */
export function PartialDilution({
  dilution,
  weightUnit,
  targetMl,
  onTargetMlChange,
  measuredPasteGrams,
  onMeasuredPasteGramsChange,
  measuredPasteIsRemaining = false,
  onMeasuredPasteIsRemainingChange,
  wholeBatchPasteGrams,
}: PartialDilutionProps) {
  if (dilution === null) return null;
  const hasMeasurement = measuredPasteGrams.trim() !== '';
  const measured = Number(measuredPasteGrams);
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
  // A batch's paste always contains ALL of its anhydrous soap — solids do not evaporate —
  // so a WHOLE-BATCH reading below that is not physically possible. It is a mis-tare (the
  // crock left on the scale) or a PORTION weight, and the reference's own ratio method does
  // weigh the portion, which makes the mistake an easy one. Left unguarded the app answered
  // with confident nonsense: a 900 g reading on a 1,200 g-soap batch reported "lighter than
  // predicted — water lost to the cook", which cannot be true of water that was never there.
  // The floor does not apply once the reading is declared REMAINING: what's left after an
  // earlier dilution can legitimately be less than the recipe's whole anhydrous soap — that
  // is the entire point of the declaration, and rejecting it left no way to enter an honest
  // measurement (the batch no longer exists at full weight to "enter instead").
  const pasteBelowSolids =
    !measuredPasteIsRemaining &&
    hasMeasurement &&
    Number.isFinite(measured) &&
    measured > 0 &&
    measurementBelowSolids(measured, dilution);
  // Likewise, a paste heavier than the whole target solution cannot be diluted INTO that
  // solution. Core returns null for it; saying so beats the figures silently vanishing.
  // Kept as-is for whole-batch mode — unaffected by the remaining-only ceiling below.
  const pasteExceedsSolution =
    hasMeasurement && Number.isFinite(measured) && measurementExceedsSolution(measured, dilution);
  // Review round 2, finding 2: a REMAINING reading cannot weigh more than the whole
  // batch's own paste ever did — solids and the water already in the paste don't appear
  // from nowhere. Left unguarded, a bogus reading (e.g. 3,000 g against a 1,700 g true
  // paste) scaled to a pot anhydrous bigger than the entire batch's own anhydrous soap:
  // physically impossible input, confidently wrong output. Checked against
  // wholeBatchPasteBasis (round 3's corrected figure, not the water-only
  // predictedPasteGrams — see its own comment above) so a legitimate remaining reading on
  // a split-liquid recipe isn't falsely rejected. Core rejects this too (returns null,
  // checked against the same basis via the wholeBatchPasteGrams param below), so the bad
  // value can never reach the arithmetic either way — this mirrors that guard at the UI
  // layer so the maker sees why, not just a vanished result.
  const pasteExceedsRemainingCeiling =
    measuredPasteIsRemaining &&
    hasMeasurement &&
    Number.isFinite(measured) &&
    measured > 0 &&
    measured > wholeBatchPasteBasis;
  const measurementRejected = pasteBelowSolids || pasteExceedsSolution || pasteExceedsRemainingCeiling;
  const hasValidMeasurement =
    hasMeasurement && Number.isFinite(measured) && measured > 0 && !measurementRejected;
  // targetExceedsPaste is computed from the recipe's ASSUMED cook water — exactly the
  // assumption a measured paste is evidence against (Task 5: a valid measurement outranks
  // the flag). With one, the paste IS recoverable — that's the whole point of weighing it —
  // so only refuse when there is NO valid measurement to fall back on. A rejected
  // measurement (below solids / exceeds solution) gets its own alert above instead of this
  // one, so it is excluded here too.
  const pasteAlreadyThinner =
    dilution.targetExceedsPaste && !hasValidMeasurement && !measurementRejected;
  const portion =
    pasteAlreadyThinner || measurementRejected
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
  // What the recipe predicted, for the drift readout: anhydrous + the water already in it.
  // Core already computes this internally (it's `pasteGrams`'s unmeasured branch), so it
  // is consumed from `portion` rather than re-derived here.
  const driftGrams = portion?.pasteMeasured ? measured - portion.predictedPasteGrams : 0;

  return (
    <details className="panel panel--nested">
      <summary className="panel__title">Dilute part of the batch</summary>
      <p className="panel__subtitle">
        Paste stores better than diluted soap — weigh out a portion and dilute just that.
      </p>
      <label className="field">
        {/* Grams regardless of the display unit: this is a scale reading the maker
            takes at the pot, and the core figures it feeds are all gram-based.
            "Whole batch" is load-bearing — the subtitle above talks about portions,
            and the reference's ratio method weighs the portion, so an unqualified
            label invites a portion weight and silently over-dilutes. Always shown,
            even when the target exceeds the recipe's ASSUMED cook water below: a
            measurement is exactly what can override that assumption (Task 5), so
            hiding the input would remove the only way out of the refusal. */}
        <span>Measured paste weight — whole batch (g, optional)</span>
        <input
          type="number"
          className="input input--number"
          min={1}
          step={10}
          value={measuredPasteGrams}
          onChange={(e) => onMeasuredPasteGramsChange(e.target.value)}
          aria-label="Measured paste weight — whole batch (g)"
        />
      </label>
      {/* "Lighter than predicted" has two indistinguishable explanations — evaporation
          during the cook (same soap, less water: MORE concentrated) or part of the batch
          already diluted away (composition unchanged, just less of it) — one number
          cannot tell them apart, so the maker must say which. Defaults to whole batch so
          existing behaviour (and existing sessions) are unchanged unless this is touched. */}
      <div
        className="dilution-mode-toggle"
        role="radiogroup"
        aria-label="What the measured paste weight represents"
      >
        <label className="field field--inline">
          <input
            type="radio"
            name="measuredPasteScope"
            checked={!measuredPasteIsRemaining}
            onChange={() => onMeasuredPasteIsRemainingChange?.(false)}
          />
          <span>the whole batch, before any dilution</span>
        </label>
        <label className="field field--inline">
          <input
            type="radio"
            name="measuredPasteScope"
            checked={measuredPasteIsRemaining}
            onChange={() => onMeasuredPasteIsRemainingChange?.(true)}
          />
          <span>what&apos;s left after earlier dilutions</span>
        </label>
      </div>
      <label className="field">
        <span>Amount to make (ml)</span>
        <input
          type="number"
          className="input input--number"
          min={1}
          step={10}
          value={targetMl}
          onChange={(e) => onTargetMlChange(e.target.value)}
          aria-label="Amount to make (ml)"
        />
      </label>
      {pasteBelowSolids && (
        <p className="results-hint" role="alert">
          That is less than the {formatWeight(dilution.anhydrousGrams, weightUnit)} of soap
          this batch makes, so it cannot be the whole batch&apos;s paste — check the scale
          was tared, and enter the whole batch rather than the portion you are diluting.
        </p>
      )}
      {pasteExceedsSolution && (
        <p className="results-hint" role="alert">
          Your paste already weighs more than the{' '}
          {formatWeight(dilution.solutionGrams, weightUnit)} this target dilutes to, so
          there is no water to add — raise the target concentration above, or check the
          measurement.
        </p>
      )}
      {pasteExceedsRemainingCeiling && (
        <p className="results-hint" role="alert">
          That is more than the {formatWeight(wholeBatchPasteBasis, weightUnit)} the whole
          batch&apos;s paste ever weighed, so it cannot be what is left of it — check the
          scale, or switch the declaration above to &quot;the whole batch, before any
          dilution&quot; if that is what you weighed.
        </p>
      )}
      {pasteAlreadyThinner && (
        <p className="results-hint">
          The paste is already more dilute than the target above, so there is no dilution
          water to divide up. Set a target the paste can actually reach, or weigh the whole
          batch&apos;s paste above to size a portion from your measurement instead.
        </p>
      )}
      {portion && (
        <>
          <dl className="results-grid">
            <div className="results-grid__item results-grid__item--primary">
              <dt>Water to add</dt>
              <dd>{formatWeightWithAlternates(portion.waterGrams, weightUnit)}</dd>
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
                {formatWeight(measured, weightUnit)} reading, assuming the paste&apos;s
                composition hasn&apos;t changed — not from the recipe&apos;s whole-batch
                figure. The batch row above still shows the recipe&apos;s own computed
                figures; a remaining-paste reading is not the batch.
              </p>
            ) : (
              Math.abs(driftGrams) >= 1 && (
                <p className="results-hint">
                  Your paste is {formatWeight(Math.abs(driftGrams), weightUnit)}{' '}
                  {driftGrams < 0 ? 'lighter' : 'heavier'} than predicted
                  {driftGrams < 0 ? ' — water lost to the cook' : ''}. The batch figures above
                  use your measurement too, not just these figures.
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
    </details>
  );
}
