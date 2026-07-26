# Citric Acid Additive with Automatic Lye Compensation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `citric-acid` additive (CP/HP) whose lye consumption is automatically compensated in the recipe's lye totals, reusing the vinegar acid-compensation seam.

**Architecture:** A `lyeNeutralization` factor on the additive catalog entry; the acid math extracted from `extraLyeForAcidLiquid` into a shared `extraLyeForAcid`; per-line extras attached to `ComputedAdditive` and summed in the view model alongside the vinegar extra into the single existing `addExtraLye` call. Spec: `docs/superpowers/specs/2026-07-26-citric-acid-auto-lye-design.md`.

**Tech Stack:** TypeScript, Vitest, React, npm workspaces (`@soap-calc/core` pure math, `@soap-calc/web` UI). Playwright e2e.

## Global Constraints

- Chemistry constants stored as arithmetic expressions, not magic decimals: citric acid anhydrous MW `192.123`, factors `3 × 39.997 / 192.123` (NaOH) and `3 × 56.105 / 192.123` (KOH).
- Entry: id `citric-acid`, name `Citric acid (anhydrous)`, typical 1–2% of oils, `defaultStage: 'lye'`, `processes: ['cp', 'hp']` (never LS — conflicts with the LS neutralization feature).
- No copy anywhere implies pH reduction. Compensation-line copy: "added to lye — forms the citrate chelator" (alkali-neutral; the spec's "sodium citrate" wording would be wrong under KOH/dual — deliberate deviation, note in PR).
- The view model's exported `acidExtraLye` stays split-liquid-only (it is SplitLiquidPanel's display prop). The additive extra is a separate memo; only their sum feeds `addExtraLye`.
- One-pass invariant: additive grams resolve against the pre-compensation batch/solution weight; the extra lye never re-enters dose resolution.
- `fixedBatchExtrasGrams` unchanged. Displayed batch weight (`batchWeightWithExtras`) excludes acid extra-lye grams (vinegar parity).
- No source titles/authors in code, comments, or copy.
- Run all commands from the worktree root. Do not commit unless the step says so.

---

### Task 1: Core — `lyeNeutralization` field + `citric-acid` catalog entry

**Files:**
- Modify: `packages/core/src/additives.ts` (type at lines ~7–22, catalog array)
- Test: `packages/core/src/additives.test.ts`

**Interfaces:**
- Produces: `AdditiveCatalogEntry.lyeNeutralization?: { naohPerGram: number; kohPerGram: number }`; catalog entry id `'citric-acid'`. Task 2 consumes both.

- [ ] **Step 1: Write the failing tests** — append to `packages/core/src/additives.test.ts`:

```ts
describe('citric acid additive (auto-lye)', () => {
  it('offers citric acid for CP/HP at 1–2% into the lye water, never for LS', () => {
    const citric = catalogEntryById('citric-acid');
    expect(citric?.name).toBe('Citric acid (anhydrous)');
    expect(citric?.typicalLow).toBe(1);
    expect(citric?.typicalHigh).toBe(2);
    expect(citric?.defaultStage).toBe('lye');
    expect(citric?.processes).toEqual(['cp', 'hp']);
    expect(catalogEntriesForProcess('ls').some((e) => e.id === 'citric-acid')).toBe(false);
    expect(catalogEntriesForProcess('cp').some((e) => e.id === 'citric-acid')).toBe(true);
  });

  it('carries stoichiometric neutralization factors (triprotic, anhydrous MW 192.123)', () => {
    const factors = catalogEntryById('citric-acid')?.lyeNeutralization;
    expect(factors?.naohPerGram).toBeCloseTo(0.6246, 4);
    expect(factors?.kohPerGram).toBeCloseTo(0.8761, 4);
  });

  it('leaves every other entry without neutralization factors', () => {
    for (const entry of ADDITIVE_CATALOG) {
      if (entry.id !== 'citric-acid') expect(entry.lyeNeutralization).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd packages/core && npx vitest run src/additives.test.ts`. Expected: the three new tests FAIL (`citric-acid` undefined / `lyeNeutralization` not a property); all pre-existing tests PASS.

