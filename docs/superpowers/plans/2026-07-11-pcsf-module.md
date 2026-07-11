# Post-Cook Superfat (PCSF) Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the append-vs-subtract method, DOS/high-PUFA guidance, and HP/LS seed values to the shipped post-cook superfat, making it the full HP feature.

**Architecture:** A pure core `scaleLyeResult` presents subtract as a reduced-lye *view* over the full-recipe result (lye/water are linear in oil weight), so the recipe-oil basis stays intact for additives/dilution/mold-sizer — no `calculateLye` change. A new core insight keyed on the chosen PCSF oil's PUFA carries the DOS guidance. Seed values + a method setting ride the existing process-defaults + settings persistence.

**Tech Stack:** TypeScript strict, npm workspaces (`@soap-calc/core` pure math, `@soap-calc/web` React 19 + Vite), Vitest (no globals; component tests use `// @vitest-environment jsdom` + `afterEach(cleanup)`, `.getAttribute`/`getAllByRole`, no jest-dom).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-11-pcsf-module-design.md` — implement exactly.
- **No `calculateLye` change.** Subtract is a web-layer reduced-lye view via the pure `scaleLyeResult`.
- **Subtract math:** cook lye/water = full `× (1 − PCSF%)`; oil weight, `lyeConcentrationPercent`, `waterLyeRatio` unchanged; total oil = recipe; PCSF **not** folded into batch weight (reserved). `factor` clamped to `[0,1]`.
- **Append is the default method** → existing HP/LS recipes are numerically identical to today.
- **DOS threshold: PUFA `> 30`** on the chosen PCSF oil; the only shipped numbers are the verified **1% BHT + 1% sodium citrate**.
- **Seeds:** HP `postCookSuperfatPercent '5'`, LS `'2'`; `postCookSuperfatMethod` default `'append'`.
- **No property/fatty-acid change; CP untouched.**
- **Anonymity:** numbers/behavior only; no source names in code, UI, or comments.
- Run from repo root `/Users/str/soap-calc`. Commit per-task; don't touch untracked `.claude/` or `oils-data` build artifacts. Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Full gate: `npm test`. Targeted: `npx vitest run <path>`.

---

## File Structure

- `packages/core/src/lye.ts` — **Task 1**: `scaleLyeResult`.
- `packages/core/src/insights.ts` — **Task 2**: DOS insight + input field.
- `packages/web/src/lib/recipe.ts` — **Task 3**: `postCookSuperfatMethod` setting.
- `packages/web/src/lib/process.ts` — **Task 3**: HP/LS seed values.
- `packages/web/src/hooks/useRecipeViewModel.ts` — **Task 4**: subtract wiring (scaled `result` + batch fork).
- `packages/web/src/hooks/useFormulationInsights.ts` — **Task 5**: PCSF-oil PUFA → DOS.
- `packages/web/src/components/SettingsPanel.tsx` — **Task 6**: method toggle.
- `packages/web/src/components/ResultsPanel.tsx`, `App.tsx`, `lib/batchSheet.ts`, `components/BatchSheet.tsx` — **Task 7**: method-aware display.

Pieces are independent; each task ends green (append default → behavior-neutral until a recipe opts into subtract).

---

### Task 1: Core `scaleLyeResult`

**Files:**
- Modify: `packages/core/src/lye.ts`
- Test: `packages/core/src/lye.test.ts`

**Interfaces:**
- Produces: `scaleLyeResult(result: LyeCalculationResult, factor: number): LyeCalculationResult`.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/lye.test.ts` (the file already imports `calculateLye` + `type OilForLyeCalc` and defines an `OLIVE` fixture):
```ts
import { scaleLyeResult } from './lye.js';

describe('scaleLyeResult', () => {
  const input = {
    oils: [{ oilId: 'olive-oil', weightGrams: 1000 }],
    oilLookup: { 'olive-oil': OLIVE },
    superfatPercent: 5,
    lyeType: 'naoh' as const,
    waterMode: 'percent_of_oils' as const,
    waterPercentOfOils: 33,
  };
  const full = calculateLye(input);

  it('scales lye/water/per-line by the factor, leaving oil/concentration/ratio unchanged', () => {
    const s = scaleLyeResult(full, 0.9);
    expect(s.lyeWeightGrams).toBeCloseTo(full.lyeWeightGrams * 0.9);
    expect(s.naohWeightGrams).toBeCloseTo(full.naohWeightGrams * 0.9);
    expect(s.waterWeightGrams).toBeCloseTo(full.waterWeightGrams * 0.9);
    expect(s.lines[0].lyeGrams).toBeCloseTo(full.lines[0].lyeGrams * 0.9);
    expect(s.totalOilWeightGrams).toBe(full.totalOilWeightGrams);
    expect(s.lines[0].weightGrams).toBe(full.lines[0].weightGrams);
    expect(s.lyeConcentrationPercent).toBe(full.lyeConcentrationPercent);
    expect(s.waterLyeRatio).toBe(full.waterLyeRatio);
    expect(s.totalBatchWeightGrams).toBeCloseTo(full.totalOilWeightGrams + full.lyeWeightGrams * 0.9 + full.waterWeightGrams * 0.9);
  });

  it('matches a real recompute on scaled oils (linearity)', () => {
    const recomputed = calculateLye({ ...input, oils: [{ oilId: 'olive-oil', weightGrams: 900 }] });
    expect(scaleLyeResult(full, 0.9).lyeWeightGrams).toBeCloseTo(recomputed.lyeWeightGrams);
    expect(scaleLyeResult(full, 0.9).waterWeightGrams).toBeCloseTo(recomputed.waterWeightGrams);
  });

  it('clamps factor to [0,1]', () => {
    expect(scaleLyeResult(full, 1.5).lyeWeightGrams).toBe(full.lyeWeightGrams);
    expect(scaleLyeResult(full, -0.5).lyeWeightGrams).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/core/src/lye.test.ts`
