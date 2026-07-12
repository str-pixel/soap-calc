# LS Superfat Guardrail + Lye-Excess Neutralization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an LS superfat guardrail insight and a lye-excess citric-acid neutralization estimate (letting LS superfat go negative), and make the CP-calibrated lye-concentration insights LS-aware.

**Architecture:** Superfat becomes signed (negative = lye excess = extra KOH), permitted only for LS. A new pure core `calculateNeutralization` turns the excess alkali into a citric-acid estimate, mirroring `calculateDilution`. Results surface in a new `NeutralizePanel`, the batch sheet, and two new insights. PCSF-subtract is disabled under a lye excess so the excess math stays correct.

**Tech Stack:** TypeScript npm-workspaces monorepo — `@soap-calc/core` (pure math), `@soap-calc/web` (React 19 + Vite). Vitest (no globals); component tests use jsdom.

## Global Constraints

- **Vitest, NO globals:** import `{ describe, expect, it }` or `{ test }` (and `vi`) from `vitest`. Component/hook tests start with `// @vitest-environment jsdom`, use `@testing-library/react`, `afterEach(cleanup)`, and NO jest-dom matchers (use `.getAttribute`, `.textContent`, `screen.getByText`, `.toBeTruthy()`).
- **Copyright-safe / anonymous:** cite behavior and numbers, never sources. No titles/authors/pages in code, tests, or comments.
- **`NEG_SUPERFAT_FLOOR = -5`** — safety cap, not a recommendation. Duplicated in core (`lye.ts`) and web (`parseRecipeSettings.ts`), matching the existing `MAX_SUPERFAT_PERCENT` / `MAX_SUPERFAT` = 50 duplication.
- **Neutralization stoichiometry** (public chemistry): citric acid **anhydrous** MW `192.124`, KOH `56.1056`, NaOH `39.997`; triprotic citric neutralizes 3 OH⁻ (÷3); dilution water = `4 × citric` (the 1:4 prep); target pH `9`–`10.5`. `active = as-weighed × purity/100`.
- **Negative superfat is LS-only:** the web parse gates it behind `allowNegativeSuperfat = (process === 'ls')`; CP/HP still reject `< 0`. Core `calculateLye` accepts `[-5, 50]` as pure math.
- **Neutralization and PCSF-subtract are mutually exclusive:** force `cookFactor = 1` when the main superfat `< 0`.
- **Citric is a finishing readout** — it must NOT enter `batchWeightWithExtras`, lye, or water.
- **Core stays web-agnostic:** thread `isLiquidSoap: boolean` into core insights, never the web `ProcessId`.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Leave alone:** untracked `.claude/settings.json` and any regenerated `oils-data/data/*.json` build artifacts.
- **Test commands:** per package `npm test -w @soap-calc/core -- <path>` / `npm test -w @soap-calc/web -- <path>` (the path is a vitest filter). Full gate: `npm test` (typecheck + validate:oils + all vitest).
- **Post-plan refactor — line numbers are hints, anchor on quoted code:** three commits landed on this branch after the plan was written — `c71a0f7` (SAP hardening), `5a48158` (oils-data build report), `486e566` (deep-review fixes + performance cleanups). They shifted line numbers throughout and restructured parts of `useRecipeViewModel.ts` and `useFormulationInsights.ts`. Anchor every edit on the **quoted surrounding code**, not the cited line number. Known content-level changes are called out inline in Tasks 7 and 9. Verified still valid: Task 4/5 files (`parseRecipeSettings.ts`, `calculateRecipe.ts`, `useRecipeCalculation.ts`) are unchanged from base; `insights.ts` and `SettingsPanel.tsx` anchors are intact.

---

### Task 1: Core — signed superfat in `calculateLye`

**Files:**
- Modify: `packages/core/src/lye.ts` (add `NEG_SUPERFAT_FLOOR` after line 67; relax the validation at lines 167-175)
- Test: `packages/core/src/lye.test.ts`

