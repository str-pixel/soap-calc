# Dilution Plan+Record — Phase 1: Foundations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the preservative w/w correction, the dosing/display figure split, and the
resolution function — everything Phase 2's atom depends on — with the only visible deltas
being the enumerated dose-driven ones.

**Architecture:** Core gets the w/w formula and the `>= 100` tier guard. The single
`finishedProductGramsFor` figure splits into a preservative-free **dosing basis** and an
inclusive **finished product**; App computes the dose once and hands it down. A new
`resolveDilution` function implements the spec's record-else-plan rule fully and is
unit-tested, but consumers read only its plan arm — byte-identical behaviour until Phase
2a flips the arm.

**Tech Stack:** TypeScript, vitest, Playwright (existing npm-workspaces setup).

**Spec:** `docs/superpowers/specs/2026-08-19-dilution-plan-record-design.md` — argue from
it; every task implements a named spec clause.

## Global Constraints

- Baseline at branch point (verify before Task 1): typecheck clean, `validate:oils` 0
  errors, core 530, oils-data 101, web 1440, Playwright 91.
- Every failing test is SEEN failing; output recorded verbatim in the task report.
- No test deleted; rewrites RED both directions (old assertion fails on new code, new
  assertion fails on old code).
- Probes only in the session scratchpad; never a `*.test.ts` under `packages/` outside
  the real test files.
- Do NOT push. One commit per task, messages as given.
- Phase 1's ONLY intended visible deltas (spec §6): dose grams (w/w), ≈ Finished product
  row and sheet finished figure (now inclusive), `lsFinishedVolumeMl`, bottled-row
  visibility. Anything else changing is a defect.

---

### Task 1: Core w/w dose + tier boundary

**Files:**
- Modify: `packages/core/src/ls-preservatives.ts` (`preservativeDoseGrams` ~:224-228; `lsPreservativeDoseTier` ~:211-220 — verify at HEAD)
- Test: `packages/core/src/ls-preservatives.test.ts` (~:104-118 pins 10 / 20)

**Interfaces:**
- Produces: `preservativeDoseGrams(basisGrams: number, pct: number): number` — the first
  parameter is now the preservative-FREE dosing basis; returns
  `basisGrams × pct / (100 − pct)`. Returns 0 for non-finite/≤0 inputs and for
  `pct >= 100`. `lsPreservativeDoseTier`: `'impossible'` at `pct >= 100`.

- [ ] **Step 1: Write the failing tests** (extend the existing describe; do not delete the old ones — rewrite them):

```ts
// w/w: the typed % is true of the finished product INCLUDING the dose (spec §3, decision 5)
expect(preservativeDoseGrams(1000, 1)).toBeCloseTo(10.10101, 4);   // was 10
expect(preservativeDoseGrams(4000, 0.5)).toBeCloseTo(20.10050, 4); // was 20
// algebraic identity: dose = pct% of (basis + dose), exactly
const dose = preservativeDoseGrams(2400, 0.5);
expect(dose / (2400 + dose)).toBeCloseTo(0.005, 10);
// the formula diverges at 100 — refuse, do not explode (spec §3)
expect(preservativeDoseGrams(1000, 100)).toBe(0);
expect(preservativeDoseGrams(1000, 150)).toBe(0);
expect(lsPreservativeDoseTier(100)).toBe('impossible');   // was 'unrated' at exactly 100
expect(lsPreservativeDoseTier(99.9)).toBe('unrated');
```

- [ ] **Step 2: Run to verify the new assertions fail** — `cd packages/core && npx vitest run src/ls-preservatives.test.ts`. Expected: the w/w figures fail with 10 / 20 received; tier at exactly 100 fails with 'unrated'.
- [ ] **Step 3: Implement:**

```ts
export function preservativeDoseGrams(basisGrams: number, pct: number): number {
  if (!Number.isFinite(basisGrams) || basisGrams <= 0) return 0;
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return 0;
  return (basisGrams * pct) / (100 - pct);
}
```

