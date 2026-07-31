# Slice 2 — ProcessDefinition Owns Its Variants: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Absorb `processProfile.ts`'s per-variant data into `PROCESS_DEFINITIONS` so each process definition owns its variants — one definition layer, nested, with `processProfile.ts` left as a pure re-export façade so none of its 8 consumers change.

**Architecture:** Spec at `docs/superpowers/specs/2026-07-30-process-separation-design.md`, Slice 2 ("this is a re-homing, not a rewrite"). All variant data, types and lookups move INTO `packages/web/src/lib/process.ts` (`ProcessDefinition` gains `variants`); `processProfile.ts` becomes `export ... from './process'` only, making the dependency one-way (façade → definitions) and eliminating today's process→processProfile import. A golden-master test written BEFORE the move pins byte-identical behaviour through it. The REQUIRED precondition from #148's final review runs first: the isolation canary gains lines/additives assertions BEFORE any code near the workspace swap is touched.

**Tech Stack:** TypeScript, React, vitest, Playwright. `npm test` from repo root; e2e via `cd packages/web && npx playwright test`.

## Global Constraints

- Comments state constraints code can't show — never narrate the diff. No book/brand names anywhere.
- New tests must FAIL when their guard is reverted (mutation check before commit) — EXCEPT the golden-master, whose job is to pass unchanged across the refactor.
- The façade must keep every existing import path working: no consumer file outside `process.ts`/`processProfile.ts` may need ANY change in Task 3. If one does, STOP — the façade is wrong.
- Core stays definition-agnostic (spec layering rule): nothing in `packages/core` is touched by this plan.
- Full gate before the PR: `npm test`, `npm run build --workspace packages/web` (RUN FROM REPO ROOT — it fails silently from packages/web), `cd packages/web && npx playwright test`.

---

### Task 1: Strengthen the isolation canary (REQUIRED precondition — must land before Tasks 2–3)

**Files:**
- Modify: `packages/web/e2e/process-isolation.spec.ts` (the existing `each process keeps its own workspace through a full tab cycle` test)

**Interfaces:**
- Consumes: existing selectors — `input[aria-label^="Weight in"]` (first oil weight, pattern from `e2e/cure.spec.ts:8`), `getByRole('button', { name: '+ Add', exact: true })` and `row.getByLabel(/^Name( for .*)?$/)` / `row.getByLabel(/^Amount( for .*)?$/)` (additives, pattern from `e2e/exploratory.spec.ts:444-462` — a fresh "+ Add" row is a custom additive, so its Name field is visible).
- Produces: nothing — test-only. Later tasks rely on this canary being STRONG before they run.

**Background (why):** #148's final review ruled the canary's name+lye assertions deferrable ONLY while the workspace swap in `setProcess` stays one atomic `loadWorkspace()` block — and required lines/additives assertions in THIS plan before Slice 2 touches the swap's surroundings. A refactor that broke isolation for `lines`/`additives` while `recipeName`/`settings` survived would pass today's canary.

- [ ] **Step 1: Extend the cycle test**

Replace the first `for` loop body in the existing test so each tab ALSO gets a distinctive oil weight and a distinctive custom additive (keep the existing name fill):

```ts
const TABS: Array<[RegExp, string, string]> = [
  [/Cold process/, 'canary-cp', '311'],
  [/Hot process/, 'canary-hp', '322'],
  [/Liquid soap/, 'canary-ls', '333'],
];

for (const [tab, name, grams] of TABS) {
  await processTab(page, tab).click();
  await page.getByLabel(/Recipe name/i).fill(name);
  await page.getByLabel(/Recipe name/i).blur();
  const weight = page.locator('input[aria-label^="Weight in"]').first();
  await weight.fill(grams);
  await weight.blur();
  await page.getByRole('button', { name: '+ Add', exact: true }).click();
  // Each tab's workspace holds exactly one additive in this test, so .first() is stable.
  // Row scoping verified against exploratory.spec.ts:459 and AdditivesPanel.tsx:194.
  const row = page.locator('ul[aria-label="Recipe additives"] li').first();
  await row.getByLabel(/^Name( for .*)?$/).fill(`${name}-add`);
  await row.getByLabel(/^Amount( for .*)?$/).fill('2');
  await row.getByLabel(/^Amount( for .*)?$/).blur();
}
```

