import type { DilutionResult } from '@soap-calc/core';

/**
 * What every UI surface passes for the `isRemaining` parameter below: a measured paste is
 * the WHOLE batch, always.
 *
 * DilutionPanel used to carry a declaration beside the measured-paste field — "That weight
 * is: (o) all of it ( ) what's left after earlier dilutions" — because a reading lighter than
 * the recipe predicts has two indistinguishable causes: water boiled off during the cook
 * (same soap, less water, MORE concentrated), or part of the batch already diluted away (same
 * composition, less of it). That control is gone by request. Whole-batch is this app's choice
 * rather than the reference's: LS:1534 weighs the PORTION of paste you wish to dilute and
 * multiplies that, so it is portion-first, and here sizing a partial dilution is what Custom
 * amount and its "Amount to make (ml)" field are for instead. What the reference does settle
 * is that the number is a PASTE weight either way — a tared scale (LS:1534), or the loaded
 * crockpot minus the empty one (LS:1538) — and never a vessel weighed along with its contents.
 *
 * REMAINING MODE IS THEREFORE UNREACHABLE FROM THE UI, and is kept anyway: the parameter, the
 * remaining-mode ceiling (`exceedsRemainingCeiling`), the `isRemaining` gates on
 * {@link measuredPasteIsValidFor} and {@link correctedPotGramsFor} (which is the one
 * computeBottledSolutionGrams and the pour now go through) and core's
 * `lsPartialDilution` arithmetic were all proven correct by large differential fuzzes, they
 * are still tested directly, and they are what a caller (or a restored control) would need.
 * Nothing in this module decides that policy — this constant is the single place the UI does,
 * so a reader following an `isRemaining = false` argument back finds the reason here rather
 * than a bare literal at four call sites.
 */
export const MEASURED_PASTE_IS_REMAINING = false;

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
  const hasCookWater =
    cookWaterGrams !== undefined &&
    cookWaterGrams !== null &&
    Number.isFinite(cookWaterGrams) &&
    cookWaterGrams >= 0;
  if (!hasCorrectedPasteBasis(wholeBatchPasteGrams) || !hasCookWater) return dilution.anhydrousGrams;
  const solidsGrams = Math.max(
    0,
    wholeBatchPasteGrams - (dilution.anhydrousGrams + (cookWaterGrams as number)),
  );
  return dilution.anhydrousGrams + solidsGrams;
}

/**
 * Whether the view model's corrected whole-batch paste mass is a figure that can be counted
 * from — present, finite and positive. FOUR CLAUSES, and they were written out in six places
 * (this module twice, DilutionPanel twice, BatchSheet, calculateAdditives) before this
 * predicate existed; a copy that drifted would have one surface counting an alternative
 * liquid's solids while another silently fell back to the recipe's water-only figure.
 *
 * A type guard, so the callers that used to cast (`data.wholeBatchPasteGrams as number`) get
 * the narrowing from the check itself rather than by assertion.
 *
 * The falsy answer is never an error: it is the documented fallback every consumer here
 * already has — the paste floor drops to the anhydrous soap, the computed pot drops to
 * anhydrous + cook water, and the corrected pour drops to the recipe's own figure. A caller
 * with no split liquid, and one predating the prop, take that path together.
 */
