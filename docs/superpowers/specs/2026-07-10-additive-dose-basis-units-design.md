# Additive Dose Basis + Units (Phase 0.4) — Design

**Date:** 2026-07-10
**Status:** Approved (brainstorm). Lightweight TDD execution to follow.
**Origin:** Multi-process roadmap Phase 0.4 — dose additives as % of oil *or* % of the finished batch, and add a `ppt` micro-dose unit. Builds on the process selector (0.1), after-cook stage (0.2), and two-part superfat (0.3).

## Goal

Give each **additive line** an explicit dose descriptor — an **amount** interpreted by a **basis** (% of oil vs % of the wet batch) and a **unit scale** (percent vs parts-per-thousand). Today every additive is implicitly "% of oil"; this lets solution-oriented adds dose against the batch weight and micro-doses (e.g. a restricted fragrance component at 1–3 ppt) dose in parts-per-thousand. Additives only — split-liquid, post-cook superfat, and cook superfat are unchanged.

## Decisions (settled in brainstorm)

- **Unified mechanism:** one per-line descriptor covers both the basis and the unit — they are the same "how is this amount interpreted" field, built together so the additive model is reworked once.
- **Orthogonal model:** `amount: string` + `basis: 'oil' | 'batch'` + `unit: 'percent' | 'ppt'`, with one uniform grams formula. Renames `AdditiveLine.percentOfOil` → `amount` (it is no longer always a percent of oil).
- **Batch basis = the *wet* batch = oils + lye + water** (`result.totalBatchWeightGrams`), before any additives / split-liquid / PCSF. Chosen for non-circularity: adding one additive never shifts another's grams. See Research validation for why this, and not the strict "% of total product".
- **LS diluted-solution basis is deferred to Phase 1.** The material defines the LS solution as `anhydrous ÷ soap%` (≈2.5–4× the paste), which cannot be computed until the Phase-1 dilution calculator exists. 0.4 ships **oil + wet-batch** only; a `'solution'` basis is added to `DoseBasis` when dilution lands. No dosing number is ever wrong in the meantime because no preservative percentage ships (see Scope boundary).
- **No process gating.** The roadmap tags this `Shared`; the dose modes are offered for every process (CP included). The default stays % of oil, so existing recipes are unchanged.
- **Catalog untouched.** No new catalog entries and no per-entry default basis/unit — that seam arrives with the eugenol/preservative sets in later roadmap items. Existing entries stay oil/percent.

## Model & calc

- **Core `additives.ts`** (pure math) gains:
  - `export type DoseUnit = 'percent' | 'ppt'`
  - `export type DoseBasis = 'oil' | 'batch'`  *(extensible to `'solution'` in Phase 1)*
  - `parseDoseAmount(value: string, unit: DoseUnit): number | null` — finite, `>= 0`, ceiling `100` for `percent` and `1000` for `ppt` (both cap at "100% of basis"); `null` otherwise or on `''`.
  - `gramsFromDose(basisWeightGrams: number, amount: number, unit: DoseUnit): number | null` = `amount × (unit === 'ppt' ? 1/1000 : 1/100) × basisWeightGrams`.
  - Keeps `parsePercentOfOil` / `gramsFromPercentOfOil` unchanged (split-liquid + PCSF still use them).
- **Web `computeRecipeAdditives(additives, { oilGrams, batchGrams })`** — `batchGrams` is the same wet-batch base the view-model already uses for `batchWeightWithExtras`: `displayTotals?.batchWeightGrams ?? result?.totalBatchWeightGrams ?? 0` (oils+lye+water; core `lye.ts:323`). Per line: `basisWeight = line.basis === 'batch' ? batchGrams : oilGrams`; `amount = parseDoseAmount(line.amount, line.unit)`; skip on `null`/`0`; `grams = gramsFromDose(basisWeight, amount, line.unit)`.
- **Non-circular by construction:** the batch basis excludes all web-computed extras (additives, split-liquid, PCSF), so additive amounts never feed back into each other's basis.

