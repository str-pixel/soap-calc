# Soap-Calc Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 12 confirmed correctness/UX defects (plus one decision item) surfaced by the adversarial code review, each with a regression test.

**Architecture:** Every fix is a minimal, localized patch. Logic bugs (core math, lib functions, data pipeline) get real unit tests written first (TDD). UI-interaction bugs live in React components with no test-rendering harness in this repo, so they get a documented manual verification via the `/run` skill plus a lib-level regression anchor where one exists.

**Tech Stack:** TypeScript, Vitest, React 19, Vite. npm workspaces (`core`, `oils-data`, `web`).

## Global Constraints

- **Minimal changes.** Smallest patch that solves each problem. No drive-by refactors (AGENTS.md).
- **`npm test` must pass** before finishing (runs `validate:oils` + all workspace tests).
- **Run all commands from repo root** `/Users/str/soap-calc`.
- **Do not add dependencies** (no React Testing Library — the repo has none; UI fixes use manual verification).
- **Node >= 20.** Molar masses used in math/tests: NaOH = 40, KOH = 56.1 (SAP divisor 1402.5 = 56.1·1000/40).
- **Do not auto-commit/push** unless the executor is explicitly asked; each task below still ends with the exact commit for when that go-ahead is given. End commit messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Suggested branch before starting: `git switch -c fix/review-findings`.

---

## File Structure

| File | Change | Task |
|------|--------|------|
| `packages/core/src/lye.ts` | Fix dual-lye coefficient swap | 1 |
| `packages/core/src/lye.test.ts` | Replace tautological dual tests with molar-balance tests | 1 |
| `packages/web/src/lib/lineWeightSync.ts` | Reconcile emptied field in both blank branches | 2 |
| `packages/web/src/lib/lineWeightSync.test.ts` | Update transient test + add resurrection/delete regressions | 2 |
| `packages/web/src/lib/calculateRecipe.ts` | Empty Water% → default; dedup weight errors | 3, 7 |
| `packages/web/src/lib/calculateRecipe.test.ts` | Tests for water fallback + error dedup | 3, 7 |
| `packages/web/src/App.tsx` | Skip no-op commits; autosave committed state | 4, 11 |
| `packages/web/src/lib/weightUnits.test.ts` | Round-trip-lossiness regression anchor | 4 |
| `packages/web/src/components/OilPicker.tsx` | Fix focus+Enter pick; close on blur | 5 |
| `packages/web/src/lib/recipeFile.ts` | Apply `doseUnit` to numeric additive dose | 6 |
| `packages/web/src/lib/recipeFile.test.ts` | PPO numeric-import tests | 6 |
| `packages/core/src/properties.ts`, `fatty-acids.ts`; `packages/web/src/lib/calculateRecipeIndexes.ts` | Report unknown oil ids as missing | 8 |
| `packages/core/src/properties.test.ts`, `packages/web/src/lib/calculateRecipeIndexes.test.ts` | Missing-oil tests | 8 |
| `packages/oils-data/src/normalize.ts` | Fix 2 dead alias keys | 9 |
| `packages/oils-data/src/normalize.test.ts` | Alias-key invariant test | 9 |
| `packages/oils-data/src/sap-policy.ts` | Epsilon on delta boundary | 10 |
| `packages/oils-data/src/sap-policy.test.ts` | Exact-5% boundary test | 10 |

---

## Task 1: Fix dual-lye alkali under-dosing (HIGH)

**Files:**
- Modify: `packages/core/src/lye.ts:138-142`
- Test: `packages/core/src/lye.test.ts` (replace the two tautological dual tests near lines 249 and 294)

**Interfaces:**
- Consumes: `calculateLye(input: LyeRecipeInput): LyeCalculationResult` (unchanged signature); result has `naohWeightGrams`, `kohWeightGrams`, `lyeWeightGrams`.
- Produces: corrected `naohGrams`/`kohGrams` per line and totals.

**Root cause:** `lyeForOilLine`'s dual branch inverts the SAP coefficients, so `naohGrams/40 + kohGrams/56.1 < moles needed`. Correct: `T = fullNaohGrams·kohCoeff / ((1-f)·kohCoeff + f·naohCoeff)`. (Algebra holds even when NaOH/KOH purities differ, because `kohCoeff/naohCoeff` carries the purity ratio.)

- [ ] **Step 1: Write the failing molar-balance test.** Add to `lye.test.ts` (uses existing `OLIVE` and `calculateLye`):

