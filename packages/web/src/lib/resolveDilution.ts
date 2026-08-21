import { gradualDilutionFrom } from '@soap-calc/core';
import type { DilutionResult } from '@soap-calc/core';
import { parseGradualWaterRecordGrams, weighedOrComputedPotGramsFor } from './measuredPaste';

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
 * exposed off the view model as `dilutionGoverns` / `dilutionRecord`, consumed today by that
 * test file; wiring a record's OWN figure into the preservative dose — the companion-dose
 * work — is Phase 2b's, not yet done.
 *
 * This module never calls `calculateDilution` itself — the plan arm is a bare passthrough of
 * the caller-supplied `dilution` (which the caller already produced by calling it), so `.plan`
 * is the identical object reference, not a recomputed equal one.
 */
export type ResolvedDilution = {
  governs: 'plan' | 'record';
  /** Plan-arm figures: today's calculateDilution result, always computed. */
  plan: DilutionResult | null;
  /** Record-arm figures; null when no record is present. */
  record: {
    potGrams: number;
    waterGrams: number;
    finishedGrams: number;
    concentrationPercent: number;
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
}): ResolvedDilution {
  const {
    dilution,
    gradualWaterGrams,
    anhydrousGrams,
    wholeBatchPasteGrams,
    cookWaterGrams,
    measuredPasteGrams,
  } = args;

  const recordWaterGrams = parseGradualWaterRecordGrams(gradualWaterGrams);
  if (recordWaterGrams === undefined) {
    return { governs: 'plan', plan: dilution, record: null };
  }
  const governs = 'record';

  const pot = weighedOrComputedPotGramsFor(
    dilution,
    measuredPasteGrams,
    wholeBatchPasteGrams,
    cookWaterGrams,
  );
  if (pot === null) {
    return { governs, plan: dilution, record: null };
  }

  const gradual = gradualDilutionFrom({
    pasteGrams: pot.grams,
    anhydrousGrams,
    waterAddedGrams: recordWaterGrams,
  });
  if (gradual === null) {
    return { governs, plan: dilution, record: null };
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
  };
}

