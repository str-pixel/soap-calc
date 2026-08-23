# Dilution Plan+Record — Phase 2b: the record's remaining consumers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the three record consumers 2a deferred with rulings — the mid-pour companion dose (safety first), additive solution-basis record-arm dosing, and the portion mirror — plus the carried plausibility note.

**Architecture:** The vm's `dilutionGoverns`/`dilutionRecord` (exposed in 2a, consumed only by tests) gain their production consumers. `resolveDilution` grows the scope parameter spec §1 requires, absorbing the jar precedence that today lives in `portionGradualFor`'s caller side. Batch-scope behaviour from 2a is already decided and must not move except where a task's list names it.

**Tech Stack:** TypeScript, vitest, Playwright (npm workspaces).

**Spec:** `docs/superpowers/specs/2026-08-19-dilution-plan-record-design.md` — §1 (scope parameter), §2 (portion mirror, jar echo copy), §3 (companion dose — the "Mid-pour companion dose (decided)" block; additive solution dosing, decision 7), §4 (record-arm wording).

## Global Constraints

- Baseline at branch point: typecheck clean, `validate:oils` 0 errors, core 531, oils-data 101, web 1453, Playwright 91.
- Every suppression render-keyed, never flag-keyed. Failing tests SEEN first, verbatim; rewrites RED both directions; retirements listed, never silent.
- Batch-scope cells from 2a's matrix are settled: any batch-scope change outside a task's own list is a defect.
- The portion matrix MUST carry the `pasteExceedsBatch` jar state as an axis — the cell both 2a matrices missed.
- Probes only in the session scratchpad; never a stray `*.test.ts` under `packages/`. Do NOT push.

---

### Task 1: The mid-pour companion dose