```ts
it('dual lye conserves saponification moles across the NaOH+KOH split', () => {
  const NAOH_MM = 40;
  const KOH_MM = 56.1;
  const base = {
    oils: [{ oilId: 'olive-oil', weightGrams: 1000 }],
    oilLookup: { 'olive-oil': OLIVE },
    superfatPercent: 5,
    naohPurityPercent: 100,
    kohPurityPercent: 100,
  } as const;
  const molesNeeded = calculateLye({ ...base, lyeType: 'naoh' }).lyeWeightGrams / NAOH_MM;
  for (const kohBlendPercent of [0, 5, 25, 50]) {
    const r = calculateLye({ ...base, lyeType: 'dual', kohBlendPercent });
    const molesProvided = r.naohWeightGrams / NAOH_MM + r.kohWeightGrams / KOH_MM;
    expect(molesProvided).toBeCloseTo(molesNeeded, 6);
    expect((r.kohWeightGrams / r.lyeWeightGrams) * 100).toBeCloseTo(kohBlendPercent, 4);
  }
});

it('dual lye at 0% KOH equals the NaOH-only result', () => {
  const base = {
    oils: [{ oilId: 'olive-oil', weightGrams: 1000 }],
    oilLookup: { 'olive-oil': OLIVE },
    superfatPercent: 5,
    naohPurityPercent: 100,
    kohPurityPercent: 100,
  } as const;
  const naohOnly = calculateLye({ ...base, lyeType: 'naoh' });
  const dual0 = calculateLye({ ...base, lyeType: 'dual', kohBlendPercent: 0 });
  expect(dual0.naohWeightGrams).toBeCloseTo(naohOnly.lyeWeightGrams, 6);
  expect(dual0.kohWeightGrams).toBeCloseTo(0, 6);
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `npm run test -w @soap-calc/core -- lye`
  Expected: FAIL — `molesProvided` ≈ 96.6% of `molesNeeded` at 5%, ~71% at 50%.

- [ ] **Step 3: Apply the coefficient-swap fix.** In `packages/core/src/lye.ts`, replace lines 138 and 142:

```ts
    const blendDenom = (1 - kohFraction) * kohCoeff + kohFraction * naohCoeff;
    if (blendDenom <= 0) {
      return { lyeGrams: 0, naohGrams: 0, kohGrams: 0 };
    }
    const totalAlkali = (fullNaohGrams * kohCoeff) / blendDenom;
```

- [ ] **Step 4: Remove the tautological expectations.** In `lye.test.ts`, delete the body of the test `'calculates dual NaOH + KOH blend with 5% KOH by weight'` (it re-derives the old `blendDenom`/`totalAlkali`), and in `'calculates dual lye for a multi-oil recipe'` remove any assertion that recomputes expected grams from `naohCoeff`/`kohCoeff`; keep its `errors`/`totalOilWeightGrams`/`lines.length` assertions. Keep `'rejects invalid koh blend percent for dual lye'` untouched.

- [ ] **Step 5: Run the full core suite.** Run: `npm run test -w @soap-calc/core`
  Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add packages/core/src/lye.ts packages/core/src/lye.test.ts
git commit -m "fix(core): correct dual-lye alkali split to conserve saponification moles

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Reconcile emptied weight/percent fields (MEDIUM, fixes #5 + #6)

**Files:**
- Modify: `packages/web/src/lib/lineWeightSync.ts:156-161` and `:185-192`
- Test: `packages/web/src/lib/lineWeightSync.test.ts`

**Root cause:** the two "blank input" branches write only one of `{weightGrams, weightPercent}`, leaving a half-populated line that `syncBatchTotalEdit` later misreads (resurrecting a removed oil, or silently deleting a weight). Fix: emptying either field empties both on that line.

- [ ] **Step 1: Write failing regression tests.** Add to `lineWeightSync.test.ts` (uses existing `twoLines`, `syncWeightEdit`, `syncPercentEdit`, `syncBatchTotalEdit`):

```ts
it('clearing a weight empties the line and does not resurrect it on a batch edit', () => {
  const cleared = syncWeightEdit(twoLines, 'a', '', '1000');
  expect(cleared.lines[0]).toMatchObject({ weightGrams: '', weightPercent: '' });
  const afterBatch = syncBatchTotalEdit(cleared.lines, '2000');
  expect(afterBatch[0].weightGrams).toBe('');
  expect(afterBatch[1].weightGrams).toBe('2000');
});

