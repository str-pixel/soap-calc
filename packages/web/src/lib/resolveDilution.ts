import { gradualDilutionFrom, lsPotAnhydrousShare } from '@soap-calc/core';
import type { DilutionResult } from '@soap-calc/core';
import {
  parseGradualWaterRecordGrams,
  subTenthPrecisionFingerprint,
  weighedOrComputedPotGramsFor,
} from './measuredPaste';

/**
 * The spec's §1 resolution rule, verbatim
 * (docs/superpowers/specs/2026-08-19-dilution-plan-record-design.md §1):
 *
 * "Resolution rule (one function, new, in packages/web/src/lib/): a record present → record
 * arm; else plan arm. "Present" follows parseGradualWaterRecordGrams's documented contract
 * exactly: non-blank and ≥ 0 — zero is a record (the pot before any water at all is Gradual's
 * own starting entry, LS:1531). A 0 g record therefore takes the record arm: the batch that
 * exists is the undiluted paste, and every figure — including the dose basis — describes it.
 * The sheet's record rows print whatever record the rule reads; they can never disagree. The
 * parser is unchanged. Record arm's pot is weighedOrComputedPotGramsFor (target-independent).
 * The derived % readout is unclamped and display-only."
 *
 * And decision 2, which this function exists to make structural: "No write-back, ever. Plan
 * and record are independent state; a single resolution rule feeds every consumer; the
 * record's derived % is display-only." Nothing here ever writes `soapConcentrationPercent` (or
 * any other plan field) from the record — the plan arm below is a bare passthrough of the
 * `dilution` argument, so a caller reading `.plan` sees exactly what `calculateDilution`
 * produced, untouched by whatever the record says.
 *
 * THE STANDING STATE, past Phase 2a: consumers read the RESOLVED figures, not `.plan` alone
 * — bottledSolutionGrams, the preservative's dosing basis and the finished-product mass all
 * follow whichever arm `.governs` names (see useRecipeViewModel.ts, and
 * useRecipeViewModel.test.tsx's own pin on it). `.governs` and `.record` are themselves
 * exposed off the view model as `dilutionGoverns` / `dilutionRecord`, consumed today by
 * App.tsx's own mid-pour companion-dose memo — the record's own water gates whether the
 * plan-arm dose renders beside the governing one (spec §3), so both fields have a
 * user-visible consumer beyond that test file.
 *
 * This module never calls `calculateDilution` itself — the plan arm is a bare passthrough of
 * the caller-supplied `dilution` (which the caller already produced by calling it), so `.plan`
 * is the identical object reference, not a recomputed equal one.
 *
 * PHASE 2B ADDS THE SCOPE PARAMETER (spec §1, verbatim: "The portion jar's precedence
 * (jar-with-both-figures → jar) lives *inside* this one function as a scope parameter —
 * decision 2's 'one rule feeds every consumer' has one reading and one home"). `scope`
 * defaults to `'batch'`, which is everything above, unchanged — every existing caller (the
 * view model, this module's own tests) that never heard of a jar keeps reading exactly the
 * rule it always has.
 *
 * `scope: 'portion'` asks a DIFFERENT question, answered by the `jar` argument instead of
 * `gradualWaterGrams`: the batch's own water record participates NOWHERE in portion scope
 * (spec §2, verbatim — "each record leads in its own scope"), so a portion-scope call never
 * consults it, whatever a caller happens to pass. What used to be `portionGradualFor`'s own
 * math (DilutionPanel.tsx) is absorbed here instead of forked beside it — one home for the
 * jar precedence, not a second copy of it that could drift from this one. `governs` mirrors
 * the SAME contract as the batch arm, read for the jar: `'record'` iff both jar figures hold
 * a usable reading (paste > 0, water >= 0, neither a swallowed thousands separator) — that
 * predicate alone, not whether the jar's own arithmetic actually resolves. A jar heavier than
 * the batch it was drawn from still GOVERNS the screen (the plan sizing grid stands down) even
 * though there is nothing to show for it, exactly as a batch record governs with a null
 * `dilution` behind it (spec decision 8, above): "governs a scope" and "has figures to show"
 * are different questions, and `record === null` under `governs === 'record'` answers the
 * second one honestly instead of silently reporting the first.
 *
 * The extra portion-only facts a caller needs to render the jar's own alerts — did it have
 * both figures, is it heavier than the batch, which two swallowed-separator fields — travel
 * on the `jar` field of the return value, never folded into `record`: they are facts about the
 * JAR'S OWN VALIDITY, not about what the jar's arithmetic produced, and a caller that only
 * cares whether the jar governs should not have to reach through a record shape to find them.
 */
