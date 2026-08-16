import { useEffect, useState, type ReactNode } from 'react';
import {
  LS_DILUTION_TARGETS,
  LS_SOLUTION_DENSITY_G_PER_ML,
  gradualDilutionFrom,
  lsConcentrationAboveAllMinimums,
  lsDilutionUsesFor,
  lsFinishedVolumeMl,
  lsPotAnhydrousShare,
  type DilutionResult,
} from '@soap-calc/core';
import { finishedProductGramsFor } from '../lib/calculateAdditives';
import { formatConcentrationPercent, formatGrams } from '../lib/format';
import { formatWeight } from '../lib/weightUnits';
import {
  MEASURED_PASTE_IS_REMAINING,
  computedPotGramsFor,
  correctedDilutionWaterGrams,
  hasCorrectedPasteBasis,
  measuredPasteIsValidFor,
  measuredPasteRejectionFor,
  parseGradualWaterRecordGrams,
  parseMeasuredPasteGrams,
  subTenthPrecisionFingerprint,
  weighedOrComputedPotGramsFor,
} from '../lib/measuredPaste';
import type { WeightUnit } from '../lib/recipe';
import {
  PortionDilutionResults,
  dilutionTargetWording,
  portionDilutionFor,
} from './PortionDilutionResults';

export type DilutionMode = 'concentration' | 'ratio' | 'gradual';

/** The water:paste ratios the reference actually prints, all of them WATER : PASTE by
 * weight — the same direction the field label states, and the direction the reference's own
 * worked example confirms (32 oz of paste at 2:1 takes 64 oz of water, LS:1534).
 *
 * 1:1 is offered as a place to begin and add to rather than a destination (LS:1534); 2:1 and
 * 3:1 are the range makers start from depending on the recipe (LS:1534); 2.5:1 comes off the
 * dilution table for a beginner CPLS recipe (LS:2172), where 2:1 is tabled beside it, and 1:1
 * and 2:1 are tabled again for a beginner LTLS recipe (LS:2291).
 *
 * Offered BESIDE the numeric input, never instead of it: the reference names these as
 * starting points, not as the only legal values, and a maker who has recorded what their own
 * recipe took must still be able to type it.
 *
 * Strings rather than numbers because they are written straight back into the ratio input's
 * own string state, and '2.5' must reach it as typed. */
const LS_WATER_PASTE_RATIO_PRESETS = ['1', '2', '2.5', '3'] as const;

export type DilutionScope = 'batch' | 'portion';

type DilutionPanelProps = {
  dilution: DilutionResult | null;
  soapConcentrationPercent: string;
  onSoapConcentrationChange: (value: string) => void;
  /** The app-wide unit (BatchBasics' "Weight unit" selector) — the ONLY unit control, used
   * as-is for every figure here, kg included. Deliberately no kg→g fallback: the panel once
   * kept a local g/oz/lb switch seeded from this prop with kg mapped to grams, so a kg-mode
   * maker saw grams on screen while the printed BatchSheet (which has always used this prop
   * directly) quoted kg. One unit in, one unit out is what keeps screen and sheet agreeing
   * in all four units — do not re-add a fallback that re-splits them. The measured-paste
   * echoes and rejection thresholds are the one exception and stay in grams; see the
   * comment above the rejection alerts. */
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
   * zero out.
   *
   * It travels WITH `wholeBatchPasteGrams`, and a caller supplying one owes the other: the
   * difference between them is the alternative liquid's non-water solids, which is what the
   * head-start paragraph quotes and — since the floor correction — what the floor under a
   * measured paste counts.
   *
   * Left UNDEFAULTED for that reason (see the destructuring below): omitted, it means "the
   * cook water is unknown", which lib/measuredPaste answers by falling the floor back to the
   * anhydrous soap. Zero means something different and equally real — a recipe whose water
   * is entirely a zero-water alternative liquid — and the two must not collapse. The
   * arithmetic sites coalesce to 0 for themselves. */
  cookWaterGrams?: number;
  /** Which way the maker is arriving at the dilution. Two of the three CHOOSE a number and
   * let the app find the water: a target concentration (the default, and what the reference
   * calls out at LS:1536), or a water:paste ratio by weight (LS:1534 — 1:1 / 2:1 / 3:1).
   * The third runs the other way round: 'gradual' RECORDS the water actually poured
   * (LS:1531) and derives the concentration from it, which is why it has no target field of
   * its own and why copy written for the other two must not name one while it is chosen.
   * Session-local UI state, not a recipe setting — though the water gradual records is
   * recipe state (`gradualWaterGrams`), so App restores this mode when a record arrives. */
  dilutionMode?: DilutionMode;
  onDilutionModeChange?: (mode: DilutionMode) => void;
  /** Water:paste ratio by weight, as typed (e.g. "2" for 2:1). */
  waterPasteRatio?: string;
  onWaterPasteRatioChange?: (value: string) => void;
  /** Water actually poured in so far, in grams, as typed — Gradual Dilution's own record
   * (LS:1531: add water in increments and record how much). Empty means "nothing typed
   * yet", not zero: zero is itself a legitimate reading (the pot before any water at all),
   * so the two must never collapse to the same value — see the parsing next to `gradual`
   * below. */
  gradualWaterGrams?: string;
  onGradualWaterChange?: (value: string) => void;
  /** Gradual Dilution's own two figures, but for ONE JAR in Custom amount scope rather
   * than the whole batch: paste weighed out of the stored batch, and water poured into
   * that jar so far. Session-local in App like portionTargetMl/measuredPasteGrams — bench
   * figures for what is on the scale right now, not properties of the recipe — and unlike
   * `gradualWaterGrams` above, NEVER written back to settings.soapConcentrationPercent:
   * see `portionGradual`'s own comment for why a jar diluted thinner than the batch has
   * not redefined the recipe. Empty means nothing typed yet, matching gradualWaterGrams'
   * own "empty ≠ zero" rule. */
  portionPasteGrams?: string;
  onPortionPasteChange?: (value: string) => void;
  portionWaterGrams?: string;
  onPortionWaterChange?: (value: string) => void;
  /** The maker's scale reading for the paste, in grams (same App state PortionDilutionResults
   * reads — see its doc comment). ALWAYS the whole batch, and that is this app's choice, not
   * the reference's: the reference's ratio method is portion-first (LS:1534 weighs "the
   * portion of paste you wish to dilute"), while here sizing a partial dilution is what
   * Custom amount and its "Amount to make (ml)" field are for. Whichever route, what goes on
   * the scale is PASTE — the crockpot shortcut subtracts the empty pot (LS:1538) — never pot
   * and paste together. The reference weighs the paste precisely because
   * no computed figure can account for the water a particular cook drove off, so when this is
   * present and passes PortionDilutionResults' own guards, it corrects the BATCH dilution
   * water here too, not just the portion below. (An alternative liquid's uncounted solids
   * were the other half of that reason until `wholeBatchPasteGrams` started carrying them
   * into the computed paste — the fifth site of a clause this branch made stale, and the only
   * developer-facing one.) */
  measuredPasteGrams?: string;
  onMeasuredPasteGramsChange?: (value: string) => void;
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
   * ceiling/composition basis the batch row's own measured-paste guards use. With
   * `cookWaterGrams` it also fixes the FLOOR under a measured paste: the two identify the
   * alternative liquid's solids, and solids do not boil off. */
  wholeBatchPasteGrams?: number | null;
  /** Rendered at the end of this panel, after the dilution figures. App supplies the
   * Preservative snippet here so the dose sits with the mass it is a percentage of —
   * structurally, not by convention. Deliberately a node and not the snippet's own props:
   * this panel has no reason to know what a preservative is, and threading its other nine
   * through a component that already takes twenty-six is how a panel becomes
   * unmaintainable. (Twenty when this note was written, and it stayed at "twenty" while
   * gradual mode added five more — count them here before quoting a number.) */
  preservativeSlot?: ReactNode;
};

export type PortionGradualState = {
  /** The jar's own two figures — null when they cannot be worked out. */
  jar: { finishedGrams: number; concentrationPercent: number } | null;
  /** Both fields hold a usable figure: paste > 0, water >= 0 (zero water is the pot before
   * any water at all, which is Gradual's own starting record — LS:1531), and neither carries
   * a swallowed thousands separator (the two flags below), which is a number but not a
   * reading. False is what makes the panel ASK for the figures, so the two refusals below
   * suppress that ask themselves — a maker who typed something needs the refusal, not a
   * request to type it. */
  hasBothFigures: boolean;
  /** The paste weighed out is heavier than the whole batch's own paste — the single
   * physical refusal, and the one the maker has to be told about (a typed 4000 for 400). */
  pasteExceedsBatch: boolean;
  /** The batch paste that refusal is judged against, so the alert quotes the bound that
   * actually applied rather than re-deriving one. */
  batchPasteGrams: number | null;
  /** The jar's PASTE field carries a swallowed thousands separator (a typed 1,300 committed
   * as '1.300'), so there is no jar — see the fields' own note in the component. */
  pasteSubTenthPrecision: boolean;
  /** The jar's WATER field carries one. Reported separately because the alert has to quote
   * the field the maker typed into, and a jar can only be wrong one field at a time to a
   * reader. */
  waterSubTenthPrecision: boolean;
};

/**
 * Gradual dilution for ONE JAR in Custom amount scope, resolved once here so the panel's
 * readout and App's preservative dose can never disagree about whether a jar exists or what
 * it weighs — the same shape, and the same reason, as portionDilutionFor.
 *
 * The dose is why this is exported. In Custom amount the preservative is a % of the PORTION,
 * and App resolved that portion through portionDilutionFor — which sizes a jar from the
 * "Amount to make (ml)" field that gradual mode removes from the screen. So with a jar
 * recorded, the dose was a percentage of a target-derived mass the maker never asked for
 * (21 g of preservative into a 1,300 g jar: 1.6%, past the EU ceiling for several listed
 * products, in the mode built to stop exactly that), and with the amount blank there was no
 * dose at all and the snippet asked for a control that is not on screen.
 *
 * The jar's soap comes from core's lsPotAnhydrousShare — the paste is homogeneous, so a
 * weighed-out jar carries its share of the batch's anhydrous soap. That share is all this
 * needs, and it asks nothing about the recipe's target: an earlier version borrowed it from
 * lsPartialDilution, which also refuses whenever the SAVED TARGET implies a solution lighter
 * than the pot, so a low-water target silently blanked a readout that has nothing to do with
 * it. (Neither version re-derives the ratio here; see ls-yield's own warning.)
 *
 * THE BATCH IT IS A SHARE OF is the pot the maker WEIGHED when there is one, through the same
 * shared resolution every other derived figure counts from (lib/measuredPaste's
 * weighedOrComputedPotGramsFor). It used to be the recipe's prediction alone, which reported a
 * concentration for a jar nobody has: a 1,600 g computed pot that came off the cook at 1,400 g
 * makes a 400 g jar 58.0% soap, and the panel printed 50.75% — in the one mode built to report
 * what actually exists. The same basis carries the refusal, so "more paste than the batch
 * holds" can no longer quote a bound the maker's own scale contradicts.
 *
 * WHAT NO CALLER MAY DO WITH THIS is feed it to onSoapConcentrationChange. A jar diluted
 * thinner than the batch has not redefined the recipe — see the prohibition inside the
 * component — and exporting the resolution does not export permission to write it back.
 */
export function portionGradualFor({
  dilution,
  portionPasteGrams,
  portionWaterGrams,
  measuredPasteGrams,
  wholeBatchPasteGrams,
  cookWaterGrams,
}: {
  dilution: DilutionResult | null;
  portionPasteGrams: string;
  portionWaterGrams: string;
  /** The maker's whole-batch scale reading, as typed — the pot this jar was weighed out of
   * when it describes a possible one. Optional: absent, the batch basis is the recipe's own
   * computed pot, which is what every caller predating the reading passes. */
  measuredPasteGrams?: string;
  wholeBatchPasteGrams?: number | null;
  cookWaterGrams?: number;
}): PortionGradualState {
  // '' parses to NaN, never to 0 — an empty field is "nothing typed yet", not the
  // legitimate zero-water reading. Same rule as gradualWaterNum in the batch scope.
  const pasteNum = portionPasteGrams.trim() === '' ? NaN : Number(portionPasteGrams);
  const waterNum = portionWaterGrams.trim() === '' ? NaN : Number(portionWaterGrams);
  const batchPasteGrams =
    weighedOrComputedPotGramsFor(dilution, measuredPasteGrams, wholeBatchPasteGrams, cookWaterGrams)
      ?.grams ?? null;
  // THE SWALLOWED SEPARATOR, on this mode's own two fields: `<input type="number">` reads a
  // typed comma as a decimal point in every locale, so 1,300 g of paste commits as '1.300' and
  // 2,000 g of water as '2.000'. Both parse to a perfectly finite, positive number, so nothing
  // downstream can see the mistake — the jar simply becomes a thousand times smaller, and the
  // preservative dose App takes from it (a % of a mass with a legal ceiling) shrinks with it.
  // The fingerprint is the same one the measured-paste field and "Amount to make (ml)" are
  // judged by, on the same reasoning: no scale weighing a jar reads finer than 0.1 g.
  //
  // Resolved here rather than in the component's render so the figures, the alerts and App's
  // dose suppress together — the discipline portionDilutionFor's targetMlSubTenthPrecision
  // already follows for its own field.
  const pasteSubTenthPrecision = subTenthPrecisionFingerprint(portionPasteGrams);
  const waterSubTenthPrecision = subTenthPrecisionFingerprint(portionWaterGrams);
  const refusedByPrecision = pasteSubTenthPrecision || waterSubTenthPrecision;
  const hasBothFigures =
    !refusedByPrecision &&
    Number.isFinite(pasteNum) &&
    pasteNum > 0 &&
    Number.isFinite(waterNum) &&
    waterNum >= 0;
  if (!dilution || !hasBothFigures || batchPasteGrams === null) {
    return {
      jar: null,
      hasBothFigures,
      pasteExceedsBatch: false,
      batchPasteGrams,
      pasteSubTenthPrecision,
      waterSubTenthPrecision,
    };
  }
  const potAnhydrousGrams = lsPotAnhydrousShare({
    anhydrousGrams: dilution.anhydrousGrams,
    wholeBatchPasteGrams: batchPasteGrams,
    potPasteGrams: pasteNum,
  });
  if (potAnhydrousGrams === null) {
    return {
      jar: null,
      hasBothFigures,
      // Every other null from that helper needs a positive anhydrous soap and a positive
      // batch paste, both of which a live `dilution` already guarantees, so the reading
      // outweighing the batch is what is left — and it is the one a maker can act on.
      pasteExceedsBatch: pasteNum > batchPasteGrams,
      batchPasteGrams,
      pasteSubTenthPrecision,
      waterSubTenthPrecision,
    };
  }
  const finishedGrams = pasteNum + waterNum;
  return {
    jar: { finishedGrams, concentrationPercent: (potAnhydrousGrams / finishedGrams) * 100 },
    hasBothFigures,
    pasteExceedsBatch: false,
    batchPasteGrams,
    pasteSubTenthPrecision,
    waterSubTenthPrecision,
  };
}

