# Slice 3 — Insight Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `analyzeFormulation`'s 36 inline insight blocks into a declared rule catalog — `processes` (absent = all) + `processOverrides`, mirroring `ADDITIVE_CATALOG` — and retire `isLiquidSoap` from the input shape so the process id is the only discriminator.

**Architecture:** Spec Slice 3. Order of operations is load-bearing: first the ledgered #150 minors (canary hardening), then the MECHANICAL retirement of `isLiquidSoap` (behaviour-preserving rename of a boolean into `process === 'ls'`), then a golden-master matrix captured against the post-retirement shape, then the registry conversion in two tranches with the golden required to pass unedited. The registry keeps each insight's imperative condition body as a `check` function — the DECLARATION carries only what the process changes (gating + parameters), which is exactly the spec's "two generic code paths replacing 25 bespoke gates".

**Tech Stack:** TypeScript, vitest, Playwright. `npm test` from repo root; build from repo root; e2e via `cd packages/web && npx playwright test`.

## Global Constraints

- Comments state constraints code can't show — never narrate the diff. No book/brand names.
- Message strings are USER-FACING COPY: byte-identical through the conversion. The golden master enforces this — if it fails, fix the rule, never the golden.
- The machine-derived gate table in Task 4 is authoritative for `processes:` declarations. It was brace-tracked from the live file on 2026-07-31, not eye-balled.
- `packages/core` stays web-free (layering rule): the rule types live in core beside `insights.ts`.
- Full gate before the PR: `npm test`, `npm run build --workspace packages/web` FROM REPO ROOT, `cd packages/web && npx playwright test`.

---

### Task 1: Ledgered #150 minors — canary discriminators + tautological test

**Files:**
- Modify: `packages/web/e2e/process-isolation.spec.ts` (the cycle test)
- Modify: `packages/web/src/lib/processProfile.test.ts:95-101` (the ORDER drift test)

**Interfaces:** none produced; test-only hardening that must land before the slice's code changes.

- [ ] **Step 1: Distinct additive amounts + a settings discriminator in the canary**

In the cycle test, the additive Amount is `'2'` in every tab — an identical value cannot discriminate a cross-tab leak. Change the TABS tuple to carry a distinct amount per tab and use it:

```ts
const TABS: Array<[RegExp, string, string, string]> = [
  [/Cold process/, 'canary-cp', '311', '2'],
  [/Hot process/, 'canary-hp', '322', '3'],
  [/Liquid soap/, 'canary-ls', '333', '4'],
];
// first loop: await row.getByLabel(/^Amount( for .*)?$/).fill(amount);
// assertion loop: await expect(row.getByLabel(/^Amount( for .*)?$/)).toHaveValue(amount);
```

Add one settings discriminator that needs NO extra edits — each process ships a different default superfat (cp 5 / hp 3 / ls 2, from `PROCESS_DEFINITIONS[p].defaultSettings.superfatPercent`). The superfat value input's accessible name is exactly `Superfat %` (verified: `valueLabel` becomes `aria-label` at `SuperfatWaterPanel.tsx:91`, set at `:224`). Extend the TABS tuple with the expected default and assert in the second loop:

```ts
await expect(page.getByLabel('Superfat %', { exact: true })).toHaveValue(superfat); // '5' | '3' | '2'
```

- [ ] **Step 2: Replace the near-tautological drift test**

`processProfile.test.ts:95` ("ORDER … reaches exactly the variants in PROFILES") now compares two views of ONE source (both derive from `PROCESS_DEFINITIONS`) — it can no longer catch the drift it was written for. Replace the single `it` with a guard that still has teeth — duplicate variant ids across definitions would corrupt `VARIANTS_BY_ID` silently:

```ts
it('variant ids are unique across all process definitions', () => {
  const reachable = (['cp', 'hp', 'ls'] as const).flatMap((process) =>
    processProfilesFor(process).map((p) => p.variant),
  );
  // Not tautological: VARIANTS_BY_ID is keyed by id, so a duplicate would silently
  // overwrite — this catches it at the list level before the record collapses it.
  expect(new Set(reachable).size).toBe(reachable.length);
  expect(reachable.length).toBe(allProcessVariantIds().length);
});
```

