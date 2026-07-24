# Batch-Weight Entry Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an editable "Total batch" field beside "Total oil" in the recipe entry bar; committing a target back-solves the oil total by pure ratio and rescales the recipe through the existing mold-sizer primitive.

**Architecture:** No core/calc/data-model changes. `useRecipeInputs` gains a `commitBatchWeightInput` that computes `newOilTotal = round(currentOilTotal × target/currentBatch)` and funnels it through a shared `applyOilTotal` (extracted from `handleApplySuggestedOilGrams`). `RecipeOilsPanel` renders the second field fed by two new props; `App.tsx` passes them from the view model. A permanent linearity regression test guards the ratio assumption.

**Tech Stack:** TypeScript, React, vitest (+ @testing-library/react), Playwright.

**Spec:** `docs/superpowers/specs/2026-07-24-batch-weight-entry-design.md` — values below are copied from it verbatim.

## Global Constraints

- Basis consistency is load-bearing: `currentBatchGrams` = view model `batchWeightWithExtras`; `currentOilTotalGrams` = `displayTotals.recipeOilWeightGrams`. NEVER `lineTotals.totalWeightGrams`.
- Draft contract: commit acts only when `shouldCommitDraft` is true (`if (!hadDraft) return`) — blur without an edit never rescales.
- Draft ids: oil field keeps `'batch-total'`; the new field uses `'batch-weight-total'`.
- Guards: no-op on invalid/`<= 0` target, `currentBatchGrams <= 0`, `newOilTotal <= 0`. The field shows the live value again after a no-op.
- No new persisted settings; no changes to `@soap-calc/core`, `calculateRecipe`, or the recipe data model.
- Commit after every task; branch `feat/batch-weight-entry`.

---

### Task 1: Linearity regression guard

**Files:**
- Create: `packages/web/src/lib/batchWeightLinearity.test.ts`

**Interfaces:**
- Consumes: `calculateRecipe`, `computeRecipeAdditives`, `computeExtrasGrams`, `createStarterLines`, `DEFAULT_SETTINGS` (all existing).
- Produces: nothing runtime — this test is the tripwire for the ratio solver's assumption. If a fixed-gram dose unit ever lands, THIS fails, pointing at the solver.

- [ ] **Step 1: Write the test** (passes immediately — it pins current behavior; the TDD red lives in Task 2)

Create `packages/web/src/lib/batchWeightLinearity.test.ts`:

```ts
import { expect, test } from 'vitest';
import { calculateRecipe } from './calculateRecipe';
import { computeRecipeAdditives, computeExtrasGrams } from './calculateAdditives';
import { createStarterLines, DEFAULT_SETTINGS, type RecipeLine, type RecipeSettings } from './recipe';

/**
 * Tripwire for the batch-weight entry field's ratio solve (commitBatchWeightInput):
 * displayed batch weight must stay LINEAR in oil scale — b(s) = s × b(1), no constant
 * offset. This holds because every contributor (lye, water, %-of-oil and ppt-of-batch
 * additives, split liquid, PCSF) is proportional to an oil-scaled basis and the app has
 * no fixed-gram dose unit. If that ever changes, the ratio solve in useRecipeInputs
 * becomes wrong — fix the solver, not this test.
 */

function batchWeightFor(
  lines: RecipeLine[],
  settings: RecipeSettings,
  additives: Parameters<typeof computeRecipeAdditives>[0],
): number | null {
  const { result, displayTotals } = calculateRecipe(lines, settings);
  if (!result || !displayTotals) return null;
  const base = displayTotals.batchWeightGrams;
  const computed = computeRecipeAdditives(additives, {
    oilGrams: displayTotals.recipeOilWeightGrams,
    batchGrams: base,
    solutionGrams: 0,
  });
  return base + computeExtrasGrams(computed, null, null, true);
}

const scaled = (lines: RecipeLine[], s: number): RecipeLine[] =>
  lines.map((l) => ({ ...l, weightGrams: String(Number(l.weightGrams) * s) }));

const CASES: Array<{
  name: string;
  settings: RecipeSettings;
  additives: Parameters<typeof computeRecipeAdditives>[0];
}> = [
  { name: 'plain CP, default water', settings: DEFAULT_SETTINGS, additives: [] },
  {
    name: 'percent-of-oil + ppt-of-batch additives',
    settings: DEFAULT_SETTINGS,
    additives: [
      { key: 'a', catalogId: 'fragrance', name: 'Fragrance', amount: '3', unit: 'percent', basis: 'oil', addAt: 'trace' },
      { key: 'b', catalogId: 'sugar-sorbitol', name: 'Sugar', amount: '2', unit: 'ppt', basis: 'batch', addAt: 'trace' },
    ],
  },
  {
    name: 'lye-concentration water mode',
    settings: { ...DEFAULT_SETTINGS, waterMode: 'lye_concentration' as RecipeSettings['waterMode'] },
    additives: [],
  },
];

test('batch weight is linear in oil scale (ratio-solve tripwire)', () => {
  for (const c of CASES) {
    const lines = createStarterLines();
    const b1 = batchWeightFor(lines, c.settings, c.additives);
    const b2 = batchWeightFor(scaled(lines, 2), c.settings, c.additives);
    const b337 = batchWeightFor(scaled(lines, 3.37), c.settings, c.additives);
    expect(b1, c.name).not.toBeNull();
    expect(b2! / b1!, `${c.name}: b(2)/b(1)`).toBeCloseTo(2, 6);
    expect(b337! / b1!, `${c.name}: b(3.37)/b(1)`).toBeCloseTo(3.37, 6);
  }
});
```