Expected: FAIL — `scaleLyeResult` not exported.

- [ ] **Step 3: Implement**

In `packages/core/src/lye.ts`, add (after `calculateLye`):
```ts
/** Present a lye result as if the oils were scaled by `factor` (0–1): scales the lye-side
 * quantities (lye/water are linear in oil weight), preserving oil weights, concentration,
 * and water:lye ratio. Used for the post-cook-superfat "subtract" method (reserve oil). */
export function scaleLyeResult(result: LyeCalculationResult, factor: number): LyeCalculationResult {
  const f = Math.min(1, Math.max(0, factor));
  const lyeWeightGrams = result.lyeWeightGrams * f;
  const naohWeightGrams = result.naohWeightGrams * f;
  const kohWeightGrams = result.kohWeightGrams * f;
  const waterWeightGrams = result.waterWeightGrams * f;
  return {
    ...result,
    lyeWeightGrams,
    naohWeightGrams,
    kohWeightGrams,
    waterWeightGrams,
    totalBatchWeightGrams: result.totalOilWeightGrams + lyeWeightGrams + waterWeightGrams,
    lines: result.lines.map((line) => ({
      ...line,
      lyeGrams: line.lyeGrams * f,
      naohGrams: line.naohGrams * f,
      kohGrams: line.kohGrams * f,
    })),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run packages/core/src/lye.test.ts` then `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/lye.ts packages/core/src/lye.test.ts
git commit -m "feat(core): add scaleLyeResult (reduced-lye view for PCSF subtract)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Core DOS / high-PUFA insight

**Files:**
- Modify: `packages/core/src/insights.ts`
- Test: `packages/core/src/formulation.test.ts`

**Interfaces:**
- Produces: `FormulationAnalysisInput.postCookSuperfatPufaPercent?: number`; insight code `high_pufa_post_cook_superfat` (`level: 'warning'`).

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/formulation.test.ts` (it already imports `analyzeFormulation`):
```ts
describe('high_pufa_post_cook_superfat', () => {
  const base = {
    properties: null, fattyAcids: null, totalOilGrams: 1000, superfatPercent: 3,
    lyeConcentrationPercent: 33, waterLyeRatio: 2, waterGrams: 80, lyeGrams: 100,
  };
  it('fires when the PCSF oil PUFA exceeds 30', () => {
    const insights = analyzeFormulation({ ...base, postCookSuperfatPufaPercent: 65 });
    expect(insights.some((i) => i.code === 'high_pufa_post_cook_superfat')).toBe(true);
  });
  it('does not fire at/below 30 or when undefined', () => {
    expect(analyzeFormulation({ ...base, postCookSuperfatPufaPercent: 25 }).some((i) => i.code === 'high_pufa_post_cook_superfat')).toBe(false);
    expect(analyzeFormulation(base).some((i) => i.code === 'high_pufa_post_cook_superfat')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/core/src/formulation.test.ts`
