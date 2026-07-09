# App.tsx Decomposition + Record Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the stale bookkeeping left by an interrupted session (Tier 0), then decompose the 841-line `App.tsx` (Tier 1) into two hooks (`useRecipeInputs`, `useRecipeViewModel`) and two components (`SettingsPanel`, `RecipeOilsPanel`) so each unit is small, single-purpose, independently testable, and easy to hold in context.

**Architecture:** Every Tier 1 task is a **behavior-preserving extraction**, not a rewrite. Logic and JSX move verbatim from `App.tsx` into a new file with a well-defined interface; `App.tsx` then consumes that interface. Because these are verbatim moves, task steps give the **exact source line ranges to move** and the **complete new interface/wiring** rather than re-pasting hundreds of unchanged JSX lines (re-pasting would violate DRY and risk transcription errors — the current `App.tsx` is the source of truth for the moved bodies). Correctness is proven three ways after each task: the new unit's own test, `npm test` staying green, and the existing Playwright e2e suite.

**Tech Stack:** TypeScript (strict), React 19, Vite, Vitest, Playwright. This plan adds `@testing-library/react` + `jsdom` as **dev-only** dependencies (authorized exception to the standing "no new deps" rule) so extracted components/hooks get fast unit tests.

## Global Constraints

- **Minimal changes / no drive-by refactors** beyond what each task defines (AGENTS.md). Tier 1 tasks change *structure*, never *behavior* — outputs must be identical.
- **`npm test` must pass** before finishing each task (runs `validate:oils` + all workspace tests).
- **Run all commands from repo root** `/Users/str/soap-calc`.
- **New deps are dev-only** and scoped to `@soap-calc/web`. Nothing new ships to the client bundle.
- **Node >= 20.** React 19.1, `@testing-library/react` must be v16+ (React 19 support).
- **`strict`, `noUnusedLocals`, `noUnusedParameters`** stay on — the web build runs `tsc --noEmit && vite build`, so unused imports/params fail the build. After each extraction, remove now-unused imports from `App.tsx`.
- **Do not auto-commit/push** unless the executor is explicitly asked; each task still ends with the exact commit for when the go-ahead is given. End commit messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Suggested branch before starting: `git switch -c refactor/app-decomposition`.

---

## File Structure

| File | Change | Task |
|------|--------|------|
| `docs/superpowers/plans/2026-07-09-soap-calc-fixes.md` | Prepend COMPLETE status banner + commit map + D1 outcome | 1 |
| `packages/web/src/lib/recipe.ts` | Delete dead `STARTER_LINES` export (lines 166–167) | 2 |
| `packages/web/src/lib/weightUnits.ts` | Delete dead `inputDisplayToGramsString` export (lines 61–65) | 2 |
| `packages/web/package.json` | Add `@testing-library/react`, `@testing-library/jest-dom`? (no — omitted), `jsdom` devDeps | 3 |
| `packages/web/src/components/SmokeHarness.test.tsx` | Create → then delete: proves the DOM harness works | 3 |
| `packages/web/src/hooks/useRecipeInputs.ts` | Create: owns draft/commit/line-edit handlers | 4 |
| `packages/web/src/hooks/useRecipeInputs.test.ts` | Create: handler-logic tests | 4 |
| `packages/web/src/hooks/useRecipeViewModel.ts` | Create: owns the derived-value chain | 5 |
| `packages/web/src/hooks/useRecipeViewModel.test.tsx` | Create: view-model output tests | 5 |
| `packages/web/src/components/SettingsPanel.tsx` | Create: extracted settings form | 6 |
| `packages/web/src/components/SettingsPanel.test.tsx` | Create: render + change tests | 6 |
| `packages/web/src/components/RecipeOilsPanel.tsx` | Create: extracted oils table + entry bar | 7 |
| `packages/web/src/components/RecipeOilsPanel.test.tsx` | Create: render + edit tests | 7 |
| `packages/web/src/lib/settingsFields.ts` | Create: config for DRY purity/water fields | 8 |
| `packages/web/src/App.tsx` | Shrink to layout shell as each unit lands | 4–8 |

**Interface conventions used below.** All types already exist in the repo unless a task creates them:
- `RecipeLine`, `RecipeSettings`, `WeightUnit`, `AdditiveLine` — `packages/web/src/lib/recipe.ts`
- `SyncedRecipe` — `packages/web/src/lib/lineWeightSync.ts`
- `RecipeCalculation` (`{ result, inputErrors, linePercents, displayTotals }`), `RecipeDisplayTotals` — `packages/web/src/lib/calculateRecipe.ts`
- Draft API `{ getDraft, setDraft, clearDraft, clearAllDrafts, drafts }` — `useDraftInputs`
- Debouncer `{ flush, cancel, cancelAll }` — `useDebouncedCommit`
- Editor `{ applySynced, applySyncedUpdate, linesRef, batchRef }` — `useRecipeEditor`

---

## Task 1: Reconcile the stale fixes plan (Tier 0)

**Why:** `docs/superpowers/plans/2026-07-09-soap-calc-fixes.md` shows 0/65 checkboxes done, but all 12 defects + decision D1 were implemented and committed (`edaa5ea`…`d6dcaa5`). A future agent could re-apply everything. This is documentation-only; no code, no automated test.

**Files:**
- Modify: `docs/superpowers/plans/2026-07-09-soap-calc-fixes.md` (top of file)

- [ ] **Step 1: Prepend a status banner immediately after the H1 title**

Insert this block right after the first `# ...` heading line:

```markdown
> ## ✅ STATUS: COMPLETE (2026-07-09)
>
> All tasks in this plan were implemented and committed. The unchecked boxes below are historical — **do not re-run them.**
>
> | Task | Commit |
> |------|--------|
> | 1 dual-lye split | `edaa5ea` |
> | 2 line-weight reconcile | `e35da95` |
> | 3 water% default | `fc950f3` |
> | 4 skip no-op commits | `b9c5058` |
> | 5 OilPicker | `2e9c6bc` + `a20cfa3` |
> | 6 doseUnit import | `dee4244` |
> | 7 dedup weight errors | `d284ef5` |
> | 8 unknown-oil missing | `778ea7a` |
> | 9 dead alias keys | `48d7579` |
> | 10 SAP delta epsilon | `2847739` |
> | 11 autosave committed | `03a752b` |
>
> **Decision D1 — RESOLVED (`d6dcaa5`):** implemented as a **renormalize-over-covered-weight hybrid** (renormalize + `<80%` coverage "estimate" mode with `~` prefix and suppressed out-of-range flag). This **reverses** this doc's stated default of Option A ("keep diluted"). The body text below is left unchanged for history.
```

- [ ] **Step 2: Verify the banner reads correctly**

Run: `sed -n '1,20p' docs/superpowers/plans/2026-07-09-soap-calc-fixes.md`
Expected: H1, then the `✅ STATUS: COMPLETE` blockquote with the commit table and D1 note.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-07-09-soap-calc-fixes.md
git commit -m "docs: mark soap-calc fixes plan complete; record D1 outcome

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Delete two dead `@deprecated` exports (Tier 0)

**Why:** Both are leftover deprecation-without-removal from earlier refactors, with zero production or test importers (verified: `STARTER_LINES` — the one test that uses the name defines its own local `const STARTER_LINES = createStarterLines()`; `inputDisplayToGramsString` — zero references anywhere but its own definition). Removing them shrinks the API surface and removes confusion. The "test" is that the full suite + typecheck still pass, proving nothing imported them.

**Files:**
- Modify: `packages/web/src/lib/recipe.ts` (delete lines 166–167)
- Modify: `packages/web/src/lib/weightUnits.ts` (delete lines 61–65)

- [ ] **Step 1: Confirm zero importers one more time**

Run:
```bash
grep -rn "inputDisplayToGramsString" packages --include="*.ts" --include="*.tsx" | grep -v node_modules
grep -rnE "import[^;]*\bSTARTER_LINES\b" packages --include="*.ts" --include="*.tsx" | grep -v node_modules
```
Expected: first prints only the definition line in `weightUnits.ts`; second prints nothing (no imports of `STARTER_LINES`).

- [ ] **Step 2: Delete the `STARTER_LINES` export**

In `packages/web/src/lib/recipe.ts`, delete these two lines (the JSDoc + the export):

```ts
/** @deprecated Use createStarterLines() — keys must be unique per instance. */
export const STARTER_LINES: RecipeLine[] = createStarterLines();
```

- [ ] **Step 3: Delete the `inputDisplayToGramsString` export**

In `packages/web/src/lib/weightUnits.ts`, delete the JSDoc + function:

```ts
/** @deprecated Use parseInputDisplayToGrams for commit paths. */
export function inputDisplayToGramsString(displayStr: string, unit: WeightUnit): string {
  const parsed = parseInputDisplayToGrams(displayStr, unit);
  return parsed ?? '';
}
```

- [ ] **Step 4: Run web typecheck + full test suite (proves nothing imported them)**

Run: `npm run build:web && npm test`
Expected: build succeeds (no "cannot find name" errors), `Test Files 21 passed`, `Tests 100 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/recipe.ts packages/web/src/lib/weightUnits.ts
git commit -m "refactor(web): drop dead deprecated exports (STARTER_LINES, inputDisplayToGramsString)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add the component test harness (Tier 1 enabler)

**Why:** `@testing-library/react` needs a DOM environment; the web Vitest config currently uses `environment: 'node'`. Rather than switch the global env (which would slow the 100 existing node-env tests and change their globals), component/hook tests opt in per-file with a `// @vitest-environment jsdom` docblock. This task installs the deps and proves the harness works with a throwaway smoke test.

**Files:**
- Modify: `packages/web/package.json` (devDependencies)
- Create then delete: `packages/web/src/components/SmokeHarness.test.tsx`

**Interfaces:**
- Produces: the ability for later tasks to write `.test.tsx` files that `render(<Component />)` and query with `screen`, using `// @vitest-environment jsdom` + `afterEach(cleanup)`.

- [ ] **Step 1: Install dev-only deps (React 19-compatible)**

Run:
```bash
npm install -D -w @soap-calc/web @testing-library/react@^16 @testing-library/dom@^10 jsdom@^26
```
Expected: `package.json` gains the three devDeps; `package-lock.json` updates. (No `@testing-library/jest-dom` — tests use plain Vitest assertions to avoid a global setup file.)

- [ ] **Step 2: Write a smoke test that renders a trivial component**

Create `packages/web/src/components/SmokeHarness.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);

function Hello({ name }: { name: string }) {
  return <p>Hello {name}</p>;
}

test('DOM harness renders a component', () => {
  render(<Hello name="soap" />);
  expect(screen.getByText('Hello soap')).toBeTruthy();
});
```

- [ ] **Step 3: Run only the smoke test to verify the harness**

Run: `npm run test -w @soap-calc/web -- SmokeHarness`
Expected: PASS (1 test). If it fails with "document is not defined", the docblock is missing or `jsdom` didn't install.

- [ ] **Step 4: Delete the smoke test and confirm the full suite is green**

Run:
```bash
rm packages/web/src/components/SmokeHarness.test.tsx
npm test
```
Expected: `Tests 100 passed` (back to baseline; smoke test removed).

- [ ] **Step 5: Commit**

