# LS Dilution Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the three LS dilution snippets into one panel — bottle count removed, whole-batch and custom-amount dilution behind a single toggle, and a local g/oz/lb switch that shows one unit at a time instead of all three.

**Architecture:** `DilutionPanel` becomes the single owner of every dilution input (target concentration or ratio, measured paste, what that measurement means, and how much of the batch to dilute). It renders one of two result bodies depending on the new scope toggle: its own existing batch grid, or an extracted `PortionDilutionResults` (what `PartialDilution` becomes once its inputs move up into the shell). `BottleCalculator` and the core `lsBottleCount` helper are deleted outright, along with the printed sheet's bottle-count row. A panel-local display unit replaces `formatWeightWithAlternates` everywhere, and that helper is deleted too.

**Tech Stack:** TypeScript, React 18, Vite, Vitest + @testing-library/react, Playwright (e2e). npm workspaces: `@soap-calc/core` (pure math), `@soap-calc/web` (UI).

## Global Constraints

- **Verification after every task:** `npm test` (core + oils-data + web), `npx tsc -p packages/web --noEmit`, `npm run build:web`. Run `npm run test:e2e -w @soap-calc/web` at the end of Tasks 1 and 3.
- **`packages/web/src/lib/insights-golden.json` must not change.** Verify with `git diff --stat -- packages/web/src/lib/insights-golden.json` — empty output required. No task here touches insights; a diff means something went wrong.
- **TDD, strictly.** Write the failing test, RUN it, observe the expected failure message, then implement. A test that passes before the implementation is a broken test.
- **Green baseline at `7443438`:** core 488, oils-data 95, web 993 (1,576 total), e2e 86. Task 1 removes tests, so the web count legitimately drops; it must never drop for a reason you cannot name.
- **`@testing-library/jest-dom` is NOT installed.** `toBeInTheDocument`, `toBeChecked`, `toHaveTextContent` and friends do not exist in this repo and appear zero times in it. Use `toBeTruthy()` / `toBeNull()` and read DOM properties directly (`(el as HTMLInputElement).checked`), matching every existing test.
- **`WeightUnit` is imported from `'../lib/recipe'`** in components (it is defined in `weightUnits.ts` and re-exported by `recipe.ts`). Follow the existing convention; do not "correct" the import path.
- **CP and HP behaviour must not change.** Every panel here is gated on `processOffers(process, 'dilution')`, which is LS-only. Any CP/HP test that changes is a regression.
- **Copy is original.** Never paste sentences from the source book. Cite as `LS:<line>` when a claim needs grounding.
- **Declaration copy is fixed by the user's decision:** the measured-paste declaration reads **"all of it"** / **"what's left after earlier dilutions"**. The scope toggle reads **"Whole batch"** / **"Custom amount"**. These two must never both say "whole batch".
- **Commit per task**, message in the repo's existing style (`feat(ls):` / `fix(ls):` / `refactor(ls):`, imperative, lowercase after the colon).

---

## File Structure

| File | Fate | Responsibility after this plan |
|---|---|---|
| `packages/web/src/components/BottleCalculator.tsx` | **Delete** | — |
| `packages/web/src/components/BottleCalculator.test.tsx` | **Delete** | — |
| `packages/core/src/ls-yield.ts` | Modify | Volume + partial-dilution math. `lsBottleCount` removed (no consumers left). |
| `packages/web/src/components/PartialDilution.tsx` | **Rename →** `PortionDilutionResults.tsx` | Renders the portion's guards, figures and hints. Owns no inputs and no `<details>` wrapper. |
| `packages/web/src/components/DilutionPanel.tsx` | Modify (grows) | The single dilution shell: all inputs, the scope toggle, the unit switch; renders one of the two result bodies. |
| `packages/web/src/lib/weightUnits.ts` | Modify | `formatWeightWithAlternates` deleted; `DILUTION_UNIT_OPTIONS` added. |
| `packages/web/src/components/BatchSheet.tsx` | Modify | Bottle-count row removed; dilution water printed in one unit. |
| `packages/web/src/lib/batchSheet.ts` | Modify | `bottleSizeMl` field removed. |
| `packages/web/src/hooks/useRecipeViewModel.ts` | Modify | `bottleSizeMl` input removed. |
| `packages/web/src/App.tsx` | Modify | `bottleSizeMl` state removed; `dilutionScope` state added; one panel wired instead of three. |

---

### Task 1: Remove the bottle count

Three surfaces carry it — the on-screen panel, the printed sheet, and the core helper both read. All three go. **Keep** everything named *bottled* (`bottledSolutionGrams`, "≈ Finished product", "≈ Finished volume"): that is the mass and volume of finished soap, which the user wants, and only the *count of bottles* is being removed.

