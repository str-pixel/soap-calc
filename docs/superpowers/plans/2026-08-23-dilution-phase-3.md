# Dilution Plan+Record — Phase 3: the deletions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the machinery phases 1–2b made dead — remaining-mode arms, the widened-ceiling apparatus, the child's dead params, one doc-bearing constant — each deletion PROVEN behaviour-preserving, plus the deferred test pin and a stale-comment sweep.

**Architecture:** Deletions only, no new behaviour. The standard for every deletion: demonstrate the deleted path cannot fire at HEAD (argument from code + a mutation or probe where the argument is composed), then delete, then show the suite and the relevant matrix cells unchanged.

**Tech Stack:** TypeScript, vitest, Playwright (npm workspaces).

**Spec:** `docs/superpowers/specs/2026-08-19-dilution-plan-record-design.md` §5 (the deletion list with its named survivors).

## Global Constraints

- Baseline at branch point: typecheck clean, oils 0 errors, core 531, oils-data 101, web 1473, Playwright 91.
- **Deletions are behaviour-preserving by proof, not assertion**: before deleting a guard/branch, show the suite green with it mutated to throw (or the equivalent unreachability argument executed), and after deleting, show identical counts minus the retirements.
- Named survivors that the sweep must NOT catch: `lsPotAnhydrousShare` (+5 tests — live caller in `resolvePortionScope`), `measuredPasteGrams`, `wholeBatchPasteGrams`, the unmeasured-pot `pasteGrams` block in ls-yield, the child's `jarGoverns` prop and its `statusClauses` gate, `parseGradualWaterRecordGrams` (the resolution rule's own gate).
- Retired tests listed with the behaviour that died; never silent.
- Probes only in the session scratchpad; do NOT push.

---

### Task 1: Core remaining-mode arms

**Files:**
- Modify: `packages/core/src/ls-yield.ts` (`measuredPasteIsRemaining` field ~:140 and its doc ~:121; `isRemaining` ~:204 and the remaining arms it gates in ~:204-258; the `:59` doc cross-reference)
- Test: `packages/core/src/ls-yield.test.ts` (~9 remaining-mode tests retired, listed)

**Interfaces:**
- Produces: `lsPartialDilution` with no remaining-mode input; the whole-batch arithmetic byte-identical (pinned by the surviving ~28 whole-batch tests). Web callers pass one fewer field — Task 2 owns those call sites; to keep this task compiling standalone, make the field's REMOVAL the breaking change and fix the web call sites' compile errors in THIS commit by dropping the argument (behaviour-preserving: every caller passed the constant `false`).

- [ ] **Step 1: Unreachability proof.** Mutate the `isRemaining` branch to `throw new Error('remaining')`; run core + web suites — everything green proves no test reaches it (record counts). Revert the mutation.
- [ ] **Step 2: Delete** the field, the gate, the remaining arms; retire the remaining-mode tests with the list in the report; fix web call-site compile errors by dropping the argument.
- [ ] **Step 3: Full gate** — core count drops by exactly the retirements; web unchanged.
- [ ] **Step 4: Commit** — `chore(core): the remaining-mode arithmetic no surface could reach`

### Task 2: Web remaining-mode + the widened-ceiling apparatus

**Files:**
- Modify: `packages/web/src/lib/measuredPaste.ts` (`MEASURED_PASTE_IS_REMAINING` :28, `exceedsRemainingCeiling` and its `isRemaining` gates, `GRADUAL_WRITE_BACK_ROUNDING` :641, `measuredCouldHaveWrittenTarget` :705, the widened branch of `correctedPotGramsFor`, the `gradualWaterGrams` params of the widening path), `packages/web/src/lib/calculateAdditives.ts` (`gradualWaterGrams` threading :199/:215/:278/:289), plus every caller passing those params: `useRecipeViewModel.ts`, `DilutionPanel.tsx`, `BatchSheet.tsx`, `App.tsx` (the companion memo passes `settings.gradualWaterGrams` to `correctedDilutionWaterGrams` — drop the arg there too)
- Test: their test files (widening/remaining describes retired, listed)

**Interfaces:**
- Produces: `correctedPotGramsFor`/`correctedDilutionWaterGrams`/`computeBottledSolutionGrams` without `gradualWaterGrams`/`isRemaining` parameters; the unwidened ceiling everywhere on the plan path; `parseGradualWaterRecordGrams` SURVIVES (the resolution rule's gate).

- [ ] **Step 1: The composed unreachability proof for the widening.** The argument: widening requires a parseable record (`measuredCouldHaveWrittenTarget` returns false on blank/refused), but a parseable record makes the record govern, and no record-governed path consults the widened ceiling. EXECUTE it: mutate `measuredCouldHaveWrittenTarget` to `throw`; run the full web suite + the phase-gate matrix probes — green everywhere proves it. Record counts; revert.
- [ ] **Step 2: Same proof for `exceedsRemainingCeiling`** (already documented "no surface renders it"; throw-mutate its assignment, run, record, revert).
- [ ] **Step 3: Delete** all of it; retire the widening/remaining tests with the list; every caller loses the dropped params in this commit.
- [ ] **Step 4: Matrix spot-check**: the plan-water row cells where widening once fired (plan-governed, measured reading, record blank) — byte-identical before/after (probe at branch base vs HEAD).
- [ ] **Step 5: Full gate.** **Step 6: Commit** — `chore(ls): the widened ceiling died with the write-back that justified it`

### Task 3: Child params, the constant, the deferred pin, the comment sweep

**Files:**
- Modify: `packages/web/src/components/PortionDilutionResults.tsx` (`dilutionMode` :54/:105, `ratioNotAppliedYet` :57, `dilutionTargetWording`'s ratio arm), `packages/core/src/ls-dilution-targets.ts` (`LS_SHAMPOO_NOT_RECOMMENDED` :110 → rationale moves into a comment on `LS_DILUTION_TARGETS`)
- Test: `packages/web/src/hooks/useRecipeViewModel.test.tsx` (the deferred T2 pin), affected component tests

**Interfaces:**
- Produces: the child without its dead ratio-era params (`jarGoverns` and its gate SURVIVE); the shampoo rationale as a comment; the deferred pin: a record present beside `dilution: null`-adjacent state where `gradualDilutionFrom` rejects (e.g. non-positive pot) → the additive `'solution'` basis falls to the plan figure — test it through the vm.

- [ ] **Step 1:** Throw-mutate the child's `dilutionMode`-consuming arm; suite green proves dead; revert. **Step 2:** Delete params + arm; move the shampoo rationale (comment carries the "deliberate absence of a shampoo row" reasoning + the hair sentence's location). **Step 3:** The deferred pin, RED-checked by mutating the fallback. **Step 4: Comment sweep**: grep the four files this phase touches for sentences describing deleted machinery (write-back, widening, remaining, ratio mode); fix in the file's register; list each in the report. **Step 5: Full gate.** **Step 6: Commit** — `chore(ls): the dead params go, the rationale stays, the fallback gets its pin`

### Task 4: Phase gate

- [ ] Full suite + e2e, counts verbatim; grep sweep confirming zero references to every deleted symbol (list them); the surviving-symbols list confirmed live (each has a caller); tree clean. Report; commit nothing.

## Self-review notes

Spec §5 coverage: core arms (T1), web machinery (T2), child params + constant (T3), survivors protected by the Global Constraints list. The deferred T2-of-2b pin lands in T3. Type consistency: parameter removals cascade within their own tasks so every commit compiles. Each deletion's proof precedes it.