```bash
git add packages/web/package.json package-lock.json
git commit -m "test(web): add @testing-library/react + jsdom dev harness for component tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Extract `useRecipeInputs` (draft/commit/line-edit handlers)

**Why:** `App.tsx` lines ~220–360 are one cohesive cluster: the handlers that turn keystrokes into committed recipe state (draft plumbing, weight/percent/batch commit, add/remove/update line, weight-unit switch, export/new glue). Extracting them into a hook removes ~140 lines from `App` and makes the input state machine independently testable.

**Files:**
- Create: `packages/web/src/hooks/useRecipeInputs.ts`
- Create: `packages/web/src/hooks/useRecipeInputs.test.ts`
- Modify: `packages/web/src/App.tsx` (remove the moved handlers; call the hook)

**Interfaces:**
- Consumes (input `deps` object):
  ```ts
  type UseRecipeInputsDeps = {
    lines: RecipeLine[];
    settings: RecipeSettings;
    additives: AdditiveLine[];
    weightUnit: WeightUnit;
    drafts: Record<string, string>;
    getDraft: (id: string, canonicalDisplay: string) => string;
    setDraft: (id: string, value: string) => void;
    clearDraft: (id: string) => void;
    clearAllDrafts: () => void;
    debouncer: { flush: (id: string, fn: () => void) => void; cancel: (id: string) => void; cancelAll: () => void };
    editor: {
      applySynced: (synced: SyncedRecipe) => void;
      applySyncedUpdate: (u: (lines: RecipeLine[], batch: string) => SyncedRecipe) => void;
      linesRef: React.MutableRefObject<RecipeLine[]>;
      batchRef: React.MutableRefObject<string>;
    };
    setLines: React.Dispatch<React.SetStateAction<RecipeLine[]>>;
    setSettings: React.Dispatch<React.SetStateAction<RecipeSettings>>;
    handleExport: (payload: { lines: RecipeLine[]; settings: RecipeSettings; additives: AdditiveLine[] }) => void;
    handleNew: () => void;
    handleImportFile: (file: File) => void;
  };
  ```
- Produces (return object) — exact names later tasks rely on:
  ```ts
  type RecipeInputs = {
    weightInputId: (key: string) => string;
    percentInputId: (key: string) => string;
    batchInputId: string;                 // constant 'batch-total'
    updateLine: (key: string, patch: Partial<RecipeLine>) => void;
    flushCommittedDrafts: () => SyncedRecipe;
    discardDrafts: () => void;
    handleExportCommitted: () => void;
    handleNewRecipe: () => void;
    handleApplySuggestedOilGrams: (oilGrams: number) => void;
    commitWeightInput: (key: string, displayValue: string) => void;
    commitPercentInput: (key: string, displayValue: string) => void;
    commitBatchInput: (displayValue: string) => void;
    handleWeightChange: (key: string, displayValue: string) => void;
    handleBatchChange: (displayValue: string) => void;
    setWeightUnit: (nextUnit: WeightUnit) => void;
    addLine: () => void;
    removeLine: (key: string) => void;
  };
  ```
  NOTE: `handlePrintBatchSheet` does **not** move here — it depends on `batchSheetData` (view-model, Task 5) and stays in `App`.

- [ ] **Step 1: Write the failing test for the two pure helpers + a commit path**

Create `packages/web/src/hooks/useRecipeInputs.test.ts`. Test the exported pure helpers directly (no render needed) plus a commit no-op guard:

```ts
import { makeInputIds, shouldCommitDraft } from './useRecipeInputs';

test('input id helpers are stable and namespaced', () => {
  const ids = makeInputIds();
  expect(ids.weightInputId('abc')).toBe('weight-abc');
  expect(ids.percentInputId('abc')).toBe('percent-abc');
  expect(ids.batchInputId).toBe('batch-total');
});