export type ResolvedDilution = {
  governs: 'plan' | 'record';
  /** Plan-arm figures: today's calculateDilution result, always computed. */
  plan: DilutionResult | null;
  /** Record-arm figures; null when the arm governs but nothing can be computed (spec
   * decision 8's null-dilution case in batch scope; a refused jar reading in portion scope —
   * see `jar` below for which). */
  record: {
    potGrams: number;
    waterGrams: number;
    finishedGrams: number;
    concentrationPercent: number;
  } | null;
  /**
   * Portion scope's own validity facts — non-null exactly when `scope: 'portion'` was
   * requested; `null` for a `scope: 'batch'` call (the default), which never asked the jar
   * question at all.
   */
  jar: {
    /** Both jar fields hold a usable figure — paste > 0, water >= 0 (zero water is the pot
     * before any water at all, Gradual's own starting record, LS:1531), neither a swallowed
     * thousands separator. This IS `governs === 'record'` for a portion-scope call — the two
     * must never be read as different questions, see the module doc above. */
    hasBothFigures: boolean;
    /** The paste weighed into the jar outweighs the whole batch's own paste — the one
     * physical refusal a maker needs telling about (a typed 4000 for 400). */
    pasteExceedsBatch: boolean;
    /** The whole-batch paste this jar is judged (and shared) against — `null` only when no
     * batch pot can be resolved at all (no `dilution`, or `weighedOrComputedPotGramsFor`
     * itself refuses). */
    batchPasteGrams: number | null;
    /** The jar's PASTE field carries a swallowed thousands separator (a typed 1,300 committed
     * as '1.300'). */
    pasteSubTenthPrecision: boolean;
    /** The jar's WATER field carries one. */
    waterSubTenthPrecision: boolean;
  } | null;
};

/**
 * Resolves which arm — plan or record — governs for a given batch, per the spec §1 rule on
 * this module's own doc comment above.
 *
 * `governs` is `'record'` iff `parseGradualWaterRecordGrams(gradualWaterGrams)` returns a
 * value (non-blank, ≥ 0 — the parser's contract, unchanged; see that function's own doc for
 * ZERO IS A RECORD and the swallowed-separator refusal).
 *
 * The record arm's pot is {@link weighedOrComputedPotGramsFor} — the weighed reading when it
 * describes a possible pot, else the recipe's own computed pot — which is target-independent
 * by design (see that function's doc for why: the record arm derives ITS OWN target from this
 * pot, so a ceiling that compared the reading against a target would close a loop). Finished
 * mass and the derived concentration then come from {@link gradualDilutionFrom}, whose
 * `concentrationPercent` is deliberately UNROUNDED and UNCLAMPED — a display-only readout, not
 * a value fit to be written back anywhere (decision 2, above).
 *
 * `record` is null whenever a record is present but nothing can be computed FROM it — no
 * `dilution` to derive `anhydrousGrams` from, or no resolvable pot at all. THE NULL-`dilution`
 * CASE IS REAL, NOT HYPOTHETICAL (spec decision 8): a recipe can carry a leftover
 * `gradualWaterGrams` beside a state where `dilution` is null — a process that doesn't offer
 * dilution, or an invalid target % — and decision 8 says records lead wherever they exist.
 * There `governs` is still `'record'` (a record's presence is judged on the record alone,
 * never on whether a plan exists to pair it with), but both `plan` and `record` come back
 * null: `weighedOrComputedPotGramsFor` refuses to name a pot with no dilution to anchor it, so
 * nothing here fabricates one. A Phase 2a caller must read `governs === 'record' && record ===
 * null` as "nothing to show yet", not as an error.
 */
