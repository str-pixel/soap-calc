import { lsPartialDilution, type DilutionResult } from '@soap-calc/core';
import { formatWeight } from '../lib/weightUnits';
import { measuredPasteRejectionFor, subTenthPrecisionFingerprint } from '../lib/measuredPaste';
import type { WeightUnit } from '../lib/recipe';

type PortionDilutionResultsProps = {
  dilution: DilutionResult;
  weightUnit: WeightUnit;
  /** Lives in App, not the recipe: it is a "what am I making right now" decision, not a
   * property of the formula. */
  targetMl: string;
  /** The maker's scale reading for the paste, in grams — always the WHOLE batch. There used
   * to be a declaration beside the field letting the maker call it "what's left after earlier
   * dilutions" instead; it is gone, and so is the remaining-mode arithmetic it used to feed. */
  measuredPasteGrams: string;
  /** The best-known WHOLE-BATCH paste mass (see useRecipeViewModel) — corrects the
   * recipe's own water-only predicted figure for an alternative liquid's non-water
   * solids, which are real mass sitting in the pot the recipe never counts. Used as the
   * floor/composition basis for a measured reading in place of the
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
  /** The alternative-liquid caveats in their PORTION wordings, composed by DilutionPanel's
   * shell — where the batch wordings of the same clauses live, so the two scopes cannot
   * drift apart — and rendered here as part of this component's own status paragraph.
   * Riding that paragraph does two things at once: the note only prints beside portion
   * figures that actually computed (the shell used to say "the figures here are net of it"
   * with no figures on screen when the portion was refused), and it costs no paragraph of
   * its own under the panel's prose budget (at most two inline hint paragraphs per state).
   * Empty means the recipe has no alternative liquid, or nothing about it needs saying. */
  altLiquidNote?: string;
  /** THE JAR GOVERNS (spec §2, phase 2b): a jar record with both figures is on screen beside
   * this grid, governing the dose and the finished figures. This grid keeps rendering
   * regardless — "the plan grid stays rendered beside a filled jar record, labelled as
   * plan" — so the caller passes this through rather than this component re-deriving its own
   * copy of `portionJarGoverns` (DilutionPanel's own name for the identical
   * `resolveDilution`-governs question). `false` (the default) is every pre-2b caller and
   * every state where no jar governs: the primary row keeps its bare name, exactly as before.
   *
   * Only the PRIMARY row ("Water to add") gains the "(plan)" suffix, mirroring the batch
   * scope's own granularity (spec §2's "Dilution water to add" / "Finished solution" — the
   * two rows a record's own figures could be mistaken for). The other rows here — paste to
   * weigh out, the volume, the fraction, the ratio — have no jar-resolved counterpart of the
   * same name anywhere on this screen (the jar's own readout is a finished mass and a
   * concentration, never a volume or a fraction), so there is nothing for them to be
   * confused with; labelling them too would be noise past the point of disambiguation. */
  jarGoverns?: boolean;
};

/**
 * What a refusal should call the target it says the paste is past, and what it should tell
 * the maker to do about it. Exported so DilutionPanel's Whole-batch twin of the same
 * refusal words it identically — the two describe one state and used to drift apart.
 *
 * There used to be a second mode here — a water:paste ratio in place of the % field, with
 * its own "not applied yet" state — and this was a function that branched on which one was
 * showing, so a refusal could name a control that was actually on screen. That mode is gone
 * (Phase 2a removed it from the panel; Phase 3 removed the parameters, spec §5): there is one
 * control now, the plan's % field, on screen in every state, so there is one wording to give
 * and nothing left to decide — a constant, not a call. What it is still FOR is that
 * DilutionPanel's Whole-batch twin of this refusal and this component's own Custom-amount
 * wording of it come from one place — the two describe one state and used to drift apart.
 */
export const DILUTION_TARGET_WORDING = {
  named: 'the target above',
  remedy: 'Lower the target concentration above (more water)',
} as const;

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
  unknownLiquidGrams = 0,
  overDilutionCertain = false,
}: Pick<
  PortionDilutionResultsProps,
  | 'dilution'
  | 'targetMl'
  | 'measuredPasteGrams'
  | 'wholeBatchPasteGrams'
  | 'cookWaterGrams'
  | 'unknownLiquidGrams'
  | 'overDilutionCertain'
