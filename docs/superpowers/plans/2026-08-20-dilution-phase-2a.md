# Dilution Plan+Record — Phase 2a: the batch-scope atom — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three-mode dilution surface with Plan + Record in **batch scope**, remove both write-backs, cut every consumer over to the resolution rule, and convert the alert gates from mode-keyed to record-keyed — as one reviewable unit.

**Architecture:** `resolveDilution` (landed cold in phase 1) becomes the vm's source of truth: the vm exposes `governs`/`record` alongside `plan`, consumers read resolved figures, and the panel loses its mode radio, its ratio mode and both write-back effects. Portion scope keeps today's behaviour untouched — it is phase 2b.

**Tech Stack:** TypeScript, vitest, Playwright (npm workspaces).

**Spec:** `docs/superpowers/specs/2026-08-19-dilution-plan-record-design.md` — §1 (resolution rule), §2 (surface), §3 (downstream), §4 (alert conversion), §6 phase 2.

## Global Constraints

- Baseline at branch point: typecheck clean, `validate:oils` 0 errors, core 531, oils-data 101, web 1457, Playwright 91.
- **The forbidden boundary:** the resolution cutover and the write-back removal are ONE task. Never land consumers reading record-first while a write-back still writes the plan.
- Every suppression is keyed on whether the stronger alert **renders**, never on a raw flag. This codebase has paid five times for flag-keying.
- Failing tests SEEN failing, verbatim in the report; every rewrite proven RED in **both** directions.
- Retired tests are listed explicitly with the behaviour that ceased to exist — never silently deleted.
- The alert matrix is the evidence: captured before and after, changed cells must be exactly the record-semantics cells, zero same-claim doubling anywhere.
- Portion scope (`dilutionScope === 'portion'`), `lsPartialDilution`, and the jar sub-surface are OUT OF SCOPE — behaviour byte-identical.
- Probes only in the session scratchpad; never a stray `*.test.ts` under `packages/`. Do NOT push.

---

### Task 1: The view model resolves

**Files:**
- Modify: `packages/web/src/hooks/useRecipeViewModel.ts` (the `resolvedDilution` memo ~:477, the returned object ~:1017)
- Test: `packages/web/src/hooks/useRecipeViewModel.test.tsx`

**Interfaces:**
- Consumes: `resolveDilution({ dilution, gradualWaterGrams, anhydrousGrams, wholeBatchPasteGrams, cookWaterGrams, measuredPasteGrams }): ResolvedDilution` where `ResolvedDilution = { governs: 'plan'|'record'; plan: DilutionResult|null; record: { potGrams; waterGrams; finishedGrams; concentrationPercent }|null }`.
- Produces: the vm additionally exposes `dilutionGoverns: 'plan' | 'record'` and `dilutionRecord: ResolvedDilution['record']`. `dilution` KEEPS returning `resolvedDilution.plan` in this task — consumers move in Task 2. Honour the pinned contract: `governs === 'record' && record === null` means "nothing to show yet", not an error.

- [ ] **Step 1: Failing test** — assert the vm exposes both new fields, that a blank record gives `'plan'`/`null`, that `'0'` gives `'record'` with `waterGrams: 0`, and that `dilution` is still the plan object.
- [ ] **Step 2: Run to fail** — fields do not exist.
- [ ] **Step 3: Expose the two fields** from the existing memo. No other behaviour changes.
- [ ] **Step 4: Full web suite** — expect 1457 + your new tests, nothing else moved.
- [ ] **Step 5: Commit** — `feat(ls): the view model says which figure governs`

### Task 2: The atom — surface, write-backs, cutover, alerts

This is the phase's single behaviour change. It is large by design: splitting it would put consumers on record-first while a write-back still rewrites the plan, which the phase-1 stress review proved is a broken intermediate state.

**Files:**
- Modify: `packages/web/src/components/DilutionPanel.tsx` (mode radio ~:107/:370, ratio mode UI + presets, `ratioTouched` ~:392, `gradualTouched` ~:397, both write-back effects ~:684+, `suitedUses` ~:417, ceiling guard ~:2383, the results grid)
- Modify: `packages/web/src/App.tsx` (`dilutionMode`/`waterPasteRatio` session state, the mode-restore effect, `onDilutionModeChange`)
- Modify: `packages/web/src/components/BatchSheet.tsx` (verdict notes gated on plan-governs)
- Modify: `packages/web/src/hooks/useRecipeViewModel.ts` (`computeBottledSolutionGrams` record arm; `overDilutionCertain` gated)
- Test: the above files' test files

**Interfaces:**
- Consumes: Task 1's `dilutionGoverns` / `dilutionRecord`.
- Produces: a panel with no `dilutionMode` prop and no mode radio; a plan row (target % + one-shot ratio presets) and a record row; `computeBottledSolutionGrams`'s record arm = `pot + recordWater + (extras − the split-liquid mass the pot already holds)` per spec §3.

- [ ] **Step 1: Capture the BEFORE matrix.** Scratchpad probe over fixtures × record-presence × readings × liquid states × (batch scope only), recording each cell's exact alert set. Save it; the AFTER capture is compared against it cell by cell.
- [ ] **Step 2: Failing tests** for the decided behaviour: a preset click sets the % field and does not track later pot changes; a record present makes every batch figure follow it; no write-back ever alters the plan %; the ceiling and uses read the resolved %; the record-arm wording says "The batch so far is at N%…" rather than naming a target.
- [ ] **Step 3: RED.** Record verbatim.
- [ ] **Step 4: Implement**, in this order inside the one task: (a) surface — mode radio and ratio mode out, plan row + presets + record row in, plan rows labelled as plan per spec §2; (b) delete both write-back effects and their touched/not-applied/clamp machinery; (c) cut consumers to resolved figures incl. the two `Number(soapConcentrationPercent)` readers at `:417` and `:2383`; (d) convert every mode gate to a render-keyed record gate per spec §4's table; (e) delete App's mode-restore effect and the two session fields.
- [ ] **Step 5: Capture the AFTER matrix** and diff against Step 1. Every changed cell must be a record-semantics cell; any other change is a defect to fix, not to explain.
- [ ] **Step 6: Retire, don't delete silently.** List every retired test with the behaviour that ceased to exist. Rewrite the rest RED-both-directions.
- [ ] **Step 7: Full gate** — `npm test` + `npm run test:e2e -w @soap-calc/web`. The two gradual e2e specs drive the deleted mode radio: rewrite their scripts to the new surface; their claims survive.
- [ ] **Step 8: Commit** — `feat(ls): one dilution surface — a plan and a record`

### Task 3: Phase gate

**Files:** none (verification only)

- [ ] **Step 1:** Full suite + e2e, counts recorded verbatim.
- [ ] **Step 2:** Confirm by grep that `dilutionMode`, `waterPasteRatio`, `ratioTouched`, `gradualTouched` and the mode-restore effect no longer exist outside portion-scope code and tests.
- [ ] **Step 3:** Confirm portion scope is byte-identical: render one portion-scope recipe against the branch base and this HEAD, compare every figure.
- [ ] **Step 4:** Hand to review.

## Self-review notes

Spec coverage: §1 (Task 1), §2 surface + §3 downstream + §4 alerts (Task 2), §6 phase-2a boundary (the atom's single-task shape). Out of scope by design and stated: portion mirror (2b), deletions of dead plumbing (phase 3), the companion dose (2b, where the snippet copy is reworked), the recipe-aware ceiling (follow-up). Type consistency: `dilutionGoverns`/`dilutionRecord` defined in Task 1 and consumed in Task 2 under those exact names.
