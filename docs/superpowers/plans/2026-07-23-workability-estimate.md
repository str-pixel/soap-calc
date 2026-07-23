# Workability Estimate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cold-process soap **workability timeline** (unmold → cut → stamp) derived from the recipe's hardness score and levers, rendered as honest labeled-heuristic ranges, plus a new CP gel control that feeds it.

**Architecture:** A pure core estimator (`packages/core/src/workability.ts`, a twin of `trace-speed.ts`) computes the timeline in hours from primitive inputs. A new persisted `gelMode` setting feeds it. Web-side adapters convert stored additives to per-oil doses and format hour-ranges for display; the view model calls the estimator and merges the result into the existing `CureEstimate`; `ResultsPanel` renders it.

**Tech Stack:** TypeScript, npm workspaces (`@soap-calc/core` consumed by `packages/web`), Vitest, React + Vite, Testing Library.

## Global Constraints

- **No `core` → `web` import.** `packages/core` is standalone; the estimator takes only primitive inputs. Web imports from `@soap-calc/core`.
- **Core relative imports use `.js` specifiers** (ESM), e.g. `export * from './workability.js'`. Core **test** files import without extension, e.g. `from './workability'`.
- **All model constants live in one exported tunable object** `WORKABILITY_TUNING`, JSDoc-annotated "no verified constant" (mirroring `trace-speed.ts`).
- **Confidence is never `'high'`** — only `'low' | 'moderate'`.
- **Output ranges are never single-point:** every `max ≥ min × 1.5` (except the HP fixed band and the display ceiling label).
- **`usableAtUnmold` and `finishingLabel` are untouched (D5).** The feature only *adds* a `workability` field to `CureEstimate`.
- Run all core tests with `npm test --workspace @soap-calc/core`; web tests with `npm test --workspace @soap-calc/web`.

---

### Task 1: Core estimator `workability.ts`

**Files:**
- Create: `packages/core/src/workability.ts`
- Create: `packages/core/src/workability.test.ts`
- Modify: `packages/core/src/index.ts` (add one export line)

**Interfaces:**
- Consumes: nothing (pure; primitive inputs only).
- Produces:
  - `type GelMode = 'none' | 'natural' | 'forced'`
  - `type WorkabilityConfidence = 'low' | 'moderate'`
  - `interface WorkabilityRange { minHours: number; maxHours: number }`
  - `interface WorkabilityEstimate { unmold: WorkabilityRange; cut: WorkabilityRange; stamp: { opensMinHours: number; opensMaxHours: number } | null; confidence: WorkabilityConfidence; factors: string[]; caveats: string[] }`
  - `interface WorkabilityInput { hardnessScore: number; faCoverage: number; lyeConcentrationPercent: number; superfatPercent: number; process: 'cp' | 'hp' | 'ls'; gelMode: GelMode; additives: ReadonlyArray<{ id: string; dosePercent: number }> }`
  - `function estimateWorkability(input: WorkabilityInput): WorkabilityEstimate | null`
  - `const WORKABILITY_TUNING`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/workability.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { estimateWorkability, WORKABILITY_TUNING, type WorkabilityInput } from './workability';

const base: WorkabilityInput = {
  hardnessScore: 47,
  faCoverage: 100,
  lyeConcentrationPercent: 33,
  superfatPercent: 5,
  process: 'cp',
  gelMode: 'natural',
  additives: [],
};
const est = (o: Partial<WorkabilityInput> = {}) => estimateWorkability({ ...base, ...o });

