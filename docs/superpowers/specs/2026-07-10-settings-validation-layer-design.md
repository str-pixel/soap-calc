# Settings Validation Layer (Tier 3) — Design

**Date:** 2026-07-10
**Status:** Approved (brainstorm). Lightweight TDD execution to follow.
**Origin:** Tier 3 of the original architecture review — "tame stringly-typed settings + scattered validation." Pressure rose after Tier 2 (process work added more scattered validation).

## Goal

Consolidate the **calc-time** settings validation that is currently interleaved inside `calculateRecipe.ts` into one focused, directly-testable module `parseRecipeSettings.ts`. `calculateRecipe` then consumes parsed numbers + a collected error list, and orchestrates oils/lye.

## Scope boundary (decided)

**In scope — calc-time input validation only:** the logic that turns the raw string `RecipeSettings` into numbers and produces **user-facing error messages**. Today that's, in `calculateRecipe.ts`: `parseNonNegative` / `parsePositive` / `parsePurity`, `waterInput()`, and the inline superfat / purity / dual-blend range checks.

**Out of scope — leave untouched:**
- `normalizeSettings` enum guards (`isWeightUnit`/`isWaterMode`/`isLyeType`) and `coerceSettingsForProcess` — these are *load-time sanitization* (untrusted localStorage/import → silent safe defaults), a different lifecycle with different semantics (no error messages). Merging would conflate purposes and add regression surface.
- Line-weight validation (`resolveLineWeights` + the per-line `weightError` loop) stays in `calculateRecipe` — it's line validation, not settings validation.
- The optional `NumericField` UI-input wrapper — separate later cleanup.

## Interface

```ts
// packages/web/src/lib/parseRecipeSettings.ts
import type { LyeType, WaterMode } from '@soap-calc/core';
import type { RecipeSettings } from './recipe';

export type ParsedSettings = {
  superfatPercent: number;          // always present when values !== null
  lyeType: LyeType;                 // always
  waterMode: WaterMode;             // always
  kohBlendPercent?: number;         // dual only (undefined otherwise)
  naohPurityPercent?: number;       // undefined when empty/unused
  kohPurityPercent?: number;        // undefined when empty/unused
  waterPercentOfOils?: number;      // undefined when empty
  lyeConcentrationPercent?: number; // undefined when empty
  lyeWaterRatio?: number;           // undefined when empty
};

export function parseRecipeSettings(
  settings: RecipeSettings,
): { values: ParsedSettings | null; errors: string[] };
```

Optional (not `null`) fields match `calculateLye`'s optional inputs (`naohPurityPercent?: number`, defaulted internally), so unused/empty fields pass through and `calculateLye` defaults/ignores them exactly as today.

## Behavior — must preserve EXACTLY

1. **`values` is `null` iff `errors` is non-empty.** When there are no errors, `values` is present, with optional fields left `undefined` where the source field was empty or unused.
2. **Error order** (matches the current inline order so the UI list is unchanged): superfat → NaOH purity / KOH purity (pushed conditionally by `lyeType`) → dual `kohBlendPercent` → water (by `waterMode`).
3. **Exact error strings** (copy verbatim from today):
   - `Invalid superfat %` / `Superfat must be between 0 and 50`
   - `NaOH purity % must be between 1 and 100` / `KOH purity % must be between 1 and 100`
   - `Invalid KOH blend %` / `KOH blend % must be between 0 and 50`
   - `Lye concentration % must be greater than 0` / `Lye concentration % must be less than 100`
   - `Water : lye ratio must be greater than 0`
   - `Invalid water %`
4. **Conditional purity errors** (unchanged): both purities are parsed always; the NaOH error is pushed only when `lyeType` is `naoh` or `dual`; the KOH error only when `koh` or `dual`. An invalid-but-unused purity produces **no error** and its value is `undefined` in `ParsedSettings`.
5. **Empty water fields are not errors** (unchanged): empty `waterPercentOfOils`/`lyeConcentrationPercent`/`lyeWaterRatio` → the corresponding optional field is `undefined`, no error; `calculateLye` applies its default.

## `calculateRecipe` rewire — the critical fix

`calculateRecipe` must still collect **settings errors AND line errors together** before returning (today it does; a naive early-return on settings errors would drop the line errors). Shape:

```ts
const { values, errors } = parseRecipeSettings(settings);
const inputErrors = [...errors];
const resolved = resolveLineWeights(lines, settings);
// ...append line weightError messages + resolved.errors (dedup), exactly as today...
if (inputErrors.length || !values) {
  return { result: null, inputErrors, linePercents: new Map(), displayTotals: null };
}
const result = calculateLye({ oils, oilLookup: OIL_LOOKUP, ...values });
```

Do **not** early-return on `!values` before line validation. `MAX_SUPERFAT` and the `parse*` helpers move into `parseRecipeSettings.ts`.

## Testing

- **New** `parseRecipeSettings.test.ts` — unit-test what was only tested indirectly before: each field valid/invalid/empty; the three water-mode branches (incl. `>= 100` concentration and empty-is-not-error); dual-lye blend range; the conditional purity-error matrix (naoh/koh/dual × valid/invalid); `values===null` exactly when `errors.length>0`.
- **Existing** `calculateRecipe.test.ts` stays green unchanged (behavior identical, including the combined settings+line error list).

## Files

- **Create** `packages/web/src/lib/parseRecipeSettings.ts` + `parseRecipeSettings.test.ts`.
- **Modify** `packages/web/src/lib/calculateRecipe.ts` — remove the 3 `parse*` helpers, `waterInput`, `MAX_SUPERFAT`, and the inline superfat/purity/blend checks; consume `parseRecipeSettings`; keep line validation + the `calculateLye` call.

## Self-review

- Placeholders: none.
- Consistency: interface (optional fields) matches the behavior rules (undefined-when-empty/unused) and `calculateLye`'s optional inputs.
- Scope: single module + one consumer rewire — one focused change, no decomposition needed.
- Ambiguity: the collect-all-errors flow and exact error strings/order are pinned above so the extraction is unambiguously behavior-preserving.