- [ ] **Step 3: Strength-check, run, commit** — flip one canary expectation (amount `'9'`) → must fail → restore. `cd packages/web && npx playwright test e2e/process-isolation.spec.ts` (2/2) and `npx vitest run packages/web/src/lib/processProfile.test.ts` (green). Commit: `test: canary discriminates additive amounts and settings; de-tautologize the variant drift guard`

### Task 2: Retire `isLiquidSoap` — the process id is the only discriminator

**Files:**
- Modify: `packages/core/src/insights.ts` (input type + 18 occurrence sites)
- Modify: `packages/core/src/insights.test.ts` (32 occurrences), `packages/core/src/formulation.test.ts` (8)
- Modify: `packages/web/src/hooks/useFormulationInsights.ts` (6 — the option + threading), `packages/web/src/hooks/useRecipeViewModel.ts` (1 — the caller)

**Interfaces:**
- Produces: `FormulationAnalysisInput.process: 'cp' | 'hp' | 'ls'` — REQUIRED (was optional), `isLiquidSoap` deleted. Tasks 3–5 depend on this shape.

**Mechanical mapping (apply exactly, no judgment calls):**
- In `insights.ts`: `input.isLiquidSoap` → `input.process === 'ls'`; `!input.isLiquidSoap` → `input.process !== 'ls'`. Delete the `isLiquidSoap?:` field and its doc comment; make `process` required and move the existing "discriminates CP from HP too" comment onto it, rewritten to state it is now the ONLY discriminator.
- In tests: a fixture passing `isLiquidSoap: true` → `process: 'ls'`; `isLiquidSoap: false` → `process: 'cp'` UNLESS the same fixture already passes a `process` (keep it). The shared `base` fixture (insights.test.ts:4) gains `process: 'cp'` since the field is now required.
- CAREFUL CASE: tests whose NAME asserts cross-process behaviour (e.g. "fires for a negative superfat even when the recipe is not flagged as liquid soap") — the mapping preserves meaning (`isLiquidSoap: false` → `process: 'cp'`), but update the test NAME if it still says "flagged", since the flag no longer exists.
- In web: delete the `isLiquidSoap` option from `FormulationInsightOptions`, its threading, and the `isLiquidSoap: process === 'ls'` line in the view-model caller; pass nothing new — `process` is already passed.

- [ ] **Step 1: Apply the mapping** (insights.ts first, then tests, then web).
- [ ] **Step 2: Full suite green** — `npm test`. This IS the behaviour gate: the rewrite is semantics-preserving by construction, so any failure is a mapping mistake — fix the mapping, never the expectation.
- [ ] **Step 3: Grep-verify retirement complete** — `grep -rn "isLiquidSoap" packages/ --include="*.ts" --include="*.tsx"` → 0 hits. Any hit = unfinished.
- [ ] **Step 4: Commit** — `refactor(core): retire isLiquidSoap — the process id is the only discriminator (slice 3)`

### Task 3: Golden-master matrix for analyzeFormulation

**Files:**
- Create: `packages/core/src/insights.golden.test.ts`
- Create: `packages/core/src/__fixtures__/insights-golden.json` (captured, committed)

**Interfaces:**
- Consumes: Task 2's input shape.
- Produces: the fixture Tasks 4–5 must keep green WITHOUT editing either file.

- [ ] **Step 1: Write the matrix + capture harness**

The matrix is ~45 inputs adapted from `insights.test.ts`'s own fixtures (they are known triggers). Build it as data in the test file:

