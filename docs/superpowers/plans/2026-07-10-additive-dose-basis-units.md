# Additive Dose Basis + Units (Phase 0.4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each additive line an explicit dose descriptor — an `amount` interpreted by a `basis` (% of oil vs % of the wet batch) and a `unit` (percent vs parts-per-thousand) — replacing the implicit "% of oil".

**Architecture:** Pure dose math (`parseDoseAmount`, `gramsFromDose`) added to `@soap-calc/core`. `AdditiveLine.percentOfOil` becomes `amount` + `basis` + `unit`; `computeRecipeAdditives` takes both `oilGrams` and the wet-batch `batchGrams` and picks the basis weight. Split-liquid, PCSF, and cook superfat are untouched. Migration keeps old drafts/files byte-identical.

**Tech Stack:** TypeScript strict, npm workspaces (`@soap-calc/core` pure math, `@soap-calc/web` React 19 + Vite), Vitest (no `globals`; component tests use `// @vitest-environment jsdom` + `afterEach(cleanup)`, `.getAttribute`/`getAllByRole`, no jest-dom).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-10-additive-dose-basis-units-design.md` — implement exactly.
- **Additives only.** No core-lye change, no property/fatty-acid change. Split-liquid, PCSF, cook superfat keep their own `percentOfOil` field.
- **Batch basis = wet batch = oils+lye+water**, using the VM's existing base: `displayTotals?.batchWeightGrams ?? result?.totalBatchWeightGrams ?? 0`. Non-circular (excludes all extras).
- **Ceilings:** `percent` ≤ 100, `ppt` ≤ 1000 (both cap at "100% of basis").
- **Defaults:** new/legacy lines are `basis:'oil'`, `unit:'percent'` → CP and existing recipes behave byte-identically.
- **No LS diluted-solution basis** (Phase 1) and **no preservative percentages** (supplier-sourced) — do not add either.
- **Anonymity:** numbers/behavior only; never name a source in code or UI.
- Run commands from repo root `/Users/str/soap-calc`. Do not commit/push beyond the per-task commits below unless asked. Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Full gate: `npm test` (tsc --noEmit across all packages + validate:oils + all vitest). Targeted: `npx vitest run <path>`.

---

## File Structure

- `packages/core/src/additives.ts` — **Task 1**: add `DoseUnit`, `DoseBasis`, `parseDoseAmount`, `gramsFromDose` (keep `parsePercentOfOil`/`gramsFromPercentOfOil`). Auto-exported via `export * from './additives.js'`.
- `packages/web/src/lib/formatDose.ts` — **Task 2** (new): `formatDose(amount, unit, basis)`.
- `packages/web/src/lib/recipe.ts` — **Task 3**: `AdditiveLine` reshape + migration.
- `packages/web/src/lib/calculateAdditives.ts` — **Task 3**: `ComputedAdditive` reshape + dose math.
- `packages/web/src/hooks/useRecipeViewModel.ts` — **Task 3**: wet-batch grams into the compute.
- `packages/web/src/lib/recipeStorage.ts` — **Task 3**: draft save (`cloneAdditives`).
- `packages/web/src/lib/recipeFile.ts` — **Task 3**: file serialize/parse/`recipeAdditivesFromFile`.
- `packages/web/src/components/AdditivesPanel.tsx` — **Task 3** (consume computed rows) + **Task 5** (dose-mode select).
- `packages/web/src/App.tsx` — **Task 3**: pass `computed`.
- `packages/web/src/components/ResultsPanel.tsx`, `BatchSheet.tsx` — **Task 4**: `formatDose` display.
- `packages/web/src/hooks/useFormulationInsights.ts` — **Task 4**: oil-equivalent total.

**Task order & green bridge:** Task 3 reshapes the types atomically (the web package only compiles once every consumer moves), but keeps a **transitional `ComputedAdditive.percentOfOil` = oil-equivalent %** (`grams/oilGrams×100`) so ResultsPanel/BatchSheet/insights compile and read correctly without changing in Task 3. Task 4 swaps display to `formatDose`, switches insights to read grams, and **drops** the transitional field. Task 5 adds the user-facing basis/unit control last (so display is already accurate when the control ships). Every task ends green.

---

### Task 1: Core dose primitives

**Files:**
- Modify: `packages/core/src/additives.ts`
- Test: `packages/core/src/additives.test.ts`

**Interfaces:**
- Produces: `type DoseUnit = 'percent' | 'ppt'`; `type DoseBasis = 'oil' | 'batch'`; `parseDoseAmount(value: string, unit: DoseUnit): number | null`; `gramsFromDose(basisWeightGrams: number, amount: number, unit: DoseUnit): number | null`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/additives.test.ts` (keep existing imports; add the new symbols to the top `import { … } from './additives.js'` / `'./additives'` line used by that file):