And extend the second loop's assertions:

```ts
for (const [tab, name, grams] of TABS) {
  await processTab(page, tab).click();
  await expect(page.getByLabel(/Recipe name/i)).toHaveValue(name);
  await expect(page.locator('input[aria-label^="Weight in"]').first()).toHaveValue(grams);
  await expect(
    page.locator('ul[aria-label="Recipe additives"] li').first().getByLabel(/^Name( for .*)?$/),
  ).toHaveValue(`${name}-add`);
}
```

- [ ] **Step 2: Run it** — `cd packages/web && npx playwright test e2e/process-isolation.spec.ts`. Expected: 2/2 PASS (isolation holds today; this strengthens the tripwire).

- [ ] **Step 3: Sanity-check the strength** — temporarily change one expected value (e.g. assert `'999'` for cp's weight) and re-run: MUST fail. Restore. This proves the assertions bind.

- [ ] **Step 4: Full e2e** — `npx playwright test`. Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add packages/web/e2e/process-isolation.spec.ts
git commit -m "test(e2e): canary asserts lines and additives across the tab cycle (slice-2 precondition)"
```

### Task 2: Golden-master test for the variant layer (BEFORE the move)

**Files:**
- Create: `packages/web/src/lib/processVariants.golden.test.ts`

**Interfaces:**
- Consumes: today's `processProfile.ts` exports: `allProcessVariantIds()`, `processProfileById(v)`, `processProfilesFor(p)`, `defaultVariantFor(p)`, `soapingTempRangeFor(v)`.
- Produces: the invariant Task 3 must preserve. This file is NOT edited in Task 3 — its imports stay pointed at `./processProfile`, which is exactly how it proves the façade works.

**Background (why):** a re-homing's only correctness criterion is "nothing observable changed". The golden data below was machine-captured from the live code on this plan's date — it is not hand-typed. The test must pass BEFORE the move (Task 2) and AFTER it (Task 3) without a single edit.

- [ ] **Step 1: Write the golden-master test**

```ts
import { describe, expect, it } from 'vitest';
import {
  allProcessVariantIds,
  defaultVariantFor,
  processProfileById,
  processProfilesFor,
  soapingTempRangeFor,
} from './processProfile';

// Machine-captured from the live implementation (2026-07-31), immediately before the
// Slice 2 re-homing. If this test ever needs editing to pass, the re-homing changed
// observable behaviour — which is the one thing it must not do.
const GOLDEN_PROFILES = {"cp":{"variant":"cp","process":"cp","label":"Cold process","waterBand":{"lowTier":[20,28],"highTier":[32,40],"riversAbove":38},"temp":null,"finish":{"minWeeks":4},"finishKind":"cure","waterLossPercent":0.15},"hp-lthp":{"variant":"hp-lthp","process":"hp","label":"Low-temp HP (LTHP)","waterBand":{"lowTier":[25,30],"highTier":[32,40],"riversAbove":40},"temp":{"lowF":120,"highF":160},"finish":{"minWeeks":3,"maxWeeks":8},"finishKind":"cure","waterLossPercent":0.09},"hp-hthp":{"variant":"hp-hthp","process":"hp","label":"High-temp HP (HTHP)","waterBand":{"lowTier":[25,30],"highTier":[32,40],"riversAbove":40},"temp":{"lowF":215,"highF":215,"ceilingF":240},"finish":{"minWeeks":3,"maxWeeks":4},"finishKind":"cure","waterLossPercent":0.06},"hp-fluid":{"variant":"hp-fluid","process":"hp","label":"Fluid HP","waterBand":{"lowTier":[25,30],"highTier":[32,40],"riversAbove":40},"temp":{"lowF":160,"highF":215},"finish":{"minWeeks":6},"finishKind":"cure","waterLossPercent":0.09},"ls-cpls":{"variant":"ls-cpls","process":"ls","label":"Cold-process LS (CPLS)","waterBand":{"lowTier":[25,35],"highTier":[40,60],"riversAbove":60},"temp":null,"finish":{"minWeeks":1,"maxWeeks":4},"finishKind":"sequester","waterLossPercent":0},"ls-lowtemp":{"variant":"ls-lowtemp","process":"ls","label":"Low-temp LS","waterBand":{"lowTier":[25,35],"highTier":[40,60],"riversAbove":60},"temp":{"lowF":160,"highF":180},"finish":{"minWeeks":1,"maxWeeks":4},"finishKind":"sequester","waterLossPercent":0},"ls-hightemp":{"variant":"ls-hightemp","process":"ls","label":"High-temp LS","waterBand":{"lowTier":[25,35],"highTier":[40,60],"riversAbove":60},"temp":{"lowF":180,"highF":215},"finish":{"minWeeks":1,"maxWeeks":4},"finishKind":"sequester","waterLossPercent":0},"ls-30min":{"variant":"ls-30min","process":"ls","label":"30-minute LS","waterBand":{"lowTier":[25,35],"highTier":[40,60],"riversAbove":60},"temp":{"lowF":180,"highF":215},"finish":{"minWeeks":1,"maxWeeks":4},"finishKind":"sequester","waterLossPercent":0}} as const;

const GOLDEN_ORDER = {"cp":["cp"],"hp":["hp-lthp","hp-hthp","hp-fluid"],"ls":["ls-cpls","ls-lowtemp","ls-hightemp","ls-30min"]} as const;

const GOLDEN_DEFAULTS = {"cp":"cp","hp":"hp-lthp","ls":"ls-cpls"} as const;

const GOLDEN_TEMPS = {"cp":{"minF":60,"maxF":170,"defaultF":125},"hp-lthp":{"minF":110,"maxF":160,"defaultF":140},"hp-hthp":{"minF":205,"maxF":240,"defaultF":215},"hp-fluid":{"minF":150,"maxF":215,"defaultF":188},"ls-cpls":{"minF":60,"maxF":170,"defaultF":95},"ls-lowtemp":{"minF":150,"maxF":180,"defaultF":170},"ls-hightemp":{"minF":170,"maxF":215,"defaultF":198},"ls-30min":{"minF":170,"maxF":215,"defaultF":198}} as const;

describe('variant layer golden master (slice 2 re-homing guard)', () => {
  it('every variant profile is byte-identical to the captured snapshot', () => {
    const ids = allProcessVariantIds().sort();
    expect(ids).toEqual(Object.keys(GOLDEN_PROFILES).sort());
    for (const id of ids) {
      expect(JSON.parse(JSON.stringify(processProfileById(id)))).toEqual(
        GOLDEN_PROFILES[id as keyof typeof GOLDEN_PROFILES],
      );
    }
  });

  it('per-process variant order and defaults are unchanged', () => {
    for (const p of ['cp', 'hp', 'ls'] as const) {
      expect(processProfilesFor(p).map((x) => x.variant)).toEqual([...GOLDEN_ORDER[p]]);
      expect(defaultVariantFor(p)).toBe(GOLDEN_DEFAULTS[p]);
    }
  });

  it('derived temperature ranges are unchanged', () => {
    for (const id of allProcessVariantIds()) {
      expect(soapingTempRangeFor(id)).toEqual(GOLDEN_TEMPS[id as keyof typeof GOLDEN_TEMPS]);
    }
  });
});
```

- [ ] **Step 2: Run it against TODAY'S code** — `npx vitest run packages/web/src/lib/processVariants.golden.test.ts`. Expected: PASS (3/3). If it fails, the capture drifted from main — STOP and re-capture rather than editing expectations.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/processVariants.golden.test.ts
git commit -m "test(web): golden-master pins the variant layer before the slice-2 re-homing"
```

### Task 3: The absorption — definitions own their variants, processProfile becomes a façade

**Files:**
- Modify: `packages/web/src/lib/process.ts` (grows: types + variant data + lookups move in; `ProcessDefinition` gains `variants`; its own `import ... from './processProfile'` line is DELETED)
- Modify: `packages/web/src/lib/processProfile.ts` (shrinks to a documented re-export façade)
- Test: golden master from Task 2 (unchanged), plus new invariant tests appended to `packages/web/src/lib/process.test.ts`

**Interfaces:**
- Consumes: the golden master (must stay green, unedited).
- Produces: `ProcessDefinition.variants: readonly ProcessProfile[]` (first entry = the default variant); every former `processProfile` export re-exported verbatim from `process.ts`. Slices 3–4 build on `PROCESS_DEFINITIONS[p].variants` being THE variant source.

- [ ] **Step 1: Move everything into `process.ts`**

Into `process.ts` move, verbatim (cut-paste, do not retype):
- the types `ProcessVariantId`, `WaterBand`, `TempTarget`, `FinishDuration`, `ProcessProfile`, `SoapingTempRange`
- the constants `HP_WATER_BAND`, `LS_WATER_BAND`, `LS_SEQUESTER` and all 8 profile literals — but RESTRUCTURED: each definition in `PROCESS_DEFINITIONS` gains a `variants` field listing its own profiles in the old `ORDER` sequence (cp: 1; hp: 3; ls: 4). Keep every `// verified` / `// unverified` provenance comment attached to its value — they are load-bearing (see repo memory: self-flagged uncertainty has twice been a real error).
- the functions `processProfilesFor`, `processProfileById`, `defaultVariantFor`, `isProcessVariantId`, `allProcessVariantIds`, `soapingTempRangeFor`, `effectiveSoapingTempF` — reimplemented against the nested data:

```ts
/** Flat variant index derived ONCE from the definitions — the definitions are the source
 * of truth (spec 2026-07-30 slice 2); this map exists so by-id lookup stays O(1) without
 * a second hand-maintained record that could drift. */
const VARIANTS_BY_ID: Record<ProcessVariantId, ProcessProfile> = Object.fromEntries(
  (['cp', 'hp', 'ls'] as const).flatMap((p) => PROCESS_DEFINITIONS[p].variants.map((v) => [v.variant, v])),
) as Record<ProcessVariantId, ProcessProfile>;

export function processProfilesFor(process: ProcessId): ProcessProfile[] {
  return [...PROCESS_DEFINITIONS[process].variants];
}
export function processProfileById(variant: ProcessVariantId): ProcessProfile {
  return VARIANTS_BY_ID[variant];
}
export function defaultVariantFor(process: ProcessId): ProcessVariantId {
  return PROCESS_DEFINITIONS[process].variants[0].variant;
}
export function isProcessVariantId(value: unknown): value is ProcessVariantId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(VARIANTS_BY_ID, value);
}
export function allProcessVariantIds(): ProcessVariantId[] {
  return Object.keys(VARIANTS_BY_ID) as ProcessVariantId[];
}
```

ORDERING CONSTRAINT inside `process.ts`: `defaultSettings.processVariant` currently calls `defaultVariantFor(p)` during `PROCESS_DEFINITIONS` construction — that would now read the record being built. Break the chicken-and-egg by writing the variant id LITERALLY in each `defaultSettings` (`'cp'`, `'hp-lthp'`, `'ls-cpls'`) with the comment `// = variants[0].variant; pinned literally because defaultSettings is part of the record that defines variants[0]`, and add to the new invariant test: `defaultSettings.processVariant === variants[0].variant` for every process.

`soapingTempRangeFor` and `effectiveSoapingTempF` move verbatim (they only call `processProfileById`). Delete `process.ts`'s old `import { defaultVariantFor, isProcessVariantId, processProfileById } from './processProfile';` — after this task `process.ts` imports NOTHING from `processProfile.ts`.

- [ ] **Step 2: Turn `processProfile.ts` into the façade**

Replace the entire file with:

```ts
/**
 * Façade: the variant layer moved into the process definitions (spec 2026-07-30, slice 2 —
 * "one definition layer, nested, not two overlapping ones"). Every export re-routes to
 * `process.ts`, so the 8 consumer files keep their import paths; new code should import
 * from './process' directly. Dependency is one-way: this file → process.ts, never back.
 */
export {
  processProfilesFor,
  processProfileById,
  defaultVariantFor,
  isProcessVariantId,
  allProcessVariantIds,
  soapingTempRangeFor,
  effectiveSoapingTempF,
} from './process';
export type {
  ProcessVariantId,
  WaterBand,
  TempTarget,
  FinishDuration,
  ProcessProfile,
  SoapingTempRange,
} from './process';
```

- [ ] **Step 3: Golden master must pass UNEDITED**

Run: `npx vitest run packages/web/src/lib/processVariants.golden.test.ts`
Expected: PASS 3/3. `git diff --stat packages/web/src/lib/processVariants.golden.test.ts` must be EMPTY. If either fails, fix `process.ts` — never the golden file.

- [ ] **Step 4: Add the single-source invariant tests**

Append to `packages/web/src/lib/process.test.ts` (this file uses `it` inside `describe`):

```ts
describe('definitions own their variants (slice 2)', () => {
  it('every variant belongs to the definition that lists it', () => {
    for (const p of ['cp', 'hp', 'ls'] as const) {
      for (const v of PROCESS_DEFINITIONS[p].variants) {
        expect(v.process).toBe(p);
      }
    }
  });

  it('the pinned default variant literal matches variants[0]', () => {
    // defaultSettings.processVariant is written literally (it participates in the record
    // that defines variants[0]); this is the drift guard for that pin.
    for (const p of ['cp', 'hp', 'ls'] as const) {
      expect(PROCESS_DEFINITIONS[p].defaultSettings.processVariant).toBe(
        PROCESS_DEFINITIONS[p].variants[0].variant,
      );
    }
  });

  it('the lookup layer reads the definitions, not a second record', () => {
    for (const p of ['cp', 'hp', 'ls'] as const) {
      expect(processProfilesFor(p)).toEqual([...PROCESS_DEFINITIONS[p].variants]);
    }
    expect(allProcessVariantIds().length).toBe(8);
  });
});
```

(Extend the file's existing import from `./process` with `processProfilesFor, allProcessVariantIds` as needed.)

- [ ] **Step 5: Full verification**

Run from repo root: `npm test` (all suites + typecheck) and `npm run build --workspace packages/web`; then `cd packages/web && npx playwright test`. Expected: everything green — especially Task 1's strengthened canary, which is the tripwire this plan exists to respect. Also verify the façade guarantee: `git diff --name-only` must show ONLY `process.ts`, `processProfile.ts`, `process.test.ts` (plus Task 2's already-committed golden file untouched). Any other modified file = the façade failed — STOP.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/lib/process.ts packages/web/src/lib/processProfile.ts packages/web/src/lib/process.test.ts
git commit -m "refactor(web): process definitions own their variants; processProfile is a facade (slice 2)"
```

---

## After Task 3

Full gate, push branch `feat/slice2-definitions-own-variants`, PR referencing the spec's Slice 2 section, adversarial whole-branch review before merge (per the arc's standing discipline). Slice 3 (insight catalog) gets its own plan after this lands.