```ts
import { describe, expect, it } from 'vitest';
import { analyzeFormulation, type FormulationAnalysisInput } from './insights.js';
import GOLDEN from './__fixtures__/insights-golden.json';

const base: FormulationAnalysisInput = {
  properties: null, fattyAcids: null, totalOilGrams: 1000, superfatPercent: 5,
  lyeConcentrationPercent: 33, waterLyeRatio: 2, waterGrams: 300, lyeGrams: 140,
  process: 'cp',
};

/** ~45 inputs, each a Partial over base, EVERY entry run for all three processes.
 * Adapted from insights.test.ts fixtures so the triggers are known-good. Add cases here
 * only BEFORE the slice-3 conversion lands; afterwards this file is frozen with the
 * fixture. */
const MATRIX: Array<Partial<FormulationAnalysisInput>> = [
  {},
  { superfatPercent: -2 },
  { superfatPercent: 0 },
  { superfatPercent: 4 },
  { totalOilGrams: 600 },
  { waterGrams: 100, lyeGrams: 140 },
  { lyeConcentrationPercent: 45 },
  { waterBand: { lowTier: [20, 28], highTier: [32, 40], riversAbove: 38 }, waterGrams: 420 },
  { waterBand: { lowTier: [25, 30], highTier: [32, 40], riversAbove: 40 }, waterGrams: 200 },
  { sugarTotalPercent: 4.5 },
  { sugarTotalPercent: 5.5 },
  { soapingTempF: 165 },
  { lsGlycerinSolvent: true },
  { lsSplitLiquidFatShiftPercent: 4.2, superfatPercent: 2 },
  { splitLiquidEnabled: true, splitLiquidGrams: 200, splitLiquidAddAt: 'trace', suggestedLyeWaterGrams: 235, waterGrams: 435 },
  { splitLiquidEnabled: true, splitLiquidGrams: 200, splitLiquidAddAt: 'trace', splitLiquidWaterReductionGrams: 0 },
  { totalAdditivePercent: 12 },
  { lyeType: 'dual', kohBlendPercent: 10 },
  { hpVesselMultiple: 1.2 },
  { hpYogurtPercent: 8 },
  { traceSpeedLabel: 'fast', traceSpeedDrivers: ['high saturated fats'] },
  { postCookSuperfatPufaPercent: 40 },
  // …EXTEND to ~45 by porting each remaining trigger family from insights.test.ts:
  // fattyAcids-driven cases (lauric/oleic/ricinoleic mixes for the eutectic, cleansing,
  // castor and short-chain rules), additiveEntries keyword cases (epsom / oatmeal /
  // jojoba / salt), oilEntries identity cases, and the ls_dual_lye_recommendation
  // fixtures — copy the exact fixture objects from the corresponding describe blocks.
];

describe('analyzeFormulation golden matrix (slice 3 conversion guard)', () => {
  it('every matrix cell matches the captured snapshot exactly', () => {
    const actual = MATRIX.flatMap((over, i) =>
      (['cp', 'hp', 'ls'] as const).map((process) => ({
        cell: `${i}:${process}`,
        insights: analyzeFormulation({ ...base, ...over, process }),
      })),
    );
    expect(actual).toEqual(GOLDEN);
  });

  it('the matrix exercises at least 30 of the 36 insight codes', () => {
    const seen = new Set(
      (GOLDEN as Array<{ insights: Array<{ code: string }> }>).flatMap((c) =>
        c.insights.map((x) => x.code),
      ),
    );
    // Completeness meter: print what is NOT covered so the gap is a visible choice.
    console.log('golden matrix does NOT cover:', [...ALL_CODES].filter((c) => !seen.has(c)));
    expect(seen.size).toBeGreaterThanOrEqual(30);
  });
});
```

`ALL_CODES` = the 36 codes from the Task 4 table, declared as a const array in the test.

- [ ] **Step 2: Capture** — temporarily replace the json import with `const GOLDEN = null` and add a capture branch writing `JSON.stringify(actual, null, 1)` via `node:fs` to the fixture path when `process.env.CAPTURE === '1'`; run `CAPTURE=1 npx vitest run packages/core/src/insights.golden.test.ts`; then REMOVE the capture branch (the committed test only reads). Run normally: both its green, coverage ≥30.
- [ ] **Step 3: Commit test + fixture** — `test(core): golden matrix pins analyzeFormulation before the rule-catalog conversion`

