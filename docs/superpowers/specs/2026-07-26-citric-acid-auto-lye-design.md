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
  (reference-verified CP guidance; the same source confirms extra lye must be added
  or the acid "will slightly increase your superfat").
- The entry is anhydrous-basis. Citric acid monohydrate (MW 210.138) would need
  0.571 g NaOH/g; the entry name says "(anhydrous)" so the basis is explicit.

Copy guardrail: adding citric acid does **not** lower finished-soap pH (a documented
community misconception). Entry copy says it forms sodium citrate (a chelator) and
never implies pH reduction.

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
  - `lyeNeutralization` with the factors above, stored as arithmetic expressions
    (`(3 * 39.997) / 192.123`), not magic decimals.
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

### Web — `packages/web/src/hooks/useRecipeViewModel.ts`

- The existing `acidExtraLye` memo becomes the sum of the vinegar split-liquid extra
  and the additive extra; the single existing `addExtraLye(result, acidExtraLye)`
  call is unchanged. Lye totals, batch weight, concentration, water:lye ratio, and
  the batch sheet all update through the existing pipeline.

### Web — `packages/web/src/components/AdditivesPanel.tsx`

- For a row whose entry has `lyeNeutralization`, render a line by the computed grams:
  `+X g NaOH added to lye` (KOH or both under dual lye), formatted with the recipe's
  weight unit. Visible proof the calculator accounted for the acid, matching the
  vinegar preset's "added automatically" messaging.

## Out of scope

- Gluconic acid (user chose citric-only; gluconate stays covered by the salt-form
  chelator entry).
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
  and stacks with a vinegar split liquid; panel renders the `+X g` line for citric
  and not for other additives.
- E2E (existing suite pattern): add citric at 2% on a known batch and assert the NaOH
  total increases by the expected grams.