export function resolveDilution(args: {
  dilution: DilutionResult | null;
  gradualWaterGrams: string;
  anhydrousGrams: number;
  wholeBatchPasteGrams: number | null;
  cookWaterGrams: number;
  measuredPasteGrams: string | undefined;
  /** 'batch' (the default) — everything above, unchanged. 'portion' asks a different
   * question, answered by `jar` below instead of `gradualWaterGrams` (see the module doc's
   * "PHASE 2B ADDS THE SCOPE PARAMETER" section). */
  scope?: 'batch' | 'portion';
  /** The jar's own two fields, as typed — Custom amount's record. Read only when
   * `scope: 'portion'`; ignored otherwise (a batch-scope call has no jar question to answer).
   * Defaults to "nothing typed" when a portion-scope caller omits it. */
  jar?: { pasteGrams: string; waterGrams: string };
}): ResolvedDilution {
  const {
    dilution,
    gradualWaterGrams,
    anhydrousGrams,
    wholeBatchPasteGrams,
    cookWaterGrams,
    measuredPasteGrams,
    scope = 'batch',
    jar,
  } = args;

  if (scope === 'portion') {
    return resolvePortionScope({
      dilution,
      jar: jar ?? { pasteGrams: '', waterGrams: '' },
      wholeBatchPasteGrams,
      cookWaterGrams,
      measuredPasteGrams,
    });
  }

  const recordWaterGrams = parseGradualWaterRecordGrams(gradualWaterGrams);
  if (recordWaterGrams === undefined) {
    return { governs: 'plan', plan: dilution, record: null, jar: null };
  }
  const governs = 'record';

  const pot = weighedOrComputedPotGramsFor(
    dilution,
    measuredPasteGrams,
    wholeBatchPasteGrams,
    cookWaterGrams,
  );
  if (pot === null) {
    return { governs, plan: dilution, record: null, jar: null };
  }

  const gradual = gradualDilutionFrom({
    pasteGrams: pot.grams,
    anhydrousGrams,
    waterAddedGrams: recordWaterGrams,
  });
  if (gradual === null) {
    return { governs, plan: dilution, record: null, jar: null };
  }

  return {
    governs,
    plan: dilution,
    record: {
      potGrams: pot.grams,
      waterGrams: recordWaterGrams,
      finishedGrams: gradual.finishedGrams,
      concentrationPercent: gradual.concentrationPercent,
    },
    jar: null,
  };
}

/**
 * Portion scope's own precedence (spec §1's scope parameter; spec §2's "jar record with both
 * figures → jar; else plan sizing"), absorbed here from what used to be DilutionPanel.tsx's
 * `portionGradualFor` so the jar precedence has exactly one home. The jar's own soap comes
 * from core's `lsPotAnhydrousShare` — the paste is homogeneous, so a weighed-out jar carries
 * its share of the batch's anhydrous soap — and asks nothing about the plan's target: an
 * earlier version borrowed the figure from `lsPartialDilution`, which also refuses whenever
 * the SAVED TARGET implies a solution lighter than the pot, so a low-water target silently
 * blanked a readout that has nothing to do with it (neither version re-derives the ratio;
 * see ls-yield's own warning).
 *
 * THE BATCH THIS JAR IS A SHARE OF is the pot the maker WEIGHED when there is one, through the
 * same shared resolution every other derived figure counts from
 * (`weighedOrComputedPotGramsFor`) — not the recipe's bare prediction, which reports a
 * concentration for a jar nobody has.
 *
 * WHAT NO CALLER MAY DO WITH `record` HERE is feed it to `onSoapConcentrationChange`. A jar
 * diluted thinner than the batch has not redefined the recipe (spec §2) — this function
 * resolves the jar's own reading, and resolving it does not license writing it back anywhere.
 */
