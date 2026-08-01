# LS Temperature & Method Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four LS variant tabs with one full hold-temperature slider (60–220 °F) whose value derives the method (cold / low temp / high temp), the process guide, and the per-method sequester window.

**Architecture:** A new pure core module `ls-method.ts` owns zones, gap ownership, labels, notes, per-method sequester windows and guide stages. Web collapses `PROCESS_DEFINITIONS.ls` to a single `'ls'` variant (nullable `finish`), threads the derived method through `estimateCure` (override wins) and the two panels, and detects the 30-minute package from additives. One new core insight carries the coconut-heavy hot-cook caution.

**Tech Stack:** TypeScript, React, Vitest, Playwright (existing monorepo patterns only).

**Spec:** `docs/superpowers/specs/2026-08-01-ls-temperature-method-redesign-design.md` — the contract. Source citations (`LS:<line>`) live there; do not re-derive numbers.

## Global Constraints

- LS only. CP and HP behavior, types and tests must not change.
- All temperature edges are defined in °F; zone membership is a `>=`/`<` cascade on the stored °F value: `<100` cold · `<120` gap→low · `<160` low · `<215` gap→high · else high (220 inclusive via clamp).
- Slider bounds 60–220 °F; fresh LS default `'150'`.
- Copy is original and behavior-only (soap-formulation-content skill rules); no book titles/authors.
- TDD for every behavior change: write the failing test, watch it fail, implement, watch it pass.
- Run `npm run test -w <pkg>` for the touched package per task; full `npm test` in the final task.
- Commit at the end of every task on branch `ls-source-audit`.

---

### Task 1: Core `lsMethodForTemp` + method stages

**Files:**
- Create: `packages/core/src/ls-method.ts`
- Create: `packages/core/src/ls-method.test.ts`
- Modify: `packages/core/src/index.ts` (add `export * from './ls-method.js';` alongside the existing `export * from './cook-stages.js';`)

**Interfaces:**
- Produces (later tasks rely on these exact names):
  `type LsMethod = 'cold' | 'lowtemp' | 'hightemp'`;
  `type LsSequesterWindow = { minWeeks: number; maxWeeks?: number }`;
  `type LsMethodInfo = { method: LsMethod; label: string; inGap: boolean; note: string | null; sequester: LsSequesterWindow }`;
  `lsMethodForTemp(tempF: number): LsMethodInfo`;
  `LS_TEMP_MIN_F = 60`, `LS_TEMP_MAX_F = 220`, `LS_TEMP_DEFAULT_F = 150`;
  `LS_ZONES = { coldMaxF: 100, lowMinF: 120, lowRecommendedMinF: 140, lowMaxF: 160, highMinF: 215 }`;
  `LS_METHOD_STAGES: Record<LsMethod, readonly string[]>`.

