# Cure Estimate (Two-Milestone Model) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed per-process cure window with a recipe-derived two-milestone estimate ("usable from" / "at its best" or "use within") computed from the recipe's fatty-acid profile.

**Architecture:** A pure, tunable model in `@soap-calc/core` (`cure.ts`, mirroring `workability.ts`: one exported `CURE_TUNING`, piecewise-linear knees, factors/caveats output), consumed by the existing web adapter `cureEstimate.ts`, wired through `useRecipeViewModel` into `ResultsPanel`. The fixed per-process window remains the fallback (LS sequester, unresolvable inputs).

**Tech Stack:** TypeScript, vitest, @testing-library/react, Playwright. npm workspaces (`@soap-calc/core`, `@soap-calc/web`).

**Spec:** `docs/superpowers/specs/2026-07-24-cure-estimate-design.md` — all constants below are copied from it verbatim.

## Global Constraints

- All copy is behavior-only: no brand names, book titles, or source attributions in user-facing strings or test source labels ("community consensus" phrasing only).
- CSS class names in `ResultsPanel` (`results-grid__item`, `message-list--insights`, `results-excluded`) are load-bearing for existing CSS and e2e — reuse them, never rename.
- The model returns `null` rather than guessing: LS process, non-finite lye concentration, `faCoverage <= 0`, or a null FA profile all fall back to today's fixed window.
- Invariant everywhere: the second milestone's `minWeeks >= usable.minWeeks`.
- Confidence is `'low'` at launch (calibration scaffolded, not validated).
- Commit after every task; branch is `feat/cure-estimate`.

---

### Task 1: Core cure model (`cure.ts`)

**Files:**
- Modify: `packages/core/src/workability.ts` (export the private `piecewise` helper)
- Create: `packages/core/src/cure.ts`
- Create: `packages/core/src/cure.test.ts`
- Modify: `packages/core/src/index.ts` (add export line)

**Interfaces:**
- Consumes: `FattyAcidProfile` (`Record<string, number>`) from `./properties.js`; `piecewise` from `./workability.js`.
- Produces (used by Tasks 2–5):
  - `estimateCureModel(input: CureModelInput): CureModelEstimate | null`
  - `CureModelInput = { fa: FattyAcidProfile; faCoverage: number; lyeConcentrationPercent: number; process: 'cp' | 'hp' | 'ls' }`
  - `CureModelEstimate = { usable: CureWeeksRange; second: CureWeeksRange & { kind: 'best' | 'useWithin' }; confidence: 'low' | 'moderate'; factors: string[]; caveats: string[] }`
  - `CureWeeksRange = { minWeeks: number; maxWeeks: number }`
  - `CURE_TUNING` (exported constant)

- [ ] **Step 1: Export `piecewise` from workability.ts**

In `packages/core/src/workability.ts`, change the line

```ts
/** Piecewise-linear through sorted knees; flat outside the first/last knee. */
function piecewise(x: number, knees: ReadonlyArray<readonly [number, number]>): number {
```

to

```ts
/** Piecewise-linear through sorted knees; flat outside the first/last knee. */
export function piecewise(x: number, knees: ReadonlyArray<readonly [number, number]>): number {
```

- [ ] **Step 2: Write the failing tests**