it('clearing a percent empties the line and does not silently delete on a batch edit', () => {
  const cleared = syncPercentEdit(twoLines, 'a', '', '1000');
  expect(cleared.lines[0]).toMatchObject({ weightGrams: '', weightPercent: '' });
  const afterBatch = syncBatchTotalEdit(cleared.lines, '2000');
  expect(afterBatch[0].weightGrams).toBe('');
  expect(afterBatch[1].weightGrams).toBe('2000');
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npm run test -w @soap-calc/web -- lineWeightSync`
  Expected: FAIL — first test resurrects `a` at `1200`; second deletes `a` silently but leaves stale state.

- [ ] **Step 3: Fix the weight blank branch** (`lineWeightSync.ts:156-161`):

```ts
  if (editedGrams === null) {
    return {
      batchOilGrams,
      lines: lines.map((line) =>
        line.key === key ? { ...line, weightGrams, weightPercent: '' } : line,
      ),
    };
  }
```

- [ ] **Step 4: Fix the percent blank branch** (`lineWeightSync.ts:185-192`):

```ts
  if (editedPct === null) {
    return {
      batchOilGrams,
      lines: lines.map((line) =>
        line.key === key ? { ...line, weightPercent, weightGrams: '' } : line,
      ),
    };
  }
```

- [ ] **Step 5: Update the stale-state test.** In `lineWeightSync.test.ts`, the test `'stores partial percent text without syncing weights'` asserts `weightGrams` stays `'600'` after clearing a percent — change that assertion to `expect(result.lines[0].weightGrams).toBe('')` (and rename to `'clearing a percent also clears the weight'`).

- [ ] **Step 6: Run the web suite.** Run: `npm run test -w @soap-calc/web -- lineWeightSync`
  Expected: PASS (including `lineWeightSync.invariants.test.ts`).

- [ ] **Step 7: Commit.**

```bash
git add packages/web/src/lib/lineWeightSync.ts packages/web/src/lib/lineWeightSync.test.ts
git commit -m "fix(web): keep weight and percent consistent when a recipe field is cleared

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Empty "Water % of oils" falls back to the default (MEDIUM, #4)

**Files:**
- Modify: `packages/web/src/lib/calculateRecipe.ts:78-83` (the `percent_of_oils` branch of `waterInput`)
- Test: `packages/web/src/lib/calculateRecipe.test.ts`

**Root cause:** `Number('') === 0` passes `parseNonNegative`, so a cleared field yields `waterPercentOfOils: 0` (not `undefined`), and core's `?? DEFAULT_WATER_PERCENT` never fires → 0 g water, 100% concentration, no warning. The other two water modes already suppress the empty string.

- [ ] **Step 1: Write the failing test.** Add to `calculateRecipe.test.ts` (import `DEFAULT_SETTINGS` from `./recipe` if not already imported):

```ts
it('falls back to the default water % when the Water% field is cleared', () => {
  const lines = [{ key: 'a', oilId: 'olive-oil', weightGrams: '1000', weightPercent: '100' }];
  const settings = {
    ...DEFAULT_SETTINGS,
    waterMode: 'percent_of_oils' as const,
    batchOilGrams: '1000',
    waterPercentOfOils: '',
  };
  const { result, inputErrors } = calculateRecipe(lines, settings);
  expect(inputErrors).toHaveLength(0);
  expect(result?.waterWeightGrams).toBeCloseTo(330, 0);
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npm run test -w @soap-calc/web -- calculateRecipe`
  Expected: FAIL — `waterWeightGrams` is `0`, not `330`.

- [ ] **Step 3: Fix `waterInput`.** In `calculateRecipe.ts`, the `percent_of_oils` return (currently lines 78-83) becomes:

```ts
  if (settings.waterPercentOfOils === '') {
    return { waterMode: 'percent_of_oils', waterPercentOfOils: undefined };
  }
  const water = parseNonNegative(settings.waterPercentOfOils, 'water %');
  if (water.error) errors.push(water.error);
  return {
    waterMode: 'percent_of_oils',
    waterPercentOfOils: water.n ?? undefined,
  };
```

- [ ] **Step 4: Run to verify pass.** Run: `npm run test -w @soap-calc/web -- calculateRecipe`
  Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add packages/web/src/lib/calculateRecipe.ts packages/web/src/lib/calculateRecipe.test.ts
git commit -m "fix(web): default water % when the field is cleared instead of 0 g water

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Don't commit no-op weight/percent/batch blurs (MEDIUM, #2)

**Files:**
- Modify: `packages/web/src/App.tsx` — `commitWeightInput` (286-294), `commitPercentInput` (296-304), `commitBatchInput` (306-320)
- Test: `packages/web/src/lib/weightUnits.test.ts` (regression anchor for the round-trip hazard)

**Root cause:** `onBlur` commits the field's display value even when the user never edited it; in oz/lb/kg the display round-trip is lossy, so a bare focus/blur rewrites gram weights and redistributes other lines. A draft only exists when the user actually typed (`onChange` → `setDraft`), so gate the commit on a draft being present.

- [ ] **Step 1: Add the round-trip regression anchor.** Add to `weightUnits.test.ts` (imports `parseInputDisplayToGrams`, `gramsStringToInputDisplay`):

```ts
it('oz display round-trips lossily, so no-op commits must be suppressed upstream', () => {
  const roundTrip = parseInputDisplayToGrams(gramsStringToInputDisplay('450', 'oz'), 'oz');
  expect(roundTrip).toBe('450.8'); // 450 g -> "15.9" oz -> 450.8 g, not 450
});
```

- [ ] **Step 2: Run to confirm the hazard.** Run: `npm run test -w @soap-calc/web -- weightUnits`
  Expected: PASS (documents that committing the canonical display mutates the value).

- [ ] **Step 3: Guard `commitWeightInput`** (App.tsx:286):

```ts
  function commitWeightInput(key: string, displayValue: string) {
    const hadDraft = weightInputId(key) in drafts;
    clearDraft(weightInputId(key));
    if (!hadDraft) return;
    const weightGrams = parseInputDisplayToGrams(displayValue, weightUnit);
    if (weightGrams === null) return;
    applySyncedUpdate((prev, batchOilGrams) =>
      syncWeightEdit(prev, key, weightGrams, batchOilGrams),
    );
  }
```

- [ ] **Step 4: Guard `commitPercentInput`** (App.tsx:296):

```ts
  function commitPercentInput(key: string, displayValue: string) {
    const hadDraft = percentInputId(key) in drafts;
    clearDraft(percentInputId(key));
    if (!hadDraft) return;
    const weightPercent = parsePercentInput(displayValue);
    if (weightPercent === null) return;
    applySyncedUpdate((prev, batchOilGrams) =>
      syncPercentEdit(prev, key, weightPercent, batchOilGrams),
    );
  }
```

- [ ] **Step 5: Guard `commitBatchInput`** (App.tsx:306):

```ts
  function commitBatchInput(displayValue: string) {
    const hadDraft = batchInputId in drafts;
    clearDraft(batchInputId);
    if (!hadDraft) return;
    const batchOilGrams = parseInputDisplayToGrams(displayValue, weightUnit);
    if (batchOilGrams === null) return;
    if (batchOilGrams === '') {
      applySyncedUpdate((prev) => resyncFromWeights(prev));
      return;
    }
    applySyncedUpdate((prev) => ({
      lines: syncBatchTotalEdit(prev, batchOilGrams),
      batchOilGrams,
    }));
  }
```

- [ ] **Step 6: Typecheck + manual verify.** Run: `npm run build -w @soap-calc/web` (tsc). Then `/run` the app: switch unit to oz, note the three line weights, click into a weight field and Tab out without typing → weights must be unchanged (before: `[450,250,300]`→`[451,250,299]`). Confirm typing a real value still commits.

- [ ] **Step 7: Commit.**

```bash
git add packages/web/src/App.tsx packages/web/src/lib/weightUnits.test.ts
git commit -m "fix(web): only commit weight/percent/batch inputs the user actually edited

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: OilPicker — no accidental pick, close on blur (MEDIUM #3 + LOW #12)

**Files:**
- Modify: `packages/web/src/components/OilPicker.tsx:53-57` (onFocus), `:63-81` (onKeyDown Enter), add `onBlur`

**Root cause:** on focus, `setHighlight(0)` + empty query means `results[0]` is `OILS[0]` ("Abyssinian Oil"), and Enter picks it. And nothing closes the listbox when focus leaves via Tab.

**Cross-browser note:** the close-on-blur must NOT rely on `e.relatedTarget` containment — on macOS Safari a clicked `<button>` does not receive focus, so `relatedTarget` is `null` and the dropdown would close before the option's `click` lands, breaking selection. Instead, keep focus on the input during option clicks via `onMouseDown preventDefault` on each option, then close unconditionally on blur.

- [ ] **Step 1: Fix onFocus (no pre-highlight) and add a plain close-on-blur** — replace the input's `onFocus` (OilPicker.tsx:53-57) and add `onBlur` immediately after it:

```tsx
        onFocus={() => {
          setOpen(true);
          setQuery('');
          setHighlight(-1);
        }}
        onBlur={() => setOpen(false)}
```

- [ ] **Step 2: Make Enter safe** — replace the entire `onKeyDown` handler (OilPicker.tsx:63-81) with:

```tsx
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
            setOpen(true);
            return;
          }
          if (!open) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (results[highlight]) pick(results[highlight]);
            else setOpen(false);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
```

- [ ] **Step 3: Keep focus on the input during option clicks** — add `onMouseDown={(e) => e.preventDefault()}` to the option `<button>` (OilPicker.tsx, the `<button ... onClick={() => pick(oil)}>` around line 95):

```tsx
              <button
                type="button"
                id={`${listId}-opt-${oil.id}`}
                role="option"
                aria-selected={index === highlight}
                className={`oil-picker__option${index === highlight ? ' oil-picker__option--active' : ''}${oil.id === value ? ' oil-picker__option--selected' : ''}`}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(oil)}
              >
```

- [ ] **Step 4: Typecheck.** Run: `npm run build -w @soap-calc/web`
  Expected: PASS (no type errors).

- [ ] **Step 5: Manual verify** via `/run`: (a) line with Olive selected → focus the oil field, press Enter without typing → stays Olive, dropdown closes; (b) focus, ArrowDown, Enter → picks the first result; (c) focus (dropdown opens), Tab to next field → dropdown closes and `aria-expanded` returns to false; (d) focus, then click an option with the mouse → the clicked oil is selected (verify this specifically, ideally in Safari).

- [ ] **Step 5: Commit.**

```bash
git add packages/web/src/components/OilPicker.tsx
git commit -m "fix(web): stop OilPicker from auto-picking the first oil and closing on blur

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Apply doseUnit to numeric additive doses on import (LOW/MED, #7)

**Files:**
- Modify: `packages/web/src/lib/recipeFile.ts:57-60` (numeric branch of `parseAdditivePercentOfOil`)
- Test: `packages/web/src/lib/recipeFile.test.ts`

**Root cause:** the string branch converts PPO via `ppoOzToPercentOfOil`, but the numeric branch returns the raw value, so `{percentOfOil: 0.5, doseUnit: 'ppo'}` imports as 0.5% instead of 3.125%.

- [ ] **Step 1: Write failing tests.** Add to `recipeFile.test.ts` (imports `parseRecipeFile`):

```ts
it('converts a numeric PPO additive dose using doseUnit on import', () => {
  const raw = JSON.stringify({
    version: 2,
    name: 'X',
    lines: [{ oilId: 'olive-oil', weightGrams: '1000' }],
    additives: [{ name: 'Fragrance', catalogId: '', addAt: 'trace', percentOfOil: 0.5, doseUnit: 'ppo' }],
    settings: {},
  });
  const parsed = parseRecipeFile(raw);
  expect(parsed.ok).toBe(true);
  if (parsed.ok) expect(parsed.data.additives[0].percentOfOil).toBe('3.13');
});

it('keeps a numeric percent dose as-is when no doseUnit is given', () => {
  const raw = JSON.stringify({
    version: 2,
    name: 'X',
    lines: [{ oilId: 'olive-oil', weightGrams: '1000' }],
    additives: [{ name: 'Fragrance', catalogId: '', addAt: 'trace', percentOfOil: 0.5 }],
    settings: {},
  });
  const parsed = parseRecipeFile(raw);
  expect(parsed.ok && parsed.data.additives[0].percentOfOil).toBe('0.5');
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npm run test -w @soap-calc/web -- recipeFile`
  Expected: FAIL — first test gets `'0.5'` instead of `'3.13'`.

- [ ] **Step 3: Fix the numeric branch** (recipeFile.ts:57-60):

```ts
  if (typeof value.percentOfOil === 'number' && Number.isFinite(value.percentOfOil)) {
    if (value.percentOfOil < 0) return '';
    if (doseUnit === 'ppo' || doseUnit === 'ppoOz') {
      return ppoOzToPercentOfOil(value.percentOfOil);
    }
    return roundPercentString(value.percentOfOil);
  }
```

- [ ] **Step 4: Run to verify pass.** Run: `npm run test -w @soap-calc/web -- recipeFile`
  Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add packages/web/src/lib/recipeFile.ts packages/web/src/lib/recipeFile.test.ts
git commit -m "fix(web): honor doseUnit for numeric additive doses on import

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Deduplicate identical "Invalid weight" errors (nit, P2)

**Files:**
- Modify: `packages/web/src/lib/calculateRecipe.ts:106-111`
- Test: `packages/web/src/lib/calculateRecipe.test.ts`

**Root cause:** identical error strings feed `key={msg}` in `ResultsPanel`, producing duplicate React keys. The adjacent `resolved.errors` block already dedups; the weight-error block doesn't.

- [ ] **Step 1: Write the failing test.** Add to `calculateRecipe.test.ts`:

```ts
it('does not emit duplicate "Invalid weight" errors for lines sharing an oil', () => {
  const lines = [
    { key: 'a', oilId: 'olive-oil', weightGrams: 'x', weightPercent: '' },
    { key: 'b', oilId: 'olive-oil', weightGrams: 'y', weightPercent: '' },
  ];
  const { inputErrors } = calculateRecipe(lines, { ...DEFAULT_SETTINGS, batchOilGrams: '' });
  const weightErrors = inputErrors.filter((e) => e.startsWith('Invalid weight'));
  expect(new Set(weightErrors).size).toBe(weightErrors.length);
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npm run test -w @soap-calc/web -- calculateRecipe`
  Expected: FAIL — two identical `Invalid weight for Olive Oil` strings.

- [ ] **Step 3: Dedup at the source** (calculateRecipe.ts:106-111):

```ts
  for (const row of resolved.lines) {
    if (row.weightError) {
      const label = oilById(row.line.oilId)?.displayName ?? row.line.oilId;
      const message = `Invalid weight for ${label}`;
      if (!inputErrors.includes(message)) inputErrors.push(message);
    }
  }
```

- [ ] **Step 4: Run to verify pass.** Run: `npm run test -w @soap-calc/web -- calculateRecipe`
  Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add packages/web/src/lib/calculateRecipe.ts packages/web/src/lib/calculateRecipe.test.ts
git commit -m "fix(web): dedup identical invalid-weight errors to avoid duplicate React keys

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Report unknown oil ids as missing (LOW, #10)

**Files:**
- Modify: `packages/core/src/properties.ts:112-114`, `packages/core/src/fatty-acids.ts:28-30`, `packages/web/src/lib/calculateRecipeIndexes.ts:31-33`
- Test: `packages/core/src/properties.test.ts`, `packages/web/src/lib/calculateRecipeIndexes.test.ts`

**Root cause:** the `if (oil)` guard means an oil id absent from the lookup is never added to `missingOilIds`, so its weight dilutes coverage anonymously. (Note: when *no* oil has data, `coveredWeight <= 0` still returns empty arrays — that "no data at all" case is left as-is.)

- [ ] **Step 1: Write the failing core test.** Add to `properties.test.ts` (imports `calculateRecipeProperties`):

```ts
it('reports an unknown oil id (absent from lookup) as missing', () => {
  const res = calculateRecipeProperties(
    [
      { oilId: 'known', weightGrams: 500 },
      { oilId: 'ghost', weightGrams: 500 },
    ],
    { known: { id: 'known', propertiesAvailable: true, fattyAcids: { oleic: 70, palmitic: 12 } } },
  );
  expect(res.missingOilIds).toContain('ghost');
  expect(res.coveragePercent).toBeCloseTo(50, 5);
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npm run test -w @soap-calc/core -- properties`
  Expected: FAIL — `missingOilIds` is empty.

- [ ] **Step 3: Fix all three files.** In each, drop the `if (oil)` guard so the id is always recorded when skipped.

`properties.ts:112-114`:
```ts
    if (!oil?.propertiesAvailable || !oil.fattyAcids) {
      missingOilIds.add(line.oilId);
      continue;
    }
```
`fatty-acids.ts:28-30`:
```ts
    if (!oil?.propertiesAvailable || !oil.fattyAcids) {
      missingOilIds.add(line.oilId);
      continue;
    }
```
`calculateRecipeIndexes.ts:31-33`:
```ts
    if (!oil || oil.iodine === undefined || oil.ins === undefined) {
      missingOilIds.add(row.line.oilId);
      continue;
    }
```

- [ ] **Step 4: Add the web indexes test.** Add to `calculateRecipeIndexes.test.ts` (a real oil id plus an unknown id):

```ts
it('reports an unknown oil id as missing for indexes', () => {
  const lines = [
    { key: 'a', oilId: 'olive-oil', weightGrams: '500', weightPercent: '' },
    { key: 'b', oilId: 'ghost-oil', weightGrams: '500', weightPercent: '' },
  ];
  const res = calculateRecipeIndexes(lines, DEFAULT_SETTINGS);
  expect(res.missingOilIds).toContain('ghost-oil');
});
```

- [ ] **Step 5: Run both suites.** Run: `npm run test -w @soap-calc/core -- properties` then `npm run test -w @soap-calc/web -- calculateRecipeIndexes`
  Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add packages/core/src/properties.ts packages/core/src/fatty-acids.ts packages/web/src/lib/calculateRecipeIndexes.ts packages/core/src/properties.test.ts packages/web/src/lib/calculateRecipeIndexes.test.ts
git commit -m "fix: report unknown oil ids as missing in properties, fatty acids, indexes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Fix dead FNWL alias keys + add invariant (LOW, #8)

**Files:**
- Modify: `packages/oils-data/src/normalize.ts:48` and `:53`
- Test: `packages/oils-data/src/normalize.test.ts`

**Root cause:** alias keys must equal `normalizeOilName(key)`, but `'rice bran oil refined'` and `'rapeseed oil unrefined canola'` contain words that normalization strips (`refined`, `unrefined`). Rapeseed genuinely goes unmatched (`legacy_only`); rice bran matches directly anyway (dead-but-harmless). Both are caught by an invariant.

- [ ] **Step 1: Write the failing invariant test.** Add to `normalize.test.ts` (imports `LEGACY_TO_FNWL_ALIASES`, `normalizeOilName`):

```ts
it('every LEGACY_TO_FNWL_ALIASES key is already a normalized name', () => {
  for (const key of Object.keys(LEGACY_TO_FNWL_ALIASES)) {
    expect(key).toBe(normalizeOilName(key));
  }
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npm run test -w @soap-calc/oils-data -- normalize`
  Expected: FAIL for `'rice bran oil refined'` and `'rapeseed oil unrefined canola'`.

- [ ] **Step 3: Fix the keys.** In `normalize.ts`, change line 48 and line 53:

```ts
  'rice bran oil': ['rice bran oil'],
```
```ts
  'rapeseed oil canola': ['rapeseed oil'],
```

- [ ] **Step 4: Run the invariant + rebuild.** Run: `npm run test -w @soap-calc/oils-data -- normalize` (PASS), then `npm run build:oils && npm run validate:oils`.
  Expected: `rapeseed-oil-canola` provenance improves from `legacy_only` toward an FNWL cross-check; validation passes.

- [ ] **Step 5: Commit** (include regenerated data if the build changed it):

```bash
git add packages/oils-data/src/normalize.ts packages/oils-data/src/normalize.test.ts packages/oils-data/data/
git commit -m "fix(oils-data): repair dead FNWL alias keys and assert keys are normalized

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Fix SAP-delta floating-point boundary (LOW, #11)

**Files:**
- Modify: `packages/oils-data/src/sap-policy.ts:29` and `:44` (the two delta comparisons)
- Test: `packages/oils-data/src/sap-policy.test.ts`

**Root cause:** `sapDeltaPercent(0.20, 0.19)` is `5.000000000000004`, so `<= 5` is false and an exactly-5% delta is misrouted to the conservative branch (wrong `confidence`/`sapKoh`).

- [ ] **Step 1: Write the failing test.** Add to `sap-policy.test.ts` (imports `resolvePrimarySap`):

```ts
it('treats an exactly-5% delta as within tolerance (FNWL verified)', () => {
  const res = resolvePrimarySap(0.20, 0.19);
  expect(res.confidence).toBe('verified');
  expect(res.primarySource).toBe('fnwl');
  expect(res.sapKoh).toBeCloseTo(0.19, 10);
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npm run test -w @soap-calc/oils-data -- sap-policy`
  Expected: FAIL — `confidence` is `'estimated'`.

- [ ] **Step 3: Add an epsilon.** In `sap-policy.ts`, change the two comparisons:

```ts
  if (deltaPct <= VERIFIED_DELTA_PCT + 1e-9) {
```
```ts
  if (deltaPct <= DISPUTED_DELTA_PCT + 1e-9) {
```

- [ ] **Step 4: Run + rebuild.** Run: `npm run test -w @soap-calc/oils-data -- sap-policy` (PASS), then `npm run build:oils && npm run validate:oils`.
  Expected: `baobab-oil` becomes `verified`/`fnwl` at `sapKoh 0.19`.

- [ ] **Step 5: Commit** (include regenerated data):

```bash
git add packages/oils-data/src/sap-policy.ts packages/oils-data/src/sap-policy.test.ts packages/oils-data/data/
git commit -m "fix(oils-data): tolerate float rounding at the 5%/10% SAP delta boundaries

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Autosave committed state, not mid-typing preview (LOW, #9)

**Files:**
- Modify: `packages/web/src/App.tsx:111`

**Root cause:** autosave receives `previewState.lines`/`previewSettings` (draft-merged), so a complete-but-intermediate keystroke value (e.g. `3` on the way to `300`) can be persisted and become the committed recipe on reload. Autosave the committed `lines`/`settings` instead — uncommitted (un-blurred) edits are intentionally not persisted.

- [ ] **Step 1: Change the autosave source** (App.tsx:111):

```ts
  useRecipeAutosave(recipeName, lines, settings, additives);
```

- [ ] **Step 2: Typecheck.** Run: `npm run build -w @soap-calc/web`
  Expected: PASS.

- [ ] **Step 3: Manual verify** via `/run`: set a line to `100`, start typing toward `300` (leave it at `3`), wait >1 s, reload the tab → the recipe shows the last committed value (`100`), not `3`. Blur-then-reload still persists a completed edit.

- [ ] **Step 4: Commit.**

```bash
git add packages/web/src/App.tsx
git commit -m "fix(web): autosave committed recipe state, not mid-edit preview values

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Decision D1: Partial-coverage index/property semantics (P1)

**Not code yet — needs your call.** When some recipe oils lack fatty-acid / iodine / INS data, `calculateRecipeProperties`, `calculateRecipeFattyAcids`, and `calculateRecipeIndexes` divide each oil's contribution by **total** weight, so every metric is scaled down by the uncovered fraction.

- **Option A (recommended): keep diluted, label clearly.** No math change. Rely on Task 8 (now names the missing oils) and confirm the UI shows "based on X% of recipe oils." Honest, invents no data — fits the app's verification ethos.
- **Option B: renormalize to covered weight.** Change the three `ratio = weightGrams / totalWeight` to divide by `coveredWeight` (computed in a first pass), so numbers land on the usual scale. Assumes missing oils behave like the covered ones — can mislead (an unknown hard oil shown as if it were the soft oils present).

Pick A or B before implementing; if B, it's a ~3-line-per-file change plus a test asserting a 50%-covered recipe reports the covered oils' full values. Default if unanswered: **A** (no change beyond Task 8).

---

## Final Task: Full green + summary

- [ ] **Step 1: Run the entire suite.** Run: `npm test`
  Expected: `validate:oils` passes and all three workspaces' tests pass.
- [ ] **Step 2: Production build.** Run: `npm run build:web`
  Expected: `tsc --noEmit` clean + Vite build succeeds.
- [ ] **Step 3:** Report which tasks landed, any manual-verification results, and the D1 decision taken.

---

## Self-review notes

- **Coverage:** every confirmed finding (#1–#12) maps to Tasks 1–11; the two plausible items map to Task 7 (P2) and Decision D1 (P1). #5 and #6 share Task 2; #3 and #12 share Task 5.
- **UI caveat:** #2, #3, #9, #12 have no automated test because the repo has no React test-render harness (adding one would violate "no new deps"); each has a concrete `/run` manual check plus, where possible, a lib-level anchor (Task 4 round-trip test).
- **Type consistency:** `hadDraft`, `weightInputId`, `percentInputId`, `batchInputId`, `applySyncedUpdate`, `resyncFromWeights`, `syncBatchTotalEdit` all match current App.tsx symbols; `ppoOzToPercentOfOil`, `roundPercentString` match recipeFile.ts; `LEGACY_TO_FNWL_ALIASES`, `normalizeOilName`, `resolvePrimarySap` match oils-data exports.
- **Data commits:** Tasks 9 and 10 change the oils build output; regenerated `packages/oils-data/data/` is staged with those commits.
