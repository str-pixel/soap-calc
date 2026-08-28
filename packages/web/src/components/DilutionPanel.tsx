import { useState, type ReactNode } from 'react';
import {
  LS_DILUTION_TARGETS,
  LS_SOLUTION_DENSITY_G_PER_ML,
  lsConcentrationAboveAllMinimums,
  lsDilutionUsesFor,
  lsFinishedVolumeMl,
  type DilutionResult,
  type LsDilutionTarget,
} from '@soap-calc/core';
import { finishedProductGramsFor, preservativeDosingBasisGramsFor } from '../lib/calculateAdditives';
import { formatConcentrationPercent } from '../lib/format';
import { resolveDilution } from '../lib/resolveDilution';
import { formatWeight } from '../lib/weightUnits';
import {
  computedPotGramsFor,
  correctedPotGramsFor,
  dilutionWaterGramsForPot,
  hasCorrectedPasteBasis,
  measuredPasteRejectionFor,
  parseMeasuredPasteGrams,
  subTenthPrecisionFingerprint,
  weighedOrComputedPotGramsFor,
} from '../lib/measuredPaste';
import type { WeightUnit } from '../lib/recipe';
import {
  DILUTION_TARGET_WORDING,
  PortionDilutionResults,
  portionDilutionFor,
} from './PortionDilutionResults';
import { SegRadioGroup } from './SegRadioGroup';

/** The water:paste ratios the reference actually prints, all of them WATER : PASTE by
 * weight — the same direction the caption states, and the direction the reference's own
 * worked example confirms (32 oz of paste at 2:1 takes 64 oz of water, LS:1534).
 *
 * ONE-SHOT SETTERS FOR THE PLAN, not a mode (spec §2). A click computes what that ratio
 * lands at for the pot AT CLICK TIME and writes it into the target % field; nothing
 * subscribes to the pot afterwards, so a later measurement moves the pot and leaves the plan
 * exactly where the maker left it. That is the whole difference from the mode this replaces,
 * which re-derived and rewrote the target on every render while it was live.
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
 * Strings rather than numbers because the label a click reports back ("2.5:1 → 21.3%") has to
 * read as the maker picked it, and Number('2.5').toString() would be fine while '2.0' would
 * not — the list is the copy as much as it is the arithmetic. */
const LS_WATER_PASTE_RATIO_PRESETS = ['1', '2', '2.5', '3'] as const;

/**
 * What a ratio preset writes into the plan's target % (spec §2), for the pot in force at the
 * moment of the click: `anhydrous / (pot × (1 + r)) × 100`, rounded to 1 dp and clamped into
 * calculateDilution's own (0, 100) exclusive range as [1, 99] — the same bounds the % input
 * declares.
 *
 * The clamp is not cosmetic: an extreme ratio on a small pot can round to 0.0 or 100.0, and
 * writing THAT would send `dilution` upstream to null and vanish the panel the maker would
 * need in order to recover. The caption reports the clamped figure, so what is on screen is
 * always what was written.
 *
 * A pure function of its two arguments, exported to nothing: there is no state here, no
 * effect, and no subscription to the pot. It runs once per click and never again, which is
 * what makes "it does not track later pot changes" structural rather than a promise.
 */
function ratioPresetPercent(anhydrousGrams: number, potGrams: number, ratio: number): number {
  const solutionGrams = potGrams * (1 + ratio);
  const percent = (anhydrousGrams / solutionGrams) * 100;
  return Math.min(99, Math.max(1, Math.round(percent * 10) / 10));
}

/**
 * THE OTHER DIRECTION of the same conversion, for the intended-use list: the water:paste
 * ratio that reaches a target concentration, for the pot in force. Kept beside
 * {@link ratioPresetPercent} because the two are inverses and a change to the pot arithmetic
 * has to land on both — the buttons write a percentage from a ratio, this reads a ratio back
 * out of a percentage, and a maker comparing them is entitled to one answer.
 *
 * Null where no ratio can be quoted: a non-positive pot (nothing to pour water onto) and,
 * the case that actually happens, a target the paste is ALREADY thinner than — a 1,200 g pot
 * holding 400 g of soap is 33.3% and no amount of water reaches dish soap's 35%. The water
 * figure goes negative there, and a negative pour is not an instruction.
 *
 * Live, unlike the preset buttons: these track the pot, so weighing the paste moves them.
 * That is the difference between a readout and a decision — the buttons write a value the
 * maker then owns, this list only ever describes what is currently true.
 */
function ratioForConcentration(
  anhydrousGrams: number,
  potGrams: number,
  percent: number,
): number | null {
  if (!(potGrams > 0) || !(percent > 0)) return null;
  const solutionGrams = (anhydrousGrams / percent) * 100;
  const waterGrams = solutionGrams - potGrams;
  if (!Number.isFinite(waterGrams) || waterGrams < 0) return null;
  return waterGrams / potGrams;
}

/** One decimal, trailing zero trimmed, so the figure a maker reads here is spelled exactly
 * as the preset buttons spell it ("4:1", never "4.0:1") — the two scales are only
 * comparable if they are written the same way. */
function formatWaterPasteRatio(ratio: number): string {
  return `${Math.round(ratio * 10) / 10}:1`;
}

/** A use's whole band as ratios, IN THE SAME ORDER AS ITS PERCENTAGES — the band's low
 * percentage first, so a reader can take the two ranges end for end.
 *
 * That means the ratios run downwards, because more water makes a thinner soap: 10% is the
 * 6.3:1 end and 15% is the 3.9:1 end. Printed the other way round — smallest ratio first,
 * which reads more naturally as a range on its own — the row said "10–15% soap · 3.9:1 –
 * 6.3:1" and quietly invited the maker to pair 10% with 3.9:1, which is the opposite of
 * true. A descending range is the smaller surprise, and it is the one that can be read
 * straight across.
 *
 * Null when either end is out of reach, rather than a half-range the maker would have to
 * know to distrust. */
function ratioRangeLabelFor(
  anhydrousGrams: number,
  potGrams: number,
  target: LsDilutionTarget,
): string | null {
  const atLowPercent = ratioForConcentration(anhydrousGrams, potGrams, target.low);
  const atHighPercent = ratioForConcentration(anhydrousGrams, potGrams, target.high);
  if (atLowPercent === null || atHighPercent === null) return null;
  return atLowPercent === atHighPercent
    ? formatWaterPasteRatio(atLowPercent)
    : `${formatWaterPasteRatio(atLowPercent)} – ${formatWaterPasteRatio(atHighPercent)}`;
}

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
   * cookWaterGrams. The pot the presets multiply and the record arm sums with is the real
   * paste mass (anhydrousGrams + this), not
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
  /** THE RECORD (spec §1): water actually poured in so far, in grams, as typed
   * (LS:1531: add water in increments and record how much). Empty means "nothing typed
   * yet", not zero: zero is itself a legitimate reading (the pot before any water at all),
   * so the two must never collapse to the same value — see `resolved` below, and
   * parseGradualWaterRecordGrams' own ZERO IS A RECORD note.
   *
   * Independent state from `soapConcentrationPercent` above, and that independence is
   * structural now: nothing in this file derives one from the other in either direction
   * (decision 2, "no write-back, ever"). What a record DOES is govern — every figure derived
   * for the batch follows it while it is present, and the plan's own rows stay on screen
   * carrying the word "plan". */
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
   * composition basis the batch row's own measured-paste guards use. With
   * `cookWaterGrams` it also fixes the FLOOR under a measured paste: the two identify the
   * alternative liquid's solids, and solids do not boil off. */
  wholeBatchPasteGrams?: number | null;
  /** Rendered at the end of this panel, after the dilution figures. App supplies the
   * Preservative snippet here so the dose sits with the mass it is a percentage of —
   * structurally, not by convention. Deliberately a node and not the snippet's own props:
   * this panel has no reason to know what a preservative is, and threading its other nine
   * through a component that already takes twenty-three is how a panel becomes
   * unmaintainable. (Twenty when this note was written, and it stayed at "twenty" while
   * gradual mode added five more, then at "twenty-six" while this task removed four —
   * count them here before quoting a number.) */
  preservativeSlot?: ReactNode;
  /** The whole-batch preservative dose, in grams — App's own copy of the same figure the
   * Preservative snippet (inside `preservativeSlot`) already resolved, so the ≈ Finished
   * product row can quote the mass the bottle actually weighs (spec §3: dosing basis + the
   * dose) rather than the preservative-free basis alone. Defaulted to 0 so every caller
   * that predates the dose split — including this file's own tests — keeps seeing exactly
   * the basis it always has: `finishedProductGramsFor(basis, 0) === basis`. */
  preservativeDoseGrams?: number;
};

// THE JAR'S OWN RECORD, for Custom amount scope, is resolved now by `resolveDilution` itself
// (lib/resolveDilution.ts's `scope: 'portion'` arm) rather than by a function local to this
// component. It used to live here as `portionGradualFor` / `PortionGradualState`; absorbing it
// into `resolveDilution` is what spec §1's scope parameter asks for — the jar precedence has
// exactly one home, read identically by this panel (below) and by App's preservative dose,
// rather than two copies of the same math that could drift apart. See that module's own doc
// for the jar's full reasoning (the anhydrous share, the target-independent batch basis, the
// write-back prohibition) — none of it moved, only its address did.