Create `packages/core/src/cure.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { estimateCureModel, CURE_TUNING, type CureModelInput } from './cure';

const OLIVE = { oleic: 69, stearic: 3, linoleic: 12, palmitic: 14, linolenic: 1 };
const COCONUT = { oleic: 8, lauric: 48, stearic: 3, linoleic: 2, myristic: 19, palmitic: 9 };
const SUNFLOWER = { oleic: 16, stearic: 4, linoleic: 70, palmitic: 7, linolenic: 1 };

const input = (over: Partial<CureModelInput>): CureModelInput => ({
  fa: OLIVE,
  faCoverage: 100,
  lyeConcentrationPercent: 33,
  process: 'cp',
  ...over,
});

describe('guards', () => {
  it('returns null for LS (sequester is not an oil-driven cure)', () => {
    expect(estimateCureModel(input({ process: 'ls' }))).toBeNull();
  });
  it('returns null for non-finite lye concentration', () => {
    expect(estimateCureModel(input({ lyeConcentrationPercent: Number.NaN }))).toBeNull();
  });
  it('returns null when FA coverage is zero', () => {
    expect(estimateCureModel(input({ faCoverage: 0 }))).toBeNull();
  });
  it('treats missing FA keys as 0 and still yields a finite floor estimate', () => {
    const e = estimateCureModel(input({ fa: {} }));
    expect(e).not.toBeNull();
    expect(e!.usable.minWeeks).toBe(CURE_TUNING.usableFloorWeeks);
    expect(Number.isFinite(e!.second.maxWeeks)).toBe(true);
  });
});

describe('milestones', () => {
  it('100% coconut hits the usable floor and best is clamped >= usable', () => {
    const e = estimateCureModel(input({ fa: COCONUT }))!;
    expect(e.usable.minWeeks).toBe(2); // floor
    expect(e.usable.maxWeeks).toBeCloseTo(3, 5);
    expect(e.second.kind).toBe('best');
    expect(e.second.minWeeks).toBeGreaterThanOrEqual(e.usable.minWeeks);
  });
  it('castile: usable ≈7.5 wk, best ≈24.8 wk (spec anchor values)', () => {
    const e = estimateCureModel(input({ fa: OLIVE }))!;
    expect(e.usable.minWeeks).toBeCloseTo(7.52, 1);
    expect(e.usable.maxWeeks).toBeCloseTo(11.28, 1);
    expect(e.second.kind).toBe('best');
    expect(e.second.minWeeks).toBeCloseTo(24.8, 1);
  });
  it('more water (lower lye concentration) lengthens usable-from only', () => {
    const wet = estimateCureModel(input({ lyeConcentrationPercent: 25 }))!;
    const dry = estimateCureModel(input({ lyeConcentrationPercent: 40 }))!;
    expect(wet.usable.minWeeks).toBeGreaterThan(dry.usable.minWeeks);
    expect(wet.second.minWeeks).toBeCloseTo(dry.second.minWeeks, 5);
  });
});

describe('PUFA rules', () => {
  it('PUFA in (15, 25] gets a DOS caveat but keeps the best milestone', () => {
    const e = estimateCureModel(input({ fa: { oleic: 50, linoleic: 20 } }))!;
    expect(e.second.kind).toBe('best');
    expect(e.caveats.join(' ')).toMatch(/rancid|DOS/i);
  });
  it('PUFA > 25 flips the second milestone to use-within (point window)', () => {
    const e = estimateCureModel(input({ fa: SUNFLOWER }))!;
    expect(e.second.kind).toBe('useWithin');
    expect(e.second.minWeeks).toBe(e.second.maxWeeks);
    expect(e.second.minWeeks).toBeCloseTo(13, 5);
    expect(e.caveats.join(' ')).toMatch(/use.*within/i);
  });
});

describe('confidence and coverage', () => {
  it('is low-confidence at launch', () => {
    expect(estimateCureModel(input({}))!.confidence).toBe('low');
  });
  it('low FA coverage adds a caveat naming the coverage percent', () => {
    const e = estimateCureModel(input({ faCoverage: 60 }))!;
    expect(e.caveats.join(' ')).toContain('60%');
  });
  it('full coverage adds no coverage caveat', () => {
    const e = estimateCureModel(input({ faCoverage: 100 }))!;
    expect(e.caveats.join(' ')).not.toMatch(/covers only/);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test --workspace @soap-calc/core -- cure.test`
Expected: FAIL — `Cannot find module './cure'` (or equivalent resolution error).

- [ ] **Step 4: Write the implementation**

Create `packages/core/src/cure.ts`:

```ts
import type { FattyAcidProfile } from './properties.js';
import { piecewise } from './workability.js';

export type CureMilestoneKind = 'best' | 'useWithin';
export type CureConfidence = 'low' | 'moderate';

export interface CureWeeksRange {
  minWeeks: number;
  maxWeeks: number;
}

export interface CureModelEstimate {
  /** Water-evaporation + early-hardness milestone — okay to start using the bar. */
  usable: CureWeeksRange;
  /** Maturation milestone: 'best' = keeps improving until here; 'useWithin' = high-PUFA
   * shelf window (DOS arrives before further cure gains — see spec). */
  second: CureWeeksRange & { kind: CureMilestoneKind };
  confidence: CureConfidence;
  factors: string[];
  caveats: string[];
}

export interface CureModelInput {
  fa: FattyAcidProfile;
  faCoverage: number;
  lyeConcentrationPercent: number;
  process: 'cp' | 'hp' | 'ls';
}

/**
 * Transparent, tunable heuristic — cure timing has no verified constant. Every value is a
 * deliberate, adjustable default (see the design doc's Model section). Knees were set so the
 * archetype anchors in cure-calibration.test.ts land on community-consensus windows.
 */
export const CURE_TUNING = {
  // PUFA counts toward the slow driver, discounted.
  linoleicWeight: 0.6,
  // slow driver -> usable-from min weeks.
  usableKnees: [[10, 2], [35, 3.8], [55, 5], [70, 6.5], [80, 8]] as ReadonlyArray<readonly [number, number]>,
  // lauric+myristic shortens usable-from (multiplier).
  fastCredit: [[0, 1.0], [30, 0.9], [55, 0.8]] as ReadonlyArray<readonly [number, number]>,
  // lye concentration % -> water factor. Applies to usable-from ONLY: evaporation is
  // water-driven; maturation isn't.
  lyeConc: [[25, 1.25], [33, 1.0], [40, 0.85]] as ReadonlyArray<readonly [number, number]>,
  usableFloorWeeks: 2,
  usableSpread: 1.5, // maxWeeks = minWeeks * spread
  // slow driver -> at-its-best min weeks.
  bestKnees: [[10, 4], [50, 8], [65, 13], [78, 26], [88, 40]] as ReadonlyArray<readonly [number, number]>,
  bestSpread: 1.6,
  // PUFA thresholds: caveat, then flip the second milestone to a use-within shelf window.
  pufaCaveatPercent: 15,
  pufaFlipPercent: 25,
  shelfKnees: [[25, 52], [40, 26], [70, 13]] as ReadonlyArray<readonly [number, number]>,
  lowCoveragePercent: 80,
};

// TOP RETUNE CANDIDATE: ricinoleic at full weight in the slow driver. Directionally right
// (castor soap is hygroscopic and rubbery-soft early) but the magnitude is a guess — revisit
// first when calibration batches disagree (see cure-calibration.test.ts protocol).

const DOS_CAVEAT =
  'High linoleic + linolenic content makes bars prone to rancid spots (DOS) — store cured bars cool, dark, and airy.';
const FLIP_CAVEAT =
  'Very high polyunsaturated content: rancidity tends to arrive before long-cure benefits — use these bars within the shown window instead of aging them longer.';

export function estimateCureModel(input: CureModelInput): CureModelEstimate | null {
  const T = CURE_TUNING;
  if (input.process === 'ls') return null;
  if (!Number.isFinite(input.lyeConcentrationPercent) || !Number.isFinite(input.faCoverage)) {
    return null;
  }
  if (input.faCoverage <= 0) return null;

  const fa = (k: string): number => (Number.isFinite(input.fa[k]) ? (input.fa[k] as number) : 0);
  const fast = fa('lauric') + fa('myristic');
  const pufa = fa('linoleic') + fa('linolenic');
  const slow = fa('oleic') + fa('ricinoleic') + T.linoleicWeight * pufa;

  const usableMin = Math.max(
    T.usableFloorWeeks,
    piecewise(slow, T.usableKnees) *
      piecewise(fast, T.fastCredit) *
      piecewise(input.lyeConcentrationPercent, T.lyeConc),
  );
  const usable: CureWeeksRange = { minWeeks: usableMin, maxWeeks: usableMin * T.usableSpread };

  // The second milestone can never precede usable-from (100% coconut actually hits this).
  const bestMin = Math.max(piecewise(slow, T.bestKnees), usableMin);
  let second: CureModelEstimate['second'] = {
    kind: 'best',
    minWeeks: bestMin,
    maxWeeks: bestMin * T.bestSpread,
  };

  const caveats: string[] = [];
  if (pufa > T.pufaFlipPercent) {
    const shelf = Math.max(piecewise(pufa, T.shelfKnees), usableMin);
    second = { kind: 'useWithin', minWeeks: shelf, maxWeeks: shelf };
    caveats.push(FLIP_CAVEAT);
  } else if (pufa > T.pufaCaveatPercent) {
    caveats.push(DOS_CAVEAT);
  }
  if (input.faCoverage < T.lowCoveragePercent) {
    caveats.push(
      `Fatty-acid data covers only ${Math.round(input.faCoverage)}% of these oils — the cure drivers are partly estimated.`,
    );
  }

  const factors = [
    `Slow FAs (oleic + ricinoleic + weighted PUFA) ${Math.round(slow)}%`,
    `Quick FAs (lauric + myristic) ${Math.round(fast)}%`,
    `${Math.round(input.lyeConcentrationPercent)}% lye concentration`,
  ];

  // 'low' at launch: the knees are literature-anchored but the calibration harness has no
  // real batches yet (same honest posture workability shipped with).
  return { usable, second, confidence: 'low', factors, caveats };
}
```

- [ ] **Step 5: Export from the package index**

In `packages/core/src/index.ts`, directly below the line `export * from './workability.js';`, add:

```ts
export * from './cure.js';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test --workspace @soap-calc/core -- cure.test`
Expected: PASS (all tests).

Run: `npm run typecheck --workspace @soap-calc/core`
Expected: clean exit.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/cure.ts packages/core/src/cure.test.ts packages/core/src/workability.ts packages/core/src/index.ts
git commit -m "feat(core): two-milestone cure model (usable-from / at-its-best) from FA drivers"
```

---

### Task 2: Anchor + calibration suite

**Files:**
- Create: `packages/core/src/cure-calibration.test.ts`

**Interfaces:**
- Consumes: `estimateCureModel`, `CureModelInput`, `FattyAcidProfile` from Task 1.
- Produces: nothing runtime — the retuning safety net. Retunes to `CURE_TUNING` must keep every anchor overlapping.

- [ ] **Step 1: Write the suite** (these pass immediately — they are anchors, not TDD reds; the failing-first check happened in Task 1)

Create `packages/core/src/cure-calibration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { estimateCureModel, type CureModelInput } from './cure';
import type { FattyAcidProfile } from './properties.js';

