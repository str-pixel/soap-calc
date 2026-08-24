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
 * of the rules and carries none of the conditions the callers need — it says nothing
 * about blank/unparseable input. Its doc used to claim it was "shared by
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
 * decides whether a gradual record EXISTS, asked today by the printed sheet's two record rows
 * and by `resolveDilution`'s own governs decision — the one place DilutionPanel's batch scope
 * and the view model's every downstream consumer now share it, rather than each keeping their
 * own copy. Two copies of the same predicate (sheet, panel) is exactly how they once came to
 * disagree about whether a record existed at all (the `> 0` gate that dropped a 0 g record from
 * the paper alone); {@link correctedPotGramsFor} used to be a third copy, behind the widened
 * ceiling — gone along with the write-back that earned it (Phase 3, spec §5).
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
 * locale, and 2 g of water on a 1,600 g pot derives 74.9% instead of 33.8%. That used to be a
 * percentage the mode WROTE into `settings.soapConcentrationPercent` (decision 2's write-back,
 * gone since Phase 2a) — sizing the finished mass, the printed sheet's "Water actually added"
 * row and a legally capped preservative dose (EU Annex V) off a batch 2.25x lighter than the
 * one on the bench. Today the same bad percentage would only reach the record's own display
 * (`resolveDilution`'s `concentrationPercent`), but a display the maker weighed nothing to
 * justify is still not something to show.
 *
 * Refused HERE rather than at the panel because this is the one place the app decides a record
 * exists: a reading no scale produced must not be showing on the sheet or driving what
 * `resolveDilution` reports as the record's own concentration — the only predicate either
 * surface has to ask. It used to gate two more consequences that are gone now: licensing a
 * widened ceiling in {@link correctedPotGramsFor} (the widening itself retired in Phase 3,
 * spec §5), and pinning the maker into the mode the write-back read it back into (retired
 * with the write-back itself, decision 2, Phase 2a).
 * The panel renders the alert (it owns the field), reading the same fingerprint directly.
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
 * TARGET, and the two callers that come here are not aiming at one: a ratio preset
 * multiplies the pot it is given at the moment of the click, and the RECORD arm derives its
 * own concentration from the pot plus the water recorded. A % derived from a pot chosen by
 * that same % is circular — and while gradual mode WROTE its derivation into the recipe, the
 * circularity was a live feedback loop that hung the app:
 *
 *   basis = the weighed pot → write round2(100 × anhydrous ÷ pot) → solutionGrams is now
 *   anhydrous ÷ that percent, which lands a hair BELOW the pot whenever the 2 dp rounding
 *   went up (223 of 445 whole-gram readings in one swept window, at zero recorded water) →
 *   the ceiling rejects the reading → basis flips to the computed pot → a different percent
 *   → solutionGrams clears the reading again → the ceiling accepts it → forever.
 *
 * Nothing writes that derivation any more (Phase 2a), so the loop is gone — but the reason
 * the basis must stay target-independent is not, and it is the sentence above the loop
 * rather than the loop itself. The record's own first entry is the pot before any water at
 * all (LS:1531), where solution and reading are the same number by construction, so the
 * circularity is at its sharpest in the state the reference starts from.
 *
 * The ceiling is not weakened anywhere it means something. {@link measuredPasteIsValidFor}
 * still applies it exactly for the portion and for the copy that speaks in the maker's voice
 * about a reading; {@link measuredPasteRejectionFor} still reports it; and the batch pour, the
 * printed sheet's pour and the bottled mass apply it through {@link correctedPotGramsFor},
 * which is that same ceiling exactly. Only the choice of WHICH POT the presets and the record
 * arm count from drops it altogether, and that is what is decided here.
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
 * wants {@link correctedPotGramsFor}, whose ceiling is this one exactly.
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
  wholeBatchPasteGrams?: number | null,
  cookWaterGrams?: number | null,
): boolean {
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
 * Everything a surface needs to say about a measured-paste reading: which of the two
 * physical-impossibility rules it broke, whether it is usable at all, and the whole-batch
 * paste mass a caller's belowSolids/already-more-dilute copy quotes as what the recipe
 * predicts.
 */
export type MeasuredPasteRejection = {
  /** The field holds a number that is not a weight at all — zero or negative. Exclusive of
   * the two rules below. */
  nonPositive: boolean;
  /** The typed reading carries two or more decimal digits — finer than any scale weighing
   * paste reads (0.1 g), so it is not a scale reading: it is almost certainly a thousands
   * separator the browser swallowed as a decimal point (a typed 1,222 commits as 1.222).
   * Judged on the raw string, never the float — see measurementFinerThanScale. Defers only
   * to `nonPositive` (whose remedy subsumes this one); the two magnitude rules below both
   * defer to IT, because a bound on a number that is not a scale reading answers the wrong
   * question, with the wrong remedy. */
  subTenthPrecision: boolean;
  /** The reading is lighter than the batch's own non-evaporable mass — its anhydrous soap
   * plus an alternative liquid's solids. Yields to `subTenthPrecision` and to
   * `exceedsSolution`: the floor can sit ABOVE the ceiling once the solids outweigh the
   * target's whole water allowance, and a reading in that gap gets the ceiling's refusal
   * alone — see the rule's own note for why. */
  belowSolids: boolean;
  /** The reading is heavier than the whole solution the target dilutes to. The strongest of
   * the two MAGNITUDE rules: `nonPositive` and `belowSolids` both exclude it explicitly, so
   * among those it always wins — but it defers to `subTenthPrecision`, which is not a
   * magnitude claim at all. */
  exceedsSolution: boolean;
  /** Any of the four above fired. */
  rejected: boolean;
  /** There is a usable reading AND nothing rejected it — safe to compute from. */
  accepted: boolean;
  /** The field holds something; says nothing about whether it parses. */
  hasMeasurement: boolean;
  /** The reading as `Number()` saw it — NaN when unparseable, 0 when blank. */
  measuredGrams: number;
  /** The whole-batch paste mass a caller's belowSolids/already-more-dilute copy quotes as
   * "what the recipe predicts" — the corrected basis when supplied, else the water-only
   * predicted figure. */
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
 * itself. The rules and the reasons they exist are documented on the branches below;
 * they were moved here verbatim from PortionDilutionResults, where they used to live
 * beside the alert paragraphs.
 *
 * `wholeBatchPasteGrams` is the view model's corrected whole-batch paste mass; omit it and
 * both the solids floor and the reported `wholeBatchPasteBasis` fall back to the recipe's
 * own water-only predicted figure, exactly as core does when its matching param is omitted.
 * `cookWaterGrams` is the recipe's own cook water, needed alongside it for the solids floor
 * alone (see {@link solidsFloorGramsFor}) — it plays no other role here, and does not touch
 * `wholeBatchPasteBasis`.
 */
export function measuredPasteRejectionFor(
  measuredPasteGrams: string | undefined,
  dilution: DilutionResult,
  wholeBatchPasteGrams?: number | null,
  cookWaterGrams?: number | null,
): MeasuredPasteRejection {
  const raw = measuredPasteGrams ?? '';
  const hasMeasurement = raw.trim() !== '';
  const measured = Number(raw);
  // Mirrors core's own predictedPasteGrams (anhydrous + the water already in the paste) —
  // computed here too so belowSolids can quote it as a fallback. This counts only the WATER
  // fraction of an alternative liquid, though — see wholeBatchPasteBasis just below for the
  // corrected figure that actually gates the floor.
  const predictedPasteGrams =
    dilution.anhydrousGrams + Math.max(0, dilution.totalWaterGrams - dilution.dilutionWaterGrams);
  // Review round 3: predictedPasteGrams structurally misses an alternative liquid's
  // non-water solids (real mass sitting in the pot), so the TRUE whole-batch paste is
  // heavier than predictedPasteGrams whenever the recipe has a split liquid. The corrected
  // figure (wholeBatchPasteGrams, from the view model) is reported below as
  // `wholeBatchPasteBasis` — and passed straight through to lsPartialDilution for the
  // composition ratio too, so the UI's own report and core's arithmetic always agree on
  // the same basis. Falls back to the uncorrected predictedPasteGrams (round 2's basis)
  // when absent — the exact same fallback core itself applies when its own
  // wholeBatchPasteGrams param is omitted.
  const wholeBatchPasteBasis = hasCorrectedPasteBasis(wholeBatchPasteGrams)
    ? wholeBatchPasteGrams
    : predictedPasteGrams;
  // Review round 4, finding 8: a scale reading of zero or less is not a paste weight — it is
  // below the anhydrous floor trivially, and there is nothing to dilute. The `measured > 0`
  // guard on belowSolids below, and on `accepted` at the bottom, was written to exempt the
  // BLANK field (Number('') === 0) — but hasMeasurement already covers that case, so what the
  // guard actually did was let a typed -500 through as {rejected: false, accepted: false}: no
  // alert anywhere, and the batch row silently falling back to the recipe's computed figure
  // with the impossible number still on screen above it. min={1} on a type="number" input is
  // only enforced on submit, and this form has none, so it is typeable. This owns the verdict
  // alone rather than folding into belowSolids: that rule's remedy is about how the pot was
  // weighed, which is no help for a negative number.
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
  // Defers to nonPositive alone
  // (`measured > 0` — that rule's remedy subsumes this one, and a negative reading's typed
  // decimals are the least of its problems); the two magnitude rules each defer to THIS
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
    hasMeasurement &&
    Number.isFinite(measured) &&
    measured > 0 &&
    !subTenthPrecision &&
    !measurementExceedsSolution(measured, dilution) &&
    measurementBelowSolids(measured, solidsFloorGrams);
  // Likewise, a WHOLE-BATCH paste heavier than the whole target solution cannot be diluted
  // INTO that solution. Core returns null for it; saying so beats the figures silently
  // vanishing. `!nonPositive` rather than `measured > 0`: a negative reading is never above
  // the solution, so this is only belt-and-braces, but it is what makes the two rules
  // mutually exclusive, so the shell renders one paragraph for one reading. That exclusivity
  // is asserted, not incidental: this rule yields to nothing, and nonPositive and belowSolids
  // each defer to it explicitly (see belowSolids' own note for the case where the floor
  // outruns the ceiling and this rule is the only one standing).
  const exceedsSolution =
    hasMeasurement &&
    Number.isFinite(measured) &&
    !nonPositive &&
    !subTenthPrecision &&
    measurementExceedsSolution(measured, dilution);
  const rejected = nonPositive || subTenthPrecision || belowSolids || exceedsSolution;
  return {
    nonPositive,
    subTenthPrecision,
    belowSolids,
    exceedsSolution,
    rejected,
    accepted: hasMeasurement && Number.isFinite(measured) && measured > 0 && !rejected,
    hasMeasurement,
    measuredGrams: measured,
    wholeBatchPasteBasis,
    solidsFloorGrams,
  };
}

/**
 * WHICH POT the corrected water figure is measured against, and the single place that
 * choice is made for every batch-level consumer: {@link correctedDilutionWaterGrams} (and
 * through it DilutionPanel's pour row and the printed BatchSheet's) and
 * computeBottledSolutionGrams' base.
 *
 * It is {@link measuredPasteDescribesPotFor}'s three pot rules, plus the `solutionGrams`
 * ceiling {@link measuredPasteIsValidFor} applies — exactly, with no widening. A gradual
 * record's own 2 dp write-back used to round `solutionGrams` a hair under a weighed pot with
 * no water recorded (gradual's own opening state, LS:1531), which split the panel from the
 * mass it doses — a weighed 1,405 g pot against a 1,600 g computed one had the panel print
 * 1,405 g while the bottled figure came back 1,600 g, giving one batch two masses, a finished
 * volume from the larger, and a preservative dose (legally capped, EU Annex V) taken against
 * it. This function used to widen the ceiling by exactly that rounding wherever a record's own
 * arithmetic reached the target in force, to absorb exactly that split.
 *
 * PHASE 2A CLOSED THAT SPLIT FROM THE OTHER END: with a record governing, the bottled mass
 * comes from the record arm's own pot (`computeBottledSolutionGrams`' `record` argument, fed
 * from `resolveDilution`) and never from this function at all — so the two figures come from
 * one resolution by construction, and nothing derives a target from a record any more (Phase
 * 2a deleted the write-back, decision 2 forbids its return). The widening had nothing left to
 * earn: it could only still fire where a record's own arithmetic happened to reach an
 * unrelated, hand-typed target by coincidence, which is why nothing here widens the ceiling
 * any more (Phase 3, spec §5) —
 * this ceiling is `measuredPasteIsValidFor`'s exactly, for the PLAN arm, where it always
 * belonged.
 *
 * A CROCKPOT MIS-READING IS ABSORBED UNDER A RECORD, BY DESIGN. The record arm's own pot is
 * {@link weighedOrComputedPotGramsFor}'s — target-independent, three rules about the pot and
 * no ceiling at all — so a 4,500 g reading of a loaded crockpot is what "Finished so far", the
 * bottle and the preservative dose are all taken against, with no alert anywhere
 * (DilutionPanel's exceeds-solution paragraph is plan-governs only, because the record arm is
 * not aiming at a target). That is inherent to an arm whose basis must be target-independent —
 * the alternative is the circularity {@link measuredPasteDescribesPotFor} documents — and not
 * something this ceiling can recover. The rules that still bite under a record are the pot's
 * own (the solids floor and the precision fingerprint), which is why the reading is judged by
 * them there. What this ceiling still protects is the PLAN's pour and the plan-arm bottled
 * mass, where a target really is what the reading is being measured against.
 *
 * `fromMeasurement` is not a convenience: computeBottledSolutionGrams has to know whether
 * the pot it is pricing is the one the MAKER weighed — a weighed pot already contains an
 * alternative liquid's solids, an unmeasured base built from anhydrous + cook water does
 * not — so the two answers must come from one call, or the base and its solids term could
 * disagree about the same pot.
 *
 * Null means no pot is known: no usable reading AND no corrected basis. Callers fall back to
 * the recipe's own figures there, exactly as they did before this function existed.
 */
export function correctedPotGramsFor(
  dilution: DilutionResult,
  measuredPasteGrams: string | undefined,
  wholeBatchPasteGrams?: number | null,
  cookWaterGrams?: number | null,
): { grams: number; fromMeasurement: boolean } | null {
  const measured = parseMeasuredPasteGrams(measuredPasteGrams);
  if (
    measured !== undefined &&
    measuredPasteDescribesPotFor(measuredPasteGrams, dilution, wholeBatchPasteGrams, cookWaterGrams) &&
    !measurementExceedsSolution(measured, dilution)
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
 * IT IS TARGET-INDEPENDENT, AND THAT IS NOT AN OVERSIGHT — it is the property the record arm's
 * derivation needs, and the reason this is not {@link correctedPotGramsFor}. The gate is
 * {@link measuredPasteDescribesPotFor}: parse, precision, solids floor, and NO ceiling. A ratio
 * preset has no target to compare a reading against, and the record arm still DERIVES its own
 * concentration from the pot this function returns — so a ceiling here would let the panel's
 * own output choose the panel's input, the same render loop measuredPasteDescribesPotFor
 * documents in full (a live hang, back when that derivation was written into the recipe;
 * display-only now, decision 2, but the circularity a ceiling would reintroduce is identical).
 * A reading past what the saved target can hold is still refused everywhere a TARGET is what
 * the reading is being measured against: the pour, the bottled mass and the dose all go through
 * correctedPotGramsFor, whose ceiling is solutionGrams exactly.
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
 *    one on the scale. DilutionPanel's now-deleted ratio mode used to derive its pour from
 *    the corrected paste (pasteGrams x ratio), so before this fix the ratio block and every
 *    concentration-derived surface disagreed by exactly the solids: 5,000 g on screen
 *    against 5,450 g on the batch sheet for a 900 g liquid at 50% water. Subtracting the
 *    corrected paste from the same solutionGrams was that block's own basis, so the two
 *    landed on one number — every other consumer of this correction keeps it now that the
 *    block itself is gone.
 *
 * Both rules are ONE subtraction from ONE pot — `solutionGrams - the pot`, where the pot is
 * {@link correctedPotGramsFor}'s (the reading when it describes a possible one, else the
 * view model's corrected paste). Falls back to the recipe's computed figure when there is no
 * pot at all, which is byte-identical for a recipe with no split liquid: wholeBatchPasteGrams
 * is then exactly anhydrous + cookWater, and solutionGrams - that IS dilutionWaterGrams.
 *
 * Clamped at zero, matching calculateDilution's own clamp on dilutionWaterGrams: a pot can
 * exceed the target solution — a big low-water alternative liquid, while the recipe's
 * water-only targetExceedsPaste flag stays false — and a negative pour figure is never an
 * instruction. It prints as "0 g", the honest answer: there is no water left to add.
 *
 * That "0 g" used to reach the screen and the printed sheet with NO account beside it: every
 * explanatory branch was gated on targetExceedsPaste (false here) or on a rejected
 * MEASUREMENT (none here). Both surfaces now carry a branch keyed on the clamp's own
 * condition instead — DilutionPanel's pasteAlreadyPastTarget and BatchSheet's twin of it.
 * Any new surface pouring this figure owes the maker the same account; the clamp fires
 * exactly when the pot outweighs solutionGrams.
 *
 * BOTH OF THOSE BRANCHES ARE PLAN-GOVERNS ONLY SINCE PHASE 2A (spec §4: a verdict about a
 * target has no subject while a record governs), so the account under a record is a different
 * one and is owed just as hard: DilutionPanel prints a plan-labelled caption beside the row,
 * and the printed sheet keeps its "Water actually added" / "That record makes …" rows. A
 * weighed 1,400 g pot with no water recorded still prints "0 g" here; what stands beside it
 * is the record, not the verdict.
 *
 * WHICH POT — {@link correctedPotGramsFor}'s, which is {@link measuredPasteIsValidFor}'s
 * ceiling exactly: the reading when it describes a possible pot and does not exceed
 * `solutionGrams`, else the view model's corrected paste. No caller carries a widened variant
 * of this ceiling any more (Phase 3, spec §5) — a gradual record that once rounded
 * `solutionGrams` a hair under a weighed pot with no water recorded, and so used to earn a
 * momentary widening, now simply falls back to the corrected pot here exactly as any other
 * reading past the ceiling does, while the record's own figures are what the panel and the
 * sheet actually govern by (`resolveDilution`, `computeBottledSolutionGrams`'s `record` arm).
 */
export function correctedDilutionWaterGrams(
  dilution: DilutionResult,
  measuredPasteGrams: string | undefined,
  wholeBatchPasteGrams?: number | null,
  cookWaterGrams?: number | null,
): number {
  // wholeBatchPasteGrams/cookWaterGrams are forwarded into the pot gate, not just used by the
  // correction below it: the floor a reading is judged against has to be the same one the
  // rejection alert names, or this row would pour from a reading the panel is refusing one
  // paragraph above.
  const pot = correctedPotGramsFor(dilution, measuredPasteGrams, wholeBatchPasteGrams, cookWaterGrams);
  if (pot === null) return dilution.dilutionWaterGrams;
  return Math.max(0, dilution.solutionGrams - pot.grams);
}