**Files:**
- Delete: `packages/web/src/components/BottleCalculator.tsx`, `packages/web/src/components/BottleCalculator.test.tsx`
- Modify: `packages/web/src/App.tsx:88` (state), `:215` (vm input), `:535-542` (render), import line
- Modify: `packages/web/src/hooks/useRecipeViewModel.ts:60-63`, `:155`, `:850`, `:870`
- Modify: `packages/web/src/lib/batchSheet.ts:58-62`
- Modify: `packages/web/src/components/BatchSheet.tsx:8`, `:81`, `:124`, `:129-137`, `:352-354`
- Modify: `packages/core/src/ls-yield.ts:180-190` (delete `lsBottleCount`)
- Modify: `packages/web/src/components/DilutionPanel.tsx:152`, `:189` (comments naming BottleCalculator)
- Test: `packages/web/src/components/BatchSheet.test.tsx`, `packages/core/src/ls-yield.test.ts`, `packages/web/e2e/exploratory.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `BatchSheetData` (in `batchSheet.ts`) no longer has `bottleSizeMl`. `@soap-calc/core` no longer exports `lsBottleCount`. Task 3 relies on `BatchSheet.tsx` no longer importing from `ls-yield` for counts.

- [ ] **Step 1: Write the failing test — the printed sheet has no bottle row**

The file already has an LS fixture builder — `function lsSheetData(extra: {…})` at `BatchSheet.test.tsx:421`. Its `extra` parameter is **required** (no default), so it must always be called with at least `{}`. Add:

```tsx
it('prints no bottle count, but keeps the finished product and volume', () => {
  render(<BatchSheet data={lsSheetData({ bottleSizeMl: '500' })} />);
  expect(screen.queryByText(/Bottles filled/i)).toBeNull();
  expect(screen.getByText(/Finished volume/i)).toBeTruthy();
});
```

Passing a bottle size is the point: the row must be gone even when a size is present. `lsSheetData`'s `extra` type already declares `bottleSizeMl?: string` (line 431), so this compiles today. Step 3 removes that field, at which point this call becomes `lsSheetData({})` and the `bottleSizeMl?: string` line in the fixture's own parameter type goes with it.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/web/src/components/BatchSheet.test.tsx -t "prints no bottle count"`
Expected: FAIL — `queryByText(/Bottles filled/i)` returns the element, so `toBeNull()` throws.

- [ ] **Step 3: Delete the sheet's bottle count**

In `packages/web/src/components/BatchSheet.tsx`: remove `lsBottleCount` from the `@soap-calc/core` import (line 8); remove `bottleSizeMl` from the props destructure (line 81); delete the `bottleMl` / `bottleCount` block — that is lines **129-137**, and the statement does not end until the `: null;` on 137, so stopping at 135 leaves a broken ternary:

```tsx
const bottleMl = Number(bottleSizeMl);
const bottleCount =
  bottleSizeMl !== undefined &&
  bottleSizeMl.trim() !== '' &&
  Number.isFinite(bottleMl) &&
  bottleMl > 0 &&
  bottledGrams !== null
    ? lsBottleCount(bottledGrams, bottleMl)
    : null;
```

Then delete the row at lines **352-354** (the closing `)}` is on 354):

```tsx
{bottleCount !== null && (
  <div><dt>≈ Bottles filled ({bottleSizeMl} ml)</dt><dd>{bottleCount}</dd></div>
)}
```