and in `lsPreservativeDoseTier`, change `if (pct > 100)` to `if (pct >= 100)`. Update
both doc comments: the dose doc now says "% w/w of the finished product *including the
preservative*; the parameter is the preservative-free dosing basis" and cites spec §3;
the tier doc's ORDER-MATTERS paragraph gains "at exactly 100 the w/w formula divides by
zero — 100 is not a dose either."

- [ ] **Step 4: Run core suite** — `npm run test -w @soap-calc/core`. Expected: all pass (530 + new − rewritten deltas; record the exact number).
- [ ] **Step 5: Commit** — `fix(ls): the typed percent is true of the bottle, not almost true`

### Task 2: The figure split in calculateAdditives

**Files:**
- Modify: `packages/web/src/lib/calculateAdditives.ts` (`finishedProductGramsFor` ~:289-294 — verify at HEAD)
- Test: `packages/web/src/lib/calculateAdditives.test.ts`

**Interfaces:**
- Produces: `preservativeDosingBasisGramsFor(bottledSolutionGrams, dilution)` — the
  renamed current function, body unchanged (`bottled ?? solution ?? null`), preservative-
  free by construction. New `finishedProductGramsFor(dosingBasisGrams: number | null,
  preservativeDoseGrams: number): number | null` — `basis === null ? null : basis + dose`.
  Later tasks and Phase 2 rely on these exact names (spec §3).

- [ ] **Step 1: Failing tests:**

```ts
expect(preservativeDosingBasisGramsFor(2500, { solutionGrams: 2400 })).toBe(2500);
expect(preservativeDosingBasisGramsFor(null, { solutionGrams: 2400 })).toBe(2400);
expect(finishedProductGramsFor(2400, 12.06)).toBeCloseTo(2412.06, 2);
expect(finishedProductGramsFor(null, 12.06)).toBeNull();
expect(finishedProductGramsFor(2400, 0)).toBe(2400); // no preservative → identical figures
```

- [ ] **Step 2: Run to fail** — `preservativeDosingBasisGramsFor` not exported; new-signature `finishedProductGramsFor` type-errors.
- [ ] **Step 3: Implement** — rename the existing function (keep its full doc comment, retitled "the preservative-free dosing basis"; move the DOUBLE-COUNT WARNING with it — it is about the basis). Add:

```ts
/** The finished, ready-for-use mass INCLUDING the preservative (spec §3): what the
 * bottle weighs and what the volume row converts. Equals the dosing basis exactly when
 * no preservative is dosed, so recipes without one see no change. */
export function finishedProductGramsFor(
  dosingBasisGrams: number | null,
  preservativeDoseGrams: number,
): number | null {
  if (dosingBasisGrams === null) return null;
  return dosingBasisGrams + Math.max(0, preservativeDoseGrams);
}
```