- [ ] **Step 2: Run it**

Run: `npm test --workspace @soap-calc/web -- batchWeightLinearity`
Expected: PASS (1 test). If it fails, STOP — the spec's core assumption doesn't hold and the design must be revisited; do not proceed to Task 2.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/batchWeightLinearity.test.ts
git commit -m "test(web): linearity tripwire for the batch-weight ratio solve"
```

---

### Task 2: Hook — shared applyOilTotal + commitBatchWeightInput

**Files:**
- Modify: `packages/web/src/hooks/useRecipeInputs.ts` (ids ~line 14, `RecipeInputs` type ~line 55, `handleApplySuggestedOilGrams` ~line 163, new functions near `commitBatchInput` ~line 203, return object)
- Test: `packages/web/src/hooks/useRecipeInputs.test.ts` (append)

**Interfaces:**
- Consumes: existing `shouldCommitDraft`, `parseInputDisplayToGrams`, `resyncFromWeights`, `syncBatchTotalEdit`, `applySyncedUpdate`, `discardDrafts`.
- Produces (used by Task 3):
  - `makeInputIds()` gains `batchWeightInputId: 'batch-weight-total' as const`
  - `RecipeInputs` gains:
    - `batchWeightInputId: string`
    - `handleBatchWeightChange: (displayValue: string) => void`
    - `commitBatchWeightInput: (displayValue: string, context: { currentBatchGrams: number; currentOilTotalGrams: number }) => void`

- [ ] **Step 1: Write the failing tests**

Append to `packages/web/src/hooks/useRecipeInputs.test.ts` (the file's `makeDeps` factory and direct-call pattern are already there):

```ts
test('batchWeightInputId is stable and distinct from the oil total id', () => {
  const ids = makeInputIds();
  expect(ids.batchWeightInputId).toBe('batch-weight-total');
  expect(ids.batchWeightInputId).not.toBe(ids.batchInputId);
});

test('commitBatchWeightInput ratio-scales the recipe through the shared apply path', () => {
  const applySyncedUpdate = vi.fn();
  const lines = [
    { key: 'a', oilId: 'olive-oil', weightGrams: '450', weightPercent: '45' },
    { key: 'b', oilId: 'coconut-oil-76', weightGrams: '250', weightPercent: '25' },
    { key: 'c', oilId: 'shea-butter', weightGrams: '300', weightPercent: '30' },
  ];
  const deps = makeDeps({
    drafts: { 'batch-weight-total': '1500' },
    editor: { ...makeDeps().editor, applySyncedUpdate, linesRef: { current: lines } },
  });
  const inputs = useRecipeInputs(deps);
  inputs.commitBatchWeightInput('1500', { currentBatchGrams: 1469.58, currentOilTotalGrams: 1000 });

  expect(applySyncedUpdate).toHaveBeenCalledTimes(1);
  // 1000 × 1500 / 1469.58 = 1020.7 → 1021
  const synced = applySyncedUpdate.mock.calls[0][0](lines, '1000', true);
  expect(synced.batchOilGrams).toBe('1021');
  expect(synced.batchSetByUser).toBe(true);
  const sum = synced.lines.reduce((s: number, l: { weightGrams: string }) => s + Number(l.weightGrams), 0);
  expect(Math.abs(sum - 1021)).toBeLessThan(2);
});