/**
 * The swallowed-thousands-separator refusal, for the three GRAM fields gradual mode added:
 * the whole batch's "Water added so far", and a jar's "Paste weighed out" / "Water added so
 * far" in Custom amount. One component, so three fields cannot come to explain one mistake
 * three ways — the measured-paste field and "Amount to make (ml)" keep their own wordings,
 * which name a weight and a volume respectively rather than this shared "figure".
 *
 * The quoted value is the RAW TYPED STRING with " g" appended, never formatWeight: the
 * panel's gram formatter rounds to whole grams (and small figures to one decimal), so it
 * would print '2.000' as "2 g" — destroying the very decimals this alert exists to show.
 * Grams rather than the app-wide weight unit, like every other threshold in this panel: it is
 * the number the maker just typed into a grams-only field, echoed back exactly as the browser
 * committed it.
 *
 * The cause named is the separator, not the scale: browsers read a comma typed into
 * `<input type="number">` as a decimal point in every locale, so a typed 2,000 arrives as
 * '2.000' and no code downstream can see the comma (lib/measuredPaste's
 * subTenthPrecisionFingerprint holds the mechanism and the fingerprint itself).
 */
function SwallowedSeparatorAlert({ typed }: { typed: string }) {
  return (
    <p className="results-hint" role="alert">
      This field received {typed.trim()} g — more decimal digits than a scale reading
      carries, since no scale you weigh a batch on reads finer than 0.1 g. If you typed a
      thousands separator, this field reads the comma as a decimal point and the figure
      arrives a thousand times too small — re-enter it as plain digits, without separators.
    </p>
  );
}

