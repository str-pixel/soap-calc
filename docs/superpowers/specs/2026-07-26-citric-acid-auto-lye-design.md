# Citric Acid Additive with Automatic Lye Compensation — Design

**Date:** 2026-07-26
**Status:** Approved (brainstormed with user; citric-acid-only scope chosen)

## Problem

Soapmakers add citric acid to the lye solution to form sodium citrate in situ — a
natural chelator (reduces soap scum, DOS risk, and hard-water lather loss). Citric acid
consumes lye: dosed without compensation it silently raises the effective superfat.
The additives panel currently has no way to model this — additives are excluded from
lye math by design, and the only acid the calculator compensates for is the vinegar
split liquid.

## Verified constants

All chemistry derived from molar masses (same method as the shipped vinegar constant,
which this derivation reproduces exactly at 0.0333 g NaOH/g):

- Citric acid (anhydrous) MW **192.123** g/mol, triprotic.
- NaOH factor: `3 × 39.997 / 192.123` = **0.6246 g NaOH per g citric acid**.
- KOH factor: `3 × 56.105 / 192.123` = **0.8761 g KOH per g citric acid**.
- Typical dose: **1–2% of total oil weight**, dissolved in the lye solution
  (reference-verified CP guidance, which also confirms the acid effectively raises
  the superfat unless the lye is compensated).
- The entry is anhydrous-basis. Citric acid monohydrate (MW 210.138) would need
  0.571 g NaOH/g; the entry name says "(anhydrous)" so the basis is explicit.

Copy guardrail: adding citric acid does **not** lower finished-soap pH (a documented
community misconception). The sodium-citrate framing lives in the panel's
compensation line — "+X g NaOH added to lye (forms sodium citrate)" — no new
catalog `note` field, and no copy anywhere implies pH reduction.

## Approach (chosen: additive-catalog entry + factor, reusing the vinegar seam)

Alternatives considered and rejected: an alt-liquid preset (citric acid is a powder
dosed as % of oils, not a water-replacing liquid) and an "acid form" toggle on the
existing chelator entry (conflates two dosing scales, more UI machinery).

### Core — `packages/core/src/additives.ts`

- `AdditiveCatalogEntry` gains optional
  `lyeNeutralization?: { naohPerGram: number; kohPerGram: number }` — grams of PURE
  alkali consumed per gram of additive, identical in shape and meaning to
  `AlternativeLiquidPreset.lyeNeutralization`.
