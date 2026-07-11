# Post-Cook Superfat (PCSF) Module (Phase 1) — Design

**Date:** 2026-07-11
**Status:** Approved (brainstorm). Lightweight TDD execution to follow.
**Origin:** Multi-process roadmap Phase 1 — the #1 HP feature. Layers the three pieces the two-part superfat (0.3) deferred onto the shipped PCSF core: the **append-vs-subtract method**, **DOS/high-PUFA guidance**, and the **HP/LS seed values**.

## Goal

Make post-cook superfat fully usable and safe for Hot Process (and LS). The 0.3 core already ships PCSF as a chosen oil at a % added post-cook (append), HP/LS-gated, with a total-superfat readout. This module adds: (1) a **subtract** method that reserves the PCSF from the recipe instead of adding it on top (total oil constant, lye reduced); (2) **DOS guidance** when the chosen PCSF oil is high-PUFA (it's free/unsaponified, so most rancidity-prone); (3) sensible **process-seeded PCSF defaults**. CP is untouched.

## Decisions (settled in brainstorm)

- **Full module** — all three pieces.
- **Subtract = web-layer lye reduction, no core-lye change.** Because lye and water are **linear in oil weight**, reserving `f = PCSF%` of the oils yields cook lye/water = full-recipe lye/water `× (1 − f)`, with concentration and water:lye ratio **invariant**. So subtract keeps the whole calc on the **full recipe** (oil weight, additives, dilution, mold sizer all correct) and only presents a **scaled lye view** for the lye readout + batch. This corrects the brainstorm's first sketch ("feed the lye calc scaled oil lines"), which would have wrongly scaled every oil-weight-derived quantity.
- **DOS threshold ≈ 30% PUFA** on the *chosen PCSF oil* — spares the recommended stable oils (coconut/olive/almond/cocoa/shea, all ≤~25%) and flags unstable ones (sunflower/soy/grapeseed/hemp).
- **Seed HP 5% / LS 2%** PCSF by default (still a default the user can zero). Append is the default method, so existing HP/LS recipes are unchanged.

## Model & calc

### Method setting

`RecipeSettings.postCookSuperfatMethod: 'append' | 'subtract'`, default `'append'`. Any non-`'subtract'` value falls back to append behavior (the calc branches on `=== 'subtract'`), so no explicit validation is required beyond the default.

### Append (unchanged, today's behavior)
Cook the full recipe at cook SF; PCSF grams (`PCSF% × recipe oil`, of the chosen oil) are an **extra** added post-cook (`batchWeightWithExtras += PCSF grams`). Lye on the full recipe. Total oil = recipe + PCSF.

### Subtract (new)
- **Core `scaleLyeResult(result: LyeCalculationResult, factor: number): LyeCalculationResult`** (pure) — returns a copy with the **lye-side** fields scaled by `factor` (`lyeWeightGrams`, `naohWeightGrams`, `kohWeightGrams`, `waterWeightGrams`, and each line's `naohGrams`/`kohGrams`/`lyeGrams`), **recomputing `totalBatchWeightGrams = totalOilWeightGrams + scaled lye + scaled water`**, and leaving **oil weights** (`totalOilWeightGrams`, each line's `weightGrams`), `lyeConcentrationPercent`, `waterLyeRatio`, `includedInLye`/`tarLyeTreatment`, and `warnings`/`errors` **unchanged**. `factor` clamped to `[0, 1]`. Tested to equal `calculateLye(oils × factor)` on the lye fields (proves the linearity).
- **View-model:** compute the full result as today; then
  `const cookFactor = (method === 'subtract' && postCookSuperfat) ? clamp(1 − postCookSuperfat.percentOfOil/100, 0, 1) : 1;`
  and expose `result = cookFactor < 1 ? scaleLyeResult(fullResult, cookFactor) : fullResult`. All lye consumers (Results panel, batch sheet, dilution's lye, glycerin) now see the reduced lye; **`totalOilGrams` / `displayTotals` stay on the full recipe** (they read `displayTotals.recipeOilWeightGrams`), so additives, the mold sizer, and the dilution basis are unaffected.
- **Dilution needs no change** — `scaleLyeResult` preserves `result.totalOilWeightGrams`, so the existing anhydrous (`result.totalOilWeightGrams + result.lyeWeightGrams`) is already full-oil + reduced-lye under subtract, and `cookWaterGrams`/glycerin follow the scaled lye automatically.
- **Batch weight forks by method:**
  - append: `batchBase = displayTotals.batchWeightGrams` (recipe + full lye + full water); extras include PCSF grams.
  - subtract: `batchBase = displayTotals.recipeOilWeightGrams + result.lyeWeightGrams + result.waterWeightGrams` (recipe oil + reduced lye/water); extras **exclude** PCSF grams (it's reserved, not added).
- Total oil (subtract) = recipe; total superfat readout unchanged (cook SF + PCSF).

### No property/fatty-acid change
Subtract reserves `f` of the oils **proportionally**, so oil *percentages* are unchanged → bar properties and the fatty-acid profile are identical. PCSF's own oil stays out of the property calc (0.3 precedent). The module touches only lye + batch weight.

## DOS / high-PUFA guidance

- **Core:** add `postCookSuperfatPufaPercent?: number` to `FormulationAnalysisInput` and a new insight `high_pufa_post_cook_superfat`: fires when it's defined and `> 30`. Message (behavior/numbers only): *"Your post-cook superfat oil is high in linoleic + linolenic (polyunsaturated) — added unsaponified, it's prone to DOS/rancidity. Prefer a stable superfat oil (coconut, olive, almond, cocoa, shea) and/or add an antioxidant (e.g. 1% BHT + 1% sodium citrate); store cool."*
- **Web:** in `useFormulationInsights`, when `postCookSuperfat` is active, look up `oilById(postCookSuperfat.oilId).fattyAcids` and pass `postCookSuperfatPufaPercent = sumFattyAcids(that, FATTY_ACID_GROUP_KEYS.polyunsaturated)` (undefined when the oil has no fatty-acid data). The hook already imports `oilById`; add `postCookSuperfat` to its options.

## Process-seeded defaults

`PROCESS_DEFINITIONS.defaultSettings`: HP `postCookSuperfatPercent: '5'`, LS `postCookSuperfatPercent: '2'`. (Verify in the plan that `defaultsForProcess` re-seeds on a *process switch*, not only on a brand-new recipe; if it only applies on new, note that HP/LS recipes created before this ship keep 0% — acceptable.)

## UI

- **SettingsPanel** (HP/LS PCSF area, next to the existing PCSF %/oil fields): a **method toggle** — a 2-option control (`Append (add oil)` / `Subtract (reserve)`), bound to `postCookSuperfatMethod`.
- **ResultsPanel / BatchSheet:** the PCSF line is method-aware — append: *"+X g [oil] post-cook superfat"*; subtract: *"X g [oil] reserved · lye reduced"*. The reduced-lye readout gets a short note under subtract so the lower lye isn't mistaken for an error.
- **DOS note** renders in the existing Formulation-insights panel (no new surface).

## Persistence

`postCookSuperfatMethod` rides `RecipeSettings` via the `{...DEFAULT_SETTINGS, ...partial}` spread (default `'append'`), like `postCookSuperfatOilId`. The seed `postCookSuperfatPercent` values ride the existing PCSF persistence. Legacy data (no method → append; no seed → 0%) is unaffected.

## Changes (complete set)

1. **`packages/core/src/lye.ts`** — add `scaleLyeResult(result, factor)` (pure; clamp factor).
2. **`packages/core/src/insights.ts`** — `FormulationAnalysisInput` gains `postCookSuperfatPufaPercent?`; add the `high_pufa_post_cook_superfat` insight (`> 30`).
3. **`packages/web/src/lib/recipe.ts`** — `RecipeSettings` + `DEFAULT_SETTINGS`: add `postCookSuperfatMethod: 'append'`.
4. **`packages/web/src/lib/process.ts`** — HP/LS `defaultSettings.postCookSuperfatPercent` = `'5'` / `'2'`.
5. **`packages/web/src/hooks/useRecipeViewModel.ts`** — `cookFactor` + `scaleLyeResult(fullResult, cookFactor)` for subtract (keep `totalOilGrams`/`displayTotals` on the full recipe); method-forked `batchWeightWithExtras` — append: `displayTotals.batchWeightGrams` + PCSF extra; subtract: `displayTotals.recipeOilWeightGrams + result.lyeWeightGrams + result.waterWeightGrams`, no PCSF extra. (Dilution untouched.)
6. **`packages/web/src/hooks/useFormulationInsights.ts`** — accept `postCookSuperfat`; compute + pass `postCookSuperfatPufaPercent`.
7. **`packages/web/src/components/SettingsPanel.tsx`** — the append/subtract method toggle (HP/LS).
8. **`packages/web/src/components/ResultsPanel.tsx` + `BatchSheet.tsx`** — method-aware PCSF line + the subtract reduced-lye note.

## Scope boundary

- **No `calculateLye` change** — `scaleLyeResult` is a new pure helper; subtract is a web-layer presentation of a reduced lye.
- **No property/fatty-acid change** (subtract scales oils proportionally → percentages unchanged).
- **CP untouched;** append is the default → existing HP/LS recipes unchanged unless they opt into subtract.
- **DOS guidance is advisory** — the only shipped numbers are the verified anti-DOS combo (1% BHT + 1% sodium citrate); no fabricated dosing.
- **Deferred:** superfat/PUFA *bands* for the main recipe (a separate `Refine` roadmap item); the LS superfat guardrail (separate item).

## Research validation (de-branded verified constants)

Checked against `docs/multi-process-roadmap.md`:
- **cook 2–3% + PCSF 5–8%** (Confirmed, §Hot process) → seed HP 5%.
- **PUFA cap 15–20% → SF 3–5%** (Confirmed) → the DOS threshold (~30% on the free PCSF oil is deliberately above the recipe-level cap, since a single free oil ≫ the blend).
- **Anti-DOS 1% BHT + 1% sodium citrate** (Confirmed) → the guidance's only numbers.
- Prefer coconut/olive/almond/cocoa/shea for PCSF — generic technique.
- **Anonymity:** numbers/behavior only; no source titles/authors/pages in code, UI, or spec.

## Error handling / edge cases

- Subtract with PCSF 0% (or PCSF inactive) → `cookFactor = 1` → identical to append with no PCSF (no lye change).
- Subtract with an absurd PCSF ≥ 100% → `cookFactor` clamped to 0 → lye 0 (degenerate but non-crashing; realistic PCSF is 5–8%).
- Subtract under CP → inert (PCSF is HP/LS-gated; `postCookSuperfat` is null under CP so `cookFactor = 1`).
- Malformed `postCookSuperfatMethod` → treated as append.
- PCSF oil with no fatty-acid data → `postCookSuperfatPufaPercent` undefined → DOS insight doesn't fire (no false alarm).

## Testing

- **core `lye.test.ts`** — `scaleLyeResult`: lye/naoh/koh/water/per-line scale by factor; concentration/ratio/oil-weight unchanged; factor clamped to [0,1]; and `scaleLyeResult(full, 0.9).lyeWeightGrams ≈ calculateLye(oils×0.9).lyeWeightGrams` (linearity).
- **core `insights.test.ts`** — `high_pufa_post_cook_superfat` fires for PUFA `> 30`, not at/below; absent when `postCookSuperfatPufaPercent` is undefined.
- **`useRecipeViewModel.test.tsx`** — subtract reduces the exposed `result.lyeWeightGrams` by `(1 − PCSF%)` while `totalOilGrams` stays on the full recipe; append unchanged; subtract batch = recipe oil + reduced lye/water (no PCSF extra); append batch includes PCSF.
- **`useFormulationInsights`** — a high-PUFA PCSF oil (e.g. sunflower) surfaces the DOS note; a stable oil (e.g. coconut) doesn't.
- **`recipe.test.ts` / `process.test.ts`** — `DEFAULT_SETTINGS.postCookSuperfatMethod === 'append'`; HP default `postCookSuperfatPercent === '5'`, LS `'2'`.
- **`SettingsPanel.test.tsx`** — the method toggle renders for HP/LS (not CP) and updates the setting.
- **`ResultsPanel` / `BatchSheet`** — method-aware PCSF wording (append "added" vs subtract "reserved").
- **Regression:** append HP/LS recipes numerically identical to today; CP untouched; existing lye/property/dilution tests green.

## Self-review

- **Placeholders:** none.
- **Consistency:** subtract reuses the existing lye result via a pure `scaleLyeResult` (core), keeping the recipe-oil basis intact for additives/dilution/mold-sizer; DOS guidance extends the existing insights engine; seeds extend the existing process-defaults; the method setting rides the existing settings spread.
- **Scope:** one focused HP feature; the invasive part (subtract) is contained to `scaleLyeResult` + the VM's lye/batch fork; no core-lye/property change.
- **Ambiguity:** the corrected subtract mechanism (scale the lye view, not the oil basis), the DOS threshold, the seed values, and the method default are all pinned.