/**
 * Anchor calibration suite: runs the REAL estimator against cure windows drawn from
 * community consensus (de-branded). The assertion is deliberately weak — the predicted
 * usable window must OVERLAP the field window — because field data is anecdotal.
 *
 * ── CALIBRATION PROTOCOL (usable-from is home-measurable) ──
 * 1. Make a batch; note oils/%, lye concentration %, process.
 * 2. Weigh one bar every few days; record the week its weight plateaus (<1% change/week)
 *    AND it lathers/feels ready — that's the observed usable week.
 * 3. Add a row to REAL_BATCHES below.
 * 4. Run `npm test --workspace @soap-calc/core -- cure-calibration`.
 * 5. When ≥5 real batches disagree in a consistent direction, retune CURE_TUNING
 *    (usableKnees first, then lyeConc/fastCredit) until REAL_BATCHES and the anchors
 *    below still overlap. Never tune to one batch. The at-its-best side has no home
 *    measurement — retune bestKnees only from usable-side evidence ratios.
 */

// Canonical FA breakdowns (copied from the app's oils data).
const OILS = {
  coconut76: { oleic: 8, lauric: 48, stearic: 3, linoleic: 2, myristic: 19, palmitic: 9 },
  olive: { oleic: 69, stearic: 3, linoleic: 12, palmitic: 14, linolenic: 1 },
  palm: { oleic: 39, stearic: 5, linoleic: 10, myristic: 1, palmitic: 44 },
  lard: { oleic: 46, stearic: 13, linoleic: 6, myristic: 1, palmitic: 28 },
  tallow: { oleic: 36, lauric: 2, stearic: 22, linoleic: 3, myristic: 6, palmitic: 28, linolenic: 1 },
  sunflower: { oleic: 16, stearic: 4, linoleic: 70, palmitic: 7, linolenic: 1 },
  castor: { oleic: 4, linoleic: 4, ricinoleic: 90 },
} satisfies Record<string, FattyAcidProfile>;

function mix(parts: ReadonlyArray<readonly [FattyAcidProfile, number]>): FattyAcidProfile {
  const out: FattyAcidProfile = {};
  for (const [profile, pct] of parts) {
    for (const [acid, v] of Object.entries(profile)) {
      out[acid] = (out[acid] ?? 0) + (v * pct) / 100;
    }
  }
  return out;
}

const cp = (fa: FattyAcidProfile): CureModelInput => ({
  fa,
  faCoverage: 100,
  lyeConcentrationPercent: 33,
  process: 'cp',
});

type Anchor = {
  name: string;
  source: string;
  input: CureModelInput;
  /** Usable-from window per community consensus, weeks. */
  fieldWeeks: [number, number];
};

const ANCHORS: Anchor[] = [
  {
    name: '100% coconut',
    source: 'community consensus: usable ~2-3 weeks (hard + soluble early)',
    input: cp(OILS.coconut76),
    fieldWeeks: [2, 4],
  },
  {
    name: 'balanced trinity 40/30/30',
    source: 'community consensus: the standard 4-6 week cure',
    input: cp(mix([[OILS.olive, 40], [OILS.coconut76, 30], [OILS.palm, 30]])),
    fieldWeeks: [4, 6],
  },
  {
    name: 'castile (100% olive)',
    source: 'community consensus: usable ~6-12 weeks (and best after months)',
    input: cp(OILS.olive),
    fieldWeeks: [6, 12],
  },
  {
    name: 'bastile 70/20/10',
    source: 'community consensus: ~5-9 weeks',
    input: cp(mix([[OILS.olive, 70], [OILS.coconut76, 20], [OILS.castor, 10]])),
    fieldWeeks: [5, 9],
  },
  {
    name: '100% lard',
    source: 'community consensus: 4-6 weeks',
    input: cp(OILS.lard),
    fieldWeeks: [4, 7],
  },
  {
    name: '100% tallow',
    source: 'community consensus: 4-6 weeks',
    input: cp(OILS.tallow),
    fieldWeeks: [3.5, 6],
  },
];

const overlap = (a: [number, number], b: [number, number]): number =>
  Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));

/** Real batches recorded by the maker — the data that actually validates the model.
 * Same inputs plus the observed usable week. Empty until batches are logged. */
const REAL_BATCHES: Array<Anchor & { observedUsableWeeks: number }> = [];

describe('cure anchors (predicted usable window overlaps the field window)', () => {
  for (const a of ANCHORS) {
    it(a.name, () => {
      const e = estimateCureModel(a.input);
      expect(e).not.toBeNull();
      const predicted: [number, number] = [e!.usable.minWeeks, e!.usable.maxWeeks];
      expect(overlap(predicted, a.fieldWeeks), `${a.name}: predicted ${predicted} vs field ${a.fieldWeeks} (${a.source})`).toBeGreaterThan(0);
    });
  }

  it('castile: at-its-best window overlaps the months-scale consensus [24, 52] weeks', () => {
    const e = estimateCureModel(cp(OILS.olive))!;
    expect(e.second.kind).toBe('best');
    expect(overlap([e.second.minWeeks, e.second.maxWeeks], [24, 52])).toBeGreaterThan(0);
  });

  it('100% sunflower flips to use-within (high-PUFA shelf rule)', () => {
    const e = estimateCureModel(cp(OILS.sunflower))!;
    expect(e.second.kind).toBe('useWithin');
  });
});

