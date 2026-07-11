# LS Dilution Calculator (+ solution dose basis) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For Liquid Soap, compute the dilution water needed to reach a target soap concentration (paste → finished solution), surface it in an LS-only panel + the batch sheet, and let additives dose against the finished solution weight.

**Architecture:** Pure `calculateDilution` in `@soap-calc/core` (like the lye engine). A persisted `soapConcentrationPercent` setting feeds an LS-gated, result-guarded `dilution` value in the view-model, which drives the DilutionPanel, the batch sheet, and the additive `'solution'` dose basis. No `calculateLye` change — dilution is a read-only derived view.

**Tech Stack:** TypeScript strict, npm workspaces (`@soap-calc/core` pure math, `@soap-calc/web` React 19 + Vite), Vitest (no globals; component tests use `// @vitest-environment jsdom` + `afterEach(cleanup)`, `.getAttribute`/`getAllByRole`, no jest-dom).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-11-ls-dilution-calculator-design.md` — implement exactly.
- **Dilution math (roadmap-verified):** `anhydrous = oils + lye`; `solution = anhydrous ÷ soapFrac`; `totalWater = solution − anhydrous`; `dilutionWater = max(0, totalWater − cookWater)`; `glycerin = 0.55·koh + 0.77·naoh` (**informational**, excluded from the denominator). `null` when `anhydrous ≤ 0` or `soapConcentrationPercent` outside `(0,100)`.
- **`soapConcentrationPercent`** is a `RecipeSettings` string field, default `'30'`; the dilution compute is **gated to `process === 'ls'` AND guards nullable `result`**.
- **`'solution'` dose basis:** `DoseBasis = 'oil' | 'batch' | 'solution'`; every one of the four `basis === 'batch' ? … : oil` ternaries becomes 3-way (a missed one silently treats `solution` as `oil`); solution-basis lines are skipped when `solutionGrams ≤ 0` (non-LS).
- **No core-lye change; CP/HP unchanged** (panel hidden, `dilution` null, solution lines inert, no solution dose-mode option). **No preservative percentages** (supplier-sourced, Phase 2).
- **Anonymity:** numbers/behavior only; no source names in code, UI, or comments.
- Run from repo root `/Users/str/soap-calc`. Commit only per-task; don't touch the uncommitted `index.css` WIP or `oils-data` build artifacts. Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Full gate: `npm test` (tsc all packages + validate:oils + all vitest). Targeted: `npx vitest run <path>`.

---

## File Structure

- `packages/core/src/dilution.ts` (new) — **Task 1**: `calculateDilution`. Exported via `index.ts` `export * from './dilution.js'`.
- `packages/core/src/additives.ts` — **Task 5**: `DoseBasis` gains `'solution'`.
- `packages/web/src/lib/recipe.ts` — **Task 2**: `soapConcentrationPercent` setting. **Task 5**: 3-way `normalizeAdditiveLine` basis.
- `packages/web/src/hooks/useRecipeViewModel.ts` — **Task 2**: LS-gated `dilution`. **Task 4**: thread into batch sheet. **Task 5**: pass `solutionGrams` to the additive compute.
- `packages/web/src/components/DilutionPanel.tsx` (new) — **Task 3**.
- `packages/web/src/App.tsx` — **Task 3**: render the panel for LS.
- `packages/web/src/lib/batchSheet.ts` + `BatchSheet.tsx` — **Task 4**: Dilution section.
- `packages/web/src/lib/calculateAdditives.ts` — **Task 5**: 3-way basis + `solutionGrams`.
- `packages/web/src/lib/formatDose.ts` — **Task 5**: `'solution'` label.
- `packages/web/src/lib/recipeFile.ts` — **Task 5**: 3-way basis.
- `packages/web/src/components/AdditivesPanel.tsx` — **Task 6**: LS-only solution dose modes + guard.

**Order & green:** dilution ships first (Tasks 1–4, a complete usable feature), then the bundled solution basis (Tasks 5–6). `DoseBasis` widening is backward-compatible, so each task ends green.

---

### Task 1: Core `calculateDilution`

**Files:**
- Create: `packages/core/src/dilution.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/dilution.test.ts`

**Interfaces:**
- Produces: `DilutionInput`, `DilutionResult`, `calculateDilution(input: DilutionInput): DilutionResult | null` (from `@soap-calc/core`).

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/dilution.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { calculateDilution } from './dilution.js';

describe('calculateDilution', () => {
  it('computes solution, water, dilution water, and glycerin', () => {
    const r = calculateDilution({ anhydrousGrams: 1200, cookWaterGrams: 400, kohGrams: 200, naohGrams: 0, soapConcentrationPercent: 30 });
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.solutionGrams).toBeCloseTo(4000);      // 1200 / 0.30
    expect(r.totalWaterGrams).toBeCloseTo(2800);    // 4000 - 1200
    expect(r.dilutionWaterGrams).toBeCloseTo(2400); // 2800 - 400
    expect(r.glycerinGrams).toBeCloseTo(110);       // 0.55 * 200
    expect(r.targetExceedsPaste).toBe(false);
  });
  it('clamps dilution water to 0 and flags when the target exceeds the paste concentration', () => {
    const r = calculateDilution({ anhydrousGrams: 1200, cookWaterGrams: 400, kohGrams: 200, naohGrams: 0, soapConcentrationPercent: 90 });
    expect(r?.dilutionWaterGrams).toBe(0);
    expect(r?.targetExceedsPaste).toBe(true);
  });
  it('sums glycerin from both alkalis', () => {
    const r = calculateDilution({ anhydrousGrams: 1000, cookWaterGrams: 300, kohGrams: 100, naohGrams: 100, soapConcentrationPercent: 30 });
    expect(r?.glycerinGrams).toBeCloseTo(132); // 0.55*100 + 0.77*100
  });
  it('returns null for anhydrous <= 0 or soap% outside (0,100)', () => {
    expect(calculateDilution({ anhydrousGrams: 0, cookWaterGrams: 0, kohGrams: 0, naohGrams: 0, soapConcentrationPercent: 30 })).toBeNull();
    expect(calculateDilution({ anhydrousGrams: 1000, cookWaterGrams: 300, kohGrams: 100, naohGrams: 0, soapConcentrationPercent: 0 })).toBeNull();
    expect(calculateDilution({ anhydrousGrams: 1000, cookWaterGrams: 300, kohGrams: 100, naohGrams: 0, soapConcentrationPercent: 100 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/core/src/dilution.test.ts`
