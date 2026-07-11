# LS Dilution Calculator (+ solution dose basis) — Design

**Date:** 2026-07-11
**Status:** Approved (brainstorm). Lightweight TDD execution to follow.
**Origin:** Multi-process roadmap Phase 1 — the #1 liquid-soap feature. Turns the concentrated LS paste (from the existing lye engine) into a target-concentration finished solution, and unlocks the additive `'solution'` dose basis deferred in Phase 0.4.

## Goal

For **Liquid Soap**, compute how much **dilution water** to add to the cooked paste to reach a target **soap concentration**, plus the resulting solution weight and retained glycerin. Surface it in an LS-only Dilution panel and the printed batch sheet. Additionally, let additives dose against the finished **solution** weight (the `'solution'` dose basis). CP and HP are untouched.

## Decisions (settled in brainstorm)

- **Soap concentration is a persisted recipe setting** — `soapConcentrationPercent` on `RecipeSettings` (defines the finished product, so it travels with the recipe), like `superfatPercent` / `postCookSuperfatPercent`.
- **The `'solution'` dose basis is bundled in** (not deferred) now that a solution weight exists.
- **Glycerin is informational only.** The roadmap fixes `anhydrous = oils + lye` (glycerin excluded from the concentration denominator) — the standard simplified model. Glycerin is shown as a retained-humectant readout.
- **Dilution is a read-only derived view** (like additives / PCSF): no `calculateLye` / core-lye change; it never feeds back into the paste's batch weight.
- **Default concentration `'30'`** (mid of the roadmap's 25–35% blend range).

## Model & calc

### Core `packages/core/src/dilution.ts` (pure)

```ts
export type DilutionInput = {
  anhydrousGrams: number;        // oils + lye (water-free soap solids)
  cookWaterGrams: number;        // water already in the paste (the lye water)
  kohGrams: number;
  naohGrams: number;
  soapConcentrationPercent: number;
};
export type DilutionResult = {
  anhydrousGrams: number;
  solutionGrams: number;         // total finished diluted weight
  totalWaterGrams: number;       // water in the finished solution
  dilutionWaterGrams: number;    // water to ADD (>= 0)
  glycerinGrams: number;         // informational
  soapConcentrationPercent: number;
  targetExceedsPaste: boolean;   // paste already more dilute than target → dilutionWater clamped to 0
};
export function calculateDilution(input: DilutionInput): DilutionResult | null;
```

- `soapFrac = soapConcentrationPercent / 100`.
- Return **null** when `anhydrousGrams <= 0` or `soapConcentrationPercent` is outside `(0, 100)`.
- `solutionGrams = anhydrousGrams / soapFrac`.
- `totalWaterGrams = solutionGrams − anhydrousGrams`.
- `dilutionWaterGrams = max(0, totalWaterGrams − cookWaterGrams)`.
- `targetExceedsPaste = totalWaterGrams < cookWaterGrams` (the paste is already more dilute than the target; adding water can't concentrate it — clamp `dilutionWater` to 0 and let the UI warn).
- `glycerinGrams = 0.55 * kohGrams + 0.77 * naohGrams` (Confirmed constants, roadmap §Liquid soap).

### View-model (`useRecipeViewModel.ts`)

- `result` is **nullable** in the VM (empty/errored recipe) — the memo must guard it before dereferencing, exactly as the `batchSheetData` memo does (`!result → null`). Inside the guard, derive the dilution inputs from the lye **result** (coherent set — all fields come from the same computed result): `anhydrousGrams = result.totalOilWeightGrams + result.lyeWeightGrams`, `cookWaterGrams = result.waterWeightGrams`, `kohGrams = result.kohWeightGrams`, `naohGrams = result.naohWeightGrams`.
- `const dilution = useMemo(() => (process === 'ls' && result) ? calculateDilution({ anhydrousGrams: result.totalOilWeightGrams + result.lyeWeightGrams, cookWaterGrams: result.waterWeightGrams, kohGrams: result.kohWeightGrams, naohGrams: result.naohWeightGrams, soapConcentrationPercent: Number(previewSettings.soapConcentrationPercent) }) : null, [process, result, previewSettings.soapConcentrationPercent])` — **LS-gated + result-guarded** (mirrors the `postCookSuperfat` gating), memoized so the reference stays stable for the `batchSheetData` memo.
- Expose `dilution` on the view model.
- `solutionGrams = dilution?.solutionGrams ?? 0`, threaded into `computeRecipeAdditives(additives, { oilGrams, batchGrams, solutionGrams })`.

## The `'solution'` dose basis (4 binary ternaries → 3-way)

`DoseBasis` becomes `'oil' | 'batch' | 'solution'`. Each of these four sites is currently a binary `basis === 'batch' ? … : oil` and must become 3-way — a missed one silently treats `solution` as `oil`:

1. `packages/core/src/additives.ts` — `DoseBasis` type gains `'solution'`.
2. `packages/web/src/lib/calculateAdditives.ts:28` — `basisWeight = basis === 'batch' ? batchGrams : basis === 'solution' ? solutionGrams : oilGrams`. `computeRecipeAdditives`'s weights param gains `solutionGrams`. A solution-basis line is skipped when `solutionGrams <= 0` (non-LS, or dilution null) via the existing `if (basisWeight <= 0) continue`.
3. `packages/web/src/lib/formatDose.ts:6` — `basisWord = basis === 'batch' ? 'batch' : basis === 'solution' ? 'solution' : 'oil'` → "1% of solution".
4. `packages/web/src/lib/recipe.ts:144` (`normalizeAdditiveLine`) and `packages/web/src/lib/recipeFile.ts:99` (`parseAdditiveLine`) — validate `basis` to a 3-way, defaulting unknowns to `'oil'`.

### Dose-mode select — new process-gating + mismatched guard

Today `AdditivesPanel` maps a flat 4-entry `DOSE_MODES` with **no process-gating and no guard**. Add:
- Two solution entries to `DOSE_MODES` (`solution-percent` → "% of solution", `solution-ppt` → "ppt of solution").
- `offeredDoseModesForProcess(process)` — LS gets all six; CP/HP get the four non-solution modes.
- A mismatched-option guard mirroring the stage select (`AdditivesPanel.tsx:157-159`): if the line's current `${basis}-${unit}` isn't in the offered set (e.g. a stray `solution` line viewed under CP after import), append it so the controlled `<select>` always has its option.

## DilutionPanel (LS-only)

`packages/web/src/components/DilutionPanel.tsx`, rendered in App as `{process === 'ls' && <DilutionPanel …/>}` (ad-hoc gate — the `panels` array is still unused infra). Props: `dilution: DilutionResult | null`, `soapConcentrationPercent: string`, `onSoapConcentrationChange: (v: string) => void`, `weightUnit`. Reads out: paste/anhydrous weight, the editable soap-concentration % (a numeric field), solution weight, total water, **dilution water to add**, glycerin, and the target-exceeds-paste warning. A hint notes typical concentrations (coconut ≤40 / castile ~25 / blends 25–35). App wires `onSoapConcentrationChange` to `setSettings`.

## Batch sheet

Thread `dilution` through the same path `postCookSuperfat` uses: add `dilution: DilutionResult | null` to `BatchSheetData` and `buildBatchSheetData`'s input (`batchSheet.ts:33,68` are the mirrors), pass `vm.dilution`, and render a small **Dilution** section in `BatchSheet.tsx` for LS (paste, target %, solution, water to add, glycerin) — the print artifact is where "add Xg water" is used.

## Persistence

- `soapConcentrationPercent` rides `RecipeSettings` automatically via `normalizeSettings`'s `{...DEFAULT_SETTINGS, ...partial}` spread (add the field + `'30'` default to `DEFAULT_SETTINGS`) — identical to `postCookSuperfatPercent`. Round-trips through drafts and file export/import for free.
- The `'solution'` basis rides `AdditiveLine.basis` (already persisted); the only change is the 3-way validation in `normalizeAdditiveLine` / `parseAdditiveLine`. Legacy data (no `soapConcentrationPercent`, `basis` in `{oil,batch}`) is unaffected.

## Changes (complete set)

1. **`packages/core/src/dilution.ts`** (new) — `DilutionInput`, `DilutionResult`, `calculateDilution`. Export via `packages/core/src/index.ts` (`export * from './dilution.js'`).
2. **`packages/core/src/additives.ts`** — `DoseBasis` gains `'solution'`.
3. **`packages/web/src/lib/recipe.ts`** — `RecipeSettings` + `DEFAULT_SETTINGS`: add `soapConcentrationPercent: '30'`. `normalizeAdditiveLine`: 3-way `basis`.
4. **`packages/web/src/lib/calculateAdditives.ts`** — `computeRecipeAdditives(additives, { oilGrams, batchGrams, solutionGrams })`; 3-way `basisWeight`.
5. **`packages/web/src/lib/formatDose.ts`** — 3-way `basisWord`.
6. **`packages/web/src/lib/recipeFile.ts`** — `parseAdditiveLine`: 3-way `basis`.
7. **`packages/web/src/hooks/useRecipeViewModel.ts`** — LS-gated memoized `dilution`; expose it; pass `solutionGrams` into `computeRecipeAdditives`; thread `dilution` into `buildBatchSheetData`.
8. **`packages/web/src/components/AdditivesPanel.tsx`** — `DOSE_MODES` + `offeredDoseModesForProcess` + mismatched-option guard; the two solution options shown for LS only.
9. **`packages/web/src/components/DilutionPanel.tsx`** (new) — the LS readout + soap-concentration field.
10. **`packages/web/src/lib/batchSheet.ts` + `BatchSheet.tsx`** — thread + print the LS Dilution section.
11. **`packages/web/src/App.tsx`** — render `<DilutionPanel>` for LS, wired to `settings`/`setSettings`.

## Scope boundary

- **No core-lye change.** Dilution is a read-only derived view; it does not alter `calculateLye`, the paste batch weight, or the mold sizer.
- **Glycerin informational** (not in the denominator).
- **CP/HP unchanged** — the Dilution panel is hidden, `dilution` is null, and solution-basis additive lines are inert (`solutionGrams = 0` → skipped); the dose-mode select offers no solution options.
- **No preservative percentages** — supplier-sourced (Phase 2). This feature supplies the `'solution'` basis capability those adds need, not the numbers.
- **Deferred:** "bottles filled" / finished-volume yield (Phase 3 Yield outputs); the LS cook-water default refinement (a separate roadmap item); wiring the unused `panels` array (infra, later).

## Research validation (de-branded verified constants)

Checked against `docs/multi-process-roadmap.md`, behavior/numbers only:
- **Dilution model** — `anhydrous = oils + lye`, `solution = anhydrous ÷ soap%` (Confirmed, roadmap §Liquid soap). Glycerin excluded from anhydrous → glycerin is a separate readout.
- **Glycerin factors** — `0.55 g/g KOH · 0.77 g/g NaOH` (Confirmed).
- **Soap concentration** — coconut ≤40% · castile ~25% · blends 25–35% (Partial / point examples) → informs the default `30` and the hint; no invented ranges.
- **Anonymity** — numbers/behavior only; no source titles, authors, or page refs in code, UI, or this spec.

## Error handling / edge cases

- `soapConcentrationPercent` empty/0/≥100/non-numeric → `calculateDilution` returns null → panel shows an "enter a target concentration (0–100%)" hint; no solution weight; solution-basis additives skipped.
- `anhydrousGrams <= 0` (no oils yet) → null; panel shows nothing computable.
- `targetExceedsPaste` → `dilutionWater = 0` + an explicit warning ("the paste is already more dilute than the target").
- Stray `soapConcentrationPercent` under CP/HP → inert (dilution LS-gated).
- Stray `basis: 'solution'` under CP/HP (imported/hand-edited) → the additive computes no grams (`solutionGrams = 0`), and the dose-mode guard still renders its option so the select doesn't silently reset.

## Testing

- **core `dilution.test.ts`** — `calculateDilution`: solution / totalWater / dilutionWater for a known paste; glycerin from koh+naoh; `targetExceedsPaste` clamps dilutionWater to 0; null for `anhydrous<=0` and out-of-range `soap%`.
- **`calculateAdditives.test.ts`** — a `solution`-basis line uses `solutionGrams`; skipped when `solutionGrams<=0`.
- **`recipe.test.ts`** — `normalizeAdditiveLine` accepts `basis:'solution'`, defaults unknown to `'oil'`; `DEFAULT_SETTINGS.soapConcentrationPercent === '30'`.
- **`recipeFile.test.ts` / `recipeStorage.test.ts`** — a `solution`-basis additive + `soapConcentrationPercent` round-trip through file and draft.
- **`formatDose.test.ts`** — "of solution" labels.
- **`useRecipeViewModel.test.tsx`** — `dilution` computed for LS, `null` for CP/HP, and `null` (no crash) for an LS recipe with no valid `result` (empty/errored); `solutionGrams` reaches the additive compute.
- **`AdditivesPanel.test.tsx`** — LS offers the two solution dose modes; CP/HP do not; a stray `solution` line under CP still renders its option (guard).
- **`DilutionPanel.test.tsx`** — renders the four figures + glycerin; shows the target-exceeds-paste warning; editing the field calls `onSoapConcentrationChange`.
- **`batchSheet.test.ts`** — the LS Dilution section prints when `dilution` is present; absent otherwise.
- **Regression:** CP/HP recipes unchanged (no dilution panel/section, no solution dose mode, identical additive grams for oil/batch lines).

## Self-review

- **Placeholders:** none.
- **Consistency:** dilution mirrors the additive/PCSF derived-view pattern (pure core math → LS-gated memoized VM value → panel + batch sheet); the `'solution'` basis reuses the Phase-0.4 orthogonal dose model; persistence rides the established settings/additive round-trips.
- **Scope:** one focused LS feature; the `'solution'` basis touches exactly the four enumerated ternaries plus the dose-mode select; no core-lye/property risk.
- **Ambiguity:** the glycerin model, the default, the target-exceeds-paste edge, the LS-gating, and the dose-mode process-gating + guard are all pinned.