Expected: FAIL — insight not emitted.

- [ ] **Step 3: Implement**

In `packages/core/src/insights.ts`: add to `FormulationAnalysisInput` (near `superfatPercent`):
```ts
  /** PUFA (linoleic + linolenic) % of the chosen post-cook superfat oil, when PCSF is active. */
  postCookSuperfatPufaPercent?: number;
```
And add the insight inside `analyzeFormulation` (near the other superfat/PUFA insights, before the final `return insights;`):
```ts
  if (input.postCookSuperfatPufaPercent !== undefined && input.postCookSuperfatPufaPercent > 30) {
    insights.push({
      level: 'warning',
      code: 'high_pufa_post_cook_superfat',
      message:
        'Post-cook superfat oil is high in linoleic + linolenic — added unsaponified, it is prone to DOS/rancidity. Prefer a stable superfat oil (coconut, olive, almond, cocoa, shea) and/or an antioxidant (e.g. 1% BHT + 1% sodium citrate); store cool.',
    });
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run packages/core/src/formulation.test.ts` then `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/insights.ts packages/core/src/formulation.test.ts
git commit -m "feat(core): DOS insight for a high-PUFA post-cook superfat oil

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Method setting + HP/LS seed defaults

**Files:**
- Modify: `packages/web/src/lib/recipe.ts`, `packages/web/src/lib/process.ts`
- Test: `packages/web/src/lib/recipe.test.ts`, `packages/web/src/lib/process.test.ts`

**Interfaces:**
- Produces: `RecipeSettings.postCookSuperfatMethod: 'append' | 'subtract'` (default `'append'`).

- [ ] **Step 1: Write the failing tests**

Add to `packages/web/src/lib/recipe.test.ts`:
```ts
it('defaults postCookSuperfatMethod to append', () => {
  expect(DEFAULT_SETTINGS.postCookSuperfatMethod).toBe('append');
});
```
Add to `packages/web/src/lib/process.test.ts` (it imports `PROCESS_DEFINITIONS`):
```ts
it('seeds HP 5% / LS 2% post-cook superfat defaults', () => {
  expect(PROCESS_DEFINITIONS.hp.defaultSettings.postCookSuperfatPercent).toBe('5');
  expect(PROCESS_DEFINITIONS.ls.defaultSettings.postCookSuperfatPercent).toBe('2');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run packages/web/src/lib/recipe.test.ts packages/web/src/lib/process.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `packages/web/src/lib/recipe.ts`: add `postCookSuperfatMethod: 'append' | 'subtract';` to `RecipeSettings` (near `postCookSuperfatOilId`) and `postCookSuperfatMethod: 'append',` to `DEFAULT_SETTINGS`. (Rides the `{...DEFAULT_SETTINGS, ...partial}` spread — no `normalizeSettings` change.)

In `packages/web/src/lib/process.ts`, add to the `hp` and `ls` `defaultSettings`:
```ts
      postCookSuperfatPercent: '5',   // in hp.defaultSettings
      postCookSuperfatPercent: '2',   // in ls.defaultSettings
```

- [ ] **Step 4: Run to verify + full gate**

Run: `npm test`
Expected: PASS. (If a test asserts the whole `DEFAULT_SETTINGS` shape via `toEqual`, add `postCookSuperfatMethod: 'append'` there — tsc/the run will flag it.)

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/recipe.ts packages/web/src/lib/process.ts packages/web/src/lib/recipe.test.ts packages/web/src/lib/process.test.ts
git commit -m "feat(web): postCookSuperfatMethod setting + HP 5% / LS 2% PCSF seeds

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: View-model subtract wiring

**Files:**
- Modify: `packages/web/src/hooks/useRecipeViewModel.ts`
- Test: `packages/web/src/hooks/useRecipeViewModel.test.tsx`

**Interfaces:**
- Consumes: `scaleLyeResult` (Task 1), `postCookSuperfatMethod` (Task 3).
- Produces: `vm.result` reflects reduced lye under subtract; `vm.batchWeightWithExtras` excludes PCSF under subtract.

- [ ] **Step 1: Write the failing test**

Add to `packages/web/src/hooks/useRecipeViewModel.test.tsx` (has `probe(onVm, settingsOverride, process)`):
```ts
test('subtract reduces the lye by (1 − PCSF%) while oil weight stays on the full recipe', () => {
  let append: any;
  let subtract: any;
  probe((vm) => { append = vm; }, { postCookSuperfatPercent: '10', postCookSuperfatMethod: 'append' }, 'hp');
  probe((vm) => { subtract = vm; }, { postCookSuperfatPercent: '10', postCookSuperfatMethod: 'subtract' }, 'hp');

  expect(subtract.result.lyeWeightGrams).toBeCloseTo(append.result.lyeWeightGrams * 0.9);
  expect(subtract.result.waterWeightGrams).toBeCloseTo(append.result.waterWeightGrams * 0.9);
  expect(subtract.totalOilGrams).toBeCloseTo(append.totalOilGrams); // oil unchanged
  // append folds PCSF into batch (extra oil); subtract reserves it (not added)
  expect(subtract.batchWeightWithExtras).toBeLessThan(append.batchWeightWithExtras);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/web/src/hooks/useRecipeViewModel.test.tsx`
Expected: FAIL — subtract lye is not reduced yet.

- [ ] **Step 3: Implement the scaled result + batch fork**

In `packages/web/src/hooks/useRecipeViewModel.ts`:
- Add `scaleLyeResult` to the `@soap-calc/core` import.
- Rename the calculation destructure and derive the cook-factor-scaled result **right after it** (before `totalOilGrams`, `dilution`, and `computedAdditives`, which must all see the correct values):
```ts
  const { result: fullResult, inputErrors, displayTotals, linePercents } = useRecipeCalculation(
    previewState.lines,
    previewSettings,
  );
  const cookFactor =
    process !== 'cp' &&
    previewSettings.postCookSuperfatMethod === 'subtract' &&
    (Number(previewSettings.postCookSuperfatPercent) || 0) > 0
      ? Math.min(1, Math.max(0, 1 - (Number(previewSettings.postCookSuperfatPercent) || 0) / 100))
      : 1;
  const result = cookFactor < 1 && fullResult ? scaleLyeResult(fullResult, cookFactor) : fullResult;
```
- In the `totalOilGrams` / `baseBatchGrams` lines, change the `result?.` fallbacks to `fullResult?.` (so oil weight always reflects the full recipe even under subtract; `scaleLyeResult` preserves oil weight, so this is belt-and-suspenders):
```ts
  const totalOilGrams = displayTotals?.recipeOilWeightGrams ?? fullResult?.totalOilWeightGrams ?? 0;
  const baseBatchGrams = displayTotals?.batchWeightGrams ?? fullResult?.totalBatchWeightGrams ?? 0;
```
- Everything else already reads `result` — it now transparently carries the reduced lye under subtract (Results panel, dilution's lye, glycerin, batch sheet).
- **Batch fork.** Replace the `batchWeightWithExtras` block so PCSF is an extra only under append, and subtract rebuilds the base from the reduced lye/water:
```ts
  const additiveGrams = computedAdditives.reduce((sum, item) => sum + item.grams, 0);
  const pcsfIsExtra = previewSettings.postCookSuperfatMethod !== 'subtract';
  const extrasGrams =
    additiveGrams + (splitLiquidGrams ?? 0) + (pcsfIsExtra ? postCookSuperfat?.grams ?? 0 : 0);
  const batchWeightWithExtras =
    (pcsfIsExtra
      ? (displayTotals?.batchWeightGrams ?? result?.totalBatchWeightGrams ?? 0)
      : (displayTotals?.recipeOilWeightGrams ?? 0) + (result?.lyeWeightGrams ?? 0) + (result?.waterWeightGrams ?? 0)) +
    extrasGrams;
```

- [ ] **Step 4: Run to verify + full gate**

Run: `npm test`
Expected: PASS. Append recipes are numerically identical to today (cookFactor = 1 → `result === fullResult`).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/useRecipeViewModel.ts packages/web/src/hooks/useRecipeViewModel.test.tsx
git commit -m "feat(web): PCSF subtract method — reduced-lye view + reserved-oil batch

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: PCSF-oil PUFA → DOS wiring

**Files:**
- Modify: `packages/web/src/hooks/useFormulationInsights.ts`
- Test: `packages/web/src/hooks/useFormulationInsights.test.ts`

**Interfaces:**
- Consumes: the DOS insight (Task 2), `oilById`, core `sumFattyAcids` + `FATTY_ACID_GROUP_KEYS`.
- Produces: `postCookSuperfatPufaPercent(oilId: string): number | undefined`; `FormulationInsightOptions.postCookSuperfat?`.

- [ ] **Step 1: Write the failing test**

Add to `packages/web/src/hooks/useFormulationInsights.test.ts`:
```ts
import { postCookSuperfatPufaPercent } from './useFormulationInsights';

describe('postCookSuperfatPufaPercent', () => {
  it('returns the oil linoleic+linolenic total, undefined for unknown oil', () => {
    const coconut = postCookSuperfatPufaPercent('coconut-oil-76');
    expect(coconut).toBeDefined();
    expect(coconut!).toBeLessThan(30); // coconut is low-PUFA
    expect(postCookSuperfatPufaPercent('not-an-oil')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/web/src/hooks/useFormulationInsights.test.ts`
Expected: FAIL — helper not exported.

- [ ] **Step 3: Implement**

In `packages/web/src/hooks/useFormulationInsights.ts`:
- Add to the `@soap-calc/core` import: `sumFattyAcids`, `FATTY_ACID_GROUP_KEYS`.
- Add the helper + import type `ComputedPostCookSuperfat`:
```ts
export function postCookSuperfatPufaPercent(oilId: string): number | undefined {
  const fa = oilById(oilId)?.fattyAcids;
  return fa ? sumFattyAcids(fa, FATTY_ACID_GROUP_KEYS.polyunsaturated) : undefined;
}
```
- Add `postCookSuperfat?: ComputedPostCookSuperfat | null;` to `FormulationInsightOptions`.
- In the `insights` memo, pass to `analyzeFormulation`:
```ts
      postCookSuperfatPufaPercent: options.postCookSuperfat
        ? postCookSuperfatPufaPercent(options.postCookSuperfat.oilId)
        : undefined,
```
- Add `options.postCookSuperfat` to the memo's dependency array.

In `packages/web/src/hooks/useRecipeViewModel.ts`, pass `postCookSuperfat` into the `useFormulationInsights(..., { … })` options object: `postCookSuperfat,`.

- [ ] **Step 4: Run to verify + full gate**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/useFormulationInsights.ts packages/web/src/hooks/useFormulationInsights.test.ts packages/web/src/hooks/useRecipeViewModel.ts
git commit -m "feat(web): surface the DOS note for a high-PUFA post-cook superfat oil

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Method toggle in SettingsPanel

**Files:**
- Modify: `packages/web/src/components/SettingsPanel.tsx`
- Test: `packages/web/src/components/SettingsPanel.test.tsx`

**Interfaces:**
- Consumes: `postCookSuperfatMethod` (Task 3).

- [ ] **Step 1: Write the failing test**

Add to `packages/web/src/components/SettingsPanel.test.tsx` (it already defines a `<Harness process={…} />` component backed by `useState`):
```ts
test('HP shows the PCSF method toggle and updates it; CP hides it', () => {
  render(<Harness process="hp" />);
  const select = screen.getByLabelText('Post-cook superfat method') as HTMLSelectElement;
  expect(select.value).toBe('append');
  fireEvent.change(select, { target: { value: 'subtract' } });
  expect(select.value).toBe('subtract'); // controlled by the Harness settings state
  cleanup();
  render(<Harness process="cp" />);
  expect(screen.queryByLabelText('Post-cook superfat method')).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/web/src/components/SettingsPanel.test.tsx`
Expected: FAIL — no "Post-cook superfat method" control.

- [ ] **Step 3: Implement**

In `packages/web/src/components/SettingsPanel.tsx`, inside the existing `{process !== 'cp' && ( <> … </> )}` PCSF block, after the "Post-cook superfat oil" `OilPicker` field, add:
```tsx
            <label className="field">
              <span>Post-cook superfat method</span>
              <select
                className="input"
                aria-label="Post-cook superfat method"
                value={settings.postCookSuperfatMethod}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    postCookSuperfatMethod: e.target.value as 'append' | 'subtract',
                  }))
                }
              >
                <option value="append">Append (add oil)</option>
                <option value="subtract">Subtract (reserve)</option>
              </select>
            </label>
```

- [ ] **Step 4: Run to verify + full gate**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/SettingsPanel.tsx packages/web/src/components/SettingsPanel.test.tsx
git commit -m "feat(web): PCSF append/subtract method toggle (HP/LS)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Method-aware PCSF display

**Files:**
- Modify: `packages/web/src/components/ResultsPanel.tsx`, `packages/web/src/App.tsx`, `packages/web/src/lib/batchSheet.ts`, `packages/web/src/components/BatchSheet.tsx`
- Test: `packages/web/src/components/ResultsPanel.test.tsx`

**Interfaces:**
- Consumes: `postCookSuperfatMethod` (Task 3).

- [ ] **Step 1: Write the failing test**

Add to `packages/web/src/components/ResultsPanel.test.tsx` (follow its existing PCSF render setup):
```ts
test('subtract: PCSF labeled reserved + batch weight uses the vm value (not a local recompute)', () => {
  const { result, displayTotals } = calculateRecipe(createStarterLines(), DEFAULT_SETTINGS);
  render(
    <ResultsPanel
      result={result} inputErrors={[]} lyeLabel="NaOH" process="hp" lyeType="naoh"
      displayTotals={displayTotals} weightUnit="g"
      superfatPercent={DEFAULT_SETTINGS.superfatPercent}
      postCookSuperfat={{ oilId: 'shea-butter', percentOfOil: 5, grams: 50 }}
      postCookSuperfatMethod="subtract"
      batchWeightWithExtras={1234}
    />,
  );
  expect(screen.getByText(/reserved/i)).toBeTruthy();
  // The panel renders the vm's batch weight, not (full displayTotals batch + PCSF grams).
  expect(screen.getByText('1,234 g')).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/web/src/components/ResultsPanel.test.tsx`
Expected: FAIL — no "reserved" wording / no `postCookSuperfatMethod` prop.

- [ ] **Step 3: Implement**

**ResultsPanel correctness — it must not show an append-like batch weight under subtract.** ResultsPanel currently *recomputes* its own batch weight from the full `displayTotals.batchWeightGrams` and unconditionally adds `postCookSuperfat.grams` (`ResultsPanel.tsx:79-81, 93-99`), which is wrong under subtract (reduced lye/water + PCSF reserved). Fix it by consuming the view-model's already-correct value and method-gating the PCSF extra:
- Add props `postCookSuperfatMethod?: 'append' | 'subtract';` and `batchWeightWithExtras?: number;` (destructure `postCookSuperfatMethod = 'append'`).
- Replace the extras/batch block (`ResultsPanel.tsx:79-81`):
```tsx
  const additiveGrams = additives.reduce((sum, item) => sum + item.grams, 0);
  const pcsfIsExtra = postCookSuperfatMethod !== 'subtract';
  const extrasGrams =
    additiveGrams + (splitLiquidGrams ?? 0) + (pcsfIsExtra ? postCookSuperfat?.grams ?? 0 : 0);
  const displayedBatchWeight = batchWeightWithExtras ?? batchWeightGrams + extrasGrams;
```
  and change the "Batch weight" JSX to render `formatWeight(displayedBatchWeight, weightUnit)` (was `batchWeightWithExtras`).
- Method-gate the note's PCSF entry (`ResultsPanel.tsx:96`): `postCookSuperfat && pcsfIsExtra ? 'post-cook superfat' : null`.
- In the PCSF result line's `<dt>`, append `{postCookSuperfatMethod === 'subtract' ? ' · reserved, lye reduced' : ''}`.

In `packages/web/src/App.tsx`, pass `postCookSuperfatMethod={vm.previewSettings.postCookSuperfatMethod}` and `batchWeightWithExtras={vm.batchWeightWithExtras}` to `<ResultsPanel>`.

In `packages/web/src/lib/batchSheet.ts`: add `postCookSuperfatMethod: RecipeSettings['postCookSuperfatMethod'];` to `BatchSheetData` and the `buildBatchSheetData` input; carry it through. In `useRecipeViewModel.ts`'s `buildBatchSheetData({ … })` call, pass `postCookSuperfatMethod: previewSettings.postCookSuperfatMethod,` and add it to that memo's deps.

In `packages/web/src/components/BatchSheet.tsx`: destructure `postCookSuperfatMethod` from `data`; in the PCSF `<li>`, append `{postCookSuperfatMethod === 'subtract' ? ' — reserved (lye reduced)' : ''}`; and method-gate the local `extrasGrams` (`BatchSheet.tsx:51`) so PCSF is excluded under subtract (`… + (postCookSuperfatMethod !== 'subtract' ? postCookSuperfat?.grams ?? 0 : 0)`). (This only affects the cosmetic "(with extras)" suffix — the printed batch number already uses the correct `data.batchWeightWithExtras`.)

(Update any existing `buildBatchSheetData({…})` test callers with `postCookSuperfatMethod: 'append'` — tsc will flag them.)

- [ ] **Step 4: Run to verify + full gate**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src
git commit -m "feat(web): method-aware PCSF wording (append added vs subtract reserved)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- `scaleLyeResult` (scale lye-side, preserve oil/concentration/ratio, clamp, linearity) → Task 1.
- DOS insight (`> 30`, message with the verified antioxidant combo) + input field → Task 2.
- `postCookSuperfatMethod` setting (default append) + HP 5% / LS 2% seeds → Task 3.
- Subtract VM wiring (cookFactor + scaled `result`, oil basis on full recipe, batch fork excluding PCSF) → Task 4.
- DOS wiring (PCSF-oil PUFA → `analyzeFormulation`) → Task 5.
- Method toggle → Task 6; method-aware display → Task 7.
- No `calculateLye`/property change, CP untouched, append default → held throughout (Task 4's cookFactor = 1 for append/CP).

**Placeholder scan:** none — every code step is complete; the two "follow the file's existing render setup" notes point at concrete existing patterns, and the tsc-flagged test-caller updates give an explicit rule.

**Type consistency:** `scaleLyeResult(result, factor)`, `postCookSuperfatMethod: 'append' | 'subtract'`, `postCookSuperfatPufaPercent(oilId)`, `FormulationAnalysisInput.postCookSuperfatPufaPercent`, and the `high_pufa_post_cook_superfat` code are used identically across tasks. Task 4 renames the calc destructure to `fullResult` and derives `result`; all downstream `result` consumers are unchanged (they transparently get the scaled value).