```
AdditiveLine     = { key, catalogId, name, addAt,
                     amount: string,          // was percentOfOil
                     basis: 'oil' | 'batch',  // default 'oil'
                     unit:  'percent' | 'ppt' }// default 'percent'
ComputedAdditive = { key, catalogId, name, addAt, amount: number, unit, basis, grams }
```

## Insight correctness

`useFormulationInsights` today sums each additive's raw `percentOfOil` to fire the "total additives exceed ~10% of oil weight" note. Once amounts carry mixed bases/units, summing the raw numbers is meaningless (a `3 ppt` line + a `5% of batch` line ≠ `8%` of oil). **Fix:** derive each line's **oil-equivalent %** from its grams — `grams / oilGrams × 100` — and sum those. Identical to today for %-of-oil lines; correct for every basis/unit. The insight hook reads `ComputedAdditive.grams` + `result.totalOilWeightGrams` (both already in scope).

## UI

- One compact **dose-mode `<select>`** per additive row, between the amount input and the stage select, offering the four basis×unit pairs: **% of oil · % of batch · ppt of oil · ppt of batch**. Maps to `{ basis, unit }`.
- The amount `<input>`'s `max` follows the unit (`100` for percent, `1000` for ppt); `step` stays `0.1`.
- Selecting a catalog entry sets `catalogId`/`name`/`addAt` as today and **leaves `basis`/`unit` on the line** (existing entries are all oil/percent; a new line defaults oil/percent).
- The panel subtitle "% of total oil weight" becomes neutral ("Dose per additive"); the per-entry "Typical X–Y% of oil weight" hint stays (catalog typicals are oil-based).

```
now:  [Fragrance ▾] [Name___] [ 5 ]                [At trace ▾]   50 g  ×
0.4:  [Fragrance ▾] [Name___] [ 3 ] [ppt of oil ▾] [At trace ▾]  0.3 g  ×
```

## Persistence & migration

- **Two serialize/deserialize pairs, both sides must change:**
  - *Draft (localStorage):* write `cloneAdditives` (recipeStorage) ↔ read `additivesFromSaved` → `normalizeAdditiveLine` (recipe).
  - *File (import/export):* write `serializeRecipeFile` additives map (recipeFile) ↔ read `parseAdditiveLine` (recipeFile).
  - Each write emits `amount`/`basis`/`unit`; each read tolerates legacy input.
- **Legacy migration** (older drafts/files with `percentOfOil`, no basis/unit): map `percentOfOil` → `amount`, `basis = 'oil'`, `unit = 'percent'` — byte-identical behavior. On the draft read, `normalizeAdditiveLine` widens its input type to see the off-type legacy `percentOfOil` and reads `amount ?? percentOfOil`; on the file read, `parseAdditiveLine` already works off an untyped `Record`, so it reads either field freely.
- **PPO import** (`doseUnit: 'ppo'`/`'ppoOz'`) still resolves via the existing `parseAdditivePercentOfOil` to a %-of-oil amount → `basis='oil'`, `unit='percent'`.
- `basis`/`unit` are validated on read (unknown → default oil/percent), same defensive style as `addAt`.

## Changes (complete set)