Update the comment at line 124 so it no longer names `BottleCalculator`.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run packages/web/src/components/BatchSheet.test.tsx`
Expected: PASS, after deleting the two existing bottle-count tests in that file — `'prints the bottle count reachable from the same bottle size the on-screen BottleCalculator uses'` (lines 664-669) and `'omits the bottle count when no bottle size is reachable'` (lines 671-674). Delete them outright; do not weaken them into assertions about something else. The feature is gone, so a test for it has nothing left to pin.

- [ ] **Step 5: Delete the on-screen panel and its wiring**

```bash
rm packages/web/src/components/BottleCalculator.tsx packages/web/src/components/BottleCalculator.test.tsx
```

In `packages/web/src/App.tsx`: delete the `BottleCalculator` import; delete `const [bottleSizeMl, setBottleSizeMl] = useState('250');` (line 88); delete `bottleSizeMl,` from the view-model input object (line 215); delete the whole render block — lines **535-542**, starting at the `{processOffers(…)` wrapper on 535, not 536. Cutting from 536 leaves that wrapper dangling and unclosed, which is a syntax error:

```tsx
{processOffers(process, 'dilution') && (
  // Packaging is its own step after the batch dilution — see BottleCalculator.
  <BottleCalculator
    finishedGrams={vm.bottledSolutionGrams ?? vm.dilution?.solutionGrams ?? null}
    bottleSizeMl={bottleSizeMl}
    onBottleSizeMlChange={setBottleSizeMl}
  />
)}
```

In `packages/web/src/hooks/useRecipeViewModel.ts`: delete the `bottleSizeMl` field from the input type (lines 60-63), from the destructure (line 155), from the `batchSheetData` object (line 850), and from that memo's dependency array (line 870).

In `packages/web/src/lib/batchSheet.ts`: delete the `bottleSizeMl?: string;` field and its doc comment (lines 58-62).

In `packages/web/src/components/DilutionPanel.tsx`: reword the comments at lines 152 and 189 that name `BottleCalculator` / "the separate bottle count". Line 189's comment justifies showing volume — the justification survives (volume tells a maker whether the vessel and packaging are big enough); only the clause about the bottle count goes.

In `packages/web/src/components/DilutionPanel.test.tsx`, one test is *named* after the removed feature — line 21, `test('shows the finished volume the bottle count derives from, and names the density', …)`, with a comment on lines 23-24 repeating "it is what the separate bottle count works from". The assertions are about finished volume and density and stay exactly as they are; rename the test to `'shows the finished volume and names the density'` and drop the bottle clause from the comment. A test whose name promises a deleted feature is how the next reader concludes the removal was incomplete.

- [ ] **Step 6: Delete the core helper**

In `packages/core/src/ls-yield.ts`, delete `lsBottleCount` (lines 180-190). Nothing needs editing in `packages/core/src/index.ts`: it re-exports the module wholesale with `export * from './ls-yield.js';` (line 19), so deleting the function is enough to remove it from the package's public API — do not go looking for a named export to strike. In `packages/core/src/ls-yield.test.ts`, delete the `lsBottleCount` describe block. It is pure math with no remaining consumer; leaving it would be dead exported API.

- [ ] **Step 7: Fix the e2e spec**

`packages/web/e2e/exploratory.spec.ts:364-373` is one self-contained test, `'bottle count is a separate snippet, collapsed until opened'`, which opens the panel, fills `Bottle size (ml)` and asserts on `Bottles filled (500 ml)`. Delete the whole test. Nothing else depends on it.

Line 377, inside the neighbouring partial-dilution test, carries a comment comparing that panel to "the bottle count" — reword it, since the thing it compares against no longer exists. Do not replace the deleted test with weaker assertions elsewhere; Task 3 Step 7 adds e2e coverage for the merged panel.

- [ ] **Step 8: Full verification**

```bash
npm test
npx tsc -p packages/web --noEmit
npm run build:web
npm run test:e2e -w @soap-calc/web
git diff --stat -- packages/web/src/lib/insights-golden.json   # must print nothing
grep -rn "lsBottleCount\|BottleCalculator\|bottleSizeMl\|Bottles filled" packages/ --include=*.ts --include=*.tsx
```

The final `grep` must return **no matches**. A leftover reference means a surface was missed.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(ls): drop the bottle count from the app, the sheet and core"
```

---

### Task 2: One panel, one scope toggle

`PartialDilution` currently owns the measured-paste input and the declaration radios, even though `DilutionPanel` reads the same two values to correct the batch row. That split is why the two panels needed cross-referencing hints ("The batch row above still shows…"). Moving the inputs into the shell removes the duplication and makes the scope toggle possible.

**Files:**
- Rename: `packages/web/src/components/PartialDilution.tsx` → `packages/web/src/components/PortionDilutionResults.tsx`
- Rename: `packages/web/src/components/PartialDilution.test.tsx` → `packages/web/src/components/PortionDilutionResults.test.tsx`
- Modify: `packages/web/src/components/DilutionPanel.tsx`
- Modify: `packages/web/src/App.tsx` — add state beside `dilutionMode` (line 145); replace the render at `:500-534` (`DilutionPanel` 500-520, `PartialDilution` 521-534)
- Modify: `packages/web/e2e/exploratory.spec.ts:375-392`
- Test: both renamed test files, plus `packages/web/src/components/DilutionPanel.test.tsx`

**Interfaces:**
- Consumes: Task 1's removal of `BottleCalculator` from the App render tree.
- Produces:
  - `export type DilutionScope = 'batch' | 'portion'` from `DilutionPanel.tsx`.
  - `export function PortionDilutionResults(props: PortionDilutionResultsProps)` where
    ```ts
    type PortionDilutionResultsProps = {
      dilution: DilutionResult;          // non-null — the shell already guards
      weightUnit: WeightUnit;
      targetMl: string;
      measuredPasteGrams: string;
      measuredPasteIsRemaining: boolean;
      wholeBatchPasteGrams?: number | null;
    };
    ```
    It renders a `<>…</>` fragment (no `<section>`, no `<details>`, no inputs).
  - `DilutionPanel` gains props: `dilutionScope: DilutionScope`, `onDilutionScopeChange: (s: DilutionScope) => void`, `targetMl: string`, `onTargetMlChange: (v: string) => void`, `onMeasuredPasteGramsChange: (v: string) => void`, `onMeasuredPasteIsRemainingChange: (v: boolean) => void`, `wholeBatchPasteGrams?: number | null`.

- [ ] **Step 1: Write the failing test — the scope toggle switches which figures show**

`DilutionPanel.test.tsx` has **no props builder** — all ~30 existing tests spell every prop out inline on each `render()`, sharing only `const RESULT: DilutionResult` (line 9). The new tests need far more props than those do, so add a small spreadable fixture just below `RESULT` and use it only in the new tests. Leave every existing test's inline props alone — rewriting them is churn this plan does not need.

```tsx
// The props every scope/unit test needs but none of them varies. Declared here rather
// than repeated per test because these tests pass twice as many props as the older ones.
const BASE = {
  dilution: RESULT,
  soapConcentrationPercent: '30',
  onSoapConcentrationChange: () => {},
  weightUnit: 'g' as const,
  measuredPasteGrams: '',
  measuredPasteIsRemaining: false,
  onMeasuredPasteGramsChange: () => {},
  onMeasuredPasteIsRemainingChange: () => {},
  onTargetMlChange: () => {},
  onDilutionScopeChange: () => {},
};
```

Then add:

```tsx
it('shows batch figures on "Whole batch" and portion figures on "Custom amount"', () => {
  const onScopeChange = vi.fn();
  const { rerender } = render(
    <DilutionPanel {...BASE} dilutionScope="batch" onDilutionScopeChange={onScopeChange} targetMl="1200" />,
  );
  expect(screen.getByText('Dilution water to add')).toBeTruthy();
  expect(screen.queryByText('Paste to weigh out')).toBeNull();

  fireEvent.click(screen.getByLabelText('Custom amount'));
  expect(onScopeChange).toHaveBeenCalledWith('portion');

  rerender(
    <DilutionPanel {...BASE} dilutionScope="portion" onDilutionScopeChange={onScopeChange} targetMl="1200" />,
  );
  expect(screen.getByText('Paste to weigh out')).toBeTruthy();
  expect(screen.queryByText('Dilution water to add')).toBeNull();
});

it('only offers the amount field in custom-amount scope', () => {
  const { rerender } = render(<DilutionPanel {...BASE} dilutionScope="batch" targetMl="" />);
  expect(screen.queryByLabelText('Amount to make (ml)')).toBeNull();
  rerender(<DilutionPanel {...BASE} dilutionScope="portion" targetMl="" />);
  expect(screen.getByLabelText('Amount to make (ml)')).toBeTruthy();
});

it('names the measurement declaration without repeating "whole batch"', () => {
  render(<DilutionPanel {...BASE} dilutionScope="batch" targetMl="" />);
  expect(screen.getByLabelText('all of it')).toBeTruthy();
  expect(screen.getByLabelText("what's left after earlier dilutions")).toBeTruthy();
});
```

`toBeTruthy()` rather than `toBeInTheDocument()` — that is what this file uses throughout, and `@testing-library/jest-dom` is not imported in it.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run packages/web/src/components/DilutionPanel.test.tsx -t "Whole batch"`
Expected: FAIL — TypeScript rejects the unknown `dilutionScope` prop, and `getByLabelText('Custom amount')` finds nothing.

- [ ] **Step 3: Extract the portion results body**

```bash
git mv packages/web/src/components/PartialDilution.tsx packages/web/src/components/PortionDilutionResults.tsx
git mv packages/web/src/components/PartialDilution.test.tsx packages/web/src/components/PortionDilutionResults.test.tsx
```

In `PortionDilutionResults.tsx`:
- Rename the component `PartialDilution` → `PortionDilutionResults` and the props type accordingly.
- Delete the `<details>` wrapper, the `<summary>`, and the `panel__subtitle` paragraph (lines 162-166) — the shell owns the heading now. Return a fragment.
- Delete the measured-paste `<label className="field">` (lines 167-186), the declaration `<div role="radiogroup">` (lines 192-215) and the "Amount to make (ml)" field (lines 216-227). These move to the shell in Step 4.
- Delete the `onMeasuredPasteGramsChange`, `onTargetMlChange` and `onMeasuredPasteIsRemainingChange` props — this component no longer writes.
- Make `dilution` non-nullable and drop the `if (dilution === null) return null;` guard: the shell only renders this inside its own `dilution !== null` branch.
- Keep **every** guard, every computed value, and every hint below line 228 exactly as they are. `pasteBelowSolids`, `pasteExceedsSolution`, `pasteExceedsRemainingCeiling`, `wholeBatchPasteBasis`, `driftGrams` and their long comments are all load-bearing review fixes — do not simplify or re-derive them.
- One copy change: the remaining-mode hint at lines 299-306 ends with "The batch row above still shows the recipe's own computed figures; a remaining-paste reading is not the batch." In the merged panel the batch row is no longer on screen at the same time, so it becomes: `Switch to Whole batch to see the recipe's own computed figures — a remaining-paste reading is not the batch.`

Update the renamed test file's imports and component name. The guard/hint tests in it must all still pass unchanged; the tests that exercise the three removed inputs move to `DilutionPanel.test.tsx` in Step 5.

- [ ] **Step 4: Add the inputs and the toggle to the shell**

In `DilutionPanel.tsx`, add the new props from the Interfaces block above, and export:

```tsx
export type DilutionScope = 'batch' | 'portion';
```

After the existing concentration/ratio input (after line 257), insert the measured-paste field, the renamed declaration, and the new scope toggle:

```tsx
<label className="field">
  {/* Grams regardless of the display unit: this is a scale reading the maker takes at
      the pot, and the core figures it feeds are all gram-based. Always shown, even when
      the target exceeds the recipe's ASSUMED cook water: a measurement is exactly what
      can override that assumption, so hiding the input would remove the only way out of
      the refusal. */}
  <span>Measured paste weight (g, optional)</span>
  <input
    type="number"
    className="input input--number"
    min={1}
    step={10}
    value={measuredPasteGrams ?? ''}
    onChange={(e) => onMeasuredPasteGramsChange?.(e.target.value)}
    aria-label="Measured paste weight (g)"
  />
</label>
{/* "Lighter than predicted" has two indistinguishable explanations — evaporation during
    the cook (same soap, less water: MORE concentrated) or part of the batch already
    diluted away (composition unchanged, just less of it) — one number cannot tell them
    apart, so the maker must say which. Deliberately NOT worded "whole batch": the scope
    toggle below already owns that phrase, and two controls reading alike is how a maker
    picks the wrong one. */}
<div className="dilution-mode-toggle" role="radiogroup" aria-label="What the measured paste weight represents">
  <label className="field field--inline">
    <input
      type="radio"
      name="measuredPasteScope"
      checked={!measuredPasteIsRemaining}
      onChange={() => onMeasuredPasteIsRemainingChange?.(false)}
    />
    <span>all of it</span>
  </label>
  <label className="field field--inline">
    <input
      type="radio"
      name="measuredPasteScope"
      checked={measuredPasteIsRemaining}
      onChange={() => onMeasuredPasteIsRemainingChange?.(true)}
    />
    <span>what&apos;s left after earlier dilutions</span>
  </label>
</div>
{/* Paste stores better than diluted soap — it keeps sealed, refrigerates and freezes —
    so the common workflow is to cook one batch and draw it down over time. Whole batch
    answers "dilute it all"; custom amount answers "make just this much now". */}
<div className="dilution-mode-toggle" role="radiogroup" aria-label="How much of the batch to dilute">
  <label className="field field--inline">
    <input
      type="radio"
      name="dilutionScope"
      checked={dilutionScope === 'batch'}
      onChange={() => onDilutionScopeChange?.('batch')}
    />
    <span>Whole batch</span>
  </label>
  <label className="field field--inline">
    <input
      type="radio"
      name="dilutionScope"
      checked={dilutionScope === 'portion'}
      onChange={() => onDilutionScopeChange?.('portion')}
    />
    <span>Custom amount</span>
  </label>
</div>
{dilutionScope === 'portion' && (
  <label className="field">
    <span>Amount to make (ml)</span>
    <input
      type="number"
      className="input input--number"
      min={1}
      step={10}
      value={targetMl}
      onChange={(e) => onTargetMlChange?.(e.target.value)}
      aria-label="Amount to make (ml)"
    />
  </label>
)}
```

Then, inside the existing `{dilution ? (…)}` branch, gate the two bodies. The batch results grid and its hints (lines 296-354 plus the batch-only alerts) render only when `dilutionScope === 'batch'`; when it is `'portion'`, render:

```tsx
<PortionDilutionResults
  dilution={dilution}
  weightUnit={weightUnit}
  targetMl={targetMl}
  measuredPasteGrams={measuredPasteGrams ?? ''}
  measuredPasteIsRemaining={measuredPasteIsRemaining}
  wholeBatchPasteGrams={wholeBatchPasteGrams}
/>
```

**Keep in both scopes** (they describe the target, not the amount): the incremental-dilution hint (lines 357-361), the density caveat (362-368), the minimum-dilution note (411-418) and the `dilution-uses` disclosure (419-449). **Keep in batch scope only**: the `Dilution water to add` row, `Paste (anhydrous)`, `Finished solution`, `Total water`, `Glycerin (retained)`, `≈ Finished product`, `≈ Finished volume`, the `measuredPasteValid` hint, the `targetExceedsPaste` alerts and the alt-liquid hints — `PortionDilutionResults` has its own equivalents and would otherwise double up.

- [ ] **Step 5: Run the whole suite and move the orphaned tests**

Run: `npx vitest run packages/web`
Expected: the three new `DilutionPanel` tests pass. Tests in `PortionDilutionResults.test.tsx` that drive the measured-paste input, the declaration radios or the ml field now fail to find them — move each one into `DilutionPanel.test.tsx`, rendering `DilutionPanel` with `dilutionScope="portion"`, and update the declaration labels to the new copy. Do not delete them: they pin review fixes.

- [ ] **Step 6: Wire App**

In `packages/web/src/App.tsx`, add beside `dilutionMode` (line 145):

```tsx
// "Dilute it all" vs "make just this much now" — a decision about the session, not the
// recipe, so it lives here rather than in settings. Defaults to the whole batch.
const [dilutionScope, setDilutionScope] = useState<DilutionScope>('batch');
```

Delete the separate `<PartialDilution>` render block — lines **521-534**, from its own `{processOffers(process, 'dilution') && (` wrapper on 521 through the `)}` on 534 — and pass its former props to the `DilutionPanel` invocation just above it (lines 500-520) instead:

```tsx
dilutionScope={dilutionScope}
onDilutionScopeChange={setDilutionScope}
targetMl={portionTargetMl}
onTargetMlChange={setPortionTargetMl}
onMeasuredPasteGramsChange={setMeasuredPasteGrams}
onMeasuredPasteIsRemainingChange={setMeasuredPasteIsRemaining}
wholeBatchPasteGrams={vm.wholeBatchPasteGrams}
```

Update the `PartialDilution` import to `PortionDilutionResults` — or drop it entirely from App if `DilutionPanel` is now its only consumer (it is).

- [ ] **Step 7: Update the e2e partial-dilution walk**

`packages/web/e2e/exploratory.spec.ts:375-392`, `'partial dilution is a separate snippet that scales paste and water'`, breaks here — not in Task 3. It drives the `<details>` wrapper this task deletes and the input labels it renames:

```ts
const partial = page.locator('details').filter({ hasText: 'Dilute part of the batch' }).first();
await expect(page.getByLabel('Amount to make (ml)')).toBeHidden();
await partial.locator('summary').click();
…
await page.getByLabel('Measured paste weight — whole batch (g)').fill('1400');
```

Rewrite it against the merged panel, keeping every assertion it already makes — those pin real behaviour (the portion figures, the evaporation caveat on a computed paste, the drift note once measured, the water:paste ratio):

- Scope it to the dilution `<section>` rather than a `<details>`, following the selector style the neighbouring "Neutralize" test uses (`page.locator('section').filter({ has: … })`).
- Replace the collapsed-until-opened assertion: the amount field is now hidden because the scope is **Whole batch**, so assert `Amount to make (ml)` is hidden, click the **Custom amount** radio, then assert it is visible. That is the same guarantee — the field appears only when wanted — expressed against the new control.
- Update the paste label to `Measured paste weight (g)`.
- Rename the test (it is no longer "a separate snippet") and drop the "collapsed like the bottle count" comment on line 377, which names a feature Task 1 deleted.

- [ ] **Step 8: Full verification**

```bash
npm test
npx tsc -p packages/web --noEmit
npm run build:web
npm run test:e2e -w @soap-calc/web
git diff --stat -- packages/web/src/lib/insights-golden.json   # must print nothing
grep -rn "PartialDilution\|Dilute part of the batch" packages/  # must print nothing
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(ls): one dilution panel with a whole-batch / custom-amount toggle"
```

---

### Task 3: A local g/oz/lb switch, one unit at a time

`formatWeightWithAlternates` prints "2,400 g (84.7 oz / 5.29 lb)" — all three at once, which is what the user asked to stop. It is replaced by a switch on the dilution panel itself, so the pour figure can be read on whatever scale is on the bench without changing the app-wide unit in Batch basics.

`kg` is deliberately excluded from the switch (no kitchen scale defaults to it), matching the existing alternates list, which was also `g`/`oz`/`lb`.

**Files:**
- Modify: `packages/web/src/lib/weightUnits.ts`
- Modify: `packages/web/src/components/DilutionPanel.tsx`
- Modify: `packages/web/src/components/BatchSheet.tsx:339`
- Test: `packages/web/src/lib/weightUnits.test.ts`, `packages/web/src/components/DilutionPanel.test.tsx`, `packages/web/e2e/exploratory.spec.ts`

**Interfaces:**
- Consumes: Task 2's merged `DilutionPanel` (the switch lives in its `panel__head`, and `PortionDilutionResults` receives the chosen unit through the existing `weightUnit` prop — no new prop needed).
- Produces: `export const DILUTION_UNIT_OPTIONS: readonly { id: WeightUnit; short: string }[]` from `weightUnits.ts`. `formatWeightWithAlternates` no longer exists.

- [ ] **Step 1: Write the failing tests**

In `packages/web/src/lib/weightUnits.test.ts`:

```ts
it('offers exactly the three kitchen-scale units for dilution', () => {
  expect(DILUTION_UNIT_OPTIONS.map((o) => o.id)).toEqual(['g', 'oz', 'lb']);
});
```

In `packages/web/src/components/DilutionPanel.test.tsx`:

```tsx
it('shows one unit at a time and switches the dilution figures', () => {
  render(<DilutionPanel {...BASE} dilutionScope="batch" weightUnit="g" targetMl="" />);
  const water = screen.getByText('Dilution water to add').closest('div')!;
  expect(water.textContent).toContain(' g');
  expect(water.textContent).not.toContain('oz');

  fireEvent.click(screen.getByRole('radio', { name: 'oz' }));
  expect(water.textContent).toContain('oz');
  expect(water.textContent).not.toContain(' g');
});

it('starts on the app-wide unit, falling back to grams for kg', () => {
  const checked = (name: string) =>
    (screen.getByRole('radio', { name }) as HTMLInputElement).checked;
  const { unmount } = render(<DilutionPanel {...BASE} weightUnit="lb" dilutionScope="batch" targetMl="" />);
  expect(checked('lb')).toBe(true);
  unmount();
  render(<DilutionPanel {...BASE} weightUnit="kg" dilutionScope="batch" targetMl="" />);
  expect(checked('g')).toBe(true);
});
```

Note `BASE` sets `weightUnit: 'g'`, so both renders here must override it after the spread, as written.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run packages/web/src/lib/weightUnits.test.ts packages/web/src/components/DilutionPanel.test.tsx -t "unit"`
Expected: FAIL — `DILUTION_UNIT_OPTIONS` is not exported, and no radio named `oz` exists.

- [ ] **Step 3: Add the option list, delete the alternates formatter**

In `packages/web/src/lib/weightUnits.ts`, delete `formatWeightWithAlternates` entirely (and its tests in `weightUnits.test.ts`), and add:

```ts
/** The units a maker's own scale actually reads, for the dilution panel's local switch.
 * kg is excluded on purpose: no kitchen scale defaults to it, and a dilution figure in
 * kg reads as a rounding error (2.4 kg hides the 400 g). A kg-mode recipe therefore
 * falls back to grams here — see DilutionPanel's initial unit. */
export const DILUTION_UNIT_OPTIONS = (['g', 'oz', 'lb'] as const).map((id) => ({
  id: id as WeightUnit,
  short: WEIGHT_UNITS[id].short,
}));
```

- [ ] **Step 4: Add the switch to the panel**

In `DilutionPanel.tsx`, replace both `formatWeightWithAlternates(x, weightUnit)` calls (lines 268 and 309) with `formatWeight(x, displayUnit)`, replace **every other** `weightUnit` reference in the component body with `displayUnit`, and pass `weightUnit={displayUnit}` down to `PortionDilutionResults`. Widen the React import on line 1 — it is currently `import { useEffect, useState } from 'react';` and the code below needs `useRef` too. Add above the return:

```tsx
// A reading aid, not a setting: the maker flips this to match whatever scale is on the
// bench without disturbing the app-wide unit every other panel uses. Seeded from that
// unit so the panel opens consistent with the rest of the app, and re-seeded when it
// changes — same prevRef pattern App already uses for the mold-sizer bar weight, which
// would otherwise strand this switch on a unit the maker has since moved away from.
const seedUnit = (u: WeightUnit): WeightUnit => (u === 'kg' ? 'g' : u);
const [displayUnit, setDisplayUnit] = useState<WeightUnit>(() => seedUnit(weightUnit));
const prevWeightUnitRef = useRef(weightUnit);
useEffect(() => {
  if (prevWeightUnitRef.current === weightUnit) return;
  prevWeightUnitRef.current = weightUnit;
  setDisplayUnit(seedUnit(weightUnit));
}, [weightUnit]);
```

and render it in the existing `panel__head` (after the `<div>` holding the title and subtitle, line 202):

```tsx
<div className="dilution-mode-toggle" role="radiogroup" aria-label="Dilution display unit">
  {DILUTION_UNIT_OPTIONS.map((option) => (
    <label className="field field--inline" key={option.id}>
      <input
        type="radio"
        name="dilutionDisplayUnit"
        checked={displayUnit === option.id}
        onChange={() => setDisplayUnit(option.id)}
      />
      <span>{option.short}</span>
    </label>
  ))}
</div>
```

- [ ] **Step 5: Run them and watch them pass**

Run: `npx vitest run packages/web/src/components/DilutionPanel.test.tsx`
Expected: PASS — **except one existing test that must be updated**, `'renders the dilution figures'` (line 14), which asserts on the exact alternates string:

```tsx
// The pour figure carries the other scale units so it reads on any kitchen scale.
expect(screen.getByText('2,400 g (84.7 oz / 5.29 lb)')).toBeTruthy();
```

That is precisely the behaviour being removed. Change the assertion to `expect(screen.getByText('2,400 g')).toBeTruthy();` and replace the comment with one saying the panel shows a single unit, switchable beside the heading. Every other existing test in the file passes untouched, because the switch seeds from `weightUnit` and they all pass `weightUnit="g"`.

Search the file for any other alternates-format assertion (`grep -n "oz / " packages/web/src/components/DilutionPanel.test.tsx`) and update those the same way. Do the same sweep in `PortionDilutionResults.test.tsx`, which inherited PartialDilution's assertions on its own "Water to add" figure.

- [ ] **Step 6: One unit on the printed sheet too**

In `packages/web/src/components/BatchSheet.tsx:339`, replace `formatWeightWithAlternates(dilutionWaterGramsPrinted, weightUnit)` with `formatWeight(dilutionWaterGramsPrinted, weightUnit)`, and drop `formatWeightWithAlternates` from the import on line 24.

The sheet prints in the app-wide unit like every other figure on it. The panel's local switch is a screen-only reading aid and is deliberately **not** threaded into the sheet — a printed page has no toggle, and two different units on one sheet is worse than one the maker chose app-wide. Add a test in `BatchSheet.test.tsx`:

```tsx
it('prints the dilution water in one unit only', () => {
  render(<BatchSheet data={lsSheetData({})} />);
  const row = screen.getByText(/Dilution water/i).closest('div')!;
  expect(row.textContent).not.toMatch(/\(.*oz.*\/.*lb.*\)/);
});
```

Then sweep that file for existing alternates assertions too — `grep -n "oz / " packages/web/src/components/BatchSheet.test.tsx` — and update each to the single-unit string.

- [ ] **Step 7: e2e coverage for the merged panel**

Task 2 Step 7 already rewrote the partial-dilution walk against the merged panel. This step adds the one thing it does not cover: the unit switch. Extend that same test (or add a sibling beside it) to read the "Dilution water to add" figure in grams, click the **oz** radio, and assert the figure re-renders in ounces and no longer contains a gram figure in parentheses. Follow the file's existing selector style — do not introduce a new helper.

- [ ] **Step 8: Full verification**

```bash
npm test
npx tsc -p packages/web --noEmit
npm run build:web
npm run test:e2e -w @soap-calc/web
git diff --stat -- packages/web/src/lib/insights-golden.json   # must print nothing
grep -rn "formatWeightWithAlternates" packages/                 # must print nothing
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(ls): dilution figures switch between g, oz and lb one at a time"
```

---

## Self-Review

**Spec coverage.** "Remove bottles count snippet" → Task 1 (panel, sheet row, core helper). "Leave only whole batch dilution and custom amount dilution" → Task 2. "Whole batch and custom amount is in the same menu, whole batch is a toggleable option" → Task 2 Step 4, default `'batch'`. "Add grams pounds ounces switch" → Task 3 Step 4. "Don't show them all in once" → Task 3 Steps 3 and 6, deleting `formatWeightWithAlternates` from both the screen and the sheet.

**Type consistency.** `DilutionScope` is defined in Task 2 and consumed by name in App (Task 2 Step 6). `PortionDilutionResults`' prop list in Task 2's Interfaces block matches the call site in Step 4 field for field. `DILUTION_UNIT_OPTIONS` is declared in Task 3 Step 3 with the shape (`id`, `short`) the render in Step 4 destructures. `seedUnit` is used in both the initializer and the effect.

**Known follow-up, deliberately out of scope.** `PortionDilutionResults` reads `dilution.targetExceedsPaste`, which is computed from the recipe's *assumed* cook water; the review round that fixed the batch row's handling of this left the portion body's own `pasteAlreadyThinner` branch as-is because it is already measurement-aware. No change needed, but do not "tidy" it.

**Claims audit (run against `7443438` before execution).** Every `file:line` in this plan was opened and checked. Corrections already folded in: `App.tsx` bottle block is 535-542 not 536-542 (536 would leave the `{processOffers(…)` wrapper dangling); `BatchSheet.tsx` bottle-count statement runs 129-137 not 129-135 and its JSX row 352-354 not 352-353 (both would truncate mid-statement); the `PartialDilution` render block is 521-534, and `DilutionPanel`'s is 500-520. Two fabrications were removed: `baseProps()` never existed in `DilutionPanel.test.tsx` (the file has only `const RESULT` and spells props inline — Task 2 Step 1 now creates a real `BASE` fixture), and `lsSheetData` takes a **required** argument so it can never be called bare. `jest-dom` matchers were used in three snippets and are not installed. `core/src/index.ts` re-exports with `export *`, so there is no named export to strike. All other cited lines, CSS classes (`packages/web/src/index.css`), symbols (`vm.wholeBatchPasteGrams`, `formatWeight`, `WEIGHT_UNITS[…].short`) and the single e2e bottle test (`exploratory.spec.ts:364-373`) were confirmed accurate.

**One judgement call flagged for the user.** The printed sheet uses the app-wide unit rather than the panel's local switch (Task 3 Step 6). If the sheet should instead follow the switch, that is one extra field threaded through `batchSheetData` and can be added later without reworking any of this.