- [ ] **Step 3: Implement** — in `packages/core/src/additives.ts`:

Add to `AdditiveCatalogEntry` (after `doseUnit`):

```ts
  /** Acid additives: grams of PURE alkali consumed per gram of additive — identical in
   * meaning to AlternativeLiquidPreset.lyeNeutralization. The calc compensates
   * automatically (extraLyeForAcidAdditives) so the stated superfat survives. */
  lyeNeutralization?: { naohPerGram: number; kohPerGram: number };
```

Add above `ADDITIVE_CATALOG`:

```ts
/** Citric acid (anhydrous) C6H8O7 — triprotic, MW 192.123; moles of acid per gram.
 * (neutralization.ts carries 192.124/56.1056 for the LS after-cook path — different
 * atomic-mass rounding, numerically irrelevant.) */
const CITRIC_MOL_PER_GRAM = 1 / 192.123;
```

Add the entry after `chelator` (id order groups the chelation entries):

```ts
  {
    // Acid form of the citrate chelator: dissolved in the lye water it reacts with the
    // alkali to form citrate in situ. Consumes lye — compensated automatically, which is
    // the whole point of lyeNeutralization. CP/HP only: the LS neutralization feature
    // deliberately doses UNCOMPENSATED citric acid to consume a post-cook lye excess,
    // and compensating a logged line would add that lye straight back. Does not lower
    // finished-soap pH; copy must never imply it does.
    id: 'citric-acid',
    name: 'Citric acid (anhydrous)',
    typicalLow: 1,
    typicalHigh: 2,
    defaultStage: 'lye',
    processes: ['cp', 'hp'],
    lyeNeutralization: {
      naohPerGram: 3 * CITRIC_MOL_PER_GRAM * 39.997,
      kohPerGram: 3 * CITRIC_MOL_PER_GRAM * 56.105,
    },
  },
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/additives.test.ts`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/additives.ts packages/core/src/additives.test.ts
git commit -m "feat(core): citric-acid catalog entry with lye-neutralization factors"
```

---

### Task 2: Core — extract `extraLyeForAcid`, add `extraLyeForAcidAdditives`

**Files:**
- Modify: `packages/core/src/alternative-liquids.ts` (`extraLyeForAcidLiquid` at ~133–158)
- Test: `packages/core/src/alternative-liquids.test.ts`
- Check: `packages/core/src/index.ts` exports (`export * from './alternative-liquids.js'` should already cover new names — verify)

**Interfaces:**
- Consumes: `catalogEntryById`, `AdditiveCatalogEntry.lyeNeutralization` (Task 1). Import from `'./additives.js'` — no cycle (additives.ts does not import alternative-liquids.ts).
- Produces (Task 4 consumes):

```ts
export type AcidLyeRecipe = {
  lyeType: 'naoh' | 'koh' | 'dual';
  kohBlendPercent: number;
  naohPurityPercent: number;
  kohPurityPercent: number;
};
export function extraLyeForAcid(
  factors: { naohPerGram: number; kohPerGram: number },
  grams: number,
  recipe: AcidLyeRecipe,
): ExtraLyeForAcid;
export function extraLyeForAcidAdditives(
  additives: Array<{ catalogId: string; grams: number }>,
  recipe: AcidLyeRecipe,
): ExtraLyeForAcid;
```

- [ ] **Step 1: Write the failing tests** — append to `packages/core/src/alternative-liquids.test.ts` (its existing imports include `extraLyeForAcidLiquid` and `alternativeLiquidPreset`; add `extraLyeForAcid`, `extraLyeForAcidAdditives`):

```ts
describe('extraLyeForAcid (shared acid math)', () => {
  const recipe = { lyeType: 'naoh' as const, kohBlendPercent: 0, naohPurityPercent: 100, kohPurityPercent: 100 };

  it('extraLyeForAcidLiquid delegates: vinegar result is identical through both paths', () => {
    const preset = alternativeLiquidPreset('vinegar')!;
    const viaPreset = extraLyeForAcidLiquid(preset, 330, recipe);
    const viaFactors = extraLyeForAcid(preset.lyeNeutralization!, 330, recipe);
    expect(viaFactors).toEqual(viaPreset);
  });

  it('sums citric additive lines and ignores factor-less and invalid lines', () => {
    // 20 g citric at 0.6246 g NaOH/g → 12.49 g; second line adds 10 g → +6.25 g.
    const extra = extraLyeForAcidAdditives(
      [
        { catalogId: 'citric-acid', grams: 20 },
        { catalogId: 'citric-acid', grams: 10 },
        { catalogId: 'sugar-sorbitol', grams: 30 },
        { catalogId: '', grams: 15 },
        { catalogId: 'citric-acid', grams: 0 },
      ],
      recipe,
    );
    expect(extra.naohGrams).toBeCloseTo(30 * 0.6246, 2);
    expect(extra.kohGrams).toBe(0);
  });

  it('splits dual lye by KOH blend share and grosses up by each purity', () => {
    const extra = extraLyeForAcidAdditives(
      [{ catalogId: 'citric-acid', grams: 10 }],
      { lyeType: 'dual', kohBlendPercent: 40, naohPurityPercent: 97, kohPurityPercent: 90 },
    );
    expect(extra.naohGrams).toBeCloseTo((10 * 0.6 * 0.6246) / 0.97, 2);
    expect(extra.kohGrams).toBeCloseTo((10 * 0.4 * 0.8761) / 0.9, 2);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/alternative-liquids.test.ts`. Expected: new tests FAIL (functions not exported); existing vinegar tests PASS.

- [ ] **Step 3: Implement** — in `packages/core/src/alternative-liquids.ts`:

Add `import { catalogEntryById } from './additives.js';` at the top. Replace the body of `extraLyeForAcidLiquid` with the extraction (the recipe parameter's inline object type becomes the exported `AcidLyeRecipe`; keep `ExtraLyeForAcid` as is):

```ts
export type AcidLyeRecipe = {
  lyeType: 'naoh' | 'koh' | 'dual';
  kohBlendPercent: number;
  naohPurityPercent: number;
  kohPurityPercent: number;
};

/** Shared acid math: as-weighed extra lye for `grams` of an acid with the given pure-alkali
 * factors — dual lye allocates by KOH blend share, each alkali grossed up by its purity. */
export function extraLyeForAcid(
  factors: { naohPerGram: number; kohPerGram: number },
  grams: number,
  recipe: AcidLyeRecipe,
): ExtraLyeForAcid {
  if (!Number.isFinite(grams) || grams <= 0) {
    return { naohGrams: 0, kohGrams: 0 };
  }
  const naohPurity = recipe.naohPurityPercent > 0 ? recipe.naohPurityPercent / 100 : 1;
  const kohPurity = recipe.kohPurityPercent > 0 ? recipe.kohPurityPercent / 100 : 1;
  const kohShare =
    recipe.lyeType === 'koh'
      ? 1
      : recipe.lyeType === 'dual'
        ? Math.min(100, Math.max(0, recipe.kohBlendPercent)) / 100
        : 0;
  const naohGrams = (grams * (1 - kohShare) * factors.naohPerGram) / naohPurity;
  const kohGrams = (grams * kohShare * factors.kohPerGram) / kohPurity;
  return { naohGrams, kohGrams };
}

export function extraLyeForAcidLiquid(
  preset: AlternativeLiquidPreset,
  liquidGrams: number,
  recipe: AcidLyeRecipe,
): ExtraLyeForAcid {
  const factors = preset.lyeNeutralization;
  if (!factors) return { naohGrams: 0, kohGrams: 0 };
  return extraLyeForAcid(factors, liquidGrams, recipe);
}

/** Sum of acid compensation over additive lines whose catalog entry carries
 * lyeNeutralization (today: citric acid). `grams` is each line's RESOLVED dose weight,
 * so every dose basis (oil/batch/solution) and unit works unchanged. */
export function extraLyeForAcidAdditives(
  additives: Array<{ catalogId: string; grams: number }>,
  recipe: AcidLyeRecipe,
): ExtraLyeForAcid {
  let naohGrams = 0;
  let kohGrams = 0;
  for (const line of additives) {
    const factors = catalogEntryById(line.catalogId)?.lyeNeutralization;
    if (!factors) continue;
    const extra = extraLyeForAcid(factors, line.grams, recipe);
    naohGrams += extra.naohGrams;
    kohGrams += extra.kohGrams;
  }
  return { naohGrams, kohGrams };
}
```

Delete the old inline body/param type of `extraLyeForAcidLiquid` (its doc comment moves to `extraLyeForAcid`).

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/alternative-liquids.test.ts`, then the whole core package: `npx vitest run`. Expected: all pass (delegate equivalence proves vinegar behavior unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/alternative-liquids.ts packages/core/src/alternative-liquids.test.ts
git commit -m "feat(core): extract extraLyeForAcid; sum acid compensation over additive lines"
```

---

### Task 3: Web — per-line `extraLye` on `ComputedAdditive`

**Files:**
- Modify: `packages/web/src/lib/calculateAdditives.ts` (type at 12–21, `computeRecipeAdditives` at 23–48)
- Test: `packages/web/src/lib/calculateAdditives.test.ts`

**Interfaces:**
- Consumes: `extraLyeForAcid`, `catalogEntryById`, `AcidLyeRecipe` from `@soap-calc/core` (Tasks 1–2).
- Produces (Tasks 4–5 consume): `ComputedAdditive.extraLye?: { naohGrams: number; kohGrams: number }`; `computeRecipeAdditives(additives, basis, acidLyeRecipe?: AcidLyeRecipe)` — third parameter optional, omitted callers behave exactly as before.

- [ ] **Step 1: Write the failing tests** — append to `packages/web/src/lib/calculateAdditives.test.ts` (follow the file's existing fixtures for `AdditiveLine`; a line is `{ key, catalogId, name, amount, basis, unit, addAt }`):

```ts
const NAOH_RECIPE = { lyeType: 'naoh' as const, kohBlendPercent: 0, naohPurityPercent: 100, kohPurityPercent: 100 };

describe('per-line acid extra lye', () => {
  it('attaches extraLye to a citric line when the acid recipe context is passed', () => {
    const [line] = computeRecipeAdditives(
      [{ key: 'c', catalogId: 'citric-acid', name: 'Citric acid (anhydrous)', amount: '2', basis: 'oil', unit: 'percent', addAt: 'lye' }],
      { oilGrams: 1000, batchGrams: 1500, solutionGrams: 0 },
      NAOH_RECIPE,
    );
    expect(line.grams).toBe(20);
    expect(line.extraLye?.naohGrams).toBeCloseTo(20 * 0.6246, 2);
    expect(line.extraLye?.kohGrams).toBe(0);
  });

  it('attaches no extraLye without the context or for factor-less entries', () => {
    const noContext = computeRecipeAdditives(
      [{ key: 'c', catalogId: 'citric-acid', name: 'Citric', amount: '2', basis: 'oil', unit: 'percent', addAt: 'lye' }],
      { oilGrams: 1000, batchGrams: 1500, solutionGrams: 0 },
    );
    expect(noContext[0].extraLye).toBeUndefined();
    const sugar = computeRecipeAdditives(
      [{ key: 's', catalogId: 'sugar-sorbitol', name: 'Sugar', amount: '2', basis: 'oil', unit: 'percent', addAt: 'trace' }],
      { oilGrams: 1000, batchGrams: 1500, solutionGrams: 0 },
      NAOH_RECIPE,
    );
    expect(sugar[0].extraLye).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd packages/web && npx vitest run src/lib/calculateAdditives.test.ts`. Expected: FAIL (`extraLye` missing / arity).

- [ ] **Step 3: Implement** — in `calculateAdditives.ts`: add `extraLyeForAcid, catalogEntryById, type AcidLyeRecipe` to the `@soap-calc/core` import; extend the type and function:

```ts
export type ComputedAdditive = {
  // ...existing fields unchanged...
  /** Acid additives only (citric): compensation lye this line demands, for display.
   * Present only when computeRecipeAdditives received the acid recipe context. */
  extraLye?: { naohGrams: number; kohGrams: number };
};
```

In `computeRecipeAdditives`, add the optional third parameter `acidLyeRecipe?: AcidLyeRecipe` and, before `result.push`, compute:

```ts
    const factors = acidLyeRecipe ? catalogEntryById(line.catalogId)?.lyeNeutralization : undefined;
    const extraLye = factors ? extraLyeForAcid(factors, grams, acidLyeRecipe!) : undefined;
```

and spread into the pushed object: `...(extraLye ? { extraLye } : {})`.

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/calculateAdditives.test.ts`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/calculateAdditives.ts packages/web/src/lib/calculateAdditives.test.ts
git commit -m "feat(web): attach per-line acid compensation lye to computed additives"
```

---

### Task 4: Web — view-model wiring (separate memos, one `addExtraLye`)

**Files:**
- Modify: `packages/web/src/hooks/useRecipeViewModel.ts` (`computedAdditives` memo ~233–241, `acidExtraLye` memo ~270–292, `finalResult` ~321–324)
- Test: `packages/web/src/hooks/useRecipeViewModel.test.tsx`

**Interfaces:**
- Consumes: `extraLyeForAcidAdditives` (Task 2), `computeRecipeAdditives` third param (Task 3).
- Produces: view-model return unchanged in shape — `acidExtraLye` field REMAINS split-liquid-only; `computedAdditives` lines now carry `extraLye` (Task 5 consumes); `result` (finalResult) includes both compensations.

- [ ] **Step 1: Extend the probe harness** — in `useRecipeViewModel.test.tsx`, the `probe` helper hardcodes `additives: createEmptyAdditives()`. Add an optional parameter (default keeps every existing call unchanged):

```ts
function probe(
  onVm: (vm: unknown) => void,
  settingsOverride: Partial<RecipeSettings> = {},
  process: ProcessId = 'cp',
  vesselVolumeCm3?: number | null,
  additivesOverride?: AdditiveLine[],
) {
  // ...inside useRecipeViewModel call:
  additives: additivesOverride ?? createEmptyAdditives(),
}
```

Import `type AdditiveLine` from `'../lib/recipe'`.

- [ ] **Step 2: Write the failing tests** — append:

```ts
const CITRIC_LINE: AdditiveLine = {
  key: 'citric-1', catalogId: 'citric-acid', name: 'Citric acid (anhydrous)',
  amount: '2', basis: 'oil', unit: 'percent', addAt: 'lye',
};

test('a citric additive raises the lye result but not the split-liquid acid figure', () => {
  let without: any;
  let withCitric: any;
  probe((vm) => { without = vm; });
  probe((vm) => { withCitric = vm; }, {}, 'cp', undefined, [CITRIC_LINE]);
  const oilGrams = withCitric.totalOilGrams;
  const expectedExtra = (oilGrams * 0.02 * 0.6246); // NaOH purity 100 in DEFAULT_SETTINGS — adjust if not
  expect(withCitric.result.naohWeightGrams - without.result.naohWeightGrams).toBeCloseTo(expectedExtra, 1);
  // acidExtraLye is SplitLiquidPanel's display prop — additive acid must not leak into it.
  expect(withCitric.acidExtraLye).toBeNull();
  const line = withCitric.computedAdditives.find((a: any) => a.catalogId === 'citric-acid');
  expect(line.extraLye.naohGrams).toBeCloseTo(expectedExtra, 1);
});

test('batch-basis citric resolves against the pre-compensation batch weight (one-pass pin)', () => {
  let vm: any;
  probe((v) => { vm = v; }, {}, 'cp', undefined, [{ ...CITRIC_LINE, basis: 'batch' }]);
  const line = vm.computedAdditives.find((a: any) => a.catalogId === 'citric-acid');
  // The dose basis must be the batch weight BEFORE addExtraLye. If a refactor ever feeds
  // the compensated result back into dose resolution, grams inflate and this fails.
  const preBatch = vm.batchSheetData /* sanity only */ && line.grams;
  expect(line.grams).toBeCloseTo(0.02 * (vm.result.totalBatchWeightGrams - line.extraLye.naohGrams), 1);
});
```

Note for the implementer: `DEFAULT_SETTINGS.naohPurityPercent` — check its value first (`grep naohPurityPercent packages/web/src/lib/recipe.ts`); if it is not 100, divide `expectedExtra` by purity/100. If the pin test's arithmetic proves awkward against the real shape, an equivalent pin is: compute `probe` twice, once with `basis: 'oil'` at an amount chosen so grams match — the REQUIRED property is only that batch-basis grams are derived from the pre-compensation batch weight; assert that exact relation with whatever expression the real fields support, and document it in the test name.

- [ ] **Step 3: Run to verify failure** — `npx vitest run src/hooks/useRecipeViewModel.test.tsx`. Expected: new tests FAIL (no compensation applied yet; delta ≈ 0).

- [ ] **Step 4: Implement** — in `useRecipeViewModel.ts`:

1. Import `extraLyeForAcidAdditives` from `@soap-calc/core` (extend the existing core import list at line 2).
2. `computedAdditives` memo: pass the acid context as the third argument and extend deps:

```ts
  const acidLyeRecipe = useMemo(
    () => ({
      lyeType: previewSettings.lyeType,
      kohBlendPercent: Number(previewSettings.kohBlendPercent) || 0,
      naohPurityPercent: Number(previewSettings.naohPurityPercent) || 100,
      kohPurityPercent: Number(previewSettings.kohPurityPercent) || 100,
    }),
    [previewSettings.lyeType, previewSettings.kohBlendPercent, previewSettings.naohPurityPercent, previewSettings.kohPurityPercent],
  );
  const computedAdditives = useMemo(
    () => computeRecipeAdditives(additives, { oilGrams: totalOilGrams, batchGrams: baseBatchGrams, solutionGrams }, acidLyeRecipe),
    [additives, totalOilGrams, baseBatchGrams, solutionGrams, acidLyeRecipe],
  );
```

(The existing `acidExtraLye` and `fixedBatchExtrasGrams` memos can also consume `acidLyeRecipe` in place of their inline objects — same values, less duplication; keep their behavior identical.)

3. Additive extra memo (after `computedAdditives`), summing the per-line values Task 3 attached (no double math):

```ts
  // Acid ADDITIVES (citric) get the same compensation as acid liquids, but through their
  // own memo: acidExtraLye is SplitLiquidPanel's display prop and must stay split-only.
  const additiveAcidExtraLye = useMemo(() => {
    let naohGrams = 0;
    let kohGrams = 0;
    for (const line of computedAdditives) {
      if (!line.extraLye) continue;
      naohGrams += line.extraLye.naohGrams;
      kohGrams += line.extraLye.kohGrams;
    }
    return naohGrams > 0 || kohGrams > 0 ? { naohGrams, kohGrams } : null;
  }, [computedAdditives]);
```

4. `finalResult` sums both (one `addExtraLye` call):

```ts
  const totalAcidExtraLye = useMemo(() => {
    if (!acidExtraLye && !additiveAcidExtraLye) return null;
    return {
      naohGrams: (acidExtraLye?.naohGrams ?? 0) + (additiveAcidExtraLye?.naohGrams ?? 0),
      kohGrams: (acidExtraLye?.kohGrams ?? 0) + (additiveAcidExtraLye?.kohGrams ?? 0),
    };
  }, [acidExtraLye, additiveAcidExtraLye]);
  const finalResult = useMemo(
    () => (result && totalAcidExtraLye ? addExtraLye(result, totalAcidExtraLye) : result),
    [result, totalAcidExtraLye],
  );
```

The returned `acidExtraLye` field stays exactly as-is.

- [ ] **Step 5: Run to verify pass** — `npx vitest run src/hooks/useRecipeViewModel.test.tsx`, then all web unit tests: `npx vitest run`. Expected: all pass (the pin test may need its arithmetic finalized per the Step 2 note — the invariant, not the expression, is the requirement).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/hooks/useRecipeViewModel.ts packages/web/src/hooks/useRecipeViewModel.test.tsx
git commit -m "feat(web): compensate citric-acid additive lye in the recipe result"
```

---

### Task 5: Web — panel display + empty-state copy

**Files:**
- Modify: `packages/web/src/components/AdditivesPanel.tsx` (hint area after the typical-range hint ~299–305; empty state ~157–161)
- Test: `packages/web/src/components/AdditivesPanel.test.tsx`

**Interfaces:**
- Consumes: `ComputedAdditive.extraLye` (Task 3) via the panel's existing `computed` prop; `formatWeight`/`weightUnit` already imported.

- [ ] **Step 1: Write the failing tests** — the file's `makeComputed(line)` helper builds a `ComputedAdditive`; give it an optional second param `extra?: { naohGrams: number; kohGrams: number }` spread as `...(extra ? { extraLye: extra } : {})`. Append:

```ts
describe('acid compensation line', () => {
  it('shows the compensation lye for a citric row', () => {
    const line = makeLine({ catalogId: 'citric-acid', name: 'Citric acid (anhydrous)', amount: '2', addAt: 'lye' });
    render(
      <AdditivesPanel
        additives={[line]}
        computed={[makeComputed(line, { naohGrams: 12.49, kohGrams: 0 })]}
        weightUnit="g"
        process="cp"
        onChange={() => {}}
      />,
    );
    const hint = screen.getByText(/added to lye/);
    expect(hint.textContent).toContain('+12.5 g NaOH');
    expect(hint.textContent).toContain('citrate');
    expect(hint.textContent?.toLowerCase()).not.toContain('ph');
  });

  it('shows no compensation line for additives without extraLye', () => {
    const line = makeLine({ catalogId: 'sugar-sorbitol', name: 'Sugar' });
    render(
      <AdditivesPanel additives={[line]} computed={[makeComputed(line)]} weightUnit="g" process="cp" onChange={() => {}} />,
    );
    expect(screen.queryByText(/added to lye/)).toBeNull();
  });
});
```

(If `formatWeight(12.49, 'g')` renders other than `12.5 g`, run `grep -n "formatWeight" packages/web/src/lib/weightUnits.ts`, check its rounding, and match the assertion to the real format — the assertion must test the actual formatter, not force a new one.)

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/components/AdditivesPanel.test.tsx`. Expected: first new test FAILS (no compensation line rendered).

- [ ] **Step 3: Implement** — in `AdditivesPanel.tsx`, after the typical-range hint block (the `{entry && (<p className="additive-list__hint">Typical …</p>)}`), add:

```tsx
                {row?.extraLye && (row.extraLye.naohGrams > 0 || row.extraLye.kohGrams > 0) && (
                  <p className="additive-list__hint">
                    {[
                      row.extraLye.naohGrams > 0
                        ? `+${formatWeight(row.extraLye.naohGrams, weightUnit)} NaOH`
                        : null,
                      row.extraLye.kohGrams > 0
                        ? `+${formatWeight(row.extraLye.kohGrams, weightUnit)} KOH`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}{' '}
                    added to lye — forms the citrate chelator
                  </p>
                )}
```

Update the empty-state copy (lines ~158–161) from "…not included in lye math." to "…not included in lye math (citric acid's compensation lye is added automatically)."

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/components/AdditivesPanel.test.tsx`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/AdditivesPanel.tsx packages/web/src/components/AdditivesPanel.test.tsx
git commit -m "feat(web): show citric-acid compensation lye on the additive row"
```

---

### Task 6: E2E + full verification

**Files:**
- Modify: `packages/web/e2e/exploratory.spec.ts` (additives describe block at ~442)

**Interfaces:**
- Consumes: everything above; the spec file's existing helpers `resultDd(page, /^NaOH/)` (verify the exact result-row label with `grep -n "resultDd" packages/web/e2e/exploratory.spec.ts` and follow the sugar test's structure at ~443–455).

- [ ] **Step 1: Write the e2e test** — inside the `additives` describe block:

```ts
  test('citric acid at 2% adds compensation NaOH to the lye figures', async ({ page }) => {
    const naohBefore = num(await resultDd(page, /NaOH/));
    await page.getByRole('button', { name: '+ Add', exact: true }).click();
    const row = page.locator('ul[aria-label="Recipe additives"] li').first();
    await row.getByLabel('Additive type').selectOption({ label: 'Citric acid (anhydrous)' });
    await row.getByLabel(/^Amount( for .*)?$/).fill('2');
    await expect(row.getByText(/added to lye/)).toBeVisible();
    const naohAfter = num(await resultDd(page, /NaOH/));
    // 2% of the recipe's oils × 0.6246 — assert the delta is positive and in range rather
    // than exact, since the starter recipe's oil weight is what the page defines.
    expect(naohAfter).toBeGreaterThan(naohBefore);
  });
```

(Match `num`, `resultDd`, and the NaOH row's real label to the file's existing usage — copy the working pattern from the sugar test above it; if the NaOH figure needs a different matcher, use whatever that spec file already queries lye results with.)

- [ ] **Step 2: Run e2e** — from `packages/web`: `npx playwright test e2e/exploratory.spec.ts -g "citric"` (check `packages/web/package.json` scripts for the canonical e2e command and use that if it differs). Expected: PASS.

- [ ] **Step 3: Full verification** — from the worktree root: `npm test` (all workspaces) and `npm run build:web`. Expected: everything green.

- [ ] **Step 4: Commit**

```bash
git add packages/web/e2e/exploratory.spec.ts
git commit -m "test(e2e): citric-acid additive raises the NaOH figure"
```

---

## Self-Review (completed)

- **Spec coverage:** catalog entry + factors (Task 1); shared extraction + additive summing + purity/dual (Task 2); per-line `extraLye` (Task 3); split memos, one `addExtraLye`, one-pass pin, `acidExtraLye` stays split-only (Task 4); panel line + empty-state copy + pH guardrail (Task 5); e2e + full suite (Task 6). `fixedBatchExtrasGrams`/batch-weight parity: intentionally no task — constraint section forbids touching them.
- **Copy deviation from spec (flagged):** "forms the citrate chelator" instead of "forms sodium citrate" — alkali-correct under KOH/dual. Noted in Global Constraints for the PR description.
- **Type consistency:** `AcidLyeRecipe`, `ExtraLyeForAcid`, `ComputedAdditive.extraLye`, `extraLyeForAcid(factors, grams, recipe)` used identically across Tasks 2–5.
