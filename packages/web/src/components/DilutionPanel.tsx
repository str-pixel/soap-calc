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
  measuredPasteRejectionFor,
  parseMeasuredPasteGrams,
} from '../lib/measuredPaste';
import type { WeightUnit } from '../lib/recipe';
import {
  PortionDilutionResults,
  dilutionTargetWording,
  portionDilutionFor,
} from './PortionDilutionResults';

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
   * reads — see its doc comment). The reference weighs the paste precisely because no
   * computed figure can account for the water a particular cook drove off, so when this is
   * present, declared as the WHOLE batch, and passes PortionDilutionResults' own guards, it
   * corrects the BATCH dilution water here too, not just the portion below. (An alternative
   * liquid's uncounted solids were the other half of that reason until `wholeBatchPasteGrams`
   * started carrying them into the computed paste — the fifth site of a clause this branch
   * made stale, and the only developer-facing one.) */
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
  // The measured-paste INPUT lives in this shell and is visible in BOTH scopes, so its
  // feedback has to be here too: the three rejection alerts used to render only inside
  // PortionDilutionResults, which appears in Custom amount scope alone — leaving the
  // DEFAULT scope with a physically impossible reading on screen, no alert, and a dilution
  // figure that had silently ignored it. Same helper PortionDilutionResults reads, so the
  // panel and the portion figures can never disagree about whether a reading is usable.
  const measurementRejection = dilution
    ? measuredPasteRejectionFor(
        measuredPasteGrams,
        dilution,
        measuredPasteIsRemaining,
        wholeBatchPasteGrams,
      )
    : null;
  // A remaining-paste reading is legitimate and still does not move the batch row (see
  // measuredPasteIsValidFor's own isRemaining gate) — the row answers for the recipe's
  // whole batch, which that reading is not. Say so rather than leaving the declaration
  // apparently ignored; suppressed when a rejection alert is already explaining the
  // reading, so only one explanation is on screen at a time.
  const remainingReadingIgnoredByBatchRow =
    measurementRejection !== null &&
    measuredPasteIsRemaining &&
    measurementRejection.accepted;
  // Ratio mode (LS:1534): weigh the paste, then add water at 1:1 / 2:1 / 3:1 by weight.
  // Prefer a valid MEASURED paste — the reference's ratio method is applied to a weighed
  // paste. Otherwise pasteGrams is anhydrousGrams + the paste's TRUE water — not
  // dilution.totalWaterGrams - dilutionWaterGrams, which the targetExceedsPaste clamp on
  // dilutionWaterGrams can zero out (see DilutionPanelProps.cookWaterGrams and
  // PortionDilutionResults' identical trap).
  const ratioNum = Number(waterPasteRatio);
  const ratioValid = Number.isFinite(ratioNum) && ratioNum > 0;
  // The corrected whole-batch paste when the view model has one — the SAME figure the
  // remaining-mode ceiling alert above quotes ("the N g the whole batch's paste ever
  // weighed"), and the same one forwarded to PortionDilutionResults. anhydrousGrams +
  // cookWaterGrams counts only the WATER fraction of an alternative liquid, so on a
  // split-liquid recipe it undercounts the pot by that liquid's solids: 300 g anhydrous +
  // 100 g cook water against a true 470 g pot printed 800 g of water for 2:1 where the pot
  // needs 940 g — a 140 g under-dose, computed from a basis this component was already
  // holding the correction for. Falls back to the water-only figure when there is no
  // corrected one (no split liquid, or a caller predating the prop), which is byte-identical
  // to before for those recipes.
  // Hoisted out of bestKnownPasteGrams (same predicate, unchanged) because the undeclared-
  // liquid caveat below needs the same question answered: whether the figures on screen were
  // derived from the corrected paste decides whether they are declaration-invariant or a
  // lower bound, and those are opposite things to tell the maker.
  const hasCorrectedPasteBasis =
    wholeBatchPasteGrams !== undefined &&
    wholeBatchPasteGrams !== null &&
    Number.isFinite(wholeBatchPasteGrams) &&
    wholeBatchPasteGrams > 0;
  const bestKnownPasteGrams = !dilution
    ? null
    : hasCorrectedPasteBasis
      ? (wholeBatchPasteGrams as number)
      : dilution.anhydrousGrams + cookWaterGrams;
  // The correction bestKnownPasteGrams carries over the recipe's own water-only figure —
  // an alternative liquid's non-water solids. Derived from that same basis rather than
  // taken as a prop so it can never disagree with the paste the figures are computed from;
  // zero when there is no corrected basis, which is every recipe without a split liquid.
  const splitLiquidSolidsGrams =
    dilution && bestKnownPasteGrams !== null
      ? Math.max(0, bestKnownPasteGrams - (dilution.anhydrousGrams + cookWaterGrams))
      : 0;
  const pasteGrams = dilution ? (measuredPasteValid ? measuredPasteNum : bestKnownPasteGrams) : null;
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
  // The write-back below waits for a real edit to the ratio (ratioTouched — see its own
  // comment), so entering ratio mode leaves the saved target in force. That is deliberate
  // and must stay: entering and leaving the mode used to rewrite a typed target with no
  // undo. What it left unsaid is the split it creates — the ratio block above answers for
  // the ratio while every row below, and the printed sheet, still answer for the saved
  // target. Three disagreeing figures on one screen (3,200 g at the ratio, a 4,000 g
  // solution at the saved 30%, 2,400 g on the sheet) and nothing saying they are answers to
  // different questions. Naming the split is the fix; writing back on entry is not.
  const persistedTargetPercent = Number(soapConcentrationPercent);
  const ratioNotAppliedYet =
    dilutionMode === 'ratio' &&
    !ratioTouched &&
    clampedRatioConcentrationPercent !== null &&
    Number.isFinite(persistedTargetPercent) &&
    // The write-back rounds to 0.1 before writing, so anything closer than half of that is
    // the same target and there is no split to report.
    Math.abs(clampedRatioConcentrationPercent - persistedTargetPercent) >= 0.05;
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
  // wholeBatchPasteGrams is passed for the second correction the helper applies: without it
  // this row derived its water from calculateDilution's anhydrous + water pot while the
  // ratio block above derived its own from bestKnownPasteGrams, which counts an alternative
  // liquid's solids. Two figures on one screen, differing by exactly those solids (5,000 g
  // at the ratio against 5,450 g here and on the printed sheet). Same basis both ways now.
  const batchDilutionWaterGrams = dilution
    ? correctedDilutionWaterGrams(
        dilution,
        measuredPasteGrams,
        measuredPasteIsRemaining,
        wholeBatchPasteGrams,
      )
    : 0;
  // Asked of the same helper PortionDilutionResults itself renders from, so the shell can
  // never believe something about Custom amount that Custom amount does not show. The
  // portion figures are still the child's to render; the shell reads this verdict for two
  // things only — the density caveat below (which needs a millilitre figure to explain)
  // and the batch row's own pointer at Custom amount, which must not send the maker to a
  // scope that has nothing to size.
  const portionState = dilution
    ? portionDilutionFor({
        dilution,
        targetMl,
        measuredPasteGrams: measuredPasteGrams ?? '',
        measuredPasteIsRemaining,
        wholeBatchPasteGrams,
      })
    : null;
  const portionOnScreen = dilutionScope === 'portion' && portionState?.portion != null;
  // PortionDilutionResults says the same thing in its own words when it suppresses the
  // portion for this exact state — same condition (targetExceedsPaste + undeclared liquid +
  // not certain), same figure, same "Declare its % water in Split liquid" remedy — so on
  // one Custom amount screen the maker read the identical remedy twice, separated only by
  // unrelated copy. Of the two the child's is the one that ALSO explains the missing
  // figures ("No portion can be sized yet"), so it owns the message wherever it renders.
  // Narrow on purpose: only pasteAlreadyThinner makes the child print it, so Custom amount
  // with a valid measurement — where the child sizes a portion and hedges nothing — keeps
  // the shell's caveat exactly as before. Same duplication the sibling floor hint below
  // already avoids inside this shell; this is that rule applied across the scope seam.
  const portionOwnsUndeclaredLiquidHedge =
    dilutionScope === 'portion' && (portionState?.pasteAlreadyThinner ?? false);
  // The other half of that hedge's job, and the opposite disposal. measuredPasteAlreadyThinner
  // is asserted flat in BOTH scopes — PortionDilutionResults' own paragraph in Custom amount,
  // the "Custom amount cannot size anything from that reading either" branch of the
  // remaining-reading note in Whole batch — with no overDilutionKnowable split like its
  // sibling's, so an undeclared liquid put "already more dilute than the target" and "can't
  // tell whether N% is reachable" on one screen for EVERY accepted "what's left" reading in
  // this state.
  //
  // Suppressing the hedge rather than hedging the verdict, because this verdict really is
  // certain: it reduces to wholeBatchPasteGrams > solutionGrams (the pot's own soap makes
  // less solution at the target than the pot weighs), and BOTH sides of that are fixed
  // whatever the undeclared liquid contains. solutionGrams is anhydrous ÷ the target, and
  // the view model's wholeBatchPasteGrams is anhydrous + cookWater + solids where solids is
  // (liquid total − its water) — so it collapses to anhydrous + lye water + the liquid's
  // total mass, with the water/solids split cancelling out. Declaring the liquid's % water
  // moves water into solids and back, and never moves this sum. (The uncorrected water-only
  // fallback basis cannot reach this branch at all: predictedPasteGrams is anhydrous + cook
  // when totalWater >= cook and anhydrous + totalWater otherwise, neither of which can
  // exceed solutionGrams — so a true verdict here always came off the corrected basis.)
  const measuredOverDilutionCertain = portionState?.measuredPasteAlreadyThinner ?? false;
  // Shared with PortionDilutionResults so this shell's Whole-batch twin of that refusal and
  // the child's own Custom-amount wording of it can never name different controls.
  const refusalWording = dilutionTargetWording(dilutionMode, ratioNotAppliedYet);
  // The Whole-batch twin of PortionDilutionResults' unmeasuredPasteAlreadyThinner, and the
  // exact condition under which correctedDilutionWaterGrams' clamp fires: the corrected pot
  // outweighs the whole solution its own soap makes at the target, so the batch row prints
  // "0 g". That zero is honest — there really is no water to add — but until this branch
  // existed nothing on screen said so, while Custom amount, one radio away, refused the same
  // recipe in words. Same predicate, same remedy, same mutual exclusion as the child's.
  //
  // Gated on !targetExceedsPaste because this predicate strictly SUBSUMES that flag:
  // targetExceedsPaste is totalWater < cookWater, i.e. solutionGrams < anhydrous + cookWater,
  // and the corrected pot is never lighter than that — so ungated the two alerts would both
  // fire for every over-dilute recipe. It is also why the water-only FALLBACK basis cannot
  // reach here at all (bestKnownPasteGrams is then exactly anhydrous + cookWater): a true
  // verdict always comes off the corrected, solids-aware pot.
  //
  // Suppressed by a VALID measurement, exactly as the targetExceedsPaste alert below is:
  // the measured-paste guards already refuse a reading heavier than the solution (with their
  // own alert), so a reading that survives them leaves solutionGrams - measured >= 0 and no
  // clamp to explain. A REJECTED reading is NOT suppressed: the row falls back to the
  // recipe's own clamped figure in that case, and the rejection alert speaks only about the
  // reading — it never accounts for the zero underneath it.
  //
  // Flat, with no overDilutionCertain hedge, for the reason spelled out on
  // measuredOverDilutionCertain above: both sides are declaration-invariant, so an
  // undeclared liquid cannot overturn it. No collision with the "can't tell whether X% is
  // reachable" hedge either — that one is gated on targetExceedsPaste, which is false here.
  const pasteAlreadyPastTarget =
    dilution !== null &&
    !dilution.targetExceedsPaste &&
    !measuredPasteValid &&
    bestKnownPasteGrams !== null &&
    bestKnownPasteGrams > dilution.solutionGrams;
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
          {/* Same visible antecedent the declaration radios below carry, for the same
              reason: "g oz lb" beside a heading is three bare radios with nothing on
              screen saying what they switch. The name was in aria-label only, which
              sighted makers never see. */}
          <span className="dilution-toggle__legend">Show weights in:</span>
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
        {/* The options read "all of it" / "what's left after earlier dilutions" — all of
            WHAT is unanswerable on screen without a visible antecedent, and an aria-label
            alone leaves sighted makers reading two unlabelled radio rows in a row. */}
        <span className="dilution-toggle__legend">That weight is:</span>
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
      {/* The reading is rejected in BOTH scopes, so its explanation renders in both — beside
          the input it describes, and above the figures that fall back to the recipe's own
          computed paste because of it. Every remedy names a control that is above this
          point and visible in the current mode.

          The three thresholds below are quoted in GRAMS, not displayUnit — alone in this
          panel. Every other figure here is a bench readout and belongs on whatever unit the
          maker's scale is set to; these are bounds on the number they just typed into a
          grams-only field, so quoting "less than the 2.65 lb of soap this batch makes" beside
          a typed 900 made them convert before they could check the claim. */}
      {dilution && measurementRejection && (
        <>
          {measurementRejection.nonPositive && (
            <p className="results-hint" role="alert">
              {/* Declaration-neutral: neither radio makes a non-positive number a weight,
                  so this remedy names the field itself rather than either of them. */}
              A paste weight has to be more than zero — enter what the scale reads, or clear
              the field to go back to the recipe&apos;s own computed paste.
            </p>
          )}
          {measurementRejection.belowSolids && (
            <p className="results-hint" role="alert">
              That is less than the {formatWeight(dilution.anhydrousGrams, 'g')} of
              soap this batch makes, and solids do not evaporate — so it cannot be all of the
              paste. Check the scale was tared, or switch the declaration above to
              &quot;what&apos;s left after earlier dilutions&quot; if part of the batch is
              already diluted.
            </p>
          )}
          {measurementRejection.exceedsSolution && (
            <p className="results-hint" role="alert">
              Your paste already weighs more than the{' '}
              {formatWeight(dilution.solutionGrams, 'g')} this target dilutes to, so
              it cannot be diluted to{' '}
              {formatConcentrationPercent(dilution.soapConcentrationPercent)}% at all —{' '}
              {/* The remedy names whichever control is actually on screen, and points the
                  right way: solutionGrams is anhydrous ÷ concentration, so it is a LOWER
                  target (or a wider ratio) that makes room for the paste already weighed. */}
              {dilutionMode === 'ratio'
                ? 'raise the water:paste ratio above (more water)'
                : 'lower the target concentration above (more water)'}
              , or check the measurement.
            </p>
          )}
          {measurementRejection.exceedsRemainingCeiling && (
            <p className="results-hint" role="alert">
              That is more than the{' '}
              {formatWeight(measurementRejection.wholeBatchPasteBasis, 'g')} the whole
              batch&apos;s paste ever weighed, so it cannot be what is left of it — check the
              scale, or switch the declaration above to &quot;all of it&quot; if that is what
              you weighed.
            </p>
          )}
        </>
      )}
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
      {/* A WHOLE-BATCH pour figure, so it belongs to whole-batch scope only. Ungated it
          printed the batch's water in the same primary emphasis as the portion's own water
          figure directly below — several times larger, with nothing to say which one to
          pour — and, when a measurement made the portion unreachable, printed a live water
          figure immediately above an alert saying there was no water to add. The "lands at
          X% soap" readout and the 1–99% clamp alert below stay in BOTH scopes: they
          describe the target the ratio chooses, not an amount to pour. */}
      {dilutionScope === 'batch' &&
        dilutionMode === 'ratio' &&
        ratioConcentrationPercent !== null &&
        ratioWaterGrams !== null && (
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
            {formatConcentrationPercent(clampedRatioConcentrationPercent)}%{' '}
            {/* The tense follows the WRITE-BACK, not the clamp. Untouched, nothing has been
                written — the saved target is still what every figure below runs on, which is
                exactly what the not-applied note underneath says — so "is used instead" put a
                flat contradiction two paragraphs apart on one screen. Only the wording is
                conditional; the clamp itself is unchanged and still bounds every write. */}
            {ratioTouched ? 'is' : 'would be'} used instead.{' '}
            {roundedRatioConcentrationPercent < 1
              ? 'Lower the ratio (less water) to land inside that range directly.'
              : 'Raise the ratio (more water) to land inside that range directly.'}
          </p>
        )}
      {/* The second sentence names the action WITHOUT promising a destination, because the
          obvious single edit does not reach the figure quoted here: from an untouched 2:1 at a
          saved 30%, taking the ratio input's own step to 2.5 applies 21.4% — landing on this
          25% needs a round trip (2 → 2.5 → 2), since the write-back only fires once the field
          has been touched. The first sentence is the durable part and stays: the rows below
          and the printed sheet answer at the saved target, whatever the ratio says. */}
      {ratioNotAppliedYet && clampedRatioConcentrationPercent !== null && (
        <p className="results-hint">
          Not applied yet: every figure below — and the printed batch sheet — still uses your
          saved {formatConcentrationPercent(persistedTargetPercent)}% target, not the{' '}
          {formatConcentrationPercent(clampedRatioConcentrationPercent)}% above. Editing the
          ratio applies whatever it then lands at.
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
                {/* The water the finished solution actually holds, which is NOT
                    calculateDilution's totalWaterGrams once an alternative liquid puts
                    non-water solids in the pot. Core works from soap + water alone, so its
                    total is solutionGrams - anhydrous; the corrected pour fills the pot to
                    solutionGrams with anhydrous AND the solids in it, so the water that
                    actually ends up there is a solids' worth less. Printing core's figure
                    claimed water that is not in the bottle, and left the two rows
                    irreconcilable: subtracting the pour from it used to recover the water
                    already in the paste and instead overstated it by exactly the solids
                    (64 g on a 200 g canned-milk recipe, 400 g on a 400 g glycerin one).

                    Corrected rather than annotated, because the row is a claim about the
                    finished product and the claim was wrong — a note explaining a figure
                    nobody should act on would not have made it act-on-able. With this,
                    Total water − Dilution water to add is the paste's own water again, and
                    it stays exact under a measurement too: the pour is then
                    solutionGrams − measured, so the difference is measured − anhydrous −
                    solids, which is precisely the water in the pot that was weighed.

                    Byte-identical for any recipe without a split liquid — solids is 0 — and
                    that matters beyond the arithmetic: it leaves this row's long-standing
                    behaviour under targetExceedsPaste (where it prints LESS than the paste's
                    own water, because the target is not reachable) exactly as it was.
                    Deriving it as cookWaterGrams + the pour instead would read better in
                    that one state and be wrong in two others: it would use the ASSUMED cook
                    water a measurement is direct evidence against, and it would move recipes
                    that have no alternative liquid at all.

                    Clamped at zero, matching calculateDilution's own clamp on
                    dilutionWaterGrams and reachable the same way — a liquid whose solids
                    exceed the target's whole water allowance leaves no water in a solution
                    that cannot be reached anyway. The pour reads 0 g beside it, and the
                    pasteAlreadyPastTarget alert below says why. */}
                <div className="results-grid__item">
                  <dt>Total water</dt>
                  <dd>
                    {formatWeight(
                      Math.max(0, dilution.totalWaterGrams - splitLiquidSolidsGrams),
                      displayUnit,
                    )}
                  </dd>
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
                      pasteGrams already prefers a valid measurement), so name that row there.

                      The reading itself is quoted in GRAMS, like the three rejection
                      thresholds above and for the same reason: it is the number the maker
                      typed into a grams-only field, not a bench readout. On lb this echoed
                      a typed 1480 back as "3.26 lb" — their own entry, in a unit they never
                      used. */}
                  {/* The reason given for preferring the measurement is down to one clause.
                      The computed paste this outranks is now the corrected whole-batch pot,
                      which already counts an alternative liquid's solids — that went stale
                      in c1dc31d, when the batch row started deriving its water from that
                      pot, and stayed stale here while the same sentence was fixed in Custom
                      amount. Evaporation is what a measurement still buys. */}
                  {dilutionMode === 'ratio' ? 'Water to add at this ratio' : 'Dilution water'} above
                  uses your measured paste ({formatWeight(measuredPasteNum, 'g')}
                  ), not the recipe&apos;s computed paste — the cook boils off water the recipe
                  still counts, and no figure on paper knows how much yours drove off, so the
                  measurement is more accurate.
                </p>
              )}
              {remainingReadingIgnoredByBatchRow && (
                <p className="results-hint">
                  These are the recipe&apos;s whole batch, so a reading of what&apos;s left
                  after earlier dilutions does not correct them — the pot no longer holds the
                  batch these figures describe.{' '}
                  {/* Custom amount is the right place for this reading only when it can
                      actually size something from it. When the pot is already past the
                      target, Custom amount answers with an explanation and no figures (see
                      PortionDilutionResults' measuredPasteAlreadyThinner) — so sending the
                      maker there unconditionally handed them a second refusal instead of
                      the remedy. Asked of the child's own helper, so the two always agree.

                      The target it names and the remedy it gives come from the child's own
                      dilutionTargetWording, so this twin and the paragraph Custom amount
                      prints for the identical state can never word it differently — ratio
                      mode has no concentration field, so "set a target" pointed at nothing,
                      and an unapplied ratio is not the target these figures ran on. */}
                  {portionState?.measuredPasteAlreadyThinner
                    ? `Custom amount cannot size anything from that reading either: what is left is already more dilute than ${refusalWording.named}, so there is no dilution water to divide up. ${refusalWording.remedy} until the pot can reach it.`
                    : 'Switch to Custom amount to size what you are making from that reading instead.'}
                </p>
              )}
            </>
          ) : (
            /* unknownLiquidGrams/overDilutionCertain are forwarded for one reason: the
               over-dilution verdict is only assertable when the undeclared liquid cannot
               change it — the same test this shell's own alert below applies — so the two
               can never print opposite verdicts on one screen. dilutionMode is forwarded
               for a sibling reason: the child's refusals name a remedy, and which control
               that is depends on the mode chosen up here — it has no other way to know
               whether a concentration field is even on screen. */
            <PortionDilutionResults
              dilution={dilution}
              weightUnit={displayUnit}
              targetMl={targetMl}
              measuredPasteGrams={measuredPasteGrams ?? ''}
              measuredPasteIsRemaining={measuredPasteIsRemaining}
              wholeBatchPasteGrams={wholeBatchPasteGrams}
              unknownLiquidGrams={unknownLiquidGrams}
              overDilutionCertain={overDilutionCertain}
              dilutionMode={dilutionMode}
              ratioNotAppliedYet={ratioNotAppliedYet}
            />
          )}
          {/* LS:1531 — shown regardless of which figure (concentration or ratio) the maker
              started from, since the swelling and absorbing it describes happens either way. */}
          <p className="results-hint">
            Whichever figure you start from, add the water in stages: enough to cover the paste,
            then more in small amounts, and give it time between — the paste swells and keeps
            absorbing. Recording where you stopped makes the next batch of the same recipe exact.
          </p>
          {/* The density bridge explains a gram→millilitre conversion, so it needs a volume
              on screen to explain. Whole batch always shows one ("≈ Finished volume");
              Custom amount only when a portion actually renders its "Makes" figure. An
              amount being asked for is NOT that question — a rejected measurement, or a
              paste already thinner than the target, suppresses the portion with the amount
              still typed in, and the caveat printed beside no millilitre figure at all:
              exactly the case the earlier Number(targetMl) > 0 gate was written to prevent. */}
          {finishedVolumeMl !== null && (dilutionScope === 'batch' || portionOnScreen) && (
            <p className="results-hint">
              Volume assumes ~{LS_SOLUTION_DENSITY_G_PER_ML} g/ml — a planning figure, not a
              measured density. Weigh a known volume of your own solution if it has to be
              exact.
            </p>
          )}
          {dilutionScope === 'batch' && (
            <>
              {/* targetExceedsPaste is computed from the recipe's ASSUMED cook water — exactly
                  the assumption a measured paste is evidence against (that's the whole reason
                  the reference weighs the paste: the computed figure can't see evaporation). A
                  valid measurement outranks the flag, so suppress this alert rather than assert
                  "already more dilute" beside a water figure the measurement just produced.

                  A REJECTED measurement is excluded for the same reason and gets its own
                  alert above instead — the exclusion PortionDilutionResults' matching
                  branch already applied while this one did not, so a mis-tared reading
                  stacked two role="alert" paragraphs here and one there, and the second
                  asserted a verdict derived from the very assumed cook water the rejected
                  reading was contesting. Both scopes answer this state the same way now. */}
              {dilution.targetExceedsPaste &&
                !measuredPasteValid &&
                !(measurementRejection?.rejected ?? false) &&
                (unknownLiquidGrams === 0 || overDilutionCertain) && (
                  <p className="results-hint" role="alert">
                    The paste is already more dilute than {formatConcentrationPercent(dilution.soapConcentrationPercent)}% — adding water
                    only lowers the concentration further.
                  </p>
                )}
              {/* The sibling above answers the water-only form of this state; this one
                  answers the form only the corrected pot can see — see
                  pasteAlreadyPastTarget for the predicate, the gating and why the two can
                  never both fire. The two figures are quoted because the claim is a
                  comparison, and the row it explains prints a bare "0 g". */}
              {pasteAlreadyPastTarget && bestKnownPasteGrams !== null && (
                <p className="results-hint" role="alert">
                  The paste is already more dilute than {refusalWording.named}: it weighs{' '}
                  {formatWeight(bestKnownPasteGrams, displayUnit)} against the{' '}
                  {formatWeight(dilution.solutionGrams, displayUnit)} its soap makes at that
                  concentration, so there is no dilution water to add.{' '}
                  {refusalWording.remedy} until the paste can reach it, or weigh the paste
                  above — the cook boils off water this figure still counts.
                </p>
              )}
            </>
          )}
          {/* An alternative liquid is a property of the RECIPE, not of how much of it you
              are making, so these three caveats follow into both scopes: a portion's water
              figure is net of that liquid's water, and a lower bound when its water is
              undeclared, for exactly the same reasons the batch's figure is — and Custom
              amount used to print them bare. Only the batch FIGURES they quote are
              scope-bound, so each drops or replaces its own. */}
          {/* The gate is "did this liquid take anything off the water to add" — water OR
              solids — not water alone. The figure it explains is derived from the corrected
              paste, which counts both, so a water-only gate withheld the paragraph from
              exactly the recipes whose drop is largest: glycerin has waterFraction 0, so
              400 g of it moved the pour 2,506 g → 2,106 g with nothing on screen saying
              why. Each of the three cases below quotes only what its own liquid actually
              contributed. */}
          {(altLiquidWaterGrams > 0 || splitLiquidSolidsGrams > 0.5) && unknownLiquidGrams === 0 && (
            <p className="results-hint">
              {/* The last sentence is the load-bearing one: it is the only place telling
                  the maker not to top up with more milk or juice, and it is as true of a
                  portion as of the batch. Only the head start is a whole-batch figure —
                  quoting it in Custom amount would put the batch's 300 g beside a much
                  smaller portion water figure with nothing to say which is which.

                  The head start is the liquid's WHOLE mass once the water figure is
                  derived from the corrected paste, not just the water it carried: its
                  solids occupy room in the finished solution too, so they come off the
                  water to add exactly as its water does. Quoting the water alone
                  understated the drop by the solids — 136 g against a real 200 g for
                  200 g of canned coconut milk. The water-only wording is kept verbatim for
                  the recipes it is still exactly right for (a liquid that is all water, or
                  no corrected basis at all), so nothing changes for them.

                  A liquid with NO water (glycerin, waterFraction 0) gets its own wording
                  rather than the mixed one: "0 g of water that went into the paste" is a
                  clause about nothing, and the head start it would sit beside is entirely
                  solids. Same sentence shape, same figure, one term instead of two. */}
              {dilutionScope === 'batch'
                ? splitLiquidSolidsGrams > 0.5
                  ? altLiquidWaterGrams > 0
                    ? `Already ${formatWeight(altLiquidWaterGrams + splitLiquidSolidsGrams, displayUnit)} lighter: ${formatWeight(altLiquidWaterGrams, displayUnit)} of water that went into the paste, and ${formatWeight(splitLiquidSolidsGrams, displayUnit)} of solids that take up room in the finished solution.`
                    : `Already ${formatWeight(splitLiquidSolidsGrams, displayUnit)} lighter: the alternative liquid brought no water, and all of it is solids that take up room in the finished solution.`
                  : `Already ${formatWeight(altLiquidWaterGrams, displayUnit)} lighter: that much water came in with the alternative liquid and is counted as part of the paste.`
                : altLiquidWaterGrams > 0
                  ? 'Part of the water is already there: it came in with the alternative liquid and is counted as part of the paste.'
                  : 'The alternative liquid is already in the pot: it brought no water, but it takes up room in the finished solution, so the figures here are net of it.'}{' '}
              Top up with plain distilled water only.
            </p>
          )}
          {dilution.targetExceedsPaste &&
            unknownLiquidGrams > 0 &&
            !overDilutionCertain &&
            !portionOwnsUndeclaredLiquidHedge &&
            !measuredOverDilutionCertain &&
            // A valid whole-batch reading settles the question this hedge asks. The
            // over-dilution alert directly above is gated the same way and for the same
            // reason (targetExceedsPaste comes from the recipe's ASSUMED cook water; the
            // measurement is direct evidence against it) — ungated here, the panel printed
            // "Dilution water above uses your measured paste (1,300 g)" and, three
            // paragraphs later, "can't tell whether 90% is reachable" from a figure that
            // reaches it.
            !measuredPasteValid && (
            // Suppressed, not reworded: targetExceedsPaste is a factual claim about the
            // paste, and it was derived from an ASSUMED water content. Asserting it can tell
            // the user a batch is finished when it still needs hundreds of grams of water.
            <p className="results-hint">
              Can&apos;t tell whether {formatConcentrationPercent(dilution.soapConcentrationPercent)}% is reachable —{' '}
              {formatWeight(unknownLiquidGrams, displayUnit)} of alternative liquid has no
              declared water content. Declare its % water in Split liquid.
            </p>
          )}
          {/* Floor hint only when a positive floor exists. When the target already exceeds the
              paste, the can't-tell / certain-alert branches above own the message — rendering
              this too repeated "declare its % water" verbatim and printed a vacuous
              "0 g is the LEAST you will need". */}
          {/* …and, in Custom amount, only once a portion really rendered. The portion-scope
              wording points AT figures ("the water figures here are the LEAST you will
              need"), so with the amount field blank or a measurement rejected it bounded
              nothing that was on screen — the same trap the density caveat above is gated
              against, with the same gate. */}
          {altLiquidWaterGrams > 0 &&
            unknownLiquidGrams > 0 &&
            !dilution.targetExceedsPaste &&
            (dilutionScope === 'batch' || portionOnScreen) && (
            <p className="results-hint">
              {/* The quoted figure is the CORRECTED one the row above prints, not the
                  recipe's own dilutionWaterGrams. unknownLiquidGrams > 0 means SOME liquid
                  is undeclared, not all of it, so a declared liquid can contribute solids
                  alongside — and the uncorrected figure then sat ABOVE the row it claims to
                  bound (2,070 g offered as the floor under a 2,006 g row).

                  And with the corrected basis it is not a bound at all: the water to add is
                  solutionGrams − (anhydrous + lye water + the liquid's whole mass), and
                  declaring the % water only moves mass between that liquid's water and its
                  solids — never the sum, so never this figure. Promising that declaring
                  would lower it promised an effect it cannot have. What the declaration
                  really buys is knowing how much of the PASTE is water, which is what the
                  1:1 lye-dissolution check and the paste's own composition run on. */}
              {formatWeight(unknownLiquidGrams, displayUnit)} of alternative liquid has no
              declared water content —{' '}
              {hasCorrectedPasteBasis ? 'but' : 'it is counted as all water, so'}{' '}
              {dilutionScope === 'batch'
                ? `${formatWeight(batchDilutionWaterGrams, displayUnit)} is`
                : 'the water figures here are'}{' '}
              {hasCorrectedPasteBasis
                ? "the same either way: the liquid's whole mass is in the pot however its water and solids divide up. Declaring the % water tells you how much of your paste is water, not how much to add."
                : 'the LEAST you will need. Declare its % water, or dilute in increments and check by weight.'}
            </p>
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