### Task 4: The rule registry + first tranche (18 rules)

**Files:**
- Modify: `packages/core/src/insights.ts` (registry types + loop at the top; first 18 blocks converted, IN PUSH ORDER — order preserves golden output order)

**Interfaces:**
- Produces (Task 5 relies on these exact names): 

```ts
export type InsightRuleParams = Record<string, number | string>;
export type InsightRule = {
  code: string;
  /** Processes this insight applies to; absent = all. Mirrors AdditiveCatalogEntry. */
  processes?: readonly ('cp' | 'hp' | 'ls')[];
  /** Base parameters; per-process overrides REPLACE individual keys (additive-catalog
   * semantics). Rules without process-varying values omit both. */
  params?: InsightRuleParams;
  processOverrides?: Partial<Record<'cp' | 'hp' | 'ls', InsightRuleParams>>;
  /** The insight's own condition + message, unchanged from the inline block. Returns
   * null when the insight does not fire. Reads PROCESS-INVARIANT logic from input;
   * everything the process changes must come from params. */
  check: (input: FormulationAnalysisInput, params: InsightRuleParams) => FormulationInsight | null;
};

export function resolveInsightParams(rule: InsightRule, process: 'cp' | 'hp' | 'ls'): InsightRuleParams {
  return { ...(rule.params ?? {}), ...(rule.processOverrides?.[process] ?? {}) };
}
```

and the analyzer core:

```ts
// The two generic paths that replaced 25 bespoke gates (spec slice 3): process
// filtering and parameter resolution. Everything else an insight does lives in its
// own check().
for (const rule of INSIGHT_RULES) {
  if (rule.processes && !rule.processes.includes(input.process)) continue;
  const insight = rule.check(input, resolveInsightParams(rule, input.process));
  if (insight) insights.push(insight);
}
```

**Conversion recipe (apply to each block, mechanically):** wrap the block's body in `check: (input, params) => { …; return null; }`, replacing `insights.push(X)` with `return X` (blocks that push at most once — all 36 do); DELETE the block's process gate from the condition and declare it as `processes:` per the table below; keep every other condition verbatim; keep the block's leading comment on the rule entry.

**Authoritative gate table (machine-derived 2026-07-31, brace-tracked):**

| code | gate today | rule declaration |
|---|---|---|
| large_test_batch | ALL | (none) |
| water_below_lye | ALL | (none) |
| no_superfat_margin | !isLiquidSoap | processes: ['cp','hp'] |
| water_band_rivers | !isLiquidSoap | processes: ['cp','hp'] |
| water_band_between_tiers | !isLiquidSoap | processes: ['cp','hp'] |
| water_band_below_low | !isLiquidSoap | processes: ['cp','hp'] |
| high_short_chain_low_long_chain | !isLiquidSoap | processes: ['cp','hp'] |
| high_poly_high_superfat | ALL | (none) |
| eutectic_lather_sources | !isLiquidSoap | processes: ['cp','hp'] |
| high_cleansing_low_superfat | !isLiquidSoap | processes: ['cp','hp'] |
| low_cleansing_expected | !isLiquidSoap | processes: ['cp','hp'] |
| split_liquid_water_not_adjusted | ALL | (none) |
| split_liquid_high_trace_liquid | ALL | (none) |
| high_total_additives | ALL | (none) |
| sugar_total_high | ALL + internal ceiling/message branch | params + processOverrides (see Task 5) |
| soaping_temp_high | process === 'cp' | processes: ['cp'] |
| glycerin_solvent_dilution | process === 'ls' | processes: ['ls'] |
| dual_lye_advanced | ALL | (none) |
| magnesium_salt_scum | ALL (deliberate — fires every process) | (none) |
| oatmeal_false_trace | ALL | (none) |
| jojoba_superfat_note | ALL | (none) |
| high_pufa_post_cook_superfat | ALL | (none) |
| superfat_out_of_band | !isLiquidSoap | processes: ['cp','hp'] |
| pufa_cap_superfat | !isLiquidSoap | processes: ['cp','hp'] |
| trace_speed | !isLiquidSoap | processes: ['cp','hp'] |
| ls_split_liquid_fat_superfat | process === 'ls' | processes: ['ls'] |
| ls_split_liquid_not_dilution | process === 'ls' | processes: ['ls'] |
| ls_superfat_high | isLiquidSoap | processes: ['ls'] |
| ls_castor_no_lather | isLiquidSoap | processes: ['ls'] |
| ls_dual_lye_recommendation | ALL at process level (inner gates stay in check) | (none) |
| ls_salt_thickening | isLiquidSoap | processes: ['ls'] |
| hp_thick_phase_suppressant | process === 'hp' | processes: ['hp'] |
| hp_yogurt_water | process === 'hp' | processes: ['hp'] |
| hp_relaxed_caps | process === 'hp' | processes: ['hp'] |
| hp_vessel_too_small | process === 'hp' | processes: ['hp'] |
| ls_lye_excess | ALL (deliberate — caustic warning for any caller) | (none) |

