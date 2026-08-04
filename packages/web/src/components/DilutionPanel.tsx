import { useEffect, useRef, useState } from 'react';
import {
  LS_DILUTION_TARGETS,
  LS_SOLUTION_DENSITY_G_PER_ML,
  lsConcentrationAboveAllMinimums,
  lsDilutionUsesFor,
  lsFinishedVolumeMl,
  type DilutionResult,
} from '@soap-calc/core';
import { formatConcentrationPercent } from '../lib/format';
import { DILUTION_UNIT_OPTIONS, formatWeight } from '../lib/weightUnits';
import {
  correctedDilutionWaterGrams,
  measuredPasteIsValidFor,
  parseMeasuredPasteGrams,
} from '../lib/measuredPaste';
import type { WeightUnit } from '../lib/recipe';
import { PortionDilutionResults } from './PortionDilutionResults';

export type DilutionMode = 'concentration' | 'ratio';

export type DilutionScope = 'batch' | 'portion';

type DilutionPanelProps = {
  dilution: DilutionResult | null;
  soapConcentrationPercent: string;
  onSoapConcentrationChange: (value: string) => void;
  weightUnit: WeightUnit;
  /** Water the recipe's alternative liquids already put in the paste. Deducted from the
   * dilution figure upstream; passed here only so the readout can say so. */
  altLiquidWaterGrams?: number;
  /** Grams of that liquid whose water content was never declared. Non-zero makes every
   * figure here a lower bound rather than a measurement. */
  unknownLiquidGrams?: number;
  /** The over-dilution verdict holds whatever the undeclared liquid contains, so it is
   * stated as fact rather than hedged. */
  overDilutionCertain?: boolean;
  /** The mass of finished product (solution base + additives, append-mode post-cook oil,
   * split-liquid solids — see computeBottledSolutionGrams). Shown as its own row when it
   * differs from the solution, and it is what the finished VOLUME is derived from. The
   * dilution figures themselves stay chemistry-only. */
  bottledSolutionGrams?: number | null;
  /** The paste's true water (lye water + split-liquid water) — see useRecipeViewModel's
   * cookWaterGrams. Ratio mode needs the real paste mass (anhydrousGrams + this), not
   * dilution.totalWaterGrams - dilutionWaterGrams, which the targetExceedsPaste clamp can
   * zero out. */
  cookWaterGrams?: number;
  /** Which way the maker is choosing the dilution: a target concentration (the default,
   * and what the reference calls out at LS:1536), or a water:paste ratio by weight
   * (LS:1534 — 1:1 / 2:1 / 3:1). Session-local UI state, not a recipe setting. */
  dilutionMode?: DilutionMode;
  onDilutionModeChange?: (mode: DilutionMode) => void;
  /** Water:paste ratio by weight, as typed (e.g. "2" for 2:1). */
  waterPasteRatio?: string;
  onWaterPasteRatioChange?: (value: string) => void;
  /** The maker's scale reading for the paste, in grams (same App state PortionDilutionResults
   * reads — see its doc comment). The reference weighs the paste precisely because a
   * computed figure cannot account for cook evaporation or an alternative liquid's
   * uncounted solids, so when this is present, declared as the WHOLE batch, and passes
   * PortionDilutionResults' own guards, it corrects the BATCH dilution water here too, not
   * just the portion below. */
  measuredPasteGrams?: string;
  /** True when `measuredPasteGrams` is what's LEFT after earlier dilutions rather than the
   * whole batch (see the declaration radios above). A remaining-paste reading describes a
   * smaller pot, not the batch — it must never correct this BATCH row, only the portion in
   * PortionDilutionResults. */
  measuredPasteIsRemaining?: boolean;
  onMeasuredPasteGramsChange?: (value: string) => void;
  onMeasuredPasteIsRemainingChange?: (value: boolean) => void;
  /** "Dilute it all" (the default, matching today's panel) vs. "make just this much now" —
   * a decision about the session, not the recipe. See App's own doc comment on the state
   * this drives. Optional/defaulted to 'batch' so every pre-existing caller (and test) that
   * predates the scope toggle keeps seeing exactly the batch panel it always has. */
  dilutionScope?: DilutionScope;
  onDilutionScopeChange?: (scope: DilutionScope) => void;
  /** Lives in App, not the recipe: it is a "what am I making right now" decision, not a
   * property of the formula. Only read when dilutionScope is 'portion'. */
  targetMl?: string;
  onTargetMlChange?: (value: string) => void;
  /** The best-known WHOLE-BATCH paste mass (see useRecipeViewModel) — passed straight
   * through to PortionDilutionResults, which needs it for the same corrected
   * ceiling/composition basis the batch row's own measured-paste guards use. */
  wholeBatchPasteGrams?: number | null;
};