Fix all compile-error call sites in THIS commit by switching them to
`preservativeDosingBasisGramsFor` verbatim (behaviour-preserving; the inclusive wiring is
Task 3's job): `useRecipeViewModel.ts:11` import + its `finishedProductGrams` memo,
`DilutionPanel.tsx:12,1187`, `BatchSheet.tsx:23,175`.

- [ ] **Step 4: Full web suite** — `npm run test -w @soap-calc/web`. Expected: 1440 pass (pure rename so far).
- [ ] **Step 5: Commit** — `refactor(ls): the dose's basis and the bottle's mass get their own names`

### Task 3: Wire the inclusive figure through App, panel, sheet

**Files:**
- Modify: `packages/web/src/hooks/useRecipeViewModel.ts` (~:115-116 field docs, the memo computing `finishedProductGrams`), `packages/web/src/App.tsx` (~:382-428 `preservativeBasis`; panel/sheet props ~:674-732), `packages/web/src/components/DilutionPanel.tsx` (~:1187 row + volume), `packages/web/src/components/BatchSheet.tsx` (~:175 + volume), `packages/web/src/components/PreservativeSnippet.tsx` (dose math — verify its internal computation at HEAD; it must consume the basis and the core w/w function only)
- Test: `packages/web/src/App.test.tsx` (~:280-294 — the finished≈solution equality and dose≈1%×base pins), component tests as affected

**Interfaces:**
- Consumes: Task 1's `preservativeDoseGrams(basis, pct)`, Task 2's two functions.
- Produces: vm exposes `preservativeDosingBasisGrams: number | null` (the old
  `finishedProductGrams` value) AND `finishedProductGrams: number | null` (inclusive).
  App computes `preservativeDoseGramsValue: number` once (0 when no preservative is
  selected — read the snippet's own predicate at HEAD and reuse it exactly; do not invent
  a second one) and passes it to DilutionPanel and BatchSheet as a new prop
  `preservativeDoseGrams: number` (default 0). Both components render
  `finishedProductGramsFor(basis, preservativeDoseGrams)` in the ≈ Finished product row
  and feed it to `lsFinishedVolumeMl`. The snippet's dose base is
  `preservativeDosingBasisGrams` (batch scope) — the basis, never the inclusive figure.

- [ ] **Step 1: RED both directions.** Write the new App.test assertions and see them fail on old code:

```ts
// the bottle now weighs basis + dose, and the typed % is true of it (spec §3)
const dose = /* read from the snippet's rendered dose figure */;
expect(finished).toBeCloseTo(base + dose, 1);           // fails today: finished === base
expect(dose / finished).toBeCloseTo(0.01, 4);           // exact w/w, fails today (0.0099)
```

Then confirm the OLD assertions (`expect(base).toBeCloseTo(solution, 0)` at ~:292 and
`dose ≈ base × 0.01` at ~:293) fail against the NEW wiring before rewriting them —
record both outputs.

- [ ] **Step 2: Implement the wiring** as in Interfaces. In the vm, `finishedProductGrams` becomes `finishedProductGramsFor(preservativeDosingBasisGrams, doseGrams)` where `doseGrams` is computed with Task 1's function from `previewSettings.preservativeDosePct` under the snippet's own selected-preservative predicate (verified at HEAD, cited in a comment). App's `preservativeBasis` (:383) switches to `vm.preservativeDosingBasisGrams`.
- [ ] **Step 3: Sweep the other pinned figures** — run the full web suite; every failure must be one of the enumerated deltas (dose grams, finished row, volume, bottled-row visibility). Rewrite each with RED-both-directions discipline. A failure outside the enumerated set is a stop-and-report defect, not a test to update.
- [ ] **Step 4: Full gate** — `npm test` and `npm run test:e2e -w @soap-calc/web`. The e2e `finished×0.01` comparison must pass against the inclusive figure (spec §7 says it holds exactly); if any e2e touches the old figure, fix the spec expectation file only with the new arithmetic shown in the diff.
- [ ] **Step 5: Commit** — `fix(ls): the bottle includes the preservative it was promised`

### Task 4: The resolution function (plan-arm wiring, both arms implemented)

**Files:**
- Create: `packages/web/src/lib/resolveDilution.ts`
- Test: `packages/web/src/lib/resolveDilution.test.ts`
- Modify: `packages/web/src/hooks/useRecipeViewModel.ts` (the `dilution` memo ~:339-367)

**Interfaces:**
- Consumes: `calculateDilution`, `gradualDilutionFrom` (core), `parseGradualWaterRecordGrams`, `weighedOrComputedPotGramsFor` (measuredPaste.ts).
- Produces (spec §1, exact):

```ts
export type ResolvedDilution = {
  governs: 'plan' | 'record';
  /** Plan-arm figures: today's calculateDilution result, always computed. */
  plan: DilutionResult | null;
  /** Record-arm figures; null when no record is present. */
  record: {
    potGrams: number;          // weighedOrComputedPotGramsFor
    waterGrams: number;        // parsed record, >= 0 — ZERO IS A RECORD (spec §1)
    finishedGrams: number;     // pot + water
    concentrationPercent: number; // 100·anhydrous/finished, unclamped, display-only
  } | null;
};
export function resolveDilution(args: {
  dilution: DilutionResult | null;
  gradualWaterGrams: string;
  anhydrousGrams: number;
  wholeBatchPasteGrams: number;
  cookWaterGrams: number;
  measuredPasteGrams: string;
}): ResolvedDilution;
```

`governs` is `'record'` iff `parseGradualWaterRecordGrams(gradualWaterGrams) !== null`
(non-blank, ≥ 0 — the parser's contract, unchanged). **Phase 1 consumers read only
`.plan`** — the vm's exposed `dilution` becomes `resolveDilution({...}).plan`, which is
the identical object; Phase 2a flips which arm feeds consumers. Do not wire `governs` or
`.record` to anything user-visible in this phase.

- [ ] **Step 1: Failing unit tests** (file does not exist → all fail):

```ts
// plan arm: identity with calculateDilution
const plan = calculateDilution({ anhydrousGrams: 1200, cookWaterGrams: 1400, kohGrams: 240, naohGrams: 0, soapConcentrationPercent: 30, kohPurityPercent: 90, naohPurityPercent: 97, superfatPercent: 0 });
expect(resolveDilution({ dilution: plan, gradualWaterGrams: '', anhydrousGrams: 1200, wholeBatchPasteGrams: 2600, cookWaterGrams: 1400, measuredPasteGrams: '' }).governs).toBe('plan');
expect(resolveDilution({ ...same, gradualWaterGrams: '' }).plan).toBe(plan);
// zero is a record (spec §1)
const r0 = resolveDilution({ ...same, gradualWaterGrams: '0' });
expect(r0.governs).toBe('record');
expect(r0.record).toEqual({ potGrams: 2600, waterGrams: 0, finishedGrams: 2600, concentrationPercent: expect.closeTo(46.1538, 3) });
// a real pour
const r = resolveDilution({ ...same, gradualWaterGrams: '1400' });
expect(r.record!.finishedGrams).toBe(4000);
expect(r.record!.concentrationPercent).toBeCloseTo(30, 6);
// a weighed pot corrects the record arm, target-independently
const rw = resolveDilution({ ...same, gradualWaterGrams: '1400', measuredPasteGrams: '2500' });
expect(rw.record!.potGrams).toBe(2500);
// blank is NOT a record; separators are refused by the parser
expect(resolveDilution({ ...same, gradualWaterGrams: ' ' }).governs).toBe('plan');
```

- [ ] **Step 2: Run to fail** — module not found.
- [ ] **Step 3: Implement** per the Interfaces block; the doc comment states the spec-§1 rule verbatim, including ZERO IS A RECORD and the no-write-back principle, citing the spec path.
- [ ] **Step 4: Wire the vm** — the `dilution` memo body wraps its current `calculateDilution` call: compute `resolved`, expose `resolved.plan` as `dilution` (byte-identical output; keep the memo deps exact). Full web suite must stay at Task 3's count with only the new file's tests added.
- [ ] **Step 5: Commit** — `feat(ls): one rule knows whether the plan or the record governs`

### Task 5: Phase gate

**Files:** none (verification only; report in the task report)

- [ ] **Step 1:** `npm test` — record all counts. Expected: core/oils-data unchanged except Task 1's deltas; web = 1440 + net new.
- [ ] **Step 2:** `npm run test:e2e -w @soap-calc/web` — 91 expected; any dose-figure drift must match the w/w arithmetic exactly.
- [ ] **Step 3:** Enumerated-delta audit: render (via existing tests or a scratchpad probe) one LS recipe with a preservative and one without. Without: every figure byte-identical to base. With: exactly the four enumerated deltas. Record the comparison.
- [ ] **Step 4:** Commit nothing; hand the branch to review.

## Self-review notes

Spec coverage: §3 preservative (Tasks 1–3), §1 resolution rule + zero-record (Task 4),
§6 phase-1 deltas (Task 3 step 3, Task 5 step 3), §7 pinned-gram updates (Tasks 1, 3).
Companion dose, alert conversion, surface changes, deletions: Phase 2/3 plans, not here.
Type consistency: `preservativeDosingBasisGramsFor`/`finishedProductGramsFor` names match
across Tasks 2–4; `resolveDilution`/`ResolvedDilution` defined once. No TBDs; the two
verify-at-HEAD points (snippet predicate, exact line numbers) are verification
instructions with defined outcomes, not placeholders.