test('shouldCommitDraft is false when the field was never drafted', () => {
  expect(shouldCommitDraft({ 'weight-abc': '10' }, 'weight-abc')).toBe(true);
  expect(shouldCommitDraft({}, 'weight-abc')).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -w @soap-calc/web -- useRecipeInputs`
Expected: FAIL ("makeInputIds is not exported" / module has no such export).

- [ ] **Step 3: Create the hook, moving the handler bodies verbatim from `App.tsx`**

Create `packages/web/src/hooks/useRecipeInputs.ts`. Move these `App.tsx` function bodies **verbatim** (only their closed-over variables change to come from `deps`): `updateLine` (220–238), `weightInputId`/`percentInputId` (240–246), `flushCommittedDrafts` (248–256), `discardDrafts` (258–261), `handleExportCommitted` (263–270), `handleNewRecipe` (272–275), `handleApplySuggestedOilGrams` (277–286), `commitWeightInput` (293–303), `commitPercentInput` (305–315), `commitBatchInput` (317–333), `handleWeightChange` (335–337), `handleBatchChange` (339–341), `setWeightUnit` (343–347), `addLine` (349–352), `removeLine` (354–360).

Add the two pure helpers the test needs, and wrap the moved bodies:

```ts
import { commitDrafts } from '../lib/commitDrafts';
import {
  addRecipeLine, resyncFromWeights, syncBatchTotalEdit, syncPercentEdit, syncWeightEdit,
  type SyncedRecipe,
} from '../lib/lineWeightSync';
import { isTarOil, oilById } from '../lib/oils';
import { newLineKey, type RecipeLine, type RecipeSettings, type AdditiveLine, type WeightUnit } from '../lib/recipe';
import { parseInputDisplayToGrams, parsePercentInput } from '../lib/weightUnits';

export function makeInputIds() {
  return {
    weightInputId: (key: string) => `weight-${key}`,
    percentInputId: (key: string) => `percent-${key}`,
    batchInputId: 'batch-total' as const,
  };
}

export function shouldCommitDraft(drafts: Record<string, string>, id: string): boolean {
  return id in drafts;
}

// type UseRecipeInputsDeps / RecipeInputs as specified in the Interfaces block above

export function useRecipeInputs(deps: UseRecipeInputsDeps): RecipeInputs {
  const { weightInputId, percentInputId, batchInputId } = makeInputIds();
  // ... moved bodies, reading deps.* instead of the old in-component locals.
  // e.g. commitWeightInput:
  //   const hadDraft = shouldCommitDraft(deps.drafts, weightInputId(key));
  //   deps.clearDraft(weightInputId(key));
  //   if (!hadDraft) return;
  //   const weightGrams = parseInputDisplayToGrams(displayValue, deps.weightUnit);
  //   if (weightGrams === null) return;
  //   deps.editor.applySyncedUpdate((prev, batch) => syncWeightEdit(prev, key, weightGrams, batch));
  return { weightInputId, percentInputId, batchInputId, updateLine, flushCommittedDrafts,
    discardDrafts, handleExportCommitted, handleNewRecipe, handleApplySuggestedOilGrams,
    commitWeightInput, commitPercentInput, commitBatchInput, handleWeightChange,
    handleBatchChange, setWeightUnit, addLine, removeLine };
}
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run: `npm run test -w @soap-calc/web -- useRecipeInputs`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire `App.tsx` to the hook and delete the moved bodies**

In `App.tsx`: after the existing `useDraftInputs`/`useDebouncedCommit`/`useRecipeEditor` calls, add:

```tsx
const inputs = useRecipeInputs({
  lines, settings, additives, weightUnit,
  drafts, getDraft, setDraft, clearDraft, clearAllDrafts,
  debouncer, editor: { applySynced, applySyncedUpdate, linesRef, batchRef },
  setLines, setSettings, handleExport, handleNew, handleImportFile,
});
```

Replace call sites in JSX with `inputs.*` (e.g. `onClick={inputs.handleNewRecipe}`, `onChange={(e) => inputs.handleWeightChange(line.key, e.target.value)}`, `inputs.weightInputId(line.key)`, etc.). Delete the 15 now-moved function declarations. Keep `handlePrintBatchSheet` in `App`. Remove imports that are now only used inside the hook (`commitDrafts`, the `lineWeightSync` helpers, `newLineKey`, `isTarOil`/`oilById` if unused elsewhere, `parseInputDisplayToGrams`/`parsePercentInput` if unused elsewhere) — let `tsc` tell you which.

- [ ] **Step 6: Typecheck, full suite, and e2e (proves behavior unchanged)**

Run:
```bash
npm run build:web && npm test
npm run test:e2e -w @soap-calc/web
```
Expected: build clean (no unused-import errors); `Tests 100 passed`; all 7 Playwright specs pass (they exercise exactly these input/commit/OilPicker paths).

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/hooks/useRecipeInputs.ts packages/web/src/hooks/useRecipeInputs.test.ts packages/web/src/App.tsx
git commit -m "refactor(web): extract useRecipeInputs from App

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Extract `useRecipeViewModel` (derived-value chain)

**Why:** `App.tsx` lines ~86–218 are one long chain of derived values (preview state/settings, line totals, calc result, computed additives, split-liquid grams, water suggestion, properties/indexes, fatty acids/insights, batch-sheet data, and the assorted scalars). Pulling them into one hook that returns a single view-model object drops ~130 lines from `App`, sharpens memoization boundaries, and makes the derivations testable without a full render.

**Files:**
- Create: `packages/web/src/hooks/useRecipeViewModel.ts`
- Create: `packages/web/src/hooks/useRecipeViewModel.test.tsx`
- Modify: `packages/web/src/App.tsx` (remove the moved derivations; call the hook)

**Interfaces:**
- Consumes:
  ```ts
  type UseRecipeViewModelArgs = {
    recipeName: string;
    lines: RecipeLine[];
    settings: RecipeSettings;
    additives: AdditiveLine[];
    drafts: Record<string, string>;
    weightUnit: WeightUnit;
  };
  ```
- Produces (return object — names the components in Tasks 6–7 and `App` rely on):
  ```ts
  type RecipeViewModel = {
    previewState: { lines: RecipeLine[]; batchOilGrams: string };
    previewSettings: RecipeSettings;
    previewLineByKey: Record<string, RecipeLine>;
    lineTotals: { totalWeightGrams: number; totalPercent: number };
    showRecipeTotals: boolean;
    percentTotalOff: boolean;
    weightTotalOff: boolean;
    result: RecipeCalculation['result'];
    inputErrors: string[];
    displayTotals: RecipeCalculation['displayTotals'];
    linePercents: Map<string, number>;
    totalOilGrams: number;
    computedAdditives: ReturnType<typeof computeRecipeAdditives>;
    splitLiquidGrams: number | null;
    waterSuggestion: ReturnType<typeof suggestLyeWaterWithSplitLiquid> | null;
    properties: ReturnType<typeof useRecipeProperties>['properties'];
    indexes: ReturnType<typeof useRecipeProperties>['indexes'];
    fattyAcids: ReturnType<typeof useFormulationInsights>['fattyAcids'];
    insights: ReturnType<typeof useFormulationInsights>['insights'];
    lyeLabel: string;
    additiveGrams: number;
    extrasGrams: number;
    batchWeightWithExtras: number;
    liveOilBatchFraction: number | null;
    batchSheetData: ReturnType<typeof buildBatchSheetData> | null;
  };
  ```
  NOTE: `useRecipeAutosave(...)` stays in `App` (it's a side-effect, not a derivation). The `moldSizerInput` state also stays in `App`; the view-model only needs `liveOilBatchFraction`, which it computes from `displayTotals` + `batchWeightWithExtras` and is combined with `moldSizerInput` at the panel.

- [ ] **Step 1: Write the failing test (render the hook via a probe component)**

Create `packages/web/src/hooks/useRecipeViewModel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useRecipeViewModel } from './useRecipeViewModel';
import { createStarterLines, DEFAULT_SETTINGS, createEmptyAdditives } from '../lib/recipe';

afterEach(cleanup);

function probe(onVm: (vm: unknown) => void) {
  function Probe() {
    const vm = useRecipeViewModel({
      recipeName: 'Test',
      lines: createStarterLines(),
      settings: DEFAULT_SETTINGS,
      additives: createEmptyAdditives(),
      drafts: {},
      weightUnit: 'g',
    });
    onVm(vm);
    return null;
  }
  render(<Probe />);
}

test('view-model computes a lye result and printable batch sheet for the starter recipe', () => {
  let captured: any;
  probe((vm) => { captured = vm; });
  expect(captured.result).not.toBeNull();
  expect(captured.totalOilGrams).toBeGreaterThan(0);
  expect(captured.inputErrors).toEqual([]);
  expect(captured.batchSheetData).not.toBeNull();
  expect(captured.lyeLabel).toBe('NaOH');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -w @soap-calc/web -- useRecipeViewModel`
Expected: FAIL ("useRecipeViewModel is not a function" / no such module).

- [ ] **Step 3: Create the hook, moving the derivations verbatim from `App.tsx`**

Create `packages/web/src/hooks/useRecipeViewModel.ts`. Move `App.tsx` lines **86–218** verbatim (the `usePreviewRecipeState` call through the `batchSheetData` `useMemo`), plus the scalar derivations interleaved there (`totalOilGrams`, `splitLiquidGrams`, `lyeLabel`, `additiveGrams`, `extrasGrams`, `batchWeightWithExtras`). Import what those lines use (from `@soap-calc/core`: `suggestLyeWaterWithSplitLiquid`; from libs: `computeRecipeAdditives`, `computeSplitLiquidGrams`, `buildBatchSheetData`, `canPrintBatchSheet`, `waterModeLabel`, `oilBatchFraction`, `computeRecipeLineTotals`, `formatRecipePercentTotal`? no — formatting stays in the panel; keep only what feeds the returned fields, `hasRecipeLineData`, `usePreviewRecipeState`, `usePreviewSettings`; hooks `useRecipeCalculation`, `useRecipeProperties`, `useFormulationInsights`). Return the `RecipeViewModel` object.

- [ ] **Step 4: Run the view-model test to verify it passes**

Run: `npm run test -w @soap-calc/web -- useRecipeViewModel`
Expected: PASS (1 test).

- [ ] **Step 5: Wire `App.tsx` to the hook and delete the moved derivations**

In `App.tsx`, replace lines 86–218 with:

```tsx
const vm = useRecipeViewModel({ recipeName, lines, settings, additives, drafts, weightUnit });
```

Keep `useRecipeAutosave(recipeName, lines, settings, additives);` in `App`. Update every downstream reference (JSX props, `handlePrintBatchSheet`) to read from `vm.*` (e.g. `vm.result`, `vm.displayTotals`, `vm.batchSheetData`, `vm.totalOilGrams`, `vm.previewState`, `vm.previewSettings`, `vm.lineTotals`, …). Remove now-unused imports from `App` (let `tsc` guide you).

- [ ] **Step 6: Typecheck, full suite, and e2e**

Run:
```bash
npm run build:web && npm test
npm run test:e2e -w @soap-calc/web
```
Expected: build clean; `Tests 101 passed` (100 + new view-model test); all 7 e2e specs pass (the low-coverage property e2e and autosave e2e both exercise the derived chain).

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/hooks/useRecipeViewModel.ts packages/web/src/hooks/useRecipeViewModel.test.tsx packages/web/src/App.tsx
git commit -m "refactor(web): extract useRecipeViewModel from App

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Extract `<SettingsPanel>`

**Why:** The settings `<section>` (`App.tsx` lines ~588–810) is ~220 lines of form JSX — the largest single block in `App`. It's self-contained: it reads `settings` + a few `vm`/`inputs` values and writes via `setSettings`. Extraction drops it to a `<SettingsPanel {...} />` line.

**Files:**
- Create: `packages/web/src/components/SettingsPanel.tsx`
- Create: `packages/web/src/components/SettingsPanel.test.tsx`
- Modify: `packages/web/src/App.tsx`

**Interfaces:**
- Consumes:
  ```ts
  type SettingsPanelProps = {
    settings: RecipeSettings;
    setSettings: React.Dispatch<React.SetStateAction<RecipeSettings>>;
    weightUnit: WeightUnit;
    totalOilGrams: number;
    lyeGrams: number;                 // vm.result?.lyeWeightGrams ?? 0
    waterSuggestion: RecipeViewModel['waterSuggestion'];
    moldSizerInput: MoldSizerInput;   // type from lib/moldSizer
    onMoldSizerChange: (next: MoldSizerInput) => void;
    liveOilBatchFraction: number | null;
    onApplySuggestedOilGrams: (oilGrams: number) => void;
  };
  ```
- Produces: `export function SettingsPanel(props: SettingsPanelProps): JSX.Element`. Internally still renders `<SplitLiquidPanel>` and `<MoldSizerPanel>` (moved with the form, since they live inside this section today).

- [ ] **Step 1: Write the failing render/interaction test**

Create `packages/web/src/components/SettingsPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { SettingsPanel } from './SettingsPanel';
import { DEFAULT_SETTINGS, type RecipeSettings } from '../lib/recipe';
import { DEFAULT_MOLD_SIZER_INPUT } from '../lib/moldSizer';

afterEach(cleanup);

function Harness() {
  const [settings, setSettings] = useState<RecipeSettings>(DEFAULT_SETTINGS);
  return (
    <>
      <SettingsPanel
        settings={settings} setSettings={setSettings} weightUnit="g"
        totalOilGrams={1000} lyeGrams={140} waterSuggestion={null}
        moldSizerInput={DEFAULT_MOLD_SIZER_INPUT} onMoldSizerChange={() => {}}
        liveOilBatchFraction={null} onApplySuggestedOilGrams={() => {}}
      />
      <output aria-label="superfat-echo">{settings.superfatPercent}</output>
    </>
  );
}

test('editing superfat updates settings state', () => {
  render(<Harness />);
  const input = screen.getByLabelText('Superfat %') as HTMLInputElement;
  expect(input.value).toBe('5');
  fireEvent.change(input, { target: { value: '8' } });
  expect(screen.getByLabelText('superfat-echo').textContent).toBe('8');
});

test('dual lye type reveals the KOH blend field', () => {
  render(<Harness />);
  fireEvent.change(screen.getByLabelText('Lye type'), { target: { value: 'dual' } });
  expect(screen.getByLabelText('KOH % of alkali (by weight)')).toBeTruthy();
});
```

NOTE: this test relies on each `<label>` wrapping its `<span>Superfat %</span>` + input. `getByLabelText` matches the label text. If any field lacks an accessible name, add `aria-label` during extraction. `DEFAULT_MOLD_SIZER_INPUT` and `MoldSizerInput` are exported from `../lib/moldSizer` (verified: `moldSizer.ts:27` / `moldSizer.ts:15`) — no new export needed.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -w @soap-calc/web -- SettingsPanel`
Expected: FAIL (no such module).

- [ ] **Step 3: Create `SettingsPanel.tsx` by moving the settings `<section>` verbatim**

Move `App.tsx` lines **588–810** (the `<section className="panel">` containing Settings, the `<SplitLiquidPanel>`, `<MoldSizerPanel>`, and the process-notes `<textarea>`) into `SettingsPanel`. Rewire closed-over identifiers to props: `settings`→`props.settings`, `setSettings`→`props.setSettings`, `weightUnit`→`props.weightUnit`, `totalOilGrams`→`props.totalOilGrams`, `result?.lyeWeightGrams ?? 0`→`props.lyeGrams`, `waterSuggestion`→`props.waterSuggestion`, `moldSizerInput`→`props.moldSizerInput`, `setMoldSizerInput`→`props.onMoldSizerChange`, `liveOilBatchFraction`→`props.liveOilBatchFraction`, `handleApplySuggestedOilGrams`→`props.onApplySuggestedOilGrams`. Import `SplitLiquidPanel`, `MoldSizerPanel`, and the `RecipeSettings`/`WeightUnit` types.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w @soap-calc/web -- SettingsPanel`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire `App.tsx` — replace the section with `<SettingsPanel .../>`**

In `App.tsx`, replace lines 588–810 with:

```tsx
<SettingsPanel
  settings={settings}
  setSettings={setSettings}
  weightUnit={weightUnit}
  totalOilGrams={vm.totalOilGrams}
  lyeGrams={vm.result?.lyeWeightGrams ?? 0}
  waterSuggestion={vm.waterSuggestion}
  moldSizerInput={moldSizerInput}
  onMoldSizerChange={setMoldSizerInput}
  liveOilBatchFraction={vm.liveOilBatchFraction}
  onApplySuggestedOilGrams={inputs.handleApplySuggestedOilGrams}
/>
```

Remove now-unused imports from `App` (`SplitLiquidPanel`, `MoldSizerPanel` if unused elsewhere).

- [ ] **Step 6: Typecheck, full suite, and e2e**

Run: `npm run build:web && npm test && npm run test:e2e -w @soap-calc/web`
Expected: build clean; `Tests 103 passed`; e2e green.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/SettingsPanel.tsx packages/web/src/components/SettingsPanel.test.tsx packages/web/src/App.tsx
git commit -m "refactor(web): extract SettingsPanel from App

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Extract `<RecipeOilsPanel>`

**Why:** The recipe-oils `<section>` (`App.tsx` lines ~432–577: entry bar + oils table + totals foot) is the last large block. It reads preview values + the `inputs` handlers. Extraction leaves `App` as a thin layout shell.

**Files:**
- Create: `packages/web/src/components/RecipeOilsPanel.tsx`
- Create: `packages/web/src/components/RecipeOilsPanel.test.tsx`
- Modify: `packages/web/src/App.tsx`

**Interfaces:**
- Consumes:
  ```ts
  type RecipeOilsPanelProps = {
    lines: RecipeLine[];
    weightUnit: WeightUnit;
    previewState: RecipeViewModel['previewState'];
    previewLineByKey: RecipeViewModel['previewLineByKey'];
    lineTotals: RecipeViewModel['lineTotals'];
    showRecipeTotals: boolean;
    percentTotalOff: boolean;
    weightTotalOff: boolean;
    getDraft: (id: string, canonicalDisplay: string) => string;
    setDraft: (id: string, value: string) => void;
    debouncer: UseRecipeInputsDeps['debouncer'];
    inputs: RecipeInputs;   // the whole handler bag (updateLine, addLine, removeLine, commit*, handle*, *InputId)
  };
  ```
- Produces: `export function RecipeOilsPanel(props: RecipeOilsPanelProps): JSX.Element`.

- [ ] **Step 1: Write the failing render/interaction test**

Create `packages/web/src/components/RecipeOilsPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RecipeOilsPanel } from './RecipeOilsPanel';
import { createStarterLines } from '../lib/recipe';

afterEach(cleanup);

function makeInputs(over: Partial<any> = {}) {
  return {
    weightInputId: (k: string) => `weight-${k}`,
    percentInputId: (k: string) => `percent-${k}`,
    batchInputId: 'batch-total',
    updateLine: vi.fn(), addLine: vi.fn(), removeLine: vi.fn(),
    commitWeightInput: vi.fn(), commitPercentInput: vi.fn(), commitBatchInput: vi.fn(),
    handleWeightChange: vi.fn(), handleBatchChange: vi.fn(),
    flushCommittedDrafts: vi.fn(), discardDrafts: vi.fn(), handleExportCommitted: vi.fn(),
    handleNewRecipe: vi.fn(), handleApplySuggestedOilGrams: vi.fn(), setWeightUnit: vi.fn(),
    ...over,
  };
}

test('Add oil button calls inputs.addLine', () => {
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
      debouncer={{ flush: (_, fn) => fn(), cancel: vi.fn(), cancelAll: vi.fn() }}
      inputs={inputs as any}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: '+ Add oil' }));
  expect(inputs.addLine).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -w @soap-calc/web -- RecipeOilsPanel`
Expected: FAIL (no such module).

- [ ] **Step 3: Create `RecipeOilsPanel.tsx` by moving the oils `<section>` verbatim**

Move `App.tsx` lines **432–577** (the `<section className="panel">` with the head + entry bar + `recipe-table` + foot) into `RecipeOilsPanel`. Rewire identifiers to props/`inputs`: `addLine`→`props.inputs.addLine`, `getDraft`/`setDraft`→props, `debouncer`→props, `previewState`/`previewLineByKey`/`lineTotals`→props, `weightUnitConfig`→derive locally via `WEIGHT_UNITS[props.weightUnit]`, `handleBatchChange`/`commitBatchInput`/`handleWeightChange`/`commitWeightInput`/`commitPercentInput`/`updateLine`/`removeLine`→`props.inputs.*`, id helpers→`props.inputs.weightInputId`/`percentInputId`/`batchInputId`. Import `OilPicker`, `oilById`, `isTarOil`, `WEIGHT_UNITS`, `WEIGHT_UNIT_OPTIONS`, `gramsStringToInputDisplay`, `previewWeightDisplay`, `previewPercentDisplay`, `formatWeight`, `formatRecipePercentTotal`, and the needed types.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w @soap-calc/web -- RecipeOilsPanel`
Expected: PASS (1 test).

- [ ] **Step 5: Wire `App.tsx` — replace the section with `<RecipeOilsPanel .../>`**

In `App.tsx`, replace lines 432–577 with:

```tsx
<RecipeOilsPanel
  lines={lines} weightUnit={weightUnit}
  previewState={vm.previewState} previewLineByKey={vm.previewLineByKey}
  lineTotals={vm.lineTotals} showRecipeTotals={vm.showRecipeTotals}
  percentTotalOff={vm.percentTotalOff} weightTotalOff={vm.weightTotalOff}
  getDraft={getDraft} setDraft={setDraft} debouncer={debouncer}
  inputs={inputs}
/>
```

Remove now-unused imports from `App` (`OilPicker`, `WEIGHT_UNITS`, preview display helpers, etc.). `App.tsx` should now be roughly the header, `<main>` layout with `<RecipeOilsPanel>`/`<AdditivesPanel>`/`<SettingsPanel>`/`<ResultsPanel>`/`<PropertiesPanel>`/`<FattyAcidPanel>`/`<FormulationInsightsPanel>`, footer, and `<BatchSheet>` — target well under 200 lines.

- [ ] **Step 6: Typecheck, full suite, and e2e**

Run: `npm run build:web && npm test && npm run test:e2e -w @soap-calc/web`
Expected: build clean; `Tests 104 passed`; **all 7 e2e specs pass** — this is the critical regression gate for the oils-table input behavior.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/RecipeOilsPanel.tsx packages/web/src/components/RecipeOilsPanel.test.tsx packages/web/src/App.tsx
git commit -m "refactor(web): extract RecipeOilsPanel; App is now a layout shell

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: DRY the duplicated purity/water fields in `SettingsPanel`

**Why:** Inside `SettingsPanel`, the NaOH/KOH purity input is physically written three times (naoh branch, koh branch, dual branch renders both), and the three water-mode fields share one shape. A small field-config collapses the duplication so adding a process-specific field later (Tier 2) is a one-line config change. This is the only task that changes JSX *structure* — verified by the Task 6 tests still passing plus one new config test.

**Files:**
- Create: `packages/web/src/lib/settingsFields.ts`
- Create: `packages/web/src/lib/settingsFields.test.ts`
- Modify: `packages/web/src/components/SettingsPanel.tsx`

**Interfaces:**
- Produces:
  ```ts
  type NumericFieldSpec = {
    key: keyof RecipeSettings;   // e.g. 'naohPurityPercent'
    label: string;               // e.g. 'NaOH purity %'
    min: number; max?: number; step: number;
  };
  export const PURITY_FIELDS: Record<'naoh' | 'koh', NumericFieldSpec>;
  export function purityFieldsFor(lyeType: RecipeSettings['lyeType']): NumericFieldSpec[];
  export const WATER_FIELDS: Record<RecipeSettings['waterMode'], NumericFieldSpec>;
  ```

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/lib/settingsFields.test.ts`:

```ts
import { purityFieldsFor, WATER_FIELDS } from './settingsFields';

test('naoh shows one purity field, dual shows both', () => {
  expect(purityFieldsFor('naoh').map((f) => f.key)).toEqual(['naohPurityPercent']);
  expect(purityFieldsFor('koh').map((f) => f.key)).toEqual(['kohPurityPercent']);
  expect(purityFieldsFor('dual').map((f) => f.key)).toEqual(['naohPurityPercent', 'kohPurityPercent']);
});

test('each water mode maps to its field', () => {
  expect(WATER_FIELDS.percent_of_oils.key).toBe('waterPercentOfOils');
  expect(WATER_FIELDS.lye_concentration.key).toBe('lyeConcentrationPercent');
  expect(WATER_FIELDS.lye_water_ratio.key).toBe('lyeWaterRatio');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -w @soap-calc/web -- settingsFields`
Expected: FAIL (no such module).

- [ ] **Step 3: Implement `settingsFields.ts`**

```ts
import type { RecipeSettings } from './recipe';

type NumericFieldSpec = { key: keyof RecipeSettings; label: string; min: number; max?: number; step: number };

export const PURITY_FIELDS = {
  naoh: { key: 'naohPurityPercent', label: 'NaOH purity %', min: 1, max: 100, step: 0.1 },
  koh: { key: 'kohPurityPercent', label: 'KOH purity %', min: 1, max: 100, step: 0.1 },
} satisfies Record<'naoh' | 'koh', NumericFieldSpec>;

export function purityFieldsFor(lyeType: RecipeSettings['lyeType']): NumericFieldSpec[] {
  if (lyeType === 'naoh') return [PURITY_FIELDS.naoh];
  if (lyeType === 'koh') return [PURITY_FIELDS.koh];
  return [PURITY_FIELDS.naoh, PURITY_FIELDS.koh];
}

export const WATER_FIELDS = {
  percent_of_oils: { key: 'waterPercentOfOils', label: 'Water % of oils', min: 0, step: 1 },
  lye_concentration: { key: 'lyeConcentrationPercent', label: 'Lye concentration %', min: 0.1, max: 99.9, step: 0.1 },
  lye_water_ratio: { key: 'lyeWaterRatio', label: 'Water : lye ratio', min: 0.1, step: 0.1 },
} satisfies Record<RecipeSettings['waterMode'], NumericFieldSpec>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @soap-calc/web -- settingsFields`
Expected: PASS (2 tests).

- [ ] **Step 5: Refactor `SettingsPanel` to render purity/water fields from config**

Replace the three hand-written purity branches with `purityFieldsFor(settings.lyeType).map((f) => <NumericSettingField spec={f} ... />)` and the water-mode block with `WATER_FIELDS[settings.waterMode]`. Define a small local `NumericSettingField` that renders the `<label><span>{spec.label}</span><input .../></label>` and calls `setSettings((s) => ({ ...s, [spec.key]: e.target.value }))`. **Keep the exact same visible labels** so the Task 6 `getByLabelText('Superfat %')`/`'KOH % of alkali (by weight)'` tests and any e2e label queries keep matching. (Superfat, lye-type select, KOH-blend, and water-method select stay as-is; only the repeated purity + water-value inputs become config-driven.)

- [ ] **Step 6: Full suite (Task 6 tests guard the render) + typecheck + e2e**

Run: `npm run build:web && npm test && npm run test:e2e -w @soap-calc/web`
Expected: build clean; `Tests 106 passed`; SettingsPanel tests + e2e still green (proves labels/behavior unchanged).

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/lib/settingsFields.ts packages/web/src/lib/settingsFields.test.ts packages/web/src/components/SettingsPanel.tsx
git commit -m "refactor(web): drive SettingsPanel purity/water inputs from field config

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verification (whole plan)

After Task 8:

- [ ] `npm test` → `validate:oils` passes + all Vitest suites green (~106 tests).
- [ ] `npm run build:web` → clean `tsc --noEmit` + successful `vite build`.
- [ ] `npm run test:e2e -w @soap-calc/web` → 7/7 Playwright specs pass.
- [ ] `wc -l packages/web/src/App.tsx` → target < 200 lines (from 841).
- [ ] Manual smoke via `/run` skill: `npm run dev:web`, load a recipe, edit a weight, switch weight unit, toggle lye type to dual, enable split liquid, print the batch sheet — confirm identical behavior to `main`.

## Notes / Deferred (out of scope for this plan)

- **Tier 2 (CP/LS/HP `process` field)** needs its own brainstorming/design pass — it's a feature-design question (LS dilution model, HP guidance), not a refactor. Task 8's field-config is the seam it will build on. Extend `SOAP_PROPERTY_GUIDE` (`packages/core/src/properties.ts`) and the `FORMULATION_*_GUIDE` family (`packages/core/src/formulation-guide.ts`) into per-process maps there — **note:** there is no `FORMULATION_PROPERTY_GUIDE` symbol; use the real names.
- **Tier 3 (settings parse/validation layer)**, **Tier 4 (reducer/context)**, **Tier 6 (perf hygiene)** — revisit once Tiers 1–2 land.

## Self-Review

- **Spec coverage:** Tier 0 → Tasks 1–2. Tier 1 harness → Task 3. Tier 1 decomposition (4 units) → Tasks 4–7. Tier 1 DRY win → Task 8. Tier 5 decision (add testing-library) → baked into Tasks 3–8. All roadmap items in scope are covered.
- **Type consistency:** `RecipeInputs` / `UseRecipeInputsDeps` (Task 4) are consumed unchanged in Task 7's `RecipeOilsPanelProps.inputs` and `.debouncer`. `RecipeViewModel` (Task 5) fields are consumed unchanged in Tasks 6–7 props. `makeInputIds()`/`shouldCommitDraft` names match between Task 4's definition and test. `NumericFieldSpec.key: keyof RecipeSettings` (Task 8) matches the real `RecipeSettings` field names.
- **No placeholders:** every step has exact paths, the moved source line ranges, complete new interfaces, complete test code, and exact commands with expected output. Verbatim JSX bodies are referenced by line range by design (behavior-preserving moves), stated in Architecture.
- **Assumption to verify at execution:** `DEFAULT_MOLD_SIZER_INPUT` export exists in `moldSizerStorage.ts` — if absent, add it in Task 6 Step 3 (already flagged in the test note).