```ts
import { describe, expect, it } from 'vitest';
import { gramsFromDose, parseDoseAmount } from './additives.js';

describe('parseDoseAmount', () => {
  it('accepts percent up to 100 and rejects above', () => {
    expect(parseDoseAmount('5', 'percent')).toBe(5);
    expect(parseDoseAmount('100', 'percent')).toBe(100);
    expect(parseDoseAmount('100.1', 'percent')).toBeNull();
  });
  it('accepts ppt up to 1000 and rejects above', () => {
    expect(parseDoseAmount('3', 'ppt')).toBe(3);
    expect(parseDoseAmount('1000', 'ppt')).toBe(1000);
    expect(parseDoseAmount('1001', 'ppt')).toBeNull();
  });
  it('rejects empty, negative, and non-numeric', () => {
    expect(parseDoseAmount('', 'percent')).toBeNull();
    expect(parseDoseAmount('-1', 'ppt')).toBeNull();
    expect(parseDoseAmount('abc', 'percent')).toBeNull();
  });
});

describe('gramsFromDose', () => {
  it('percent divides by 100, ppt divides by 1000', () => {
    expect(gramsFromDose(1000, 5, 'percent')).toBe(50);
    expect(gramsFromDose(1000, 3, 'ppt')).toBe(3);
  });
  it('returns null for negative basis or amount', () => {
    expect(gramsFromDose(-1, 5, 'percent')).toBeNull();
    expect(gramsFromDose(1000, -5, 'ppt')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/additives.test.ts`
Expected: FAIL — `parseDoseAmount`/`gramsFromDose` are not exported.

- [ ] **Step 3: Implement the primitives**

In `packages/core/src/additives.ts`, add after the existing `parsePercentOfOil` function (do not remove `parsePercentOfOil`/`gramsFromPercentOfOil`):

```ts
export type DoseUnit = 'percent' | 'ppt';
export type DoseBasis = 'oil' | 'batch';

/** Validate a dose amount for its unit. Percent caps at 100, ppt at 1000 (both = 100% of basis).
 * Returns the numeric amount, or null when empty/negative/non-finite/over the ceiling. */
export function parseDoseAmount(value: string, unit: DoseUnit): number | null {
  if (value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  const ceiling = unit === 'ppt' ? 1000 : 100;
  if (n > ceiling) return null;
  return n;
}

/** Grams from a dose amount against a basis weight. percent = amount/100, ppt = amount/1000. */
export function gramsFromDose(
  basisWeightGrams: number,
  amount: number,
  unit: DoseUnit,
): number | null {
  if (!Number.isFinite(basisWeightGrams) || basisWeightGrams < 0) return null;
  if (!Number.isFinite(amount) || amount < 0) return null;
  const divisor = unit === 'ppt' ? 1000 : 100;
  return (basisWeightGrams * amount) / divisor;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/src/additives.test.ts`
Expected: PASS (all, including existing `additives` tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/additives.ts packages/core/src/additives.test.ts
git commit -m "feat(core): add dose-unit/basis primitives (parseDoseAmount, gramsFromDose)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `formatDose` display helper

**Files:**
- Create: `packages/web/src/lib/formatDose.ts`
- Test: `packages/web/src/lib/formatDose.test.ts` (new)

**Interfaces:**
- Consumes: `DoseUnit`, `DoseBasis` from `@soap-calc/core`; `formatGrams` from `./format`.
- Produces: `formatDose(amount: number, unit: DoseUnit, basis: DoseBasis): string`.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/lib/formatDose.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatDose } from './formatDose';