**Tranche 1 = the first 18 codes in the table (large_test_batch … dual_lye_advanced).** `sugar_total_high` is tranche 1 by position but its params extraction is specified in Task 5 — for tranche 1 convert it with its internal branch INTACT (gate table row notes this), and Task 5 finishes it.

- [ ] **Step 1: Add types + resolver + loop; convert tranche 1; leave tranche 2 blocks inline after the loop** (the function runs rules first, then the remaining inline blocks — order within the file preserved so golden order holds).
- [ ] **Step 2: Golden green, both files unedited** — `npx vitest run packages/core/src/insights.golden.test.ts` + `git diff --stat` on the golden pair = empty.
- [ ] **Step 3: Full suite** — `npm test` green.
- [ ] **Step 4: Commit** — `refactor(core): insight rule registry + first tranche of 18 declared rules (slice 3)`

### Task 5: Second tranche + params extraction — the catalog is complete

**Files:**
- Modify: `packages/core/src/insights.ts` (remaining 18 blocks converted; `sugar_total_high` parameterized; the inline region deleted — `analyzeFormulation` ends as: input guards + the rules loop + return)

**Interfaces:**
- Consumes: Task 4's `InsightRule`, `resolveInsightParams`, `INSIGHT_RULES`.

- [ ] **Step 1: Convert tranche 2 (superfat_out_of_band … ls_lye_excess) by the same recipe.**
- [ ] **Step 2: Parameterize `sugar_total_high`** — the ONE rule with a process-varying value inside (`insights.ts:341`, ceiling 4 vs 5, plus an HP-specific message). Declare:

```ts
params: { ceilingPercent: 4, family: 'sugar/sorbitol, honey, yogurt' },
processOverrides: {
  hp: { ceilingPercent: 5, family: 'sugar/sorbitol, honey' },
  ls: { ceilingPercent: 5 },
},
```

and make `check` build BOTH existing messages from params so the emitted strings stay byte-identical (the HP string hard-codes "~5%" and drops "yogurt"; the non-HP string interpolates the ceiling — compare against insights.ts:346-349 and reproduce exactly; the golden is the referee).

- [ ] **Step 3: Golden green unedited; full suite; e2e** — all three gates. Then verify the spec's claim directly: `grep -cE "input.process [!=]== " packages/core/src/insights.ts` — expected ≤ 2 hits, BOTH inside the generic loop/resolver region or a check body that genuinely needs a process-varying MESSAGE the golden pins (report the exact count and lines in the task report; every surviving hit must be justified there).
- [ ] **Step 4: Commit** — `refactor(core): insight catalog complete — 36 declared rules, two generic gates (slice 3)`

---

## After Task 5

Full gate, push `feat/slice3-insight-catalog`, PR referencing spec Slice 3, adversarial whole-branch review (most capable model) before merge. Slice 4 (view model reads the definition + façade retirement) gets its own plan after this lands.