>) {
  // The physical-impossibility rules — below the anhydrous solids, heavier than the target
  // solution — live in lib/measuredPaste, together with the long record of the bug each one
  // closed. The measured-paste INPUT is in DilutionPanel's shell, where it is visible in BOTH
  // dilution scopes, and so are the alerts that reject a reading: this component only renders
  // in Custom amount scope, so alerts kept here were unreachable in the default one. Reading
  // the verdict from the same helper the shell uses means the two can never disagree about
  // whether a reading is usable.
  const rejection = measuredPasteRejectionFor(
    measuredPasteGrams,
    dilution,
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
  // Whether the paste really is thinner than the target is a claim about the recipe's
  // ASSUMED water content, so an alternative liquid with no declared % water makes it
  // unknowable — the same certainty test the shell's own over-dilution alert uses, and the
  // printed sheet with it. Without this, Custom amount scope stated the verdict flat while
  // the shell two paragraphs below said it could not be told: one panel, one state, two
  // opposite answers. Only the WORDING turns on this; pasteAlreadyThinner still suppresses
  // the portion either way, because the clamped figures it would be computed from are
  // unusable regardless of what the liquid turns out to contain.
  const overDilutionKnowable = unknownLiquidGrams === 0 || overDilutionCertain;
  // Does this component actually WORD the over-dilution verdict — as opposed to holding
  // the flag while rendering its can't-tell hedge instead? Resolved here, beside the flag,
  // for the same reason the flag itself is (two surfaces reading one verdict can never
  // contradict each other): DilutionPanel's `overDilutionSpokenFor` counts the child's
  // voice among the voices the solubility ceiling stands down for, and it used to read the
  // bare flag — true in the undeclared-liquid uncertain state, where what renders below is
  // the hedge, not the verdict (decided 2026-08-17, the code-review round: the child's
  // hedge is not a verdict about the target either). The render below and the shell both
  // read THIS name, so the shell can never believe the verdict was worded while the hedge
  // was what the maker saw.
  const pasteAlreadyThinnerWorded = pasteAlreadyThinner && overDilutionKnowable;
  // The "Amount to make (ml)" field has the measured-paste field's own comma trap: a typed
  // thousands separator commits as a decimal point (1,200 ml → 1.200), and the ask arrives
  // a thousand times too small. Core is right to compute a 1.2 ml portion — a tiny ask is a
  // valid ask — so the refusal is judged HERE, on the typed string, by the same fingerprint
  // the paste field's subTenthPrecision rule reads (two or more typed decimal digits on a
  // finite positive number: nobody asks for a portion to the hundredth of a millilitre).
  // Resolved in this helper rather than in the shell's render so every surface that reads
  // this verdict — the child's figures, the shell's density caveat (portionOnScreen) —
  // suppresses together, exactly how measuredPasteRejectionFor keeps the two surfaces
  // agreeing about a paste reading. The alert itself renders in DilutionPanel's shell,
  // beside the field it describes.
  const targetMlSubTenthPrecision = subTenthPrecisionFingerprint(targetMl);
  // A MEASURED reading can no longer make core refuse, and there is no longer a branch here
  // for it. lsPartialDilution returns null when the pot's paste outweighs the solution that
  // pot's own soap makes at the target (ls-yield's `potSolutionGrams - pasteGrams < 0`); with
  // a whole-batch reading that pot IS the recipe's, so the test reduces to
  // solutionGrams < measured — which is exactly `exceedsSolution`, so the reading was already
  // rejected and `hasValidMeasurement` is false. The remaining-paste declaration this condition
  // used to be reachable through, and core's own remaining-mode arithmetic behind it, are both
  // gone (Phase 3, spec §5). The unmeasured twin below is still live and still needed.
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
    pasteAlreadyThinner || measurementRejected || unmeasuredPasteAlreadyThinner || targetMlSubTenthPrecision
      ? null
      : lsPartialDilution(
          {
            ...dilution,
            measuredPasteGrams: hasValidMeasurement ? measured : undefined,
            // Same corrected basis the UI's own ceiling check above uses, so core's
            // composition ratio and this component's rejection never disagree.
            wholeBatchPasteGrams: wholeBatchPasteGrams ?? undefined,
          },
          Number(targetMl),
        );
  return {
    measured,
    pasteAlreadyThinner,
    pasteAlreadyThinnerWorded,
    unmeasuredPasteAlreadyThinner,
    targetMlSubTenthPrecision,
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
  altLiquidNote = '',
  jarGoverns = false,
}: PortionDilutionResultsProps) {
  const {
    measured,
    pasteAlreadyThinner,
    pasteAlreadyThinnerWorded,
    unmeasuredPasteAlreadyThinner,
    portion,
  } = portionDilutionFor({
    dilution,
    targetMl,
    measuredPasteGrams,
    wholeBatchPasteGrams,
    cookWaterGrams,
    unknownLiquidGrams,
    overDilutionCertain,
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

  // THE portion status paragraph — one per rendered portion, under the panel's prose
  // budget (at most two inline hint paragraphs per state; ratio mode used to contribute a
  // second one here, but it is gone, so this component's own paragraph is the only
  // non-alert hint on the Custom amount screen now). Its clauses used to be up to three
  // stacked paragraphs — the clamp note, the drift-or-estimate note, and (in the shell,
  // where it could print beside no figures at all) the alternative-liquid caveats. Every
  // clause keeps its old gate and its old wording; only the paragraph breaks between them
  // are gone.
  //
  // SUPPRESSED WHOLESALE WHILE A JAR GOVERNS (Phase 2b): this grid now renders beside a
  // governing jar (spec §2), which already spends the budget on its own two paragraphs — the
  // jar's own readout-plus-plan-echo, and (when the recipe has one) the alternative-liquid
  // caveat, which the shell renders DIRECTLY beside the jar's own figures whenever the jar
  // resolves (DilutionPanel.tsx's own jar block) — the same `altLiquidNote` string this
  // component still receives as a prop, unconditionally, from the identical shell computation.
  // Gating this whole block on `!jarGoverns` is what stops the two from ever printing the
  // SAME sentence twice: without it, `altLiquidNote` would ride both the jar's own paragraph
  // and this one's `statusClauses`, on the one screen where both are on. A third paragraph of
  // commentary about the PLAN figures — which paste basis they used, whether they clamped to
  // the whole batch — would blow the budget on its own even without the duplicate, and none
  // of it is what a maker beside a governing jar is acting on: the numbers stay (labelled as
  // plan), the prose about their provenance stands down. Reads `jarGoverns`, the same prop
  // that labels the primary row, so the grid and its own prose can never disagree about
  // whether a jar is on screen.
  const statusClauses: string[] = [];
  if (portion && !jarGoverns) {
    // One wording, because there is one kind of pot: the batch. This used to branch on
    // the measured-paste declaration ("more than the remaining paste holds"); that control,
    // and the wording it branched to, are gone (Phase 3, spec §5).
    if (portion.clamped) {
      statusClauses.push(
        'That is more than the batch holds — the figures above are the whole batch.',
      );
    }
    if (portion.pasteMeasured) {
      if (Math.abs(driftGrams) >= 1) {
        statusClauses.push(
          `Your paste is ${formatWeight(Math.abs(driftGrams), weightUnit)} ${
            driftGrams < 0 ? 'lighter' : 'heavier'
          } than predicted${
            driftGrams < 0 ? ' — water lost to the cook' : ''
          }. Whole batch scope uses your measurement too, not just these figures.`,
        );
      }
    } else {
      // The solids half of this caveat had to go: "Paste to weigh out" now runs on the
      // corrected whole-batch pot, which counts an alternative liquid's non-water solids,
      // so telling the maker they are missing from the figure directly above described
      // the opposite of what it prints. Evaporation is the half that survives — no
      // arithmetic can see it — and it is the half that makes weighing the fix. Left
      // unconditional rather than branched on whether a corrected basis was supplied: it
      // is true either way, and a clause about alternative liquids is noise on the many
      // recipes that have none. The solids correction itself is documented on this
      // component and on lsPartialDilution, where the next editor will look.
      statusClauses.push(
        'Paste weight here is computed from the recipe, so treat it as an estimate: the cook boils off water the recipe still counts, and no figure on paper knows how much yours drove off. Weigh your paste and enter it above for exact figures.',
      );
    }
    // Last, so the paste clauses keep leading exactly as they did as paragraphs of their
    // own — the note describes the water figures, which the sentences above frame.
    if (altLiquidNote) statusClauses.push(altLiquidNote);
  }

  // Both refusals below name the target above and remedy it with "lower the target
  // concentration above". See DILUTION_TARGET_WORDING for why the wording is centralized
  // here rather than written out twice.
  const { named: dilutionTargetNamed, remedy: dilutionTargetRemedy } = DILUTION_TARGET_WORDING;
  return (
    <>
      {/* unmeasuredPasteAlreadyThinner rides this paragraph rather than earning one of its
          own: it says exactly what that case needs, down to the "weigh the whole batch's
          paste above" remedy, which is the one thing that can still size a portion here. It
          takes the KNOWABLE branch unconditionally — the two are mutually exclusive (see its
          own derivation), and unlike targetExceedsPaste it is not a water-derived claim at
          all: it compares solutionGrams against the pot's whole mass, and both are fixed
          however the undeclared liquid's water turns out to be split.

          The fork below is the helper's `pasteAlreadyThinnerWorded`, not a knowability test
          re-derived here: the shell's solubility ceiling counts this paragraph's KNOWABLE
          branch as a voice for the target and stands down for it — so which branch renders
          and which branch the shell believes rendered have to be one answer, read from one
          name (see the derivation in portionDilutionFor for the seam this closed). */}
      {(pasteAlreadyThinner || unmeasuredPasteAlreadyThinner) &&
        (pasteAlreadyThinnerWorded || unmeasuredPasteAlreadyThinner ? (
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
            {/* LABELLED AS PLAN while a jar governs (spec §2, phase 2b) — the batch scope's
                own idiom for the identical problem: this row and the jar's own "Finished so
                far (this jar)" mass are two different answers to two different questions
                (what the plan would size right now vs. what the jar actually holds), and the
                word "(plan)" is what keeps them legible side by side rather than looking like
                one figure disagreeing with itself. Primary emphasis is unconditional — unlike
                the batch grid, this row does not lose it under a governing jar, because
                nothing here ever takes over as a competing primary figure the way the
                batch's own record row does. */}
            <div className="results-grid__item results-grid__item--primary">
              <dt>{jarGoverns ? 'Water to add (plan)' : 'Water to add'}</dt>
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
          {/* The composed status paragraph — see statusClauses above for what rides it
              and why it is one paragraph. */}
          {statusClauses.length > 0 && (
            <p className="results-hint">{statusClauses.join(' ')}</p>
          )}
        </>
      )}
    </>
  );
}