**Interfaces:**
- Produces: `calculateLye` accepts `superfatPercent` in `[-5, 50]`; a negative superfat yields more lye than 0% (a lye excess). Error text becomes `superfatPercent must be a finite number between -5 and 50`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/src/lye.test.ts` inside the top-level `describe` (next to the existing `'reports error for invalid superfat'` test):

```ts
  it('accepts a negative superfat (lye excess) and yields more lye than 0%', () => {
    const base = {
      oils: [{ oilId: 'olive-oil', weightGrams: 1000 }],
      oilLookup: { 'olive-oil': OLIVE },
      lyeType: 'naoh' as const,
      waterMode: 'percent_of_oils' as const,
      waterPercentOfOils: 38,
    };
    const excess = calculateLye({ ...base, superfatPercent: -5 });
    const exact = calculateLye({ ...base, superfatPercent: 0 });
    expect(excess.errors).toEqual([]);
    expect(excess.lyeWeightGrams).toBeGreaterThan(exact.lyeWeightGrams);
  });

  it('rejects a superfat below the -5 floor', () => {
    const result = calculateLye({
      oils: [{ oilId: 'olive-oil', weightGrams: 1000 }],
      oilLookup: { 'olive-oil': OLIVE },
      superfatPercent: -6,
      lyeType: 'naoh',
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.lyeWeightGrams).toBe(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w @soap-calc/core -- src/lye.test.ts`
Expected: FAIL — the `-5` case reports an error (current code rejects `< 0`), so `excess.errors` is non-empty and `lyeWeightGrams` is 0.

- [ ] **Step 3: Implement the signed bound**

In `packages/core/src/lye.ts`, after line 67 (`const MAX_SUPERFAT_PERCENT = 50;`) add:

```ts
const NEG_SUPERFAT_FLOOR = -5;
```

Then change the validation block (currently lines 167-175) to:

```ts
  if (
    !Number.isFinite(input.superfatPercent) ||
    input.superfatPercent < NEG_SUPERFAT_FLOOR ||
    input.superfatPercent > MAX_SUPERFAT_PERCENT
  ) {
    errors.push(
      `superfatPercent must be a finite number between ${NEG_SUPERFAT_FLOOR} and ${MAX_SUPERFAT_PERCENT}`,
    );
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @soap-calc/core -- src/lye.test.ts`
Expected: PASS (all lye tests, including the two new ones and the unchanged `superfatPercent: 120` rejection).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/lye.ts packages/core/src/lye.test.ts
git commit -m "feat(core): allow signed superfat down to -5 (lye excess)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Core — `calculateNeutralization`

**Files:**
- Create: `packages/core/src/neutralization.ts`
- Modify: `packages/core/src/index.ts` (add export after line 12 `export * from './dilution.js';`)
- Test: `packages/core/src/neutralization.test.ts`

**Interfaces:**
- Produces:
  - `type NeutralizationInput = { kohGrams: number; naohGrams: number; superfatPercent: number; kohPurityPercent: number; naohPurityPercent: number }`
  - `type NeutralizationResult = { lyeExcessPercent: number; excessKohGrams: number; excessNaohGrams: number; citricAcidGrams: number; dilutionWaterGrams: number; targetPhLow: number; targetPhHigh: number }`
  - `calculateNeutralization(input: NeutralizationInput): NeutralizationResult | null` — `null` when `superfatPercent >= 0`, non-finite, or no alkali.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/neutralization.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { calculateNeutralization } from './neutralization.js';

// 105 g as-weighed KOH at superfat -5 corresponds to 100 g at 0% → 5 g excess.
const BASE = {
  kohGrams: 105,
  naohGrams: 0,
  superfatPercent: -5,
  kohPurityPercent: 100,
  naohPurityPercent: 100,
};

describe('calculateNeutralization', () => {
  it('estimates citric acid from a KOH lye excess', () => {
    const r = calculateNeutralization(BASE)!;
    expect(r).not.toBeNull();
    expect(r.lyeExcessPercent).toBe(5);
    expect(r.excessKohGrams).toBeCloseTo(5, 3);
    // 5 g KOH active × 192.124 / (3 × 56.1056) = 5.708 g citric
    expect(r.citricAcidGrams).toBeCloseTo(5.708, 2);
    expect(r.dilutionWaterGrams).toBeCloseTo(r.citricAcidGrams * 4, 6);
    expect(r.targetPhLow).toBe(9);
    expect(r.targetPhHigh).toBe(10.5);
  });

  it('lowers the citric estimate for impure (90%) KOH', () => {
    const pure = calculateNeutralization(BASE)!;
    const impure = calculateNeutralization({ ...BASE, kohPurityPercent: 90 })!;
    expect(impure.citricAcidGrams).toBeCloseTo(pure.citricAcidGrams * 0.9, 3);
  });

  it('adds the NaOH contribution for dual lye', () => {
    const kohOnly = calculateNeutralization(BASE)!;
    const dual = calculateNeutralization({ ...BASE, naohGrams: 21 })!;
    expect(dual.excessNaohGrams).toBeCloseTo(1, 3); // 21 × 5/105
    expect(dual.citricAcidGrams).toBeGreaterThan(kohOnly.citricAcidGrams);
  });

  it('returns null when superfat is >= 0 or there is no alkali', () => {
    expect(calculateNeutralization({ ...BASE, superfatPercent: 0 })).toBeNull();
    expect(calculateNeutralization({ ...BASE, superfatPercent: 3 })).toBeNull();
    expect(calculateNeutralization({ ...BASE, kohGrams: 0, naohGrams: 0 })).toBeNull();
    expect(calculateNeutralization({ ...BASE, superfatPercent: Number.NaN })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w @soap-calc/core -- src/neutralization.test.ts`
Expected: FAIL — `calculateNeutralization` is not defined (module not found).

- [ ] **Step 3: Implement `calculateNeutralization`**

Create `packages/core/src/neutralization.ts`:

```ts
// Anhydrous citric acid (triprotic) neutralizes 3 OH⁻. Molar masses in g/mol.
const CITRIC_ACID_MW = 192.124;
const KOH_MW = 56.1056;
const NAOH_MW = 39.997;
const CITRIC_WATER_DILUTION = 4; // citric acid dissolved 1:4 in hot water
const TARGET_PH_LOW = 9;
const TARGET_PH_HIGH = 10.5;

export type NeutralizationInput = {
  kohGrams: number; // as-weighed KOH from the lye result (at the negative superfat)
  naohGrams: number; // as-weighed NaOH from the lye result (dual lye)
  superfatPercent: number; // the (negative) main superfat, e.g. -2
  kohPurityPercent: number;
  naohPurityPercent: number;
};

export type NeutralizationResult = {
  lyeExcessPercent: number; // magnitude, e.g. 2 for superfat -2
  excessKohGrams: number; // as-weighed excess KOH
  excessNaohGrams: number; // as-weighed excess NaOH
  citricAcidGrams: number; // anhydrous citric estimate (from active excess)
  dilutionWaterGrams: number; // 4 × citricAcidGrams
  targetPhLow: number;
  targetPhHigh: number;
};

function activeFraction(purityPercent: number): number {
  return Number.isFinite(purityPercent) && purityPercent > 0 ? purityPercent / 100 : 1;
}

/** Estimate the citric acid needed to neutralize a lye-excess (negative-superfat) LS batch
 * down to pH 9–10.5. Returns null when there is no excess (superfat ≥ 0) or no alkali. */
export function calculateNeutralization(input: NeutralizationInput): NeutralizationResult | null {
  const { kohGrams, naohGrams, superfatPercent, kohPurityPercent, naohPurityPercent } = input;
  if (!Number.isFinite(superfatPercent) || superfatPercent >= 0) return null;
  const koh = Number.isFinite(kohGrams) && kohGrams > 0 ? kohGrams : 0;
  const naoh = Number.isFinite(naohGrams) && naohGrams > 0 ? naohGrams : 0;
  if (koh <= 0 && naoh <= 0) return null;

  // Lye is linear in superfat: grams = grams0 × (1 − s/100). Back out the as-weighed excess
  // over exact saponification without recomputing the recipe. s < 0 ⇒ factor in (0, 1).
  const excessFactor = -superfatPercent / (100 - superfatPercent);
  const excessKohGrams = koh * excessFactor;
  const excessNaohGrams = naoh * excessFactor;

  // Active alkali = as-weighed × purity; the pH-driving amount is the active fraction, and
  // using it keeps the estimate on the safe (lower) side.
  const molOH =
    (excessKohGrams * activeFraction(kohPurityPercent)) / KOH_MW +
    (excessNaohGrams * activeFraction(naohPurityPercent)) / NAOH_MW;
  const citricAcidGrams = (molOH / 3) * CITRIC_ACID_MW;

  return {
    lyeExcessPercent: -superfatPercent,
    excessKohGrams,
    excessNaohGrams,
    citricAcidGrams,
    dilutionWaterGrams: citricAcidGrams * CITRIC_WATER_DILUTION,
    targetPhLow: TARGET_PH_LOW,
    targetPhHigh: TARGET_PH_HIGH,
  };
}
```

In `packages/core/src/index.ts`, add after line 12 (`export * from './dilution.js';`):

```ts
export * from './neutralization.js';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @soap-calc/core -- src/neutralization.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/neutralization.ts packages/core/src/neutralization.test.ts packages/core/src/index.ts
git commit -m "feat(core): add calculateNeutralization (lye excess -> citric acid)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Core — LS-aware insights (guardrails + CP-blind fix)

**Files:**
- Modify: `packages/core/src/insights.ts` (add `isLiquidSoap` to `FormulationAnalysisInput`; gate the lye-concentration block at lines 78-94 on `!isLiquidSoap` and soften the low-concentration wording; add two LS insights before `return insights;`)
- Test: `packages/core/src/formulation.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `FormulationAnalysisInput` gains `isLiquidSoap?: boolean`. New insight codes `ls_superfat_high` (warning), `ls_lye_excess` (info). `lye_conc_low` / `lye_conc_high` no longer fire when `isLiquidSoap`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/src/formulation.test.ts` inside the `describe('analyzeFormulation', …)` block:

```ts
  const lsBase = {
    properties: null,
    fattyAcids: null,
    totalOilGrams: 1000,
    lyeConcentrationPercent: 30,
    waterLyeRatio: 2,
    waterGrams: 200,
    lyeGrams: 100,
  };

  it('warns when LS superfat exceeds ~3%', () => {
    const hot = analyzeFormulation({ ...lsBase, superfatPercent: 4, isLiquidSoap: true });
    expect(hot.some((i) => i.code === 'ls_superfat_high')).toBe(true);
    const ok = analyzeFormulation({ ...lsBase, superfatPercent: 2, isLiquidSoap: true });
    expect(ok.some((i) => i.code === 'ls_superfat_high')).toBe(false);
    const cp = analyzeFormulation({ ...lsBase, superfatPercent: 4, isLiquidSoap: false });
    expect(cp.some((i) => i.code === 'ls_superfat_high')).toBe(false);
  });

  it('flags an LS lye excess (negative superfat) for neutralization', () => {
    const insights = analyzeFormulation({ ...lsBase, superfatPercent: -2, isLiquidSoap: true });
    const excess = insights.find((i) => i.code === 'ls_lye_excess');
    expect(excess).toBeTruthy();
    expect(excess!.level).toBe('info');
    expect(excess!.message).toContain('9–10.5');
  });

  it('suppresses the bar-soap lye-concentration warnings for LS', () => {
    const cpHigh = analyzeFormulation({ ...lsBase, superfatPercent: 2, lyeConcentrationPercent: 40, isLiquidSoap: false });
    expect(cpHigh.some((i) => i.code === 'lye_conc_high')).toBe(true);
    const lsHigh = analyzeFormulation({ ...lsBase, superfatPercent: 2, lyeConcentrationPercent: 40, isLiquidSoap: true });
    expect(lsHigh.some((i) => i.code === 'lye_conc_high')).toBe(false);
    const lsLow = analyzeFormulation({ ...lsBase, superfatPercent: 2, lyeConcentrationPercent: 15, isLiquidSoap: true });
    expect(lsLow.some((i) => i.code === 'lye_conc_low')).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w @soap-calc/core -- src/formulation.test.ts`
Expected: FAIL — `ls_superfat_high` / `ls_lye_excess` never appear, and `lye_conc_high` still fires for LS.

- [ ] **Step 3: Implement the LS-aware insights**

In `packages/core/src/insights.ts`, add to the `FormulationAnalysisInput` type (after the `postCookSuperfatPufaPercent?: number;` field, ~line 50):

```ts
  /** True for liquid-soap (KOH) recipes; gates LS-specific insights and exempts LS from the
   * bar-soap lye-concentration warnings. */
  isLiquidSoap?: boolean;
```

Change the lye-concentration block (currently line 78) from `if (input.lyeConcentrationPercent > 0) {` to:

```ts
  if (input.lyeConcentrationPercent > 0 && !input.isLiquidSoap) {
```

In that same block, change the `lye_conc_low` message (line 84) from `'Lye concentration below ~20% — outside typical cold-process range; trace and cure may be very slow.'` to:

```ts
          'Lye concentration below ~20% — outside the typical bar-soap range; trace and cure may be very slow.',
```

Then, immediately before `return insights;` (line 246), add:

```ts
  if (input.isLiquidSoap && input.superfatPercent > 3) {
    insights.push({
      level: 'warning',
      code: 'ls_superfat_high',
      message:
        'Liquid soap above ~3% superfat can turn cloudy and separate — keep LS superfat around 1–3%.',
    });
  }

  if (input.isLiquidSoap && input.superfatPercent < 0) {
    insights.push({
      level: 'info',
      code: 'ls_lye_excess',
      message:
        'Running a lye excess — neutralize the finished soap to pH 9–10.5 with citric acid dissolved 1:4 in hot water, added gradually and confirmed with a pH test. Never acidify a soap that is already on target.',
    });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @soap-calc/core -- src/formulation.test.ts`
Expected: PASS (existing analyzeFormulation tests plus the three new ones).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/insights.ts packages/core/src/formulation.test.ts
git commit -m "feat(core): LS superfat/lye-excess insights + exempt LS from bar-soap lye-conc warnings" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Web — signed superfat in `parseRecipeSettings`

**Files:**
- Modify: `packages/web/src/lib/parseRecipeSettings.ts` (export `NEG_SUPERFAT_FLOOR`; add an `opts` param; replace the superfat parse at lines 92-96)
- Test: `packages/web/src/lib/parseRecipeSettings.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export const NEG_SUPERFAT_FLOOR = -5`. `parseRecipeSettings(settings, opts?: { allowNegativeSuperfat?: boolean })` — omitted ⇒ `false`. When `true`, superfat in `[-5, 50]` parses; below `-5` or non-numeric ⇒ `"Invalid superfat %"`; above `50` ⇒ `"Superfat must be between <min> and 50"`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/web/src/lib/parseRecipeSettings.test.ts` inside the `describe('superfatPercent', …)` block:

```ts
    it('accepts a negative superfat when allowNegativeSuperfat is set (LS lye excess)', () => {
      const result = parseRecipeSettings(settings({ superfatPercent: '-3' }), {
        allowNegativeSuperfat: true,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.values.superfatPercent).toBe(-3);
    });

    it('rejects a negative superfat below the -5 floor even when allowed', () => {
      const result = parseRecipeSettings(settings({ superfatPercent: '-6' }), {
        allowNegativeSuperfat: true,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toEqual(['Invalid superfat %']);
    });

    it('still rejects a negative superfat by default (CP/HP)', () => {
      const result = parseRecipeSettings(settings({ superfatPercent: '-1' }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toEqual(['Invalid superfat %']);
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w @soap-calc/web -- src/lib/parseRecipeSettings.test.ts`
Expected: FAIL — `parseRecipeSettings` takes one argument; `'-3'` is rejected.

- [ ] **Step 3: Implement the signed parse**

In `packages/web/src/lib/parseRecipeSettings.ts`, change line 4 from `const MAX_SUPERFAT = 50;` to:

```ts
const MAX_SUPERFAT = 50;
export const NEG_SUPERFAT_FLOOR = -5;
```

Add this helper next to `parseNonNegative` (after line 28):

```ts
function parseSuperfat(value: string, min: number): { n: number | null; error?: string } {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) return { n: null, error: 'Invalid superfat %' };
  if (n > MAX_SUPERFAT) return { n: null, error: `Superfat must be between ${min} and ${MAX_SUPERFAT}` };
  return { n };
}
```

Change the signature (line 89) and the superfat parse (lines 92-96). The function header becomes:

```ts
export function parseRecipeSettings(
  settings: RecipeSettings,
  opts: { allowNegativeSuperfat?: boolean } = {},
): ParseSettingsResult {
  const errors: string[] = [];
  const minSuperfat = opts.allowNegativeSuperfat ? NEG_SUPERFAT_FLOOR : 0;

  const superfat = parseSuperfat(settings.superfatPercent, minSuperfat);
  if (superfat.error) errors.push(superfat.error);
```

(Delete the old `const superfat = parseNonNegative(...)` / `else if (superfat.n! > MAX_SUPERFAT)` lines 92-96 — `parseSuperfat` now owns both checks. The rest of the function, including `superfatPercent: superfat.n!` at line 119, is unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @soap-calc/web -- src/lib/parseRecipeSettings.test.ts`
Expected: PASS — including the unchanged `'rejects a non-numeric superfat'`, `'rejects a negative superfat'` (default), and `'rejects superfat percent above 50'` cases.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/parseRecipeSettings.ts packages/web/src/lib/parseRecipeSettings.test.ts
git commit -m "feat(web): parseRecipeSettings signed superfat via allowNegativeSuperfat" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Web — thread `process` through the calc chain

**Files:**
- Modify: `packages/web/src/lib/calculateRecipe.ts` (accept optional `process`, derive the flag, pass to `parseRecipeSettings`)
- Modify: `packages/web/src/hooks/useRecipeCalculation.ts` (accept + pass `process`)
- Modify: `packages/web/src/hooks/useRecipeViewModel.ts` (the one `useRecipeCalculation(...)` call at line 95 — add `process`)
- Test: `packages/web/src/lib/calculateRecipe.test.ts`

**Interfaces:**
- Consumes: `parseRecipeSettings(settings, { allowNegativeSuperfat })` (Task 4).
- Produces: `calculateRecipe(lines, settings, process?: ProcessId)` — omitted ⇒ no negative superfat (fail-safe). `useRecipeCalculation(lines, settings, process: ProcessId)`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/web/src/lib/calculateRecipe.test.ts` (import `calculateRecipe` if not already imported at the top). Use a KOH LS recipe with a lye excess:

```ts
  it('computes an LS recipe with a negative superfat (lye excess)', () => {
    const lines = [{ key: 'a', oilId: 'coconut-oil-76', weightGrams: '1000' }];
    const settings = {
      ...DEFAULT_SETTINGS,
      lyeType: 'koh' as const,
      superfatPercent: '-2',
      waterMode: 'lye_water_ratio' as const,
      lyeWaterRatio: '2',
    };
    const ls = calculateRecipe(lines, settings, 'ls');
    expect(ls.inputErrors).toEqual([]);
    expect(ls.result).not.toBeNull();

    const cp = calculateRecipe(lines, settings, 'cp');
    expect(cp.inputErrors).toContain('Invalid superfat %');
  });
```

If `DEFAULT_SETTINGS` is not imported, add `import { DEFAULT_SETTINGS } from './recipe';` to the test file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w @soap-calc/web -- src/lib/calculateRecipe.test.ts`
Expected: FAIL — `calculateRecipe` ignores the third argument, so the LS case reports `Invalid superfat %`.

- [ ] **Step 3: Implement the threading**

In `packages/web/src/lib/calculateRecipe.ts`:

Add `import type { ProcessId } from './process';` to the imports. Change the signature and the `parseRecipeSettings` call:

```ts
export function calculateRecipe(
  lines: RecipeLine[],
  settings: RecipeSettings,
  process?: ProcessId,
): RecipeCalculation {
  const parsed = parseRecipeSettings(settings, { allowNegativeSuperfat: process === 'ls' });
```

In `packages/web/src/hooks/useRecipeCalculation.ts`, change to:

```ts
import { useMemo } from 'react';
import { calculateRecipe } from '../lib/calculateRecipe';
import type { RecipeLine, RecipeSettings } from '../lib/recipe';
import type { ProcessId } from '../lib/process';

export function useRecipeCalculation(
  lines: RecipeLine[],
  settings: RecipeSettings,
  process: ProcessId,
) {
  return useMemo(() => calculateRecipe(lines, settings, process), [lines, settings, process]);
}
```

In `packages/web/src/hooks/useRecipeViewModel.ts`, update the call at line 95 from `useRecipeCalculation(previewState.lines, previewSettings)` to:

```ts
  const { result: fullResult, inputErrors, displayTotals, linePercents } = useRecipeCalculation(
    previewState.lines,
    previewSettings,
    process,
  );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @soap-calc/web -- src/lib/calculateRecipe.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/calculateRecipe.ts packages/web/src/hooks/useRecipeCalculation.ts packages/web/src/hooks/useRecipeViewModel.ts packages/web/src/lib/calculateRecipe.test.ts
git commit -m "feat(web): thread process into calc chain so LS allows a lye excess" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Web — process-aware superfat `min` in `SettingsPanel`

**Files:**
- Modify: `packages/web/src/components/SettingsPanel.tsx` (the superfat `<input>` `min` at line 95)
- Test: `packages/web/src/components/SettingsPanel.test.tsx`

**Interfaces:**
- Consumes: `NEG_SUPERFAT_FLOOR` from `parseRecipeSettings` (Task 4).
- Produces: the superfat input's `min` is `-5` for LS, `0` otherwise.

- [ ] **Step 1: Write the failing test**

Add to `packages/web/src/components/SettingsPanel.test.tsx`, reusing the file's existing `Harness` component (it already renders `SettingsPanel` with a `process` prop and full prop set):

```ts
test('superfat input allows a negative min only for LS', () => {
  const { rerender } = render(<Harness process="cp" />);
  expect(screen.getByLabelText('Superfat %').getAttribute('min')).toBe('0');
  rerender(<Harness process="ls" />);
  expect(screen.getByLabelText('Superfat %').getAttribute('min')).toBe('-5');
});
```

(`Harness`, `render`, `screen`, and `test` are already imported in this file — no new imports needed.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @soap-calc/web -- src/components/SettingsPanel.test.tsx`
Expected: FAIL — the LS `min` is `0` (hardcoded), not `-5`.

- [ ] **Step 3: Implement the process-aware min**

In `packages/web/src/components/SettingsPanel.tsx`, add the import:

```ts
import { NEG_SUPERFAT_FLOOR } from '../lib/parseRecipeSettings';
```

Change the superfat input's `min={0}` (line 95) to:

```tsx
            min={process === 'ls' ? NEG_SUPERFAT_FLOOR : 0}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @soap-calc/web -- src/components/SettingsPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/SettingsPanel.tsx packages/web/src/components/SettingsPanel.test.tsx
git commit -m "feat(web): allow negative superfat entry for LS (process-aware min)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Web — VM: cookFactor guard + neutralization + LS-aware insights

**Files:**
- Modify: `packages/web/src/hooks/useRecipeViewModel.ts` (cookFactor guard; `neutralization` memo; type + return; pass `isLiquidSoap` to insights)
- Modify: `packages/web/src/hooks/useFormulationInsights.ts` (add `isLiquidSoap` option, forward to `analyzeFormulation`)
- Test: `packages/web/src/hooks/useRecipeViewModel.test.tsx`

**Interfaces:**
- Consumes: `calculateNeutralization`, `NeutralizationResult` (Task 2); `analyzeFormulation` `isLiquidSoap` (Task 3).
- Produces: `RecipeViewModel.neutralization: NeutralizationResult | null`. Under `process === 'ls'` with a negative superfat, `cookFactor === 1` (PCSF-subtract disabled) and `neutralization` is populated.

- [ ] **Step 1: Write the failing tests**

Add to `packages/web/src/hooks/useRecipeViewModel.test.tsx`:

```ts
test('LS lye excess computes neutralization and disables PCSF-subtract', () => {
  let withSubtract: any;
  let withAppend: any;
  const ls = {
    superfatPercent: '-2',
    lyeType: 'koh' as const,
    waterMode: 'lye_water_ratio' as const,
    lyeWaterRatio: '2',
    postCookSuperfatPercent: '5',
  };
  probe((vm) => { withSubtract = vm; }, { ...ls, postCookSuperfatMethod: 'subtract' }, 'ls');
  probe((vm) => { withAppend = vm; }, { ...ls, postCookSuperfatMethod: 'append' }, 'ls');

  expect(withSubtract.neutralization).not.toBeNull();
  expect(withSubtract.neutralization.citricAcidGrams).toBeGreaterThan(0);
  // Mutual exclusivity: subtract is ignored under a lye excess, so lye matches the append case.
  expect(withSubtract.result.lyeWeightGrams).toBeCloseTo(withAppend.result.lyeWeightGrams);
});

test('neutralization is null for a normal LS recipe (superfat >= 0)', () => {
  let vm: any;
  probe((v) => { vm = v; }, { superfatPercent: '2', lyeType: 'koh', waterMode: 'lye_water_ratio', lyeWaterRatio: '2' }, 'ls');
  expect(vm.neutralization).toBeNull();
});

test('LS superfat above 3% raises the ls_superfat_high insight', () => {
  let vm: any;
  probe((v) => { vm = v; }, { superfatPercent: '5', lyeType: 'koh', waterMode: 'lye_water_ratio', lyeWaterRatio: '2' }, 'ls');
  expect(vm.insights.some((i: any) => i.code === 'ls_superfat_high')).toBe(true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w @soap-calc/web -- src/hooks/useRecipeViewModel.test.tsx`
Expected: FAIL — `vm.neutralization` is undefined; `ls_superfat_high` does not appear.

- [ ] **Step 3: Implement the VM + insights wiring**

In `packages/web/src/hooks/useFormulationInsights.ts` — note the perf refactor gave this a new 5th positional arg, so the signature is now `useFormulationInsights(lines, settings, properties, fattyAcids, lyeResult, options = {})`; the `FormulationInsightOptions` type, the `analyzeFormulation({ … })` call, and the dep array are otherwise unchanged in shape:

Add `isLiquidSoap?: boolean;` to the `FormulationInsightOptions` type (after the `postCookSuperfat?` field):

```ts
  isLiquidSoap?: boolean;
```

Add `isLiquidSoap: options.isLiquidSoap ?? false,` inside the `analyzeFormulation({ … })` call (e.g. after the `postCookSuperfatPufaPercent:` entry), and add `options.isLiquidSoap,` to the `useMemo` dependency array (after `settings.waterMode,`).

In `packages/web/src/hooks/useRecipeViewModel.ts`:

Add to the core import on line 2: `calculateNeutralization` and the `NeutralizationResult` type import on line 3:

```ts
import { calculateDilution, calculateNeutralization, parsePercentOfOil, scaleLyeResult, suggestLyeWaterWithSplitLiquid } from '@soap-calc/core';
import type { DilutionResult, NeutralizationResult } from '@soap-calc/core';
```

Change the `cookFactor` condition (lines 102-107) to also require a non-negative main superfat:

```ts
  const cookFactor =
    process !== 'cp' &&
    previewSettings.postCookSuperfatMethod === 'subtract' &&
    pcsfSubtractPercent > 0 &&
    Number(previewSettings.superfatPercent) >= 0
      ? Math.min(1, Math.max(0, 1 - pcsfSubtractPercent / 100))
      : 1;
```

Add a `neutralization` memo right after the `dilution` memo (which now ends ~line 144, just above `const solutionGrams`):

```ts
  const neutralization = useMemo(
    () =>
      process === 'ls' && result
        ? calculateNeutralization({
            kohGrams: result.kohWeightGrams,
            naohGrams: result.naohWeightGrams,
            superfatPercent: Number(previewSettings.superfatPercent),
            kohPurityPercent: Number(previewSettings.kohPurityPercent),
            naohPurityPercent: Number(previewSettings.naohPurityPercent),
          })
        : null,
    [
      process,
      result,
      previewSettings.superfatPercent,
      previewSettings.kohPurityPercent,
      previewSettings.naohPurityPercent,
    ],
  );
```

Pass `isLiquidSoap` into the `useFormulationInsights` options object (its **last** argument — the hook now takes `fattyAcids` 5th and `options` 6th — the object ending with `postCookSuperfat,`):

```ts
      postCookSuperfat,
      isLiquidSoap: process === 'ls',
```

Add `neutralization: NeutralizationResult | null;` to the `RecipeViewModel` type (after `dilution: DilutionResult | null;` on line 56):

```ts
  neutralization: NeutralizationResult | null;
```

And add `neutralization,` to the returned object (after `dilution,` near line 282):

```ts
    dilution,
    neutralization,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @soap-calc/web -- src/hooks/useRecipeViewModel.test.tsx`
Expected: PASS (existing VM tests plus the three new ones).

- [ ] **Step 5: Audit superfat consumers for a negative assumption**

Run: `grep -rn "superfatPercent\|superfat" packages/core/src packages/web/src --include=*.ts --include=*.tsx | grep -iv test`
Read each hit that uses the value numerically (notably `packages/core/src/properties.ts`, `packages/core/src/insights.ts`, `packages/web/src/lib/calculateAdditives.ts`) and confirm none clamps to `≥ 0` or breaks when superfat is negative. Expected: clean — superfat feeds only lye (Task 1, linear) and insights (Task 3); post-cook superfat is a separate percent. If a real breakage is found, note it in the commit message and fix it here.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/hooks/useRecipeViewModel.ts packages/web/src/hooks/useFormulationInsights.ts packages/web/src/hooks/useRecipeViewModel.test.tsx
git commit -m "feat(web): VM neutralization + disable PCSF-subtract under lye excess + LS-aware insights" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Web — `NeutralizePanel` + render in App

**Files:**
- Create: `packages/web/src/components/NeutralizePanel.tsx`
- Create: `packages/web/src/components/NeutralizePanel.test.tsx`
- Modify: `packages/web/src/App.tsx` (import + render after the `DilutionPanel` block at line 187)

**Interfaces:**
- Consumes: `NeutralizationResult` (Task 2); `vm.neutralization` (Task 7).
- Produces: `<NeutralizePanel neutralization={NeutralizationResult} weightUnit={WeightUnit} />`.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/components/NeutralizePanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NeutralizePanel } from './NeutralizePanel';
import type { NeutralizationResult } from '@soap-calc/core';

afterEach(cleanup);

const RESULT: NeutralizationResult = {
  lyeExcessPercent: 2,
  excessKohGrams: 4,
  excessNaohGrams: 0,
  citricAcidGrams: 5,
  dilutionWaterGrams: 20,
  targetPhLow: 9,
  targetPhHigh: 10.5,
};

test('renders the citric estimate, 1:4 water, and the caution', () => {
  render(<NeutralizePanel neutralization={RESULT} weightUnit="g" />);
  expect(screen.getByText('Citric acid (estimate)')).toBeTruthy();
  expect(screen.getByText('5 g')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain('never');
});

test('shows the NaOH excess line only for dual lye', () => {
  render(<NeutralizePanel neutralization={{ ...RESULT, excessNaohGrams: 1 }} weightUnit="g" />);
  expect(screen.getByText('Excess NaOH')).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @soap-calc/web -- src/components/NeutralizePanel.test.tsx`
Expected: FAIL — `NeutralizePanel` module not found.

- [ ] **Step 3: Implement the panel**

Create `packages/web/src/components/NeutralizePanel.tsx`:

```tsx
import type { NeutralizationResult } from '@soap-calc/core';
import { formatWeight } from '../lib/weightUnits';
import type { WeightUnit } from '../lib/recipe';

type NeutralizePanelProps = {
  neutralization: NeutralizationResult;
  weightUnit: WeightUnit;
};

export function NeutralizePanel({ neutralization, weightUnit }: NeutralizePanelProps) {
  const {
    lyeExcessPercent,
    excessKohGrams,
    excessNaohGrams,
    citricAcidGrams,
    dilutionWaterGrams,
    targetPhLow,
    targetPhHigh,
  } = neutralization;
  return (
    <section className="panel panel--nested">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Neutralize</h2>
          <p className="panel__subtitle">
            Citric acid to bring a lye-excess batch to pH {targetPhLow}–{targetPhHigh}
          </p>
        </div>
      </div>
      <dl className="results-grid">
        <div className="results-grid__item results-grid__item--primary">
          <dt>Citric acid (estimate)</dt>
          <dd>{formatWeight(citricAcidGrams, weightUnit)}</dd>
        </div>
        <div className="results-grid__item">
          <dt>Dissolve in hot water (1:4)</dt>
          <dd>{formatWeight(dilutionWaterGrams, weightUnit)}</dd>
        </div>
        <div className="results-grid__item">
          <dt>Lye excess</dt>
          <dd>{lyeExcessPercent}%</dd>
        </div>
        <div className="results-grid__item">
          <dt>Excess KOH</dt>
          <dd>{formatWeight(excessKohGrams, weightUnit)}</dd>
        </div>
        {excessNaohGrams > 0 && (
          <div className="results-grid__item">
            <dt>Excess NaOH</dt>
            <dd>{formatWeight(excessNaohGrams, weightUnit)}</dd>
          </div>
        )}
      </dl>
      <p className="results-hint" role="alert">
        Add the citric solution gradually and confirm pH {targetPhLow}–{targetPhHigh} with a test —
        never acidify a soap that is already on target.
      </p>
    </section>
  );
}
```

In `packages/web/src/App.tsx`, add the import near the `DilutionPanel` import (line 4):

```ts
import { NeutralizePanel } from './components/NeutralizePanel';
```

And after the `DilutionPanel` block (which closes at line 187), add:

```tsx
          {process === 'ls' && vm.neutralization && (
            <NeutralizePanel neutralization={vm.neutralization} weightUnit={weightUnit} />
          )}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @soap-calc/web -- src/components/NeutralizePanel.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/NeutralizePanel.tsx packages/web/src/components/NeutralizePanel.test.tsx packages/web/src/App.tsx
git commit -m "feat(web): NeutralizePanel (citric estimate for a lye-excess LS batch)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Web — batch sheet neutralization step

**Files:**
- Modify: `packages/web/src/lib/batchSheet.ts` (import `NeutralizationResult`; add `neutralization` to the `BatchSheetData` type — `buildBatchSheetData` now takes `BatchSheetData` directly, so that is the only declaration)
- Modify: `packages/web/src/components/BatchSheet.tsx` (destructure + render block after the dilution section)
- Modify: `packages/web/src/hooks/useRecipeViewModel.ts` (pass `neutralization` into `buildBatchSheetData` + add to its memo deps)
- Modify: `packages/web/src/lib/batchSheet.test.ts` and `packages/web/src/components/BatchSheet.test.tsx` (add `neutralization: null` to the `BatchSheetData` fixtures — the field is required)
- Test: `packages/web/src/hooks/useRecipeViewModel.test.tsx`

**Interfaces:**
- Consumes: `vm.neutralization` (Task 7); the `BatchSheetData` pass-through.
- Produces: `BatchSheetData.neutralization: NeutralizationResult | null`, rendered as a "Neutralize" section.

- [ ] **Step 1: Write the failing test**

Add to `packages/web/src/hooks/useRecipeViewModel.test.tsx`:

```ts
test('batch sheet carries the neutralization step for a lye-excess LS recipe', () => {
  let vm: any;
  probe((v) => { vm = v; }, { superfatPercent: '-2', lyeType: 'koh', waterMode: 'lye_water_ratio', lyeWaterRatio: '2' }, 'ls');
  expect(vm.batchSheetData).not.toBeNull();
  expect(vm.batchSheetData.neutralization).toEqual(vm.neutralization);
  expect(vm.batchSheetData.neutralization).not.toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @soap-calc/web -- src/hooks/useRecipeViewModel.test.tsx`
Expected: FAIL — `batchSheetData.neutralization` is undefined.

- [ ] **Step 3: Implement the batch-sheet threading**

In `packages/web/src/lib/batchSheet.ts`, add `NeutralizationResult` to the core type import (the block starting line 1):

```ts
import type {
  DilutionResult,
  FormulationInsight,
  LyeCalculationResult,
  NeutralizationResult,
  RecipeFattyAcidResult,
  RecipePropertiesResult,
} from '@soap-calc/core';
```

Add `neutralization: NeutralizationResult | null;` to the `BatchSheetData` type, right after its `dilution: DilutionResult | null;` line. (The perf refactor changed the signature to `buildBatchSheetData(input: BatchSheetData): BatchSheetData` — it no longer re-declares the fields, so `BatchSheetData` is the *only* place to add it.) Because it is a required field, add `neutralization: null,` to each `BatchSheetData` fixture: `makeBatchSheetInput` in `packages/web/src/lib/batchSheet.test.ts` (next to its `dilution: null,`) and the literal in `packages/web/src/components/BatchSheet.test.tsx` (next to its `dilution: null,`).

In `packages/web/src/components/BatchSheet.tsx`, add `neutralization,` to the props destructuring (next to `dilution,`). Then add, immediately after the dilution `{dilution && ( … </section> )}` block:

```tsx
      {neutralization && (
        <section className="batch-sheet__section">
          <h2>Neutralize</h2>
          <dl className="batch-sheet__dl">
            <div><dt>Lye excess</dt><dd>{formatGrams(neutralization.lyeExcessPercent, 0)}%</dd></div>
            <div><dt>Citric acid (estimate)</dt><dd>{formatWeight(neutralization.citricAcidGrams, weightUnit)}</dd></div>
            <div><dt>Dissolve in hot water (1:4)</dt><dd>{formatWeight(neutralization.dilutionWaterGrams, weightUnit)}</dd></div>
          </dl>
          <p>Add gradually to pH {neutralization.targetPhLow}–{neutralization.targetPhHigh}; verify with a test.</p>
        </section>
      )}
```

In `packages/web/src/hooks/useRecipeViewModel.ts`, add `neutralization,` to the `buildBatchSheetData({ … })` call (next to `dilution,`) and add `neutralization,` to that memo's dependency array (next to `dilution,`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @soap-calc/web -- src/hooks/useRecipeViewModel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run the whole gate: `npm test`
Expected: PASS — typecheck, `validate:oils`, and every vitest suite green.

```bash
git add packages/web/src/lib/batchSheet.ts packages/web/src/components/BatchSheet.tsx packages/web/src/hooks/useRecipeViewModel.ts packages/web/src/hooks/useRecipeViewModel.test.tsx
git commit -m "feat(web): batch sheet neutralization step for lye-excess LS" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- §1 Signed superfat → Tasks 1 (core), 4 (web parse), 5 (threading), 6 (UI min). ✓
- §2 `calculateNeutralization` → Task 2. ✓
- §3 Mutual exclusivity (cookFactor guard) → Task 7 (condition + test). ✓
- §4 LS insights + finding #3 → Task 3 (core), Task 7 (`isLiquidSoap` wiring). ✓
- §5 `NeutralizePanel` + render → Task 8; batch sheet → Task 9; citric excluded from batch weight → not added to `extrasGrams`/`batchWeightWithExtras` anywhere (verified: Tasks 7-9 never touch those). ✓
- Testing table → covered across tasks 1-9. ✓
- Audit step → Task 7 Step 5. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows full code; every test step shows the assertions and the exact run command. ✓

**3. Type consistency:** `calculateNeutralization` / `NeutralizationInput` / `NeutralizationResult` and the field names (`kohGrams`, `naohGrams`, `superfatPercent`, `kohPurityPercent`, `naohPurityPercent` → `lyeExcessPercent`, `excessKohGrams`, `excessNaohGrams`, `citricAcidGrams`, `dilutionWaterGrams`, `targetPhLow`, `targetPhHigh`) are identical in Task 2, Task 7 (VM call + type), Task 8 (panel), Task 9 (batch sheet). `NEG_SUPERFAT_FLOOR` is `-5` in both core (Task 1) and web (Task 4). `isLiquidSoap` is the field name in core (Task 3) and web wiring (Task 7). `allowNegativeSuperfat` matches between Task 4 (parse) and Task 5 (calculateRecipe). ✓
