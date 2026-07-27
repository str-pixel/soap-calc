# Soaping Temperature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A process-aware soaping-temperature slider after the oils panel, with CP band guidance underneath, an overflow warning, and temperature as a CP trace-speed driver.

**Architecture:** Pure core module (bands, threshold resolution, overflow constant, °C conversion); `estimateTraceSpeed` gains an optional CP-only arg; a `soaping_temp_high` insight; web stores `soapingTempF` as a string setting, clamps at read via `effectiveSoapingTempF`, renders a new panel between oils and additives, and prints the effective figure on the batch sheet.

**Tech Stack:** TypeScript, vitest, @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-07-27-soaping-temperature-design.md`

## Global Constraints

- Anonymity rule: numeric constants only; all copy original.
- Stored setting is never rewritten by process/variant switches — clamp at read only.
- Band text and the trace-speed temperature term are CP-only; overflow warning CP-gated.
- Core tests from `packages/core`, web from `packages/web`; `npx tsc --noEmit` each.
- Commits end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Core — `soaping-temperature.ts`

**Files:** Create `packages/core/src/soaping-temperature.ts` + test; add `export * from './soaping-temperature.js';` to `packages/core/src/index.ts`.

**Produces:** `SoapingTempBand { lowF, highF, effect: 'accelerated'|'average'|'slowed', note }`, `CP_SOAPING_TEMP_BANDS`, `soapingTempBand(tempF): SoapingTempBand` (total, thresholds ≥140/≥120/≥80/below), `CP_OVERFLOW_RISK_F = 160`, `fToC(tempF)` (rounded to integer °C).

- [ ] Failing tests: threshold resolution (130→average, 100→slowed, 165→accelerated, 55→slowed-most label distinct from 90's band object), `CP_OVERFLOW_RISK_F === 160`, `fToC(125) === 52`, `fToC(215) === 102`, four bands with the source ranges. Run → module-load failure. Implement with band notes as original behavior-only copy (gel likelihood qualitative). Run → pass. Commit `feat(core): CP soaping-temperature bands + overflow constant`.

### Task 2: Core — trace speed temperature term

**Files:** `packages/core/src/trace-speed.ts` + test.

- [ ] Failing tests: no-arg call result unchanged for a fixture profile (regression pin — assert exact score); `soapingTempF: 150` raises the score by 15 vs 125 and adds `'warm soaping temperature'`; `70` lowers by 20 and adds `'cool soaping temperature'`; `125` is neutral (no temp driver string). Implement: `tempBoost = >=140 ? 15 : >=120 ? 0 : >=100 ? -7 : >=80 ? -15 : -20` (undefined arg → 0), drivers pushed for warm (>=140) / cool (<100 — the −7 tier is deliberately driverless: near-neutral). Doc comment gains the calibration note (relative to CP's 120–130 average; CALLERS pass it only for CP). Commit `feat(core): soaping temperature drives trace speed (CP calibration)`.

### Task 3: Core — `soaping_temp_high` insight

**Files:** `packages/core/src/insights.ts` + test.

- [ ] Failing tests: fires at 165 under CP; silent at exactly 160; silent at 215 under HP and LS; silent when the field is absent. Implement: input field `soapingTempF?: number` (doc: EFFECTIVE clamped value, CP-relevant; HP/LS callers may pass it but the gate ignores them), block `if (input.process === 'cp' && input.soapingTempF !== undefined && input.soapingTempF > CP_OVERFLOW_RISK_F)` with original warning copy (overflow/volcano risk; bring oils and lye below 160 °F / 71 °C). Import the constant from the new module. Commit `feat(core): soaping_temp_high overflow warning (CP)`.

### Task 4: Web — setting, ranges, clamp

**Files:** `packages/web/src/lib/recipe.ts`, `packages/web/src/lib/process.ts` (defaultSettings seeds), `packages/web/src/lib/processProfile.ts` (+ its test), `packages/web/src/lib/recipe.test.ts`.

**Produces:** `RecipeSettings.soapingTempF: string`; `DEFAULT_SETTINGS.soapingTempF: '125'`; per-process seeds (cp '125', hp '140' [LTHP default mid], ls '95' [CPLS ambient-warm... see below]); `soapingTempRangeFor(variant): { minF, maxF, defaultF }`; `effectiveSoapingTempF(settings, variant): number` in processProfile (clamp of `Number(settings.soapingTempF)`, NaN → defaultF).

Range rules (from the spec): `temp === null` (cp, ls-cp) → `{60, 170, 125}` for cp; for `ls-cp` use `{60, 170, 95}` — CPLS is ambient/no-external-heat, seed below the gel-free CP line rather than CP's 125 (behavior-only choice, documented). Other variants: `{lowF − 10, ceilingF ?? highF, lowF === highF ? lowF : Math.round((lowF + highF) / 2)}`. Per-process defaultSettings seed = `soapingTempRangeFor(defaultVariantFor(process)).defaultF` as a string — hardcode the literals with a comment naming the derivation (defaults objects are literal data).

- [ ] Failing tests: normalizeSettings default + round-trip of an explicit value; `soapingTempRangeFor('hp-hthp')` → `{205, 240, 215}`; `'cp'` → `{60, 170, 125}`; `effectiveSoapingTempF` clamps 140 into HTHP's 205 floor without mutating settings; NaN/'' → default. Implement; run package tests + tsc. Commit `feat(web): soapingTempF setting, per-variant ranges, clamp-at-read`.

### Task 5: Web — view-model + batch-sheet wiring

**Files:** `packages/web/src/hooks/useRecipeViewModel.ts`, `packages/web/src/hooks/useFormulationInsights.ts`, `packages/web/src/lib/batchSheet.ts`, `packages/web/src/components/BatchSheet.tsx`, tests (`useRecipeViewModel.test.tsx`, `BatchSheet.test.tsx`).

- [ ] Failing tests (vm): CP probe at soapingTempF '165' surfaces `soaping_temp_high`; at '125' does not; HP probe at its 215 default does not; vm exposes `soapingTempF` (effective number) and batchSheetData carries it; CP trace-speed insight input receives the temp (assert via insights fixture: a slow profile at 150 °F flips the trace label vs 80 °F — or assert the driver string appears in the trace_speed insight message if it surfaces drivers; follow what the existing trace tests assert). Implement: vm computes `const soapingTempF = effectiveSoapingTempF(previewSettings, variant)` (variant from the existing profile resolution), passes to `useFormulationInsights` options (`soapingTempF`), which forwards to `analyzeFormulation` AND into `estimateTraceSpeed({ ..., soapingTempF: options.process === 'cp' ? options.soapingTempF : undefined })`; `buildBatchSheetData` input + BatchSheet prints `Soaping temperature — 52 °C (125 °F)` in the settings/dl block (near waterModeLabel). Commit `feat(web): soaping temperature through insights, trace speed, batch sheet`.

### Task 6: Web — `SoapingTemperaturePanel` + App placement

**Files:** Create `packages/web/src/components/SoapingTemperaturePanel.tsx` + test; modify `packages/web/src/App.tsx` (between RecipeOilsPanel and AdditivesPanel), `packages/web/src/index.css` if a class is missing (reuse the SuperfatWaterPanel slider classes).

Props: `{ settings, process, onChange(settings) }` — mirror how sibling panels take settings patches (check SuperfatWaterPanel's onChange contract and copy it).

- [ ] Failing tests: renders slider with `aria-label="Soaping temperature"`, min/max from the variant range; readout shows `52 °C (125 °F)`; moving the slider calls onChange with the new string; CP at 95 shows the slowed band note, at 125 the average note, at 150 the accelerated note; HP (hthp) shows the 215 °F target copy, no CP band text; CPLS shows the no-external-heat note. Implement panel (range input styled like SuperfatWaterPanel:103; band/effect line under the readout; hedge unverified variants with ≈ exactly as ProcessGuidePanel does). Wire into App at the spec position with the vm-provided settings patch handler. Run all web tests + tsc. Commit `feat(web): soaping-temperature panel after the oils section`.

### Task 7: Verification + PR

- [ ] Root `npm test`; `npm run build:web`; full e2e (`npx playwright test e2e/exploratory.spec.ts`) — the new panel shifts DOM order, so run the WHOLE suite, not a group. Add one e2e: slider present under CP with default 125 → drag to 165 → the insights list shows the overflow warning. Push; PR `feat: soaping-temperature slider with process-aware guidance`; body maps spec sections, lists pinned invariants, verification.

## Self-Review (completed)

- Spec coverage: §1→T1, §2→T2, §3→T3, §4→T4, §5→T4, §6→T6, §7→T5. Amendments (clamp-at-read T4, totality T1, CP-only calibration T2/T5, per-process seeds T4).
- Placeholders: the "follow what existing trace tests assert" instruction in T5 is a mirror-the-neighbor instruction with a named anchor, not a TBD.
- Type consistency: `soapingTempRangeFor`/`effectiveSoapingTempF` names and shapes match across T4/T5/T6; `soapingTempF` is a string in settings, number everywhere downstream.