describe('real batches (empty until logged — see protocol above)', () => {
  // House pattern (workability-calibration.test.ts): one `it` looping inside — vacuously
  // green while REAL_BATCHES is empty, a real inside-the-window assertion once rows exist.
  it('recorded real batches (if any) fall inside the predicted usable window', () => {
    for (const b of REAL_BATCHES) {
      const e = estimateCureModel(b.input)!;
      expect(
        b.observedUsableWeeks >= e.usable.minWeeks && b.observedUsableWeeks <= e.usable.maxWeeks,
        `${b.name}: observed ${b.observedUsableWeeks}wk vs predicted ${e.usable.minWeeks}–${e.usable.maxWeeks}wk`,
      ).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the suite**

Run: `npm test --workspace @soap-calc/core -- cure-calibration`
Expected: PASS — every anchor overlaps. If any anchor fails, the implementation drifted from the spec's knees: fix `cure.ts`, never the anchor.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/cure-calibration.test.ts
git commit -m "test(core): cure anchor suite + real-batch calibration harness"
```

---

### Task 3: Weeks/months formatter (`cureFormat.ts`)

**Files:**
- Create: `packages/web/src/lib/cureFormat.ts`
- Create: `packages/web/src/lib/cureFormat.test.ts`

**Interfaces:**
- Consumes: `CureWeeksRange` from `@soap-calc/core` (Task 1).
- Produces: `formatCureRange(range: CureWeeksRange): string` — used by Task 5's `ResultsPanel`.

- [ ] **Step 1: Write the failing tests**

Create `packages/web/src/lib/cureFormat.test.ts`:

```ts
import { expect, test } from 'vitest';
import { formatCureRange } from './cureFormat';

test('weeks-scale range renders in half-week precision', () => {
  expect(formatCureRange({ minWeeks: 4.21, maxWeeks: 6.32 })).toBe('≈ 4–6.5 weeks');
});

test('coconut floor window renders in whole weeks', () => {
  expect(formatCureRange({ minWeeks: 2, maxWeeks: 3 })).toBe('≈ 2–3 weeks');
});

test('months threshold: maxWeeks >= 13 switches the whole range to months', () => {
  // castile best: 24.8–39.7 wk ≈ 6–9 months (spec anchor)
  expect(formatCureRange({ minWeeks: 24.8, maxWeeks: 39.68 })).toBe('≈ 6–9 months');
});

test('a point window collapses to a single value', () => {
  expect(formatCureRange({ minWeeks: 13, maxWeeks: 13 })).toBe('≈ 3 months');
  expect(formatCureRange({ minWeeks: 4, maxWeeks: 4 })).toBe('≈ 4 weeks');
});

test('boundary: a range just crossing 13 weeks renders in months', () => {
  expect(formatCureRange({ minWeeks: 10, maxWeeks: 13 })).toBe('≈ 2–3 months');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace @soap-calc/web -- cureFormat`
Expected: FAIL — cannot resolve `./cureFormat`.

- [ ] **Step 3: Write the implementation**

Create `packages/web/src/lib/cureFormat.ts`:

```ts
import type { CureWeeksRange } from '@soap-calc/core';

// Average weeks per month; the display threshold (13 wk ≈ 3 months) is from the spec —
// weeks become unreadable at castile scale.
const WEEKS_PER_MONTH = 4.345;
const MONTHS_THRESHOLD_WEEKS = 13;
const half = (x: number): number => Math.round(x * 2) / 2;

/** "≈ 4–6.5 weeks" below the threshold, "≈ 6–9 months" at or above; equal endpoints collapse. */
export function formatCureRange(range: CureWeeksRange): string {
  if (range.maxWeeks >= MONTHS_THRESHOLD_WEEKS) {
    const lo = Math.round(range.minWeeks / WEEKS_PER_MONTH);
    const hi = Math.round(range.maxWeeks / WEEKS_PER_MONTH);
    return lo === hi ? `≈ ${lo} months` : `≈ ${lo}–${hi} months`;
  }
  const lo = half(range.minWeeks);
  const hi = half(range.maxWeeks);
  return lo === hi ? `≈ ${lo} weeks` : `≈ ${lo}–${hi} weeks`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @soap-calc/web -- cureFormat`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/cureFormat.ts packages/web/src/lib/cureFormat.test.ts
git commit -m "feat(web): cure range formatter — weeks below 13, months at castile scale"
```

---

### Task 4: Web adapter (`cureEstimate.ts` gains the model)

**Files:**
- Modify: `packages/web/src/lib/cureEstimate.ts`
- Modify: `packages/web/src/lib/cureEstimate.test.ts` (append tests; existing tests must keep passing unchanged)

**Interfaces:**
- Consumes: `estimateCureModel`, `CureModelEstimate`, `FattyAcidProfile` from `@soap-calc/core`; `ProcessId` from `./process`.
- Produces (used by Task 5):
  - `CureEstimate` gains optional `model?: CureModelEstimate | null`
  - `estimateCure(profile, workability?, model?)` — third optional param, backward compatible
  - `computeCureModel(args: { faProfile: FattyAcidProfile | null; coveragePercent: number; lyeConcentrationPercent: number | null | undefined; process: ProcessId }): CureModelEstimate | null`

- [ ] **Step 1: Write the failing tests**

The existing file uses `describe`/`it` with `processProfileById` fixtures — append this describe block to `packages/web/src/lib/cureEstimate.test.ts` and add `computeCureModel` to the existing import from `./cureEstimate`:

```ts
describe('computeCureModel', () => {
  const OLIVE = { oleic: 69, stearic: 3, linoleic: 12, palmitic: 14, linolenic: 1 };

  it('null FA profile -> null (fallback to the fixed window)', () => {
    expect(
      computeCureModel({ faProfile: null, coveragePercent: 100, lyeConcentrationPercent: 33, process: 'cp' }),
    ).toBeNull();
  });
  it('null lye concentration -> null (mid-edit recipes never show a bogus window)', () => {
    expect(
      computeCureModel({ faProfile: OLIVE, coveragePercent: 100, lyeConcentrationPercent: null, process: 'cp' }),
    ).toBeNull();
  });
  it('CP castile produces the two milestones', () => {
    const m = computeCureModel({ faProfile: OLIVE, coveragePercent: 100, lyeConcentrationPercent: 33, process: 'cp' });
    expect(m).not.toBeNull();
    expect(m!.usable.minWeeks).toBeGreaterThan(6);
    expect(m!.second.kind).toBe('best');
  });
  it('estimateCure threads the model through; fixed-window fields stay unchanged', () => {
    const cpProfile = processProfileById('cp');
    const model = computeCureModel({
      faProfile: OLIVE, coveragePercent: 100, lyeConcentrationPercent: 33, process: 'cp',
    });
    const e = estimateCure(cpProfile, null, model);
    expect(e.model).toBe(model);
    expect(e.minWeeks).toBe(cpProfile.finish.minWeeks); // fallback data still present
  });
  it('estimateCure defaults model to null when omitted (existing callers unaffected)', () => {
    expect(estimateCure(processProfileById('cp')).model ?? null).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace @soap-calc/web -- cureEstimate`
Expected: FAIL — `computeCureModel` is not exported.

- [ ] **Step 3: Implement the adapter changes**

In `packages/web/src/lib/cureEstimate.ts`:

Replace the imports and `CureEstimate`/`estimateCure` block with:

```ts
import {
  estimateCureModel,
  type CureModelEstimate,
  type FattyAcidProfile,
  type WorkabilityEstimate,
} from '@soap-calc/core';
import type { ProcessProfile } from './processProfile';
import { PROCESS_DEFINITIONS, type ProcessId } from './process';

export type CureEstimate = {
  minWeeks: number;
  maxWeeks?: number;
  usableAtUnmold: boolean;
  /** The profile's own process finishing label (Cure/Sequester) — single-sourced from the
   * same profile the cure window is derived from, so it can never disagree with a
   * transiently mismatched process prop. */
  finishingLabel: string;
  workability?: WorkabilityEstimate | null;
  /** Recipe-derived two-milestone model; null falls back to the fixed per-process window
   * above (LS sequester, mid-edit recipes, unresolvable FA data). */
  model?: CureModelEstimate | null;
};

/** Cure/sequester window for a process; hot process is usable straight from the mold. */
export function estimateCure(
  profile: ProcessProfile,
  workability: WorkabilityEstimate | null = null,
  model: CureModelEstimate | null = null,
): CureEstimate {
  return {
    minWeeks: profile.finish.minWeeks,
    maxWeeks: profile.finish.maxWeeks,
    usableAtUnmold: profile.process === 'hp',
    finishingLabel: PROCESS_DEFINITIONS[profile.process].terms.finishingLabel,
    workability,
    model,
  };
}

/** Build the core model input from view-model state (mirrors computeWorkability's role). */
export function computeCureModel(args: {
  faProfile: FattyAcidProfile | null;
  coveragePercent: number;
  lyeConcentrationPercent: number | null | undefined;
  process: ProcessId;
}): CureModelEstimate | null {
  if (!args.faProfile) return null;
  return estimateCureModel({
    fa: args.faProfile,
    faCoverage: args.coveragePercent,
    lyeConcentrationPercent: args.lyeConcentrationPercent ?? Number.NaN,
    process: args.process,
  });
}
```

Keep `labelWeightGrams` (and its comment block) exactly as it is.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @soap-calc/web -- cureEstimate`
Expected: PASS — new tests green, pre-existing tests untouched and green.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/cureEstimate.ts packages/web/src/lib/cureEstimate.test.ts
git commit -m "feat(web): cureEstimate adapter carries the recipe-derived cure model"
```

---

### Task 5: Wire the view model and render the milestones

**Files:**
- Modify: `packages/web/src/hooks/useRecipeViewModel.ts` (~lines 342–345)
- Modify: `packages/web/src/components/ResultsPanel.tsx` (cure grid rows + caveat list)
- Modify: `packages/web/src/components/ResultsPanel.test.tsx` (append tests)

**Interfaces:**
- Consumes: `computeCureModel`, `estimateCure` (Task 4); `formatCureRange` (Task 3); existing `fattyAcids.profile` / `properties.coveragePercent` / `result.lyeConcentrationPercent` in the view model.
- Produces: `cureEstimate.model` flows to `ResultsPanel`; rows "Usable from (est.)" and "At its best (est.)" / "Use within (est.)".

- [ ] **Step 1: Write the failing panel tests**

Append to `packages/web/src/components/ResultsPanel.test.tsx`:

```tsx
test('a recipe-derived cure model renders the two milestone rows instead of the fixed window', () => {
  const { result, displayTotals } = calculateRecipe(createStarterLines(), DEFAULT_SETTINGS);
  render(
    <ResultsPanel
      result={result}
      inputErrors={[]}
      lyeLabel="NaOH"
      process="cp"
      lyeType="naoh"
      displayTotals={displayTotals}
      weightUnit="g"
      batchWeightWithExtras={displayTotals?.batchWeightGrams ?? 0}
      cureEstimate={{
        minWeeks: 4,
        usableAtUnmold: false,
        finishingLabel: 'Cure',
        workability: null,
        model: {
          usable: { minWeeks: 4.2, maxWeeks: 6.3 },
          second: { kind: 'best', minWeeks: 8, maxWeeks: 12.8 },
          confidence: 'low',
          factors: [],
          caveats: ['Fatty-acid data covers only 60% of these oils — the cure drivers are partly estimated.'],
        },
      }}
    />,
  );
  expect(screen.getByText('Usable from (est.)')).toBeTruthy();
  expect(screen.getByText('At its best (est.)')).toBeTruthy();
  expect(screen.queryByText('Cure (est.)')).toBeNull();
  expect(screen.getByText(/covers only 60%/)).toBeTruthy();
});

test('a use-within model renders the shelf label, not "At its best"', () => {
  const { result, displayTotals } = calculateRecipe(createStarterLines(), DEFAULT_SETTINGS);
  render(
    <ResultsPanel
      result={result}
      inputErrors={[]}
      lyeLabel="NaOH"
      process="cp"
      lyeType="naoh"
      displayTotals={displayTotals}
      weightUnit="g"
      batchWeightWithExtras={displayTotals?.batchWeightGrams ?? 0}
      cureEstimate={{
        minWeeks: 4,
        usableAtUnmold: false,
        finishingLabel: 'Cure',
        workability: null,
        model: {
          usable: { minWeeks: 5.4, maxWeeks: 8 },
          second: { kind: 'useWithin', minWeeks: 13, maxWeeks: 13 },
          confidence: 'low',
          factors: [],
          caveats: [],
        },
      }}
    />,
  );
  expect(screen.getByText('Use within (est.)')).toBeTruthy();
  expect(screen.queryByText('At its best (est.)')).toBeNull();
});

test('a null model falls back to the fixed per-process window row', () => {
  const { result, displayTotals } = calculateRecipe(createStarterLines(), DEFAULT_SETTINGS);
  render(
    <ResultsPanel
      result={result}
      inputErrors={[]}
      lyeLabel="KOH"
      process="ls"
      lyeType="koh"
      displayTotals={displayTotals}
      weightUnit="g"
      batchWeightWithExtras={displayTotals?.batchWeightGrams ?? 0}
      cureEstimate={{
        minWeeks: 1,
        maxWeeks: 4,
        usableAtUnmold: false,
        finishingLabel: 'Sequester',
        workability: null,
        model: null,
      }}
    />,
  );
  expect(screen.getByText('Sequester (est.)')).toBeTruthy();
  expect(screen.queryByText('Usable from (est.)')).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace @soap-calc/web -- ResultsPanel`
Expected: FAIL — "Usable from (est.)" not found (panel doesn't render milestones yet).

- [ ] **Step 3: Render the milestones in ResultsPanel**

In `packages/web/src/components/ResultsPanel.tsx`:

(a) Add the import next to the existing `formatWorkabilityRange` import:

```tsx
import { formatCureRange } from '../lib/cureFormat';
```

(b) Replace the existing cure grid item

```tsx
          {cureEstimate && (
            <div className="results-grid__item">
              <dt>{finishingLabel} (est.)</dt>
              <dd>
                {cureWindowLabel(cureEstimate)}
                {cureEstimate.usableAtUnmold && (
                  <span className="results-excluded"> · usable at unmold</span>
                )}
              </dd>
            </div>
          )}
```

with

```tsx
          {cureEstimate && !cureEstimate.model && (
            <div className="results-grid__item">
              <dt>{finishingLabel} (est.)</dt>
              <dd>
                {cureWindowLabel(cureEstimate)}
                {cureEstimate.usableAtUnmold && (
                  <span className="results-excluded"> · usable at unmold</span>
                )}
              </dd>
            </div>
          )}
          {cureEstimate?.model && (
            <>
              <div className="results-grid__item">
                <dt>Usable from (est.)</dt>
                <dd>
                  {formatCureRange(cureEstimate.model.usable)}
                  {cureEstimate.usableAtUnmold && (
                    <span className="results-excluded"> · usable at unmold</span>
                  )}
                </dd>
              </div>
              <div className="results-grid__item">
                <dt>{cureEstimate.model.second.kind === 'useWithin' ? 'Use within' : 'At its best'} (est.)</dt>
                <dd>{formatCureRange(cureEstimate.model.second)}</dd>
              </div>
            </>
          )}
```

(c) Immediately after the `</dl>` that closes this results grid (the one containing the label-weight row), add the caveat list:

```tsx
      {cureEstimate?.model && cureEstimate.model.caveats.length > 0 && (
        <ul className="message-list message-list--insights" data-testid="cure-caveats">
          {cureEstimate.model.caveats.map((c) => (
            <li key={c} className="message-list__item--info">
              {c}
            </li>
          ))}
        </ul>
      )}
```

Note: place it OUTSIDE the `{... && (<dl ...>...</dl>)}` conditional but directly after it, at the same level as the workability section, so caveats show whenever the model exists.

- [ ] **Step 4: Wire the view model**

In `packages/web/src/hooks/useRecipeViewModel.ts`, update the import from `../lib/cureEstimate`:

```ts
import { computeCureModel, estimateCure, labelWeightGrams } from '../lib/cureEstimate';
```

Replace

```ts
  const cureEstimate = useMemo(
    () => (profile ? { ...estimateCure(profile), workability } : null),
    [profile, workability],
  );
```

with

```ts
  // Recipe-derived cure model (two milestones); null mid-edit or on LS, where the
  // fixed per-process window below is the fallback the panel renders.
  const cureModel = useMemo(
    () =>
      computeCureModel({
        faProfile: fattyAcids.profile,
        coveragePercent: properties.coveragePercent,
        lyeConcentrationPercent: result?.lyeConcentrationPercent ?? null,
        process,
      }),
    [fattyAcids, properties, result, process],
  );
  const cureEstimate = useMemo(
    () => (profile ? estimateCure(profile, workability, cureModel) : null),
    [profile, workability, cureModel],
  );
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace @soap-calc/web -- ResultsPanel`
Expected: PASS (new tests and all pre-existing panel tests).

Run: `npm run typecheck --workspace @soap-calc/web`
Expected: clean exit.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/ResultsPanel.tsx packages/web/src/components/ResultsPanel.test.tsx packages/web/src/hooks/useRecipeViewModel.ts
git commit -m "feat(web): render recipe-derived cure milestones (usable-from / at-its-best / use-within)"
```

---

### Task 6: E2E guard + full verification

**Files:**
- Create: `packages/web/e2e/cure.spec.ts`

**Interfaces:**
- Consumes: the rendered dt labels from Task 5 ("Usable from (est.)", "At its best (est.)", "Sequester (est.)"). The starter recipe is CP with moderate PUFA, so the second milestone reads "At its best".

- [ ] **Step 1: Write the e2e spec**

Create `packages/web/e2e/cure.spec.ts` (helpers mirror `workability.spec.ts`):

```ts
import { test, expect, type Page } from '@playwright/test';

/**
 * Browser guard for the recipe-derived cure milestones: CP shows the two-milestone rows;
 * LS falls back to the fixed sequester window (the model returns null for LS).
 */

const weightInputs = (page: Page) => page.locator('input[aria-label^="Weight in"]');
const processTab = (page: Page, name: RegExp) => page.getByRole('tab', { name });

async function freshRecipe(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await weightInputs(page).nth(0).fill('300');
  await weightInputs(page).nth(0).blur();
}

test('CP results show the two cure milestones instead of a fixed window', async ({ page }) => {
  await freshRecipe(page);
  await expect(page.getByText('Usable from (est.)')).toBeVisible();
  await expect(page.getByText(/At its best \(est\.\)|Use within \(est\.\)/)).toBeVisible();
  await expect(page.getByText('Cure (est.)', { exact: true })).toHaveCount(0);
});

test('LS falls back to the fixed sequester window (no oil-driven cure for liquid soap)', async ({ page }) => {
  await freshRecipe(page);
  await processTab(page, /Liquid soap/).click();
  await expect(page.getByText('Sequester (est.)')).toBeVisible();
  await expect(page.getByText('Usable from (est.)')).toHaveCount(0);
});
```

- [ ] **Step 2: Run the e2e spec**

Run: `npm run test:e2e --workspace @soap-calc/web -- cure.spec.ts`
Expected: PASS (Playwright starts the dev server per the project config).

- [ ] **Step 3: Full verification sweep**

```bash
npm test --workspace @soap-calc/core
npm test --workspace @soap-calc/web
npm run typecheck --workspace @soap-calc/core
npm run typecheck --workspace @soap-calc/web
npm run build --workspace @soap-calc/web
```

Expected: everything green. If any pre-existing workability e2e or unit test broke, the change leaked outside its seam — fix before committing.

- [ ] **Step 4: Commit**

```bash
git add packages/web/e2e/cure.spec.ts
git commit -m "test(web): e2e guard for cure milestones + LS sequester fallback"
```