/**
 * The swallowed-thousands-separator refusal, for the three GRAM fields the record surfaces
 * added:
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
  preservativeDoseGrams = 0,
}: DilutionPanelProps) {
  // NO "WHAT THE LAST CLICK DID" STATE. There used to be a caption reporting the figure a
  // preset had written ("2:1 → 25%") — after the press, for one preset. Every row states its
  // own figure before the press now, which is the question a maker actually has, so the
  // caption and the session state behind it are both gone.
  // The intended-use bands stand open (see the <details> below for why). Held here, outside
  // the `dilution ?` branch that renders them, so a maker's own collapse survives the
  // UNMOUNT that emptying the target field causes — not the re-render, which would not have
  // disturbed a bare attribute at all.
  const [usesOpen, setUsesOpen] = useState(true);
  // THE RESOLUTION (spec §1), computed from the same five inputs the view model hands
  // `resolveDilution` — `dilution`, the record, the anhydrous soap, the corrected paste, the
  // cook water and the reading — so the arm this panel renders and the arm the view model
  // prices, doses and prints are the same answer by construction rather than by convention.
  // In Whole batch it is the one function, called twice with identical arguments, never a
  // second copy of the rule: a fourth "is there a record" predicate is exactly how the panel
  // and the printed sheet came to disagree about whether a record existed once before.
  //
  // Called here rather than threaded as two more props because the alternative is a prop pair
  // a caller could contradict — every one of this component's twenty-odd existing tests
  // constructs its own props, and a `dilutionGoverns` that disagreed with the
  // `gradualWaterGrams` beside it would render a panel the app can never produce.
  //
  // SCOPE-AWARE (spec §1's scope parameter, phase 2b): passing `dilutionScope` through and,
  // in Custom amount, the jar's own two fields, is what absorbs the jar precedence into this
  // one call — `resolved.governs` / `.record` / `.jar` answer for whichever scope is on
  // screen, and App's own `preservativeBasis` reaches the identical verdict by making the
  // identical call (see App.tsx). `gradualWaterGrams` is passed through unconditionally: the
  // portion arm of `resolveDilution` never reads it (spec §2 — the batch record participates
  // nowhere in portion scope), so there is nothing to gate here.
  const resolved = resolveDilution({
    dilution,
    gradualWaterGrams,
    anhydrousGrams: dilution?.anhydrousGrams ?? 0,
    // `?? null` for the resolution's narrower signature — the panel's prop is optional and
    // `undefined` means exactly what `null` does to hasCorrectedPasteBasis: no corrected
    // basis, fall back to the recipe's water-only pot. Same for the cook water, whose `?? 0`
    // is the arithmetic sites' own coalesce (the guard call sites still pass it through
    // undefined, which is how lib/measuredPaste tells "unknown" from "zero").
    wholeBatchPasteGrams: wholeBatchPasteGrams ?? null,
    cookWaterGrams: cookWaterGrams ?? 0,
    measuredPasteGrams,
    scope: dilutionScope,
    jar:
      dilutionScope === 'portion'
        ? { pasteGrams: portionPasteGrams, waterGrams: portionWaterGrams }
        : undefined,
  });
  // THE WHOLE BATCH'S RECORD, and the scope gate is part of its definition rather than of
  // its twenty consumers: **the batch record participates nowhere in portion scope**
  // (spec §2, verbatim — "each record leads in its own scope"). Custom amount's own record is
  // the jar's two fields, resolved separately below; a batch record reaching into portion
  // sizing, its ceiling, its uses or its refusals would be the cross-scope leak that rule
  // exists to forbid, and gating it here makes that structural instead of twenty remembered
  // clauses.
  //
  // Non-null exactly when there is something to SHOW: `governs === 'record'` with a null
  // record is "nothing to show yet" (resolveDilution's pinned contract), and it can only
  // arise where `dilution` itself is null — every consumer below already sits inside a
  // `dilution &&` branch, so the two are equivalent there and neither is an error.
  const batchRecord =
    dilutionScope === 'batch' && resolved.governs === 'record' ? resolved.record : null;
  // THE GOVERNING RECORD FOR WHICHEVER SCOPE IS ON SCREEN — `batchRecord` above, scope-gated
  // for the Whole-batch-only figures that read it by that name, and this scope-GENERAL
  // twin for the two pieces of copy that must speak of whichever record actually governs:
  // the batch's in Whole batch, the JAR's in Custom amount (spec §1's scope parameter — the
  // jar precedence lives inside `resolveDilution` itself, so `resolved` already reflects
  // whichever scope was passed to it above, and no second gate is needed here). Null exactly
  // when the plan governs, OR when a record/jar governs the scope but nothing can be shown for
  // it (resolveDilution's pinned "governs 'record', record null" contract — see its own doc).
  const governingRecord = resolved.governs === 'record' ? resolved.record : null;
  // THE RESOLVED % — the one figure every piece of record-governed copy interpolates
  // (spec §4's interpolation rule). Implemented literally without this, the uses matcher read
  // the resolved figure while the caption beside it read the plan, printing "No common use
  // calls for 30%" against a 46.2% match. Scope-general (`governingRecord`, not `batchRecord`)
  // so the SAME bug in Custom amount is fixed the same way: a jar diluted onto a 30%-plan
  // batch is its own concentration, not the plan's, and the ceiling/uses copy below must
  // speak of the jar's own reading exactly as the batch paragraph already does.
  const resolvedConcentrationPercent = governingRecord
    ? governingRecord.concentrationPercent
    : Number(soapConcentrationPercent);
  // Which intended uses the CURRENT batch suits — the dilution figure is the one number
  // with no chemistry to pin it, so the guidance is by product, not by recipe. Reads the
  // resolved %, never the raw setting: with a record in the pot the question a maker is
  // asking is what they have, not what they were aiming at.
  const suitedUses = lsDilutionUsesFor(resolvedConcentrationPercent);
  // Same guards PortionDilutionResults applies to the identical measurement: below the anhydrous
  // soap it cannot be a whole-batch paste, above the target solution there is no water left
  // to add. Both accept the boundary. A measured paste that survives these WINS over the
  // computed TARGET-DERIVED figures below — the portion — and this is the gate the copy about
  // them answers to: the "Dilution water above uses your measured paste" hint, and the
  // suppression of the two already-more-dilute alerts and the can't-tell hedge, all of which
  // speak in the maker's voice about a reading the exceeds-solution alert would otherwise be
  // refusing.
  //
  // TWO OTHER QUESTIONS have their own gates, and neither is this one. Which POT the RECORD
  // arm and the ratio presets count from is potBasis just below. Which pot the batch POUR is
  // measured against is correctedPot here — resolved ONCE, with the batch row below
  // subtracting this same pot (dilutionWaterGramsForPot), so the verdict the copy speaks and
  // the figure the row pours cannot drift. The bottled mass runs the same gate inside
  // computeBottledSolutionGrams.
  const correctedPot =
    dilution !== null
      ? correctedPotGramsFor(dilution, measuredPasteGrams, wholeBatchPasteGrams, cookWaterGrams)
      : null;
  const measuredPasteValid = correctedPot?.fromMeasurement ?? false;
  // WHICH POT THE RECORD ARM AND THE PRESETS COUNT FROM, and the one question a target must
  // not answer. lib/measuredPaste's target-independent resolution: the reading wins when it
  // parses, is not finer than a scale reads, and is not below the batch's own non-evaporable
  // mass — the three rules that describe the POT — and otherwise the recipe's computed pot
  // answers. It deliberately does not ask whether the reading is heavier than the solution
  // the plan dilutes to, because neither consumer is aiming at that target: a preset
  // multiplies whatever pot it is given at the moment of the click, and the record arm
  // DERIVES its own concentration from this very basis. Letting that ceiling choose the basis
  // closed a live render loop while the derivation was written back (weighed pot + zero water
  // → write a percent → the solution it implies lands a hair under the reading → reject →
  // computed pot → a different percent → accept → forever). The write-back is gone and the
  // loop with it, but the reason the basis must stay target-independent is not: a % derived
  // from a pot chosen by that same % is circular whether or not anything persists it. See
  // weighedOrComputedPotGramsFor and measuredPasteDescribesPotFor for the full account.
  //
  // It is the same call resolveDilution makes for the record arm's pot, with the same four
  // arguments, so `potBasis.grams` and `record.potGrams` are one figure — the presets and the
  // record cannot count from different pots.
  //
  // Resolved in lib/measuredPaste rather than here so the printed BatchSheet's "That record
  // makes" row reaches the identical figure by CALLING the same function, instead of importing
  // half of it out of this component module and hand-rolling the rest — which is how the sheet
  // came to answer with one gate what its own pour answered with another.
  //
  // The reading is still judged against the ceiling everywhere the ceiling means something:
  // measuredPasteValid above (the portion, and the copy that speaks for a reading) keeps it
  // exactly, the rejection alerts below keep it exactly, and the batch pour and the bottled
  // mass keep it exactly too (correctedPotGramsFor). Only the basis this line chooses drops it
  // altogether.
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
  // The measured-paste INPUT lives in this shell and is visible in BOTH scopes, so its
  // feedback has to be here too: the three rejection alerts used to render only inside
  // PortionDilutionResults, which appears in Custom amount scope alone — leaving the
  // DEFAULT scope with a physically impossible reading on screen, no alert, and a dilution
  // figure that had silently ignored it. Same helper PortionDilutionResults reads, so the
  // panel and the portion figures can never disagree about whether a reading is usable.
  const measurementRejection = dilution
    ? measuredPasteRejectionFor(measuredPasteGrams, dilution, wholeBatchPasteGrams, cookWaterGrams)
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
  // Resolved by `resolved` (above) rather than by a second call or a local helper, so App can
  // ask the SAME question for the preservative dose — in Custom amount the dose is a % of the
  // jar, and it used to be a % of a target-derived portion the maker never asked for. The
  // jar's own soap comes from core's lsPotAnhydrousShare inside resolveDilution's portion arm;
  // see that module's own doc for why it no longer travels through lsPartialDilution.
  //
  // Both null/false outside Custom amount, which every consumer of them below already gates
  // on: a jar is a claim about what Custom amount is showing, and resolving one for a screen
  // that shows no jar invites a future reader to consume it from a state where the two fields
  // behind it are stale session values. Its sibling `portionState` is null there for the
  // sharper version of the same reason — see it.
  //
  // THE MODE TERM THIS CLAUSE USED TO CARRY was the panel's only way into the jar, and the
  // mode is gone. Its replacement is the jar's OWN record (spec §4's conversion rule: every
  // mode gate becomes a record-presence gate, and each record leads in its own scope — the
  // BATCH record participates nowhere here). The two fields are rendered in Custom amount
  // unconditionally now, because a field behind a gate the maker cannot open is a field that
  // does not exist; `hasBothFigures` (on `resolved.jar`) is what decides whether the jar
  // GOVERNS, which is the question every consumer below actually asks — and it IS
  // `resolved.governs === 'record'` for a portion-scope call (see resolveDilution's own doc:
  // the two are never a second predicate, they are the same one read two ways). Every jar
  // figure, refusal and wording is unchanged — only the way in is. Portion scope's own
  // two-row shape, its plan-beside-jar labelling and its alert cells are delivered (spec §6,
  // Phase 2b) — this component is that delivery.
  const portionJarValidity = dilutionScope === 'portion' ? resolved.jar : null;
  const portionGradual = dilutionScope === 'portion' ? resolved.record : null;
  // DOES THE JAR GOVERN in Custom amount — the portion scope's own twin of `planGoverns`
  // above, and the exact predicate the deleted mode gate used to stand in for. Both figures
  // present (paste > 0, water >= 0, neither a swallowed separator) means the maker has
  // described this jar by record, so the jar's figures answer and the plan's sizing grid
  // stands down, exactly as Custom amount + Gradual did. Anything less is plan sizing, which
  // is what an untouched Custom amount screen has always shown.
  const portionJarGoverns = dilutionScope === 'portion' && resolved.governs === 'record';
  // DOES THE PLAN GOVERN THE SCOPE ON SCREEN — the one predicate every plan-CLAIM below is
  // gated on (spec §3: "overDilutionCertain and every other plan-claim is gated on
  // plan-governs"; spec §4's conversion table, which turns each of this file's old mode
  // exclusions into exactly this).
  //
  // SCOPE-AWARE, because "the plan governs" is a question about the scope the maker is
  // looking at and each record leads in its own (spec §2). In Whole batch that is the batch
  // record; in Custom amount it is the JAR's, and the batch record is invisible there by
  // construction (see batchRecord above). Written as the batch record alone, a whole-batch
  // record would have silenced Custom amount's own refusals about a jar it says nothing
  // about — the cross-scope leak in its most damaging direction, since those refusals are
  // what stop a mis-typed jar being dosed.
  const planGoverns = dilutionScope === 'batch' ? batchRecord === null : !portionJarGoverns;
  // Whether the exceeds-solution refusal is ACTUALLY ON SCREEN, not merely flagged. The
  // plan-governs exclusion is the paragraph's own (see its full reasoning where it renders):
  // every clause of it is about a TARGET the paste cannot reach, and the record arm is not
  // aiming at one — spec §4's conversion of the two mode exclusions this clause used to
  // carry, which said the same thing about the two modes that had no target. Named here
  // because three places need the answer and they must never drift: the paragraph itself; the
  // solubility ceiling below, whose suppression is subsumption — it stands down only while a
  // stronger claim about the same target is on screen, so it has to ask whether this one
  // renders rather than whether the rule fired; and the corrected-pot alert's render
  // condition (pasteAlreadyPastTargetAlert), which yields to this paragraph on the same
  // must-be-on-screen discipline.
  const exceedsSolutionAlert = (measurementRejection?.exceedsSolution ?? false) && planGoverns;
  // There is deliberately NO "is any rejection paragraph on screen" const here any more. One
  // existed (measurementRejectionAlert, the disjunction of the four rules' render conditions)
  // for exactly one consumer: the corrected-pot verdict's spoken-for disjunction kept a
  // refusal as a third voice for one round. That voice is gone (decided 2026-08-16, second
  // round — see pasteAlreadyPastTargetSpokenFor), and the const went with it rather than
  // idling as a drift hazard: it re-read three raw flags in parallel with the render sites,
  // so any future mode gate on one of those paragraphs would have had to be mirrored here by
  // hand or the two answers forked. noUnusedLocals would have forced the deletion anyway;
  // this is it done on purpose, with the reasoning written down. The question has since
  // found one new consumer — pasteAlreadyThinnerAlert's rejection yield (decided
  // 2026-08-17) — which carries the four render conditions inline at its own clause, with
  // the same drift warning written there; a single consumer does not earn the shared const
  // back, and the hazard is no smaller for being named.
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
  // The pot a preset multiplies, and the pot the record arm sums with: the reading when it
  // describes a possible POT, else the recipe's own computed pot. One resolution
  // (weighedOrComputedPotGramsFor, above), shared with resolveDilution's record arm, with the
  // jar in Custom amount and with the printed sheet, so no two surfaces can answer this
  // question differently.
  //
  // The gate there is deliberately NOT measuredPasteValid: that one also asks whether the
  // reading is heavier than the solution the PLAN dilutes to, and neither consumer here is
  // aiming at that target — a preset multiplies whatever pot it is given, and the record arm
  // derives its own concentration from this expression. A basis chosen by a figure downstream
  // of itself is not a basis. The batch pour one screen below still answers to a ceiling,
  // because solutionGrams − measured really does have to be a pour it can print.
  //
  // wholeBatchPasteGrams (anhydrousGrams + cookWaterGrams + splitLiquidSolidsGrams,
  // computed in the view model) is a PREDICTION and is never corrected by a measured
  // reading — the two figures live independently, and that resolution is where the app
  // decides between them. A cook boils off water the recipe still counts, and nothing on
  // paper knows how much a particular cook drove off, which is the whole reason the
  // reference has the maker weigh the paste; a valid measurement is direct evidence
  // against the prediction and always outranks it.
  const pasteGrams = potBasis?.grams ?? null;
  // WHY THE RECORD CAME BACK EMPTY, when it did: the shared parser refuses a record carrying
  // a swallowed thousands separator (a typed 2,000 commits as '2.000'), which is what stops
  // 2 g of water governing the batch and printing on the sheet. The FIELD is here, so the
  // refusal has to be explained here — read from the same fingerprint the parser applies,
  // never a second copy of the rule.
  const gradualWaterSubTenthPrecision = subTenthPrecisionFingerprint(gradualWaterGrams);
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
  // THE PLAUSIBILITY NOTE (carried from PR #167 review triage, Dilution Phase 2b task 4). The
  // record arm's own pot is target-independent by design — measuredPasteDescribesPotFor has
  // no ceiling at all, and cannot get one without reopening the render loop its own doc
  // describes (a % derived from a pot chosen by that same %). So a maker who left the empty
  // crockpot on the scale, or read a kitchen scale in the wrong unit, gets no alert from the
  // pot's own rules — the reading parses, clears the solids floor, is not finer than a scale
  // reads — and there is no ceiling here to catch it either. This is the one TARGET-FREE
  // sanity check the triage still allows: a QUESTION, never a verdict, so it is a plain
  // paragraph, not a role="alert" — see its render site below.
  //
  // THE THRESHOLD IS A RULING, not a figure this codebase derives from any source (the
  // reference names no such bound): tune PASTE_PLAUSIBILITY_MULTIPLIER if a better one turns
  // up. Nothing else on this panel depends on this exact number, so it costs nothing to be
  // wrong in either direction — a hint that appears a little early or a little late moves no
  // figure anywhere on screen.
  //
  // COMPARED AGAINST computedPasteGrams (computedPotGramsFor's own figure), never against
  // pasteGrams (the resolved WEIGHED-OR-computed basis): "the paste this recipe makes" is a
  // claim about the recipe's own oils and cook water, corrected for an alternative liquid's
  // solids exactly as every other surface on this branch corrects it — not about whichever
  // pot the record happens to be counting from at the moment, which is what pasteGrams would
  // silently become the instant the reading itself was the implausible one.
  //
  // RENDER-KEYED against every refusal paragraph above, not against measurementRejection's
  // raw flags: `measuredPasteDescribesPot` is already false whenever nonPositive,
  // subTenthPrecision or belowSolids would render — measuredPasteDescribesPotFor shares
  // exactly those three rules (parse, precision, solids floor), so a refused reading can
  // never also be "the weighed pot" this note is about. And exceedsSolutionAlert cannot
  // render here at all: its render condition is `planGoverns`, which is false whenever
  // `batchRecord` is non-null (the gate this hint renders under, below) — a refusal about the
  // reading already has a voice, and this hint is for an ACCEPTED but implausible one.
  const PASTE_PLAUSIBILITY_MULTIPLIER = 2;
  const pasteReadingImplausible =
    measuredPasteDescribesPot &&
    computedPasteGrams !== null &&
    computedPasteGrams > 0 &&
    pasteGrams !== null &&
    pasteGrams > PASTE_PLAUSIBILITY_MULTIPLIER * computedPasteGrams;
  // THE RECORD ARM'S OWN FIGURES, and the whole of what replaces the two write-back effects
  // that stood here. `resolved` (above) holds them: the pot — weighed when the reading
  // describes a possible one, else the recipe's computed pot — plus the water the maker
  // actually poured, and the concentration that falls out of the two. UNROUNDED and
  // UNCLAMPED, because it is a readout and never a value fit to be written anywhere: the
  // clamp that used to bound it existed only to keep a write legal.
  //
  // WHAT IS GONE HERE, and why none of it can come back (decision 2, "no write-back, ever"):
  //   - both useEffects that called onSoapConcentrationChange with a derived percentage;
  //   - ratioTouched / gradualTouched and the mode-change effect that reset them, which
  //     existed only because entering a derived mode used to rewrite a typed target;
  //   - ratioNotAppliedYet / gradualNotAppliedYet, whose whole subject was the gap between a
  //     derived figure and a plan it had not been written into — spec §4 deleted them,
  //     because with the plan rows labelled as plan there is nothing left unapplied;
  //   - the [1, 99] write-back clamps and their two alerts.
  // The plan is now what the maker typed or what a preset click wrote, and nothing else ever
  // touches it. That is a property of this file having no path from a record to
  // onSoapConcentrationChange at all, not of a guard that could be loosened.

  // The measurement corrects the BATCH figure the same way it already corrects the portion
  // in PortionDilutionResults — shared with the printed BatchSheet so both surfaces always agree.
  // wholeBatchPasteGrams went into correctedPot above for the second correction the helper
  // applies: without it this row derived its water from calculateDilution's anhydrous + water
  // pot while the preset arithmetic above derives its own from computedPasteGrams, which
  // counts an alternative liquid's solids. Two figures on one screen, differing by exactly
  // those solids (5,000 g in the panel against 5,450 g on the printed sheet). Same basis both
  // ways now.
  //
  // A PLAN FIGURE, whichever arm governs: it is what the plan still asks the maker to pour,
  // and §2 keeps it on screen under a plan label while a record governs rather than hiding
  // it. Nothing about it changes with the record — only the word "(plan)" beside it.
  const batchDilutionWaterGrams = dilution ? dilutionWaterGramsForPot(dilution, correctedPot) : 0;
  // Asked of the same helper PortionDilutionResults itself renders from, so the shell can
  // never believe something about Custom amount that Custom amount does not show. The
  // portion figures are still the child's to render; the shell reads this verdict for two
  // things only — the density caveat below (which needs a millilitre figure to explain) and
  // portionOwnsUndeclaredLiquidHedge, which suppresses the shell's copy of a hedge the child
  // is already printing in its own words.
  //
  // NULL IN WHOLE-BATCH SCOPE, because the child that answers for it is not on screen there.
  // NO LONGER NULL WHILE A JAR RECORD GOVERNS (Phase 2b, spec §2: "the plan grid stays
  // rendered beside a filled jar record, labelled as plan") — the child renders in every
  // Custom amount state now, so this is computed for every one of them too, on the SAME
  // `targetMl` a governing jar leaves untouched (it is App session state that survives
  // everything, and always was: a jar being recorded is not a reason to stop sizing what the
  // plan would take). What changed is not "does this compute", it is that the CHILD's own
  // grid is no longer suppressed once it does — see the render site below, and see
  // `overDilutionSpokenFor` / `pasteAlreadyPastTargetSpokenFor` for the one place a
  // consumer of this const still has to ask "which subject is the ceiling about" before
  // treating the child's plan-verdict as a voice for it.
  const portionState =
    dilution && dilutionScope === 'portion'
      ? portionDilutionFor({
          dilution,
          targetMl,
          measuredPasteGrams: measuredPasteGrams ?? '',
          wholeBatchPasteGrams,
          cookWaterGrams,
          // The same two values forwarded to the child itself, so the helper's
          // verdict-vs-hedge fork (pasteAlreadyThinnerWorded) answers for the branch the
          // child really renders. Omitted, the helper defaults to "knowable" and would
          // report the verdict worded while the child was hedging.
          unknownLiquidGrams,
          overDilutionCertain,
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
  // Shared with PortionDilutionResults so this shell's Whole-batch twin of that refusal and
  // the child's own Custom-amount wording of it can never name different controls.
  //
  // A CONSTANT, NOT A CALL: there is one control now, the % field, on screen in every state
  // this refusal can render in, so there is one wording to give and nothing left to decide.
  // Both callers reading one constant is what keeps them from ever wording the remedy for a
  // control the panel no longer has.
  const refusalWording = DILUTION_TARGET_WORDING;
  // The Whole-batch twin of PortionDilutionResults' unmeasuredPasteAlreadyThinner, and the
  // exact condition under which dilutionWaterGramsForPot's clamp fires: the corrected pot
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
  // clamp to explain. A reading refused by the READING-ONLY rules (belowSolids,
  // nonPositive, subTenthPrecision) does NOT suppress the predicate or its paragraph: the
  // row falls back to the recipe's own clamped figure in that case, and those refusals
  // speak only about the reading — they never account for the zero underneath. The
  // exceeds-solution refusal is the exception (decided 2026-08-16, second round): it DOES
  // account for it — a paste already heavier than the solution is precisely why there is
  // no water to add — so the RENDER condition below stands down while that paragraph is on
  // screen. The predicate itself stays refusal-blind; the yield lives at the render.
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
  // PLAN-GOVERNS ONLY (spec §4's conversion of this alert's old gradual-mode exclusion). Every
  // clause of it is a claim about a TARGET: the pot outweighs the solution THAT TARGET makes,
  // so THAT TARGET has no water left to add, and the remedy is to lower it. A record arm has
  // no target — the batch is what it is, its own concentration is printed beside it, and the
  // plan's pour row is on screen labelled as plan with its own figure intact. Stating this
  // verdict there would be a verdict about a number the maker has stopped aiming at, quoting
  // the COMPUTED pot beside a record counting from the weighed one.
  const pasteAlreadyPastTarget =
    dilution !== null &&
    planGoverns &&
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
  // its own words (PortionDilutionResults' pasteAlreadyThinnerWorded), which is why the
  // ceiling's suppression reads that too rather than this alone.
  //
  // A REJECTED reading stands this alert down only while its refusal is actually ON
  // SCREEN (decided 2026-08-17, the code-review round; the clause read the raw
  // `measurementRejection.rejected` flag before that). The refusal's licence to replace
  // this verdict is that it renders in the verdict's place — and the exceeds-solution
  // paragraph is now plan-governs only, so under a record the flag could be
  // true while the screen said NOTHING: a maker whose reading already exceeds the plan's
  // solution would get neither the refusal nor this alert, at a plan the batch is
  // already past — the flag-keyed shape this project has paid for five times. The three
  // reading-only rules (nonPositive, subTenthPrecision, belowSolids) render on their bare
  // flags in both scopes and under either arm, so for them the flag IS the paragraph's render
  // condition — the terms below track those render sites, and must follow if one of them
  // ever grows a gate of its own. The exceeds-solution term is `exceedsSolutionAlert`,
  // the same const its paragraph renders on.
  //
  // PLAN-GOVERNS ONLY, like its sibling and for the same reason (spec §3: "overDilutionCertain
  // and every other plan-claim is gated on plan-governs"). "The paste is already more dilute
  // than N%" names the PLAN's N and asserts that adding water only takes the batch further
  // from it; a record arm is not travelling toward it.
  //
  // THIS LINE IS WHERE THAT GATE LIVES, and it is the only place it can. The view model's
  // `overDilutionCertain` is ungated (see its memo — gating it there leaked the batch record
  // into portion scope), and it would not have been enough anyway: with no undeclared liquid
  // the last clause below never consults that flag at all, so a flag-side gate would have left
  // this paragraph rendering on every ordinary over-dilute recipe.
  const pasteAlreadyThinnerAlert =
    dilution !== null &&
    dilutionScope === 'batch' &&
    planGoverns &&
    dilution.targetExceedsPaste &&
    !measuredPasteValid &&
    !(measurementRejection?.nonPositive ?? false) &&
    !(measurementRejection?.subTenthPrecision ?? false) &&
    !(measurementRejection?.belowSolids ?? false) &&
    !exceedsSolutionAlert &&
    (unknownLiquidGrams === 0 || overDilutionCertain);
  // The corrected-pot alert's RENDER CONDITION, on the same discipline as the sibling
  // above: the predicate has no dilutionScope term, but its paragraph lives inside the
  // batch-scope block, so the two answer differently in Custom amount. Named so that block
  // and the solubility ceiling's suppression (pasteAlreadyPastTargetSpokenFor below) read
  // one answer and cannot drift — the ceiling used to read the bare predicate here, and the
  // pair of them held together only by coincidence of this component and the child agreeing.
  //
  // The third clause is a yield (decided 2026-08-16, second round): when the
  // exceeds-solution rejection is on screen it names the maker's own typed figure against
  // the very solution this verdict compares the corrected pot to, so it already explains
  // the 0 g row — two verdicts about one target are one verdict too many, and the
  // rejection, which quotes the reading the maker just took, wins. Keyed on that
  // paragraph's RENDER (exceedsSolutionAlert), never on the rejection's flag: under a record
  // the flag can be true while the paragraph is plan-governs-gated off, and a
  // flag-keyed yield would have silenced this alert over a screen that says nothing — the
  // shape this project has paid for four times. (It cannot bite here today, because this
  // alert is itself plan-governs only — but the two gates are independent, and the discipline
  // is what stops the next one from being written flag-first.) Where the refusal on screen is
  // reading-only (belowSolids, nonPositive, subTenthPrecision) the two still stack: those
  // refusals say nothing about the target, and this paragraph is the only account of the
  // 0 g underneath them.
  const pasteAlreadyPastTargetAlert =
    dilutionScope === 'batch' && pasteAlreadyPastTarget && !exceedsSolutionAlert;
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
  // missing figures explained, so it owns the message there — INCLUDING while a jar record
  // governs: since the plan grid came back beside the jar (spec §2, phase 2b), the child
  // renders in every Custom amount state, `portionOwnsUndeclaredLiquidHedge` can be true
  // there, and this shell clause stands down to it. Pinned by the hedge tests in this
  // file's portion describes.
  //
  // It did not always. While `portionState` was still computed from a stale `targetMl` in the
  // state the child was suppressed in, `pasteAlreadyThinner` could be true — suppressing this
  // clause in favour of a child that had already been suppressed, so the warning appeared on
  // NEITHER surface and an undeclared liquid went unmentioned. Pinned by a test.
  //
  // SUPPRESSED UNDER A BATCH RECORD (spec §3, and §4's rule that a plan claim has no subject
  // while a record governs). "Can't tell whether 85% is REACHABLE" is a question about the
  // plan and about nothing else; the record arm is not travelling toward it. The plan row it
  // hedges over is still on screen there, and it is not left bare — the plan-labelled caption
  // under the grid accounts for the 0 g (spec §4).
  //
  // KEYED ON `batchRecord`, NOT on `planGoverns`, and the difference is the scope seam. This
  // clause renders in BOTH scopes, and in Custom amount `planGoverns` answers for the JAR —
  // so keying on it would silence the hedge for a recorded jar, in a scope where nothing else
  // says it (the child that owns the message elsewhere does not render for a governing jar).
  // An undeclared liquid would have gone unmentioned on both surfaces, which is the exact
  // defect the regression pin below this clause's own sibling exists for.
  //
  // AND THE GATE IS THE WHOLE OF WHAT THIS CLAUSE READS ABOUT THE RECORD. `overDilutionCertain`
  // is deliberately UNGATED in the view model (see its memo): it is a fact about the recipe,
  // and it is read in portion scope too — by this clause and by the `overDilutionCertain` prop
  // forwarded to PortionDilutionResults, which decides whether the child asserts the verdict
  // or hedges over it. Gating it there made a whole-batch record flip a Custom amount screen
  // from the assertion to the hedge and resurrect the solubility ceiling on top, in a scope
  // that does not even show the field. With it ungated, `batchRecord === null` is the only
  // record term on this line and it is null in portion scope by construction — so Custom
  // amount really does behave exactly as it always has, term by term.
  const cantTellGate =
    dilution !== null &&
    batchRecord === null &&
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
  //   Custom amount, same state                    → the child words it (pasteAlreadyThinnerWorded)
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
  //
  // AND THAT RULE REACHES THE CHILD'S HEDGE TOO (decided 2026-08-17, the code-review
  // round; the second disjunct read `portionState?.pasteAlreadyThinner` — the child's
  // FLAG — until then). The flag is also true in the undeclared-liquid uncertain state,
  // where what the child renders is its own can't-tell hedge ("No portion can be sized
  // yet…"), not its wording of the verdict — so Whole batch showed ceiling + hedge while
  // Custom amount, one radio over, showed nothing at all: the user's decision applied to
  // one side of the scope seam. The disjunct now reads `pasteAlreadyThinnerWorded`, the
  // helper's own name for "the verdict branch is what renders" (resolved beside the flag
  // in portionDilutionFor, read by the child's render and by this line, so the two cannot
  // fork) — the child's voice counts exactly when the child is saying the verdict.
  //
  // `governingRecord === null` GUARDS THE DISJUNCT (Phase 2b): the child's own plan-verdict
  // is ALWAYS about the PLAN's saved target — `dilution.targetExceedsPaste`, computed with
  // no reference to any jar — because the grid it belongs to now renders beside a governing
  // jar too (spec §2), not only while the plan governs. The ceiling this const suppresses is
  // NOT always about the plan any more: with a jar governing and resolved, it is about the
  // JAR's own %, a different subject the child's paragraph says nothing about — two true,
  // independent claims, and subsuming one with the other would be exactly the flag-vs-render
  // confusion this project has paid for repeatedly, just turned sideways (right render, wrong
  // subject, instead of wrong render). `governingRecord === null` is precisely "the ceiling
  // is evaluating the plan too" — true with no jar, AND true in the one jar-governing cell
  // where nothing resolves (pasteExceedsBatch: `resolvedConcentrationPercent` itself falls
  // back to the plan there, so the child's plan-voice is a legitimate subsuming voice again).
  const overDilutionSpokenFor =
    pasteAlreadyThinnerAlert ||
    (governingRecord === null && (portionState?.pasteAlreadyThinnerWorded ?? false));
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
  //
  // `governingRecord === null` GUARDS THIS DISJUNCT TOO, for the identical reason as its
  // sibling above: `unmeasuredPasteAlreadyThinner` is a claim about the PLAN's corrected pot
  // vs. the PLAN's own solution, with no jar in it anywhere, and the child that carries it
  // now renders beside a governing jar as well as without one. Ungated, a governing, resolved
  // jar's own over-ceiling reading would go silent because an unrelated plan-verdict happened
  // to render in the same grid — two different subjects, and only one of them should be able
  // to stand this sentence down.
  const pasteAlreadyPastTargetSpokenFor =
    pasteAlreadyPastTargetAlert ||
    (governingRecord === null && (portionState?.unmeasuredPasteAlreadyThinner ?? false));
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
  // weighs" must not be able to mean two things in one column. This is the preservative-
  // FREE basis — never shown on its own; see bottledGrams below for what actually renders.
  const preservativeDosingBasis = preservativeDosingBasisGramsFor(bottledSolutionGrams, dilution);
  // What the bottle actually weighs (spec §3): the basis plus the dose App resolved for it.
  // Equals the basis exactly when preservativeDoseGrams is 0 (its default), so every caller
  // that predates the dose split sees byte-identical figures.
  const bottledGrams = finishedProductGramsFor(preservativeDosingBasis, preservativeDoseGrams);
  // Every other figure here is mass. Volume is what tells a maker whether their dilution
  // vessel and packaging are big enough — so the density bridge is shown here rather than
  // left implicit.
  const finishedVolumeMl = bottledGrams !== null ? lsFinishedVolumeMl(bottledGrams) : null;
  // The finished mass the grid already states under whichever arm governs — the record's
  // "Finished so far", else the plan's "Finished solution". The bottled row exists to show a
  // mass the grid does NOT already have, so the comparison has to be against the figure
  // actually on screen: keyed on `dilution.solutionGrams` under a record, a bottle lighter
  // than the plan's solution (which is every mid-pour batch) hid the row while the volume row
  // below went on converting it, leaving a millilitre figure derived from a mass nothing on
  // screen stated.
  const governingFinishedGrams = batchRecord
    ? batchRecord.finishedGrams
    : (dilution?.solutionGrams ?? null);
  // Show the product mass whenever it differs from that row, so the finished VOLUME below
  // (derived from it, not from the solution) reconciles with what is above it.
  const showBottledRow =
    dilution !== null &&
    bottledGrams !== null &&
    governingFinishedGrams !== null &&
    bottledGrams > governingFinishedGrams + 0.5;
  // THE STARTING POINTS, extracted so each scope can place them where they belong: in
  // Whole batch they follow the scope switch (inputs -> reference -> figures); in Custom
  // amount they wait until AFTER the jar's own input block — rendered between the scope
  // switch and those fields, the strip interrupted the flow and the boundary sentence
  // above it swept live inputs into "reference points".
  const startingPoints = (
    <>
          {/* BUTTONS, not radios, and that is the whole design of them (spec §2). A radio group
              claims one of its options describes the current state; these do not — they DO
              something and stop. Nothing here re-derives a "current" ratio from the plan %, so a
              value that matches no preset (a hand-typed 34%, or a 33.85 left behind by the
              write-back this task deleted) simply leaves the group unmarked, which is the honest
              reading of it.

              It also retires an entire class of bug this file paid for twice: while these were
              radios, re-asserting an ALREADY-CHECKED one fired no change event, so the obvious
              remedy was inert by mouse and by keyboard and three handlers had to be hung on each
              input to recover it (the Chromium event census that comment carried is no longer
              needed — a button fires click for mouse, Space and Enter alike). And a Tab keyup
              landing on a freshly focused radio could apply a ratio the maker never picked; a
              button cannot be activated by arriving at it.

              The legend keeps owning the DIRECTION: these read "2:1", and the same tokens mean
              water:lye elsewhere in the app, so the group never restates the relationship on its
              own. Neither name says "common" — "the most common ratios used are 1:1, 2:1 and 3:1"
              is said of water:LYE (LS:1500), a different quantity at a different stage. What the
              reference does say about these is that they are where makers begin (LS:1534), which
              is what the legend says. */}
          <div
            className="dilution-presets"
            role="group"
            aria-label="Starting points for the water to paste ratio"
          >
            <span className="dilution-toggle__legend">Starting points</span>
            {/* One bordered strip of four cells, each stating what pressing it does. No visual
                header row any more: each cell stacks its own ratio, the % it sets, and what
                that suits, so the columns a header would name no longer exist. NONE of the
                cells is marked current — these write a value once and stop (see the group
                comment above), so the strip never claims one of them describes the plan. */}
            <div className="dilution-presets__strip">
            {LS_WATER_PASTE_RATIO_PRESETS.map((preset) => {
              // ONE DERIVATION for the label and the click, so the row cannot promise a figure
              // the press does not write. Null with no pot: there is nothing to multiply.
              const percent =
                dilution === null || pasteGrams === null
                  ? null
                  : ratioPresetPercent(dilution.anhydrousGrams, pasteGrams, Number(preset));
              // WHAT THIS RATIO MAKES, named from the same bands the list below states, so the
              // choice reads as a product rather than as a quantity of water. Computed from the
              // pot in force, so weighing the paste moves the names with the arithmetic instead
              // of leaving a label describing a batch no longer on the bench. Silent where the
              // ratio lands outside every band — inventing a name would assert a use the
              // reference does not list.
              const uses = percent === null ? [] : lsDilutionUsesFor(percent);
              const sets = percent === null ? '—' : `${formatConcentrationPercent(percent)}%`;
              return (
                <button
                  key={preset}
                  type="button"
                  className="dilution-preset"
                  // Disabled with no pot to multiply: a control that does nothing when pressed is
                  // worse than one that says it cannot. `dilution` null is "no oils yet", which
                  // the panel's own ask at the bottom already explains.
                  disabled={percent === null}
                  onClick={() => {
                    if (percent === null) return;
                    onSoapConcentrationChange(String(percent));
                  }}
                  // With no oils there is no figure to promise, and "sets soap concentration
                  // to —" is not a sentence. The row is disabled in that state anyway.
                  aria-label={
                    percent === null
                      ? `${preset}:1 water to paste`
                      : `${preset}:1 — sets soap concentration to ${sets}`
                  }
                >
                  <span className="dilution-preset__ratio">{preset}:1</span>
                  <span className="dilution-preset__sets">{sets}</span>
                  {/* First words only in the cell — "body, hand" — the caption under the
                      strip and the button's aria-label both carry the full product names. */}
                  <span className="dilution-preset__uses">
                    {uses.map((u) => u.label.toLowerCase().split(' ')[0]).join(', ')}
                  </span>
                </button>
              );
            })}
            </div>
            {/* One sentence naming what the endpoints make, since the cells abbreviate. Derived
                from the same bands as the cells, so it cannot drift from them; silent when the
                endpoint ratios land outside every band. */}
            {(() => {
              if (dilution === null || pasteGrams === null) return null;
              const usesFor = (preset: string) =>
                lsDilutionUsesFor(
                  ratioPresetPercent(dilution.anhydrousGrams, pasteGrams, Number(preset)),
                );
              const first = LS_WATER_PASTE_RATIO_PRESETS[0];
              const last = LS_WATER_PASTE_RATIO_PRESETS[LS_WATER_PASTE_RATIO_PRESETS.length - 1];
              const firstUses = usesFor(first);
              const lastUses = usesFor(last);
              if (firstUses.length === 0 || lastUses.length === 0) return null;
              const names = (u: ReturnType<typeof lsDilutionUsesFor>) => {
                // Commas with ONE final "and": a 12.5% endpoint lands in four bands, and
                // joining those with " and " alone read "baby or gentle soap and face soap
                // and foaming dispenser and body wash".
                const labels = u.map((x) => x.label.toLowerCase());
                return labels.length > 1
                  ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
                  : labels[0];
              };
              return (
                <p className="dilution-presets__caption">
                  {first}:1 suits {names(firstUses)}; thinner ratios suit {names(lastUses)}.
                </p>
              );
            })()}
          </div>
    </>
  );

  // THE HERO'S HONESTY GATE: is anything below contesting the plan the hero's figure
  // serves? RENDER-KEYED, disjunct by disjunct, per this file's own four-times-paid rule:
  // the first draft read `dilution.targetExceedsPaste` — the flag — and a VALID measurement
  // suppresses every voice that flag has (the measurement outranks the assumed cook water
  // the flag is derived from), so the hero said "check the note below" over a screen that
  // says nothing, in exactly the shape the flag-vs-render comments here warn about.
  //   exceedsSolutionAlert          — the rejection's own paragraph (a render const);
  //   overDilutionSpokenFor         — targetExceedsPaste's rendered voices (in batch, its
  //                                   alert; the child term is null-scoped away here);
  //   cantTellGate                  — the flag's hedge voice, when an undeclared liquid
  //                                   makes the verdict unknowable (renders in the
  //                                   alternative-liquid clauses);
  //   pasteAlreadyPastTargetSpokenFor — the honest-0 g verdict's rendered voices;
  //   the solubility ceiling FLAG   — safe bare: whenever it is true, either its own
  //                                   sentence renders or one of the suppressors it stands
  //                                   down for does, and every suppressor is already a
  //                                   disjunct above.
  // A contested hero keeps its figure — it is still the plan's own number — but drops the
  // accent and points at the note, so the loudest thing on the panel is never an
  // uncontradicted claim.
  const heroContested =
    exceedsSolutionAlert ||
    overDilutionSpokenFor ||
    cantTellGate ||
    pasteAlreadyPastTargetSpokenFor ||
    lsConcentrationAboveAllMinimums(resolvedConcentrationPercent);

  return (
    <section className="panel panel--nested">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">
            <span className="panel__num" aria-hidden="true">09</span>Dilution
            {/* aria-hidden like the number: the target input below IS the accessible source
                of this figure, and the heading's name stays "Dilution" for every locator
                and screen-reader rotor that navigates by it. Shown only when the typed plan
                parses — echoing "at NaN%" would be worse than silence. */}
            {Number.isFinite(Number(soapConcentrationPercent)) &&
              Number(soapConcentrationPercent) > 0 && (
                <span className="panel__title-caption" aria-hidden="true">
                  at {soapConcentrationPercent}%
                </span>
              )}
          </h2>
          {/* Names the two things the panel holds. It used to name three MODES, which is
              exactly what this surface stopped having: a plan (a target, reached by typing it
              or by taking one of the reference's ratios as a starting point) and a record
              (the water actually poured). Neither excludes the other, so the subtitle is an
              "and" rather than an "or". */}
          <p className="panel__subtitle">
            Your plan for the dilution, and the record of what you actually poured
          </p>
        </div>
      </div>
      {/* THE HERO (redesign): the figure the whole panel exists to produce, stated before
          the knobs that shape it. Rendered only while the PLAN governs the whole batch —
          under a record the record's own "Finished so far" grid leads below instead, and
          two lead figures on one panel is the "which of these do I pour" problem spec §2
          legislates against. The caption states the claim's basis: which scope, and that
          nothing is poured yet (planGoverns in batch scope IS "no record"). */}
      {dilutionScope === 'batch' && dilution !== null && planGoverns && (
        <div className={`dilution-hero${heroContested ? ' dilution-hero--contested' : ''}`}>
          <dl className="dilution-hero__item">
            <dt className="micro-label">Dilution water to add</dt>
            <dd className="dilution-hero__figure">
              {formatWeight(batchDilutionWaterGrams, weightUnit)}
            </dd>
          </dl>
          <p className="dilution-hero__caption">
            {heroContested
              ? 'Whole batch · check the note below before pouring'
              : 'Whole batch · nothing poured yet'}
          </p>
        </div>
      )}
      {/* ── THE PLAN ROW (spec §2) ─────────────────────────────────────────────────────────
          The target % the maker is aiming at. Visible in both scopes and in every state,
          because it is the recipe's own field: the mode radio that used to hide it behind
          "Target concentration" is gone, and with it the states where copy pointed at a
          control the screen did not have. The reference's four starting ratios — one-shot
          setters for this field — moved below the scope switch with the redesign; see
          `startingPoints` above the return. */}
      <label className="dilution-row">
        <span className="dilution-row__label">Target soap concentration</span>
        <span className="dilution-row__value">
          <input
            type="number"
            className="input figure-field"
            min={1}
            max={99}
            step={1}
            value={soapConcentrationPercent}
            onChange={(e) => onSoapConcentrationChange(e.target.value)}
            aria-label="Target soap concentration percent"
          />
          <span className="dilution-row__unit" aria-hidden="true">%</span>
        </span>
      </label>
      {/* ── THE RECORD ROW (spec §2) ───────────────────────────────────────────────────────
          The water actually poured into the whole batch (LS:1531: add water in increments and
          record how much). Beside the plan rather than instead of it: the mode radio made
          these two mutually exclusive, which is what put one batch's figures on two screens
          the maker had to switch between to compare.

          WHOLE BATCH ONLY, because `settings.gradualWaterGrams` is the whole batch's record.
          Custom amount's own record is the jar's two fields below, and each record leads in
          its own scope — the batch record participates nowhere in portion scope (spec §2).

          No "type something here" prompt beside it any more. That prompt existed to explain a
          MODE that showed nothing until a number arrived; a labelled, empty field on a screen
          full of plan figures explains itself, and an always-on paragraph would have spent a
          third of the panel's prose budget in every single state. The claim it carried worth
          keeping — that 0 g is a record and is where the record starts — is reference prose
          true in every state, so it moved into the collapsed Dilution notes at the bottom,
          which is exactly what that <details> is for. */}
      {dilutionScope === 'batch' && (
        <>
          <label className="dilution-row">
            <span className="dilution-row__label">Water added so far</span>
            <span className="dilution-row__value">
              <input
                type="number"
                className="input figure-field"
                min={0}
                value={gradualWaterGrams}
                onChange={(e) => onGradualWaterChange?.(e.target.value)}
                aria-label="Water added so far (g)"
              />
              <span className="dilution-row__unit" aria-hidden="true">g</span>
            </span>
          </label>
          {/* Refused, there is no record at all: nothing governs, the sheet prints no record
              rows, and the batch goes on describing the plan — so the field that took the
              number owes the account of why. */}
          {gradualWaterSubTenthPrecision && (
            <SwallowedSeparatorAlert typed={gradualWaterGrams} />
          )}
        </>
      )}
      <label className="dilution-row">
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

            The redesign's row layout shortens the VISIBLE label to "Measured paste
            (optional)" — the Scope row directly below says "Whole batch" on screen — while
            the aria-label keeps the full documented name, "the whole batch" disambiguation
            included, so a screen-reader user still hears which paste is wanted and every
            getByLabelText selector keeps resolving. Label-in-Name holds: the visible
            "Measured paste" is contained in the accessible name. Edit them together. */}
        <span className="dilution-row__label">
          Measured paste <span className="dilution-row__hint">(optional)</span>
        </span>
        {/* An editable figure, so it takes the figure treatment the ingredient rows use —
            leaving it boxed put two answers to the same question in one column. */}
        <span className="dilution-row__value">
          <input
            type="number"
            className="input figure-field figure-field--wide"
            min={1}
            step={10}
            aria-label="Measured paste weight — the whole batch (g, optional)"
            value={measuredPasteGrams ?? ''}
            onChange={(e) => onMeasuredPasteGramsChange?.(e.target.value)}
          />
          <span className="dilution-row__unit" aria-hidden="true">g</span>
        </span>
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

          There is no branch here for a remaining-paste ceiling: this panel always treats a
          reading as the whole batch, and the remaining-mode declaration and its arithmetic are
          gone (Phase 3, spec §5) with the control that used to make that declaration. */}
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
          {/* PLAN-GOVERNS ONLY (spec §4). Every clause of this paragraph is about a TARGET the
              paste cannot reach, and only a plan is aiming at one. The gate itself is
              `exceedsSolutionAlert`, named where the rejection is computed: the solubility
              ceiling below stands down for this paragraph, so it has to read the same answer
              this site does rather than re-derive the exclusion and drift from it.

              NOT UNDER A RECORD, where this paragraph has no subject. The record arm has no
              target: the concentration on screen is DERIVED from the pot and the water poured.
              Two consequences, both of them wrong. The remedy names the plan field, which is a
              control the maker is no longer steering by. And the verdict itself can be a
              rounding artifact for any recipe whose plan came from a record — with a weighed
              pot and no water yet, a plan of anhydrous ÷ that pot at 2 dp puts solutionGrams
              within a gram of the reading and half the time a hair under it, printing "your
              paste already weighs more than the 1,404.99 g this target dilutes to" directly
              above the panel's own "Finished so far (weighed) 1,405 g". The pot's own rules
              (nonPositive, subTenthPrecision, belowSolids) all still render here under a
              record, and they are exactly the rules that decide the record's basis — so the
              alerts and the figures answer to the same three questions. */}
          {exceedsSolutionAlert && (
            <p className="results-hint" role="alert">
              Your paste already weighs more than the{' '}
              {formatWeight(dilution.solutionGrams, 'g')} this target dilutes to, so
              it cannot be diluted to{' '}
              {formatConcentrationPercent(dilution.soapConcentrationPercent)}% at all —{' '}
              {/* The target field is on screen in every state this paragraph can render in
                  — it is the plan row at the top of the panel, no longer hidden behind a
                  mode — so the remedy names it unconditionally. */}
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
                  even though the field that takes the reading is one field for the whole
                  panel: the crockpot shortcut is named in the notes at the bottom, and a
                  maker who followed it there can arrive at this paragraph. */}
              , or check the measurement — if you weighed the crockpot, subtract the empty
              pot&apos;s own weight.
            </p>
          )}
        </>
      )}
      {/* Paste stores better than diluted soap — it keeps sealed, refrigerates and freezes —
          so the common workflow is to cook one batch and draw it down over time. Whole batch
          answers "dilute it all"; custom amount answers "make just this much now". */}
      {/* A segmented pair (SegRadioGroup) — semantics unchanged: this REALLY IS a
          selection (one scope is always in force), which is exactly what separates it from
          the preset buttons. Hit-target and locator rules live on the component. */}
      <div className="dilution-row dilution-row--scope">
        <span className="dilution-row__label" aria-hidden="true">Scope</span>
        {/* "Scope — …" so the visible antecedent is contained in the group's accessible
            name (Label-in-Name), with the question it labels kept for context. */}
        <SegRadioGroup
          label="Scope — how much of the batch to dilute"
          name="dilutionScope"
          options={[
            { value: 'batch', cell: 'Whole batch' },
            { value: 'portion', cell: 'Custom amount' },
          ]}
          value={dilutionScope}
          onChange={(scope) => onDilutionScopeChange?.(scope)}
        />
      </div>
      {/* The boundary sentence (redesign): everything above this line is THIS batch's own
          figures and record; everything the strip below offers is reference. Whole batch
          ONLY, with the strip: in Custom amount there are no batch figures above it, and
          the elements below it are the jar's own INPUTS — the sentence labelled live
          controls as reference and called the jar screen "this batch". */}
      {dilutionScope === 'batch' && (
        <>
          <p className="dilution-figures-note">
            The figures above describe this batch. The starting points below are reference,
            not part of the recipe.
          </p>
          {startingPoints}
        </>
      )}
      {/* CUSTOM AMOUNT'S TWO WAYS TO DESCRIBE ONE JAR, and they stay mutually exclusive:
          size a jar from a target volume, or record the jar you actually weighed out and
          poured. Recording it wins — a record leads in its own scope (spec §2) — so the
          "Amount to make (ml)" field steps aside once both jar figures are present, exactly
          as it did when the mode radio decided this. Showing both at once would offer two
          unrelated ways to describe the same jar, and the record's own workflow (LS:1531) has
          no "amount to make" step at all.

          THIS GATE IS UNCHANGED BY THE PLAN GRID'S OWN UNHIDING, BELOW — this is the
          "Amount to make (ml)" INPUT, which is the OTHER way to describe a jar, and spec §2
          keeps those two mutually exclusive regardless of what the results grid shows: a
          jar record and a target volume are two different ways to size the SAME field's
          worth of intent, and letting both stay editable at once is the state this whole
          block prevents. The plan grid's own visibility, immediately below, answers a
          different question — spec §2's "the plan grid stays rendered beside a filled jar
          record, labelled as plan" — and unhiding it here does not reopen this one. */}
      {dilutionScope === 'portion' && !portionJarGoverns && (
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
      {/* THE JAR'S OWN RECORD — session-local in App (portionPasteGrams/portionWaterGrams),
          NOT settings.gradualWaterGrams, which is the WHOLE BATCH's record. A jar weighed out
          here is a bench figure, like portionTargetMl and measuredPasteGrams beside it, and
          must never dirty the saved recipe — see resolveDilution's portion-arm doc for the
          prohibition this enforces, which the removal of every write-back has now made
          structural for the batch record too. */}
      {dilutionScope === 'portion' && (
        <>
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
              beside theirs. The verdict is resolveDilution's own (portion arm), so this alert,
              the jar's figures and App's preservative dose can never disagree about whether
              the reading is usable. */}
          {portionJarValidity?.pasteSubTenthPrecision && (
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
          {portionJarValidity?.waterSubTenthPrecision && (
            <SwallowedSeparatorAlert typed={portionWaterGrams} />
          )}
        </>
      )}
      {/* THE RECORD'S OWN FIGURE, whole-batch scope only. paste + water, from the RAW INPUTS
          and the resolution's own pot — never dilution.solutionGrams, which is still the
          PLAN's prediction (4,000 g in the fixture this guards) while the record says what is
          actually in the pot (3,600 g in the same fixture). Printing the prediction here would
          quietly resurrect it under a new label; the plan's own figure keeps its own row
          below, under its own name. */}
      {dilutionScope === 'batch' && batchRecord !== null && (
        <dl className="results-grid">
          <div className="results-grid__item results-grid__item--primary">
            {/* Names which pot this sum counts from — the same discipline basisScope's
                "(whole batch)" / "(custom amount)" labels already practice for a figure's
                basis, one parenthetical rather than a paragraph. wholeBatchPasteGrams is a
                computed PREDICTION and is never corrected by a measured reading (see
                pasteGrams' own comment above), so this is the one place the record has to say
                which of the two it actually poured into.

                "weighed", not "measured": the field above is already titled "Measured paste
                weight", so a second "measured" here would be a second, unrelated match for
                the same word on one screen — confusing for a reader, and literally ambiguous
                for a query that finds text by content (DilutionPanel.test's own
                `getByText(/measured/i)` pins this: it is answered by that field's label, and
                must stay the ONLY thing on screen that reads that way).

                Named off the SAME gate that chose the basis (measuredPasteDescribesPot),
                never off measuredPasteValid: this label's whole job is to say which of the
                two pots the sum counts from, so a label answering a different question than
                the selection would be a lie about the figure beside it. */}
            <dt>Finished so far ({measuredPasteDescribesPot ? 'weighed' : 'computed'})</dt>
            <dd>{formatWeight(batchRecord.finishedGrams, weightUnit)}</dd>
          </div>
        </dl>
      )}
      {/* THE RECORD'S READOUT — the derived concentration, at the 2 dp gradualDilutionFrom
          rounds to, however extreme, so this never lies about what the record implies.
          Unclamped and display-only (decision 2): the [1, 99] clamp that used to bound it
          existed only to keep a write legal, and there is no write.

          Whole-batch scope only — the jar's own mirror of this readout is below, gated the
          other way. Ungating it would show the whole-batch record (settings.gradualWaterGrams,
          recipe state) as if it described the jar currently on screen. */}
      {dilutionScope === 'batch' && batchRecord !== null && (
        <p className="results-hint">
          <strong>
            The batch so far is at{' '}
            {formatConcentrationPercent(batchRecord.concentrationPercent, 2)}% soap.
          </strong>
        </p>
      )}
      {/* THE PLAUSIBILITY NOTE — see pasteReadingImplausible's own comment above for the
          threshold, the basis it is compared against and why the suppression needs no extra
          flag here. Beside the record readout it questions, not beside the field itself: this
          is a claim about the reading in light of the recipe, which is only knowable once the
          record readout above has resolved which pot is in force. */}
      {dilutionScope === 'batch' && batchRecord !== null && pasteReadingImplausible && (
        <p className="results-hint">
          That reading is more than twice the paste this recipe makes — check the scale was
          tared.
        </p>
      )}
      {/* THE JAR'S own figures in Custom amount scope — the mirror of the two
          blocks above, but reading `portionGradual` instead of `batchRecord`, and deliberately
          never fed to onSoapConcentrationChange anywhere in this file: see
          resolveDilution's portion-arm doc for why a jar's figure must never redefine the
          recipe's plan.

          Named "(this jar)" rather than "(custom amount)": the scope toggle's own
          "Custom amount" label, a few lines above and always on screen, already owns
          that exact string, and repeating it here would leave two on-screen elements
          answering "which one names Custom amount" with no way to tell them apart — the
          same collision basisScope's own "(whole batch)"/"(custom amount)" wording is
          careful never to create twice on one screen. */}
      {dilutionScope === 'portion' && portionGradual !== null && (
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
            {/* THE PLAN, NAMED AS THE PLAN (spec §2, verbatim: "the old jar echo of the
                'saved target' is replaced by copy that names the plan % as the plan — the
                reassurance framing dies with the write-back"). The retired wording ("Your
                recipe's saved target is unchanged at N%") was written for a world where this
                figure could still be overwritten BY a governing record, so what a maker
                needed telling was that diluting this one jar had not done that. Nothing
                writes it now — Whole batch's own record stopped doing it in task 2a, and a
                portion jar never did — so there is nothing left to reassure anyone about.
                What is left to say is what this number IS: the plan, read off the field at
                the top of the panel and echoed here beside the jar's own reading, each
                carrying its name (the same principle that keeps three masses legible on the
                Whole-batch grid, spec §2's "each carries its name"). Still read-only, and for
                the reason it always was: this figure is never derived FROM the jar, and an
                editable-looking field beside a jar reading invited exactly that reading. */}
            The plan is{' '}
            <input
              type="number"
              className="input input--number"
              value={soapConcentrationPercent}
              readOnly
              aria-label="The plan's target concentration, beside this jar (%)"
            />
            %.
          </p>
          {/* The alternative-liquid caveats in their portion wordings — including the
              load-bearing "Top up with plain distilled water only", the only sentence in
              the app telling a maker not to keep topping up with milk or juice. Recording a
              dilution is not a reason for that instruction to lapse. The child renders
              beside a governing jar now (spec §2) but suppresses its own copy of these
              caveats through `jarGoverns` — so this jar-block note is still the one home
              of the sentence in that state, not a duplicate. */}
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
          (portionJarValidity.batchPasteGrams), not a figure re-derived here, for the same
          reason the rejection alerts quote measurementRejection's own thresholds.

          Grams, like those alerts and for the same reason: it is a bound on the number just
          typed into a grams-only field. */}
      {portionJarValidity?.pasteExceedsBatch &&
        portionJarValidity.batchPasteGrams !== null && (
          <p className="results-hint" role="alert">
            That is more paste than the batch holds — all of it weighs{' '}
            {formatWeight(portionJarValidity.batchPasteGrams, 'g')}. Enter what you weighed
            out of it, or clear the field.
          </p>
        )}
      {/* The jar's own ask, for a HALF-FILLED record: one field typed, the other not, so the
          jar cannot be resolved and nothing on screen would otherwise say why. Zero is named
          as legitimate on purpose — the pot before any water is the record's own starting
          entry (LS:1531), and an empty field is not that.

          NOT for an untouched pair, which is every default Custom amount screen: those two
          fields are labelled, visible and empty, the plan sizing grid is answering beside
          them, and an unprompted paragraph asking for them would spend half the panel's prose
          budget in the commonest state there is. The batch record's own version of this ask
          is retired entirely for the same reason — see the record row above.

          NOT while a field is refused either: a maker who typed 2,000 and had it read as
          2.000 has entered something, and asking them to enter it is the one answer that does
          not name the mistake. The refusal beside the field owns that state. */}
      {dilution &&
        portionJarValidity !== null &&
        !portionJarValidity.hasBothFigures &&
        (portionPasteGrams.trim() !== '' || portionWaterGrams.trim() !== '') &&
        !portionJarValidity.pasteSubTenthPrecision &&
        !portionJarValidity.waterSubTenthPrecision && (
          <p className="results-hint">
            Enter the paste you weighed out and the water you have added to it so far — 0 g
            of water counts, and is where the record starts.
          </p>
        )}
      {/* Custom amount's turn for the strip: after the jar's inputs and record readout,
          before the sizing figures — reference sits between the maker's own numbers and
          the derived ones, never between a control and the fields it just revealed. */}
      {dilutionScope === 'portion' && startingPoints}
      {dilution ? (
        <>
          {dilutionScope === 'batch' ? (
            <>
              <dl className="results-grid">
                {/* THE PLAN'S POUR, and it stays on screen under a record — LABELLED (spec
                    §2: "the plan's 'Dilution water to add' / 'Finished solution' rows stay
                    rendered labelled as plan … three masses may be on screen only because
                    each carries its name").

                    The mode this replaces suppressed the row instead, and the suppression was
                    the wrong half of the fix: the mode hid this row because it was a stale
                    target's figure sitting unnamed beside a record's own mass (a 30% target's
                    2,500 g beside "Finished so far 3,500 g", for the same pour), and the fix
                    for an unnamed figure is a name. Hiding it also took away the one thing a
                    mid-pour maker actually wants — how much more the plan says to add — at
                    exactly the moment they are pouring.

                    Primary emphasis only while the plan governs: with a record in the pot the
                    figure the maker is acting on is the record's, and two primary figures in
                    one grid is the "which of these do I pour" problem in a new costume. */}
                {/* While the plan governs, this figure IS the hero at the top of the
                    panel — repeating it here would put the same mass on screen twice under
                    one name. Under a record it returns to the grid, labelled as plan and
                    demoted, exactly as before the hero existed. */}
                {!planGoverns && (
                  <div className="results-grid__item">
                    <dt>Dilution water to add (plan)</dt>
                    <dd>{formatWeight(batchDilutionWaterGrams, weightUnit)}</dd>
                  </div>
                )}
                <div className="results-grid__item">
                  <dt>Paste (anhydrous)</dt>
                  <dd>{formatWeight(dilution.anhydrousGrams, weightUnit)}</dd>
                </div>
                {/* THE PLAN'S FINISHED MASS, kept and labelled for the same reason as the
                    pour row above, and it is the sharper case of the two: the record's grid
                    already prints "Finished so far", so under a record there really are two
                    masses for one batch on one screen. That is exactly the state §2 legislates
                    for — they are answers to different questions (what the batch weighs now,
                    what it will weigh at the plan) and the word "(plan)" is what makes them
                    readable side by side. Suppressing this row was how the mode hid the
                    question instead of answering it. */}
                <div className="results-grid__item">
                  <dt>{planGoverns ? 'Finished solution' : 'Finished solution (plan)'}</dt>
                  <dd>{formatWeight(dilution.solutionGrams, weightUnit)}</dd>
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
                {/* DECIDED HERE (carried item, resolving task-2a report item 4): Total water
                    and Glycerin (retained), below, stay UNLABELLED under a record — no
                    "(plan)" suffix — unlike the pour row above and the finished-solution row
                    below. Both are recipe-level facts a record does not dispute: Total water
                    is the paste's own water content (a property of the COOK, fixed the moment
                    dilution starts) and Glycerin is retained from saponification, not added by
                    dilution — neither arm has a competing claim about either figure the way
                    the record's "Finished so far" competes with the plan's "Finished
                    solution", or the record's own poured water competes with "Dilution water
                    to add". Task 2a's own report flagged this as open; it stays resolved this
                    way in Task 3 rather than revisited, because portion scope's own plan grid
                    (PortionDilutionResults) has no equivalent rows to label either — a jar's
                    own resolved figures are its finished mass and its %, never a paste-anhydrous
                    or water-content row, so there is nothing on that screen for these two to
                    disagree with. */}
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
              {/* PLAN-GOVERNS ONLY. The sentence explains the PLAN's pour row — "Dilution
                  water above" — and under a record that row is one of two water figures on
                  screen and no longer the one the maker is acting on. The record's own basis
                  label on "Finished so far" ("weighed" / "computed") is where the record says
                  which paste it counted from instead, so neither state loses the claim and
                  neither carries it twice. It also keeps the busiest record state inside the
                  prose budget: the record's readout plus an alternative-liquid caveat is
                  already two paragraphs.

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
              {/* THE PLAN-LABELLED CAPTION FOR AN UNREACHABLE PLAN (spec §4, verbatim: "when
                  the plan is unreachable … a non-alert, plan-labelled caption accompanies the
                  plan figures — gating the plan-claims must not resurrect a bare, unexplained
                  '0 g'").

                  Every paragraph that used to account for that zero — the two over-dilute
                  verdicts and the undeclared-liquid hedge — is a claim about a TARGET and is
                  plan-governs only now. Without this, a record would have left the plan's
                  water row printing a bare "0 g" with nothing on screen saying why, which is
                  the precise state correctedDilutionWaterGrams' own doc warns every new
                  consumer of that figure about.

                  KEYED ON THE ROW'S OWN PRINTED FIGURE, not on the two predicates behind it.
                  The caption exists to explain a zero that is actually on screen, so the thing
                  it must agree with is the render — the same discipline every suppression in
                  this file keys on, for the fifth time. (0.5 g is the gram formatter's own
                  rounding: anything under it prints as "0 g".)

                  A CAPTION, not a hint: it is a note on the row directly above it, not state
                  feedback about the batch, so it is deliberately not .results-hint — the class
                  the prose budget counts. The record's own readout and an alternative-liquid
                  caveat already spend that budget in this exact state. */}
              {batchRecord !== null && batchDilutionWaterGrams <= 0.5 && (
                <p className="dilution-plan-caption">
                  Plan: at {formatConcentrationPercent(dilution.soapConcentrationPercent)}% this
                  batch&apos;s soap makes {formatWeight(dilution.solutionGrams, weightUnit)}, which
                  the paste already reaches — so the plan&apos;s water row above reads 0 g.
                </p>
              )}
              {measuredPasteValid && planGoverns && (
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
               can never print opposite verdicts on one screen.

               There is no `dilutionMode` or `ratioNotAppliedYet` to forward any more (Phase
               3, spec §5, deleted them along with the child's ratio arm): one plan field is
               on screen in every state, so the child's refusals can only ever name that one
               control, and it names it unconditionally.

               RENDERS BESIDE A GOVERNING JAR NOW (Phase 2b, spec §2: "the plan grid stays
               rendered beside a filled jar record, labelled as plan; the jar governs only
               dose/finished figures"). It used to stand down here instead, on the reasoning
               that `targetMl` is App session state that survives everything, so a maker who
               sized a jar and then recorded the one they actually weighed kept this entire
               grid on screen — "Paste to weigh out", "Water to add", "Makes" — every figure
               sized from the PLAN, sitting UNLABELLED beside the jar's own recorded figures
               and looking like it disagreed with them. The spec's answer to that is the
               label, not suppression: the batch scope already proves three masses can share
               one screen once each carries its name (§2's own words), and hiding this grid
               took away the one thing a maker sizing a NEW portion of the same batch still
               wants — what the plan says to weigh out — at exactly the moment a jar happens
               to be recorded too. `jarGoverns` is what buys the label without reopening the
               old defect: it is the SAME `portionJarGoverns` the shell computes for its own
               gates, so the grid and the jar can never disagree about whose figures are
               whose. */
            <PortionDilutionResults
              dilution={dilution}
              weightUnit={weightUnit}
              targetMl={targetMl}
              measuredPasteGrams={measuredPasteGrams ?? ''}
              wholeBatchPasteGrams={wholeBatchPasteGrams}
              cookWaterGrams={cookWaterGrams}
              unknownLiquidGrams={unknownLiquidGrams}
              overDilutionCertain={overDilutionCertain}
              altLiquidNote={portionAltLiquidNote}
              jarGoverns={portionJarGoverns}
            />
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

                  A REJECTED measurement is excluded only while its refusal actually
                  renders in this alert's place (decided 2026-08-17 — see the render
                  const's own comment; the exclusion read the raw `rejected` flag before
                  that, and in ratio and gradual an exceeds-solution reading silenced this
                  paragraph while its own refusal was mode-excluded, leaving the screen
                  saying nothing). Where a refusal IS on screen the exclusion holds for
                  the original reason: a mis-tared reading used to stack two role="alert"
                  paragraphs here and one in Custom amount, and the second asserted a
                  verdict derived from the very assumed cook water the rejected reading
                  was contesting. One paragraph per reading, in both scopes.

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
                  predicate, this block's own scope, and standing down while the
                  exceeds-solution rejection renders — see the const for the decided
                  yield), named where the predicate lives so the solubility ceiling below
                  reads the same answer this site renders on; the computedPasteGrams
                  recheck only narrows the type for the quoted figure — the predicate
                  already required it. The two figures are quoted because the claim is a
                  comparison, and the row it explains prints a bare "0 g".

                  The closing "weigh the paste" clause is dropped once a reading has been
                  REJECTED, which is the one kind of state where this alert stacks on
                  another: the maker has just weighed the paste, and telling them to do the
                  thing they did — under a figure of the recipe's own that sits above their
                  reading in the field — is the sort of instruction that reads as the app
                  not having noticed. Only the clause goes. The verdict still holds and
                  still needs saying, because the row underneath fell back to the recipe's
                  own clamped figure when the reading was refused. The pairing is right for
                  the reading-only refusals — belowSolids, nonPositive, subTenthPrecision —
                  where the first alert is about the reading and this one is the only
                  account of the 0 g; and those are now the ONLY refusals it pairs with.
                  The exceeds-solution rejection never reaches this paragraph any more (the
                  render const above yields to it, decided 2026-08-16, second round): that
                  rejection quotes the maker's own reading against the same solution this
                  verdict counts from, so it is the account of the 0 g, and printing this
                  one beside it was two verdicts about one target. */}
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

              THE THREE SUPPRESSING VERDICTS ARE ALL PLAN-GOVERNS ONLY NOW, and each clause
              below still reads that verdict's own RENDER rather than its flag — which is the
              only reason this sentence does not go silent under a record. Tasks 1 and 9 of
              2026-08-12-whole-app-review-fixes each found the flag-keyed version of exactly
              this: a mode-suppressed exceeds-solution rejection whose FLAG went on silencing
              this alert, leaving a maker whose target sits above the solubility ceiling told
              nothing at all. The mode exclusions became plan-governs gates in this task, and
              the render-keyed clauses carried over unchanged, so the same protection holds
              against the new gate for free. Written flag-first, the record cells would have
              lost the ceiling the same way the ratio and gradual cells did.

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
              shrunk three times since: a rejection alert stopped counting with the
              2026-08-16 decision — a refusal about the reading does not speak for the
              target — the can't-tell hedge stopped counting with that decision's second
              round, which ruled an uncertainty about the batch no verdict about the
              target either, and the child's voice narrowed from its flag to its worded
              verdict on 2026-08-17, when the same rule reached the child's own hedge.
              See the derivation's own comment for all three.)

              Task 14 (2026-08-12-whole-app-review-fixes) closed the corrected-pot clause
              the same way — the last clause still reading a bare predicate. That predicate
              is scope-blind while its alert renders in Whole batch only, and the child's
              wording of the same verdict requires an unrejected reading, so Custom amount
              with a rejected reading whose refusal was excluded (a 3,000 g reading against a
              2,400 g solution from a 2,500 g corrected pot) rendered NOTHING at all: no
              figures, no refusal, no ceiling. The clause now reads
              pasteAlreadyPastTargetSpokenFor — the alert, or the child's wording of the
              verdict. A refusal that actually renders was a third voice there for one round
              and is gone (decided 2026-08-16, second round): a refusal about the reading does
              not speak for the corrected pot either, so the Custom-amount cells where only a
              refusal renders now show refusal + ceiling — the same pair as the
              targetExceedsPaste side, by the same rule.

              THE FIGURE IT IS ASKED OF IS THE RESOLVED % (spec §4), never the raw setting.
              A batch is above the ceiling because of what is in the pot, and with a record in
              hand what is in the pot is the record's own concentration: a 30% plan with 900 g
              poured onto a 1,600 g pot is a 48% batch, and reading the setting here would
              have printed nothing at all for it while the uses summary beside it said "No
              common use calls for 48%".

              AND THE RECORD ARM SAYS IT DIFFERENTLY, because it may not say "this target" —
              the record arm has no target (spec §4's conversion table, verbatim). It
              describes the batch and names the remedy the batch actually has, which is the
              one thing a mid-pour maker is already holding: more water. The plan arm's
              wording is unchanged, down to the word.

              PORTION SCOPE'S OWN RECORD IS THE JAR, not the batch (spec §2: each record leads
              in its own scope; §4's wording adapted the same way, "the batch so far" →
              "the jar so far"). `governingRecord` (not `batchRecord`) is what this clause reads
              for both the gate above and the wording below, because it is scope-general by
              construction — `resolved` already answers for whichever scope was passed to
              resolveDilution (see that const's own comment) — so a jar recorded onto a
              30%-plan Custom-amount screen speaks of ITS OWN concentration here exactly as a
              900 g pour does on the Whole-batch screen, rather than falling back to the plan's
              30% the way `batchRecord` alone would (that fallback is correct for `batchRecord`
              — it is deliberately null outside Whole batch — it would just be the wrong
              variable to read a portion-scope wording from). */}
          {lsConcentrationAboveAllMinimums(resolvedConcentrationPercent) &&
            !overDilutionSpokenFor &&
            !pasteAlreadyPastTargetSpokenFor &&
            !exceedsSolutionAlert && (
              <p className="results-hint" role="alert">
                {governingRecord
                  ? // The batch half of this sentence keeps its long-pinned ONE-decimal
                    // precision (the "46.2%" / "48%" fixtures elsewhere in this describe block
                    // are pinned at 1 dp); the jar half is NEW with this task and matches the
                    // 2 dp every other jar readout on screen already uses ("That jar lands at
                    // N.NN% soap.", a few lines above) — one precision per half, each
                    // consistent with its own screen's other figures, rather than a precision
                    // this sentence invents on its own.
                    `${dilutionScope === 'batch' ? 'The batch' : 'The jar'} so far is at ${formatConcentrationPercent(
                      governingRecord.concentrationPercent,
                      dilutionScope === 'batch' ? 1 : 2,
                    )}% — above what any recipe fully dissolves; keep adding water.`
                  : 'This target is above what even a coconut-heavy recipe can fully dissolve.'}
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
          {/* THE RESOLVED % IN BOTH HALVES OF THIS SUMMARY (spec §4's interpolation rule).
              The matcher above (suitedUses) reads the resolved figure, so these two captions
              must read it too — implemented literally with `dilution.soapConcentrationPercent`
              here, the summary printed "No common use calls for 30%" against a 46.2% match:
              a sentence naming one number and reporting another's verdict. */}
          {/* OPEN BY DEFAULT, unlike the reference notes below it. The prose budget files
              always-true prose behind a disclosure because it does not answer anything about
              the state on screen; these bands do — they are what the target above is being
              chosen AGAINST, and the ratios beside them are the scale the preset buttons
              speak in. Behind a summary the correlation between the two was reachable only by
              a maker who already suspected it was there.

              State, not a bare `open` attribute — but NOT because a re-render would reset it
              (React leaves an unchanged `open` prop alone, so a plain attribute survives
              every keystroke here). Because this whole block sits inside the `dilution ?`
              branch: emptying the target field nulls `dilution` and UNMOUNTS the list, and a
              bare attribute would bring it back open over a collapse the maker chose. The
              state lives outside the branch, so it outlives the unmount. */}
          <section className="dilution-suggestions" aria-label="Suggested dilution targets">
            <p className="dilution-suggestions__legend">
              Suggested targets — guidance, not part of the recipe
            </p>
            <details
              className="results-hint dilution-uses"
              open={usesOpen}
              onToggle={(e) => setUsesOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="disclosure__summary">
                {suitedUses.length > 0
                  ? `At ${formatConcentrationPercent(resolvedConcentrationPercent)}% this suits ${suitedUses
                      .map((u) => u.label.toLowerCase())
                      .join(', ')}`
                  : // No "— see the usual targets" any more: that pointed at a table this
                    // summary used to hide, and the table is now printed directly below it.
                    `No common use calls for ${formatConcentrationPercent(resolvedConcentrationPercent)}%`}
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
                      {(() => {
                        // The ratio the "Starting points" buttons above speak in, for the pot
                        // in force — so a maker can see that 1:1 is the dish-soap end and that
                        // the 10–15% uses are past every button on offer.
                        //
                        // Set in the row's own type, not dimmed: this is a pour figure, the
                        // same band the percentage beside it states, and the maker acts on it.
                        // It was briefly opacity: 0.75, which composited #666 on #f0f0f0 down
                        // to 3.07:1 — under AA at this size, and the only opacity in the
                        // stylesheet not on a disabled control. The "·" carries the separation.
                        const ratios =
                          pasteGrams === null
                            ? null
                            : ratioRangeLabelFor(dilution.anhydrousGrams, pasteGrams, t);
                        return ratios ? ` · ${ratios}` : null;
                      })()}
                      {t.note ? <span className="results-excluded"> {t.note}</span> : null}
                    </dd>
                  </div>
                ))}
              </dl>
              {/* Always true, and now always visible — which is what the prose budget files
                  behind a disclosure. It keeps its place because the region around it is
                  marked as guidance rather than as this batch's figures: the budget exists so
                  advice cannot be mistaken for feedback about the state, and the legend above
                  does that job here where the disclosure used to. */}
              <p>
                Diluting further and thickening with salt is the cheaper way to a thick soap —
                water costs a fraction of what the oils did. Liquid soap itself, thickened or
                not, is not recommended for hair.
              </p>
            </details>
          </section>
        </>
      ) : (
        /* ONE WORDING, because there is one control: "a target concentration (1–99%)" is the
           plan field's own caption and that field is on screen in every state now. The
           branch that used to sit here existed only because ratio and gradual mode replaced
           that field with their own, so the sentence could send a maker looking for
           something the mode had removed.

           IT ALSO COVERS "governs record, record null" — the resolution's pinned contract
           (resolveDilution's own doc): a recipe carrying a leftover water record beside a
           target calculateDilution refuses has a record governing and nothing to compute
           from it, which is "nothing to show yet", not an error. What that maker needs is
           this exact sentence, and they get it. */
        <p className="results-hint">
          Enter oils and a target concentration (1–99%) to compute dilution.
        </p>
      )}
      {/* THE COLLAPSED NOTES — where the prose budget sends reference prose. The rule
          (pinned by the prose-budget describe in DilutionPanel.test): in any single
          state the panel may carry at most one alert plus TWO inline hint paragraphs;
          guidance that is true in every state is reference, not feedback, and lives
          here instead, where it does not count against the state and is still one
          click away. Everything in this block keeps its exact wording and its own
          gate from the inline site it left — moving prose must not move claims.

          OUTSIDE the dilution ? branch on purpose. The ratio presets render before a
          recipe exists (disabled, but on screen and captioned), and the guidance accounting
          for them has to be reachable in that state too — inside the branch, "Some makers
          start at 1:1…" vanished exactly where the presets stood unexplained, the
          copy-points-at-nothing class the presets' own comment warns about. Every paragraph
          in here carries its own gate, and none needs a dilution: the density caveat's
          finishedVolumeMl is null-safe and simply gates it off while there is nothing to
          convert. */}
      <details className="results-hint dilution-notes">
        <summary className="disclosure__summary">Dilution notes</summary>
        {/* This paragraph owns the RATIOS and nothing else. Three sentences, three claims.
            It renders unconditionally now, because the presets it accounts for do: the mode
            gate it carried was the ratio MODE's, and the presets are part of the plan row in
            every state. It moved here from directly under those presets because it is true
            whatever state the plan is in, which is what made it budget-exempt reference. The
            claims are AUDITED and the wording is pinned — movable, not rewordable.
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
               No figure is quoted in the copy on purpose: the preset's own caption at the
               top of the panel prints what 2.5:1 lands at for THIS recipe, which is
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
        <p>
          Some makers start at 1:1, others at 2:1 or 3:1, depending on the recipe; 2.5:1
          comes off a castile dilution table, the more dilute of its two ratio rows. The
          recipe&apos;s own minimum sets how little water you can use — below it, some
          paste stays undissolved.
        </p>
        {/* THE ESTIMATE CAVEAT AND THE TWO WAYS TO WEIGH A PASTE, both of which used to ride
            the ratio mode's own paragraph and would otherwise have gone with it. Neither is
            state feedback — they are true of every plan figure on this panel until a reading
            is on the field — so they belong here, where they do not count against the prose
            budget and are one click away.
            1. THE ESTIMATE CLAIM is the reference's own, attached to its ratio rows and to no
               concentration row (LS:2172, repeated at LS:2294): those water figures are
               estimates, and the paste has to be weighed first because the cook evaporates
               water. LS:1534 makes the same demand as a precondition of the method — knowing
               the paste's starting weight is step one of it. It reaches further than the
               ratios here, because a preset is only one way into the plan %: every
               target-derived figure on this panel counts from the same pot.
            2. WHAT GETS WEIGHED IS THE PASTE. Both of the reference's routes to that number
               yield paste and never pot + paste: put the paste on a tared scale (LS:1534),
               or — the crockpot shortcut, which exists precisely so the paste need not be
               turned out of the pot — weigh the loaded crockpot and SUBTRACT the empty one
               (LS:1538, with LS:1536 advising you weigh and mark your crockpots before you
               ever start). This once closed with "Weigh the pot and enter it as Measured
               paste weight below", which is the shortcut with its subtraction deleted: a
               maker who followed it literally typed a figure carrying an empty crockpot's
               2-4 kg, and it went straight into the dilution water. If a future edit names
               the pot again it owes the subtraction in the same breath — DilutionPanel.test
               pins both halves. ("above", not "below": the field sits above these notes.)
            The DISCHARGE of this caveat stays inline where it belongs — "Dilution water above
            uses your measured paste (…)" renders once a reading is accepted, which is the one
            part of this that is state feedback rather than reference. */}
        <p>
          A dilution figure is only as exact as the paste it counts from, and until you weigh
          one that is the recipe&apos;s computed paste: the cook drives off water the recipe
          still counts, and only your scale knows how much. Put the paste on a tared scale, or
          weigh the loaded crockpot and subtract the empty pot&apos;s own weight, and enter it
          as Measured paste weight above.
        </p>
        {/* ZERO IS A RECORD, and this is where that claim lives now. It used to be the tail
            of an inline prompt beside the water field ("0 g counts, and is where the record
            starts") which rendered whenever that field was empty — an always-on paragraph in
            the panel's commonest state, spending a third of the prose budget to explain a
            mode that no longer exists. The claim itself is reference: the pot before any
            water at all is the reference's own starting entry (LS:1531), true in every state,
            which is precisely what these notes are for. The parser it describes is
            unchanged (lib/measuredPaste's parseGradualWaterRecordGrams: non-blank and >= 0),
            and it is what decides that a 0 g record governs — so a maker who reads this and
            types 0 gets exactly what it promises. */}
        <p>
          Recording 0 g counts: it is where the record starts, and the batch it describes is
          the undiluted paste. An empty field is not the same thing — it means nothing has
          been recorded yet, and the figures stay with your plan.
        </p>
        {/* THE SOLE OWNER of "which oils set the minimum". The ratio guidance (the note
          above, back when it was gated to ratio mode) used to
          say it too — in words, without figures — so in ratio + whole batch the same
          claim rendered twice on one screen; this one carries the numbers (LS:1603:
          coconut to 40%, castile 25%; LS:1605: most combination recipes 25-35%), so it
          keeps the claim and the other drops it.
          It also rendered in BOTH modes and BOTH scopes, where the ratio note was
          ratio-only — so ceding the claim here widened its reach rather than narrowing it.
          Ratio mode is gone now (Phase 2a) and the note above renders unconditionally too,
          so today the two simply agree rather than compete for the claim.
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
          twenty-three besides this one and has no reason to learn what a preservative is. */}
      {preservativeSlot}
    </section>
  );
}