**Files:**
- Modify: `packages/web/src/components/PreservativeSnippet.tsx`, `packages/web/src/App.tsx` (the `preservativeBasis` memo ~:331 and the snippet's props ~:729)
- Test: `packages/web/src/components/PreservativeSnippet.test.tsx`, `packages/web/src/App.test.tsx`

**Interfaces:**
- Consumes: `vm.dilutionGoverns`, `vm.dilutionRecord` (2a's fields — their first production consumers), `vm.preservativeDosingBasisGrams` (the record-governed basis when a record governs), `preservativeDoseGrams(basis, pct)` from core.
- Produces: the snippet gains `planDosingBasisGrams?: number | null` — the PLAN arm's preservative-free basis, non-null exactly when App determines the companion should show: batch scope, record governs, `dilutionRecord.waterGrams` strictly below the plan's `dilution.dilutionWaterGrams`. The snippet renders, beside the governing dose, one plan-labelled line: `at your {plan%} plan: {X} g` where X = `preservativeDoseGrams(planDosingBasisGrams, pct)` formatted like the main dose. It disappears when the prop is null. Spec §3's block is the contract — copy verbatim from it: the figure is "computed by the same w/w formula against the plan's dosing basis".

- [ ] **Step 1: Failing tests.** Snippet-level: with `planDosingBasisGrams={4000}` and a governing dose from a 2,600 g record basis at 1%, both figures render, each labelled (`26.3 g` governing, `at your … plan: 40.4 g` companion — exact figures from the props you construct); with the prop null, no companion text renders (assert by its distinctive text). App-level: an LS recipe with a 0 g record shows the companion; typing record water up to ≥ the plan's dilution water makes it disappear.
- [ ] **Step 2: RED, verbatim.**
- [ ] **Step 3: Implement.** App computes the plan basis from the PLAN arm (`dilution.solutionGrams`-derived dosing basis — reuse `preservativeDosingBasisGramsFor(null-bottled → plan solution)`? NO: read what the vm exposes and derive minimally; the plan basis must EXCLUDE record figures by construction). The comparison `record.waterGrams < dilution.dilutionWaterGrams` is the spec's "while its water is below the plan's dilution water". Wire the prop; render the companion with a plan label consistent with the panel's plan-labelling idiom.
- [ ] **Step 4: Full web suite + the dose e2e specs.**
- [ ] **Step 5: Commit** — `feat(ls): the dose for the batch that exists, beside the dose for the plan`

### Task 2: Additive solution dosing follows the record

**Files:**
- Modify: `packages/web/src/hooks/useRecipeViewModel.ts` (~:448 `solutionGrams`)
- Test: `packages/web/src/hooks/useRecipeViewModel.test.tsx`, `packages/web/src/lib/calculateAdditives.test.ts` if its fixtures reach this

**Interfaces:**
- Consumes: `resolvedDilution` (already in scope at that line).
- Produces: the `'solution'` dose basis = record arm → `dilutionRecord.potGrams + dilutionRecord.waterGrams` (extras excluded, preservative excluded — spec §3's additive rule verbatim); plan arm → `dilution.solutionGrams` (today's value, unchanged). Flows into `extrasGrams` → batch weight → pricing exactly as today.

- [ ] **Step 1: Failing test** — a solution-dosed additive (e.g. fragrance 2%) on a record-governed batch doses `2% × (pot + water)`, not `2% × plan solution`; plan-governed unchanged (control).
- [ ] **Step 2: RED.** **Step 3: Implement** (a few lines; the ruling's comment explains why extras stay excluded — the circular double-count `calculateAdditives.ts` documents). **Step 4: Full suite — expect pricing/batch-weight pins to move ONLY in record-governed fixtures; every moved figure explained by the basis delta.** **Step 5: Commit** — `fix(ls): an additive doses the solution that exists`

### Task 3: The portion mirror

**Files:**
- Modify: `packages/web/src/lib/resolveDilution.ts` (the scope parameter), `packages/web/src/components/DilutionPanel.tsx` (portion block, jar echo ~:1698), `packages/web/src/components/PortionDilutionResults.tsx`, `packages/web/src/App.tsx` (`preservativeBasis` reads the resolved answer), `packages/web/src/components/BatchSheet.tsx` only if its portion copy references the echo
- Test: their test files

**Interfaces:**
- Consumes: everything above.
- Produces: `resolveDilution` gains `jar?: { pasteGrams: string; waterGrams: string }` input and returns, when scope figures are requested, the jar precedence verdict (jar-with-both-figures → jar arm; else plan sizing) — the one function is the only home of that precedence (spec §1). `portionGradualFor` becomes a consumer of it or is absorbed; App's `preservativeBasis` reads the returned verdict instead of calling `portionGradualFor` itself. The jar echo copy is replaced: the plan % is named as *the plan* (no "saved target … unchanged" reassurance; spec §2). Portion ceiling/uses read the jar's resolved % with §4's record-arm wording when the jar governs. Plan-labelling: the portion plan grid keeps its label; DECIDED HERE (carried item): `Total water` and `Glycerin (retained)` stay unlabelled — they are recipe-level facts no arm disputes; record it as the resolution of task-2a report item 4.

- [ ] **Step 1: Capture the BEFORE portion matrix** — fixtures × jar states **{noJar, halfJar, fullJar, pasteExceedsBatch}** × batch-record states × readings, exact alert/hint sets per cell.
- [ ] **Step 2: Failing tests** for: jar precedence inside `resolveDilution` (unit); the echo's new copy; portion ceiling reading the jar's % (a jar at 200 g paste + 20 g water fires the batch-so-far wording at 41.96%); the `pasteExceedsBatch` cell keeps its 2a behaviour (no dose, refusal shown).
- [ ] **Step 3: RED.** **Step 4: Implement.** **Step 5: AFTER matrix; changed cells must be exactly the task's list (echo copy, ceiling/uses cells); the `pasteExceedsBatch` axis proves the missed cell.** **Step 6: Full gate.** **Step 7: Commit** — `feat(ls): the jar precedence lives in the one rule, and the plan is named as the plan`

### Task 4: The plausibility note

**Files:**
- Modify: `packages/web/src/components/DilutionPanel.tsx` (a non-alert hint beside the record readout)
- Test: `packages/web/src/components/DilutionPanel.test.tsx`

**Interfaces:** a target-independent bound (carried from PR #167 triage): when the pot basis is a WEIGHED reading exceeding the recipe's computed pot by more than 2× (recommended threshold; a comment marks it tunable), render a non-alert hint: "That reading is more than twice the paste this recipe makes — check the scale was tared." No figure changes; the record arm stays target-independent; the hint is suppressed when any refusal alert already renders (render-keyed).

- [ ] Failing test (2.1× reading → hint; 1.9× → none; belowSolids refusal present → no hint) → RED → implement → full suite → Commit: `feat(ls): a reading twice the recipe's paste earns a question, not a verdict`

### Task 5: Phase gate

- [ ] Full suite + e2e, counts verbatim. Batch-scope 2a matrix cells re-captured: byte-identical except Task 1's companion (snippet-only) and Task 2's dose figures in record-governed cells. Portion matrix: only Task 3's cells. Report; commit nothing.

## Self-review notes

Spec coverage: §3 companion (T1, copy from the spec's decided block), decision 7 additives (T2), §1 scope parameter + §2 mirror/echo + §4 portion wording (T3), carried plausibility item (T4). Carried-item resolutions recorded: Total water/Glycerin unlabelled (T3), pasteExceedsBatch axis (T3/T5). Type consistency: `planDosingBasisGrams` (T1), `jar` param (T3) defined once each. Batch-scope protection is a global constraint plus T5's re-capture.