function resolvePortionScope(args: {
  dilution: DilutionResult | null;
  jar: { pasteGrams: string; waterGrams: string };
  wholeBatchPasteGrams: number | null;
  cookWaterGrams: number;
  measuredPasteGrams: string | undefined;
}): ResolvedDilution {
  const { dilution, jar, wholeBatchPasteGrams, cookWaterGrams, measuredPasteGrams } = args;

  // '' parses to NaN, never to 0 — an empty field is "nothing typed yet", not the legitimate
  // zero-water reading. Same rule as gradualWaterNum in the batch scope.
  const pasteNum = jar.pasteGrams.trim() === '' ? NaN : Number(jar.pasteGrams);
  const waterNum = jar.waterGrams.trim() === '' ? NaN : Number(jar.waterGrams);
  const batchPasteGrams =
    weighedOrComputedPotGramsFor(dilution, measuredPasteGrams, wholeBatchPasteGrams, cookWaterGrams)
      ?.grams ?? null;
  // THE SWALLOWED SEPARATOR, on this scope's own two fields: `<input type="number">` reads a
  // typed comma as a decimal point in every locale, so 1,300 g of paste commits as '1.300' and
  // 2,000 g of water as '2.000'. Both parse to a perfectly finite, positive number, so nothing
  // downstream can see the mistake — the jar simply becomes a thousand times smaller, and any
  // dose taken from it (a % of a mass with a legal ceiling) shrinks with it. The fingerprint is
  // the same one the measured-paste field and "Amount to make (ml)" are judged by, on the same
  // reasoning: no scale weighing a jar reads finer than 0.1 g.
  const pasteSubTenthPrecision = subTenthPrecisionFingerprint(jar.pasteGrams);
  const waterSubTenthPrecision = subTenthPrecisionFingerprint(jar.waterGrams);
  const refusedByPrecision = pasteSubTenthPrecision || waterSubTenthPrecision;
  const hasBothFigures =
    !refusedByPrecision &&
    Number.isFinite(pasteNum) &&
    pasteNum > 0 &&
    Number.isFinite(waterNum) &&
    waterNum >= 0;
  // `governs` mirrors `hasBothFigures` exactly (see the module doc): a jar with both figures
  // governs the screen whether or not its own arithmetic below can resolve — "governs" and
  // "has figures to show" are different questions, same as the batch arm's null-dilution case.
  const governs = hasBothFigures ? 'record' : 'plan';
  const jarFacts = {
    hasBothFigures,
    pasteExceedsBatch: false,
    batchPasteGrams,
    pasteSubTenthPrecision,
    waterSubTenthPrecision,
  };

  if (!dilution || !hasBothFigures || batchPasteGrams === null) {
    return { governs, plan: dilution, record: null, jar: jarFacts };
  }

  const potAnhydrousGrams = lsPotAnhydrousShare({
    anhydrousGrams: dilution.anhydrousGrams,
    wholeBatchPasteGrams: batchPasteGrams,
    potPasteGrams: pasteNum,
  });
  if (potAnhydrousGrams === null) {
    return {
      governs,
      plan: dilution,
      record: null,
      // Every other null from that helper needs a positive anhydrous soap and a positive
      // batch paste, both of which a live `dilution` and a resolved `batchPasteGrams` already
      // guarantee, so the reading outweighing the batch is what is left — and it is the one a
      // maker can act on.
      jar: { ...jarFacts, pasteExceedsBatch: pasteNum > batchPasteGrams },
    };
  }

  const finishedGrams = pasteNum + waterNum;
  return {
    governs,
    plan: dilution,
    record: {
      potGrams: pasteNum,
      waterGrams: waterNum,
      finishedGrams,
      concentrationPercent: (potAnhydrousGrams / finishedGrams) * 100,
    },
    jar: jarFacts,
  };
}

