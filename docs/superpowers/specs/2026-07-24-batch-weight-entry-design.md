# Batch-Weight Entry Field — Two Totals in the Recipe Bar

**Date:** 2026-07-24
**Status:** Approved design (execution-verified); implementation not started
**Verification:** every load-bearing claim below was checked by running the real pipeline
before this spec was written (linearity probe, commit-composition probe, primitive reads).

## Problem

The recipe entry bar anchors on one number: **Total oil**. Users who think in finished
batch size — "my mold holds 1,200 g", "I want ~1.5 kg of soap" — must guess an oil weight
and iterate against the Results panel's "Total batch" readout. The recipe bar should offer
the batch total as a first-class, editable field alongside the oil total.

## Design

Two always-visible, independently editable fields in the entry bar — **no mode toggle, no
new persisted setting**:

- **Total oil (g)** — unchanged, today's behavior and draft id (`batch-total`).
- **Total batch (g)** — new. Displays the live computed batch weight (the view model's
  existing `batchWeightWithExtras` — the same figure Results prints as "Total batch"),
  editable with its own draft id (`batch-weight-total`). Committing a target back-solves
  the oil total and rescales the recipe proportionally.

### Why editing batch weight is a pure ratio

Batch weight is **linear in oil scale** — verified to 8 decimal places across water modes
(percent-of-oils, lye-concentration) and additive bases (%-of-oil, ppt-of-batch):
`b(s) = s × b(1)`, no constant offset. The app has no fixed-gram dose unit
(`DoseUnit = 'percent' | 'ppt'`), split liquid and post-cook superfat are %-of-oil, and
additives are computed one-pass (no fixed point), so every contributor scales with the
oils. Therefore:

```text
scale       = targetBatchGrams / currentBatchGrams
newOilTotal = round(currentOilTotalGrams × scale)
```

A **linearity regression test** ships with the feature (see Testing): if a fixed-gram dose
unit ever lands, the ratio solve must fail loudly in CI, not drift silently.

### Commit pathway — reuse the mold-sizer primitive

The batch-field commit does NOT introduce a new rescale routine. It computes
`newOilTotal` and applies it exactly the way the mold sizer's "Apply to batch" does
(`useRecipeInputs.handleApplySuggestedOilGrams`):

```text
applySyncedUpdate(prev => ({
  lines: syncBatchTotalEdit(resyncFromWeights(prev).lines, String(newOilTotal)),
  batchOilGrams: String(newOilTotal),
  batchSetByUser: true,
}))
```

`resyncFromWeights` re-derives percentages from current weights (handles off-100%
mid-edit states), then `syncBatchTotalEdit` scales every line from its own percentage.
Execution-verified: a 1,500 g target lands at 1,499 g (whole-gram per-line rounding,
error ≲ 1–2 g) from both gram-entry and off-100% (weights sum 120%) shapes. After commit
the field re-renders the **achieved** batch weight, so the rounding gap is self-evident;
no compensation pass (rejected as YAGNI).

### Guards / degraded states

Commit is a no-op (display reverts to the live value) when any of:
- no calc result, or `currentBatchGrams <= 0` — this is exactly the state where the
  Results panel is empty. Note: "percent-only" recipes do not persist as a gram-less
  state — a percent edit materializes grams from the anchor immediately
  (`lineWeightSync.ts` syncPercentEdit), so no special percent-only path exists or is
  needed. When there's truly nothing resolvable, the batch field displays "—".
- target is non-finite or `<= 0`, or `newOilTotal <= 0`.

LS is not special-cased: the field tracks the same displayed batch figure Results shows
for the active process, and the ratio applies unchanged (dilution solution weight is also
linear in oil scale).

## Architecture / touched files

- `packages/web/src/hooks/useRecipeInputs.ts` — new `batchWeightInputId`
  (`'batch-weight-total'`), `handleBatchWeightChange` (draft), and
  `commitBatchWeightInput(displayValue, context)` where context carries
  `{ currentBatchGrams, currentOilTotalGrams }`; internally reuses the
  `handleApplySuggestedOilGrams` core (extract its body into a shared local
  `applyOilTotal(rounded)` so mold-apply and batch-commit share one code path).
- `packages/web/src/components/RecipeOilsPanel.tsx` — second field in
  `.recipe-entry-bar`, labeled `Total batch ({unit})`, fed by a new
  `batchWeightWithExtras` prop; unit conversion via the same
  `gramsStringToInputDisplay`-style helpers the oil field uses.
- `packages/web/src/App.tsx` (~line 384) — pass `batchWeightWithExtras` (already on the
  view model) to `RecipeOilsPanel`.
- No changes to: core package, `calculateRecipe`, recipe data model, persisted settings.

## Testing

1. **Linearity regression (new, permanent):** `packages/web/src/lib` test asserting
   `b(2)/b(1) = 2` and `b(3.37)/b(1) = 3.37` for: plain CP default water,
   %-of-oil + ppt-of-batch additives, lye-concentration water mode. Failure message
   points at the ratio solver's assumption.
2. **Commit unit tests (useRecipeInputs):** 1,500 g target scales starter lines and sets
   `batchOilGrams` (achieved within 3 g); off-100% shape reconciles to 100% and lands;
   invalid targets (`''`, `0`, `-5`, `abc`) and zero-batch state no-op.
3. **Panel test:** both fields render with their labels; batch field shows the formatted
   `batchWeightWithExtras`; empty/unresolvable recipe renders "—".
4. **E2E:** type 1500 into "Total batch", blur; assert Results "Total batch" ≈ 1.5 kg and
   the first oil's weight scaled proportionally; assert "Total oil" field updated.

## Out of scope

- Pinned/reactive batch anchor (changing superfat auto-rescaling oils) — rejected: fights
  the independent-entry model (#80); commit-time rescale only.
- Cured/label-weight targeting — different number (post-evaporation), different feature.
- Exact-gram rounding compensation — the achieved figure self-documents a ≲2 g gap.