export function DilutionPanel({
  dilution,
  soapConcentrationPercent,
  onSoapConcentrationChange,
  weightUnit,
  altLiquidWaterGrams = 0,
  unknownLiquidGrams = 0,
  overDilutionCertain = false,
  bottledSolutionGrams = null,
  // Deliberately NOT defaulted to 0. lib/measuredPaste has its own answer for "the cook
  // water is unknown" — fall the paste floor back to the anhydrous soap, byte-identical to
  // before the solids correction — and it can only give that answer if `undefined` reaches
  // it. A `= 0` default here spent that escape hatch at the component boundary: a caller
  // supplying `wholeBatchPasteGrams` alone would be read as "the pot is 1,600 g and none of
  // it is water", making the floor the whole pot and putting "soap and alternative-liquid
  // solids" on screen for a recipe that has no alternative liquid. Fail-closed, so no figure
  // was ever wrong — but the copy was, and the module's documented fallback was unreachable.
  // The two arithmetic sites below coalesce for themselves; the four guard call sites pass
  // this straight through.
  cookWaterGrams,
  dilutionMode = 'concentration',
  onDilutionModeChange,
  waterPasteRatio = '',
  onWaterPasteRatioChange,
  gradualWaterGrams = '',
  onGradualWaterChange,
  portionPasteGrams = '',
  onPortionPasteChange,
  portionWaterGrams = '',
  onPortionWaterChange,
  measuredPasteGrams,
  onMeasuredPasteGramsChange,
  dilutionScope = 'batch',
  onDilutionScopeChange,
  targetMl = '',
  onTargetMlChange,
  wholeBatchPasteGrams,
  preservativeSlot,
}: DilutionPanelProps) {
  // Set only by the ratio input's own onChange below — never by mode entry — so the
  // write-back effect further down can require a real edit before touching the saved
  // target. See that effect's comment for the bug this guards against.
  const [ratioTouched, setRatioTouched] = useState(false);
  // Gradual's own touched flag, same discipline as ratioTouched immediately above and for
  // the identical reason (see the reset effect right below, and the write-back effect
  // further down): set only by the water-added field's own onChange, never by entering the
  // mode, so a derived value is never written until the maker has actually typed something.
  const [gradualTouched, setGradualTouched] = useState(false);
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
    // Gradual is a second derived mode sharing this machinery, and the bug above is not
    // ratio-specific: leaving gradual to type an exact target on Target concentration, then
    // returning to gradual WITHOUT retyping the water, must not re-fire gradual's own
    // write-back and revert the typed value either. Same reset, same reason.
    setGradualTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dilutionMode]);
  // Which intended uses the current target suits — the dilution figure is the one number
  // with no chemistry to pin it, so the guidance is by product, not by recipe.
  const suitedUses = lsDilutionUsesFor(Number(soapConcentrationPercent));
  // Same guards PortionDilutionResults applies to the identical measurement: below the anhydrous
  // soap it cannot be a whole-batch paste, above the target solution there is no water left
  // to add. Both accept the boundary. A measured paste that survives these WINS over the
  // computed TARGET-DERIVED figures below — the portion — and this is the gate the copy about
  // them answers to: the "Dilution water above uses your measured paste" hint, and the
  // suppression of the two already-more-dilute alerts and the can't-tell hedge, all of which
  // speak in the maker's voice about a reading the exceeds-solution alert would otherwise be
  // refusing.
  //
  // TWO OTHER QUESTIONS have their own gates, and neither is this one. Which POT the derived
  // modes count from is potBasis just below. Which pot the batch POUR and
  // the bottled mass are measured against is lib/measuredPaste's correctedPotGramsFor — this
  // ceiling widened by exactly the gradual write-back's own rounding where the recipe's record
  // adds up to the target in force, so a target this record itself produced cannot refuse the
  // record, and this ceiling unchanged everywhere else; see that function.
  const measuredPasteValid =
    dilution !== null &&
    measuredPasteIsValidFor(
      measuredPasteGrams,
      dilution,
      MEASURED_PASTE_IS_REMAINING,
      wholeBatchPasteGrams,
      cookWaterGrams,
    );
  // WHICH POT THE DERIVED MODES COUNT FROM, and the one question a target must not answer.
  // lib/measuredPaste's target-independent resolution: the reading wins when it parses, is not
  // finer than a scale reads, and is not below the batch's own non-evaporable mass — the three
  // rules that describe the POT — and otherwise the recipe's computed pot answers. It
  // deliberately does not ask whether the reading is heavier than the
  // solution the saved target dilutes to, because ratio mode has no target and gradual mode
  // DERIVES one from this very basis: letting that ceiling choose the basis closed a live
  // render loop (weighed pot + zero water → write a percent → the solution it implies lands
  // a hair under the reading → reject → computed pot → a different percent → accept →
  // forever). See weighedOrComputedPotGramsFor and measuredPasteDescribesPotFor for the full
  // account and the swept numbers.
  //
  // Resolved in lib/measuredPaste rather than here so the printed BatchSheet's "That record
  // makes" row reaches the identical figure by CALLING the same function, instead of importing
  // half of it out of this component module and hand-rolling the rest — which is how the sheet
  // came to answer with one gate what its own pour answered with another.
  //
  // The reading is still judged against the ceiling everywhere the ceiling means something:
  // measuredPasteValid above (the portion, and the copy that speaks for a reading) keeps it
  // exactly, the rejection alerts below keep it exactly, and the batch pour and the bottled
  // mass keep it widened by the write-back's own rounding wherever the record adds up to the
  // target (correctedPotGramsFor). Only the basis this line chooses drops it altogether.
  const potBasis = weighedOrComputedPotGramsFor(
    dilution,
    measuredPasteGrams,
    wholeBatchPasteGrams,
    cookWaterGrams,
  );
  const measuredPasteDescribesPot = potBasis?.fromMeasurement ?? false;
  // Only meaningful when measuredPasteValid / measuredPasteDescribesPot —
  // parseMeasuredPasteGrams then always succeeds.
  const measuredPasteNum = parseMeasuredPasteGrams(measuredPasteGrams) ?? NaN;
  // Is there a reading in the field at all — accepted or not? Only the ratio caveat below
  // asks, and only to decide whether to close with "weigh the paste". A reading this row cannot
  // use (a rejected one) still leaves the ratio running on the computed paste, so the caveat's
  // VERDICT holds either way; what would not hold is telling a maker who has just been to the
  // scale to go to the scale. Every such reading already has its own rejection alert on
  // screen explaining it.
  const pasteReadingEntered = (measuredPasteGrams ?? '').trim() !== '';
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
        MEASURED_PASTE_IS_REMAINING,
        wholeBatchPasteGrams,
        cookWaterGrams,
      )
    : null;
  // Whether the exceeds-solution refusal is ACTUALLY ON SCREEN, not merely flagged. The two
  // mode exclusions are the paragraph's own (see its full reasoning where it renders): every
  // clause of it is about a TARGET the paste cannot reach, and neither derived mode is aiming
  // at one. Named here because two places need the answer and they must never drift: the
  // paragraph itself, and the solubility ceiling below, whose suppression is subsumption —
  // it stands down only while a stronger claim about the same target is on screen, so it has
  // to ask whether this one renders rather than whether the rule fired.
  const exceedsSolutionAlert =
    (measurementRejection?.exceedsSolution ?? false) &&
    dilutionMode !== 'ratio' &&
    dilutionMode !== 'gradual';
  // There is deliberately NO "is any rejection paragraph on screen" const here any more. One
  // existed (measurementRejectionAlert, the disjunction of the four rules' render conditions)
  // for exactly one consumer: the corrected-pot verdict's spoken-for disjunction kept a
  // refusal as a third voice for one round. That voice is gone (decided 2026-08-16, second
  // round — see pasteAlreadyPastTargetSpokenFor), and the const went with it rather than
  // idling as a drift hazard: it re-read three raw flags in parallel with the render sites,
  // so any future mode gate on one of those paragraphs would have had to be mirrored here by
  // hand or the two answers forked. noUnusedLocals would have forced the deletion anyway;
  // this is it done on purpose, with the reasoning written down.
  // Ratio mode (LS:1534): weigh the paste, then add water at 1:1 / 2:1 / 3:1 by weight.
  // Prefer a valid MEASURED paste — the reference's ratio method is applied to a weighed
  // paste. Otherwise pasteGrams is anhydrousGrams + the paste's TRUE water — not
  // dilution.totalWaterGrams - dilutionWaterGrams, which the targetExceedsPaste clamp on
  // dilutionWaterGrams can zero out (see DilutionPanelProps.cookWaterGrams and
  // PortionDilutionResults' identical trap).
  const ratioNum = Number(waterPasteRatio);
  const ratioValid = Number.isFinite(ratioNum) && ratioNum > 0;
  // The corrected whole-batch paste when the view model has one — the same basis
  // measuredPasteRejectionFor judges a reading against (its wholeBatchPasteBasis), and the
  // same one forwarded to PortionDilutionResults. anhydrousGrams +
  // cookWaterGrams counts only the WATER fraction of an alternative liquid, so on a
  // split-liquid recipe it undercounts the pot by that liquid's solids: 300 g anhydrous +
  // 100 g cook water against a true 470 g pot printed 800 g of water for 2:1 where the pot
  // needs 940 g — a 140 g under-dose, computed from a basis this component was already
  // holding the correction for. Falls back to the water-only figure when there is no
  // corrected one (no split liquid, or a caller predating the prop), which is byte-identical
  // to before for those recipes. (computedPotGramsFor is that figure, and it is only ever the
  // RECIPE's own prediction — the reading is preferred by the resolution above, never by this
  // one. It answered to "bestKnown" while both were true of it, and a caller reading the name
  // rather than the body sized a jar from the prediction while every figure beside it came off
  // the scale.)
  //
  // Whether the figures on screen were derived from the corrected paste decides whether they
  // are declaration-invariant or a lower bound, and those are opposite things to tell the
  // maker. The predicate itself is lib/measuredPaste's, shared with the pot resolutions and
  // the paste floor it also gates — six hand-written copies of the same four clauses is how a
  // surface ends up counting an alternative liquid's solids while its neighbour does not.
  const correctedPasteBasis = hasCorrectedPasteBasis(wholeBatchPasteGrams);
  const computedPasteGrams = computedPotGramsFor(dilution, wholeBatchPasteGrams, cookWaterGrams);
  // The pot ratio mode multiplies, and gradual sums with the record below: the reading when it
  // describes a possible POT, else the recipe's own computed pot. One resolution
  // (weighedOrComputedPotGramsFor, above), shared with the jar in Custom amount and with the
  // printed sheet, so no two surfaces can answer this question differently.
  //
  // The gate there is deliberately NOT measuredPasteValid, which both modes used until the
  // loop above forced the split: that one also asks whether the reading is heavier than the
  // solution the SAVED TARGET dilutes to, and neither derived mode has a target — ratio
  // multiplies whatever pot it is given, and gradual writes the target this expression
  // produces. A basis chosen by a figure downstream of itself is not a basis. The batch pour
  // one screen below still answers to a ceiling, because solutionGrams − measured really does
  // have to be a pour it can print — but to correctedPotGramsFor's, which is this ceiling
  // widened by the write-back's own rounding for a record that adds up to the target, so the
  // pour and the bottled mass count from the same pot this line does whenever the target IS
  // this record's, and only then. That agreement is the point:
  // while they disagreed, the panel printed "Finished so far (weighed) 1,405 g" beside a
  // 1,600 g finished product with a legally-capped preservative dose taken against the second.
  //
  // wholeBatchPasteGrams (anhydrousGrams + cookWaterGrams + splitLiquidSolidsGrams,
  // computed in the view model) is a PREDICTION and is never corrected by a measured
  // reading — the two figures live independently, and that resolution is where the app
  // decides between them. A cook boils off water the recipe still counts, and nothing on
  // paper knows how much a particular cook drove off, which is the whole reason the
  // reference has the maker weigh the paste; a valid measurement is direct evidence
  // against the prediction and always outranks it.
  const pasteGrams = potBasis?.grams ?? null;
  // Gradual Dilution (LS:1531): the maker records water actually poured, and the
  // concentration is DERIVED from that record rather than targeted — the opposite
  // direction from concentration and ratio mode, which both choose a number and let the
  // app find the water. Counts from `pasteGrams` immediately above — the pot the maker
  // weighed when that reading describes a possible pot, else the recipe's computed one —
  // exactly the basis ratio mode already prefers a reading over, so gradual and ratio can
  // never disagree about which pot they are pouring into. The readout below names which of
  // the two it used ("weighed" / "computed"), the same discipline basisScope's "(whole
  // batch)" / "(custom amount)" labels already practice for naming a figure's basis.
  //
  // '' parses to NaN, never to 0: gradualDilutionFrom's zero is a legitimate reading (the
  // pot before any water — Gradual Dilution's own starting point), so an EMPTY field must
  // not collapse to the same result as a typed "0", or the readout and write-back would
  // fire before the maker had recorded anything at all. Through the shared parser, which
  // answers that same "is there a record" question for the printed sheet's two record rows
  // and for the paste ceiling behind the pour row (lib/measuredPaste) — NaN for "no record"
  // because that is what core's gradualDilutionFrom refuses, so this reads identically to
  // the hand-written parse it replaces (a negative is not a pour either way: the parser
  // returns undefined, core rejects it).
  const gradualWaterNum = parseGradualWaterRecordGrams(gradualWaterGrams) ?? NaN;
  // Why that parse came back empty, when it did: the shared parser refuses a record carrying
  // a swallowed thousands separator (a typed 2,000 commits as '2.000'), which is what stops
  // 2 g of water writing a target, printing on the sheet and widening the paste ceiling. The
  // FIELD is here, so the refusal has to be explained here — read from the same fingerprint
  // the parser applies, never a second copy of the rule.
  const gradualWaterSubTenthPrecision = subTenthPrecisionFingerprint(gradualWaterGrams);
  const gradual =
    dilution && pasteGrams !== null
      ? gradualDilutionFrom({
          pasteGrams,
          anhydrousGrams: dilution.anhydrousGrams,
          waterAddedGrams: gradualWaterNum,
        })
      : null;
  // Gradual Dilution, for a JAR in Custom amount scope rather than the whole batch — and
  // THE CENTRAL PROHIBITION this task exists to enforce: this concentration is NEVER
  // written to settings.soapConcentrationPercent. `gradual` immediately above IS the
  // recipe's own record — whole-batch gradual legitimately redefines the recipe's target,
  // because the batch IS the recipe. A maker who dilutes ONE JAR thinner than the batch
  // has not redefined the recipe, so `portionGradual` below reaches only the readouts
  // further down; no effect anywhere in this file reads it, and none may be added that
  // does (a regression test asserts on the onSoapConcentrationChange spy itself, not on a
  // rendered figure — the damage is the write, not the display). The prohibition travels
  // with the exported resolution: App's only use of it is the preservative dose, which is a
  // percentage of the jar and never a write into the recipe's target.
  //
  // Resolved by portionGradualFor (module scope, above) rather than inline, so App can ask
  // the SAME question for the preservative dose — in Custom amount the dose is a % of the
  // jar, and it used to be a % of a target-derived portion the maker never asked for. The
  // jar's own soap comes from core's lsPotAnhydrousShare there; see that function and
  // portionGradualFor's own doc for why it no longer travels through lsPartialDilution.
  //
  // Null outside its own scope+mode, which every consumer of it below already gates on: a jar
  // is a claim about what Custom amount + Gradual is showing, and resolving one for a screen
  // that shows no jar invites a future reader to consume it from a state where the two fields
  // behind it are stale session values. Its sibling `portionState` is null there for the
  // sharper version of the same reason — see it.
  const portionGradualState =
    dilutionScope === 'portion' && dilutionMode === 'gradual'
      ? portionGradualFor({
          dilution,
          portionPasteGrams,
          portionWaterGrams,
          measuredPasteGrams,
          wholeBatchPasteGrams,
          cookWaterGrams,
        })
      : null;
  const portionGradual = portionGradualState?.jar ?? null;
  // The correction computedPasteGrams carries over the recipe's own water-only figure —
  // an alternative liquid's non-water solids. Derived from that same basis rather than
  // taken as a prop so it can never disagree with the paste the figures are computed from;
  // zero when there is no corrected basis, which is every recipe without a split liquid.
  // Deliberately still keyed on computedPasteGrams, NOT pasteGrams: this is the
  // alternative liquid's contribution to the recipe's OWN computed pot, a property of the
  // recipe rather than of what a maker happened to weigh, and it must stay the same figure
  // whether or not a measurement is on the field.
  const splitLiquidSolidsGrams =
    dilution && computedPasteGrams !== null
      ? Math.max(0, computedPasteGrams - (dilution.anhydrousGrams + (cookWaterGrams ?? 0)))
      : 0;
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
  // The PRIMITIVE gradual writes, hoisted out of the object so the effect below can depend
  // on it directly. gradualDilutionFrom returns a fresh object every call (no useMemo — see
  // `gradual`'s own comment), so `gradual` itself is a new reference on every render;
  // useEffect compares dependencies by reference, so listing the object would re-fire the
  // effect on every re-render while touched, not only when the derived percentage actually
  // changes — and since the effect calls onSoapConcentrationChange, which (in App) always
  // spreads a new settings object, App re-renders, this component is rebuilt, `gradual` is
  // a new reference with identical values, and the effect fires again: an unbounded render
  // loop from the first keystroke. Depending on this primitive instead is what makes React
  // bail out on an unchanged value — the same property ratio's own effect comment names,
  // which only holds for primitives, not for a freshly-allocated object.
  const gradualWriteBack = gradual?.writeBackPercent ?? null;
  // Gradual's twin of ratioNotAppliedYet above, and it exists for the identical reason: the
  // write-back waits for a real edit to the water field (gradualTouched — see its own
  // comment), so entering gradual mode leaves the saved target in force and the panel shows
  // TWO masses for one batch. Record 2,000 g, switch to Target concentration, type 50%,
  // switch back: the re-entry guard correctly declines to rewrite, and the screen then reads
  // "Finished so far 3,666 g" above a 2,444 g finished product and a preservative dose that
  // is a percentage of the second one. Nothing said they were answers to different
  // questions — the exact split ratio's own clause was written to name, reintroduced
  // unnamed. Naming it is the fix here too; writing back on entry is not (it reverts a typed
  // target with no undo, which is the bug gradualTouched exists for).
  //
  // Whole-batch scope only: portion gradual never writes back at all — a jar diluted thinner
  // has not redefined the recipe — and its own readout already echoes the saved target
  // read-only, which says the same thing in the place it belongs.
  //
  // The 0.005 threshold is half of the write-back's own 2 dp rounding (ratio's is 0.05 for
  // its 1 dp), so anything closer than that IS the saved target and there is no split.
  const gradualNotAppliedYet =
    dilutionMode === 'gradual' &&
    dilutionScope === 'batch' &&
    !gradualTouched &&
    gradualWriteBack !== null &&
    Number.isFinite(persistedTargetPercent) &&
    Math.abs(gradualWriteBack - persistedTargetPercent) >= 0.005;
  // Gradual's write-back, mirroring ratio's immediately above: same touched-gate (see
  // gradualTouched's own comment — entering a derived mode must not write anything on its
  // own) and the same target field. Unlike ratio's effect this does NOT list
  // soapConcentrationPercent as a dependency: gradualWriteBack is derived from the paste
  // basis, the recorded water and the batch's anhydrous soap, and none of those reads the
  // persisted target — so there is nothing here an external change to that target would
  // need to resync.
  //
  // THAT INDEPENDENCE IS LOAD-BEARING, and this comment asserted it for a while before it
  // was true. gradualWriteBack reaches back through `gradual` → `pasteGrams`, and while
  // that selection ran on measuredPasteValid it consulted dilution.solutionGrams — which is
  // anhydrous ÷ the persisted target, i.e. the figure this effect writes. With a weighed pot
  // and no water recorded the two are the same number up to 2 dp of rounding, so the ceiling
  // flipped on the panel's own output and the write-back oscillated without settling: 223 of
  // 445 whole-gram readings in one swept window, and a hung tab through <App/>. The basis
  // now runs on measuredPasteDescribesPot, which asks only about the pot; see its comment
  // above and lib/measuredPaste's measuredPasteDescribesPotFor. If a future edit puts
  // anything target-derived back into this chain, this effect loops again.
  useEffect(() => {
    if (gradualTouched && dilutionMode === 'gradual' && gradualWriteBack !== null) {
      onSoapConcentrationChange(String(gradualWriteBack));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gradualTouched, dilutionMode, gradualWriteBack]);
  // The measurement corrects the BATCH figure the same way it already corrects the portion
  // in PortionDilutionResults — shared with the printed BatchSheet so both surfaces always agree.
  // wholeBatchPasteGrams is passed for the second correction the helper applies: without it
  // this row derived its water from calculateDilution's anhydrous + water pot while the
  // ratio block above derived its own from computedPasteGrams, which counts an alternative
  // liquid's solids. Two figures on one screen, differing by exactly those solids (5,000 g
  // at the ratio against 5,450 g here and on the printed sheet). Same basis both ways now.
  const batchDilutionWaterGrams = dilution
    ? correctedDilutionWaterGrams(
        dilution,
        measuredPasteGrams,
        MEASURED_PASTE_IS_REMAINING,
        wholeBatchPasteGrams,
        cookWaterGrams,
        // The record is what licenses the widened paste ceiling that helper judges the
        // reading against (lib/measuredPaste's correctedPotGramsFor). Passed here so this
        // row, the printed sheet's twin of it and the bottled mass all choose the pot by one
        // rule; without it this row would pour against solutionGrams exactly while the
        // bottled figure counted from the weighed pot, which is the split the ceiling exists
        // to close.
        gradualWaterGrams,
      )
    : 0;
  // Asked of the same helper PortionDilutionResults itself renders from, so the shell can
  // never believe something about Custom amount that Custom amount does not show. The
  // portion figures are still the child's to render; the shell reads this verdict for two
  // things only — the density caveat below (which needs a millilitre figure to explain) and
  // portionOwnsUndeclaredLiquidHedge, which suppresses the shell's copy of a hedge the child
  // is already printing in its own words.
  //
  // NULL IN GRADUAL MODE, and in whole-batch scope, because the child that answers for it is
  // not on screen in either. `targetMl` is App session state that survives a mode switch, so
  // in gradual it holds a figure from whatever mode came before — the child was suppressed for
  // exactly that reason, while these two derived verdicts went on keying on it. The density
  // caveat then printed "Volume assumes ~1.03 g/ml" beside no millilitre figure at all (the
  // state its own comment says it exists to prevent), and the hedge the child was no longer
  // rendering was suppressed here as though it were.
  const portionState =
    dilution && dilutionScope === 'portion' && dilutionMode !== 'gradual'
      ? portionDilutionFor({
          dilution,
          targetMl,
          measuredPasteGrams: measuredPasteGrams ?? '',
          wholeBatchPasteGrams,
          cookWaterGrams,
        })
      : null;
  const portionOnScreen = portionState?.portion != null;
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
  const portionOwnsUndeclaredLiquidHedge = portionState?.pasteAlreadyThinner ?? false;
  // dilutionTargetWording and PortionDilutionResults are typed against the narrower
  // 'concentration' | 'ratio' union on purpose — see dilutionTargetWording's own doc
  // comment: the type dependency stays one-way, this component imports theirs, not the
  // reverse, so they cannot import DilutionMode back.
  //
  // NEITHER CONSUMER IS REACHABLE IN GRADUAL MODE ANY MORE, so the mapping below no longer
  // decides anything, and that is deliberate rather than lucky. PortionDilutionResults does
  // not render in gradual (a stale `targetMl` was otherwise putting its whole target-derived
  // grid on screen beside the jar's own recorded figures), and the one refusal that words
  // itself through dilutionTargetWording — pasteAlreadyPastTarget — is suppressed in gradual
  // too, because it explains a "Dilution water to add" row that mode does not print and its
  // remedy named the concentration field that mode does not show. A mapping of gradual onto
  // 'concentration' can only ever produce copy naming a control gradual removed; keeping the
  // narrowing means the type system still forces a decision here if a future consumer needs
  // one, instead of quietly inheriting concentration mode's wording.
  const narrowDilutionMode = dilutionMode === 'gradual' ? 'concentration' : dilutionMode;
  // Shared with PortionDilutionResults so this shell's Whole-batch twin of that refusal and
  // the child's own Custom-amount wording of it can never name different controls.
  const refusalWording = dilutionTargetWording(narrowDilutionMode, ratioNotAppliedYet);
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
  // reach here at all (computedPasteGrams is then exactly anhydrous + cookWater): a true
  // verdict always comes off the corrected, solids-aware pot.
  //
  // Suppressed by a VALID measurement, exactly as the targetExceedsPaste alert below is:
  // the measured-paste guards already refuse a reading heavier than the solution (with their
  // own alert), so a reading that survives them leaves solutionGrams - measured >= 0 and no
  // clamp to explain. A REJECTED reading is NOT suppressed: the row falls back to the
  // recipe's own clamped figure in that case, and the rejection alert speaks only about the
  // reading — it never accounts for the zero underneath it.
  //
  // Flat, with no overDilutionCertain hedge: this verdict reduces to
  // wholeBatchPasteGrams > solutionGrams, and BOTH sides of that are fixed whatever the
  // undeclared liquid contains. solutionGrams is anhydrous ÷ the target, and the view model's
  // wholeBatchPasteGrams is anhydrous + cookWater + solids where solids is (liquid total −
  // its water) — so it collapses to anhydrous + lye water + the liquid's total mass, with the
  // water/solids split cancelling out. Declaring the liquid's % water moves water into solids
  // and back, and never moves this sum. No collision with the "can't tell whether X% is
  // reachable" hedge either — that one is gated on targetExceedsPaste, which is false here.
  //
  // NOT IN GRADUAL MODE. This alert exists to account for a "0 g" in the "Dilution water to
  // add" row, and gradual mode does not render that row at all (see its own gate below —
  // gradual has no persisted target for it to answer). What is left is a paragraph whose
  // remedy names the concentration field gradual removes from the panel, whose closing
  // clause tells a maker to weigh the paste they may have just weighed, and whose quoted
  // figure is the COMPUTED pot even when gradual is counting from the weighed one — three
  // claims about a screen that is not there. Reachable, too: after a record writes back, the
  // saved target is the record's own, and a pot heavier than the reading satisfies this.
  const pasteAlreadyPastTarget =
    dilution !== null &&
    dilutionMode !== 'gradual' &&
    !dilution.targetExceedsPaste &&
    !measuredPasteValid &&
    computedPasteGrams !== null &&
    computedPasteGrams > dilution.solutionGrams;
  // The water-only twin of that verdict — targetExceedsPaste's own alert — as a RENDER
  // CONDITION rather than as the flag. Every clause is that paragraph's own and keeps its own
  // reasoning where it renders; what this name buys is that the solubility ceiling below can
  // ask whether the paragraph is on screen instead of whether the flag is set. The two answer
  // differently, which is the whole reason this exists: a valid reading suppresses the
  // paragraph by design and leaves the flag standing.
  //
  // Whole-batch only, like the sibling above and for a plainer reason than either of theirs:
  // it lives inside the batch-scope block. In Custom amount the child says the same thing in
  // its own words (PortionDilutionResults' pasteAlreadyThinner), which is why the ceiling's
  // suppression reads that too rather than this alone.
  const pasteAlreadyThinnerAlert =
    dilution !== null &&
    dilutionScope === 'batch' &&
    dilution.targetExceedsPaste &&
    !measuredPasteValid &&
    !(measurementRejection?.rejected ?? false) &&
    (unknownLiquidGrams === 0 || overDilutionCertain);
  // The corrected-pot alert's RENDER CONDITION, on the same discipline as the sibling
  // above: the predicate has no dilutionScope term, but its paragraph lives inside the
  // batch-scope block, so the two answer differently in Custom amount. Named so that block
  // and the solubility ceiling's suppression (pasteAlreadyPastTargetSpokenFor below) read
  // one answer and cannot drift — the ceiling used to read the bare predicate here, and the
  // pair of them held together only by coincidence of this component and the child agreeing.
  const pasteAlreadyPastTargetAlert = dilutionScope === 'batch' && pasteAlreadyPastTarget;
  // ── The alternative-liquid paragraph, and the portion-scope note the child carries ──
  // Three hints used to render as separate paragraphs — the head start, the can't-tell
  // hedge, the undeclared-liquid floor — and a split-liquid recipe could stack all three
  // under the ratio readout. They are one topic (what the alternative liquid does to the
  // water figures), so they are one paragraph now: every clause keeps its old gate and its
  // old wording, and the exclusions between them (targetExceedsPaste splits the hedge from
  // the floor; a valid measurement or the portion's own hedge silences the can't-tell) are
  // unchanged. In Custom amount the head-start and floor clauses ride the child's own
  // status paragraph instead (composed here, where the batch wordings live, so the two
  // scopes' wordings cannot drift apart) — and only once a portion actually renders, which
  // closes a hole this shell used to have: "the figures here are net of it" printed with
  // no figures on screen when the portion was refused. The hedge stays the shell's in both
  // scopes, exactly as before.
  //
  // Head-start gate: "did this liquid take anything off the water to add" — water OR
  // solids, not water alone. The figure it explains is derived from the corrected paste,
  // which counts both, so a water-only gate withheld the paragraph from exactly the
  // recipes whose drop is largest (glycerin: waterFraction 0). An undeclared liquid does
  // not withhold it outright, only the claims it makes unknowable: solids come from
  // DECLARED rows alone, so they are exact whatever the undeclared grams contain, and the
  // undeclared wording names them and the row they are missing from without claiming a
  // head start (the pour is lighter by the assumed water too, and that part is not
  // knowable). Each wording quotes only what its own liquid actually contributed.
  const altLiquidGate =
    unknownLiquidGrams === 0
      ? altLiquidWaterGrams > 0 || splitLiquidSolidsGrams > 0.5
      : splitLiquidSolidsGrams > 0.5;
  // The can't-tell hedge: targetExceedsPaste is a factual claim about the paste derived
  // from an ASSUMED water content, so with an undeclared liquid it is suppressed, not
  // reworded — asserting it can tell the user a batch is finished when it still needs
  // hundreds of grams of water. A valid whole-batch reading settles the question (the
  // over-dilution alert above is gated the same way and for the same reason), and in
  // Custom amount the child's own suppressed-portion hedge says the same thing with the
  // missing figures explained, so it owns the message there — EXCEPT in gradual, where that
  // child does not render at all. `portionState` is resolved only for portion + non-gradual
  // for exactly that reason, so `portionOwnsUndeclaredLiquidHedge` is false there and this
  // shell clause speaks instead.
  //
  // It did not always. While `portionState` was still computed from a stale `targetMl` in
  // gradual too, `pasteAlreadyThinner` could be true — suppressing this clause in favour of
  // a child that had already been suppressed, so the warning appeared on NEITHER surface and
  // an undeclared liquid went unmentioned. Pinned by a test.
  const cantTellGate =
    dilution !== null &&
    dilution.targetExceedsPaste &&
    unknownLiquidGrams > 0 &&
    !overDilutionCertain &&
    !portionOwnsUndeclaredLiquidHedge &&
    !measuredPasteValid;
  // ── Is targetExceedsPaste SPOKEN FOR: does anything on screen answer for the flag? ──
  // The solubility ceiling below stands down for it, and a suppression that is subsumption
  // has to ask about a rendering, not about a flag. The flag has two voices and they are
  // gated apart from each other, so no single one of them is the answer:
  //
  //   Whole batch, nothing wrong with the reading  → the alert above (pasteAlreadyThinnerAlert)
  //   Custom amount, same state                    → the child says it (pasteAlreadyThinner)
  //
  // The disjunction is what makes this safe in BOTH directions. Keyed on the flag, the
  // ceiling went silent in the one state where the flag has no voice at all — a VALID
  // reading, which suppresses the alert by design (a measurement outranks the assumed cook
  // water the flag is derived from) and suppresses the hedge and the child with it. Keyed on
  // one voice alone, it would have stacked a second paragraph onto the other.
  //
  // A REFUSED reading is deliberately NOT a voice (decided 2026-08-16; a disjunct,
  // `targetExceedsPaste && !measuredPasteValid && measurementRejectionAlert`, used to sit
  // here). This suppression's licence is a stronger claim about the SAME target, and the
  // reading-only refusals — "cannot be all of the paste", not a positive weight, typed-
  // separator precision — say nothing about what this target can dissolve, so the ceiling
  // now speaks beside them: one claim about the reading, one about the target, exactly what
  // the flag-FALSE side has always shown (the "speaks alongside a refusal that is only
  // about the reading" test). The one refusal that IS about the target — exceeds-solution —
  // still silences the ceiling through the ceiling's own `!exceedsSolutionAlert` clause,
  // which asks about that paragraph's rendering with no flag attached; a
  // `targetExceedsPaste && exceedsSolutionAlert` disjunct here would be strictly subsumed
  // by it, so no rejection clause remains rather than a dead one being kept.
  //
  // NEITHER IS THE CAN'T-TELL HEDGE, any longer (decided 2026-08-16, second round; a
  // `cantTellGate` disjunct sat here from the day this const was named, and the "left
  // undecided, so left" note it carried now has its decision). The hedge is a claim about
  // the BATCH's water — can't tell whether N% is REACHABLE while an undeclared liquid
  // hides how much of the pot is already water. The ceiling sentence is a fact about the
  // SAVED TARGET — N% is above what any recipe dissolves — and no liquid, declared or not,
  // moves it. An uncertainty about the batch is not a verdict about the target: both are
  // true, and both render. The hedge stays a plain paragraph, so those cells still show
  // exactly one alert.
  const overDilutionSpokenFor =
    pasteAlreadyThinnerAlert ||
    (portionState?.pasteAlreadyThinner ?? false);
  // ── Is the corrected-pot verdict (pasteAlreadyPastTarget) SPOKEN FOR? ── The sibling
  // question to the one above, for the ceiling's second clause, which used to read the bare
  // predicate. That predicate is scope-blind while its alert is batch-only, and the child's
  // own wording of the verdict (unmeasuredPasteAlreadyThinner) requires an unrejected
  // reading — so in Custom amount, with a reading whose refusal is excluded from the mode
  // (exceeds-solution in ratio), every voice was gated off at once and the predicate went
  // on silencing the ceiling over a screen that said NOTHING. Decided 2026-08-16: keyed on
  // renderings, so only the genuinely silent cells gain the ceiling. The verdict has
  // exactly two voices:
  //
  //   Whole batch                       → the corrected-pot alert (pasteAlreadyPastTargetAlert)
  //   Custom amount, unrejected reading → the child says it (unmeasuredPasteAlreadyThinner)
  //
  // No hedge row: this verdict is liquid-invariant (see the predicate's own comment).
  //
  // A REFUSED reading is not a voice here any more than it is above (decided 2026-08-16,
  // second round; a third disjunct, `pasteAlreadyPastTarget && measurementRejectionAlert`,
  // sat here for one round on the ground that the first decision covered only
  // targetExceedsPaste's suppression). The decision now reaches this side too, and it is
  // the same rule: only a verdict about the TARGET may silence the target's warning. The
  // reading-only refusals say nothing about what this target can dissolve, so in Custom
  // amount — where neither remaining voice can render beside a refusal — the ceiling now
  // speaks beside them, the exact pair the targetExceedsPaste side already shows. In Whole
  // batch nothing changes: the corrected-pot alert itself renders beside the refusal, and
  // the first disjunct already answers. The one refusal that IS about the target —
  // exceeds-solution — still silences the ceiling through the ceiling's own
  // `!exceedsSolutionAlert` clause, which asks about that paragraph's rendering with no
  // flag attached; so once again no rejection clause remains rather than a dead one being
  // kept.
  const pasteAlreadyPastTargetSpokenFor =
    pasteAlreadyPastTargetAlert ||
    (portionState?.unmeasuredPasteAlreadyThinner ?? false);
  // The floor/same-either-way clause: only when a positive floor exists (when the target
  // already exceeds the paste, the hedge owns the message — rendering this too repeated
  // "declare its % water" verbatim and printed a vacuous "0 g is the LEAST you will
  // need"). The quoted batch figure is the CORRECTED one the row above prints, and with a
  // corrected basis it is not a bound at all: the water to add is solutionGrams −
  // (anhydrous + lye water + the liquid's whole mass), and declaring the % water only
  // moves mass between that liquid's water and its solids — never the sum. What the
  // declaration really buys is knowing how much of the PASTE is water.
  const floorGate =
    dilution !== null &&
    altLiquidWaterGrams > 0 &&
    unknownLiquidGrams > 0 &&
    !dilution.targetExceedsPaste;
  const shellAltLiquidClauses: string[] = [];
  if (dilution && dilutionScope === 'batch' && altLiquidGate) {
    // The last sentence is the load-bearing one: it is the only place telling the maker
    // not to top up with more milk or juice. The head start is the liquid's WHOLE mass
    // once the water figure is derived from the corrected paste — its solids occupy room
    // in the finished solution too, so they come off the water to add exactly as its water
    // does. The water-only wording is kept verbatim for the recipes it is still exactly
    // right for (a liquid that is all water, or no corrected basis at all).
    shellAltLiquidClauses.push(
      `${
        unknownLiquidGrams > 0
          ? `${formatWeight(splitLiquidSolidsGrams, weightUnit)} of your alternative liquid is solids rather than water: they take up room in the finished solution, so they come off the water to add and are not part of the total water above.`
          : splitLiquidSolidsGrams > 0.5
            ? altLiquidWaterGrams > 0
              ? `Already ${formatWeight(altLiquidWaterGrams + splitLiquidSolidsGrams, weightUnit)} lighter: ${formatWeight(altLiquidWaterGrams, weightUnit)} of water that went into the paste, and ${formatWeight(splitLiquidSolidsGrams, weightUnit)} of solids that take up room in the finished solution.`
              : `Already ${formatWeight(splitLiquidSolidsGrams, weightUnit)} lighter: the alternative liquid brought no water, and all of it is solids that take up room in the finished solution.`
            : `Already ${formatWeight(altLiquidWaterGrams, weightUnit)} lighter: that much water came in with the alternative liquid and is counted as part of the paste.`
      } Top up with plain distilled water only.`,
    );
  }
  if (dilution && cantTellGate) {
    shellAltLiquidClauses.push(
      `Can't tell whether ${formatConcentrationPercent(dilution.soapConcentrationPercent)}% is reachable — ${formatWeight(unknownLiquidGrams, weightUnit)} of alternative liquid has no declared water content. Declare its % water in Split liquid.`,
    );
  }
  if (dilution && dilutionScope === 'batch' && floorGate) {
    shellAltLiquidClauses.push(
      `${formatWeight(unknownLiquidGrams, weightUnit)} of alternative liquid has no declared water content — ${
        correctedPasteBasis ? 'but' : 'it is counted as all water, so'
      } ${formatWeight(batchDilutionWaterGrams, weightUnit)} is ${
        correctedPasteBasis
          ? "the same either way: the liquid's whole mass is in the pot however its water and solids divide up. Declaring the % water tells you how much of your paste is water, not how much to add."
          : 'the LEAST you will need. Declare its % water, or dilute in increments and check by weight.'
      }`,
    );
  }
  // The same two clauses in their portion wordings — no batch figure travels into Custom
  // amount (the head start is a whole-batch number, and quoting it beside a much smaller
  // portion water figure said nothing about which is which). Rendered by the child inside
  // its own status paragraph, and therefore only beside a portion that actually computed.
  const portionAltLiquidClauses: string[] = [];
  if (dilution && dilutionScope === 'portion' && altLiquidGate) {
    portionAltLiquidClauses.push(
      `${
        unknownLiquidGrams > 0
          ? 'Part of your alternative liquid is solids rather than water: they take up room in the finished solution, so they come off the water to add.'
          : altLiquidWaterGrams > 0
            ? 'Part of the water is already there: it came in with the alternative liquid and is counted as part of the paste.'
            : 'The alternative liquid is already in the pot: it brought no water, but it takes up room in the finished solution, so the figures here are net of it.'
      } Top up with plain distilled water only.`,
    );
  }
  if (dilution && dilutionScope === 'portion' && floorGate) {
    portionAltLiquidClauses.push(
      `${formatWeight(unknownLiquidGrams, weightUnit)} of alternative liquid has no declared water content — ${
        correctedPasteBasis ? 'but' : 'it is counted as all water, so'
      } the water figures here are ${
        correctedPasteBasis
          ? "the same either way: the liquid's whole mass is in the pot however its water and solids divide up. Declaring the % water tells you how much of your paste is water, not how much to add."
          : 'the LEAST you will need. Declare its % water, or dilute in increments and check by weight.'
      }`,
    );
  }
  const portionAltLiquidNote = portionAltLiquidClauses.join(' ');
  // One shared rule (lib/calculateAdditives) rather than a fourth hand-written ?? chain:
  // the Preservative snippet doses against this same figure, so "what the finished product
  // weighs" must not be able to mean two things in one column.
  const bottledGrams = finishedProductGramsFor(bottledSolutionGrams, dilution);
  // Every other figure here is mass. Volume is what tells a maker whether their dilution
  // vessel and packaging are big enough — so the density bridge is shown here rather than
  // left implicit.
  const finishedVolumeMl = bottledGrams !== null ? lsFinishedVolumeMl(bottledGrams) : null;
  // Show the product mass whenever it differs from the solution row, so the finished
  // VOLUME below (derived from it, not from the solution) reconciles with what is above it.
  const showBottledRow =
    dilution !== null && bottledGrams !== null && bottledGrams > dilution.solutionGrams + 0.5;
  return (
    <section className="panel panel--nested">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Dilution</h2>
          {/* Names what the panel does in ALL THREE modes. "Water to add to reach a target
              soap concentration" described two of them and contradicted the third: gradual
              is the mode with no target, where the water is the maker's own record and the
              concentration is what comes out. */}
          <p className="panel__subtitle">
            Water and soap concentration — from a target, a ratio, or what you actually
            poured
          </p>
        </div>
      </div>
      {/* Three ways to arrive at the same pair of figures — two that choose a number and
          let the app find the water (LS:1534 ratio, LS:1536 concentration), and one that
          records the water and derives the number (LS:1531 gradual). Concentration is the
          default, and switching never clears another mode's input, since each is its own
          bit of App state. */}
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
        <label className="field field--inline">
          <input
            type="radio"
            name="dilutionMode"
            checked={dilutionMode === 'gradual'}
            onChange={() => onDilutionModeChange?.('gradual')}
          />
          <span>Gradual — record what you added</span>
        </label>
      </div>
      {dilutionMode === 'ratio' ? (
        <>
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
          {/* Same radio-group shape (and same visible legend) as the other groups in this
              panel, for the same reason: bare "1:1 2:1" options beside a number field
              say nothing about what they set. The label above keeps owning the DIRECTION —
              these read "2:1", and the same tokens mean water:lye elsewhere in the app, so
              the group never restates the relationship on its own.

              Neither name says "common" any more, visible or accessible. "The most common
              ratios used are 1:1, 2:1 and 3:1" is said of water:LYE (LS:1500) — the same
              three numerals, but a different quantity measured at a different stage of the
              process. Nothing calls a water:PASTE ratio common, so a water:paste group
              claiming it was citing the wrong thing to both audiences at once. What the
              reference does say about these is that they are where makers begin (LS:1534),
              which is what the legend now says. The group's accessible name leads with the
              visible caption verbatim, so Label-in-Name holds.

              No colon after the legend: BatchBasics — which owns the app's weight-unit
              selector — punctuates its own field captions without one, and this caption
              follows suit. */}
          <div
            className="dilution-mode-toggle"
            role="radiogroup"
            aria-label="Starting points for the water to paste ratio"
          >
            <span className="dilution-toggle__legend">Starting points</span>
            {LS_WATER_PASTE_RATIO_PRESETS.map((preset) => {
              // A pick is an edit to the ratio, exactly as typing is, so it sets the same
              // ratioTouched gate the write-back effect below requires. Without it a preset
              // would move the readout while every figure underneath — and the printed sheet
              // — stayed on the saved target, which is the split the "Not applied yet" note
              // exists to report.
              //
              // THREE handlers reach it, because no one event covers the case that matters.
              // An event census in Chromium, listeners on the raw inputs:
              //
              //   checked   + click  → click
              //   checked   + Space  → keydown, keyup                    ← and nothing else
              //   unchecked + Space  → keydown, keyup, click, input, change
              //   arrow to sibling   → keydown, click(sibling), keyup(sibling)
              //
              // `change` alone misses every row but the third: App seeds waterPasteRatio to
              // '2' and a 30% target, so entering ratio mode shows 2:1 ALREADY CHECKED beside
              // "Not applied yet: … still uses your saved 30% target", and
              // re-asserting a checked radio changes no checkedness. The one obvious remedy
              // was inert — by mouse until `click` was added, and by keyboard until `keyup`
              // was. Recovery meant picking another preset and coming back.
              //
              // ONE function, not three copies, so "they must all do the same thing" is
              // structural rather than a promise: on a real change two or three of them fire
              // in the same interaction, which is only safe because this is idempotent —
              // setRatioTouched(true) twice is once, and onWaterPasteRatioChange with the same
              // string is a no-op re-render React bails out of. Anything stateful added here
              // (a toggle, a counter, logging) would fire an unpredictable number of times.
              //
              // keyup rather than keydown: it is where the browser's own activation lands
              // (census row 3 — keyup precedes the synthetic click), and keydown repeats while
              // the key is held. Gated hard on Space because focus arrives by Tab and the Tab
              // KEYUP lands on the newly focused element — an ungated keyup would write a
              // ratio back the moment the group was tabbed into, which is the round-2 bug
              // (entering ratio mode rewriting a typed target with no user action) in a new
              // costume. Space is a pick; arriving is not.
              const applyPreset = () => {
                setRatioTouched(true);
                onWaterPasteRatioChange?.(preset);
              };
              return (
                <label className="field field--inline" key={preset}>
                  <input
                    type="radio"
                    name="waterPasteRatioPreset"
                    // Compared as a NUMBER, not as the string: '2', '2.0' and a typed '2' are
                    // one ratio, and the input's own step can produce any of them. A ratio
                    // that matches no preset — the reference prints four, not an exhaustive
                    // list — simply leaves the group unselected rather than snapping the
                    // maker's own figure to a nearby one.
                    checked={ratioValid && ratioNum === Number(preset)}
                    onChange={applyPreset}
                    onClick={applyPreset}
                    onKeyUp={(e) => {
                      // 'Spacebar' is the legacy spelling; ' ' is what every current browser
                      // and both test drivers send.
                      if (e.key === ' ' || e.key === 'Spacebar') applyPreset();
                    }}
                  />
                  <span>{preset}:1</span>
                </label>
              );
            })}
          </div>
          {/* The prose that used to sit here moved under the prose budget (at most two
              inline hint paragraphs per state): the ratio-preset guidance ("Some makers
              start at 1:1…") is always-true reference and lives in the collapsed notes
              <details> at the bottom of the panel, with its sourcing comment; the
              weigh-your-paste caveat is state-specific and rides the "lands at" readout
              below the ratio's own water figure, one paragraph per state instead of three
              stacked here. */}
        </>
      ) : dilutionMode === 'gradual' ? (
        dilutionScope === 'portion' ? (
          <>
            {/* Session-local in App (portionPasteGrams/portionWaterGrams), NOT
                settings.gradualWaterGrams — that field is the WHOLE BATCH's own record,
                and Gradual legitimately writes ITS derived percentage back into the
                recipe's saved target below. A jar weighed out here is a bench figure,
                like portionTargetMl and measuredPasteGrams beside it, and must never
                dirty the saved recipe — see `portionGradual`'s own comment above for the
                prohibition this enforces. */}
            <label className="field">
              <span>Paste weighed out (g)</span>
              <input
                type="number"
                className="input input--number"
                min={1}
                value={portionPasteGrams}
                onChange={(e) => onPortionPasteChange?.(e.target.value)}
                aria-label="Paste weighed out (g)"
              />
            </label>
            {/* Beside the field it describes, exactly as the measured-paste refusals sit
                beside theirs. The verdict is portionGradualFor's, so this alert, the jar's
                figures and App's preservative dose can never disagree about whether the
                reading is usable. */}
            {portionGradualState?.pasteSubTenthPrecision && (
              <SwallowedSeparatorAlert typed={portionPasteGrams} />
            )}
            <label className="field">
              <span>Water added so far (g)</span>
              <input
                type="number"
                className="input input--number"
                min={0}
                value={portionWaterGrams}
                onChange={(e) => onPortionWaterChange?.(e.target.value)}
                aria-label="Water added so far (g)"
              />
            </label>
            {portionGradualState?.waterSubTenthPrecision && (
              <SwallowedSeparatorAlert typed={portionWaterGrams} />
            )}
          </>
        ) : (
          <>
            <label className="field">
              <span>Water added so far (g)</span>
              <input
                type="number"
                className="input input--number"
                min={0}
                value={gradualWaterGrams}
                onChange={(e) => {
                  setGradualTouched(true);
                  onGradualWaterChange?.(e.target.value);
                }}
                aria-label="Water added so far (g)"
              />
            </label>
            {/* The record the whole mode runs on: refused, there is no derived percentage,
                nothing is written back, and the sheet prints no record rows — so the field
                that took the number owes the account of why. */}
            {gradualWaterSubTenthPrecision && (
              <SwallowedSeparatorAlert typed={gradualWaterGrams} />
            )}
          </>
        )
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
        {/* Grams regardless of the app-wide unit: this is a scale reading the maker takes at
            the pot, and the core figures it feeds are all gram-based. Always shown, even when
            the target exceeds the recipe's ASSUMED cook water: a measurement is exactly what
            can override that assumption, so hiding the input would remove the only way out of
            the refusal.

            "the whole batch" is in the VISIBLE label because the declaration radio that used
            to sit under this field ("That weight is: (o) all of it") was the only thing
            naming the paste before an error did — and it is gone. Concentration mode is the
            default and has no ratio caveat to carry the point, so without this nothing on the
            panel says which paste is wanted. Custom amount is where it bites: the field sits
            under "Paste to weigh out — 412 g" and a hint saying "Weigh your paste and enter
            it above", and the reference itself frames the reading as a portion (LS:1534
            weighs the portion you wish to dilute), so the maker's prior runs against this
            app's. A deep drawdown trips the solids floor and is refused; a SHALLOW one
            clears it and is taken as the batch with no alert at all.

            That divergence is DELIBERATE and this label is the correct half of it: every
            figure this field feeds — the corrected batch pour, the ratio's paste, the
            portion's own ceiling — is derived from a whole-batch mass, so a label promising
            the reference's portion-first reading would describe an app that does not exist.
            Do not "correct" it toward the source; the source is portion-first and this app
            is not. What the source is authoritative about here is the two ways to GET the
            number (tared paste, LS:1534; loaded crockpot minus the empty one, LS:1538), and
            the ratio caveat above is where those are named.

            This span IS the input's accessible name — the wrapping <label> associates them,
            and there is deliberately no aria-label on the input to override it. There used to
            be one ("Measured paste weight (g)"), kept narrow so the existing test and e2e
            selectors would not need touching; that left the disambiguation above visible-only,
            so a screen-reader user never heard "the whole batch" and voice control could not
            match the words on screen. One string now serves both, so they cannot drift: edit
            the span and the accessible name follows. The selectors moved instead. */}
        <span>Measured paste weight — the whole batch (g, optional)</span>
        <input
          type="number"
          className="input input--number"
          min={1}
          step={10}
          value={measuredPasteGrams ?? ''}
          onChange={(e) => onMeasuredPasteGramsChange?.(e.target.value)}
        />
      </label>
      {/* The reading is rejected in BOTH scopes, so its explanation renders in both — beside
          the input it describes, and above the figures that fall back to the recipe's own
          computed paste because of it. Every remedy names a control that is above this
          point and visible in the current mode.

          The thresholds below are quoted in GRAMS, not the app-wide weightUnit — alone in
          this panel. Every other figure here is a bench readout and belongs on the app-wide
          unit; these are bounds on the number they just typed into a grams-only field, so
          quoting "less than the 2.65 lb of soap this batch makes" beside a typed 900 made
          them convert before they could check the claim.

          There is no branch here for `exceedsRemainingCeiling`: that rule only ever fires on a
          reading declared as what's LEFT after earlier dilutions, and this panel declares every
          reading as the whole batch (MEASURED_PASTE_IS_REMAINING). The rule and its arithmetic
          stay in lib/measuredPaste for direct consumers; the paragraph is gone because it could
          never render, and its remedy named a control that no longer exists. */}
      {dilution && measurementRejection && (
        <>
          {measurementRejection.nonPositive && (
            <p className="results-hint" role="alert">
              A paste weight has to be more than zero — enter what the scale reads, or clear
              the field to go back to the recipe&apos;s own computed paste.
            </p>
          )}
          {/* The quoted figure is the RAW TYPED STRING with " g" appended, not formatWeight:
              the panel's gram formatter rounds batch-scale figures to whole grams and small
              ones to a single decimal, so it would print 1.222 as "1.2 g" and 1480.50 as
              "1,481 g" — destroying the very decimals this alert exists to show. Grams, not
              the app-wide unit, per this block's rule above: it is the number they just
              typed into a grams-only field, echoed back exactly as the browser committed it.

              The cause named is the swallowed separator, not the scale: browsers read a
              comma typed into <input type="number"> as a decimal point in every locale, so
              a typed 1,222 arrives here as 1.222 and no code downstream can see the comma.
              The floor used to catch the worst of these with its "check the scale was
              tared" remedy — a diagnosis that sends the maker back to re-weigh a pot that
              was weighed correctly, and retype the same number. */}
          {measurementRejection.subTenthPrecision && (
            <p className="results-hint" role="alert">
              This field received {(measuredPasteGrams ?? '').trim()} g — more decimal
              digits than a scale reading carries, since no scale weighing a batch of paste
              reads finer than 0.1 g. If you typed a thousands separator, this field reads
              the comma as a decimal point and the weight arrives a thousand times too
              light — re-enter it as plain digits, without separators.
            </p>
          )}
          {/* Two wordings, one floor. The figure is always the floor the guard actually
              applied (measurementRejection.solidsFloorGrams) rather than a bound re-derived
              here, for the reason wholeBatchPasteBasis exists on the same object: a surface
              that recomputes the threshold it is explaining can drift from the one that
              rejected the reading.

              With an alternative liquid's solids in the pot the floor is higher than the
              batch's soap, and saying "the N g of soap this batch makes" beside it would name
              a figure that is neither the bound nor anything else on screen. Naming the
              solids is also the only way the sentence stays checkable: the maker can see
              their liquid's mass in Split liquid and add it up. The verdicts are unchanged;
              only the second remedy moved. It used to read "switch the declaration above to
              'what's left after earlier dilutions'", which named a control this panel no
              longer has — every reading is the whole batch now — so it says what the field
              wants instead. A mis-tare and a partial pot are still the two ways to get here,
              and both remedies still name something on screen. */}
          {measurementRejection.belowSolids &&
            (measurementRejection.solidsFloorGrams > dilution.anhydrousGrams ? (
              <p className="results-hint" role="alert">
                That is less than the{' '}
                {formatWeight(measurementRejection.solidsFloorGrams, 'g')} of soap and
                alternative-liquid solids this batch&apos;s pot holds, and the cook boils off
                water, not solids — so it cannot be all of the paste. Check the scale was
                tared, and that what you weighed was all of the paste: this field takes the
                batch&apos;s full paste weight.
              </p>
            ) : (
              <p className="results-hint" role="alert">
                That is less than the {formatWeight(dilution.anhydrousGrams, 'g')} of
                soap this batch makes, and solids do not evaporate — so it cannot be all of the
                paste. Check the scale was tared, and that what you weighed was all of the
                paste: this field takes the batch&apos;s full paste weight.
              </p>
            ))}
          {/* CONCENTRATION MODE ONLY (dilutionMode === 'concentration' is the only remaining
              case once gradual and ratio are both excluded — see each exclusion below). Every
              clause of this paragraph is about a TARGET the paste cannot reach, and only
              concentration mode is aiming at one. The gate itself is `exceedsSolutionAlert`,
              named where the rejection is computed: the solubility ceiling below stands down
              for this paragraph, so it has to read the same answer this site does rather than
              re-derive the two exclusions and drift from them.

              NOT IN GRADUAL MODE, where this paragraph has no subject. Gradual has no target:
              the saved percentage is this mode's own OUTPUT, written from the pot and the
              water recorded. Two consequences, both of them wrong on screen. The remedy named
              a concentration field that gradual takes off the panel — the exact bug
              dilutionTargetWording was written to fix for ratio. And the verdict itself
              becomes a rounding artifact: with a weighed pot and no water yet, the written
              percent is anhydrous ÷ that pot at 2 dp, so solutionGrams lands within a gram
              of the reading and half the time a hair under it — printing "your paste already
              weighs more than the 1,404.99 g this target dilutes to" directly above the
              panel's own "Finished so far (weighed) 1,405 g". The pot's own rules
              (nonPositive, subTenthPrecision, belowSolids) all still render here in gradual
              mode, and they are exactly the rules that decide gradual's basis — so in that
              mode the alerts and the figures now answer to the same three questions.

              NOT IN RATIO MODE either, for the identical reason (Task 1,
              2026-08-12-whole-app-review-fixes): ratio multiplies whatever pot it is given —
              see weighedOrComputedPotGramsFor, whose basis choice deliberately dropped this
              same ceiling, because a target-derived bound has no business choosing the basis
              for a mode that has no target — and WRITES the concentration that lands on, so
              "cannot be diluted to 30% at all" is a claim about a target ratio mode is not
              aiming at. Ratio's own "lands at N%" readout below already tells the truth about
              where the reading actually lands, whatever that is. Left in, this paragraph sat
              directly above the paste-basis caveat that calls the SAME reading "more
              accurate" than the recipe's computed paste — one paragraph calling the number
              suspect, the next calling it the better one. */}
          {exceedsSolutionAlert && (
            <p className="results-hint" role="alert">
              Your paste already weighs more than the{' '}
              {formatWeight(dilution.solutionGrams, 'g')} this target dilutes to, so
              it cannot be diluted to{' '}
              {formatConcentrationPercent(dilution.soapConcentrationPercent)}% at all —{' '}
              {/* Only one control is ever on screen here now: dilutionMode is always
                  'concentration' inside this branch (ratio and gradual are both excluded
                  above), so the remedy names the concentration field unconditionally. It
                  used to branch on dilutionMode === 'ratio' to name the ratio input
                  instead — dead since ratio stopped reaching this paragraph at all. */}
              lower the target concentration above (more water)
              {/* The measurement clause now names the specific mistake, because this branch
                  is where that mistake lands. Offering the crockpot shortcut in the ratio
                  caveat made "forgot to subtract the empty pot" reachable, and a
                  forgotten subtraction always overshoots — an empty crockpot's 2-4 kg on top
                  of the paste is heavier than the solution, so it trips THIS rule and never
                  the solids floor (which only fires on a reading that is too light, and
                  whose "check the scale was tared" remedy stays right for the mistake it
                  does catch). Left generic, the leading remedy told a maker carrying 3 kg of
                  stoneware to add more water, which would have compounded the error. Named
                  second, after the control-based remedy, because a reading really can be
                  correct and the target really can be out of reach. Still worth naming here
                  even though the field that takes the reading is mode-independent — a
                  maker can carry the crockpot habit into concentration mode from a session
                  that started in ratio mode, where the shortcut is actually offered. */}
              , or check the measurement — if you weighed the crockpot, subtract the empty
              pot&apos;s own weight.
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
      {/* Gradual asks for the paste actually weighed out and the water actually poured,
          not a TARGET volume to size a portion to — those two new fields render above,
          in the mode-selection block, in place of this one. Showing both at once would
          offer two unrelated ways to describe the same jar; gradual's own workflow (LS:1531)
          has no "amount to make" step at all. */}
      {dilutionScope === 'portion' && dilutionMode !== 'gradual' && (
        <>
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
          {/* The measured-paste field's comma trap, on this field: a typed 1,200 commits as
              1.200 (the browser reads the comma as a decimal point, every locale), and the
              only defense used to be the resulting 1.2 ml portion looking absurd. The
              verdict is portionDilutionFor's — resolved there so the figures, the density
              caveat and this alert suppress together — and the fingerprint is the paste
              rule's own (lib/measuredPaste's subTenthPrecisionFingerprint, judged on the
              raw string): only two or more typed decimals refuse, so a 1200.5 ml ask — odd
              but honest — still computes. The quoted figure is the RAW TYPED STRING with
              " ml" appended, exactly as the paste alert quotes grams and for the same
              reason: a formatter would round away the very decimals this alert exists to
              show. ml, not grams — it is the number they just typed into an ml field. */}
          {portionState?.targetMlSubTenthPrecision && (
            <p className="results-hint" role="alert">
              This field received {targetMl.trim()} ml — more decimal digits than an amount
              to make carries: nobody asks for a portion to the hundredth of a millilitre.
              If you typed a thousands separator, this field reads the comma as a decimal
              point and the amount arrives a thousand times too small — re-enter it as
              plain digits, without separators.
            </p>
          )}
        </>
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
              <dd>{formatWeight(ratioWaterGrams, weightUnit)}</dd>
            </div>
          </dl>
        )}
      {/* Gradual's own figure, whole-batch scope only — mirroring the ratio grid above.
          paste + water, from the RAW INPUTS, never dilution.solutionGrams: that field is
          still the old PREDICTION (4,000 g in the fixture this guards), and gradual exists
          precisely because the maker stopped predicting and started measuring what they
          actually poured (3,600 g in the same fixture). Printing the prediction here would
          quietly resurrect it under a new label. */}
      {dilutionScope === 'batch' && dilutionMode === 'gradual' && gradual !== null && (
        <dl className="results-grid">
          <div className="results-grid__item results-grid__item--primary">
            {/* Names which pot this sum counts from — the same discipline basisScope's
                "(whole batch)" / "(custom amount)" labels already practice for a figure's
                basis, one parenthetical rather than a paragraph. wholeBatchPasteGrams is a
                computed PREDICTION and is never corrected by a measured reading (see
                pasteGrams' own comment above), so this is the one place gradual has to say
                which of the two it actually poured into.

                "weighed", not "measured": the field just above this row is already titled
                "Measured paste weight" and is visible in every mode, so a second "measured"
                here would be a second, unrelated match for the same word on one screen —
                confusing for a reader, and literally ambiguous for a query that finds text
                by content (DilutionPanel.test's own `getByText(/measured/i)` pins this: it
                is answered by that field's label, and must stay the ONLY thing on screen
                that reads that way). "Weighed" says the identical thing — it is the verb
                this task's own brief uses for the same act ("the pot the maker actually
                weighed") — without competing with the field's name for it. */}
            {/* Named off the SAME gate that chose the basis (measuredPasteDescribesPot),
                never off measuredPasteValid: this label's whole job is to say which of the
                two pots the sum counts from, so a label answering a different question than
                the selection would be a lie about the figure beside it. */}
            <dt>Finished so far ({measuredPasteDescribesPot ? 'weighed' : 'computed'})</dt>
            <dd>{formatWeight(gradual.finishedGrams, weightUnit)}</dd>
          </div>
        </dl>
      )}
      {/* THE ratio paragraph — one per state, under the prose budget. It owns everything
          the ratio has to say about itself: the readout (the true derived concentration,
          however extreme, so the panel never lies about what the ratio implies), the
          not-applied split, and the paste-basis caveat. These used to be three stacked
          paragraphs; each clause keeps its old gate, so no state gains or loses a claim —
          only the paragraph breaks between them are gone.

          NOT-APPLIED CLAUSE (formerly its own note below the clamp alert). The write-back
          waits for a real edit to the ratio (ratioTouched — see its own comment), so
          entering ratio mode leaves the saved target in force. That is deliberate and must
          stay: entering and leaving the mode used to rewrite a typed target with no undo.
          What it left unsaid is the split it creates — this readout answers for the ratio
          while every row below, and the printed sheet, still answer for the saved target.
          Three disagreeing figures on one screen and nothing saying they are answers to
          different questions. Naming the split is the fix; writing back on entry is not.
          The clause names the action WITHOUT promising a destination, because the obvious
          single edit does not reach the figure quoted here: from an untouched 2:1 at a
          saved 30%, taking the ratio input's own step to 2.5 applies 21.4% — landing on
          the 25% needs a round trip (2 → 2.5 → 2), since the write-back only fires once
          the field has been touched. The ratio's own figure needs no restating inside the
          clause: it is the bolded readout starting this same paragraph, so the two roles
          (saved target in force, ratio's figure not) cannot be swapped by rewording one
          of them.

          PASTE-BASIS CLAUSE (formerly the caveat above the presets, and — in batch scope
          with a measurement — the grid hint below the main grid). The reference attaches
          the estimate warning to its ratio rows and to no concentration row (LS:2172,
          repeated at LS:2294): those water figures are estimates, and the paste has to be
          weighed first because the cook evaporates water. LS:1534 makes the same demand
          as a precondition of the method — knowing the paste's starting weight is step
          one of it. Once a reading is accepted the caveat is discharged, and saying so is
          the point: the instruction is the part that must not survive its own remedy.

          WHAT GETS WEIGHED IS THE PASTE. Both of the reference's routes to that number
          yield paste and never pot + paste: put the paste on a tared scale (LS:1534), or —
          the crockpot shortcut, which exists precisely so the paste need not be turned out
          of the pot — weigh the loaded crockpot and SUBTRACT the empty one (LS:1538, with
          LS:1536 advising you weigh and mark your crockpots before you ever start). This
          once closed with "Weigh the pot and enter it as Measured paste weight below",
          which is the shortcut with its subtraction deleted: a maker who followed it
          literally typed a figure carrying an empty crockpot's 2-4 kg, and the ratio
          multiplied that mass straight into the dilution water. If a future edit names the
          pot again it owes the subtraction in the same breath — DilutionPanel.test pins
          both halves. ("above", not "below": the field sits above this paragraph now.)

          WHICH WORDING, BY SCOPE. In batch scope a valid reading takes the old grid
          hint's wording, naming the row it corrected ("Water to add at this ratio above")
          — in ratio mode the main grid's own "Dilution water to add" row is suppressed,
          so the row must be named, not pointed at. In portion scope the same reading
          takes the discharged wording, which is the only thing on that screen saying the
          caveat is met. With no valid reading, both scopes carry the estimate caveat; the
          weighing instruction drops once a reading is on the field unused (rejected, with
          its own alert) — telling a maker who has just been to the scale to go to the
          scale is the one thing this must not do. The whole paragraph is gated on the
          derived concentration, which requires a valid ratio: with the field empty this
          said "A ratio is only as exact as the paste it multiplies, and this one runs
          on…" directly above "Enter a water:paste ratio greater than zero" — a sentence
          about a ratio that does not exist. */}
      {dilutionMode === 'ratio' && ratioConcentrationPercent !== null && (
        <p className="results-hint">
          <strong>
            {waterPasteRatio}:1 water:paste lands at{' '}
            {formatConcentrationPercent(ratioConcentrationPercent)}% soap.
          </strong>
          {ratioNotAppliedYet && (
            <>
              {' '}
              Not applied yet: every figure below — and the printed batch sheet — still uses
              your saved {formatConcentrationPercent(persistedTargetPercent)}% target.
              Editing the ratio applies whatever it then lands at.
            </>
          )}{' '}
          {/* The paste-basis clause follows the basis GATE (measuredPasteDescribesPot), not
              the target-derived one: the ratio above multiplies whichever pot pasteGrams
              chose, so "uses your measured paste" has to be true of that choice. */}
          {measuredPasteDescribesPot
            ? dilutionScope === 'batch'
              ? `Water to add at this ratio above uses your measured paste (${formatWeight(measuredPasteNum, 'g')}), not the recipe's computed paste — the cook boils off water the recipe still counts, and no figure on paper knows how much yours drove off, so the measurement is more accurate.`
              : `You have weighed the paste (${formatWeight(measuredPasteNum, 'g')}), so this ratio is taken against what the pot really holds rather than an estimate — the water your cook drove off is already counted.`
            : `A ratio is only as exact as the paste it multiplies, and this one runs on the recipe's computed paste: the cook drives off water the recipe still counts, and only your scale knows how much.${pasteReadingEntered ? '' : " Weigh the paste and enter it as Measured paste weight above — or weigh the loaded crockpot and subtract the empty pot's own weight."}`}
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
      {/* Gradual's own readout — the true derived concentration, at the 2 dp
          gradualDilutionFrom rounds to (not ratio's 1 dp: see that function's own doc for
          why gradual needs the extra digit), however extreme, so this never lies about
          what the record implies. Whole-batch scope only — the same scoping the "Finished
          so far" grid above already carries, and the portion's own mirror of this readout
          is below, gated the other way. Ungating this would show a stale whole-batch
          record (settings.gradualWaterGrams, recipe state) as if it described the jar
          currently on screen the moment BOTH figures exist at once. */}
      {dilutionScope === 'batch' && dilutionMode === 'gradual' && gradual !== null && (
        <p className="results-hint">
          <strong>
            That lands at {formatConcentrationPercent(gradual.concentrationPercent, 2)}% soap.
          </strong>
          {/* THE NOT-APPLIED CLAUSE — ratio's, in gradual's words, for the same split and
              with the same shape (see gradualNotAppliedYet). It names what is still running
              on the saved target rather than restating this paragraph's own bolded figure,
              so the two roles cannot be swapped by rewording one of them; and it names the
              action without promising a destination, because what gets written is this
              record rounded to 2 dp, not the figure quoted for the saved target. */}
          {gradualNotAppliedYet && (
            <>
              {' '}
              Not applied yet: every figure below — the preservative dose, and the printed
              batch sheet — still uses your saved{' '}
              {formatConcentrationPercent(persistedTargetPercent)}% target. Editing the water
              added applies what this record lands at.
            </>
          )}
        </p>
      )}
      {/* The clamp notice, same shape as ratio's immediately above: calculateDilution only
          accepts (0, 100) exclusive, so an extreme record could otherwise write back a
          concentration that nulls `dilution` and vanishes this whole panel. What is WRITTEN
          is clamped to [1, 99] (gradualDilutionFrom itself); the readout above stays
          unclamped and keeps telling the truth, so this note points back at it rather than
          restating the figure. Tense follows the write-back, not the clamp, exactly as
          ratio's does: untouched, nothing has been written yet. Whole-batch only, for the
          same reason as the readout immediately above. */}
      {dilutionScope === 'batch' && dilutionMode === 'gradual' && gradual !== null && gradual.clamped && (
        <p className="results-hint" role="alert">
          That is outside the 1–99% range the calculator can target, so the saved target{' '}
          {gradualTouched ? 'is' : 'would be'} capped at{' '}
          {formatGrams(gradual.writeBackPercent, 0)}%.
        </p>
      )}
      {/* Gradual's own figures for a JAR in Custom amount scope — the mirror of the two
          blocks above, but reading `portionGradual` instead of `gradual`, and
          deliberately never fed to onSoapConcentrationChange anywhere in this file: see
          `portionGradual`'s own comment for why a jar's figure must never redefine the
          recipe's saved target.

          Named "(this jar)" rather than "(custom amount)": the scope toggle's own
          "Custom amount" label, a few lines above and always on screen, already owns
          that exact string, and repeating it here would leave two on-screen elements
          answering "which one names Custom amount" with no way to tell them apart — the
          same collision basisScope's own "(whole batch)"/"(custom amount)" wording is
          careful never to create twice on one screen. "This jar" says the same thing the
          rest of this feature's own brief does throughout. */}
      {dilutionScope === 'portion' && dilutionMode === 'gradual' && portionGradual !== null && (
        <>
          <dl className="results-grid">
            <div className="results-grid__item results-grid__item--primary">
              <dt>Finished so far (this jar)</dt>
              <dd>{formatWeight(portionGradual.finishedGrams, weightUnit)}</dd>
            </div>
          </dl>
          <p className="results-hint">
            <strong>
              That jar lands at{' '}
              {formatConcentrationPercent(portionGradual.concentrationPercent, 2)}% soap.
            </strong>{' '}
            {/* THE PROHIBITION, on screen: a jar diluted thinner than the batch has not
                redefined the recipe, so this figure is read-only reporting and never a
                write-back — unlike whole-batch Gradual above, which legitimately writes
                its own derived percentage into the recipe's saved target because the
                batch IS the recipe. The saved target is echoed here, read-only, so a
                maker comparing the two figures can see for themselves that diluting this
                one jar left it untouched. */}
            Your recipe&apos;s saved target is unchanged at{' '}
            <input
              type="number"
              className="input input--number"
              value={soapConcentrationPercent}
              readOnly
              aria-label="Recipe's saved target concentration — unchanged by this jar (%)"
            />
            %.
          </p>
          {/* The alternative-liquid caveats in their portion wordings — including the
              load-bearing "Top up with plain distilled water only", the only sentence in
              the app telling a maker not to keep topping up with milk or juice. Gradual is
              a way of RECORDING a dilution, not a reason for that instruction to lapse, and
              this note used to reach the screen only through PortionDilutionResults, which
              gradual mode stopped rendering — so choosing Gradual silently dropped it. */}
          {portionAltLiquidNote !== '' && (
            <p className="results-hint">{portionAltLiquidNote}</p>
          )}
        </>
      )}
      {/* THE JAR'S OWN REFUSAL. lsPotAnhydrousShare returns nothing for a jar heavier than
          the batch's whole paste — a share of more than all of it — and until this branch
          the readout simply blanked: a typo (4000 for 400) removed every figure with no
          alert, while the measured-paste field one row up answers the same class of mistake
          with three. The bound quoted is the one the refusal actually applied
          (portionGradualState.batchPasteGrams), not a figure re-derived here, for the same
          reason the rejection alerts quote measurementRejection's own thresholds.

          Grams, like those alerts and for the same reason: it is a bound on the number just
          typed into a grams-only field. */}
      {portionGradualState?.pasteExceedsBatch &&
        portionGradualState.batchPasteGrams !== null && (
          <p className="results-hint" role="alert">
            That is more paste than the batch holds — all of it weighs{' '}
            {formatWeight(portionGradualState.batchPasteGrams, 'g')}. Enter what you weighed
            out of it, or clear the field.
          </p>
        )}
      {/* Spec §7: with the record incomplete, gradual is inert and the panel ASKS for the
          figures rather than showing nothing at all — ratio mode's own "Enter a
          water:paste ratio greater than zero" is the same courtesy for the same state. Zero
          is named as legitimate on purpose: the pot before any water is Gradual's own
          starting record (LS:1531), and an empty field is not that.
          NOT while a field is refused: a maker who typed 2,000 and had it read as 2.000 has
          entered something, and asking them to enter it is the one answer that does not name
          the mistake. The refusal beside the field owns that state. */}
      {dilution &&
        dilutionMode === 'gradual' &&
        dilutionScope === 'batch' &&
        gradual === null &&
        !gradualWaterSubTenthPrecision && (
          <p className="results-hint">
            Enter the water you have added so far to see what it lands at — 0 g counts, and is
            where the record starts.
          </p>
        )}
      {dilution &&
        portionGradualState !== null &&
        !portionGradualState.hasBothFigures &&
        !portionGradualState.pasteSubTenthPrecision &&
        !portionGradualState.waterSubTenthPrecision && (
          <p className="results-hint">
            Enter the paste you weighed out and the water you have added to it so far — 0 g
            of water counts, and is where the record starts.
          </p>
        )}
      {/* The not-applied note that used to render here on its own is now a clause of the
          ratio paragraph above — same gate, same claims, one paragraph fewer. */}
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
                    concentration and carries no such competing figure — in ratio mode.

                    Gradual mode is excluded too, and for a sharper reason than a competing
                    figure: this row derives from the PERSISTED target, and gradual mode has no
                    target — the concentration is DERIVED from the water the maker already typed
                    into "Water added so far" (see `gradual`'s own comment). Before that
                    write-back settles this printed a stale figure left over from whatever mode
                    came before (a 30% target's 2,500 g beside gradual's own 3,500 g "Finished so
                    far", on the same screen, for the same pour); once it has settled it can only
                    restate the water already recorded, relabelled. Task 4's own basis label on
                    "Finished so far" (measured/computed) is the one place gradual needs to say
                    which paste it counted from — this row's identical-sounding hint one
                    paragraph below would have said it a second time, of a figure that no longer
                    exists in this mode. */}
                {dilutionMode === 'concentration' && (
                  <div className="results-grid__item results-grid__item--primary">
                    <dt>Dilution water to add</dt>
                    <dd>{formatWeight(batchDilutionWaterGrams, weightUnit)}</dd>
                  </div>
                )}
                <div className="results-grid__item">
                  <dt>Paste (anhydrous)</dt>
                  <dd>{formatWeight(dilution.anhydrousGrams, weightUnit)}</dd>
                </div>
                {/* Gradual's own grid above already owns the finished-mass figure ("Finished so
                    far") — paste + water from the raw inputs, not this row's solutionGrams
                    (anhydrous ÷ the PERSISTED target). Once the write-back has settled the two
                    agree up to gradualDilutionFrom's 2 dp rounding, and a few-gram mismatch from
                    that rounding would read as an error rather than as the harmless rounding it
                    is. Same PRINCIPLE as "Dilution water to add" above, one row over — don't
                    print two figures answering the same question — even though the reason each
                    one collides is different (that row is stale-target vs. record; this one is
                    mass vs. mass): showing both mass figures at once leaves the maker guessing
                    which is the real one, so gradual mode suppresses this and lets its own grid
                    be the sole source. */}
                {dilutionMode !== 'gradual' && (
                  <div className="results-grid__item">
                    <dt>Finished solution</dt>
                    <dd>{formatWeight(dilution.solutionGrams, weightUnit)}</dd>
                  </div>
                )}
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

                    The correction applies only where the target is REACHABLE, and falls back
                    to core's own figure where it is not — it is not clamped at zero, which
                    is what it was first written as. Solids past the target's whole water
                    allowance (400 g of glycerin at 80%: a 304 g allowance) make the
                    correction negative, and the three ways of printing that are all claims
                    about a solution that cannot exist. "-96 g" is not a weight; "0 g" is a
                    flat assertion that the finished solution holds no water, and it
                    contradicted a live pour on screen beside it (a valid-looking 1,400 g
                    reading on that same recipe prints 119 g to add next to a total of
                    none); core's figure at least keeps a defined meaning — the water the
                    TARGET implies — and it is what this row has printed for every
                    unreachable target in the app's history, including every no-split-liquid
                    targetExceedsPaste recipe today. It also keeps Paste (anhydrous) + Total
                    water = Finished solution intact in exactly the state where the
                    corrected figure has to break it. Something on screen always says the
                    target is out of reach here: solids > totalWater implies
                    wholeBatchPasteGrams > solutionGrams, which is targetExceedsPaste or
                    pasteAlreadyPastTarget, and the one case that suppresses both is a
                    measurement the maker was shown a figure for. */}
                <div className="results-grid__item">
                  <dt>Total water</dt>
                  <dd>
                    {formatWeight(
                      splitLiquidSolidsGrams > dilution.totalWaterGrams
                        ? dilution.totalWaterGrams
                        : dilution.totalWaterGrams - splitLiquidSolidsGrams,
                      weightUnit,
                    )}
                  </dd>
                </div>
                <div className="results-grid__item">
                  <dt>Glycerin (retained)</dt>
                  <dd>{formatWeight(dilution.glycerinGrams, weightUnit)}</dd>
                </div>
                {showBottledRow && bottledGrams !== null && (
                  <div className="results-grid__item">
                    <dt>≈ Finished product</dt>
                    <dd>{formatWeight(bottledGrams, weightUnit)}</dd>
                  </div>
                )}
                {finishedVolumeMl !== null && (
                  <div className="results-grid__item">
                    <dt>≈ Finished volume</dt>
                    <dd>{Math.round(finishedVolumeMl).toLocaleString('en-US')} ml</dd>
                  </div>
                )}
              </dl>
              {/* Concentration mode only: in ratio mode the same sentence is a clause of
                  the ratio paragraph above the grid, naming "Water to add at this ratio"
                  (the main grid's own "Dilution water to add" row is suppressed there, so
                  "above" would land on Total water/Glycerin — neither of which is
                  measurement-corrected). In gradual mode the row itself is gone too (see
                  its own gate above — gradual has no persisted target for it to correct),
                  so this sentence would point "above" at nothing; gradual's own basis
                  label on "Finished so far" (Task 4: "measured" / "computed") is where
                  that mode says which paste it counted from instead. One paragraph per
                  state either way.

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
              {measuredPasteValid && dilutionMode === 'concentration' && (
                <p className="results-hint">
                  Dilution water above uses your measured paste ({formatWeight(measuredPasteNum, 'g')}
                  ), not the recipe&apos;s computed paste — the cook boils off water the recipe
                  still counts, and no figure on paper knows how much yours drove off, so the
                  measurement is more accurate.
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
            /* NOT in gradual mode. Hiding the "Amount to make (ml)" INPUT was not enough:
               `targetMl` is App session state that survives a mode switch, so a maker who
               sized a jar in Concentration mode and then chose Gradual kept this entire grid
               on screen — "Paste to weigh out", "Water to add", "Makes" — every figure sized
               from the recipe's SAVED TARGET, sitting unlabelled beside the jar's own
               recorded figures and disagreeing with them. That is precisely the "two
               unrelated ways to describe the same jar" the mode-selection comment above
               claims to prevent; suppressing the input alone left the stale state's
               downstream effect untouched. Gradual's own jar readout replaces this block. */
            dilutionMode !== 'gradual' && (
              <PortionDilutionResults
                dilution={dilution}
                weightUnit={weightUnit}
                targetMl={targetMl}
                measuredPasteGrams={measuredPasteGrams ?? ''}
                wholeBatchPasteGrams={wholeBatchPasteGrams}
                cookWaterGrams={cookWaterGrams}
                unknownLiquidGrams={unknownLiquidGrams}
                overDilutionCertain={overDilutionCertain}
                dilutionMode={narrowDilutionMode}
                ratioNotAppliedYet={ratioNotAppliedYet}
                altLiquidNote={portionAltLiquidNote}
              />
            )
          )}
          {/* The add-in-stages technique note (LS:1531) and the density caveat used to
              render here as loose paragraphs in every state; both are always-true reference
              prose and live in the collapsed notes <details> below, outside the prose
              budget. */}
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
                  reading was contesting. Both scopes answer this state the same way now.

                  The clauses live in `pasteAlreadyThinnerAlert` (beside pasteAlreadyPastTarget,
                  with the scope gate this block applies) because the solubility ceiling below
                  stands down for this paragraph. Two sites, one answer: keyed on the flag
                  instead, that suppression fired in states where every one of these clauses
                  had already silenced this alert. */}
              {pasteAlreadyThinnerAlert && (
                <p className="results-hint" role="alert">
                  The paste is already more dilute than {formatConcentrationPercent(dilution.soapConcentrationPercent)}% — adding water
                  only lowers the concentration further.
                </p>
              )}
              {/* The sibling above answers the water-only form of this state; this one
                  answers the form only the corrected pot can see — see
                  pasteAlreadyPastTarget for the predicate, the gating and why the two can
                  never both fire. The gate here is pasteAlreadyPastTargetAlert (the
                  predicate plus this block's own scope), named where the predicate lives so
                  the solubility ceiling below reads the same answer this site renders on;
                  the computedPasteGrams recheck only narrows the type for the quoted
                  figure — the predicate already required it. The two figures are quoted
                  because the claim is a comparison, and the row it explains prints a bare
                  "0 g".

                  The closing "weigh the paste" clause is dropped once a reading has been
                  REJECTED, which is the one state where this alert stacks on another: the
                  maker has just weighed the paste, and telling them to do the thing they
                  did — under a figure of the recipe's own that sits above their reading in
                  the field — is the sort of instruction that reads as the app not having
                  noticed. Only the clause goes. The verdict still holds and still needs
                  saying, because the row underneath fell back to the recipe's own clamped
                  figure when the reading was refused; and the pairing itself is right for
                  belowSolids and nonPositive, where the first alert is about the reading and
                  this one is the only account of the 0 g. */}
              {pasteAlreadyPastTargetAlert && computedPasteGrams !== null && (
                <p className="results-hint" role="alert">
                  The paste is already more dilute than {refusalWording.named}: it weighs{' '}
                  {formatWeight(computedPasteGrams, weightUnit)} against the{' '}
                  {formatWeight(dilution.solutionGrams, weightUnit)} its soap makes at that
                  concentration, so there is no dilution water to add.{' '}
                  {measurementRejection?.rejected ?? false
                    ? `${refusalWording.remedy} until the paste can reach it.`
                    : `${refusalWording.remedy} until the paste can reach it, or weigh the paste above — the cook boils off water this figure still counts.`}
                </p>
              )}
            </>
          )}
          {/* The solubility ceiling, out loud. lsConcentrationAboveAllMinimums has a LIVE
              gate, which makes this sentence state feedback, not always-true reference — a
              prior round collapsed it into the notes <details> below as the tail of the
              minimum-dilution paragraph, which buried the one warning for the 40-45%
              window: dish and laundry ranges reach 45% while the solubility ceiling is
              40%, so at a 45% target the uses summary AFFIRMS "this suits dish soap,
              laundry soap" inline while the only can't-dissolve warning sat collapsed.
              It is a role="alert", which the prose budget exempts by design — the budget
              tests count non-alert paragraphs, and the alert channel is governed by the
              panel's own no-stacking rule instead, kept here by suppression: when a
              stronger verdict about this same target already owns the screen — whatever is
              answering for targetExceedsPaste (overDilutionSpokenFor: the alert, or the
              child's Custom-amount wording of it), whatever is answering for the
              corrected-pot verdict (pasteAlreadyPastTargetSpokenFor), or an
              exceeds-solution rejection — this stays silent, exactly the subsumption those
              alerts already practice on one another. A refusal of the READING is not on
              that list (decided 2026-08-16): it is a claim about the scale, not about this
              target, so the ceiling speaks beside it — two alerts, two different claims.
              Neither is the can't-tell hedge (decided 2026-08-16, second round): it
              questions whether the BATCH can reach N% with an undeclared liquid in the
              pot, while this sentence is about the saved target, which no liquid moves —
              an uncertainty about the batch is not a verdict about the target, so the two
              render together, one alert beside one plain paragraph. Renders
              in both scopes: it describes the target, not an amount. The claim and its
              wording are the old overflow tail's, unchanged.

              EVERY clause asks whether the verdict it defers to is on screen, never whether
              its flag is set, and that is the whole of this suppression's licence. A
              subsumption is worth having only while the thing doing the subsuming is
              actually being said.

              NOT ratio or gradual mode's exceeds-solution rejection, though: Task 1
              (2026-08-12-whole-app-review-fixes) stopped that alert rendering in ratio mode
              (a claim about a target ratio mode is not aiming at), so it no longer "owns the
              screen" there — and THAT clause, the exceeds-solution one, is keyed to the
              stronger alert's own rendering (`exceedsSolutionAlert`, the same const that
              site renders on): a subsumption is only worth having while the verdict doing
              the subsuming is actually on screen, and in ratio mode it is not. Left
              unguarded there, a maker whose SAVED target sits above the solubility ceiling
              (the persisted soapConcentrationPercent, which the printed batch sheet still
              uses until the ratio is touched — see ratioNotAppliedYet above) got told
              nothing at all: not this sentence, suppressed by a flag whose own alert had
              gone silent, and not ratio's "lands at N%" readout either, which speaks only to
              the ratio's own concentration, never the saved target's.

              Task 9 (2026-08-12-whole-app-review-fixes) added gradual to the same exclusion:
              gradual's own exceeds-solution alert has been silent since before this plan
              began (two paragraphs above — gradual WRITES the concentration from the pot and
              the water recorded, so it has no target for that alert to be about either), and
              this suppression was keyed to the FLAG rather than to the stronger alert's own
              rendering, same as ratio's gap. Task 1 found this while fixing ratio's version
              and deliberately left it — untested, out of scope for that task, flagged in its
              report instead of changed blind. Confirmed here rather than assumed: gradual
              derives its saved percentage from what was actually poured, but that derivation
              runs on the CURRENT record, and a saved target left over from a prior recipe or
              a not-yet-applied edit (ratioNotAppliedYet's gradual counterpart) can still sit
              above the ceiling while gradual's own alert stays silent about it — so a maker
              in gradual mode can be misled by the missing warning exactly as one in ratio
              mode was.

              Task 12 (2026-08-12-whole-app-review-fixes) closed the last one, the FIRST
              clause, which was still `!dilution.targetExceedsPaste` — the flag, not its
              render — while the alert that flag speaks for is itself suppressed by a VALID
              paste reading (a measurement outranks the assumed cook water the flag is derived
              from; see its own comment above, and keep that suppression — it is right). The
              two answers disagreed, and the state between them said nothing at all.
              Reproduced, not assumed: anhydrous 1,200 g, cook water 1,400 g, target 50% →
              targetExceedsPaste true; with a valid 2,000 g reading in the field this panel
              rendered ZERO alerts, at a target ten points above the 40% no recipe dissolves
              past (LS_MINIMUM_DILUTION_GUIDE's highest ceiling) — in all three modes and in
              both scopes. Clearing the reading brought the paste alert back, which is what
              made it a suppression bug rather than a missing sentence. Task 1 hit this while
              fixing ratio's version, judged it untested and out of scope, and flagged it
              rather than changing it blind; this is that deferred change, with the matrix of
              alert counts its report asked for.

              The fix is a disjunction, not a swap, and that matters: `overDilutionSpokenFor`
              (see its derivation) asks whether ANY of the flag's voices is on screen.
              Testing `!measuredPasteValid` alone would have closed this hole by opening the
              opposite one — a second paragraph stacked on the batch alert or the child's
              wording, each a state this sentence stands down for. (The voice list has
              shrunk twice since: a rejection alert stopped counting with the 2026-08-16
              decision — a refusal about the reading does not speak for the target — and
              the can't-tell hedge stopped counting with that decision's second round,
              which ruled an uncertainty about the batch no verdict about the target
              either. See the derivation's own comment for both.)

              Task 14 (2026-08-12-whole-app-review-fixes) closed the corrected-pot clause
              the same way — the last clause still reading a bare predicate. That predicate
              is scope-blind while its alert renders in Whole batch only, and the child's
              wording of the same verdict requires an unrejected reading, so Custom amount
              with a rejected reading whose refusal is excluded from the mode (a 3,000 g
              reading in ratio, against a 2,400 g solution from a 2,500 g corrected pot)
              rendered NOTHING at all: no figures, no refusal, no ceiling. The clause now
              reads pasteAlreadyPastTargetSpokenFor — the alert, or the child's wording of
              the verdict. A refusal that actually renders was a third voice there for one
              round and is gone (decided 2026-08-16, second round): a refusal about the
              reading does not speak for the corrected pot either, so the Custom-amount
              cells where only a refusal renders now show refusal + ceiling — the same pair
              as the targetExceedsPaste side, by the same rule. */}
          {lsConcentrationAboveAllMinimums(Number(soapConcentrationPercent)) &&
            !overDilutionSpokenFor &&
            !pasteAlreadyPastTargetSpokenFor &&
            !exceedsSolutionAlert && (
              <p className="results-hint" role="alert">
                This target is above what even a coconut-heavy recipe can fully dissolve.
              </p>
            )}
          {/* THE alternative-liquid paragraph — one per state. An alternative liquid is a
              property of the RECIPE, not of how much of it you are making, so its caveats
              follow into both scopes; the clauses, their gates and their scope-bound
              figures are composed above (see shellAltLiquidClauses / the portion note),
              where each clause's own reasoning lives. In Custom amount only the can't-tell
              hedge renders here — the head-start and floor clauses ride the child's status
              paragraph, beside the portion figures they describe. */}
          {shellAltLiquidClauses.length > 0 && (
            <p className="results-hint">{shellAltLiquidClauses.join(' ')}</p>
          )}
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
              water costs a fraction of what the oils did. Liquid soap itself, thickened or
              not, is not recommended for hair.
            </p>
          </details>
        </>
      ) : (
        /* The ask names a control that is on screen in the mode the maker is actually in.
           "a target concentration (1–99%)" is the concentration field's own caption, and
           that field is only rendered in concentration mode — in ratio and gradual mode it
           is replaced by the ratio input or the water-record field, so the sentence sent a
           maker looking for something the mode had removed. The requirement itself is real
           in all three (calculateDilution refuses a target outside 1–99%, and both derived
           modes still need a live `dilution` to count anhydrous soap from), so the wording
           points at the mode radio above rather than dropping the clause. */
        <p className="results-hint">
          {dilutionMode === 'concentration'
            ? 'Enter oils and a target concentration (1–99%) to compute dilution.'
            : 'Enter oils to compute dilution — and, under Target concentration above, a starting target between 1 and 99%.'}
        </p>
      )}
      {/* THE COLLAPSED NOTES — where the prose budget sends reference prose. The rule
          (pinned by the prose-budget describe in DilutionPanel.test): in any single
          state the panel may carry at most one alert plus TWO inline hint paragraphs;
          guidance that is true in every state is reference, not feedback, and lives
          here instead, where it does not count against the state and is still one
          click away. Everything in this block keeps its exact wording and its own
          gate from the inline site it left — moving prose must not move claims.

          OUTSIDE the dilution ? branch on purpose. Ratio mode's presets render before a
          recipe exists (App seeds the ratio input, so switching modes first is a real
          path), and the guidance accounting for those presets has to be reachable in
          that state too — inside the branch, "Some makers start at 1:1…" vanished
          exactly where the presets stood unexplained, the copy-points-at-nothing class
          the presets' own comment warns about. Every paragraph in here carries its own
          gate, and none needs a dilution: the density caveat's finishedVolumeMl is
          null-safe and simply gates it off while there is nothing to convert. */}
      <details className="results-hint dilution-notes">
        <summary>Dilution notes</summary>
        {/* This paragraph owns the RATIOS and nothing else. Three sentences, three claims.
            It renders in ratio mode only — the presets it accounts for are ratio mode's —
            and moved here from directly under those presets: it is true whatever state
            the ratio is in, which is what made it budget-exempt reference. The claims
            are AUDITED and the wording is pinned — movable, not rewordable.
            1. ATTRIBUTED, not universal: the reference says some makers begin at 1:1 and
               others at 2:1 or 3:1 depending on the recipe (LS:1534). It never says
               everyone starts at 1:1, and its own beginner table does not offer 1:1 at
               all — the lowest row there is 2:1 (LS:2172).
            2. The fourth preset is accounted for by SOURCE rather than by editorial. It
               was called "a step between those two rather than a starting point of its
               own", which is the opposite of what the one place it appears shows: LS:2172
               is a table headed "Dilution Preference" for the beginner recipe that
               LS:2192 identifies as the Beginner Castile, and 2.5:1 is the more dilute of
               the two ratios that table offers. Its arithmetic confirms the calibration —
               paste is 19.31 oz anhydrous + 6.62 oz lye water = 25.93 oz, so 2.5:1 is
               64.83 oz of water (the table's own figure) for a 90.75 oz solution at
               21.3% soap, inside the 20-30% band LS:2181 gives castile. It is a
               castile-calibrated CHOICE for exactly the recipe class that needs the most
               water, not an interpolation — and denying it starting-point status also
               fought this group's own "Starting points" legend.
               No figure is quoted in the copy on purpose: the live "lands at" readout
               above these notes prints what 2.5:1 lands at for THIS recipe, which is
               21.3% only for the book's paste-to-anhydrous ratio and drifts with the
               lye-water concentration. A fixed "21%" here would have argued with a live
               figure on the same screen.
            3. The minimum is a FLOOR TO CLEAR, never a destination. It replaces an
               invented mechanism ("expect to add more as the paste dissolves" — unsourced,
               and backwards, since too little water is what PREVENTS dissolution; the
               absorb-and-swell picture is Gradual Dilution's, LS:1531, whose own note
               below owns it for both modes). But the first repair overshot into
               "where you land is set by the recipe's own minimum", which the reference
               attacks by name: LS:1605 hands the decision to the maker once the minimum is
               met ("you can then decide if you would like to include additional water…
               depending on what the product will be used for"), LS:3585 calls diluting to
               the minimum for thickness a "preconceived (and incorrect) notion", and
               LS:1690 asks whether the commercial soaps use the absolute minimum and
               answers NO WAY. It also contradicted this app in two places: core's
               ls-dilution-targets ("any concentration above the recipe's own minimum
               'works', and the right answer depends entirely on the product") and the
               minimum-dilution paragraph directly below. So the claim is
               bounded to what LS:1524/LS:1605 support — how LITTLE water you can use —
               and where you land is left to the intended-use list above, which already
               owns it. Naming a floor is not naming the add-in-stages technique either,
               so the LS:1531 note keeps its own message.
            What this paragraph deliberately does NOT say: which oils raise the minimum.
            That claim, with the actual figures, belongs to the minimum-dilution paragraph
            directly below (see its comment) — the two used to render as stacked hints on
            one ratio + whole batch screen.
            No source is named in the visible text, here or anywhere in this panel. */}
        {dilutionMode === 'ratio' && (
          <p>
            Some makers start at 1:1, others at 2:1 or 3:1, depending on the recipe; 2.5:1
            comes off a castile dilution table, the more dilute of its two ratio rows. The
            recipe&apos;s own minimum sets how little water you can use — below it, some
            paste stays undissolved.
          </p>
        )}
        {/* THE SOLE OWNER of "which oils set the minimum". The ratio guidance (in ratio
          mode, the note above) used to
          say it too — in words, without figures — so in ratio + whole batch the same
          claim rendered twice on one screen; this one carries the numbers (LS:1603:
          coconut to 40%, castile 25%; LS:1605: most combination recipes 25-35%), so it
          keeps the claim and the other drops it.
          It also renders in BOTH modes and BOTH scopes, where the ratio note is
          ratio-only — so ceding the claim here widens its reach rather than narrowing it.
          Moved into these collapsed notes under the prose budget — MINUS its old
          overflow tail: everything left is a property of recipe classes, not of the
          state on screen, and the states it used to stack in (the ratio paragraph plus
          an alternative-liquid caveat) are exactly the budget's busiest. The overflow
          sentence ("This target is above what even a coconut-heavy recipe can fully
          dissolve.") has a LIVE gate, which makes it state feedback rather than
          reference, so it renders inline as the solubility alert above these notes.
          The round that first buried it here defended the move by claiming the uses
          summary already headlines "No common use calls for N%" in every such state —
          FALSE for the 40-45% window, where dish and laundry ranges reach 45% while
          the ceiling is 40%, so the summary affirmed a use with nothing inline saying
          the soap will not dissolve.
          The castor clause moved here for the same reason and for one of its own: it is
          an exception to "unsaturated oils are less soluble" (LS:848), and the ratio
          paragraph no longer states that rule, so over there the reader met an exception
          to nothing. Here "castile ~25%" is the rule standing right in front of it, and
          the clause states the rule as it names the exception, so it needs no setup.
          Ricinoleic acid is unsaturated yet increases solubility and dilutes rapidly
          (LS:848, LS:915, LS:2382) — worth saying because castor is not a trace
          ingredient in liquid soap: the reference's own 30-Minute HTLS formulating guide
          puts it at 15-30% of the oils (LS:2723). That is a guide for one method, not a
          census of what makers build, and the earlier comment overstated it as "most
          liquid-soap recipes carry 15-30% castor" — the cite is now scoped to what it
          actually says.
          No % is claimed for castor-rich blends: the reference gives solubility
          direction, not a concentration figure, and inventing one is what this branch
          exists to stop.
          THE CONSEQUENCE is undissolved soap, never a viscosity change. "Past that the
          soap thickens or sets" survived three copy audits because it was never the
          named claim, and it was inherited from core's LS_MINIMUM_DILUTION_GUIDE doc
          (see the corrected comment there for the full accounting). The reference
          states the below-minimum failure four times and it is the same state each
          time — supersaturation with soap left over: lumps of undiluted paste or a
          thick, goopy layer on top (LS:1519), "remaining soap paste" (LS:1524),
          "remaining soap pieces or a white foamy layer on top" (LS:1610), "saturated
          and have remaining soap" (LS:2181). "Thickens" is contradicted outright for
          the case the sentence led with — coconut-heavy soaps are thin as milk or
          juice even AT the minimum (LS:1657) — and "sets" is attributed to cold
          dilution water (LS:2277, LS:2370) or NaOH (LS:2679), never to too little
          water. It was also the belief LS:3585 calls "preconceived (and incorrect)",
          which the ratio-guidance comment above already cites: one panel cited the
          debunking while printing the debunked claim.
          The same-worded overflow sentence follows lsConcentrationAboveAllMinimums,
          whose own doc now matches: above every ceiling means no recipe dissolves that
          much soap, not that the pot refuses to be liquid.
          THE HAIR SENTENCE stands alone and names its subject. "Not recommended for
          hair." sat directly after the salt-thickening sentence, so it read as a claim
          about salt-thickened soap — but the reference's claim is a row in the
          intended-use list itself (LS:1690: shampoo, not recommended for use in hair),
          about liquid soap as such, and LS:3089 lists shampoos among the products salt
          IS used in commercially. Naming the soap ("itself, thickened or not") detaches
          it from the sentence it happens to follow. */}
        <p>
          Minimum dilution is a property of the recipe, not the product: coconut-heavy soaps
          hold up to ~40% soap, most blends 25–35%, olive-heavy castile ~25%. Past that, the
          extra soap simply stays undissolved — lumps of paste, or a thick layer sitting on
          top. Castor is the odd one out — unsaturated like olive, but it makes soap more
          soluble rather than less.
        </p>
        {/* LS:1531 — true regardless of which figure (concentration or ratio) the maker
            started from, since the swelling and absorbing it describes happens either
            way. That is also what makes it reference rather than feedback: it used to
            render as a loose paragraph in EVERY state with a dilution, which is a
            standing charge against the prose budget for a technique that never
            changes. */}
        <p>
          Whichever figure you start from, add the water in stages: enough to cover the paste,
          then more in small amounts, and give it time between — the paste swells and keeps
          absorbing. Recording where you stopped makes the next batch of the same recipe exact.
        </p>
        {/* The density bridge explains a gram→millilitre conversion, so it needs a volume
            on screen to explain — reference prose or not, its gate survives the move
            into these notes. Whole batch always shows one ("≈ Finished volume");
            Custom amount only when a portion actually renders its "Makes" figure. An
            amount being asked for is NOT that question — a rejected measurement, or a
            paste already thinner than the target, suppresses the portion with the amount
            still typed in, and the caveat printed beside no millilitre figure at all:
            exactly the case the earlier Number(targetMl) > 0 gate was written to prevent.
            Gradual is the sharpest form of that case and was live until this round: it takes
            the amount field OFF the screen while `targetMl` keeps whatever was last typed
            into it, so this printed above a jar reported purely in grams. portionOnScreen is
            null-in-gradual for that reason — see it. */}
        {finishedVolumeMl !== null && (dilutionScope === 'batch' || portionOnScreen) && (
          <p>
            Volume assumes ~{LS_SOLUTION_DENSITY_G_PER_ML} g/ml — a planning figure, not a
            measured density. Weigh a known volume of your own solution if it has to be
            exact.
          </p>
        )}
      </details>
      {/* The preservative dose, rendered by App and placed here as an opaque node. INSIDE
          this panel rather than beside it because the dose is a % of the finished mass this
          panel computes — an adjacency that was only a layout convention until now, and one
          that was lost once already when the snippet was moved to sit with Additives and
          moved back the next day. Structure now enforces what a comment used to ask for.

          A node rather than the snippet's own props: this component already takes
          twenty-six besides this one and has no reason to learn what a preservative is. */}
      {preservativeSlot}
    </section>
  );
}