- [ ] **Step 1: Write the failing test** (`packages/core/src/ls-method.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import {
  LS_METHOD_STAGES,
  LS_TEMP_DEFAULT_F,
  LS_TEMP_MAX_F,
  LS_TEMP_MIN_F,
  LS_ZONES,
  lsMethodForTemp,
} from './ls-method.js';

describe('lsMethodForTemp', () => {
  it('maps each zone with >=/< edge semantics (spec zone table)', () => {
    expect(lsMethodForTemp(60).method).toBe('cold');
    expect(lsMethodForTemp(99).method).toBe('cold');
    // 100 belongs to the region above it (gap owned by low temp).
    expect(lsMethodForTemp(100)).toMatchObject({ method: 'lowtemp', inGap: true });
    expect(lsMethodForTemp(119)).toMatchObject({ method: 'lowtemp', inGap: true });
    expect(lsMethodForTemp(120)).toMatchObject({ method: 'lowtemp', inGap: false });
    expect(lsMethodForTemp(159)).toMatchObject({ method: 'lowtemp', inGap: false });
    // 160 falls in the gap OWNED BY HIGH TEMP (explicit ownership, no nearest-zone rule).
    expect(lsMethodForTemp(160)).toMatchObject({ method: 'hightemp', inGap: true });
    expect(lsMethodForTemp(180)).toMatchObject({ method: 'hightemp', inGap: true });
    expect(lsMethodForTemp(214)).toMatchObject({ method: 'hightemp', inGap: true });
    expect(lsMethodForTemp(215)).toMatchObject({ method: 'hightemp', inGap: false });
    expect(lsMethodForTemp(220)).toMatchObject({ method: 'hightemp', inGap: false });
  });

  it('is total: clamps out-of-range and falls back to the default on junk', () => {
    expect(lsMethodForTemp(-40).method).toBe('cold');
    expect(lsMethodForTemp(400).method).toBe('hightemp');
    expect(lsMethodForTemp(Number.NaN).method).toBe(lsMethodForTemp(LS_TEMP_DEFAULT_F).method);
  });

  it('labels the three methods and notes only the gaps', () => {
    expect(lsMethodForTemp(80).label).toBe('Cold-process LS');
    expect(lsMethodForTemp(150).label).toBe('Low-temp LS');
    expect(lsMethodForTemp(215).label).toBe('High-temp LS');
    expect(lsMethodForTemp(150).note).toBeNull();
    expect(lsMethodForTemp(110).note).toMatch(/below the low-temp band/i);
    // The 160–215 gap copy is first-class: names the method and the 215 start.
    expect(lsMethodForTemp(180).label).toBe('High-temp LS');
    expect(lsMethodForTemp(180).note).toMatch(/below its 215/);
    expect(lsMethodForTemp(180).note).toMatch(/slower/i);
  });

  it('carries the per-method sequester window (cold 1–4, low open-ended, high 1–2)', () => {
    expect(lsMethodForTemp(80).sequester).toEqual({ minWeeks: 1, maxWeeks: 4 });
    expect(lsMethodForTemp(150).sequester).toEqual({ minWeeks: 1 });
    expect(lsMethodForTemp(216).sequester).toEqual({ minWeeks: 1, maxWeeks: 2 });
    // Gap temps inherit their OWNER's window.
    expect(lsMethodForTemp(180).sequester).toEqual({ minWeeks: 1, maxWeeks: 2 });
  });

  it('exposes the slider constants and zone edges', () => {
    expect([LS_TEMP_MIN_F, LS_TEMP_MAX_F, LS_TEMP_DEFAULT_F]).toEqual([60, 220, 150]);
    expect(LS_ZONES).toEqual({ coldMaxF: 100, lowMinF: 120, lowRecommendedMinF: 140, lowMaxF: 160, highMinF: 215 });
  });

  it('ships guide stages per method, with the mandatory vessel line on high temp', () => {
    for (const method of ['cold', 'lowtemp', 'hightemp'] as const) {
      expect(LS_METHOD_STAGES[method].length).toBeGreaterThanOrEqual(4);
    }
    expect(LS_METHOD_STAGES.cold.join(' ')).toMatch(/clarity test/i);
    expect(LS_METHOD_STAGES.hightemp.join(' ')).toMatch(/2× the total recipe volume/);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run packages/core/src/ls-method.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** (`packages/core/src/ls-method.ts`):

```ts
/**
 * Liquid-soap method derived from the SUSTAINED HOLD temperature (crockpot / heat-source
 * setting held through saponification and dilution) — NOT the oil-melt temperature (CPLS
 * melts oils at 120–130 °F yet applies no sustained heat). Zones, gap ownership, labels,
 * sequester windows and guide stages all live here and nowhere else.
 * Spec: docs/superpowers/specs/2026-08-01-ls-temperature-method-redesign-design.md.
 */
export type LsMethod = 'cold' | 'lowtemp' | 'hightemp';

export type LsSequesterWindow = { minWeeks: number; maxWeeks?: number };

export type LsMethodInfo = {
  method: LsMethod;
  label: string;
  /** True in 100–120 (owned by low temp) and 160–215 (owned by high temp). */
  inGap: boolean;
  /** Honest gap copy; null inside a zone. */
  note: string | null;
  sequester: LsSequesterWindow;
};

export const LS_TEMP_MIN_F = 60;
export const LS_TEMP_MAX_F = 220; // sourced ceiling — "not advisable above 220F"
export const LS_TEMP_DEFAULT_F = 150; // inside low temp's recommended 140–160

/** Zone edges, °F. Membership is a >=/< cascade; each edge belongs to the region above it
 * (100 → gap, 120 → low, 160 → gap, 215 → high; 220 inclusive via clamp). */
export const LS_ZONES = {
  coldMaxF: 100, // unsourced convention — cold process is defined by NO sustained heat
  lowMinF: 120,
  lowRecommendedMinF: 140,
  lowMaxF: 160,
  highMinF: 215,
} as const;

const LABELS: Record<LsMethod, string> = {
  cold: 'Cold-process LS',
  lowtemp: 'Low-temp LS',
  hightemp: 'High-temp LS',
};

/** Per-method sequester windows (sourced; see spec). Low temp publishes only a floor. */
const SEQUESTER: Record<LsMethod, LsSequesterWindow> = {
  cold: { minWeeks: 1, maxWeeks: 4 },
  lowtemp: { minWeeks: 1 },
  hightemp: { minWeeks: 1, maxWeeks: 2 },
};

/** Behavior-only method steps, rendered by the process guide. The ≥2× vessel line on high
 * temp is mandatory in the source; coconut-heavy recipes get the stricter 3× via the
 * ls_coconut_hot_cook insight. */
export const LS_METHOD_STAGES: Record<LsMethod, readonly string[]> = {
  cold: [
    'Melt the oils at 120–130 °F and let the lye solution cool — no sustained heat after this.',
    'Blend oils and lye to a thick trace.',
    'Cover and let the paste saponify on its own heat, 12–48 hours (slow recipes take longer).',
    'Run the clarity test: stir a little paste into hot water — clear means ready, milky means wait.',
    'Dilute with hot distilled water to the target soap concentration.',
  ],
  lowtemp: [
    'Melt the oils in the cook vessel at the hold temperature.',
    'Add the lye solution and blend to trace.',
    'Hold 120–160 °F, stirring now and then, until the paste passes the clarity test.',
    'Dilute with hot distilled water, keeping the low heat on until fully dissolved.',
  ],
  hightemp: [
    'Use a cook vessel at least 2× the total recipe volume — the hot cook expands.',
    'Heat the oils to the 215 °F hold and add the hot lye solution.',
    'Blend continuously through the cook stages until the paste passes the clarity test.',
    'Dilute with hot water at heat, or portion off as paste for later dilution.',
  ],
};

const GAP_LOW_NOTE =
  'Below the low-temp band — bring the hold up to 120–160 °F (140–160 recommended), or drop the heat entirely for cold-process LS.';
const GAP_HIGH_NOTE =
  'Running the high-temp method below its 215 °F start — the cook still works, but expect slower stage progression than at 215 °F.';

export function lsMethodForTemp(tempF: number): LsMethodInfo {
  const t = Number.isFinite(tempF)
    ? Math.min(LS_TEMP_MAX_F, Math.max(LS_TEMP_MIN_F, tempF))
    : LS_TEMP_DEFAULT_F;
  const build = (method: LsMethod, inGap: boolean, note: string | null): LsMethodInfo => ({
    method,
    label: LABELS[method],
    inGap,
    note,
    sequester: SEQUESTER[method],
  });
  if (t < LS_ZONES.coldMaxF) return build('cold', false, null);
  if (t < LS_ZONES.lowMinF) return build('lowtemp', true, GAP_LOW_NOTE);
  if (t < LS_ZONES.lowMaxF) return build('lowtemp', false, null);
  if (t < LS_ZONES.highMinF) return build('hightemp', true, GAP_HIGH_NOTE);
  return build('hightemp', false, null);
}
```

Then add to `packages/core/src/index.ts`, next to the `cook-stages` export: `export * from './ls-method.js';`

- [ ] **Step 4: Run to verify pass** — `npx vitest run packages/core/src/ls-method.test.ts`, then `npm run test -w @soap-calc/core`. Expected: all green.

- [ ] **Step 5: Commit** — `git add packages/core/src/ls-method.ts packages/core/src/ls-method.test.ts packages/core/src/index.ts && git commit -m "feat(ls): lsMethodForTemp — zones, gap ownership, sequester windows, method stages"`

---

### Task 2: Core coconut-heavy hot-cook insight

**Files:**
- Modify: `packages/core/src/insights.ts` (add one rule to `INSIGHT_RULES`, after `ls_salt_thickening`)
- Modify: `packages/core/src/insights.test.ts`
- Modify: `packages/core/src/insights.golden.test.ts` (`ALL_CODES` gains the new code; header comment count 37→38)

**Interfaces:**
- Consumes: existing `isCoconutHeavy(input)` helper and `input.soapingTempF` (already in `FormulationAnalysisInput` and already passed by the web vm for every process).
- Produces: insight code `ls_coconut_hot_cook` (warning, LS-only).

- [ ] **Step 1: Write the failing tests** — in `insights.test.ts`, add inside the LS advisory describe region (near `ls_salt_thickening`), using the file's existing `base`/`has` helpers and a coconut-heavy FA fixture matching the existing pattern (`fattyAcids: { lauric: 45, myristic: 12 }, fattyAcidCoveragePercent: 100`):

```ts
describe('ls_coconut_hot_cook', () => {
  const coco = {
    ...base,
    process: 'ls' as const,
    fattyAcids: { lauric: 45, myristic: 12 },
    fattyAcidCoveragePercent: 100,
  };
  it('warns a coconut-heavy LS recipe holding ≥150 °F, regardless of zone', () => {
    const insight = analyzeFormulation({ ...coco, soapingTempF: 215 }).find(
      (i) => i.code === 'ls_coconut_hot_cook',
    );
    expect(insight?.level).toBe('warning');
    expect(insight?.message).toMatch(/150–175 °F/);
    expect(insight?.message).toMatch(/3× the total recipe volume/);
    expect(insight?.message).toMatch(/180 °F/);
    // Fires across the zone boundary so complying (215 → 165) can't silence it.
    expect(has({ ...coco, soapingTempF: 165 }, 'ls_coconut_hot_cook')).toBe(true);
    expect(has({ ...coco, soapingTempF: 150 }, 'ls_coconut_hot_cook')).toBe(true);
  });
  it('stays quiet below 150 °F, for non-coconut recipes, at low FA coverage, and outside LS', () => {
    expect(has({ ...coco, soapingTempF: 149 }, 'ls_coconut_hot_cook')).toBe(false);
    expect(has({ ...coco, soapingTempF: undefined }, 'ls_coconut_hot_cook')).toBe(false);
    expect(
      has({ ...coco, fattyAcids: { oleic: 70 }, soapingTempF: 215 }, 'ls_coconut_hot_cook'),
    ).toBe(false);
    expect(
      has({ ...coco, fattyAcidCoveragePercent: 40, soapingTempF: 215 }, 'ls_coconut_hot_cook'),
    ).toBe(false);
    expect(has({ ...coco, process: 'hp', soapingTempF: 215 }, 'ls_coconut_hot_cook')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run packages/core/src/insights.test.ts -t ls_coconut_hot_cook`. Expected: FAIL (insight absent).

- [ ] **Step 3: Implement the rule** — append to `INSIGHT_RULES` directly after the `ls_salt_thickening` rule object:

```ts
{
  code: 'ls_coconut_hot_cook',
  processes: ['ls'],
  // Coconut-heavy LS expands hard in a hot cook (sourced; see the redesign spec). Fires
  // from 150 °F REGARDLESS of zone: the compliant reduced range 150–175 dips into the
  // low-temp band on purpose, and an insight keyed to the high zone would vanish the
  // moment the user follows it. isCoconutHeavy carries its own FA-coverage gate.
  check: (input) => {
    if (!isCoconutHeavy(input)) return null;
    if (input.soapingTempF === undefined || input.soapingTempF < 150) return null;
    return {
      level: 'warning',
      code: 'ls_coconut_hot_cook',
      message:
        'Coconut-heavy liquid soap expands hard in a hot cook. If running the high-temp method, ' +
        'reduce the hold to 150–175 °F (that range dips into the low-temp band on purpose) and ' +
        'use a vessel at least 3× the total recipe volume; pure-coconut no-paste recipes should ' +
        'not start above 180 °F.',
    };
  },
},
```

In `insights.golden.test.ts`: add `'ls_coconut_hot_cook',` to `ALL_CODES` (alphabetical position, after `ls_castor_no_lather`) and bump the header comment "The 37 insight codes" → 38. Do **not** add matrix cells (the matrix is frozen with the fixture); no fixture cell sets both a coconut-heavy FA profile and `soapingTempF`, so the fixture is unchanged — verify with `git diff --stat packages/core/src/__fixtures__/insights-golden.json` (expect no diff).

- [ ] **Step 4: Verify** — `npm run test -w @soap-calc/core`. Expected: green, fixture untouched.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ls): coconut-heavy hot-cook insight — anti-vanish from 150 °F"`

---

### Task 3: Collapse LS to a single variant; nullable finish; estimateCure precedence

**Files:**
- Modify: `packages/web/src/lib/process.ts`
- Modify: `packages/web/src/lib/cureEstimate.ts`
- Modify (tests asserting old variants): `packages/web/src/lib/process.test.ts`, `processDefinitions.test.ts`, `processVariants.golden.test.ts`, `recipe.test.ts`, `recipeFile.test.ts`, `cureEstimate.test.ts`, `packages/web/src/components/ProcessTabs.test.tsx`

**Interfaces:**
- Produces: `ProcessVariantId` union member `'ls'` (the four `ls-*` ids removed); `ProcessProfile.finish: FinishDuration | null`; `estimateCure(profile, workability?, model?, sequesterOverride?: FinishDuration | null): CureEstimate | null`; `soapingTempRangeFor('ls') === { minF: 60, maxF: 220, defaultF: 150 }`.
- Consumes: `LS_TEMP_MIN_F/MAX_F/DEFAULT_F` from Task 1 (import from `@soap-calc/core`).

- [ ] **Step 1: Write the failing tests first** — in `process.test.ts` add:

```ts
it('LS is a single variant: full slider 60–220, default 150, nullable finish', () => {
  expect(PROCESS_DEFINITIONS.ls.variants.map((v) => v.variant)).toEqual(['ls']);
  expect(soapingTempRangeFor('ls')).toEqual({ minF: 60, maxF: 220, defaultF: 150 });
  expect(PROCESS_DEFINITIONS.ls.defaultSettings.soapingTempF).toBe('150');
  expect(PROCESS_DEFINITIONS.ls.defaultSettings.processVariant).toBe('ls');
  const ls = PROCESS_DEFINITIONS.ls.variants[0];
  expect(ls.finish).toBeNull();
  expect(ls.temp).toBeNull();
});
```

In `cureEstimate.test.ts` add:

```ts
it('sequester override wins; null finish with no override yields no estimate', () => {
  const lsProfile = PROCESS_DEFINITIONS.ls.variants[0];
  expect(estimateCure(lsProfile)).toBeNull();
  const est = estimateCure(lsProfile, null, null, { minWeeks: 1, maxWeeks: 2 });
  expect(est).toMatchObject({ minWeeks: 1, maxWeeks: 2, finishingLabel: 'Sequester' });
  // Override also beats a present finish (CP profile + override).
  const cp = PROCESS_DEFINITIONS.cp.variants[0];
  expect(estimateCure(cp, null, null, { minWeeks: 9 })?.minWeeks).toBe(9);
});
```

- [ ] **Step 2: Run to verify both fail** — `npx vitest run packages/web/src/lib/process.test.ts packages/web/src/lib/cureEstimate.test.ts`. Expected: FAIL (four variants; estimateCure arity).

- [ ] **Step 3: Implement `process.ts`:**

1. Union: `ProcessVariantId = 'cp' | 'hp-lthp' | 'hp-hthp' | 'hp-fluid' | 'ls'`.
2. `ProcessProfile.finish: FinishDuration | null;` with doc: `/** null = no fixed window; the LS window is temperature-derived (lsMethodForTemp) and passed to estimateCure as an override — same "declare the absence" posture as temp/waterBand. */`
3. Delete the `LS_SEQUESTER` constant and its comment block entirely.
4. Replace the LS `variants` array with:

```ts
variants: [
  {
    variant: 'ls',
    process: 'ls',
    label: 'Liquid soap',
    waterBand: null, // no sourced LS band exists — see the WaterBand field doc
    temp: null, // the hold temperature IS the method selector — see soapingTempRangeFor
    finish: null, // temperature-derived via lsMethodForTemp; estimateCure override
    finishKind: 'sequester',
    waterLossPercent: 0, // unverified: no LS water-loss constant in the roadmap table
  },
],
```

5. LS `defaultSettings`: `soapingTempF: '150'` (comment: `// lsMethodForTemp default — low temp's recommended band`), `processVariant: 'ls'`.
6. `soapingTempRangeFor`: import `LS_TEMP_DEFAULT_F, LS_TEMP_MAX_F, LS_TEMP_MIN_F` from `@soap-calc/core`; replace the null-temp branch:

```ts
if (profile.temp === null) {
  // LS: the full hold-temperature range — the slider doubles as the method map
  // (lsMethodForTemp). CP keeps its source-band span with overflow headroom.
  return profile.process === 'ls'
    ? { minF: LS_TEMP_MIN_F, maxF: LS_TEMP_MAX_F, defaultF: LS_TEMP_DEFAULT_F }
    : { minF: 60, maxF: 170, defaultF: 125 };
}
```

7. Update the `soapingTempRangeFor` doc comment (drop the CPLS sentence, add one line: "LS spans 60–220 °F, default 150 — zones and method derivation live in core's lsMethodForTemp").

**Implement `cureEstimate.ts`:** change `estimateCure` to:

```ts
/** Cure/sequester window for a process; hot process is usable straight from the mold.
 * Precedence: an explicit override (LS's temperature-derived window) wins over the
 * profile's fixed finish; null finish with no override returns null — "declare the
 * absence", same as null temp/waterBand. Only LS can hit that, and only if a caller
 * forgets the override (pinned by cureEstimate.test.ts). */
export function estimateCure(
  profile: ProcessProfile,
  workability: WorkabilityEstimate | null = null,
  model: CureModelEstimate | null = null,
  sequesterOverride: FinishDuration | null = null,
): CureEstimate | null {
  const finish = sequesterOverride ?? profile.finish;
  if (!finish) return null;
  return {
    minWeeks: finish.minWeeks,
    maxWeeks: finish.maxWeeks,
    usableAtUnmold: profile.process === 'hp',
    finishingLabel: PROCESS_DEFINITIONS[profile.process].terms.finishingLabel,
    workability,
    model,
  };
}
```

(`FinishDuration` is already exported from `./process` — add it to the import list.)

- [ ] **Step 4: Fix every test asserting the old variants.** Run `npm run test -w @soap-calc/web 2>&1 | grep FAIL` and repair, keeping intent:
  - `process.test.ts` / `processDefinitions.test.ts` / `processVariants.golden.test.ts`: variant lists shrink to `['ls']`; any `'ls-cpls'` literal → `'ls'`; assertions on the four labels/temps are deleted (the values no longer exist — the new Task 1 tests own that ground).
  - `recipe.test.ts` / `recipeFile.test.ts`: expected default `processVariant` for LS `'ls-cpls'` → `'ls'`.
  - `ProcessTabs.test.tsx`: the LS case moves to the "single-variant processes render no tab list" expectation CP already uses.
  - `cureEstimate.test.ts`: existing calls now read `estimateCure(profile)!` where the profile has a non-null finish (CP/HP cases).
  - TypeScript will also flag any remaining `'ls-*'` literals — chase them with `npx tsc -p packages/web --noEmit`.

- [ ] **Step 5: Verify** — `npm run test -w @soap-calc/web` green; `npm run test -w @soap-calc/core` untouched-green.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(ls): collapse to a single variant — full 60–220 slider, nullable finish, estimateCure override"`

---

### Task 4: View-model wiring — derived method, sequester override, 30-min package

**Files:**
- Create: `packages/web/src/lib/ls30Min.ts`
- Create: `packages/web/src/lib/ls30Min.test.ts`
- Modify: `packages/web/src/hooks/useRecipeViewModel.ts`
- Modify: `packages/web/src/lib/cureEstimate.ts` (`CureEstimate` gains `note?: string`)
- Modify: `packages/web/src/components/ResultsPanel.tsx` (render the note)

**Interfaces:**
- Produces: `ls30MinPackagePresent(args: { lsGlycerinPresent: boolean; additives: ReadonlyArray<{ catalogId: string; name: string; grams: number }> }): boolean`; vm exposes `lsMethod: LsMethodInfo | null` (null for CP/HP) to panels; `CureEstimate.note?: string`.
- Consumes: `lsMethodForTemp` (Task 1); the vm's existing `soapingTempF` (line ~357), `lsGlycerinSolvent` union (~612), `computedAdditives`, `estimateCure` (Task 3).

- [ ] **Step 1: Failing tests for the predicate** (`ls30Min.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { ls30MinPackagePresent } from './ls30Min';

const add = (catalogId: string, grams = 10) => ({ catalogId, name: catalogId, grams });

describe('ls30MinPackagePresent', () => {
  it('needs glycerin AND (salt OR sodium lactate); sugar never gates', () => {
    expect(ls30MinPackagePresent({ lsGlycerinPresent: true, additives: [add('salt')] })).toBe(true);
    expect(
      ls30MinPackagePresent({ lsGlycerinPresent: true, additives: [add('sodium-lactate')] }),
    ).toBe(true);
    expect(ls30MinPackagePresent({ lsGlycerinPresent: true, additives: [] })).toBe(false);
    expect(ls30MinPackagePresent({ lsGlycerinPresent: false, additives: [add('salt')] })).toBe(false);
    expect(
      ls30MinPackagePresent({ lsGlycerinPresent: false, additives: [add('sugar-sorbitol')] }),
    ).toBe(false);
  });
  it('ignores zero-gram lines', () => {
    expect(ls30MinPackagePresent({ lsGlycerinPresent: true, additives: [add('salt', 0)] })).toBe(false);
  });
});
```

- [ ] **Step 2: Verify failure** — `npx vitest run packages/web/src/lib/ls30Min.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** (`ls30Min.ts`):

```ts
import { additiveMatches } from '@soap-calc/core';

/** The 30-minute no-paste package: glycerin (split-liquid row or additive — the caller
 * passes the vm's existing union) AND salt-or-sodium-lactate. Sugar strengthens the
 * workflow but never gates detection — verified against every sourced 30-min recipe
 * (see the redesign spec). Temperature is deliberately NOT an input: the caller only
 * consults this when the derived method is already high temp. */
export function ls30MinPackagePresent(args: {
  lsGlycerinPresent: boolean;
  additives: ReadonlyArray<{ catalogId: string; name: string; grams: number }>;
}): boolean {
  if (!args.lsGlycerinPresent) return false;
  const active = args.additives.filter((a) => a.grams > 0);
  return (
    additiveMatches(active, 'salt', 'salt') ||
    additiveMatches(active, 'sodium-lactate', 'sodium lactate')
  );
}
```

(If `additiveMatches`'s entry type needs `catalogId`/`name` only, adapt the filter to map first — mirror how `useFormulationInsights` builds `additiveEntries`.)

- [ ] **Step 4: Wire the vm.** In `useRecipeViewModel.ts`:

```ts
// near the soapingTempF memo (~line 357)
const lsMethod = useMemo(
  () => (process === 'ls' ? lsMethodForTemp(soapingTempF) : null),
  [process, soapingTempF],
);
// 30-min package: derived-method note + sequester clause (high temp only)
const ls30Min =
  lsMethod?.method === 'hightemp' &&
  ls30MinPackagePresent({ lsGlycerinPresent, additives: computedAdditives });
```

where `lsGlycerinPresent` is the exact boolean expression already computed for `lsGlycerinSolvent` (~line 612) — lift it into a named `const lsGlycerinPresent` and reuse it in both places. Then the cure estimate (~line 707):

```ts
const cureEstimate = useMemo(() => {
  const base = profile
    ? estimateCure(profile, workability, cureModel, lsMethod?.sequester ?? null)
    : null;
  return base && ls30Min
    ? {
        ...base,
        note: 'Sequester is recommended, not required for the 30-minute no-paste method — the soap is usable as soon as it cools.',
      }
    : base;
}, [profile, workability, cureModel, lsMethod, ls30Min]);
```

Export `lsMethod` and `ls30Min` from the vm's return object (alongside the existing panel inputs). Add `note?: string` to `CureEstimate` in `cureEstimate.ts`. In `ResultsPanel.tsx`, directly after the line that renders `cureWindowLabel(...)`, add:

```tsx
{cureEstimate.note && <p className="results-hint">{cureEstimate.note}</p>}
```

- [ ] **Step 5: Add a vm-level pin** in the existing vm/ResultsPanel test file that covers cure display (follow the file's existing render-harness pattern): an LS recipe at default temp shows "1+ weeks"; with temp 215 shows "1–2 weeks"; with temp 215 + glycerin split row + salt additive shows the usable-once-cooled note.

- [ ] **Step 6: Verify** — `npm run test -w @soap-calc/web`. Expected: green.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(ls): temperature-derived method in the vm — sequester override + 30-min package note"`

---

### Task 5: SoapingTemperaturePanel — zones, markers, derived-method readout

**Files:**
- Modify: `packages/web/src/components/SoapingTemperaturePanel.tsx`
- Modify: `packages/web/src/components/SoapingTemperaturePanel.test.tsx`
- Modify: `packages/web/src/styles.css` (zone marker styles, follow existing `slider-field` class family)

**Interfaces:**
- Consumes: vm/props unchanged plus `process`; `lsMethodForTemp`, `LS_ZONES`, `fToC/cToF` from core.
- Produces: LS panel renders zone track + method readout + gap note. CP/HP rendering byte-identical.

- [ ] **Step 1: Failing tests** — in `SoapingTemperaturePanel.test.tsx` (reuse its existing render helper; settings prop shape unchanged):

```tsx
it('LS: names the derived method beside the temperature', () => {
  renderPanel({ process: 'ls', soapingTempF: '150' });
  expect(screen.getByText(/Low-temp LS/)).toBeInTheDocument();
});
it('LS: shows the honest gap note at 180 °F', () => {
  renderPanel({ process: 'ls', soapingTempF: '180' });
  expect(screen.getByText(/below its 215/)).toBeInTheDocument();
  expect(screen.getByText(/High-temp LS/)).toBeInTheDocument();
});
it('LS: draws all three zone markers with the low-temp recommended sub-band', () => {
  renderPanel({ process: 'ls', soapingTempF: '150' });
  expect(screen.getByText('cold process')).toBeInTheDocument();
  expect(screen.getByText('low temp')).toBeInTheDocument();
  expect(screen.getByText('high temp')).toBeInTheDocument();
});
it('CP: unchanged — no zone markers', () => {
  renderPanel({ process: 'cp', soapingTempF: '125' });
  expect(screen.queryByText('low temp')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Verify failure**, then **Step 3: Implement.** In the panel, for `process === 'ls'` only:
  - Readout in `panel__head`: `{fToC(effectiveF)} °C ({effectiveF} °F) — {method.label}` where `const method = lsMethodForTemp(effectiveF)`.
  - Under the slider, a zone strip: absolutely-positioned segments over the track computed from `LS_ZONES` as percentages of 60–220 (`left = (edgeF−60)/160*100%`): cold 0–25%, low 37.5–62.5% (recommended 140–160 sub-band 50–62.5% in a stronger shade), high 96.875–100%; zone labels row beneath ("cold process" / "low temp" / "high temp"); the zone containing `effectiveF` gets a `--active` modifier class.
  - Gap note: `{method.note && <p className="results-hint">{method.note}</p>}`.
  - Replace the old LS `Cook target:` / CPLS-ambient branches (lines ~177–191) with the method-derived hint: cold shows the existing no-external-heat sentence; low/high show one line from the method label + hold framing: `Hold {…}` (`low: 'Hold 120–160 °F (140–160 °F recommended) through cook and dilution.'`, `high: 'Hold 215 °F through cook and dilution — do not exceed 220 °F.'`).
  - Panel copy line (subtitle under the title): `CPLS melts oils at 120–130 °F first; heated methods melt on the way up. This slider is the hold temperature.` — LS only.
  - Update the panel's `VERIFIED_TEMP_VARIANTS` comment: LS zones are now source-verified; the set keeps only the HP ids and its doc says so.
  - CSS: `.temp-zones`, `.temp-zones__zone`, `.temp-zones__zone--active`, `.temp-zones__zone--recommended`, `.temp-zones__labels` — flat shaded bands using existing `var(--accent)`/`var(--hairline)` tokens.

- [ ] **Step 4: Verify** — panel tests + full web suite green. **Step 5: Commit** — `git add -A && git commit -m "feat(ls): temperature panel — zone markers, derived-method readout, gap notes"`

---

### Task 6: ProcessGuidePanel — method-derived steps and 30-min note

**Files:**
- Modify: `packages/web/src/components/ProcessGuidePanel.tsx`
- Modify: `packages/web/src/components/ProcessGuidePanel.test.tsx`
- Modify: `packages/web/src/App.tsx` (~line 470: pass the two new props from the vm)

**Interfaces:**
- Consumes: `LS_METHOD_STAGES`, `lsMethodForTemp` (via new props: `lsMethod: LsMethodInfo | null`, `ls30Min: boolean` — both straight from the vm, Task 4).
- Produces: props `ProcessGuidePanelProps` gains `lsMethod?: LsMethodInfo | null; ls30Min?: boolean`.

- [ ] **Step 1: Failing tests:**

```tsx
it('LS: renders the derived method steps (high temp at 215) with the vessel mandate', () => {
  render(<ProcessGuidePanel process="ls" processVariant="ls" lsMethod={lsMethodForTemp(215)} ls30Min={false} />);
  expect(screen.getByText(/2× the total recipe volume/)).toBeInTheDocument();
  expect(screen.getByText(/High-temp LS/)).toBeInTheDocument();
});
it('LS: 30-minute note only when the package is present on high temp', () => {
  render(<ProcessGuidePanel process="ls" processVariant="ls" lsMethod={lsMethodForTemp(215)} ls30Min={true} />);
  expect(screen.getByText(/30-minute no-paste/i)).toBeInTheDocument();
});
it('LS: cold method renders CPLS steps and no cook-stage list', () => {
  render(<ProcessGuidePanel process="ls" processVariant="ls" lsMethod={lsMethodForTemp(80)} ls30Min={false} />);
  expect(screen.getByText(/12–48 hours/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Verify failure**, then **Step 3: Implement.** In the panel: when `process === 'ls' && lsMethod`, subtitle becomes `Temperature and method notes for {lsMethod.label}`; render `<ol className="process-guide__stages">{LS_METHOD_STAGES[lsMethod.method].map(...)}</ol>`; when `lsMethod.inGap`, render `lsMethod.note` as a `results-hint`; when `ls30Min`, append: `<p className="results-hint">30-minute no-paste package detected (glycerin + salt/sodium lactate) — dilute immediately after the cook; no paste stage.</p>`. HP branch untouched. The `profile.temp` hint block skips LS (its temp is null and the method hint replaced it). Update `VERIFIED_TEMP_VARIANTS` comment as in Task 5. In `App.tsx` pass `lsMethod={vm.lsMethod} ls30Min={vm.ls30Min}`.

- [ ] **Step 4: Verify** — web suite green. **Step 5: Commit** — `git add -A && git commit -m "feat(ls): process guide derives steps from the hold temperature; 30-min note"`

---

### Task 7: E2E + full verification

**Files:**
- Modify: `packages/web/e2e/exploratory.spec.ts:139` (the LS row asserted four variant tabs)
- Verify: `packages/web/e2e/process-isolation.spec.ts`, `cure.spec.ts`, `ls-split-liquid.spec.ts` unchanged-green

- [ ] **Step 1:** Change the LS row of the variant-tab table test to expect **no** variant tabs (mirror how the CP row is asserted) while keeping the lye assertion: `{ tab: /Liquid soap/, variants: [], lye: /^KOH/ }` — and if the loop assumes non-empty variants, guard it the same way CP's entry is handled.
- [ ] **Step 2:** `npm run build:web` — expect clean build.
- [ ] **Step 3:** Run e2e per the repo's e2e script (`npm run e2e -w @soap-calc/web` or the package's documented runner); fix only assertions that reference removed LS variant UI. Expected: all pass.
- [ ] **Step 4:** `npm test` — all three packages green.
- [ ] **Step 5:** Commit — `git add -A && git commit -m "test(ls): e2e for the single-variant LS tab; full verification"`

---

## Out of scope

Polysorbate 80 catalog entry + PCSF insight (separately decided; implement after this plan, its own commit). CP/HP temperature models. Old-recipe migration beyond the existing normalization path.

## Self-review notes

- Spec coverage: zones/gaps/edges (T1), hold-temp copy (T5), guide + 2× vessel + 30-min (T1/T4/T6), sequester incl. optional clause + estimateCure precedence (T3/T4), coconut insight (T2), collapse/defaults/normalization (T3), °C granularity (existing cToF/fToC path untouched; zone membership computed on stored °F — T5), ripple checklist files all appear in T3–T7.
- Type consistency: `LsMethodInfo`/`LsSequesterWindow` (T1) consumed by T3 (`FinishDuration`-compatible shape), T4 (vm), T5/T6 (props). `estimateCure` 4th param named `sequesterOverride` everywhere.
- The golden insights fixture is expected UNCHANGED (T2 verifies); the process-variants golden test changes are intentional (T3).