describe('formatDose', () => {
  it('formats the four basis/unit combinations', () => {
    expect(formatDose(5, 'percent', 'oil')).toBe('5% of oil');
    expect(formatDose(1, 'percent', 'batch')).toBe('1% of batch');
    expect(formatDose(3, 'ppt', 'oil')).toBe('3 ppt of oil');
    expect(formatDose(2, 'ppt', 'batch')).toBe('2 ppt of batch');
  });
  it('rounds to one decimal like the rest of the UI', () => {
    expect(formatDose(0.25, 'percent', 'oil')).toBe('0.3% of oil');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/web/src/lib/formatDose.test.ts`
Expected: FAIL — module `./formatDose` not found.

- [ ] **Step 3: Implement `formatDose`**

Create `packages/web/src/lib/formatDose.ts`:

```ts
import type { DoseBasis, DoseUnit } from '@soap-calc/core';
import { formatGrams } from './format';

/** Human dose label, e.g. "5% of oil", "1% of batch", "3 ppt of oil". */
export function formatDose(amount: number, unit: DoseUnit, basis: DoseBasis): string {
  const basisWord = basis === 'batch' ? 'batch' : 'oil';
  const value = formatGrams(amount, 1);
  return unit === 'ppt' ? `${value} ppt of ${basisWord}` : `${value}% of ${basisWord}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/web/src/lib/formatDose.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/formatDose.ts packages/web/src/lib/formatDose.test.ts
git commit -m "feat(web): add formatDose dose-label helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Reshape `AdditiveLine`/`ComputedAdditive`, dose calc, persistence

Atomic type reshape: the web package compiles only once every consumer moves. Behavior stays byte-identical (every line is `oil`/`percent`; batch/ppt are unreachable until Task 5). `ComputedAdditive` keeps a **transitional `percentOfOil` = oil-equivalent %** so display/insights are untouched here.

**Files:**
- Modify: `packages/web/src/lib/recipe.ts`, `packages/web/src/lib/calculateAdditives.ts`, `packages/web/src/hooks/useRecipeViewModel.ts`, `packages/web/src/lib/recipeStorage.ts`, `packages/web/src/lib/recipeFile.ts`, `packages/web/src/components/AdditivesPanel.tsx`, `packages/web/src/App.tsx`
- Test: `packages/web/src/lib/calculateAdditives.test.ts`, `packages/web/src/lib/recipe.test.ts`, plus rename sweep of existing additive tests (see Step 8)

**Interfaces:**
- Produces:
  - `AdditiveLine = { key: string; catalogId: string; name: string; amount: string; basis: DoseBasis; unit: DoseUnit; addAt: AdditiveStage }`
  - `ComputedAdditive = { key: string; catalogId: string; name: string; amount: number; unit: DoseUnit; basis: DoseBasis; grams: number; addAt: AdditiveStage; percentOfOil: number }` *(percentOfOil = oil-equivalent bridge; removed in Task 4)*
  - `computeRecipeAdditives(additives: AdditiveLine[], weights: { oilGrams: number; batchGrams: number }): ComputedAdditive[]`
  - `AdditivesPanel` prop change: remove `totalOilGrams`, add `computed: ComputedAdditive[]`.
- Consumes: `parseDoseAmount`, `gramsFromDose`, `DoseUnit`, `DoseBasis` (Task 1).

- [ ] **Step 1: Write the failing calc + migration tests**

Add to `packages/core`-independent web test `packages/web/src/lib/calculateAdditives.test.ts` (adapt existing imports; `computeRecipeAdditives` now takes a weights object):

```ts
import { describe, expect, it } from 'vitest';
import { computeRecipeAdditives } from './calculateAdditives';
import type { AdditiveLine } from './recipe';

function line(over: Partial<AdditiveLine>): AdditiveLine {
  return { key: 'k', catalogId: '', name: 'X', amount: '', basis: 'oil', unit: 'percent', addAt: 'trace', ...over };
}

describe('computeRecipeAdditives dose basis/unit', () => {
  it('percent of oil uses oil weight', () => {
    const [row] = computeRecipeAdditives([line({ amount: '5' })], { oilGrams: 1000, batchGrams: 1500 });
    expect(row.grams).toBe(50);
    expect(row.percentOfOil).toBe(5); // oil-equivalent bridge
  });
  it('percent of batch uses the wet-batch weight', () => {
    const [row] = computeRecipeAdditives([line({ amount: '1', basis: 'batch' })], { oilGrams: 1000, batchGrams: 1500 });
    expect(row.grams).toBe(15);
    expect(row.percentOfOil).toBeCloseTo(1.5); // 15g / 1000g oil
  });
  it('ppt of oil divides by 1000', () => {
    const [row] = computeRecipeAdditives([line({ amount: '3', unit: 'ppt' })], { oilGrams: 1000, batchGrams: 1500 });
    expect(row.grams).toBe(3);
  });
  it('skips a batch-basis line when batch weight is unavailable', () => {
    expect(computeRecipeAdditives([line({ amount: '1', basis: 'batch' })], { oilGrams: 1000, batchGrams: 0 })).toEqual([]);
  });
});
```

Add to `packages/web/src/lib/recipe.test.ts`:

```ts
import { normalizeAdditiveLine } from './recipe';

describe('normalizeAdditiveLine dose migration', () => {
  it('maps a legacy percentOfOil field to amount with oil/percent defaults', () => {
    const line = normalizeAdditiveLine({ key: 'k', percentOfOil: '4' } as never);
    expect(line.amount).toBe('4');
    expect(line.basis).toBe('oil');
    expect(line.unit).toBe('percent');
  });
  it('keeps an explicit amount + basis + unit', () => {
    const line = normalizeAdditiveLine({ key: 'k', amount: '3', basis: 'batch', unit: 'ppt' });
    expect(line).toMatchObject({ amount: '3', basis: 'batch', unit: 'ppt' });
  });
  it('defaults unknown basis/unit to oil/percent', () => {
    const line = normalizeAdditiveLine({ key: 'k', amount: '2', basis: 'x' as never, unit: 'y' as never });
    expect(line.basis).toBe('oil');
    expect(line.unit).toBe('percent');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run packages/web/src/lib/calculateAdditives.test.ts packages/web/src/lib/recipe.test.ts`
Expected: FAIL (type errors / wrong shape — `amount`/`basis`/`unit` don't exist yet).

- [ ] **Step 3: Reshape `AdditiveLine` + migration in `recipe.ts`**

In `packages/web/src/lib/recipe.ts`: extend the core import and reshape the type + constructors.

Change the import line 1 to add the dose types:
```ts
import type { AdditiveStage, DoseBasis, DoseUnit, TarLyeTreatment, WaterMode } from '@soap-calc/core';
```

Replace the `AdditiveLine` type:
```ts
export type AdditiveLine = {
  key: string;
  catalogId: string;
  name: string;
  amount: string;
  basis: DoseBasis;
  unit: DoseUnit;
  addAt: AdditiveStage;
};
```

Replace `normalizeAdditiveLine` (widen the input type to read a legacy `percentOfOil`, prefer `amount`):
```ts
export function normalizeAdditiveLine(
  partial: Partial<AdditiveLine> & { percentOfOil?: string } & Pick<AdditiveLine, 'key'>,
): AdditiveLine {
  const addAt =
    partial.addAt === 'lye' ||
    partial.addAt === 'oils' ||
    partial.addAt === 'trace' ||
    partial.addAt === 'top' ||
    partial.addAt === 'after_cook'
      ? partial.addAt
      : 'trace';
  const basis = partial.basis === 'batch' ? 'batch' : 'oil';
  const unit = partial.unit === 'ppt' ? 'ppt' : 'percent';
  const amount =
    typeof partial.amount === 'string'
      ? partial.amount
      : typeof partial.percentOfOil === 'string'
        ? partial.percentOfOil
        : '';
  return {
    key: partial.key,
    catalogId: typeof partial.catalogId === 'string' ? partial.catalogId : '',
    name: typeof partial.name === 'string' ? partial.name : '',
    amount,
    basis,
    unit,
    addAt,
  };
}
```

Replace `additivesFromSaved` to spread the saved line (so both new `amount`/`basis`/`unit` and a legacy `percentOfOil` reach the normalizer):
```ts
export function additivesFromSaved(
  saved: Array<Omit<AdditiveLine, 'key'>> | undefined,
): AdditiveLine[] {
  if (!saved?.length) return createEmptyAdditives();
  return saved.map((line) => normalizeAdditiveLine({ key: newAdditiveKey(), ...line }));
}
```

(`SplitLiquidSettings.percentOfOil`, `DEFAULT_SPLIT_LIQUID`, and `normalizeSplitLiquid` are unchanged.)

- [ ] **Step 4: Reshape `ComputedAdditive` + dose math in `calculateAdditives.ts`**

Replace the top of `packages/web/src/lib/calculateAdditives.ts` (`computeRecipeAdditives` + `ComputedAdditive`; keep `computeSplitLiquidGrams` and `computePostCookSuperfat` as-is):
```ts
import {
  gramsFromDose,
  gramsFromPercentOfOil,
  parseDoseAmount,
  parsePercentOfOil,
  type DoseBasis,
  type DoseUnit,
} from '@soap-calc/core';
import type { AdditiveLine, RecipeSettings } from './recipe';

export type ComputedAdditive = {
  key: string;
  catalogId: string;
  name: string;
  amount: number;
  unit: DoseUnit;
  basis: DoseBasis;
  grams: number;
  addAt: AdditiveLine['addAt'];
  /** Oil-equivalent % (grams / oilGrams × 100) — transitional bridge for display/insights; removed in Task 4. */
  percentOfOil: number;
};

export function computeRecipeAdditives(
  additives: AdditiveLine[],
  { oilGrams, batchGrams }: { oilGrams: number; batchGrams: number },
): ComputedAdditive[] {
  const result: ComputedAdditive[] = [];
  for (const line of additives) {
    const basisWeight = line.basis === 'batch' ? batchGrams : oilGrams;
    if (basisWeight <= 0) continue;
    const amount = parseDoseAmount(line.amount, line.unit);
    if (amount === null || amount === 0) continue;
    const grams = gramsFromDose(basisWeight, amount, line.unit);
    if (grams === null) continue;
    result.push({
      key: line.key,
      catalogId: line.catalogId,
      name: line.name.trim() || 'Additive',
      amount,
      unit: line.unit,
      basis: line.basis,
      grams,
      addAt: line.addAt,
      percentOfOil: oilGrams > 0 ? (grams / oilGrams) * 100 : 0,
    });
  }
  return result;
}
```
(`computeSplitLiquidGrams` still uses `parsePercentOfOil`/`gramsFromPercentOfOil` — leave the imports it needs.)

- [ ] **Step 5: Feed wet-batch grams from the view-model**

In `packages/web/src/hooks/useRecipeViewModel.ts`, near the existing `totalOilGrams` computation add:
```ts
  const baseBatchGrams = displayTotals?.batchWeightGrams ?? result?.totalBatchWeightGrams ?? 0;
```
Change the `computedAdditives` memo to pass both weights and add `baseBatchGrams` to its deps:
```ts
  const computedAdditives = useMemo(
    () => computeRecipeAdditives(additives, { oilGrams: totalOilGrams, batchGrams: baseBatchGrams }),
    [additives, totalOilGrams, baseBatchGrams],
  );
```

- [ ] **Step 6: Update the two serialize/deserialize pairs**

In `packages/web/src/lib/recipeStorage.ts`, replace `cloneAdditives` (the draft **save** path):
```ts
function cloneAdditives(additives: AdditiveLine[]): SavedAdditiveLine[] {
  return additives.map(({ catalogId, name, amount, basis, unit, addAt }) => ({
    catalogId,
    name,
    amount,
    basis,
    unit,
    addAt,
  }));
}
```
(`SavedAdditiveLine = Omit<AdditiveLine,'key'>` and `loadDraft → additivesFromSaved` already follow the reshape.)

In `packages/web/src/lib/recipeFile.ts`:
- Add `parseDoseAmount` to the `@soap-calc/core` import.
- In `serializeRecipeFile`, change the additives map to emit the new fields:
```ts
    additives: additives.map(({ catalogId, name: additiveName, amount, basis, unit, addAt }) => ({
      catalogId,
      name: additiveName,
      amount,
      basis,
      unit,
      addAt,
    })),
```
- Replace `parseAdditiveLine` (accept explicit `amount`/`basis`/`unit`; fall back to the legacy/PPO `percentOfOil` via `parseAdditivePercentOfOil`; validate with `parseDoseAmount`):
```ts
function parseAdditiveLine(value: unknown): RecipeFileAdditive | null {
  if (!isRecord(value)) return null;
  const addAt = value.addAt;
  if (
    addAt !== 'lye' &&
    addAt !== 'oils' &&
    addAt !== 'trace' &&
    addAt !== 'top' &&
    addAt !== 'after_cook'
  ) {
    return null;
  }
  const basis = value.basis === 'batch' ? 'batch' : 'oil';
  const unit = value.unit === 'ppt' ? 'ppt' : 'percent';
  const amount =
    typeof value.amount === 'string' && value.amount !== ''
      ? value.amount
      : parseAdditivePercentOfOil(value); // legacy percentOfOil / PPO → %-of-oil string
  if (amount === '' || parseDoseAmount(amount, unit) === null) {
    return null;
  }
  const name =
    typeof value.name === 'string' ? value.name.slice(0, MAX_ADDITIVE_NAME_LENGTH) : '';
  return {
    catalogId: typeof value.catalogId === 'string' ? value.catalogId : '',
    name,
    amount,
    basis,
    unit,
    addAt,
  };
}
```
- Replace `recipeAdditivesFromFile`'s mapping body:
```ts
  return additives.map((line) => ({
    key: newAdditiveKey(),
    catalogId: line.catalogId,
    name: line.name,
    amount: line.amount,
    basis: line.basis,
    unit: line.unit,
    addAt: line.addAt,
  }));
```

- [ ] **Step 7: Consume computed rows in `AdditivesPanel` + wire `App`**

In `packages/web/src/components/AdditivesPanel.tsx`:
- Remove the `computeRecipeAdditives` import and the `import type { … }` for `totalOilGrams`-only usage; import the type instead:
```ts
import type { ComputedAdditive } from '../lib/calculateAdditives';
```
- Change the props type: remove `totalOilGrams: number;`, add `computed: ComputedAdditive[];`.
- Delete the local `const computed = computeRecipeAdditives(additives, totalOilGrams);` line and destructure `computed` from props instead.
- Replace the `addLine` new-line literal fields `percentOfOil: ''` with `amount: '', basis: 'oil', unit: 'percent'`.
- In `addLatherSupportPack`, replace `percentOfOil: String(item.percentOfOil),` with `amount: String(item.percentOfOil), basis: 'oil', unit: 'percent',`.
- In the amount `<input>`: change `value={line.percentOfOil}` → `value={line.amount}` and `onChange={(e) => updateLine(line.key, { percentOfOil: e.target.value })}` → `onChange={(e) => updateLine(line.key, { amount: e.target.value })}`. (Leave `max={100}` for now; Task 5 makes it dynamic.)

In `packages/web/src/App.tsx`, change the `<AdditivesPanel>` prop `totalOilGrams={vm.totalOilGrams}` → `computed={vm.computedAdditives}`. **Leave the other `totalOilGrams={vm.totalOilGrams}` consumer (SplitLiquidPanel) unchanged.**

- [ ] **Step 8: Sweep the field rename through remaining files + existing tests**

The reshape removes `AdditiveLine.percentOfOil` and `ComputedAdditive.percentOfOil`-as-input. `tsc` will flag every remaining site. Apply this transformation:
- In any `AdditiveLine`/`SavedAdditiveLine`/`RecipeFileAdditive` object literal, replace `percentOfOil: <x>` with `amount: <x>, basis: 'oil', unit: 'percent'`.
- ResultsPanel/BatchSheet still read `item.percentOfOil` — leave them (the transitional bridge keeps them valid; Task 4 changes them).

Update these existing test files by the same rule (additive literals gain `amount`/`basis`/`unit`; `computeRecipeAdditives(list, n)` calls become `computeRecipeAdditives(list, { oilGrams: n, batchGrams: <wet batch> })`):
- `packages/web/src/lib/recipeFile.test.ts` (the `round-trips additives`, `after-cook`, `post-cook superfat`, PPO, and reject cases — additive literals use `amount` now; PPO/legacy cases still send `percentOfOil` in the raw JSON payload, which is correct — those exercise the legacy path).
- `packages/web/src/lib/recipeStorage.test.ts` (the `round-trips draft state` additive literal).
- `packages/web/src/components/AdditivesPanel.test.tsx` (pass `computed={[…]}` instead of `totalOilGrams`; construct `ComputedAdditive` rows with `amount`/`unit`/`basis`/`grams`/`percentOfOil`).
- `packages/web/src/components/ResultsPanel.test.tsx` and `packages/web/src/lib/batchSheet.test.ts` (any `ComputedAdditive` literal gains `amount`/`unit`/`basis`; keep `percentOfOil` for now).

- [ ] **Step 9: Run the full suite to verify green**

Run: `npm test`
Expected: PASS — tsc clean across packages, all vitest green. Behavior is byte-identical (every line is oil/percent).

- [ ] **Step 10: Commit**

```bash
git add packages/web/src
git commit -m "feat(web): dose basis/unit model + calc + persistence (behavior-neutral reshape)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Dose-accurate display + oil-equivalent insight

Swap display to `formatDose`, switch the insight total to read grams (oil-equivalent), and drop the transitional `ComputedAdditive.percentOfOil`.

**Files:**
- Modify: `packages/web/src/components/ResultsPanel.tsx`, `packages/web/src/components/BatchSheet.tsx`, `packages/web/src/hooks/useFormulationInsights.ts`, `packages/web/src/lib/calculateAdditives.ts`
- Test: `packages/web/src/components/ResultsPanel.test.tsx`, `packages/web/src/hooks/useFormulationInsights.test.ts`

**Interfaces:**
- Consumes: `formatDose` (Task 2), `ComputedAdditive` (Task 3).
- Produces: `ComputedAdditive` **without** `percentOfOil`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/web/src/components/ResultsPanel.test.tsx`:
```ts
test('an additive renders its actual dose basis/unit label', () => {
  const { result, displayTotals } = calculateRecipe(createStarterLines(), DEFAULT_SETTINGS);
  render(
    <ResultsPanel
      result={result}
      inputErrors={[]}
      lyeLabel="NaOH"
      process="cp"
      lyeType="naoh"
      displayTotals={displayTotals}
      weightUnit="g"
      additives={[
        { key: 'a', catalogId: '', name: 'Eugenol', amount: 3, unit: 'ppt', basis: 'oil', grams: 3, addAt: 'trace' },
      ]}
    />,
  );
  expect(screen.getByText(/3 ppt of oil/)).toBeTruthy();
});
```

Replace the two existing `totalAdditivePercentForInsights` tests in `packages/web/src/hooks/useFormulationInsights.test.ts` and add a third (the helper's signature changes to take computed additives + oilGrams and derive the oil-equivalent internally):

```ts
describe('totalAdditivePercentForInsights', () => {
  it('excludes split liquid added in lye water', () => {
    expect(
      totalAdditivePercentForInsights([{ grams: 50 }], 1000, {
        ...DEFAULT_SPLIT_LIQUID, enabled: true, percentOfOil: '25', addAt: 'lye',
      }),
    ).toBe(5);
  });
  it('includes split liquid added at trace', () => {
    expect(
      totalAdditivePercentForInsights([{ grams: 50 }], 1000, {
        ...DEFAULT_SPLIT_LIQUID, enabled: true, percentOfOil: '8', addAt: 'trace',
      }),
    ).toBe(13);
  });
  it('sums additive grams as oil-equivalent percent regardless of dose basis/unit', () => {
    // a batch/ppt line contributes grams/oil*100, not its raw amount
    expect(
      totalAdditivePercentForInsights([{ grams: 30 }, { grams: 3 }], 1000, { ...DEFAULT_SPLIT_LIQUID }),
    ).toBeCloseTo(3.3); // (30+3)/1000*100
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run packages/web/src/components/ResultsPanel.test.tsx packages/web/src/hooks/useFormulationInsights.test.ts`
Expected: FAIL — display still prints "% of oil"; `ComputedAdditive` still has `percentOfOil`.

- [ ] **Step 3: Switch display to `formatDose`**

In `packages/web/src/components/ResultsPanel.tsx`: add `import { formatDose } from '../lib/formatDose';` and replace the additive dose render `({formatGrams(item.percentOfOil, 1)}% of oil)` with `({formatDose(item.amount, item.unit, item.basis)})`.

In `packages/web/src/components/BatchSheet.tsx`: add the same import and replace `{formatGrams(item.percentOfOil, 1)}% of oil, {additiveStageLabel(item.addAt, process)}` with `{formatDose(item.amount, item.unit, item.basis)}, {additiveStageLabel(item.addAt, process)}`.

- [ ] **Step 4: Switch the insight total to grams, drop the bridge field**

In `packages/web/src/hooks/useFormulationInsights.ts`, change `totalAdditivePercentForInsights` to take the computed additives + oilGrams and derive the oil-equivalent internally:
```ts
export function totalAdditivePercentForInsights(
  additives: Array<{ grams: number }>,
  oilGrams: number,
  splitLiquid: Pick<SplitLiquidSettings, 'enabled' | 'addAt' | 'percentOfOil'>,
): number {
  const additivePercent =
    oilGrams > 0 ? additives.reduce((sum, item) => sum + (item.grams / oilGrams) * 100, 0) : 0;
  const splitLiquidCountsAsAdditive =
    splitLiquid.enabled && (splitLiquid.addAt === 'trace' || splitLiquid.addAt === 'oils');
  const splitLiquidPercent = splitLiquidCountsAsAdditive
    ? parsePercentOfOil(splitLiquid.percentOfOil) ?? 0
    : 0;
  return additivePercent + splitLiquidPercent;
}
```
And update its call site inside the `insights` memo:
```ts
    const totalAdditivePercent = totalAdditivePercentForInsights(
      options.additives ?? [],
      lyeResult.totalOilWeightGrams,
      settings.splitLiquid,
    );
```

In `packages/web/src/lib/calculateAdditives.ts`, remove the `percentOfOil` field from `ComputedAdditive` and from the object pushed in `computeRecipeAdditives`.

- [ ] **Step 5: Run the full suite to verify green**

Run: `npm test`
Expected: PASS. Ppt/batch lines now display their real basis/unit; the additive-load insight is oil-equivalent.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src
git commit -m "feat(web): dose-accurate additive labels + oil-equivalent insight total

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Dose-mode control in AdditivesPanel

Expose basis/unit to the user — the last step, so accurate display already shipped.

**Files:**
- Modify: `packages/web/src/components/AdditivesPanel.tsx`
- Test: `packages/web/src/components/AdditivesPanel.test.tsx`

**Interfaces:**
- Consumes: `AdditiveLine.basis`/`unit` (Task 3), `DoseBasis`/`DoseUnit` (Task 1).

- [ ] **Step 1: Write the failing test**

Add to `packages/web/src/components/AdditivesPanel.test.tsx` (follow the file's existing render/user-event setup; it passes `computed` from Task 3):
```ts
test('changing the dose mode updates the line basis and unit', async () => {
  const user = userEvent.setup();
  const additives = [
    { key: 'a', catalogId: '', name: 'X', amount: '3', basis: 'oil' as const, unit: 'percent' as const, addAt: 'trace' as const },
  ];
  const onChange = vi.fn();
  render(
    <AdditivesPanel additives={additives} computed={[]} weightUnit="g" process="hp" onChange={onChange} />,
  );
  const modeSelect = screen.getByLabelText('Dose mode');
  await user.selectOptions(modeSelect, 'oil-ppt');
  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ key: 'a', basis: 'oil', unit: 'ppt' }),
  ]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/web/src/components/AdditivesPanel.test.tsx`
Expected: FAIL — no "Dose mode" control.

- [ ] **Step 3: Add the dose-mode select + dynamic max**

In `packages/web/src/components/AdditivesPanel.tsx`, add the mode table near the top (after imports):
```ts
import type { DoseBasis, DoseUnit } from '@soap-calc/core';

const DOSE_MODES: { value: string; basis: DoseBasis; unit: DoseUnit; label: string }[] = [
  { value: 'oil-percent', basis: 'oil', unit: 'percent', label: '% of oil' },
  { value: 'batch-percent', basis: 'batch', unit: 'percent', label: '% of batch' },
  { value: 'oil-ppt', basis: 'oil', unit: 'ppt', label: 'ppt of oil' },
  { value: 'batch-ppt', basis: 'batch', unit: 'ppt', label: 'ppt of batch' },
];
```
Make the amount input `max` dynamic: `max={line.unit === 'ppt' ? 1000 : 100}`.
Add the select immediately after the amount `<label>` and before the "Add at" stage `<label>`:
```tsx
                <label className="field">
                  <span className="sr-only">Dose mode</span>
                  <select
                    className="input"
                    aria-label="Dose mode"
                    value={`${line.basis}-${line.unit}`}
                    onChange={(e) => {
                      const mode = DOSE_MODES.find((m) => m.value === e.target.value);
                      if (mode) updateLine(line.key, { basis: mode.basis, unit: mode.unit });
                    }}
                  >
                    {DOSE_MODES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
```
Update the panel subtitle text "% of total oil weight" to "Dose per additive" and the empty-state hint's "% of oil weight" phrasing to neutral wording (e.g. "dosed per additive — not included in lye math").

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run packages/web/src/components/AdditivesPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `npm test`
Expected: PASS.
```bash
git add packages/web/src
git commit -m "feat(web): additive dose-mode selector (basis x unit)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Core `parseDoseAmount`/`gramsFromDose`/`DoseUnit`/`DoseBasis` → Task 1.
- `formatDose` → Task 2.
- `AdditiveLine` reshape (`amount`/`basis`/`unit`), `normalizeAdditiveLine` widening, `additivesFromSaved` spread, defaults → Task 3.
- `ComputedAdditive` + `computeRecipeAdditives({oilGrams,batchGrams})` dose math, wet-batch base → Task 3.
- Draft save (`cloneAdditives`) + file (`serializeRecipeFile`/`parseAdditiveLine`/`recipeAdditivesFromFile`) both sides, PPO + legacy migration → Task 3 (Steps 6, 8).
- `AdditivesPanel` consumes computed rows; App passes `computed`; SplitLiquidPanel untouched → Task 3 (Step 7).
- Display via `formatDose`; insight oil-equivalent; drop bridge → Task 4.
- Dose-mode select + dynamic `max` + neutral copy → Task 5.
- Scope boundaries (no LS solution basis, no preservative %, split-liquid/PCSF untouched) → held throughout; no task adds them.

**Placeholder scan:** none — every code step shows full code; the rename sweep (Task 3 Step 8) gives an explicit transformation rule + exact file list.

**Type consistency:** `computeRecipeAdditives(additives, { oilGrams, batchGrams })`, `AdditiveLine.amount/basis/unit`, `ComputedAdditive` (with transitional `percentOfOil` in Task 3, removed in Task 4), `formatDose(amount, unit, basis)`, and `AdditivesPanel` `computed` prop are used identically across tasks. The `percentOfOil` bridge is introduced (Task 3) and removed (Task 4) explicitly.