describe('estimateWorkability', () => {
  it('baseline hard bar sits in the 12–36h band at natural gel', () => {
    const e = est()!;
    expect(e.unmold.minHours).toBeCloseTo(12, 5);
    expect(e.unmold.maxHours).toBeCloseTo(36, 5);
    expect(e.confidence).toBe('moderate');
    expect(e.stamp).not.toBeNull();
  });

  it('fast case (forced gel + discount + sodium lactate) lands ~5–14h, above the 4h floor', () => {
    const e = est({ gelMode: 'forced', lyeConcentrationPercent: 38, superfatPercent: 3, additives: [{ id: 'sodium-lactate', dosePercent: 3 }] })!;
    expect(e.unmold.minHours).toBeGreaterThanOrEqual(4);
    expect(e.unmold.minHours).toBeLessThan(8);
    expect(e.unmold.maxHours).toBeGreaterThan(10);
    expect(e.unmold.maxHours).toBeLessThan(16);
  });

  it('slow castile stays finite, wide, and hits the 2-week ceiling caveat', () => {
    const e = est({ hardnessScore: 14, gelMode: 'none', lyeConcentrationPercent: 28, superfatPercent: 8 })!;
    expect(e.unmold.maxHours).toBeGreaterThanOrEqual(WORKABILITY_TUNING.ceilingHours);
    expect(e.unmold.maxHours / e.unmold.minHours).toBeGreaterThanOrEqual(1.5);
    expect(e.caveats.some((c) => /castile/i.test(c))).toBe(true);
  });

  it('all-unsaturated (score 0, coverage high) is a real ~2-week bar, NOT null', () => {
    expect(est({ hardnessScore: 0, faCoverage: 95 })).not.toBeNull();
  });

  it('baseline composite is exactly 1.0 (band unchanged)', () => {
    const e = est()!;
    expect(e.unmold.minHours).toBe(12);
    expect(e.unmold.maxHours).toBe(36);
  });

  it('gel monotonic: forced < natural < none on every edge', () => {
    const f = est({ gelMode: 'forced' })!, n = est({ gelMode: 'natural' })!, o = est({ gelMode: 'none' })!;
    expect(f.unmold.minHours).toBeLessThan(n.unmold.minHours);
    expect(n.unmold.minHours).toBeLessThan(o.unmold.minHours);
  });

  it('ordering + min-width hold across a fuzz of 25k inputs', () => {
    for (let h = 0; h <= 60; h += 3)
      for (const lye of [22, 28, 33, 38, 44])
        for (const sf of [1, 3, 5, 8, 12])
          for (const g of ['none', 'natural', 'forced'] as const)
            for (const sl of [0, 1.5, 3, 50])
              for (const salt of [0, 0.5, 1, 5]) {
                const e = estimateWorkability({ ...base, hardnessScore: h, lyeConcentrationPercent: lye, superfatPercent: sf, gelMode: g, additives: [{ id: 'sodium-lactate', dosePercent: sl }, { id: 'salt', dosePercent: salt }] })!;
                expect(e.unmold.maxHours).toBeGreaterThanOrEqual(e.unmold.minHours * 1.5 - 1e-6);
                expect(e.unmold.minHours).toBeGreaterThanOrEqual(4 - 1e-9);
                expect(e.cut.minHours).toBeGreaterThanOrEqual(e.unmold.minHours);
                expect(e.stamp!.opensMinHours).toBeGreaterThanOrEqual(e.cut.maxHours - 1e-9);
              }
  });

  it('gates: ls→null, non-finite→null, cp coverage 0→null', () => {
    expect(est({ process: 'ls' })).toBeNull();
    expect(est({ lyeConcentrationPercent: NaN })).toBeNull();
    expect(est({ faCoverage: 0 })).toBeNull();
  });

  it('coverage 79.9→low, 80→moderate', () => {
    expect(est({ faCoverage: 79.9 })!.confidence).toBe('low');
    expect(est({ faCoverage: 80 })!.confidence).toBe('moderate');
  });

  it('HP: fixed 6–18h band, stamp null, never gated by coverage', () => {
    const e = est({ process: 'hp', faCoverage: 5 })!;
    expect(e.unmold).toEqual({ minHours: 6, maxHours: 18 });
    expect(e.stamp).toBeNull();
    expect(e.confidence).toBe('moderate');
  });

  it('guards: unknown gelMode→natural; SL dose clamps; hardness clamps', () => {
    // @ts-expect-error deliberately invalid
    expect(est({ gelMode: 'bogus' })!.unmold).toEqual(est({ gelMode: 'natural' })!.unmold);
    const clamped = est({ additives: [{ id: 'sodium-lactate', dosePercent: 50 }] })!;
    const atMax = est({ additives: [{ id: 'sodium-lactate', dosePercent: 3 }] })!;
    expect(clamped.unmold.minHours).toBeCloseTo(atMax.unmold.minHours, 5);
    expect(est({ hardnessScore: 200 })!.unmold.maxHours).toBe(36);
    expect(est({ hardnessScore: -5 })!.unmold.maxHours).toBe(336);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @soap-calc/core -- workability`
Expected: FAIL — "Failed to resolve import './workability'".

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/workability.ts`:

```ts
export type GelMode = 'none' | 'natural' | 'forced';
export type WorkabilityConfidence = 'low' | 'moderate';

export interface WorkabilityRange {
  minHours: number;
  maxHours: number;
}

export interface WorkabilityEstimate {
  unmold: WorkabilityRange;
  cut: WorkabilityRange;
  stamp: { opensMinHours: number; opensMaxHours: number } | null;
  confidence: WorkabilityConfidence;
  factors: string[];
  caveats: string[];
}

export interface WorkabilityInput {
  hardnessScore: number;
  faCoverage: number;
  lyeConcentrationPercent: number;
  superfatPercent: number;
  process: 'cp' | 'hp' | 'ls';
  gelMode: GelMode;
  additives: ReadonlyArray<{ id: string; dosePercent: number }>;
}

/**
 * Transparent, tunable heuristic — workability timing has no verified constant. Every value
 * here is a deliberate, adjustable default (see the design doc's Model section). The pipeline
 * is one multiplicative composition; the copy that surfaces this is behavior-only.
 */
export const WORKABILITY_TUNING = {
  hardnessClamp: [0, 60] as const,
  // half-open, top-down: first row whose `min` the (clamped) hardness meets or exceeds.
  bands: [
    { min: 45, hours: [12, 36] as const },
    { min: 38, hours: [36, 72] as const },
    { min: 30, hours: [72, 120] as const },
    { min: 22, hours: [120, 192] as const },
    { min: 0, hours: [192, 336] as const },
  ],
  gel: { none: 1.3, natural: 1.0, forced: 0.55 } as Record<GelMode, number>,
  lyeConc: [[25, 1.3], [33, 1.0], [40, 0.78]] as ReadonlyArray<readonly [number, number]>,
  superfat: [[2, 0.9], [5, 1.0], [10, 1.2]] as ReadonlyArray<readonly [number, number]>,
  sodiumLactate: { doseClamp: [0, 3] as const, knees: [[0, 1.0], [3, 0.9]] as ReadonlyArray<readonly [number, number]> },
  salt: { doseClamp: [0, 1] as const, knees: [[0, 1.0], [1, 0.9]] as ReadonlyArray<readonly [number, number]> },
  floorHours: 4,
  minWidthFactor: 1.5,
  bufferHours: 4,
  stampSpread: 1.3,
  ceilingHours: 336,
  lowCoveragePercent: 80,
  hp: { unmold: [6, 18] as const },
};

const CP_CAVEATS = [
  'Mold type and room temperature move these as much as the recipe does — plastic molds and cool rooms run slower; a warm room runs faster.',
  'The gel setting assumes a loaf; small or individual molds often don’t gel on their own — treat those as None unless you insulate.',
  'Don’t wait to stamp — bars over-harden and then take faint, cracked impressions. Two schools: stamp fresh at cut, or wait a day for a firmer, cleaner deep impression.',
  'Test firmness on a loaf offcut before cutting or stamping the batch.',
  'Salt bars (salt at 25%+ of oils) are out of scope — they must be cut within ~1–2 h and break the 4 h floor.',
];
const CEILING_CAVEAT =
  'High-olive (castile) bars can exceed two weeks — a still-soft loaf at day 10 is normal, not a failed batch.';
const HP_CAVEAT =
  'Hot-process bars are unmoldable soon after the cook firms; their rustic surface takes stamps unevenly, so stamp timing varies.';

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Piecewise-linear through sorted knees; flat outside the first/last knee. */
function piecewise(x: number, knees: ReadonlyArray<readonly [number, number]>): number {
  if (x <= knees[0][0]) return knees[0][1];
  const last = knees[knees.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < knees.length - 1; i++) {
    const [x0, y0] = knees[i];
    const [x1, y1] = knees[i + 1];
    if (x >= x0 && x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return last[1];
}

function sumDose(additives: WorkabilityInput['additives'], id: string): number {
  return additives.reduce(
    (sum, a) => (a.id === id && Number.isFinite(a.dosePercent) ? sum + a.dosePercent : sum),
    0,
  );
}

const GEL_LABEL: Record<GelMode, string> = { none: 'No', natural: 'Natural', forced: 'Forced' };
const fmtNum = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function estimateWorkability(input: WorkabilityInput): WorkabilityEstimate | null {
  const T = WORKABILITY_TUNING;

  if (input.process === 'ls') return null;
  for (const v of [input.hardnessScore, input.faCoverage, input.lyeConcentrationPercent, input.superfatPercent]) {
    if (!Number.isFinite(v)) return null;
  }
  if (input.process === 'hp') {
    const [lo, hi] = T.hp.unmold;
    return {
      unmold: { minHours: lo, maxHours: hi },
      cut: { minHours: lo, maxHours: hi },
      stamp: null,
      confidence: 'moderate',
      factors: ['Hot process — the cook sets the timing, not the oils'],
      caveats: [HP_CAVEAT],
    };
  }
  if (input.faCoverage <= 0) return null;

  const confidence: WorkabilityConfidence = input.faCoverage < T.lowCoveragePercent ? 'low' : 'moderate';

  const hardness = clamp(input.hardnessScore, T.hardnessClamp[0], T.hardnessClamp[1]);
  const band = T.bands.find((b) => hardness >= b.min) ?? T.bands[T.bands.length - 1];

  const gelMode: GelMode = input.gelMode in T.gel ? input.gelMode : 'natural';
  const slDose = clamp(sumDose(input.additives, 'sodium-lactate'), T.sodiumLactate.doseClamp[0], T.sodiumLactate.doseClamp[1]);
  const saltDose = clamp(sumDose(input.additives, 'salt'), T.salt.doseClamp[0], T.salt.doseClamp[1]);

  const composite =
    T.gel[gelMode] *
    piecewise(input.lyeConcentrationPercent, T.lyeConc) *
    piecewise(input.superfatPercent, T.superfat) *
    piecewise(slDose, T.sodiumLactate.knees) *
    piecewise(saltDose, T.salt.knees);

  let uMin = Math.max(T.floorHours, band.hours[0] * composite);
  let uMax = Math.max(T.floorHours, band.hours[1] * composite);
  if (uMax < uMin * T.minWidthFactor) uMax = uMin * T.minWidthFactor;

  const unmold: WorkabilityRange = { minHours: uMin, maxHours: uMax };
  const cut: WorkabilityRange = { minHours: uMin + T.bufferHours, maxHours: uMax + T.bufferHours };
  const stamp = { opensMinHours: cut.maxHours, opensMaxHours: cut.maxHours * T.stampSpread };

  const caveats = [...CP_CAVEATS];
  if (unmold.maxHours >= T.ceilingHours) caveats.push(CEILING_CAVEAT);

  const factors = [
    `Hard-oil score ${Math.round(hardness)}`,
    `${GEL_LABEL[gelMode]} gel`,
    `${Math.round(input.lyeConcentrationPercent)}% lye concentration`,
    `${fmtNum(input.superfatPercent)}% superfat`,
  ];
  if (slDose > 0) factors.push('sodium lactate');
  if (saltDose > 0) factors.push('salt');

  return { unmold, cut, stamp, confidence, factors, caveats };
}
```

- [ ] **Step 4: Add the core index export**

In `packages/core/src/index.ts`, add after the `trace-speed` line (currently line 18):

```ts
export * from './workability.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace @soap-calc/core -- workability`
Expected: PASS (all cases in the file).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/workability.ts packages/core/src/workability.test.ts packages/core/src/index.ts
git commit -m "feat(core): add estimateWorkability (unmold/cut/stamp heuristic)"
```

---

### Task 2: `gelMode` recipe setting

**Files:**
- Modify: `packages/web/src/lib/recipe.ts` (type field, `GEL_MODES`, `isGelMode`, `DEFAULT_SETTINGS`, `normalizeSettings`)
- Modify: `packages/web/src/lib/recipe.test.ts` (coercion test)

**Interfaces:**
- Consumes: `GelMode` from `@soap-calc/core` (Task 1).
- Produces: `RecipeSettings.gelMode: GelMode`, defaulting to `'natural'`, surviving `normalizeSettings`.

- [ ] **Step 1: Write the failing test**

Add to `packages/web/src/lib/recipe.test.ts` (inside the existing `describe` for `normalizeSettings`, or a new one):

```ts
import { DEFAULT_SETTINGS, normalizeSettings } from './recipe';

describe('gelMode', () => {
  it('defaults to natural when absent', () => {
    expect(DEFAULT_SETTINGS.gelMode).toBe('natural');
    expect(normalizeSettings({}).gelMode).toBe('natural');
  });
  it('preserves a valid saved value', () => {
    expect(normalizeSettings({ gelMode: 'forced' }).gelMode).toBe('forced');
  });
  it('coerces an invalid value back to natural', () => {
    // @ts-expect-error deliberately invalid
    expect(normalizeSettings({ gelMode: 'bogus' }).gelMode).toBe('natural');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @soap-calc/web -- recipe`
Expected: FAIL — `DEFAULT_SETTINGS.gelMode` is `undefined`.

- [ ] **Step 3: Add the type field, import, guard, default, and normalizer line**

In `packages/web/src/lib/recipe.ts`:

1. Extend the core import at the top of the file to include `GelMode`. If there is an existing `import { ... } from '@soap-calc/core';`, add `GelMode`; otherwise add:

```ts
import type { GelMode } from '@soap-calc/core';
```

2. Add `gelMode` to the `RecipeSettings` type (after `processVariant: ProcessVariantId;`):

```ts
  gelMode: GelMode;
```

3. Add `gelMode` to `DEFAULT_SETTINGS` (after `processVariant: 'cp',`):

```ts
  gelMode: 'natural',
```

4. Add the const + guard next to `WATER_MODES`/`LYE_TYPES` (after line 113):

```ts
const GEL_MODES = ['none', 'natural', 'forced'] as const;

function isGelMode(value: unknown): value is GelMode {
  return typeof value === 'string' && (GEL_MODES as readonly string[]).includes(value);
}
```

5. In `normalizeSettings`, add a resolved `gelMode` to the returned object (alongside the other guarded fields, e.g. after the `processVariant` line in the return):

```ts
    gelMode: isGelMode(partial?.gelMode) ? partial.gelMode : DEFAULT_SETTINGS.gelMode,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @soap-calc/web -- recipe`
Expected: PASS, including the pre-existing `normalizeSettings` `toEqual({ ...DEFAULT_SETTINGS, processVariant })` assertion (now that `gelMode` is in both `DEFAULT_SETTINGS` and the normalizer output).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/recipe.ts packages/web/src/lib/recipe.test.ts
git commit -m "feat(web): add persisted gelMode recipe setting (none/natural/forced)"
```

---

### Task 3: Additive→dose adapter + input assembly

**Files:**
- Create: `packages/web/src/lib/workabilityInput.ts`
- Create: `packages/web/src/lib/workabilityInput.test.ts`

**Interfaces:**
- Consumes: `estimateWorkability`, `WorkabilityEstimate`, `GelMode` from `@soap-calc/core`; `ComputedAdditive` from `./calculateAdditives`; `ProcessId` from `./process`.
- Produces:
  - `function additivesToDoses(additives: ComputedAdditive[], totalOilGrams: number): { id: string; dosePercent: number }[]`
  - `function computeWorkability(args: {...}): WorkabilityEstimate | null`

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/lib/workabilityInput.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ComputedAdditive } from './calculateAdditives';
import { additivesToDoses, computeWorkability } from './workabilityInput';

const additive = (over: Partial<ComputedAdditive>): ComputedAdditive => ({
  key: 'k', catalogId: 'sodium-lactate', name: 'Sodium lactate', amount: 3,
  basis: 'oil', unit: 'percent', grams: 15, addAt: 'lye', ...over,
});

describe('additivesToDoses', () => {
  it('converts grams to percent-of-oil regardless of the stored basis/unit', () => {
    // 15g against 500g oils = 3%
    expect(additivesToDoses([additive({ grams: 15 })], 500)).toEqual([{ id: 'sodium-lactate', dosePercent: 3 }]);
  });
  it('returns [] when there is no oil weight', () => {
    expect(additivesToDoses([additive({})], 0)).toEqual([]);
  });
});

describe('computeWorkability', () => {
  it('assembles inputs and returns a CP estimate', () => {
    const e = computeWorkability({
      hardness: 47, coveragePercent: 100, lyeConcentrationPercent: 33,
      superfatPercent: '5', process: 'cp', gelMode: 'natural', additives: [], totalOilGrams: 500,
    });
    expect(e).not.toBeNull();
    expect(e!.stamp).not.toBeNull();
  });
  it('returns null when the lye result is missing (non-finite)', () => {
    const e = computeWorkability({
      hardness: 47, coveragePercent: 100, lyeConcentrationPercent: null,
      superfatPercent: '5', process: 'cp', gelMode: 'natural', additives: [], totalOilGrams: 500,
    });
    expect(e).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @soap-calc/web -- workabilityInput`
Expected: FAIL — cannot resolve `./workabilityInput`.

- [ ] **Step 3: Write the implementation**

Create `packages/web/src/lib/workabilityInput.ts`:

```ts
import { estimateWorkability, type GelMode, type WorkabilityEstimate } from '@soap-calc/core';
import type { ComputedAdditive } from './calculateAdditives';
import type { ProcessId } from './process';

/** Normalize computed additives (grams, any basis/unit) to percent-of-oil doses for the core estimator. */
export function additivesToDoses(
  additives: ComputedAdditive[],
  totalOilGrams: number,
): { id: string; dosePercent: number }[] {
  if (totalOilGrams <= 0) return [];
  return additives.map((a) => ({ id: a.catalogId, dosePercent: (a.grams / totalOilGrams) * 100 }));
}

export function computeWorkability(args: {
  hardness: number | null | undefined;
  coveragePercent: number;
  lyeConcentrationPercent: number | null | undefined;
  superfatPercent: string;
  process: ProcessId;
  gelMode: GelMode;
  additives: ComputedAdditive[];
  totalOilGrams: number;
}): WorkabilityEstimate | null {
  return estimateWorkability({
    hardnessScore: args.hardness ?? 0,
    faCoverage: args.coveragePercent,
    lyeConcentrationPercent: args.lyeConcentrationPercent ?? Number.NaN,
    superfatPercent: Number.parseFloat(args.superfatPercent),
    process: args.process,
    gelMode: args.gelMode,
    additives: additivesToDoses(args.additives, args.totalOilGrams),
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @soap-calc/web -- workabilityInput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/workabilityInput.ts packages/web/src/lib/workabilityInput.test.ts
git commit -m "feat(web): add workability input adapter (additive dose + assembly)"
```

---

### Task 4: Display formatter

**Files:**
- Create: `packages/web/src/lib/workabilityFormat.ts`
- Create: `packages/web/src/lib/workabilityFormat.test.ts`

**Interfaces:**
- Consumes: `WorkabilityRange` from `@soap-calc/core`.
- Produces: `function formatWorkabilityRange(range: { minHours: number; maxHours: number }): string`

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/lib/workabilityFormat.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatWorkabilityRange } from './workabilityFormat';

describe('formatWorkabilityRange', () => {
  it('renders hours when maxHours < 48', () => {
    expect(formatWorkabilityRange({ minHours: 12, maxHours: 36 })).toBe('≈ 12–36 h');
  });
  it('renders days (rounded to 0.5) for the mid range, chosen from maxHours', () => {
    expect(formatWorkabilityRange({ minHours: 40, maxHours: 56 })).toBe('≈ 1.5–2.5 days');
  });
  it('renders weeks between 10 and 14 days', () => {
    // 240h/168 = 1.43 → 1.5; 300h/168 = 1.79 → 2.0
    expect(formatWorkabilityRange({ minHours: 240, maxHours: 300 })).toBe('≈ 1.5–2 weeks');
  });
  it('renders the open-ended ceiling at/over 14 days', () => {
    expect(formatWorkabilityRange({ minHours: 332, maxHours: 581 })).toBe('≈ 2+ weeks');
    expect(formatWorkabilityRange({ minHours: 300, maxHours: 336 })).toBe('≈ 2+ weeks');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @soap-calc/web -- workabilityFormat`
Expected: FAIL — cannot resolve `./workabilityFormat`.

- [ ] **Step 3: Write the implementation**

Create `packages/web/src/lib/workabilityFormat.ts`:

```ts
import type { WorkabilityRange } from '@soap-calc/core';

const CEILING_HOURS = 336; // 14 days — display ceiling only (see design doc)
const half = (x: number): number => Math.round(x * 2) / 2;

/** Unit-adaptive label chosen from maxHours; open-ended "2+ weeks" at/over the 14-day ceiling. */
export function formatWorkabilityRange(range: WorkabilityRange): string {
  const { minHours, maxHours } = range;
  if (maxHours >= CEILING_HOURS) return '≈ 2+ weeks';
  if (maxHours < 48) return `≈ ${Math.round(minHours)}–${Math.round(maxHours)} h`;
  if (maxHours < 240) return `≈ ${half(minHours / 24)}–${half(maxHours / 24)} days`;
  return `≈ ${half(minHours / 168)}–${half(maxHours / 168)} weeks`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @soap-calc/web -- workabilityFormat`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/workabilityFormat.ts packages/web/src/lib/workabilityFormat.test.ts
git commit -m "feat(web): add unit-adaptive workability range formatter"
```

---

### Task 5: Merge workability into `CureEstimate` + view model

**Files:**
- Modify: `packages/web/src/lib/cureEstimate.ts` (type field + optional param)
- Modify: `packages/web/src/lib/cureEstimate.test.ts` (workability param test)
- Modify: `packages/web/src/hooks/useRecipeViewModel.ts` (compute + merge + widen memo)

**Interfaces:**
- Consumes: `estimateCure`, `computeWorkability` (Task 3), `WorkabilityEstimate` from core.
- Produces: `CureEstimate.workability?: WorkabilityEstimate | null`, populated by the view model.

- [ ] **Step 1: Write the failing test**

Add to `packages/web/src/lib/cureEstimate.test.ts`:

```ts
import type { WorkabilityEstimate } from '@soap-calc/core';

it('includes a passed workability estimate; usableAtUnmold unchanged', () => {
  const wk = { unmold: { minHours: 12, maxHours: 36 } } as unknown as WorkabilityEstimate;
  const cpProfile = /* the CP profile fixture already used in this file */ getCpProfileFixture();
  const e = estimateCure(cpProfile, wk);
  expect(e.workability).toBe(wk);
  expect(e.usableAtUnmold).toBe(false); // CP still not usable at unmold (D5)
});

it('defaults workability to null when omitted', () => {
  const cpProfile = getCpProfileFixture();
  expect(estimateCure(cpProfile).workability ?? null).toBeNull();
});
```

Note: reuse whatever CP profile value the existing tests in this file already construct (replace `getCpProfileFixture()` with that existing expression). If the file builds profiles inline via `processProfileById('cp')` or similar, use the same call.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @soap-calc/web -- cureEstimate`
Expected: FAIL — `estimateCure` takes one argument / `workability` not on the type.

- [ ] **Step 3: Extend `cureEstimate.ts`**

In `packages/web/src/lib/cureEstimate.ts`:

1. Add the import:

```ts
import type { WorkabilityEstimate } from '@soap-calc/core';
```

2. Add the field to the `CureEstimate` type (after `finishingLabel: string;`):

```ts
  workability?: WorkabilityEstimate | null;
```

3. Grow `estimateCure` to accept and pass through the estimate:

```ts
export function estimateCure(
  profile: ProcessProfile,
  workability: WorkabilityEstimate | null = null,
): CureEstimate {
  return {
    minWeeks: profile.finish.minWeeks,
    maxWeeks: profile.finish.maxWeeks,
    usableAtUnmold: profile.process === 'hp',
    finishingLabel: PROCESS_DEFINITIONS[profile.process].terms.finishingLabel,
    workability,
  };
}
```

- [ ] **Step 4: Wire the view model**

In `packages/web/src/hooks/useRecipeViewModel.ts`:

1. Extend the `../lib/cureEstimate` import to also pull nothing new (still `estimateCure, labelWeightGrams`), and add:

```ts
import { computeWorkability } from '../lib/workabilityInput';
```

2. Replace the existing cure memo (currently line 319):

```ts
  const cureEstimate = useMemo(() => (profile ? estimateCure(profile) : null), [profile]);
```

with:

```ts
  const workability = useMemo(
    () =>
      computeWorkability({
        hardness: properties.properties?.hardness ?? null,
        coveragePercent: properties.coveragePercent,
        lyeConcentrationPercent: result?.lyeConcentrationPercent ?? null,
        superfatPercent: previewSettings.superfatPercent,
        process,
        gelMode: previewSettings.gelMode,
        additives: computedAdditives,
        totalOilGrams,
      }),
    [
      properties,
      result,
      previewSettings.superfatPercent,
      previewSettings.gelMode,
      computedAdditives,
      totalOilGrams,
      process,
    ],
  );
  const cureEstimate = useMemo(
    () => (profile ? { ...estimateCure(profile), workability } : null),
    [profile, workability],
  );
```

Note: `properties` here is the `RecipePropertiesResult` destructured at line 276 (`{ properties, indexes, fattyAcids } = useRecipeProperties(...)`), so `properties.properties?.hardness` and `properties.coveragePercent` are correct. `result` is the lye calc result (has `lyeConcentrationPercent`). All names are already in scope above this line.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace @soap-calc/web -- cureEstimate useRecipeViewModel`
Expected: PASS. Existing `cureEstimate.test.ts` `usableAtUnmold`/`toMatchObject` assertions remain green (D5).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/lib/cureEstimate.ts packages/web/src/lib/cureEstimate.test.ts packages/web/src/hooks/useRecipeViewModel.ts
git commit -m "feat(web): compute workability in the view model and merge into cureEstimate"
```

---

### Task 6: CP gel control in `CpExtrasPanel` + App wiring

**Files:**
- Modify: `packages/web/src/components/CpExtrasPanel.tsx` (props + control + reworded myth line)
- Modify: `packages/web/src/App.tsx` (pass `gelMode` + setter)
- Modify: `packages/web/src/components/CpExtrasPanel.test.tsx` (control behavior)

**Interfaces:**
- Consumes: `GelMode` from `@soap-calc/core`; `settings.gelMode` + `setSettings` from App.
- Produces: a rendered gel-phase selector that calls `onGelModeChange`.

- [ ] **Step 1: Write the failing test**

Add to `packages/web/src/components/CpExtrasPanel.test.tsx`:

```ts
import { fireEvent, render, screen } from '@testing-library/react';
import { CpExtrasPanel } from './CpExtrasPanel';

it('renders the three-state gel control and reports changes', () => {
  const onGelModeChange = vi.fn();
  render(<CpExtrasPanel totalOilGrams={500} gelMode="natural" onGelModeChange={onGelModeChange} />);
  const select = screen.getByLabelText(/gel phase/i) as HTMLSelectElement;
  expect(select.value).toBe('natural');
  fireEvent.change(select, { target: { value: 'forced' } });
  expect(onGelModeChange).toHaveBeenCalledWith('forced');
});

it('rewords the gel note to mention firming speed, not "optional"', () => {
  render(<CpExtrasPanel totalOilGrams={500} gelMode="natural" onGelModeChange={() => {}} />);
  expect(screen.queryByText(/gel phase is optional/i)).toBeNull();
  expect(screen.getByText(/how fast the bar firms/i)).toBeTruthy();
});
```

Ensure `vi` is imported/available (the file already uses Vitest globals or imports `vi`; match the file's existing style).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @soap-calc/web -- CpExtrasPanel`
Expected: FAIL — `gelMode`/`onGelModeChange` props don't exist; no gel-phase control.

- [ ] **Step 3: Update `CpExtrasPanel.tsx`**

1. Add the import at the top:

```ts
import type { GelMode } from '@soap-calc/core';
```

2. Extend the props type and signature:

```ts
type CpExtrasPanelProps = {
  /** Current recipe's total oil weight in grams, for the tsp→% converter. */
  totalOilGrams: number;
  gelMode: GelMode;
  onGelModeChange: (mode: GelMode) => void;
};

export function CpExtrasPanel({ totalOilGrams, gelMode, onGelModeChange }: CpExtrasPanelProps) {
```

3. Add the control near the top of the returned `<section>` (after the `panel__head` div):

```tsx
      <label className="field">
        <span>Gel phase</span>
        <select
          className="input"
          value={gelMode}
          onChange={(e) => onGelModeChange(e.target.value as GelMode)}
          aria-label="Gel phase"
        >
          <option value="none">None (prevented — e.g. refrigerated)</option>
          <option value="natural">Natural (uninsulated loaf)</option>
          <option value="forced">Forced (insulated / CPOP)</option>
        </select>
      </label>
      <p className="results-hint">
        Gel doesn&rsquo;t change safety, but it changes how fast the bar firms and unmolds —
        forcing it reaches the fast, same-day end; preventing it runs slower.
      </p>
```

4. Reword the myth line (`CpExtrasPanel.tsx:70`), replacing:

```tsx
        <li className="message-list__item--info">
          Myth: gel phase is optional — it changes look, not safety.
        </li>
```

with:

```tsx
        <li className="message-list__item--info">
          Myth: gel is just cosmetic — it changes look and how fast the bar firms, not safety.
        </li>
```

- [ ] **Step 4: Pass the props from `App.tsx`**

In `packages/web/src/App.tsx`, replace the CpExtrasPanel render (line 401):

```tsx
            {process === 'cp' && <CpExtrasPanel totalOilGrams={vm.totalOilGrams} />}
```

with:

```tsx
            {process === 'cp' && (
              <CpExtrasPanel
                totalOilGrams={vm.totalOilGrams}
                gelMode={settings.gelMode}
                onGelModeChange={(gelMode) => setSettings({ ...settings, gelMode })}
              />
            )}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace @soap-calc/web -- CpExtrasPanel`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/CpExtrasPanel.tsx packages/web/src/components/CpExtrasPanel.test.tsx packages/web/src/App.tsx
git commit -m "feat(web): add CP gel-phase control to CpExtrasPanel"
```

---

### Task 7: Render the workability block in `ResultsPanel`

**Files:**
- Modify: `packages/web/src/components/ResultsPanel.tsx` (render block near the cure estimate)
- Modify: `packages/web/src/components/ResultsPanel.test.tsx` (render assertions)

**Interfaces:**
- Consumes: `cureEstimate.workability` (Task 5), `formatWorkabilityRange` (Task 4).
- Produces: user-visible Unmold / Cut / Stamp rows, confidence chip, factors, caveats.

- [ ] **Step 1: Write the failing test**

Add to `packages/web/src/components/ResultsPanel.test.tsx` (reuse the file's existing `renderResultsPanel`/props helper; the key is passing a `cureEstimate` with a `workability`):

```ts
const workability = {
  unmold: { minHours: 12, maxHours: 36 },
  cut: { minHours: 16, maxHours: 40 },
  stamp: { opensMinHours: 40, opensMaxHours: 52 },
  confidence: 'moderate' as const,
  factors: ['Hard-oil score 47', 'Natural gel'],
  caveats: ['Test firmness on a loaf offcut before cutting or stamping the batch.'],
};

it('renders the workability timeline for CP', () => {
  renderResultsPanel({
    process: 'cp',
    cureEstimate: { minWeeks: 4, usableAtUnmold: false, finishingLabel: 'Cure', workability },
  });
  expect(screen.getByText(/Unmold/i)).toBeTruthy();
  expect(screen.getByText(/Cut/i)).toBeTruthy();
  expect(screen.getByText(/Stamp/i)).toBeTruthy();
  expect(screen.getByText('≈ 12–36 h')).toBeTruthy();
  expect(screen.getByText(/loaf offcut/i)).toBeTruthy();
});

it('omits the workability block when there is no estimate (e.g. LS)', () => {
  renderResultsPanel({
    process: 'ls',
    cureEstimate: { minWeeks: 4, usableAtUnmold: false, finishingLabel: 'Sequester', workability: null },
  });
  expect(screen.queryByText(/Unmold/i)).toBeNull();
});

it('shows the HP texture note and no stamp row', () => {
  renderResultsPanel({
    process: 'hp',
    cureEstimate: {
      minWeeks: 0, usableAtUnmold: true, finishingLabel: 'Cure',
      workability: { unmold: { minHours: 6, maxHours: 18 }, cut: { minHours: 6, maxHours: 18 }, stamp: null, confidence: 'moderate', factors: [], caveats: ['Hot-process bars are unmoldable soon after the cook firms; their rustic surface takes stamps unevenly, so stamp timing varies.'] },
    },
  });
  expect(screen.getByText(/Unmold/i)).toBeTruthy();
  expect(screen.queryByText(/Stamp from/i)).toBeNull();
  expect(screen.getByText(/rustic surface/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @soap-calc/web -- ResultsPanel`
Expected: FAIL — no workability UI rendered.

- [ ] **Step 3: Add the import and the render block**

In `packages/web/src/components/ResultsPanel.tsx`:

1. Add the import:

```ts
import { formatWorkabilityRange } from '../lib/workabilityFormat';
```

2. Immediately after the existing cure block (the `{cureEstimate && ( … )}` region ending near line 331), add a workability block:

```tsx
      {cureEstimate?.workability && (
        <section className="results-workability">
          <h3 className="results-workability__title">Workability</h3>
          <span className={`chip chip--${cureEstimate.workability.confidence}`}>
            {cureEstimate.workability.confidence} confidence
          </span>
          <dl className="results-workability__rows">
            <div>
              <dt>Unmold</dt>
              <dd>{formatWorkabilityRange(cureEstimate.workability.unmold)}</dd>
            </div>
            <div>
              <dt>Cut</dt>
              <dd>{formatWorkabilityRange(cureEstimate.workability.cut)}</dd>
            </div>
            {cureEstimate.workability.stamp && (
              <div>
                <dt>Stamp from</dt>
                <dd>
                  {formatWorkabilityRange({
                    minHours: cureEstimate.workability.stamp.opensMinHours,
                    maxHours: cureEstimate.workability.stamp.opensMaxHours,
                  })}
                </dd>
              </div>
            )}
          </dl>
          {cureEstimate.workability.factors.length > 0 && (
            <p className="results-hint">{cureEstimate.workability.factors.join(' · ')}</p>
          )}
          <ul className="message-list message-list--insights">
            {cureEstimate.workability.caveats.map((c) => (
              <li key={c} className="message-list__item--info">
                {c}
              </li>
            ))}
          </ul>
        </section>
      )}
```

Note: the block renders only when `cureEstimate.workability` is truthy, so LS (workability `null`) omits it entirely. HP omits the Stamp row (its `stamp` is `null`) and surfaces the texture note via its single caveat. No new CSS is required for correctness; the classes reuse existing panel/chip/message-list styles.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @soap-calc/web -- ResultsPanel`
Expected: PASS.

- [ ] **Step 5: Run the full web + core suites**

Run: `npm test --workspace @soap-calc/core && npm test --workspace @soap-calc/web`
Expected: PASS (no regressions).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/ResultsPanel.tsx packages/web/src/components/ResultsPanel.test.tsx
git commit -m "feat(web): render the workability timeline in ResultsPanel"
```

---

## Self-Review

**Spec coverage** (each spec section → task):
- Core estimator, gate order, bands, modulators, pipeline, floors/ceiling, HP/LS, factors/caveats → **Task 1**.
- `gelMode` `RecipeSettings` field + coercion + round-trip → **Task 2**.
- Additive `{catalogId,grams}` → `{id,dosePercent}` adapter + input assembly → **Task 3**.
- Unit-adaptive display + 2-week ceiling label → **Task 4**.
- `CureEstimate.workability` field (D5: `usableAtUnmold` untouched) + view-model wiring + widened `useMemo` deps → **Task 5**.
- CP gel control in the CP extras panel + reworded myth line + App wiring → **Task 6**.
- ResultsPanel timeline block (three rows, chip, factors, caveats; LS omit; HP texture note) → **Task 7**.

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The only reader substitution is `getCpProfileFixture()` in Task 5, explicitly flagged to reuse the existing CP-profile expression in that test file.

**Type consistency:** `GelMode`, `WorkabilityEstimate`, `WorkabilityRange`, `estimateWorkability`, `WORKABILITY_TUNING` (Task 1) are consumed with identical names/shapes in Tasks 2–7. `computeWorkability`/`additivesToDoses` (Task 3) match their call in Task 5. `formatWorkabilityRange` (Task 4) matches its use in Task 7. `estimateCure(profile, workability?)` (Task 5) matches the view-model call. `stamp` is `{ opensMinHours, opensMaxHours } | null` everywhere.

**Out-of-scope confirmed absent:** no mold-type/temperature input; no numeric stamp-close; no change to `usableAtUnmold`, cure-week, or label-weight math.