test('commitBatchWeightInput without a draft never rescales (blur is not an edit)', () => {
  const applySyncedUpdate = vi.fn();
  const clearDraft = vi.fn();
  const deps = makeDeps({
    drafts: {},
    clearDraft,
    editor: { ...makeDeps().editor, applySyncedUpdate },
  });
  useRecipeInputs(deps).commitBatchWeightInput('1500', { currentBatchGrams: 1469.58, currentOilTotalGrams: 1000 });
  expect(clearDraft).toHaveBeenCalledWith('batch-weight-total');
  expect(applySyncedUpdate).not.toHaveBeenCalled();
});

test('commitBatchWeightInput no-ops on invalid targets and a zero batch', () => {
  for (const [displayValue, context] of [
    ['', { currentBatchGrams: 1469.58, currentOilTotalGrams: 1000 }],
    ['abc', { currentBatchGrams: 1469.58, currentOilTotalGrams: 1000 }],
    ['0', { currentBatchGrams: 1469.58, currentOilTotalGrams: 1000 }],
    ['-5', { currentBatchGrams: 1469.58, currentOilTotalGrams: 1000 }],
    ['1500', { currentBatchGrams: 0, currentOilTotalGrams: 1000 }],
    ['1500', { currentBatchGrams: 1469.58, currentOilTotalGrams: 0 }],
  ] as const) {
    const applySyncedUpdate = vi.fn();
    const deps = makeDeps({
      drafts: { 'batch-weight-total': String(displayValue) },
      editor: { ...makeDeps().editor, applySyncedUpdate },
    });
    useRecipeInputs(deps).commitBatchWeightInput(displayValue as string, context);
    expect(applySyncedUpdate, `target=${displayValue} batch=${context.currentBatchGrams}`).not.toHaveBeenCalled();
  }
});