Expected: FAIL — module `./dilution.js` not found.

- [ ] **Step 3: Implement `calculateDilution`**

Create `packages/core/src/dilution.ts`:
```ts
export type DilutionInput = {
  anhydrousGrams: number; // oils + lye (water-free soap solids)
  cookWaterGrams: number; // water already in the paste (the lye water)
  kohGrams: number;
  naohGrams: number;
  soapConcentrationPercent: number;
};

export type DilutionResult = {
  anhydrousGrams: number;
  solutionGrams: number;
  totalWaterGrams: number;
  dilutionWaterGrams: number;
  glycerinGrams: number;
  soapConcentrationPercent: number;
  targetExceedsPaste: boolean;
};

/** Dilute a cooked LS paste to a target soap concentration. Glycerin is informational
 * (excluded from the concentration denominator, per anhydrous = oils + lye). */
export function calculateDilution(input: DilutionInput): DilutionResult | null {
  const { anhydrousGrams, cookWaterGrams, kohGrams, naohGrams, soapConcentrationPercent } = input;
  if (!Number.isFinite(anhydrousGrams) || anhydrousGrams <= 0) return null;
  if (!Number.isFinite(soapConcentrationPercent) || soapConcentrationPercent <= 0 || soapConcentrationPercent >= 100) {
    return null;
  }
  const cook = Number.isFinite(cookWaterGrams) && cookWaterGrams > 0 ? cookWaterGrams : 0;
  const soapFrac = soapConcentrationPercent / 100;
  const solutionGrams = anhydrousGrams / soapFrac;
  const totalWaterGrams = solutionGrams - anhydrousGrams;
  const targetExceedsPaste = totalWaterGrams < cook;
  const dilutionWaterGrams = Math.max(0, totalWaterGrams - cook);
  const glycerinGrams =
    (Number.isFinite(kohGrams) ? kohGrams : 0) * 0.55 + (Number.isFinite(naohGrams) ? naohGrams : 0) * 0.77;
  return {
    anhydrousGrams,
    solutionGrams,
    totalWaterGrams,
    dilutionWaterGrams,
    glycerinGrams,
    soapConcentrationPercent,
    targetExceedsPaste,
  };
}
```