- New catalog entry:
  - id `citric-acid`, name `Citric acid (anhydrous)`
  - `typicalLow: 1, typicalHigh: 2`, `defaultStage: 'lye'`
  - `processes: ['cp', 'hp']` — **not offered for LS.** The LS neutralization
    feature (`neutralization.ts` + NeutralizePanel) deliberately recommends
    *uncompensated* citric acid to consume a lye excess after cook; auto-compensating
    a logged citric line would add that lye straight back (and "never add lye
    post-cook" is a standing product decision). LS chelation stays covered by the
    salt-form chelator entry.
  - `lyeNeutralization` with the factors above, stored as arithmetic expressions
    (`(3 * 39.997) / 192.123`), not magic decimals, with a comment acknowledging the
    sibling constants in `neutralization.ts` (192.124/56.1056 — different atomic-mass
    rounding, numerically irrelevant).
- The existing `chelator` entry (purchased citrate/gluconate salts, 1%) is unchanged;
  the two entries coexist — salt form needs no lye, acid form auto-compensates.

### Core — `packages/core/src/alternative-liquids.ts`

- Extract the acid math into `extraLyeForAcid(factors, grams, recipe)`;
  `extraLyeForAcidLiquid` becomes a thin delegate. Behavior byte-identical (dual-lye
  split by KOH blend share, per-alkali purity gross-up).
- New `extraLyeForAcidAdditives(additives, recipe)`: sums `extraLyeForAcid` over
  additive lines whose catalog entry carries `lyeNeutralization`, using each line's
  **resolved grams** (so ppt/batch/solution dose bases keep working). Input shape:
  `Array<{ catalogId: string; grams: number }>`.
- **One-pass basis resolution (invariant, pinned by test):** additive grams resolve
  against the *pre-compensation* batch/solution weight — the same one-pass rule every
  dose basis follows today — and the extra lye never re-enters dose resolution. A
  batch-basis citric test pins this so a future refactor can't introduce the loop.

### Web — `packages/web/src/hooks/useRecipeViewModel.ts`

- **Two separate extras, summed only at the `addExtraLye` call.** The existing
  `acidExtraLye` memo is ALSO a display prop threaded to SplitLiquidPanel ("+X NaOH
  added to offset the acid"), so the additive extra must NOT be summed into it —
  that would misattribute the citric lye to the split liquid. Keep
  `acidExtraLye` (split-liquid only, prop unchanged) and add
  `additiveAcidExtraLye` (new memo over `computedAdditives`); pass their sum to the
  single `addExtraLye(result, ...)` call.
- Per-line display data rides on `ComputedAdditive`: `computeRecipeAdditives` gains
  the recipe's lye parameters and attaches optional
  `extraLye?: { naohGrams: number; kohGrams: number }` to lines whose entry has
  factors. The memo'd AdditivesPanel already receives `computed`, so no new props
  are threaded beyond what it has.
- Lye totals, lye concentration, water:lye ratio, and the batch-sheet lye figures
  update through the existing pipeline. **Known parity limitation (matches vinegar
  today):** the *displayed* batch weight (`batchWeightWithExtras` = base + extras)
  does not include acid extra-lye grams — the citric powder grams enter via
  `extrasGrams`, the compensation lye grams do not. Kept as-is for vinegar parity;
  changing it is out of scope.
- `fixedBatchExtrasGrams` (batch-target back-solve) is intentionally unchanged:
  oil-basis citric extra lye scales with oils, so it does not belong in the affine
  fixed-grams term.

### Web — `packages/web/src/components/AdditivesPanel.tsx`

- For a row whose `computed` entry carries `extraLye`, render a line in the hint area
  (below the typical-range hint): `+X g NaOH added to lye (forms sodium citrate)` —
  KOH or both figures under dual lye — formatted with the recipe's weight unit via
  the panel's existing `formatWeight`/`weightUnit`. Visible proof the calculator
  accounted for the acid, matching the vinegar preset's "added automatically"
  messaging.
- The empty-state copy "not included in lye math" gains the exception: "…not included
  in lye math (citric acid's compensation lye is added automatically)."

## Out of scope

- Gluconic acid (user chose citric-only; gluconate stays covered by the salt-form
  chelator entry).
- LS (see process scoping above — conflicts with the LS neutralization feature).
- Adding acid extra-lye grams to the displayed batch weight (pre-existing vinegar
  parity gap, documented above).
- Superfat interaction — compensation is added on top of the superfat-discounted lye,
  after the calc, exactly like vinegar.
- Water math — the powder dissolves in the existing lye water.
- New insights; pH claims.

## Error handling

- Non-finite or ≤0 gram amounts contribute zero extra lye (same guards as
  `extraLyeForAcidLiquid`).
- A citric line with a blank/invalid amount simply adds nothing (grams resolve null →
  skipped), consistent with how such lines already drop out of additive totals.

## Testing

- Core: factor values from the arithmetic expressions; `extraLyeForAcidLiquid`
  delegate equivalence (vinegar results unchanged); `extraLyeForAcidAdditives` sums
  across lines, splits under dual lye, grosses up by purity, ignores entries without
  factors and invalid grams.
- Web: view-model adds the extra when a citric additive is present, not when absent,
  and stacks with a vinegar split liquid; SplitLiquidPanel's displayed acid figure
  stays vinegar-only when both are present; batch-basis citric resolves against the
  pre-compensation batch weight (loop-pin test); panel renders the `+X g` line for
  citric and not for other additives; citric absent from the LS picker.
- E2E (existing suite pattern): add citric at 2% on a known batch and assert the NaOH
  total increases by the expected grams.