test('handleApplySuggestedOilGrams still applies a rounded oil total (mold-sizer regression)', () => {
  const applySyncedUpdate = vi.fn();
  const deps = makeDeps({ editor: { ...makeDeps().editor, applySyncedUpdate } });
  useRecipeInputs(deps).handleApplySuggestedOilGrams(850.4);
  expect(applySyncedUpdate).toHaveBeenCalledTimes(1);
  const synced = applySyncedUpdate.mock.calls[0][0](deps.lines, '500', true);
  expect(synced.batchOilGrams).toBe('850');
  expect(synced.batchSetByUser).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace @soap-calc/web -- useRecipeInputs`
Expected: FAIL — `batchWeightInputId` undefined / `commitBatchWeightInput` is not a function. (The mold-sizer regression test may already pass — that's expected; it pins behavior the refactor must preserve.)

- [ ] **Step 3: Implement**

In `packages/web/src/hooks/useRecipeInputs.ts`:

(a) `makeInputIds` — add the id:

```ts
export function makeInputIds() {
  return {
    weightInputId: (key: string) => `weight-${key}`,
    percentInputId: (key: string) => `percent-${key}`,
    batchInputId: 'batch-total' as const,
    batchWeightInputId: 'batch-weight-total' as const,
  };
}
```

(b) `RecipeInputs` type — add three members:

```ts
  batchWeightInputId: string;
  handleBatchWeightChange: (displayValue: string) => void;
  commitBatchWeightInput: (
    displayValue: string,
    context: { currentBatchGrams: number; currentOilTotalGrams: number },
  ) => void;
```

(c) Destructure the new id where the others are taken:

```ts
  const { weightInputId, percentInputId, batchInputId, batchWeightInputId } = makeInputIds();
```

(d) Replace `handleApplySuggestedOilGrams` with the extracted shared core plus the new commit (keep the existing explanatory comment on the apply path):

```ts
  // Shared "set the oil total, rescale proportionally" core: mold-sizer Apply and the
  // batch-weight field commit are the same operation with differently-derived totals.
  // "Apply to batch" (mold sizer) must make the OIL WEIGHT equal the suggested total, so
  // scale from the current gram proportions — resyncFromWeights re-derives each percent
  // from the weights (summing to 100) so syncBatchTotalEdit then hits the target exactly,
  // even if the recipe was mid-edit at an off-100% total.
  function applyOilTotal(rounded: number) {
    if (rounded <= 0) return;
    const batchOilGrams = String(rounded);
    discardDrafts();
    applySyncedUpdate((prev) => ({
      lines: syncBatchTotalEdit(resyncFromWeights(prev).lines, batchOilGrams),
      batchOilGrams,
      batchSetByUser: true,
    }));
  }

  function handleApplySuggestedOilGrams(oilGrams: number) {
    applyOilTotal(Math.round(oilGrams));
  }

  // Batch-weight field commit: pure ratio back-solve (batch weight is linear in oil
  // scale — see batchWeightLinearity.test.ts). Context values MUST be the view model's
  // displayTotals-derived figures, never the panel's raw line-sum (basis consistency).
  function commitBatchWeightInput(
    displayValue: string,
    context: { currentBatchGrams: number; currentOilTotalGrams: number },
  ) {
    const hadDraft = shouldCommitDraft(drafts, batchWeightInputId);
    clearDraft(batchWeightInputId);
    if (!hadDraft) return;
    const parsed = parseInputDisplayToGrams(displayValue, weightUnit);
    if (parsed === null || parsed === '') return; // invalid, mid-typing, or cleared → keep live value
    const target = Number(parsed);
    const { currentBatchGrams, currentOilTotalGrams } = context;
    if (!Number.isFinite(target) || target <= 0) return;
    if (!(currentBatchGrams > 0) || !(currentOilTotalGrams > 0)) return;
    applyOilTotal(Math.round(currentOilTotalGrams * (target / currentBatchGrams)));
  }

  function handleBatchWeightChange(displayValue: string) {
    setDraft(batchWeightInputId, displayValue);
  }
```

(e) Add `batchWeightInputId`, `handleBatchWeightChange`, `commitBatchWeightInput` to the returned object (next to `batchInputId` / `handleBatchChange` / `commitBatchInput`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @soap-calc/web -- useRecipeInputs`
Expected: PASS (all, including pre-existing).

Run: `npm run typecheck --workspace @soap-calc/web`
Expected: clean exit.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/useRecipeInputs.ts packages/web/src/hooks/useRecipeInputs.test.ts
git commit -m "feat(web): batch-weight commit path — shared applyOilTotal + ratio back-solve"
```

---

### Task 3: Panel field + App plumbing

**Files:**
- Modify: `packages/web/src/components/RecipeOilsPanel.tsx` (props type ~line 14, entry bar ~lines 106–137)
- Modify: `packages/web/src/App.tsx` (~line 384, the `<RecipeOilsPanel …>` element)
- Modify: `packages/web/src/components/RecipeOilsPanel.test.tsx` (helper + new tests)
- Modify: `docs/superpowers/specs/2026-07-24-batch-weight-entry-design.md` (one-line display-helper correction, see Step 5)

**Interfaces:**
- Consumes: Task 2's `batchWeightInputId` / `handleBatchWeightChange` / `commitBatchWeightInput(displayValue, { currentBatchGrams, currentOilTotalGrams })`; existing `gramsStringToInputDisplay(gramsStr, unit)`.
- Produces: `RecipeOilsPanelProps` gains `batchWeightWithExtras: number` and `recipeOilWeightGrams: number`.

- [ ] **Step 1: Write the failing panel tests**

In `packages/web/src/components/RecipeOilsPanel.test.tsx`:

(a) Extend the `makeInputs` mock with the three new members (inside the object literal, next to `batchInputId`/`commitBatchInput`):

```ts
    batchWeightInputId: 'batch-weight-total',
    commitBatchWeightInput: vi.fn(), handleBatchWeightChange: vi.fn(),
```

(b) Add the two props everywhere the component is rendered. In the `renderPanel` helper add to the JSX:

```tsx
      batchWeightWithExtras={1469.58} recipeOilWeightGrams={1000}
```

Then search the file for every other direct `<RecipeOilsPanel` render (there are a few inline in tests) and add the same two props to each.

(c) Append the new tests:

```tsx
test('Total batch field shows the display-rounded live batch weight', () => {
  renderPanel(makeInputs());
  const field = screen.getByLabelText(/Total batch in g/) as HTMLInputElement;
  // 1469.58 g display-rounded per the unit's digits (same helper as the oil field)
  expect(Number(field.value)).toBeCloseTo(1469.58, 0);
});

test('blurring Total batch commits with the displayTotals-based context', () => {
  const inputs = makeInputs();
  renderPanel(inputs);
  const field = screen.getByLabelText(/Total batch in g/) as HTMLInputElement;
  fireEvent.change(field, { target: { value: '1500' } });
  fireEvent.blur(field, { target: { value: '1500' } });
  expect(inputs.handleBatchWeightChange).toHaveBeenCalledWith('1500');
  expect(inputs.commitBatchWeightInput).toHaveBeenCalledWith('1500', {
    currentBatchGrams: 1469.58,
    currentOilTotalGrams: 1000,
  });
});

test('Total batch field is empty when the recipe has no resolvable batch weight', () => {
  const inputs = makeInputs();
  const lines = createStarterLines();
  render(
    <RecipeOilsPanel
      lines={lines} weightUnit="g"
      previewState={{ lines, batchOilGrams: '1000' }}
      previewLineByKey={Object.fromEntries(lines.map((l) => [l.key, l]))}
      lineTotals={{ totalWeightGrams: 1000, totalPercent: 100 }}
      showRecipeTotals percentTotalOff={false} weightTotalOff={false}
      getDraft={(_, c) => c} setDraft={vi.fn()}
      inputs={inputs as any}
      batchWeightWithExtras={0} recipeOilWeightGrams={0}
    />,
  );
  expect((screen.getByLabelText(/Total batch in g/) as HTMLInputElement).value).toBe('');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace @soap-calc/web -- RecipeOilsPanel`
Expected: FAIL — unable to find a label matching /Total batch in g/ (and a TS error on the unknown props until Step 3).

- [ ] **Step 3: Implement the panel field**

In `packages/web/src/components/RecipeOilsPanel.tsx`:

(a) Props type — add:

```ts
  /** Live computed batch weight (view model batchWeightWithExtras) — the same figure
   * Results prints as "Total batch". 0/absent means "no resolvable recipe". */
  batchWeightWithExtras: number;
  /** displayTotals.recipeOilWeightGrams — the oil basis the batch figure was computed
   * from. NOT lineTotals.totalWeightGrams (raw line-sum), which can differ mid-edit. */
  recipeOilWeightGrams: number;
```

and destructure both in the component signature.

(b) In the `.recipe-entry-bar` div, directly after the existing "Total oil" `<label>`, add:

```tsx
        <label className="field field--inline">
          <span>Total batch ({weightUnitConfig.short})</span>
          <input
            type="number"
            className="input input--number"
            min={0}
            step={weightUnitConfig.inputStep}
            value={getDraft(
              inputs.batchWeightInputId,
              batchWeightWithExtras > 0
                ? gramsStringToInputDisplay(String(batchWeightWithExtras), weightUnit)
                : '',
            )}
            onChange={(e) => inputs.handleBatchWeightChange(e.target.value)}
            onBlur={(e) =>
              inputs.commitBatchWeightInput(e.target.value, {
                currentBatchGrams: batchWeightWithExtras,
                currentOilTotalGrams: recipeOilWeightGrams,
              })
            }
            aria-label={`Total batch in ${weightUnitConfig.short}`}
          />
        </label>
```

(`gramsStringToInputDisplay` is already imported in this file for the oil field; `String(number)` adapts the numeric prop.)

(c) In `packages/web/src/App.tsx`, add to the `<RecipeOilsPanel` element:

```tsx
              batchWeightWithExtras={vm.batchWeightWithExtras}
              recipeOilWeightGrams={vm.displayTotals?.recipeOilWeightGrams ?? 0}
```

(Verified: `vm.displayTotals` exists — App.tsx:211 already passes it to ResultsPanel.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @soap-calc/web -- RecipeOilsPanel`
Expected: PASS (new and pre-existing).

Run: `npm run typecheck --workspace @soap-calc/web`
Expected: clean exit.

- [ ] **Step 5: Correct the spec's display-helper line**

In `docs/superpowers/specs/2026-07-24-batch-weight-entry-design.md`, replace

```text
  display via
  `gramsToDisplayValue(number, unit)`, commit parsing via
  `parseInputDisplayToGrams(string, unit)` (the numeric-value helpers — NOT
  `gramsStringToInputDisplay`, which takes a string setting).
```

with

```text
  display via
  `gramsStringToInputDisplay(String(batchWeightWithExtras), unit)` (display-digit
  rounding, same as the oil field), commit parsing via
  `parseInputDisplayToGrams(string, unit)`.
```

Also in the spec's Guards section, change `the batch field displays "—"` to `the batch field renders empty` — a `type="number"` input cannot display an em dash; empty is the actual degraded rendering (pinned by the Task 3 panel test).

(The earlier spec line was wrong about the display side: `gramsToDisplayValue` returns an unrounded number — raw float noise in the input; the string helper applies the unit's display digits.)

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/RecipeOilsPanel.tsx packages/web/src/components/RecipeOilsPanel.test.tsx packages/web/src/App.tsx docs/superpowers/specs/2026-07-24-batch-weight-entry-design.md
git commit -m "feat(web): Total batch field in the recipe entry bar (ratio back-solve on commit)"
```

---

### Task 4: E2E guard + full verification

**Files:**
- Create: `packages/web/e2e/batch-weight.spec.ts`

**Interfaces:**
- Consumes: the rendered `aria-label="Total batch in g"` field (Task 3), the existing `data-testid="batch-weight"` Results paragraph, and the weight-input locator pattern from `workability.spec.ts`.

- [ ] **Step 1: Write the e2e spec**

Create `packages/web/e2e/batch-weight.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

/**
 * Browser guard for the Total batch entry field: committing a target rescales the oils
 * (ratio back-solve), and a blur without an edit changes nothing.
 */

const weightInputs = (page: Page) => page.locator('input[aria-label^="Weight in"]');
const batchField = (page: Page) => page.getByLabel(/Total batch in g/);

async function freshRecipe(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await weightInputs(page).nth(0).fill('300');
  await weightInputs(page).nth(0).blur();
}

test('committing a Total batch target rescales the oils to hit it', async ({ page }) => {
  await freshRecipe(page);
  const firstOilBefore = Number(await weightInputs(page).nth(0).inputValue());

  await batchField(page).fill('1500');
  await batchField(page).blur();

  // Results' own batch line shows ~the target (whole-gram rounding ⇒ within a few grams).
  await expect(page.getByTestId('batch-weight')).toContainText(/1,49\d|1,50\d/);
  // Oils scaled up proportionally.
  const firstOilAfter = Number(await weightInputs(page).nth(0).inputValue());
  expect(firstOilAfter).toBeGreaterThan(firstOilBefore);
});

test('blur without an edit never rescales', async ({ page }) => {
  await freshRecipe(page);
  const before = await weightInputs(page).nth(0).inputValue();
  await batchField(page).focus();
  await batchField(page).blur();
  await expect(weightInputs(page).nth(0)).toHaveValue(before);
});
```

- [ ] **Step 2: Run the e2e spec**

Run: `npm run test:e2e --workspace @soap-calc/web -- batch-weight.spec.ts`
Expected: PASS (2/2).

- [ ] **Step 3: Full verification sweep**

```bash
npm test --workspace @soap-calc/web
npm test --workspace @soap-calc/core
npm run typecheck --workspace @soap-calc/web
npm run typecheck --workspace @soap-calc/core
npm run build --workspace @soap-calc/web
npm run test:e2e --workspace @soap-calc/web
```

Expected: everything green. If a pre-existing test broke, the change leaked outside its seam — fix before committing.

- [ ] **Step 4: Commit**

```bash
git add packages/web/e2e/batch-weight.spec.ts
git commit -m "test(web): e2e guard for the Total batch entry field"
```