export function hasCorrectedPasteBasis(
  wholeBatchPasteGrams?: number | null,
): wholeBatchPasteGrams is number {
  return (
    wholeBatchPasteGrams !== undefined &&
    wholeBatchPasteGrams !== null &&
    Number.isFinite(wholeBatchPasteGrams) &&
    wholeBatchPasteGrams > 0
  );
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
 * INTERNAL to this module — deliberately not exported; go through
 * {@link measuredPasteRejectionFor} (or {@link measuredPasteIsValidFor}) like the other
 * rules. True when the TYPED reading carries two or more decimal digits — finer than any
 * scale weighing a batch of paste reads (0.1 g at the finest), so it is not a scale
 * reading at all.
 *
 * What it actually catches is a swallowed thousands separator: browsers interpret a comma
 * typed into `<input type="number">` as a DECIMAL POINT — every locale, Chromium included —
 * so a maker typing 1,222 (twelve hundred twenty-two grams) commits 1.222, and the app
 * never sees the comma. The only detectable fingerprint is the impossible precision.
 *
 * Judged on the RAW STRING, never the parsed float, because the float destroys the
 * evidence: 1480.50 parses to exactly the float 1480.5 parses to, but a scale doesn't
 * print trailing zeros — two typed decimals are the trap's shape whatever they round to.
 * Scientific notation is judged the same way: only decimal DIGITS are the separator's
 * fingerprint, so '2e3' (none) passes through to the magnitude rules on its parsed value,
 * while '1.25e3' (two) is refused whatever it multiplies out to. Junk that happens to
 * match ('1.23.4') is already unparseable and never reaches the rule.
 */
const MORE_THAN_ONE_DECIMAL_DIGIT = /\.\d\d/;
function measurementFinerThanScale(raw: string): boolean {
  return MORE_THAN_ONE_DECIMAL_DIGIT.test(raw.trim());
}

/**
 * The swallowed-separator fingerprint in full: a non-blank raw string that parses to a
 * finite, POSITIVE number and carries two or more typed decimal digits
 * (measurementFinerThanScale above — see it for the raw-string-not-float design and the
 * scientific-notation verdict). This is exactly the `subTenthPrecision` verdict
 * {@link measuredPasteRejectionFor} reaches for the measured-paste field, extracted so the
 * ONE other input with the same trap — DilutionPanel's "Amount to make (ml)" field, where a
 * typed 1,200 commits as 1.200 and shrinks the ask a thousandfold — judges its raw string
 * by the same single source of truth rather than a second copy of the regex. The
 * fingerprint reads the same both places: nobody asks for a portion to the hundredth of a
 * millilitre, just as no scale weighing paste reads finer than 0.1 g. Junk that happens to
 * carry two decimals ('1.23.4') parses to NaN and stays junk; zero and negative numbers are
 * some other rule's problem (nonPositive for the paste field, the child's own `> 0` gate
 * for the amount), so a fingerprint on them would answer with the wrong remedy.
 */
export function subTenthPrecisionFingerprint(raw: string): boolean {
  const n = Number(raw);
  return raw.trim() !== '' && Number.isFinite(n) && n > 0 && measurementFinerThanScale(raw);
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
 * Parses `settings.gradualWaterGrams` — the water the maker recorded pouring — into a finite,
 * NON-NEGATIVE gram figure, or undefined when there is no record. The one place the app
 * decides whether a gradual record EXISTS, which three surfaces now ask: the printed sheet's
 * two record rows, DilutionPanel's own derivation, and {@link correctedPotGramsFor}'s decision
 * about whether the widened ceiling has been earned. Three copies of the same predicate is
 * exactly how the panel and the sheet came to disagree about whether a record existed once
 * before (the `> 0` gate that dropped a 0 g record from the paper alone).
 *
 * `>= 0`, unlike {@link parseMeasuredPasteGrams}'s `> 0`: ZERO IS A RECORD. The pot before any
 * water at all is Gradual Dilution's own starting entry (LS:1531) and it writes a target like
 * any other. Blank is not zero — `Number('')` is 0, so the trim has to answer first, or an
 * untouched field would read as a record of nothing poured.
 *
 * THE SWALLOWED SEPARATOR IS NOT A RECORD, judged by the same fingerprint the measured-paste
 * field and the "Amount to make (ml)" field are judged by
 * ({@link subTenthPrecisionFingerprint} — see it for the raw-string-not-float design). The
 * water goes on the same scale the paste does, so two or more typed decimal digits are the
 * same impossibility here: `<input type="number">` commits a typed 2,000 as '2.000' in every
 * locale, and 2 g of water on a 1,600 g pot derives 74.9% instead of 33.8% — a percentage this
 * mode WRITES into `settings.soapConcentrationPercent`, so it would size the finished mass, the
 * printed sheet's "Water actually added" row and a legally capped preservative dose (EU Annex
 * V) off a batch 2.25x lighter than the one on the bench.
 *
 * Refused HERE rather than at the panel because this is the one place the app decides a record
 * exists: a reading no scale produced must not be showing on the sheet, licensing the widened
 * ceiling in {@link correctedPotGramsFor}, or pinning the maker into the mode that reads it,
 * and those three surfaces have no other predicate to ask. The panel renders the alert (it owns
 * the field), reading the same fingerprint directly.
 *
 * A single decimal stays a record — a scale really does read to 0.1 g — and '0.00' is zero
 * however it was typed, which is where the record starts, so the fingerprint's own `> 0` gate
 * leaves both alone.
 */
export function parseGradualWaterRecordGrams(
  gradualWaterGrams: string | undefined,
): number | undefined {
  if (gradualWaterGrams === undefined) return undefined;
  const trimmed = gradualWaterGrams.trim();
  if (trimmed === '') return undefined;
  if (subTenthPrecisionFingerprint(trimmed)) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * The TARGET-INDEPENDENT half of {@link measuredPasteIsValidFor}: everything the reading
 * says about the POT, and nothing about any target. A reading that clears this is a
 * physically possible whole-batch paste weight — it parses to a positive number, it is not
 * finer than a scale reads (so not a swallowed thousands separator), and it is not lighter
 * than the batch's own non-evaporable mass (see {@link solidsFloorGramsFor}).
 *
 * WHAT IT DELIBERATELY OMITS is `measurementExceedsSolution`, and the omission is the whole
 * point. "Heavier than the whole solution this target dilutes to" is a claim about a
 * TARGET; the two derived dilution modes do not have one. Ratio mode multiplies the pot it
 * is given, and Gradual mode DERIVES the target from the pot plus the water recorded — so
 * for gradual, `dilution.solutionGrams` is downstream of its own write-back, and letting it
 * pick the basis closed a feedback loop that hung the app:
 *
 *   basis = the weighed pot → write round2(100 × anhydrous ÷ pot) → solutionGrams is now
 *   anhydrous ÷ that percent, which lands a hair BELOW the pot whenever the 2 dp rounding
 *   went up (223 of 445 whole-gram readings in one swept window, at zero recorded water) →
 *   the ceiling rejects the reading → basis flips to the computed pot → a different percent
 *   → solutionGrams clears the reading again → the ceiling accepts it → forever.
 *
 * Ratio mode never showed it because its water is `paste × ratio > 0`, so its solution
 * always clears the reading comfortably; gradual's own first record is the pot before any
 * water at all (LS:1531), where solution and reading are the same number by construction.
 *
 * The ceiling is not weakened anywhere it means something. {@link measuredPasteIsValidFor}
 * still applies it exactly for the portion and for the copy that speaks in the maker's voice
 * about a reading; {@link measuredPasteRejectionFor} still reports it; and the batch pour,
 * the printed sheet's pour and the bottled mass apply it through
 * {@link correctedPotGramsFor}, which — on a recipe carrying a gradual record, and only there
 * — widens it by exactly that write-back's rounding and no further, so a target a record
 * itself produced cannot refuse that record, while a reading past the target for any other
 * reason is still ignored. Only the choice of WHICH POT the derived modes count from drops it
 * altogether, and that is what is decided here.
 */
export function measuredPasteDescribesPotFor(
  measuredPasteGrams: string | undefined,
  dilution: DilutionResult,
  wholeBatchPasteGrams?: number | null,
  cookWaterGrams?: number | null,
): boolean {
  const measured = parseMeasuredPasteGrams(measuredPasteGrams);
  return (
    measured !== undefined &&
    // The same precision rule measuredPasteRejectionFor applies (subTenthPrecision): a
    // reading with two or more typed decimal digits is a swallowed thousands separator,
    // not a scale reading, and must not correct anything.
    !measurementFinerThanScale(measuredPasteGrams as string) &&
    !measurementBelowSolids(
      measured,
      solidsFloorGramsFor(dilution, wholeBatchPasteGrams, cookWaterGrams),
    )
  );
}

/**
 * True when a parsed measured-paste reading is valid FOR this dilution: not below the
 * non-evaporable solids floor (measurementBelowSolids) and not above the target solution
 * ceiling (measurementExceedsSolution) — the bar for the portion's arithmetic, and for every
 * surface whose COPY speaks about the reading in the maker's voice. Two other callers want
 * two other questions: one choosing which pot the derived modes count from, with no target in
 * play, wants {@link measuredPasteDescribesPotFor} above (see it for the loop the ceiling
 * closed when it decided that), and one measuring a pour or a bottled mass against the pot
 * wants {@link correctedPotGramsFor}, whose ceiling is this one — widened by the gradual
 * write-back's own rounding where, and only where, a gradual record exists to have written
 * the target.
 *
 * `isRemaining` gates this for the BATCH row specifically: a reading declared as what's
 * LEFT after earlier dilutions describes a smaller pot, not the whole batch, so it can
 * never be valid for a caller (DilutionPanel's batch row, the printed BatchSheet) that
 * corrects a BATCH-level figure with it — PortionDilutionResults' own portion arithmetic
 * doesn't go through this gate, since a remaining reading is exactly what it wants.
 * Every UI caller passes {@link MEASURED_PASTE_IS_REMAINING}, so this gate never fires
 * today; see that constant for why it is kept.
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
    // The parse, the precision rule and the solids floor are the pot's own rules and are
    // shared with measuredPasteDescribesPotFor above — one derivation, so a reading can
    // never be a possible pot for one caller and an impossible one for another. (The
    // precision rule is checked on this path too, rather than only inside the rejection
    // object, or the panel would refuse a reading in its alert and apply it in the batch
    // row one paragraph below.)
    measuredPasteDescribesPotFor(measuredPasteGrams, dilution, wholeBatchPasteGrams, cookWaterGrams) &&
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
  /** The typed reading carries two or more decimal digits — finer than any scale weighing
   * paste reads (0.1 g), so it is not a scale reading: it is almost certainly a thousands
   * separator the browser swallowed as a decimal point (a typed 1,222 commits as 1.222).
   * Judged on the raw string, never the float — see measurementFinerThanScale. Applies
   * under either declaration, like `nonPositive`: a number no scale produced is not a
   * remainder either. Defers only to `nonPositive` (whose remedy subsumes this one); the
   * three magnitude rules below all defer to IT, because a bound on a number that is not a
   * scale reading answers the wrong question, with the wrong remedy. */
  subTenthPrecision: boolean;
  /** The reading is lighter than the batch's own non-evaporable mass — its anhydrous soap
   * plus an alternative liquid's solids (whole-batch mode only). Yields to
   * `subTenthPrecision` and to `exceedsSolution`: the floor can sit ABOVE the ceiling once
   * the solids outweigh the target's whole water allowance, and a reading in that gap gets
   * the ceiling's refusal alone — see the rule's own note for why. */
  belowSolids: boolean;
  /** The reading is heavier than the whole solution the target dilutes to (WHOLE-BATCH
   * readings only). The strongest of the MAGNITUDE rules within its own declaration:
   * `nonPositive` and `belowSolids` both exclude it explicitly, so among those it always
   * wins — but it defers to `subTenthPrecision`, which is not a magnitude claim at all.
   * Never fires on a remaining reading — `exceedsRemainingCeiling` is the ceiling a
   * remainder is judged against; see that field. */
  exceedsSolution: boolean;
  /** A remaining reading is heavier than the whole batch's paste ever was — the ONLY ceiling
   * a remaining reading is judged against, since `exceedsSolution` now stands down under
   * that declaration. */
  exceedsRemainingCeiling: boolean;
  /** Any of the five above fired. */
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
 *
 * Every UI caller passes {@link MEASURED_PASTE_IS_REMAINING}, so `exceedsRemainingCeiling`
 * cannot fire from the app today and no surface renders a paragraph for it. The rule stays —
 * see that constant — and so does the `!isRemaining` exclusion on `belowSolids` and
 * `exceedsSolution`, which is what keeps the four rules mutually exclusive for a caller that
 * does declare a remainder.
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
  const wholeBatchPasteBasis = hasCorrectedPasteBasis(wholeBatchPasteGrams)
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
  // belowSolids: that rule's remedy is about how the pot was weighed, which is no help for a
  // negative number, and it is disabled in remaining mode, which would have left a remaining
  // reading of -500 with no verdict at all.
  const nonPositive = hasMeasurement && Number.isFinite(measured) && measured <= 0;
  // A reading with two or more TYPED decimal digits is finer than any scale weighing a
  // paste batch reads (0.1 g at the finest), so it is not a scale reading — it is almost
  // certainly a thousands separator the browser swallowed as a decimal point (a typed
  // 1,222 commits as 1.222; see measurementFinerThanScale for the mechanism, the
  // raw-string-not-float design, and the scientific-notation verdict). The floor below
  // caught the worst of these by accident, with an alert blaming the scale's tare — the
  // wrong diagnosis — while a two-decimal artifact above the floor (1480,25 → 1480.25) was
  // silently accepted and poured from.
  //
  // Applies under either declaration, exactly like nonPositive and for the same reason: a
  // number no scale produced is not a remainder either. Defers to nonPositive alone
  // (`measured > 0` — that rule's remedy subsumes this one, and a negative reading's typed
  // decimals are the least of its problems); the three magnitude rules each defer to THIS
  // via an explicit exclusion, because a floor or ceiling verdict on a number that is not
  // a scale reading answers the wrong question — its remedies (re-tare, weigh all of it,
  // lower the target) send the maker back to a scale that was never the problem.
  //
  // The derivation IS the shared fingerprint (non-blank, finite, positive, two or more
  // typed decimals) — one function, so this rule and the ml-field's twin can never drift.
  const subTenthPrecision = subTenthPrecisionFingerprint(raw);
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
  // while the floor's remedies — re-tare, or weigh all of the paste — answer a mistake that is
  // not the one being made. `rejected` is unaffected either way, so nothing this
  // exclusion touches becomes acceptable; only the redundant paragraph goes.
  const solidsFloorGrams = solidsFloorGramsFor(dilution, wholeBatchPasteGrams, cookWaterGrams);
  const belowSolids =
    !isRemaining &&
    hasMeasurement &&
    Number.isFinite(measured) &&
    measured > 0 &&
    !subTenthPrecision &&
    !measurementExceedsSolution(measured, dilution) &&
    measurementBelowSolids(measured, solidsFloorGrams);
  // Likewise, a WHOLE-BATCH paste heavier than the whole target solution cannot be diluted
  // INTO that solution. Core returns null for it; saying so beats the figures silently
  // vanishing. `!nonPositive` rather than `measured > 0`: a negative reading is never above
  // the solution, so this is only belt-and-braces, but it is what makes the whole-batch rules
  // mutually exclusive, so the shell renders one paragraph for one reading. That exclusivity
  // is asserted, not incidental: this rule yields to nothing under its own declaration, and
  // nonPositive and belowSolids each defer to it explicitly (see belowSolids' own note for
  // the case where the floor outruns the ceiling and this rule is the only one standing).
  //
  // `!isRemaining` is what finally makes that property hold for all four rules, and it is a
  // claim about what this rule MEANS, not a tie-break bolted on to stop two paragraphs
  // printing. `solutionGrams` is anhydrous ÷ the target — what the WHOLE batch's soap makes
  // at that concentration. A remainder is not the batch, so "your paste already weighs more
  // than the N g this target dilutes to" is not a statement about it, and the remedy that
  // paragraph gives ("lower the target concentration") answers a mistake the maker did not
  // make: a remainder that reads heavy is a scale or declaration problem, and the ceiling
  // that owns it is exceedsRemainingCeiling, checked against the pot the remainder came out
  // of. Until this gate, a remaining 4,100 g against a 4,000 g solution and a 2,050 g pot set
  // both flags and the panel stacked both paragraphs, the wrong advice first.
  //
  // Suppressed for EVERY remaining reading, not only where exceedsRemainingCeiling also
  // fires, because the leftover case is not this rule's either. That case is
  // solutionGrams < measured <= wholeBatchPasteBasis, reachable only when the corrected pot
  // outweighs the solution (the water-only fallback basis can never exceed solutionGrams, so
  // the two suppression scopes differ on split-liquid recipes alone). There the reading is
  // perfectly possible — 4,200 g really can be left of a 4,500 g pot — and what is out of
  // reach is the TARGET, for a reason that does not depend on the reading at all: the
  // remainder's own solution is measured x solutionGrams / basis, so it falls short of the
  // remainder exactly when basis > solutionGrams, whatever was weighed. Refusing the subset
  // of readings that happen to sit above solutionGrams would refuse an arbitrary slice of a
  // reading-independent condition and stay silent on the rest of it. (When the panel still
  // offered the declaration, that condition had an explanation in both scopes rather than a
  // refusal — PortionDilutionResults' measuredPasteAlreadyThinner and DilutionPanel's
  // pasteAlreadyPastTarget twin, neither a role="alert", because nothing about the reading is
  // impossible. The first of those is gone with the control; the second still renders, for
  // its own unmeasured case.) Nothing this suppression feeds changes either way:
  // measuredPasteIsValidFor and correctedPotGramsFor both refuse every remaining reading
  // outright, so the batch row, correctedDilutionWaterGrams, computeBottledSolutionGrams and
  // BatchSheet never see it.
  const exceedsSolution =
    !isRemaining &&
    hasMeasurement &&
    Number.isFinite(measured) &&
    !nonPositive &&
    !subTenthPrecision &&
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
  //
  // Since exceedsSolution stood down under this declaration, this is the ONLY ceiling a
  // remaining reading meets. Anything added to this rule is therefore added to the whole of
  // the remaining declaration's ceiling; there is no longer a second rule behind it to catch
  // what it lets through.
  //
  // No surface renders it today: every UI caller passes MEASURED_PASTE_IS_REMAINING, so
  // `isRemaining` is always false and this is always false with it. The alert DilutionPanel
  // used to print for it is gone (its remedies named the declaration control). Kept for the
  // reason on that constant — a direct consumer, or a restored control, needs this ceiling or
  // an over-heavy remainder reaches the arithmetic with nothing standing behind it.
  //
  // `!subTenthPrecision` for the same reason the whole-batch magnitude rules carry it: the
  // precision rule fires under either declaration (a number no scale produced is not a
  // remainder either), and without the exclusion a remaining 2000.25 against a 1,600 g pot
  // would set both flags — the exclusivity the sweep asserts holds for all five rules.
  const exceedsRemainingCeiling =
    isRemaining &&
    hasMeasurement &&
    Number.isFinite(measured) &&
    measured > 0 &&
    !subTenthPrecision &&
    measured > wholeBatchPasteBasis;
  const rejected =
    nonPositive || subTenthPrecision || belowSolids || exceedsSolution || exceedsRemainingCeiling;
  return {
    nonPositive,
    subTenthPrecision,
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
 * Half of the last digit `gradualDilutionFrom` (core) rounds its written percentage to, and
 * therefore the most a recorded percent can differ from the record it was derived from.
 * DilutionPanel's own `gradualNotAppliedYet` threshold is this same number for the same
 * reason; both have to move if core's rounding ever does.
 */
const GRADUAL_WRITE_BACK_ROUNDING = 0.005;

/**
 * Whether a reading could have WRITTEN this dilution's own target — TOGETHER WITH THE WATER
 * THIS RECORD NAMES — asked as a predicate so the comparison can be made without a divide
 * (see the body).
 *
 * Gradual derives the target from the pot and the pour: a pot of M grams with W of water
 * recorded writes `p = round2(100 × anhydrous ÷ (M + W))`, so `solutionGrams` comes back as
 * `100 × anhydrous ÷ p` — which lands a hair UNDER M + W whenever that rounding went up, and
 * therefore under M itself in gradual's own opening state, where W is 0 and the pot IS the
 * finished mass (LS:1531). The rounding is bounded (|p − 100·anhydrous/(M + W)| <= 0.005), so
 * the heaviest RECORD that writes this p weighs `100 × anhydrous ÷ (p − 0.005)` all told. That
 * is this bound, closed-form and tight — not a tolerance chosen to make a case pass. It is
 * ATTAINED at W = 0, so the comparison sits exactly on the boundary and has to be exact there.
 *
 * THE RECORDED WATER IS IN THE COMPARISON, and that is what keeps the widening tied to the
 * target this record wrote rather than to the mere existence of a record. `gradualWaterGrams`
 * is RECIPE state and nothing clears it when the maker leaves Gradual, while `dilutionMode` is
 * session state this module cannot see — so "a record exists" was satisfied by a leftover 2,000
 * g pour sitting beside a target the maker typed by hand, and the widened branch applied to a
 * target that record demonstrably did not write. Asking whether M + W could have produced p
 * answers the question the widening's whole argument is about, and answers it from the record
 * itself. In practice this confines the widening to W = 0 and its immediate neighbourhood,
 * which is the only place it was ever reachable: with real water in the record the solution the
 * record wrote is the pot PLUS that water, so the reading is under `solutionGrams` by the whole
 * pour and the pre-existing ceiling takes it without any widening at all.
 *
 * ONLY WHERE A GRADUAL RECORD EXISTS AND ADDS UP TO THIS TARGET, and that condition is the
 * whole of the widening's
 * licence. Everything above is an argument about a target GRADUAL wrote from a pot with a
 * recorded pour; in concentration mode the maker typed the target themselves, so a reading
 * past `solutionGrams` there is what it has always been — the app's own named mistake, the
 * crockpot weighed with the paste still in it — and the pre-existing comparison stands
 * unchanged. Ratio mode writes a target from the pot too, and does not need the widening
 * either: its water is `paste × ratio` with a strictly positive ratio, so its solution clears
 * the reading by that whole term rather than by a rounding. (Which is why the write-back loop
 * only ever showed itself in gradual, whose own first record is the pot before any water at
 * all — see {@link measuredPasteDescribesPotFor}.)
 *
 * Applied in every mode, the widening cost the printed sheet its
 * voice: inside the band (0.68 g at 30%, 6.1 g at 10%) the pot became the reading, so
 * "Dilution water to add" clamped to "0 g", while every note that could have explained it
 * keys on the other gate — {@link measuredPasteIsValidFor}, which still refused the reading,
 * or the computed pot, which is under the solution. The page carried to the bench printed a
 * bare zero. With a record in hand that zero always has an account beside it: the sheet's own
 * "Water actually added" and "That record makes …" rows, which print off this same record.
 *
 * The signal is `settings.gradualWaterGrams` — RECIPE state, saved with the file and reaching
 * every caller including the sheet — and never the session-only `dilutionMode`, which the
 * sheet cannot see and a reload discards. It is read through
 * {@link parseGradualWaterRecordGrams}, the same predicate the panel and the sheet use to
 * decide a record exists, so the widening cannot apply to a record no surface is showing —
 * a swallowed thousands separator included, which is refused there and so cannot buy a
 * widening with a pour of 2 g that was never made.
 *
 * Falls back to `solutionGrams` for a target at or below the rounding itself, where the
 * widened bound is meaningless (calculateDilution accepts any percent in (0, 100); the UI
 * never types below 1).
 */
function measuredCouldHaveWrittenTarget(
  measured: number,
  dilution: DilutionResult,
  gradualWaterGrams: string | undefined,
): boolean {
  // measurementExceedsSolution, not a hand-written `<=`, in EVERY arm: this is the
  // pre-existing ceiling itself, the one measuredPasteIsValidFor applies, so the two gates
  // agree byte-for-byte wherever the widening is not in force rather than by coincidence.
  // It is asked FIRST, and the widened test is an alternative to it rather than a
  // replacement for it: with water in the record, `(measured + recorded)` can exceed the
  // bound for a reading comfortably under `solutionGrams` — a 4,000 g pot with 2,000 g
  // recorded against a 4,059 g solution — and that reading has never needed a widening to be
  // accepted. Every reading the old ceiling took is still taken.
  if (!measurementExceedsSolution(measured, dilution)) return true;
  const recordedWaterGrams = parseGradualWaterRecordGrams(gradualWaterGrams);
  if (recordedWaterGrams === undefined) return false;
  const p = dilution.soapConcentrationPercent;
  if (!Number.isFinite(p) || p <= GRADUAL_WRITE_BACK_ROUNDING) return false;
  // DIVISION-FREE, and compared against 100·anhydrous rather than solutionGrams·p. Both
  // matter, because this bound is ATTAINED rather than approached: equality holds exactly
  // when the rounding went up by the full half-cent and no water was recorded. Written as
  // `measured + recorded <= solutionGrams · p / (p − 0.005)` the comparison inherits the
  // error in solutionGrams (itself anhydrous ÷ (p/100)), which at an exact half-cent tie
  // lands the ceiling ~3e-14 BELOW the reading — refusing a record the reading itself
  // produced, which silently restores the two-masses-for-one-batch bug this ceiling exists
  // to prevent (~1 in 21,000 readings; 0 on the starter recipe, which is why it hid).
  // Multiplying through by the positive (p − 0.005) removes the divide, and
  // solutionGrams · p is exactly 100·anhydrous by construction.
  return (measured + recordedWaterGrams) * (p - GRADUAL_WRITE_BACK_ROUNDING) <=
    100 * dilution.anhydrousGrams;
}

/**
 * WHICH POT the corrected water figure is measured against, and the single place that
 * choice is made for every batch-level consumer: {@link correctedDilutionWaterGrams} (and
 * through it DilutionPanel's pour row and the printed BatchSheet's) and
 * computeBottledSolutionGrams' base.
 *
 * It is {@link measuredPasteDescribesPotFor}'s three pot rules, plus a ceiling that is
 * `solutionGrams` widened by {@link measuredCouldHaveWrittenTarget} WHERE A GRADUAL RECORD
 * ADDS UP TO THIS TARGET and left exactly as it was everywhere else — and that widening is the
 * whole of this function's reason to exist. {@link measuredPasteIsValidFor} compares the
 * reading against `solutionGrams` exactly, and in gradual mode `solutionGrams` is anhydrous ÷
 * the percent the panel's own record just wrote: with no water recorded the pot IS the
 * finished mass, so the two are the same number up to 2 dp of rounding, and about half of the
 * readings in the window land the solution a hair below the reading. Deciding the pot there
 * split the panel from the mass it doses — a weighed 1,405 g pot against a 1,600 g computed
 * one had the panel print 1,405 g while the bottled figure came back 1,600 g, giving one batch
 * two masses, a finished volume from the larger, and a preservative dose (legally capped, EU
 * Annex V) taken against it: on the app's own starter recipe a 1,400 g pot was dosed at 1% of
 * 1,666 g, which is 1.19% of what the maker had. 213 of the 433 whole-gram readings between
 * the solids floor and the computed pot landed in it, with nothing on screen naming the
 * split — the exceeds-solution alert is suppressed in gradual mode precisely because it is a
 * rounding artifact there.
 *
 * THE CEILING IS NOT DROPPED, only widened to exactly the rounding, and the difference
 * matters. A reading past `solutionGrams` by more than any rounding could explain is the
 * app's own named mistake — the maker weighed the loaded crockpot and forgot to subtract the
 * empty one — and every target-derived figure must go on ignoring it and falling back to the
 * recipe's computed pot, which is what the alert beside the field tells the maker has
 * happened. Dropping the ceiling outright would have priced a bottle, a volume and a dose off
 * a pot with 3 kg of stoneware in it.
 *
 * The bound is TIGHT rather than generous, and provably so: for a record of R grams of paste
 * plus W of water, the written p satisfies 100·anhydrous = p_true·(R + W) with
 * |p − p_true| <= 0.005, so (R + W)·(p − 0.005) <= (R + W)·p_true = 100·anhydrous exactly.
 * A gradual record therefore always clears this ceiling once its own write-back has been
 * applied — for any W, not only zero — while a target that record did not write has no such
 * guarantee and falls back to the pre-existing comparison. The two states where the saved
 * target is NOT round2(p_true) each already have their own account on screen: the write-back
 * has not fired yet (DilutionPanel's "Not applied yet" clause) or the [1, 99] clamp moved what
 * it wrote (that mode's clamp alert).
 *
 * `gradualWaterGrams` — `settings.gradualWaterGrams`, the water the maker recorded — is what
 * licenses that widening, and without a record whose own arithmetic reaches this target the
 * ceiling is `measuredPasteIsValidFor`'s
 * exactly. See {@link measuredCouldHaveWrittenTarget} for why the argument does not travel to
 * a target the maker typed, and for the bare "0 g" it printed on the batch sheet while it did.
 * Omitting the parameter is therefore the pre-widening behaviour, which is what every caller
 * with no record to offer wants; the three app call sites — DilutionPanel's batch row, the
 * printed BatchSheet's, and computeBottledSolutionGrams (from the view model) — all pass the
 * recipe's own field, so the pot is chosen once for the pour, the paper and the dose.
 *
 * A CROCKPOT MIS-READING IS ABSORBED IN GRADUAL MODE, BY DESIGN, and it is worth saying so
 * where a reader would otherwise assume this ceiling is a defence against it in every mode. A
 * 4,500 g reading of a loaded crockpot with 0 g of water recorded writes its OWN target
 * (round2(100·anhydrous/4,500)) — so `solutionGrams` becomes 4,500 g, the reading sits inside
 * this ceiling honestly, and the pot, the bottle and the preservative dose are all taken
 * against 4,500 g with no alert anywhere (DilutionPanel suppresses the exceeds-solution
 * paragraph in gradual mode, because there the target is that mode's own output). That is
 * inherent to a mode whose basis must be target-independent — the alternative is the render
 * loop {@link measuredPasteDescribesPotFor} documents — and not something this ceiling can
 * recover: with the target derived from the reading, no target-based rule can contradict it.
 * The rules that still bite in gradual mode are the pot's own (the solids floor and the
 * precision fingerprint), which is why the reading is judged by them there.
 *
 * `fromMeasurement` is not a convenience: computeBottledSolutionGrams has to know whether
 * the pot it is pricing is the one the MAKER weighed — a weighed pot already contains an
 * alternative liquid's solids, an unmeasured base built from anhydrous + cook water does
 * not — so the two answers must come from one call, or the base and its solids term could
 * disagree about the same pot.
 *
 * Null means no pot is known: no usable reading AND no corrected basis. Callers fall back to
 * the recipe's own figures there, exactly as they did before this function existed.
 *
 * `isRemaining` refuses the reading outright, the same gate {@link measuredPasteIsValidFor}
 * applies and for the same reason — a remainder is not the whole batch's pot, so a
 * batch-level figure must never be corrected with one. Every UI caller passes
 * {@link MEASURED_PASTE_IS_REMAINING}, so that branch is unreachable from the app today;
 * see that constant for why it is kept.
 */
export function correctedPotGramsFor(
  dilution: DilutionResult,
  measuredPasteGrams: string | undefined,
  isRemaining = false,
  wholeBatchPasteGrams?: number | null,
  cookWaterGrams?: number | null,
  gradualWaterGrams?: string,
): { grams: number; fromMeasurement: boolean } | null {
  const measured = parseMeasuredPasteGrams(measuredPasteGrams);
  if (
    !isRemaining &&
    measured !== undefined &&
    measuredPasteDescribesPotFor(measuredPasteGrams, dilution, wholeBatchPasteGrams, cookWaterGrams) &&
    measuredCouldHaveWrittenTarget(measured, dilution, gradualWaterGrams)
  ) {
    return { grams: measured, fromMeasurement: true };
  }
  if (hasCorrectedPasteBasis(wholeBatchPasteGrams)) {
    return { grams: wholeBatchPasteGrams, fromMeasurement: false };
  }
  return null;
}

/**
 * The pot the RECIPE predicts: the view model's corrected, solids-aware whole-batch paste mass
 * when there is one, else the recipe's own anhydrous soap plus its cook water. Never corrected
 * by anything the maker weighed — that is {@link weighedOrComputedPotGramsFor}'s decision, and
 * keeping the two apart is why this one is named for the prediction rather than for being
 * "best known", which is what it was called while a caller reached for it believing it already
 * preferred the scale (DilutionPanel's own jar figures did, for a whole review round).
 *
 * Wanted on its own by the surfaces that are making a claim about the RECIPE rather than about
 * this pot: the alternative liquid's solids term, and the "the paste is already more dilute
 * than the target" verdict, both of which must read the same whether or not a reading is on the
 * field.
 *
 * Null only when there is no dilution to speak of.
 */
export function computedPotGramsFor(
  dilution: DilutionResult | null,
  wholeBatchPasteGrams?: number | null,
  cookWaterGrams?: number | null,
): number | null {
  if (!dilution) return null;
  // `?? 0` catches null/undefined but not NaN or Infinity, either of which would make the
  // sum non-finite and propagate silently into the pour, the bottled base and the jar's
  // share — a pot figure is the one thing on this screen that must never be NaN.
  const cook = Number.isFinite(cookWaterGrams) ? (cookWaterGrams as number) : 0;
  return hasCorrectedPasteBasis(wholeBatchPasteGrams)
    ? wholeBatchPasteGrams
    : dilution.anhydrousGrams + cook;
}

/**
 * WHICH POT THE DERIVED MODES COUNT FROM — the pot the maker weighed when that reading
 * describes a possible one, else the recipe's own computed pot ({@link computedPotGramsFor}) —
 * and the single place that choice is made, for the panel's ratio multiplication, its gradual
 * sum, the jar weighed out of the batch in Custom amount, and the printed sheet's "That record
 * makes" row.
 *
 * Those four asked it in three hand-written copies before this function, two of them in a React
 * component module that the printed sheet had to import to reach the third. That is how the
 * sheet came to resolve a record's paste with one gate while its own pour used another, and how
 * a jar's share of the batch came to be taken from the prediction while every batch-scope figure
 * beside it preferred the scale.
 *
 * IT IS TARGET-INDEPENDENT, AND THAT IS NOT AN OVERSIGHT — it is the property gradual's
 * write-back needs, and the reason this is not {@link correctedPotGramsFor}. The gate is
 * {@link measuredPasteDescribesPotFor}: parse, precision, solids floor, and NO ceiling. Ratio
 * mode has no target to compare a reading against, and gradual DERIVES its target from the pot
 * this function returns — so a ceiling here would let the panel's own output choose the panel's
 * input, which is the render loop measuredPasteDescribesPotFor documents in full. A reading past
 * what the saved target can hold is still refused everywhere a TARGET is what the reading is
 * being measured against: the pour, the bottled mass and the dose all go through
 * correctedPotGramsFor, whose ceiling is solutionGrams widened by exactly the write-back's own
 * rounding where the record's own arithmetic reaches that target.
 *
 * So the two functions ANSWER DIFFERENT QUESTIONS and are expected to differ — "what does this
 * record make" against "what pot can this target's pour be measured from" — and a future edit
 * that collapses them into one closes the loop again. What must never differ is one QUESTION
 * answered two ways, which is what this extraction removes: screen and paper now state one mass
 * for one record because they compute it here, once.
 *
 * `fromMeasurement` is the same flag {@link correctedPotGramsFor} returns and is what the
 * panel's "Finished so far (weighed)" / "(computed)" label reads, so the label can never name a
 * basis other than the one this call chose.
 */
export function weighedOrComputedPotGramsFor(
  dilution: DilutionResult | null,
  measuredPasteGrams: string | undefined,
  wholeBatchPasteGrams?: number | null,
  cookWaterGrams?: number | null,
): { grams: number; fromMeasurement: boolean } | null {
  if (!dilution) return null;
  const measured = parseMeasuredPasteGrams(measuredPasteGrams);
  if (
    measured !== undefined &&
    measuredPasteDescribesPotFor(measuredPasteGrams, dilution, wholeBatchPasteGrams, cookWaterGrams)
  ) {
    return { grams: measured, fromMeasurement: true };
  }
  const computed = computedPotGramsFor(dilution, wholeBatchPasteGrams, cookWaterGrams);
  return computed === null ? null : { grams: computed, fromMeasurement: false };
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
 * 1. A measured paste that describes a possible pot — the same arithmetic DilutionPanel and
 *    PortionDilutionResults already apply: solutionGrams is fixed by the target
 *    concentration, so solutionGrams - measured is what is still needed to reach it, and a
 *    usable measurement OUTRANKS the recipe's own dilutionWaterGrams (Task 5's
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
 * Both rules are ONE subtraction from ONE pot — `solutionGrams - the pot`, where the pot is
 * {@link correctedPotGramsFor}'s (the reading when it describes a possible one, else the
 * view model's corrected paste). Falls back to the recipe's computed figure when there is no
 * pot at all, which is byte-identical for a recipe with no split liquid: wholeBatchPasteGrams
 * is then exactly anhydrous + cookWater, and solutionGrams - that IS dilutionWaterGrams.
 *
 * Clamped at zero, matching calculateDilution's own clamp on dilutionWaterGrams: a pot can
 * exceed the target solution — a big low-water alternative liquid, while the recipe's
 * water-only targetExceedsPaste flag stays false, or a gradual record whose own 2 dp
 * write-back left the solution a hair under the pot — and a negative pour figure is never an
 * instruction. It prints as "0 g", the honest answer: there is no water left to add.
 *
 * That "0 g" used to reach the screen and the printed sheet with NO account beside it: every
 * explanatory branch was gated on targetExceedsPaste (false here) or on a rejected
 * MEASUREMENT (none here). Both surfaces now carry a branch keyed on the clamp's own
 * condition instead — DilutionPanel's pasteAlreadyPastTarget and BatchSheet's twin of it.
 * Any new surface pouring this figure owes the maker the same account; the clamp fires
 * exactly when the pot outweighs solutionGrams. (Gradual mode renders no pour row of its own
 * — it has no target for one to answer — so the only zero it prints is the sheet's, and the
 * sheet carries the same branches: a weighed 1,400 g pot with no water recorded prints "0 g"
 * beside the sheet's own "The paste is already more dilute than 87.3%" and its
 * "That record makes 1,400 g".)
 *
 * WHICH POT, AND WHY IT IS NOT {@link measuredPasteIsValidFor}'s CHOICE — that gate compares
 * the reading against solutionGrams exactly, and in gradual mode solutionGrams is the panel's
 * own write-back rounded to 2 dp, so it lands under the reading about half the time. The pot
 * is chosen by {@link correctedPotGramsFor} instead, whose ceiling is solutionGrams widened by
 * exactly that rounding WHEREVER A GRADUAL RECORD EXISTS: see it for the bound, the proof that
 * it is tight, and the split it closed downstream in computeBottledSolutionGrams. The figure
 * here is unchanged for every reading either gate accepts, and for every reading past the
 * widened ceiling (still the corrected pot, still the recipe's own answer to a crockpot-sized
 * mis-reading). It moves only inside the rounding window, and only for a recipe carrying a
 * record — where it becomes 0 rather than a pour measured against a pot the maker's own scale
 * contradicts, and where the sheet's "Water actually added" / "That record makes …" rows are
 * on the page to account for that 0. With no record the widening is not in force at all, so
 * concentration and ratio mode pour exactly what they poured before it existed.
 *
 * `isRemaining` refuses the reading in {@link correctedPotGramsFor}, so this row falls back to
 * the corrected pot for one. Both UI callers pass {@link MEASURED_PASTE_IS_REMAINING}, so that
 * path is unreachable from the app today; the parameter is kept for the reason on that
 * constant.
 */
export function correctedDilutionWaterGrams(
  dilution: DilutionResult,
  measuredPasteGrams: string | undefined,
  isRemaining = false,
  wholeBatchPasteGrams?: number | null,
  cookWaterGrams?: number | null,
  gradualWaterGrams?: string,
): number {
  // wholeBatchPasteGrams/cookWaterGrams are forwarded into the pot gate, not just used by the
  // correction below it: the floor a reading is judged against has to be the same one the
  // rejection alert names, or this row would pour from a reading the panel is refusing one
  // paragraph above. gradualWaterGrams rides along for the same kind of reason: it is what
  // decides whether the ceiling that pot was judged against was widened at all.
  const pot = correctedPotGramsFor(
    dilution,
    measuredPasteGrams,
    isRemaining,
    wholeBatchPasteGrams,
    cookWaterGrams,
    gradualWaterGrams,
  );
  if (pot === null) return dilution.dilutionWaterGrams;
  return Math.max(0, dilution.solutionGrams - pot.grams);
}
