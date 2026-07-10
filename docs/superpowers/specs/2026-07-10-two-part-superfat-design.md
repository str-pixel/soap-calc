# Two-Part Superfat (Phase 0.3, B−) — Design

**Date:** 2026-07-10
**Status:** Approved (brainstorm). Lightweight TDD execution to follow.
**Origin:** Multi-process roadmap Phase 0.3 — split superfat into cook SF (in-lye) + post-cook SF (added after, no lye). Builds on the process selector (0.1) and the after-cook additive stage (0.2).

## Goal

For **Hot Process** and **Liquid Soap**, let the user add a **post-cook superfat (PCSF)**: a chosen oil, at a %, added *after* the cook/dilution with **no lye effect**. The existing `superfatPercent` remains the **cook SF** (in-lye, reduces lye — unchanged). Total superfat shown = cook + post-cook.

## Decisions (settled in brainstorm)

- **B− scope:** oil choice + display, **properties/fatty-acids untouched** (superfat has never affected those; the metrics model saponified soap, and PCSF oil is free/unsaponified). No core-lye change either.
- **Default OFF:** PCSF defaults to `0%` for every process. The *fields* are available for HP/LS (opt-in); CP shows only the single "Superfat %". The roadmap's HP 5% / LS 2% seed values are deferred to the Phase-1 PCSF module (with its guidance).
- **PCSF is a web-computed extra** (like additives / split-liquid), NOT a lye input — so `calculateLye` and `parseRecipeSettings` are untouched.

## Model & calc