1. **`packages/core/src/additives.ts`** — add `DoseUnit`, `DoseBasis`, `parseDoseAmount`, `gramsFromDose`. Keep existing percent-of-oil helpers and the catalog/pack as-is (`LATHER_SUPPORT_PACK` seed values remain oil-based numbers).
2. **`packages/web/src/lib/recipe.ts`** — `AdditiveLine`: `percentOfOil` → `amount` + add `basis`/`unit`. `createEmptyAdditives`/new-line defaults: `amount:'' , basis:'oil', unit:'percent'`. `normalizeAdditiveLine`: legacy `percentOfOil`→`amount` + basis/unit defaulting — **its input type widens to `Partial<AdditiveLine> & { percentOfOil?: string } & Pick<…'key'>`** (the legacy field is no longer on `AdditiveLine`), reading `amount ?? percentOfOil`. `additivesFromSaved`: **spread the saved line** (`normalizeAdditiveLine({ key, ...line })`) so `amount`/`basis`/`unit` *and* a legacy `percentOfOil` both reach the normalizer, instead of field-picking `percentOfOil`. (Split-liquid keeps its own `percentOfOil`.)
3. **`packages/web/src/lib/calculateAdditives.ts`** — `ComputedAdditive` gains `amount`/`unit`/`basis`, drops `percentOfOil`. `computeRecipeAdditives(additives, { oilGrams, batchGrams })` picks the basis weight and calls `gramsFromDose`.
4. **`packages/web/src/hooks/useRecipeViewModel.ts`** — expose `baseBatchGrams` (= `displayTotals?.batchWeightGrams ?? result?.totalBatchWeightGrams ?? 0`); pass `{ oilGrams: totalOilGrams, batchGrams: baseBatchGrams }` into its `computeRecipeAdditives`.
5. **`packages/web/src/components/AdditivesPanel.tsx`** — consume the VM's `computed: ComputedAdditive[]` prop **instead of** recomputing locally (drops the `totalOilGrams` prop + the in-panel `computeRecipeAdditives` call — single source of truth, no second base-weight to thread). Bind `amount`; add the dose-mode select + dynamic `max`; the `addLine` new-line literal sets `amount:'' , basis:'oil', unit:'percent'`; `LATHER_SUPPORT_PACK` add sets `amount`/`oil`/`percent`.
6. **`packages/web/src/hooks/useFormulationInsights.ts`** — total-additives uses oil-equivalent % (`grams / oilGrams × 100`) instead of raw `percentOfOil`.
7. **`packages/web/src/lib/formatDose.ts`** (new, sibling of `additiveStageLabel.ts`) — `formatDose(amount, unit, basis)` → `"3 ppt of oil"` / `"1% of batch"` / `"5% of oil"`.
8. **`packages/web/src/components/ResultsPanel.tsx` + `BatchSheet.tsx`** — render additive dose via `formatDose` instead of the hardcoded `"% of oil"`.
9. **`packages/web/src/lib/recipeFile.ts`** — `RecipeFileAdditive`/`serializeRecipeFile`/`parseAdditiveLine`/`recipeAdditivesFromFile`: emit + accept `amount`/`basis`/`unit`; legacy `percentOfOil` fallback (via the untyped `Record` read); PPO path unchanged.
10. **`packages/web/src/App.tsx`** — pass `computed={vm.computedAdditives}` to `<AdditivesPanel>` (no longer `totalOilGrams`). Leave the *other* `totalOilGrams` consumer (SplitLiquidPanel) untouched.
11. **`packages/web/src/lib/recipeStorage.ts`** — the draft **save** path. `cloneAdditives` must emit `amount`/`basis`/`unit` (the removed `percentOfOil` field errors under tsc, but a rename that forgets basis/unit would silently drop them on autosave reload). `SavedAdditiveLine = Omit<AdditiveLine,'key'>` follows the rename; the load path (`loadDraft` → `additivesFromSaved`) already re-normalizes.

## Scope boundary

- **Additives only.** No core-lye change, no property/fatty-acid change. Split-liquid, PCSF, and cook superfat keep their `percentOfOil` fields untouched.
- **CP behavior is byte-identical** when every line is the default % of oil.
- **LS diluted-solution basis deferred to Phase 1** (needs the dilution calculator); 0.4 ships oil + wet-batch bases only.
- **No preservative percentages** ship — the material gives none (supplier-sourced only). 0.4 supplies the *basis capability* those adds need; the number stays with the supplier.
- Out of scope (later phases): thickeners/salt non-linear model, yogurt water-deduction, stearic/lauric "as oils", per-entry catalog defaults, sugar-source aggregation.

## Research validation (de-branded verified constants)

Checked against the repo's fact-checked digest (`docs/multi-process-roadmap.md`), citing behavior/numbers only:

- **ppt unit — confirmed.** "eugenol 1–3 ppt" is a *Confirmed* constant; ppt (parts-per-thousand, 0.1%) is the standard micro-dose scale for restricted fragrance components, and such components are oil-dosed → **ppt of oil**.
- **% of oil default — confirmed.** The material's traditional basis is "%TOW" (% of total oil weight); it stays the default.
- **Batch vs solution — the sharpened boundary.** The material fixes the LS solution as `anhydrous ÷ soap%` (≈2.5–4× the paste) and ties preservation to the *diluted* product (water activity ~0.98 vs bar ~0.66–0.76). Therefore the diluted "% of solution" basis is a Phase-1 capability; 0.4's "% of batch" = the wet batch (oils+lye+water), correct for CP/HP and the LS paste.
- **No preservative % — enforced.** "Percentages are supplier-sourced only — none in the references"; Do-not-ship: "verify with supplier placeholders only."
- **Anonymity.** Numbers/behavior only; no source titles, authors, or page refs in code, UI, or this spec.

## Error handling / edge cases

- Empty / `0` / invalid `amount` → line contributes no grams (as today).
- `amount` above the unit ceiling (`>100` percent / `>1000` ppt) → `parseDoseAmount` returns `null` → no grams (parity with the existing percent-of-oil cap).
- `basis === 'batch'` with no batch yet (`batchGrams <= 0`, e.g. line errors) → grams skipped, same guard as `oilGrams <= 0`.
- Stray/unknown `basis`/`unit` from hand-edited data → defaulted to oil/percent on read; the dose-mode select uses the mismatched-option guard so the current value always has a matching `<option>`.
- Invalid `catalogId` → unchanged (custom line).

## Testing

- **core `additives.test.ts`** — `gramsFromDose` (percent & ppt, oil & arbitrary basis weight); `parseDoseAmount` ceilings (100 percent / 1000 ppt, reject above, reject `''`/negative/NaN).
- **`calculateAdditives.test.ts`** — `computeRecipeAdditives` with `{ oilGrams, batchGrams }`: a % -of-batch line uses batch weight; a ppt line divides by 1000; batch line skipped when `batchGrams<=0`.
- **`recipe.test.ts`** — `normalizeAdditiveLine` maps legacy `percentOfOil`→`amount` + defaults basis/unit; new-line defaults.
- **`recipeFile.test.ts`** — round-trip `amount`/`basis`/`unit`; legacy `percentOfOil`-only file imports as oil/percent; PPO path still yields %-of-oil amount.
- **`recipeStorage.test.ts`** — draft save→load preserves a line's `basis` (`'batch'`) and `unit` (`'ppt'`) (guards `cloneAdditives` silently dropping them); a legacy `percentOfOil`-only draft loads as `amount`/oil/percent.
- **`useFormulationInsights`** — the >10% total fires on oil-equivalent load across mixed units (e.g. a ppt line + a %-batch line), and matches today for pure %-of-oil lines.
- **`formatDose`** — the four label forms.
- **`AdditivesPanel.test.tsx`** — dose-mode select renders + updates basis/unit; amount `max` follows unit; grams render from the passed `computed` rows (panel no longer recomputes).
- **`ResultsPanel` / `BatchSheet`** — an additive renders its actual basis label; a %-of-batch line re-tracks when oil weights change.
- **Regression:** CP with default % -of-oil lines is unchanged; existing additive/split-liquid/PCSF/batchSheet tests green.

## Self-review

- **Placeholders:** none.
- **Consistency:** the orthogonal model, core/web split (pure math in core, basis-weight selection in web), legacy migration, and display formatter mirror the existing additive/split-liquid/PCSF patterns; the batch basis reuses the already-computed `totalBatchWeightGrams`.
- **Scope:** one focused feature; the rename is mechanical across ~12 files (enumerated in Changes, incl. both serialize/deserialize pairs); no core-lye/property risk.
- **Ambiguity:** the wet-batch basis, the deferred LS solution basis, the ppt ceilings, the oil-equivalent insight, and the no-preservative-% rule are all pinned.