In `packages/core/src/index.ts`, add alongside the other `export *` lines:
```ts
export * from './dilution.js';
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run packages/core/src/dilution.test.ts` then `npm test`
Expected: PASS (targeted + full gate green).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/dilution.ts packages/core/src/dilution.test.ts packages/core/src/index.ts
git commit -m "feat(core): add calculateDilution (LS paste -> solution)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `soapConcentrationPercent` setting + LS-gated view-model `dilution`

**Files:**
- Modify: `packages/web/src/lib/recipe.ts`, `packages/web/src/hooks/useRecipeViewModel.ts`
- Test: `packages/web/src/lib/recipe.test.ts`, `packages/web/src/hooks/useRecipeViewModel.test.tsx`

**Interfaces:**
- Consumes: `calculateDilution` (Task 1); `RecipeSettings`, the lye `result` (`totalOilWeightGrams`, `lyeWeightGrams`, `kohWeightGrams`, `naohWeightGrams`, `waterWeightGrams`).
- Produces: `RecipeSettings.soapConcentrationPercent: string` (default `'30'`); `RecipeViewModel.dilution: DilutionResult | null`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/web/src/lib/recipe.test.ts`:
```ts
import { DEFAULT_SETTINGS } from './recipe';
it('defaults soapConcentrationPercent to 30', () => {
  expect(DEFAULT_SETTINGS.soapConcentrationPercent).toBe('30');
});
```

Add to `packages/web/src/hooks/useRecipeViewModel.test.tsx` (the file already has `probe(onVm, settingsOverride, process)` using `createStarterLines`, and imports `useRecipeViewModel`, `DEFAULT_SETTINGS`, `createEmptyAdditives`, `render`):
```ts
test('dilution: computed for LS, null for CP, null (no crash) for an empty LS recipe', () => {
  let ls: any;
  let cp: any;
  probe((vm) => { ls = vm; }, { soapConcentrationPercent: '30' }, 'ls');
  probe((vm) => { cp = vm; }, { soapConcentrationPercent: '30' }, 'cp');
  expect(ls.dilution).not.toBeNull();
  expect(ls.dilution.solutionGrams).toBeGreaterThan(ls.dilution.anhydrousGrams);
  expect(cp.dilution).toBeNull();

  let empty: any;
  function Probe() {
    empty = useRecipeViewModel({
      recipeName: 'Empty', lines: [], settings: { ...DEFAULT_SETTINGS, soapConcentrationPercent: '30' },
      additives: createEmptyAdditives(), drafts: {}, weightUnit: 'g', process: 'ls',
    });
    return null;
  }
  render(<Probe />);
  expect(empty.dilution).toBeNull();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run packages/web/src/lib/recipe.test.ts packages/web/src/hooks/useRecipeViewModel.test.tsx`
Expected: FAIL — `soapConcentrationPercent`/`dilution` don't exist.

- [ ] **Step 3: Add the setting**

In `packages/web/src/lib/recipe.ts`, add `soapConcentrationPercent: string;` to the `RecipeSettings` type (near `postCookSuperfatPercent`), and `soapConcentrationPercent: '30',` to `DEFAULT_SETTINGS`. No `normalizeSettings` change is needed — a plain string field rides the `{...DEFAULT_SETTINGS, ...partial}` spread with the default fallback, exactly like `postCookSuperfatPercent`.

(If any existing test asserts the *entire* `DEFAULT_SETTINGS` shape via `toEqual`, add `soapConcentrationPercent: '30'` there too — `tsc`/the test run will flag it.)

- [ ] **Step 4: Compute `dilution` in the view-model**

In `packages/web/src/hooks/useRecipeViewModel.ts`:
- Add `calculateDilution` and its type to the `@soap-calc/core` import: `import { calculateDilution, suggestLyeWaterWithSplitLiquid } from '@soap-calc/core';` and `import type { DilutionResult } from '@soap-calc/core';` (or add to an existing type import).
- Place this **immediately after `baseBatchGrams`, before the `computedAdditives` memo** — Task 5 wires `solutionGrams` (from `dilution`) into `computedAdditives`, so `dilution` must be declared first. Its inputs (`result`, `previewSettings`) are already in scope there.
```ts
  const dilution = useMemo(
    () =>
      process === 'ls' && result
        ? calculateDilution({
            anhydrousGrams: result.totalOilWeightGrams + result.lyeWeightGrams,
            cookWaterGrams: result.waterWeightGrams,
            kohGrams: result.kohWeightGrams,
            naohGrams: result.naohWeightGrams,
            soapConcentrationPercent: Number(previewSettings.soapConcentrationPercent),
          })
        : null,
    [process, result, previewSettings.soapConcentrationPercent],
  );
```
- Add `dilution: DilutionResult | null;` to the `RecipeViewModel` type and `dilution` to the returned object.

- [ ] **Step 5: Run to verify they pass**

Run: `npm test`
Expected: PASS (full gate). CP/HP behavior unchanged.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/lib/recipe.ts packages/web/src/lib/recipe.test.ts packages/web/src/hooks/useRecipeViewModel.ts packages/web/src/hooks/useRecipeViewModel.test.tsx
git commit -m "feat(web): soapConcentrationPercent setting + LS-gated dilution in the view-model

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: DilutionPanel (LS-only)

**Files:**
- Create: `packages/web/src/components/DilutionPanel.tsx`, `packages/web/src/components/DilutionPanel.test.tsx`
- Modify: `packages/web/src/App.tsx`

**Interfaces:**
- Consumes: `DilutionResult` (Task 1), `vm.dilution` + `settings.soapConcentrationPercent`/`setSettings` (Task 2), `formatWeight`.
- Produces: `DilutionPanel` component.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/components/DilutionPanel.test.tsx`:
```ts
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DilutionPanel } from './DilutionPanel';
import type { DilutionResult } from '@soap-calc/core';

afterEach(cleanup);

const RESULT: DilutionResult = {
  anhydrousGrams: 1200, solutionGrams: 4000, totalWaterGrams: 2800,
  dilutionWaterGrams: 2400, glycerinGrams: 110, soapConcentrationPercent: 30, targetExceedsPaste: false,
};

test('renders the dilution figures', () => {
  render(<DilutionPanel dilution={RESULT} soapConcentrationPercent="30" onSoapConcentrationChange={() => {}} weightUnit="g" />);
  expect(screen.getByText('Dilution water to add')).toBeTruthy();
  expect(screen.getByText('2,400 g')).toBeTruthy();
});

test('shows the target-exceeds-paste warning', () => {
  render(<DilutionPanel dilution={{ ...RESULT, dilutionWaterGrams: 0, soapConcentrationPercent: 90, targetExceedsPaste: true }} soapConcentrationPercent="90" onSoapConcentrationChange={() => {}} weightUnit="g" />);
  expect(screen.getByRole('alert').textContent).toContain('more dilute');
});

test('shows a hint when dilution is null', () => {
  render(<DilutionPanel dilution={null} soapConcentrationPercent="30" onSoapConcentrationChange={() => {}} weightUnit="g" />);
  expect(screen.getByText(/Enter oils and a target/)).toBeTruthy();
});

test('editing the concentration calls onSoapConcentrationChange', () => {
  const onChange = vi.fn();
  render(<DilutionPanel dilution={RESULT} soapConcentrationPercent="30" onSoapConcentrationChange={onChange} weightUnit="g" />);
  fireEvent.change(screen.getByLabelText('Target soap concentration percent'), { target: { value: '25' } });
  expect(onChange).toHaveBeenCalledWith('25');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/web/src/components/DilutionPanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `DilutionPanel`**

Create `packages/web/src/components/DilutionPanel.tsx`:
```tsx
import type { DilutionResult } from '@soap-calc/core';
import { formatWeight } from '../lib/weightUnits';
import type { WeightUnit } from '../lib/recipe';

type DilutionPanelProps = {
  dilution: DilutionResult | null;
  soapConcentrationPercent: string;
  onSoapConcentrationChange: (value: string) => void;
  weightUnit: WeightUnit;
};

export function DilutionPanel({
  dilution,
  soapConcentrationPercent,
  onSoapConcentrationChange,
  weightUnit,
}: DilutionPanelProps) {
  return (
    <section className="panel panel--nested">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Dilution</h2>
          <p className="panel__subtitle">Water to add to reach a target soap concentration</p>
        </div>
      </div>
      <label className="field">
        <span>Target soap concentration (%)</span>
        <input
          type="number"
          className="input input--number"
          min={0}
          max={100}
          step={1}
          value={soapConcentrationPercent}
          onChange={(e) => onSoapConcentrationChange(e.target.value)}
          aria-label="Target soap concentration percent"
        />
      </label>
      {dilution ? (
        <>
          <dl className="results-grid">
            <div className="results-grid__item results-grid__item--primary">
              <dt>Dilution water to add</dt>
              <dd>{formatWeight(dilution.dilutionWaterGrams, weightUnit)}</dd>
            </div>
            <div className="results-grid__item">
              <dt>Paste (anhydrous)</dt>
              <dd>{formatWeight(dilution.anhydrousGrams, weightUnit)}</dd>
            </div>
            <div className="results-grid__item">
              <dt>Finished solution</dt>
              <dd>{formatWeight(dilution.solutionGrams, weightUnit)}</dd>
            </div>
            <div className="results-grid__item">
              <dt>Total water</dt>
              <dd>{formatWeight(dilution.totalWaterGrams, weightUnit)}</dd>
            </div>
            <div className="results-grid__item">
              <dt>Glycerin (retained)</dt>
              <dd>{formatWeight(dilution.glycerinGrams, weightUnit)}</dd>
            </div>
          </dl>
          {dilution.targetExceedsPaste && (
            <p className="results-hint" role="alert">
              The paste is already more dilute than {dilution.soapConcentrationPercent}% — adding water
              only lowers the concentration further.
            </p>
          )}
          <p className="results-hint">Typical: coconut ≤40% · castile ~25% · blends 25–35%.</p>
        </>
      ) : (
        <p className="results-hint">Enter oils and a target concentration (0–100%) to compute dilution.</p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Wire it into App for LS**

In `packages/web/src/App.tsx`, add the import `import { DilutionPanel } from './components/DilutionPanel';`, and render it in the sidebar immediately after `</ResultsPanel>` (the `<ResultsPanel … />` closing):
```tsx
          {process === 'ls' && (
            <DilutionPanel
              dilution={vm.dilution}
              soapConcentrationPercent={settings.soapConcentrationPercent}
              onSoapConcentrationChange={(value) =>
                setSettings({ ...settings, soapConcentrationPercent: value })
              }
              weightUnit={weightUnit}
            />
          )}
```

- [ ] **Step 5: Run to verify + full gate**

Run: `npx vitest run packages/web/src/components/DilutionPanel.test.tsx` then `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/DilutionPanel.tsx packages/web/src/components/DilutionPanel.test.tsx packages/web/src/App.tsx
git commit -m "feat(web): LS DilutionPanel (paste -> solution, water to add, glycerin)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Batch-sheet Dilution section

**Files:**
- Modify: `packages/web/src/lib/batchSheet.ts`, `packages/web/src/components/BatchSheet.tsx`, `packages/web/src/hooks/useRecipeViewModel.ts`
- Test: `packages/web/src/lib/batchSheet.test.ts`

**Interfaces:**
- Consumes: `DilutionResult` (Task 1), `vm.dilution` (Task 2).
- Produces: `BatchSheetData.dilution: DilutionResult | null`.

- [ ] **Step 1: Write the failing test**

In `packages/web/src/lib/batchSheet.test.ts`, add a test building `buildBatchSheetData` with a dilution result and asserting the section prints (follow the existing PCSF batch-sheet test's construction; pass `process: 'ls'`). Include a `dilution` field in the build input:
```ts
import type { DilutionResult } from '@soap-calc/core';
// inside the existing describe:
it('prints an LS dilution section when dilution is present', () => {
  const lines = createStarterLines();
  const { result, displayTotals, linePercents } = calculateRecipe(lines, DEFAULT_SETTINGS);
  if (!result || !displayTotals) throw new Error('expected a valid calculation');
  const dilution: DilutionResult = {
    anhydrousGrams: 1200, solutionGrams: 4000, totalWaterGrams: 2800,
    dilutionWaterGrams: 2400, glycerinGrams: 110, soapConcentrationPercent: 30, targetExceedsPaste: false,
  };
  const data = buildBatchSheetData({
    recipeName: 'LS', batchNotes: '', weightUnit: 'g', lyeLabel: 'KOH', settings: DEFAULT_SETTINGS,
    lines, linePercents, result, displayTotals, additives: [], splitLiquid: undefined, splitLiquidGrams: null,
    postCookSuperfat: null, dilution, properties: null,
    indexes: { iodine: null, ins: null, coveragePercent: 0, missingOilIds: [] },
    batchWeightWithExtras: displayTotals.batchWeightGrams, waterModeLabel: '2:1',
    fattyAcids: { profile: null, coveragePercent: 0, missingOilIds: [] }, insights: [], process: 'ls',
  });
  expect(data.dilution).toEqual(dilution);
});
```
(Also add `dilution: null` to every other existing `buildBatchSheetData({...})` call in this test file — `tsc` will flag them.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/web/src/lib/batchSheet.test.ts`
Expected: FAIL — `dilution` not in the build input / `BatchSheetData`.

- [ ] **Step 3: Thread `dilution` through the batch sheet**

In `packages/web/src/lib/batchSheet.ts`: add `import type { DilutionResult } from '@soap-calc/core';`, add `dilution: DilutionResult | null;` to both the `BatchSheetData` type and the `buildBatchSheetData` input type (next to `postCookSuperfat`), and carry it through in the returned object (`dilution,`).

In `packages/web/src/hooks/useRecipeViewModel.ts`, pass `dilution,` into the `buildBatchSheetData({ … })` call, and add `dilution` to that memo's dependency array.

In `packages/web/src/components/BatchSheet.tsx`, destructure `dilution` from `data` and, after the additives section, render (LS-only via the truthiness of `dilution`):
```tsx
      {dilution && (
        <section className="batch-sheet__section">
          <h2>Dilution</h2>
          <dl className="batch-sheet__dl">
            <div><dt>Paste (anhydrous)</dt><dd>{formatWeight(dilution.anhydrousGrams, weightUnit)}</dd></div>
            <div><dt>Target concentration</dt><dd>{formatGrams(dilution.soapConcentrationPercent, 0)}%</dd></div>
            <div><dt>Dilution water to add</dt><dd>{formatWeight(dilution.dilutionWaterGrams, weightUnit)}</dd></div>
            <div><dt>Finished solution</dt><dd>{formatWeight(dilution.solutionGrams, weightUnit)}</dd></div>
            <div><dt>Glycerin (retained)</dt><dd>{formatWeight(dilution.glycerinGrams, weightUnit)}</dd></div>
          </dl>
        </section>
      )}
```
(`formatWeight` and `formatGrams` are already imported in `BatchSheet.tsx`.)

- [ ] **Step 4: Run + full gate**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/batchSheet.ts packages/web/src/components/BatchSheet.tsx packages/web/src/hooks/useRecipeViewModel.ts packages/web/src/lib/batchSheet.test.ts
git commit -m "feat(web): print an LS dilution section on the batch sheet

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `'solution'` dose basis (model, calc, migration, label)

**Files:**
- Modify: `packages/core/src/additives.ts`, `packages/web/src/lib/calculateAdditives.ts`, `packages/web/src/lib/recipe.ts`, `packages/web/src/lib/recipeFile.ts`, `packages/web/src/lib/formatDose.ts`, `packages/web/src/hooks/useRecipeViewModel.ts`
- Test: `packages/web/src/lib/calculateAdditives.test.ts`, `packages/web/src/lib/formatDose.test.ts`, `packages/web/src/lib/recipe.test.ts`, `packages/web/src/lib/recipeFile.test.ts`

**Interfaces:**
- Produces: `DoseBasis = 'oil' | 'batch' | 'solution'`; `computeRecipeAdditives(additives, { oilGrams, batchGrams, solutionGrams })`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/web/src/lib/calculateAdditives.test.ts` (the `line` helper already builds an `AdditiveLine`; `computeRecipeAdditives` now takes a weights object):
```ts
it('a solution-basis line uses solutionGrams', () => {
  const [row] = computeRecipeAdditives([line({ amount: '2', basis: 'solution' })], { oilGrams: 1000, batchGrams: 1500, solutionGrams: 4000 });
  expect(row.grams).toBe(80); // 2% of 4000
});
it('skips a solution-basis line when solutionGrams is 0 (non-LS)', () => {
  expect(computeRecipeAdditives([line({ amount: '2', basis: 'solution' })], { oilGrams: 1000, batchGrams: 1500, solutionGrams: 0 })).toEqual([]);
});
```
Add to `packages/web/src/lib/formatDose.test.ts`:
```ts
it('labels the solution basis', () => {
  expect(formatDose(1, 'solution', 'percent')).toBe('1% of solution');
  expect(formatDose(3, 'solution', 'ppt')).toBe('3 ppt of solution');
});
```
Add to `packages/web/src/lib/recipe.test.ts`:
```ts
it('normalizeAdditiveLine accepts basis solution, defaults unknown to oil', () => {
  expect(normalizeAdditiveLine({ key: 'k', amount: '1', basis: 'solution' }).basis).toBe('solution');
  expect(normalizeAdditiveLine({ key: 'k', amount: '1', basis: 'nope' as never }).basis).toBe('oil');
});
```
Add to `packages/web/src/lib/recipeFile.test.ts` (persistence round-trip; `soapConcentrationPercent` rides `DEFAULT_SETTINGS` already exercised by the existing round-trip tests):
```ts
it('round-trips a solution-basis additive through a file', () => {
  const additives = recipeAdditivesFromFile([
    { catalogId: '', name: 'Preservative', amount: '1', basis: 'solution', unit: 'percent', addAt: 'trace' },
  ]);
  const payload = serializeRecipeFile('LS preserve', createStarterLines(), DEFAULT_SETTINGS, additives, 'ls');
  const parsed = parseRecipeFile(JSON.stringify(payload));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.data.additives[0].basis).toBe('solution');
});
```
(Existing `calculateAdditives.test.ts` calls that pass `{ oilGrams, batchGrams }` must gain `solutionGrams: 0` — `tsc` will flag them.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run packages/web/src/lib/calculateAdditives.test.ts packages/web/src/lib/formatDose.test.ts packages/web/src/lib/recipe.test.ts`
Expected: FAIL.

- [ ] **Step 3: Widen `DoseBasis` + the four ternaries**

In `packages/core/src/additives.ts`: `export type DoseBasis = 'oil' | 'batch' | 'solution';`.

In `packages/web/src/lib/calculateAdditives.ts`: change the weights param and `basisWeight`:
```ts
export function computeRecipeAdditives(
  additives: AdditiveLine[],
  { oilGrams, batchGrams, solutionGrams }: { oilGrams: number; batchGrams: number; solutionGrams: number },
): ComputedAdditive[] {
  const result: ComputedAdditive[] = [];
  for (const line of additives) {
    const basisWeight =
      line.basis === 'batch' ? batchGrams : line.basis === 'solution' ? solutionGrams : oilGrams;
    if (basisWeight <= 0) continue;
    // …unchanged…
```

In `packages/web/src/lib/formatDose.ts`:
```ts
const basisWord = basis === 'batch' ? 'batch' : basis === 'solution' ? 'solution' : 'oil';
```

In `packages/web/src/lib/recipe.ts` (`normalizeAdditiveLine`):
```ts
const basis = partial.basis === 'batch' ? 'batch' : partial.basis === 'solution' ? 'solution' : 'oil';
```

In `packages/web/src/lib/recipeFile.ts` (`parseAdditiveLine`):
```ts
const basis = value.basis === 'batch' ? 'batch' : value.basis === 'solution' ? 'solution' : 'oil';
```

- [ ] **Step 4: Pass `solutionGrams` from the view-model**

In `packages/web/src/hooks/useRecipeViewModel.ts`, update the `computedAdditives` memo to pass `solutionGrams` and add it to the deps:
```ts
  const solutionGrams = dilution?.solutionGrams ?? 0;
  const computedAdditives = useMemo(
    () => computeRecipeAdditives(additives, { oilGrams: totalOilGrams, batchGrams: baseBatchGrams, solutionGrams }),
    [additives, totalOilGrams, baseBatchGrams, solutionGrams],
  );
```
(`dilution` is declared just above `computedAdditives` per Task 2, so `solutionGrams` is in scope here.)

- [ ] **Step 5: Run + full gate**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/additives.ts packages/web/src/lib
git commit -m "feat(web): add the 'solution' additive dose basis (LS diluted product)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: LS-only solution dose modes in AdditivesPanel

**Files:**
- Modify: `packages/web/src/components/AdditivesPanel.tsx`
- Test: `packages/web/src/components/AdditivesPanel.test.tsx`

**Interfaces:**
- Consumes: `DoseBasis`/`DoseUnit` (`'solution'` now valid), the panel's `process` prop.

- [ ] **Step 1: Write the failing test**

Add to `packages/web/src/components/AdditivesPanel.test.tsx`:
```ts
function doseModeValues(select: HTMLElement): string[] {
  return within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
}

test('LS offers the solution dose modes; CP does not', () => {
  const additives = [makeLine()];
  const computed = [makeComputed(makeLine())];
  render(<AdditivesPanel additives={additives} computed={computed} weightUnit="g" process="ls" onChange={() => {}} />);
  expect(doseModeValues(screen.getByLabelText('Dose mode'))).toEqual(
    ['oil-percent', 'batch-percent', 'oil-ppt', 'batch-ppt', 'solution-percent', 'solution-ppt'],
  );
  cleanup();
  render(<AdditivesPanel additives={additives} computed={computed} weightUnit="g" process="cp" onChange={() => {}} />);
  expect(doseModeValues(screen.getByLabelText('Dose mode'))).toEqual(
    ['oil-percent', 'batch-percent', 'oil-ppt', 'batch-ppt'],
  );
});

test('a stray solution line under CP still renders its dose-mode option (guard)', () => {
  const line = makeLine({ basis: 'solution', unit: 'percent' });
  render(<AdditivesPanel additives={[line]} computed={[]} weightUnit="g" process="cp" onChange={() => {}} />);
  const select = screen.getByLabelText('Dose mode') as HTMLSelectElement;
  expect(select.value).toBe('solution-percent');
  expect(doseModeValues(select)).toContain('solution-percent');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/web/src/components/AdditivesPanel.test.tsx`
Expected: FAIL — CP offers no solution modes / value has no matching option.

- [ ] **Step 3: Add the solution modes + process gating + guard**

In `packages/web/src/components/AdditivesPanel.tsx`, extend `DOSE_MODES` with the two solution entries and add a per-process filter + a mismatched-option guard mirroring `stageOptions`:
```ts
const DOSE_MODES: { value: string; basis: DoseBasis; unit: DoseUnit; label: string }[] = [
  { value: 'oil-percent', basis: 'oil', unit: 'percent', label: '% of oil' },
  { value: 'batch-percent', basis: 'batch', unit: 'percent', label: '% of batch' },
  { value: 'oil-ppt', basis: 'oil', unit: 'ppt', label: 'ppt of oil' },
  { value: 'batch-ppt', basis: 'batch', unit: 'ppt', label: 'ppt of batch' },
  { value: 'solution-percent', basis: 'solution', unit: 'percent', label: '% of solution' },
  { value: 'solution-ppt', basis: 'solution', unit: 'ppt', label: 'ppt of solution' },
];

// The finished solution only exists for LS, so its dose modes are LS-only.
function offeredDoseModesForProcess(process: ProcessId): typeof DOSE_MODES {
  return process === 'ls' ? DOSE_MODES : DOSE_MODES.filter((m) => m.basis !== 'solution');
}
```
Inside `AdditivesPanel`, compute `const offeredDoseModes = offeredDoseModesForProcess(process);`. In the per-row render, build the guarded list before the `<select>`:
```tsx
                const doseModeValue = `${line.basis}-${line.unit}`;
                const doseModeOptions = offeredDoseModes.some((m) => m.value === doseModeValue)
                  ? offeredDoseModes
                  : [...offeredDoseModes, ...DOSE_MODES.filter((m) => m.value === doseModeValue)];
```
and map `doseModeOptions` (instead of `DOSE_MODES`) in the dose-mode `<select>`.

- [ ] **Step 4: Run + full gate**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/AdditivesPanel.tsx packages/web/src/components/AdditivesPanel.test.tsx
git commit -m "feat(web): offer the solution dose modes for LS only (with mismatched-option guard)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Core `calculateDilution` (formulas, glycerin, target-exceeds-paste, null guards) → Task 1.
- `soapConcentrationPercent` setting + LS-gated, result-guarded VM `dilution` → Task 2.
- DilutionPanel (readouts, editable %, warning, hint) + App LS gating → Task 3.
- Batch-sheet Dilution section → Task 4.
- `'solution'` basis: `DoseBasis`, the four 3-way ternaries, `solutionGrams` threading, `formatDose`, migration → Task 5.
- LS-only dose-mode options + mismatched guard → Task 6.
- Persistence (setting rides the spread; basis rides `AdditiveLine`) → Tasks 2 & 5; Task 5 adds a file round-trip test for a `solution`-basis additive, and `soapConcentrationPercent` is exercised by the existing `DEFAULT_SETTINGS` round-trip tests.
- Scope boundaries (no core-lye change; CP/HP inert; glycerin informational; no preservative %) → held throughout.

**Placeholder scan:** none — every code step shows full code; existing-test updates give an explicit rule + `tsc`-flagged sites.

**Type consistency:** `calculateDilution(input): DilutionResult | null`, `DilutionResult` fields, `RecipeViewModel.dilution`, `computeRecipeAdditives(additives, { oilGrams, batchGrams, solutionGrams })`, `formatDose(amount, basis, unit)` with `'solution'`, and `DoseBasis = 'oil' | 'batch' | 'solution'` are used identically across tasks. The `solutionGrams` weights-object field is introduced in Task 5 and every `computeRecipeAdditives` caller/test is updated in the same task.