export function DilutionPanel({
  dilution,
  soapConcentrationPercent,
  onSoapConcentrationChange,
  weightUnit,
  altLiquidWaterGrams = 0,
  unknownLiquidGrams = 0,
  overDilutionCertain = false,
  bottledSolutionGrams = null,
  cookWaterGrams = 0,
  dilutionMode = 'concentration',
  onDilutionModeChange,
  waterPasteRatio = '',
  onWaterPasteRatioChange,
  measuredPasteGrams,
  measuredPasteIsRemaining = false,
  onMeasuredPasteGramsChange,
  onMeasuredPasteIsRemainingChange,
  dilutionScope = 'batch',
  onDilutionScopeChange,
  targetMl = '',
  onTargetMlChange,
  wholeBatchPasteGrams,
}: DilutionPanelProps) {
  // Set only by the ratio input's own onChange below — never by mode entry — so the
  // write-back effect further down can require a real edit before touching the saved
  // target. See that effect's comment for the bug this guards against.
  const [ratioTouched, setRatioTouched] = useState(false);
  // Review round 2, finding 1: a touch from an EARLIER visit to ratio mode must not carry
  // forward — otherwise: edit the ratio once (writes back, say 25%); switch to
  // concentration mode and type an exact target directly (say 40%); switch back to ratio
  // mode WITHOUT touching the ratio field again — the write-back effect's
  // `ratioTouched && dilutionMode === 'ratio'` guard was still satisfied by the earlier
  // touch, so it fired on re-entry alone and silently reverted the typed 40% back to 25%,
  // with no visual difference and no undo. Resetting on every mode change means each entry
  // into ratio mode needs its own explicit edit before anything is written again.
  useEffect(() => {
    setRatioTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dilutionMode]);
  // Which intended uses the current target suits — the dilution figure is the one number
  // with no chemistry to pin it, so the guidance is by product, not by recipe.
  const suitedUses = lsDilutionUsesFor(Number(soapConcentrationPercent));
  // Same guards PortionDilutionResults applies to the identical measurement: below the anhydrous
  // soap it cannot be a whole-batch paste, above the target solution there is no water left
  // to add. Both accept the boundary. A measured paste that survives these WINS over the
  // computed figures below — see the "measured paste" hint on the batch row, and the ratio
  // pasteGrams override just below. measuredPasteIsRemaining forces this false regardless
  // of the measurement's own value: a remaining-paste reading is not the batch.
  const measuredPasteValid =
    dilution !== null && measuredPasteIsValidFor(measuredPasteGrams, dilution, measuredPasteIsRemaining);
  // Only meaningful when measuredPasteValid — parseMeasuredPasteGrams then always succeeds.
  const measuredPasteNum = parseMeasuredPasteGrams(measuredPasteGrams) ?? NaN;
  // Ratio mode (LS:1534): weigh the paste, then add water at 1:1 / 2:1 / 3:1 by weight.
  // Prefer a valid MEASURED paste — the reference's ratio method is applied to a weighed
  // paste. Otherwise pasteGrams is anhydrousGrams + the paste's TRUE water — not
  // dilution.totalWaterGrams - dilutionWaterGrams, which the targetExceedsPaste clamp on
  // dilutionWaterGrams can zero out (see DilutionPanelProps.cookWaterGrams and
  // PortionDilutionResults' identical trap).
  const ratioNum = Number(waterPasteRatio);
  const ratioValid = Number.isFinite(ratioNum) && ratioNum > 0;
  const pasteGrams = dilution
    ? measuredPasteValid
      ? measuredPasteNum
      : dilution.anhydrousGrams + cookWaterGrams
    : null;
  const ratioWaterGrams =
    dilution && pasteGrams !== null && ratioValid ? pasteGrams * ratioNum : null;
  const ratioSolutionGrams =
    pasteGrams !== null && ratioWaterGrams !== null ? pasteGrams + ratioWaterGrams : null;
  // The true derived concentration — shown as-is in the "lands at" readout below, however
  // extreme, so the panel never lies about what the ratio implies.
  const ratioConcentrationPercent =
    dilution && ratioSolutionGrams !== null && ratioSolutionGrams > 0
      ? (dilution.anhydrousGrams / ratioSolutionGrams) * 100
      : null;
  const roundedRatioConcentrationPercent =
    ratioConcentrationPercent !== null ? Math.round(ratioConcentrationPercent * 10) / 10 : null;
  // calculateDilution only accepts (0, 100) exclusive (see the concentration field's own
  // min={1} max={99}). An extreme ratio can round the true value to 0.0 or 100.0 — writing
  // THAT back would send `dilution` upstream to null, which vanishes this entire ratio UI
  // (it is gated on `dilution`) with no way to recover except switching modes. Clamping
  // what gets WRITTEN — never the readout above, which keeps telling the truth — keeps a
  // legal concentration flowing at all times.
  const clampedRatioConcentrationPercent =
    roundedRatioConcentrationPercent !== null
      ? Math.min(99, Math.max(1, roundedRatioConcentrationPercent))
      : null;
  const ratioWriteBackClamped =
    roundedRatioConcentrationPercent !== null &&
    clampedRatioConcentrationPercent !== roundedRatioConcentrationPercent;
  // The ratio is an alternative way to CHOOSE the concentration, not a parallel result:
  // vm.dilution, PortionDilutionResults and the printed BatchSheet all read the
  // persisted concentration, so without this write-back the app would show the ratio's own
  // water figure here beside a different figure everywhere else. soapConcentrationPercent IS
  // a dep (despite being what this writes) so an EXTERNAL change to it — opening a recipe
  // file while ratio mode is active, which can replace the target without touching
  // dilutionMode/waterPasteRatio/cookWaterGrams — still re-syncs: otherwise the imported
  // value would sit on screen while this panel's own "lands at X% soap" readout kept
  // speaking of the old ratio-derived number. This does NOT reintroduce a write loop:
  // clampedRatioConcentrationPercent is computed from the ratio inputs and dilution alone,
  // never from soapConcentrationPercent, so re-running this effect after ITS OWN write
  // always recomputes the identical string and calls onSoapConcentrationChange with a
  // no-op value — React bails out of re-rendering on an unchanged state value, so the
  // dependency does not cycle. onSoapConcentrationChange itself stays excluded (a fresh
  // function every render, unrelated to the derived value).
  //
  // Gated on ratioTouched: App seeds waterPasteRatio to a default ('2') that exists before
  // the maker has ever looked at ratio mode, so entering it (or leaving and re-entering)
  // with no edit used to fire this write-back anyway — silently rewriting a saved target
  // that came from opening a recipe file, with no undo (undo/redo only wraps oil-line
  // edits) and no visual difference from a figure the maker actually typed. Requiring an
  // explicit edit to the ratio input first (see its onChange below) makes entering and
  // leaving ratio mode alone a no-op, while a real edit still writes back exactly as
  // before — including the external-resync behavior described above, since ratioTouched
  // stays true once set.
  useEffect(() => {
    if (ratioTouched && dilutionMode === 'ratio' && clampedRatioConcentrationPercent !== null) {
      onSoapConcentrationChange(String(clampedRatioConcentrationPercent));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratioTouched, dilutionMode, clampedRatioConcentrationPercent, soapConcentrationPercent]);
  // The measurement corrects the BATCH figure the same way it already corrects the portion
  // in PortionDilutionResults — shared with the printed BatchSheet so both surfaces always agree.
  const batchDilutionWaterGrams = dilution
    ? correctedDilutionWaterGrams(dilution, measuredPasteGrams, measuredPasteIsRemaining)
    : 0;
  const bottledGrams = bottledSolutionGrams ?? dilution?.solutionGrams ?? null;
  // Every other figure here is mass. Volume is what tells a maker whether their dilution
  // vessel and packaging are big enough — so the density bridge is shown here rather than
  // left implicit.
  const finishedVolumeMl = bottledGrams !== null ? lsFinishedVolumeMl(bottledGrams) : null;
  // Show the product mass whenever it differs from the solution row, so the finished
  // VOLUME below (derived from it, not from the solution) reconciles with what is above it.
  const showBottledRow =
    dilution !== null && bottledGrams !== null && bottledGrams > dilution.solutionGrams + 0.5;
  // A reading aid, not a setting: the maker flips this to match whatever scale is on the
  // bench without disturbing the app-wide unit every other panel uses. Seeded from that
  // unit so the panel opens consistent with the rest of the app, and re-seeded when it
  // changes — same prevRef pattern App already uses for the mold-sizer bar weight, which
  // would otherwise strand this switch on a unit the maker has since moved away from.
  const seedUnit = (u: WeightUnit): WeightUnit => (u === 'kg' ? 'g' : u);
  const [displayUnit, setDisplayUnit] = useState<WeightUnit>(() => seedUnit(weightUnit));
  const prevWeightUnitRef = useRef(weightUnit);
  useEffect(() => {
    if (prevWeightUnitRef.current === weightUnit) return;
    prevWeightUnitRef.current = weightUnit;
    setDisplayUnit(seedUnit(weightUnit));
  }, [weightUnit]);
  return (
    <section className="panel panel--nested">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Dilution</h2>
          <p className="panel__subtitle">Water to add to reach a target soap concentration</p>
        </div>
        <div className="dilution-mode-toggle" role="radiogroup" aria-label="Dilution display unit">
          {DILUTION_UNIT_OPTIONS.map((option) => (
            <label className="field field--inline" key={option.id}>
              <input
                type="radio"
                name="dilutionDisplayUnit"
                checked={displayUnit === option.id}
                onChange={() => setDisplayUnit(option.id)}
              />
              <span>{option.short}</span>
            </label>
          ))}
        </div>
      </div>
      {/* Two ways to choose the same number (LS:1534 ratio vs. LS:1536 concentration) —
          concentration is the default, and switching never clears the other mode's input,
          since each is its own bit of App state. */}
      <div className="dilution-mode-toggle" role="radiogroup" aria-label="Dilution input mode">
        <label className="field field--inline">
          <input
            type="radio"
            name="dilutionMode"
            checked={dilutionMode === 'concentration'}
            onChange={() => onDilutionModeChange?.('concentration')}
          />
          <span>Target concentration</span>
        </label>
        <label className="field field--inline">
          <input
            type="radio"
            name="dilutionMode"
            checked={dilutionMode === 'ratio'}
            onChange={() => onDilutionModeChange?.('ratio')}
          />
          <span>Water : paste ratio</span>
        </label>
      </div>
      {dilutionMode === 'ratio' ? (
        <label className="field">
          <span>Water : paste ratio (by weight)</span>
          <input
            type="number"
            className="input input--number"
            min={0.5}
            step={0.5}
            value={waterPasteRatio}
            onChange={(e) => {
              setRatioTouched(true);
              onWaterPasteRatioChange?.(e.target.value);
            }}
            aria-label="Water to paste ratio"
          />
        </label>
      ) : (
        <label className="field">
          <span>Target soap concentration (%)</span>
          <input
            type="number"
            className="input input--number"
            min={1}
            max={99}
            step={1}
            value={soapConcentrationPercent}
            onChange={(e) => onSoapConcentrationChange(e.target.value)}
            aria-label="Target soap concentration percent"
          />
        </label>
      )}
      <label className="field">
        {/* Grams regardless of the display unit: this is a scale reading the maker takes at
            the pot, and the core figures it feeds are all gram-based. Always shown, even when
            the target exceeds the recipe's ASSUMED cook water: a measurement is exactly what
            can override that assumption, so hiding the input would remove the only way out of
            the refusal. */}
        <span>Measured paste weight (g, optional)</span>
        <input
          type="number"
          className="input input--number"
          min={1}
          step={10}
          value={measuredPasteGrams ?? ''}
          onChange={(e) => onMeasuredPasteGramsChange?.(e.target.value)}
          aria-label="Measured paste weight (g)"
        />
      </label>
      {/* "Lighter than predicted" has two indistinguishable explanations — evaporation during
          the cook (same soap, less water: MORE concentrated) or part of the batch already
          diluted away (composition unchanged, just less of it) — one number cannot tell them
          apart, so the maker must say which. Deliberately NOT worded "whole batch": the scope
          toggle below already owns that phrase, and two controls reading alike is how a maker
          picks the wrong one. */}
      <div className="dilution-mode-toggle" role="radiogroup" aria-label="What the measured paste weight represents">
        <label className="field field--inline">
          <input
            type="radio"
            name="measuredPasteScope"
            checked={!measuredPasteIsRemaining}
            onChange={() => onMeasuredPasteIsRemainingChange?.(false)}
          />
          <span>all of it</span>
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
      {/* Paste stores better than diluted soap — it keeps sealed, refrigerates and freezes —
          so the common workflow is to cook one batch and draw it down over time. Whole batch
          answers "dilute it all"; custom amount answers "make just this much now". */}
      <div className="dilution-mode-toggle" role="radiogroup" aria-label="How much of the batch to dilute">
        <label className="field field--inline">
          <input
            type="radio"
            name="dilutionScope"
            checked={dilutionScope === 'batch'}
            onChange={() => onDilutionScopeChange?.('batch')}
          />
          <span>Whole batch</span>
        </label>
        <label className="field field--inline">
          <input
            type="radio"
            name="dilutionScope"
            checked={dilutionScope === 'portion'}
            onChange={() => onDilutionScopeChange?.('portion')}
          />
          <span>Custom amount</span>
        </label>
      </div>
      {dilutionScope === 'portion' && (
        <label className="field">
          <span>Amount to make (ml)</span>
          <input
            type="number"
            className="input input--number"
            min={1}
            step={10}
            value={targetMl}
            onChange={(e) => onTargetMlChange?.(e.target.value)}
            aria-label="Amount to make (ml)"
          />
        </label>
      )}
      {dilutionMode === 'ratio' && !ratioValid && (
        <p className="results-hint">
          Enter a water:paste ratio greater than zero (e.g. 2 for 2:1) to see the water this
          adds.
        </p>
      )}
      {dilutionMode === 'ratio' && ratioConcentrationPercent !== null && ratioWaterGrams !== null && (
        <dl className="results-grid">
          <div className="results-grid__item results-grid__item--primary">
            <dt>Water to add at this ratio</dt>
            <dd>{formatWeight(ratioWaterGrams, displayUnit)}</dd>
          </div>
        </dl>
      )}
      {dilutionMode === 'ratio' && ratioConcentrationPercent !== null && (
        <p className="results-hint">
          <strong>
            {waterPasteRatio}:1 water:paste lands at{' '}
            {formatConcentrationPercent(ratioConcentrationPercent)}% soap.
          </strong>
        </p>
      )}
      {dilutionMode === 'ratio' &&
        ratioWriteBackClamped &&
        roundedRatioConcentrationPercent !== null &&
        clampedRatioConcentrationPercent !== null && (
          <p className="results-hint" role="alert">
            At {waterPasteRatio}:1 this ratio implies{' '}
            {formatConcentrationPercent(roundedRatioConcentrationPercent)}% soap — outside the
            1–99% range the calculator can target, so{' '}
            {formatConcentrationPercent(clampedRatioConcentrationPercent)}% is used instead.{' '}
            {roundedRatioConcentrationPercent < 1
              ? 'Lower the ratio (less water) to land inside that range directly.'
              : 'Raise the ratio (more water) to land inside that range directly.'}
          </p>
        )}
      {dilution ? (
        <>
          {dilutionScope === 'batch' ? (
            <>
              <dl className="results-grid">
                {/* Ratio mode's own block above already owns the water-to-add figure ("Water to
                    add at this ratio"). This row reads whatever concentration is currently
                    PERSISTED — the write-back only narrows toward the ratio's figure, closing to
                    within 0.1% at best, and can diverge by orders of magnitude once the 1-99%
                    clamp kicks in — so showing both bare water figures at once would leave the
                    maker guessing which one to actually pour. Suppress this row in ratio mode and
                    let the ratio block be the sole source for that number; every other row here
                    (paste, solution, total water, glycerin, volume) still reflects the applied
                    concentration and carries no such competing figure. */}
                {dilutionMode !== 'ratio' && (
                  <div className="results-grid__item results-grid__item--primary">
                    <dt>Dilution water to add</dt>
                    <dd>{formatWeight(batchDilutionWaterGrams, displayUnit)}</dd>
                  </div>
                )}
                <div className="results-grid__item">
                  <dt>Paste (anhydrous)</dt>
                  <dd>{formatWeight(dilution.anhydrousGrams, displayUnit)}</dd>
                </div>
                <div className="results-grid__item">
                  <dt>Finished solution</dt>
                  <dd>{formatWeight(dilution.solutionGrams, displayUnit)}</dd>
                </div>
                <div className="results-grid__item">
                  <dt>Total water</dt>
                  <dd>{formatWeight(dilution.totalWaterGrams, displayUnit)}</dd>
                </div>
                <div className="results-grid__item">
                  <dt>Glycerin (retained)</dt>
                  <dd>{formatWeight(dilution.glycerinGrams, displayUnit)}</dd>
                </div>
                {showBottledRow && bottledGrams !== null && (
                  <div className="results-grid__item">
                    <dt>≈ Finished product</dt>
                    <dd>{formatWeight(bottledGrams, displayUnit)}</dd>
                  </div>
                )}
                {finishedVolumeMl !== null && (
                  <div className="results-grid__item">
                    <dt>≈ Finished volume</dt>
                    <dd>{Math.round(finishedVolumeMl).toLocaleString('en-US')} ml</dd>
                  </div>
                )}
              </dl>
              {measuredPasteValid && (
                <p className="results-hint">
                  {/* Named explicitly rather than positionally: in ratio mode the main grid's
                      own "Dilution water to add" row is suppressed (see just above), so
                      "above" would land on Total water/Glycerin instead — neither of which is
                      measurement-corrected. Ratio mode's own water figure IS corrected (its
                      pasteGrams already prefers a valid measurement), so name that row there. */}
                  {dilutionMode === 'ratio' ? 'Water to add at this ratio' : 'Dilution water'} above
                  uses your measured paste ({formatWeight(measuredPasteNum, displayUnit)}
                  ), not the recipe&apos;s computed paste — the cook evaporates water the recipe still
                  counts, and an alternative liquid&apos;s solids are mass it never counted, so the
                  measurement is more accurate.
                </p>
              )}
            </>
          ) : (
            <PortionDilutionResults
              dilution={dilution}
              weightUnit={displayUnit}
              targetMl={targetMl}
              measuredPasteGrams={measuredPasteGrams ?? ''}
              measuredPasteIsRemaining={measuredPasteIsRemaining}
              wholeBatchPasteGrams={wholeBatchPasteGrams}
            />
          )}
          {/* LS:1531 — shown regardless of which figure (concentration or ratio) the maker
              started from, since the swelling and absorbing it describes happens either way. */}
          <p className="results-hint">
            Whichever figure you start from, add the water in stages: enough to cover the paste,
            then more in small amounts, and give it time between — the paste swells and keeps
            absorbing. Recording where you stopped makes the next batch of the same recipe exact.
          </p>
          {finishedVolumeMl !== null && (
            <p className="results-hint">
              Volume assumes ~{LS_SOLUTION_DENSITY_G_PER_ML} g/ml — a planning figure, not
              a measured density. Weigh a known volume of your own solution if it has to be
              exact.
            </p>
          )}
          {dilutionScope === 'batch' && (
            <>
              {/* targetExceedsPaste is computed from the recipe's ASSUMED cook water — exactly
                  the assumption a measured paste is evidence against (that's the whole reason
                  the reference weighs the paste: the computed figure can't see evaporation). A
                  valid measurement outranks the flag, so suppress this alert rather than assert
                  "already more dilute" beside a water figure the measurement just produced. */}
              {dilution.targetExceedsPaste &&
                !measuredPasteValid &&
                (unknownLiquidGrams === 0 || overDilutionCertain) && (
                  <p className="results-hint" role="alert">
                    The paste is already more dilute than {formatConcentrationPercent(dilution.soapConcentrationPercent)}% — adding water
                    only lowers the concentration further.
                  </p>
                )}
              {dilution.targetExceedsPaste && unknownLiquidGrams > 0 && !overDilutionCertain && (
                // Suppressed, not reworded: targetExceedsPaste is a factual claim about the
                // paste, and it was derived from an ASSUMED water content. Asserting it can tell
                // the user a batch is finished when it still needs hundreds of grams of water.
                <p className="results-hint">
                  Can&apos;t tell whether {formatConcentrationPercent(dilution.soapConcentrationPercent)}% is reachable —{' '}
                  {formatWeight(unknownLiquidGrams, displayUnit)} of alternative liquid has no
                  declared water content. Declare its % water in Split liquid.
                </p>
              )}
              {altLiquidWaterGrams > 0 && unknownLiquidGrams === 0 && (
                <p className="results-hint">
                  Already {formatWeight(altLiquidWaterGrams, displayUnit)} lighter: that much
                  water came in with the alternative liquid and is counted as part of the paste.
                  Top up with plain distilled water only.
                </p>
              )}
              {/* Floor hint only when a positive floor exists. When the target already exceeds the
                  paste, the can't-tell / certain-alert branches above own the message — rendering
                  this too repeated "declare its % water" verbatim and printed a vacuous
                  "0 g is the LEAST you will need". */}
              {altLiquidWaterGrams > 0 && unknownLiquidGrams > 0 && !dilution.targetExceedsPaste && (
                <p className="results-hint">
                  {formatWeight(unknownLiquidGrams, displayUnit)} of alternative liquid has no
                  declared water content — it is counted as all water, so{' '}
                  {formatWeight(dilution.dilutionWaterGrams, displayUnit)} is the LEAST you will
                  need. Declare its % water, or dilute in increments and check by weight.
                </p>
              )}
            </>
          )}
          <p className="results-hint">
            Minimum dilution is a property of the recipe, not the product: coconut-heavy soaps
            hold up to ~40% soap, most blends 25–35%, castile ~25%. Past that the soap thickens
            or sets.
            {lsConcentrationAboveAllMinimums(Number(soapConcentrationPercent))
              ? ' This target is above what even a coconut-heavy recipe holds as a liquid.'
              : ''}
          </p>
          <details className="results-hint dilution-uses">
            <summary>
              {suitedUses.length > 0
                ? `At ${formatConcentrationPercent(dilution.soapConcentrationPercent)}% this suits ${suitedUses
                    .map((u) => u.label.toLowerCase())
                    .join(', ')}`
                : `No common use calls for ${formatConcentrationPercent(dilution.soapConcentrationPercent)}% — see the usual targets`}
            </summary>
            <dl className="dilution-uses__list">
              {LS_DILUTION_TARGETS.map((t) => (
                <div
                  key={t.key}
                  className={
                    suitedUses.some((u) => u.key === t.key)
                      ? 'dilution-uses__row dilution-uses__row--match'
                      : 'dilution-uses__row'
                  }
                >
                  <dt>{t.label}</dt>
                  <dd>
                    {t.low === t.high ? `${t.low}%` : `${t.low}–${t.high}%`} soap
                    {t.note ? <span className="results-excluded"> {t.note}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
            <p>
              Diluting further and thickening with salt is the cheaper way to a thick soap —
              water costs a fraction of what the oils did. Not recommended for hair.
            </p>
          </details>
        </>
      ) : (
        <p className="results-hint">Enter oils and a target concentration (1–99%) to compute dilution.</p>
      )}
    </section>
  );
}