- **Cook SF** = existing `superfatPercent` → reduces lye (unchanged).
- **Post-cook SF** = new settings `postCookSuperfatPercent` (%) + `postCookSuperfatOilId` (oil). `PCSF grams = PCSF% × recipe oil weight` (the saponified oils' weight, not including the PCSF oil itself — same basis as additives).
- PCSF is **excluded from the lye calc**, **added to `batchWeightWithExtras`** (alongside additives + split-liquid), and **not** in the property/fatty-acid calc.
- **Mold-sizer interaction (intended):** because `batchWeightWithExtras` feeds `oilBatchFraction`, PCSF slightly lowers the mold sizer's suggested recipe oil — correct, since PCSF oil is part of the poured batch (consistent with additives/split-liquid already counting).

## Changes (complete set)

1. **`packages/web/src/lib/recipe.ts`**
   - `RecipeSettings`: add `postCookSuperfatPercent: string` and `postCookSuperfatOilId: string`.
   - `DEFAULT_SETTINGS`: `postCookSuperfatPercent: '0'`, `postCookSuperfatOilId: 'olive-oil'` (a valid default oil).
   - `normalizeSettings`: **no explicit change needed** — the fields ride along via the existing `...partial` spread + `DEFAULT_SETTINGS` fallback (plain strings, no enum validation; an invalid oil id is handled at display). Round-trip through `recipeFile`/`recipeStorage` is automatic (both persist the full settings object + re-normalize on load).

2. **`packages/web/src/lib/calculateAdditives.ts`** — add, co-located with `computeSplitLiquidGrams` (reuse `parsePercentOfOil` + `gramsFromPercentOfOil`):
   ```ts
   export type ComputedPostCookSuperfat = { oilId: string; percentOfOil: number; grams: number };
   export function computePostCookSuperfat(
     settings: Pick<RecipeSettings, 'postCookSuperfatPercent' | 'postCookSuperfatOilId'>,
     totalOilGrams: number,
   ): ComputedPostCookSuperfat | null;
   ```
   Returns `null` when the % is empty/invalid/0 or `totalOilGrams <= 0` (like additives — no `inputError`). Oil-agnostic: returns the `oilId`; the display resolves the name via `oilById`.

3. **`packages/web/src/hooks/useRecipeViewModel.ts`**
   - Compute `postCookSuperfat = computePostCookSuperfat(settings, totalOilGrams)` (memoized, like `splitLiquidGrams`); add it to `RecipeViewModel`.
   - Fold its grams into `batchWeightWithExtras` (currently additiveGrams + splitLiquidGrams → + `postCookSuperfat?.grams ?? 0`).
   - Pass `postCookSuperfat` into `buildBatchSheetData`.

4. **`packages/web/src/components/SettingsPanel.tsx`** — for HP/LS (`process !== 'cp'`) render a "Post-cook superfat %" numeric field + an `OilPicker` (reused) bound to `postCookSuperfatOilId`. CP renders nothing new (single "Superfat %" unchanged). Uses the existing `process` prop.

5. **`packages/web/src/components/ResultsPanel.tsx`** — new `postCookSuperfat` prop; when present, render a PCSF line (oil name via `oilById` + grams + %) as an after-cook item, and show **Total superfat = cook + post-cook**. (Distinct row from after-cook *additive* lines.)

6. **`packages/web/src/lib/batchSheet.ts` + `BatchSheet.tsx`** — thread `postCookSuperfat` into the batch-sheet data + print it as an after-cook line (oil + grams + %).

7. **`packages/web/src/App.tsx`** — pass `postCookSuperfat={vm.postCookSuperfat}` to `ResultsPanel` (SettingsPanel already has `settings`/`setSettings`/`process`; useRecipeViewModel already gets `settings`).

## Scope boundary

- **No `parseRecipeSettings` change** (PCSF isn't a lye input). **No core-lye change.** **No property/fatty-acid change.** **Cook SF unchanged.** CP untouched. PCSF defaults **off**. The append-vs-subtract method and DOS/high-PUFA guidance stay Phase 1.

## Error handling / edge cases

- Empty/`0`/invalid `postCookSuperfatPercent` → `computePostCookSuperfat` returns `null`; nothing renders; total SF = cook only.
- Invalid `postCookSuperfatOilId` (legacy/hand-edited) → `oilById` returns undefined; display falls back to showing the raw id (no crash).
- A stray non-zero PCSF% under CP (only via malformed data; independent workspaces mean CP normally never has one) → PCSF would compute, but CP's UI has no field to set it; acceptable, non-crashing. (Compute is %-based, UI-gated — mirrors the after-cook stage.)

## Testing

- **`recipe.test.ts`**: `DEFAULT_SETTINGS` has `postCookSuperfatPercent: '0'` + a default oil; `normalizeSettings({ postCookSuperfatPercent: '5', postCookSuperfatOilId: 'shea-butter' })` preserves them.
- **`calculateAdditives.test.ts`**: `computePostCookSuperfat` — grams = % × oil; `null` for '0'/''/invalid/`totalOilGrams<=0`; returns the given oilId.
- **`recipeFile.test.ts`**: a recipe with PCSF settings round-trips through serialize → parse (the new fields survive).
- **`SettingsPanel.test.tsx`**: PCSF field + oil picker render for HP and LS, **not** for CP; editing the % updates settings.
- **`ResultsPanel.test.tsx`**: given a `postCookSuperfat`, renders the oil name + grams and a cook+post-cook total; absent → no PCSF line.
- **`batchSheet.test.ts`**: PCSF prints as an after-cook line.
- **`useRecipeViewModel`**: `batchWeightWithExtras` includes PCSF grams (an assertion).
- **Regression:** CP unchanged (no PCSF fields, single superfat, identical batch weight); existing superfat/lye/additive/batchSheet tests green.

## Self-review

- Placeholders: none.
- Consistency: PCSF modeled as a web-computed extra (compute helper + view-model + display), exactly like split-liquid/additives; validation lives in the compute helper (not `parseRecipeSettings`), matching the "not a lye input" decision; round-trip verified automatic via the full-settings-object persistence pattern.
- Scope: one focused feature; reuses `OilPicker`, `parsePercentOfOil`, `oilById`, `batchWeightWithExtras`. No core-math risk (lye + properties untouched).
- Ambiguity: default-off, the cook-vs-post-cook basis, the mold-sizer interaction, and the CP-gating edge are all pinned.
