# Multi-Process Wave B — Coaching & Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> This is the full TDD promotion of **Wave B** from the program plan `docs/superpowers/plans/2026-07-17-multiprocess-remaining-roadmap.md`. Wave A (process/defaults engine: `processProfile.ts`, `processVariant` threading, variant selector) is merged to `main` (commit `8f1832a`) and in production — this plan builds directly on it. **Branch Wave B work from current `origin/main` (which contains Wave A), not from the stale local checkout.**

**Goal:** Add the process-aware coaching layer — five formulation signals (water-band tiers, superfat/PUFA caps, property-score exceptions, trace-speed, cure/water-loss) that read Wave A's profile data and the existing property/fatty-acid engine, surfaced as insights and small readouts.

**Architecture:** Pure math and thresholds live in `@soap-calc/core` (`packages/core/src`); it must NOT import from `packages/web`. Coaching is emitted by `analyzeFormulation` in `packages/core/src/insights.ts` as `FormulationInsight[]`. Web-side numbers Wave A produced (`ProcessProfile.waterBand`, `.finish`, `.waterLossPercent`) are resolved in `packages/web/src/hooks/useFormulationInsights.ts` and passed *into* `analyzeFormulation` as plain data, so core stays pure. Two new calculators (trace-speed, cure-estimate) are added: trace-speed is pure core; **cure-estimate lives in `packages/web` because it consumes Wave A's web-side `ProcessProfile`**.

**Tech Stack:** TypeScript (strict), React 18 + Vite, Vitest, npm workspaces. Tests colocated as `*.test.ts(x)`.

## Global Constraints

- **Anonymity (supersedes all copy):** numbers, ratios, and generic technique only. Never a source title, author, publisher, recipe name, or paraphrased prose. Cite *behavior* ("water above the typical range may glycerin-river"), never a source.
- **Verify before asserting:** every numeric threshold must come from the roadmap's Verified Constants (reproduced per-task) or Wave A's `processProfile.ts`. Wave A's HP/LS water tiers, LS temps, and LS durations are `// unverified` interpolations — coaching that reads them must use behavior-only copy and must not present them as authoritative. Trace-speed weights are an explicit heuristic (no verified constant exists) — see Task B4's Model Decision.
- **Core stays pure:** no React/DOM/`packages/web` imports in `packages/core`. Core learns Wave A's numbers only as plain data passed into `analyzeFormulation`.
- **Coverage gating:** threshold insights that read renormalized properties/fatty-acids gate on `LOW_COVERAGE_PERCENT` (80), following the existing pattern in `insights.ts` (`input.fattyAcidCoveragePercent ?? 100 >= LOW_COVERAGE_PERCENT`).
- **Process gating:** every CP/HP-only insight must be gated `!input.isLiquidSoap`; LS-only insights gated `input.isLiquidSoap`, exactly as the existing `ls_superfat_high` / `high_cleansing_low_superfat` insights do.
- **Wave A carry-forward:** (1) the live `settings.processVariant` is always coerced to match `process` (loadWorkspace/import coerce it), so reading the profile off it is safe — but pass `process` alongside and guard a mismatch defensively. (2) LS water tiers now have a real gap; water coaching is CP/HP-only so it never reads the LS band. (3) the `finishKind`↔`PROCESS_DEFINITIONS.finishing` drift test already exists.
- **TDD + frequent commits:** failing test → run red → minimal impl → run green → commit, per step.

## Commands

- Focused test: `npm test -w @soap-calc/core -- insights` or `npm test -w @soap-calc/web -- <fragment>` (`vitest run <pattern>` path-filters).
- Full gate before each commit: `npm test` (root: typecheck + validate:oils + all workspaces) and `npm run build:web`. **There is no root `build` script.**

---

## Current-state anchors (verified at origin/main 8f1832a)

- `analyzeFormulation(input: FormulationAnalysisInput): FormulationInsight[]` — `packages/core/src/insights.ts`. `FormulationInsight = { level: 'info' | 'warning'; code: string; message: string }`. Input already carries `superfatPercent`, `lyeConcentrationPercent`, `waterGrams`, `lyeGrams`, `totalOilGrams`, `fattyAcids`, `properties`, `fattyAcidCoveragePercent`, `propertyCoveragePercent`, `isLiquidSoap`, `waterMode`.
- Wiring: `useFormulationInsights(lines, settings, properties, fattyAcids, lyeResult, options)` — `packages/web/src/hooks/useFormulationInsights.ts` — builds the `analyzeFormulation({...})` object and holds the `useMemo` dep array. `settings.processVariant` and `settings.waterPercentOfOils` are available here.
- `FATTY_ACID_GROUP_KEYS` (`polyunsaturated: ['linoleic','linolenic']`, `lauricMyristic: ['lauric','myristic','caprylic','capric']`, `palmiticStearic: ['palmitic','stearic']`) and `sumFattyAcids(profile, keys)` — `packages/core/src/fatty-acids.ts`, re-exported from `@soap-calc/core`.
- `SOAP_PROPERTY_GUIDE` (cleansing `{low:12,high:22}`, longevity `{low:25,high:50}`, …) and `LOW_COVERAGE_PERCENT = 80` — `packages/core/src/properties.ts`.
- Wave A: `processProfileById(variant): ProcessProfile`, `ProcessProfile.waterBand: { lowTier:[number,number]; highTier:[number,number]; riversAbove:number }`, `.finish: { minWeeks:number; maxWeeks?:number }`, `.finishKind`, `.waterLossPercent`, `.process`, `.temp` — `packages/web/src/lib/processProfile.ts`.
- Insights render in `packages/web/src/components/FormulationInsightsPanel.tsx`; properties render in `packages/web/src/components/PropertiesPanel.tsx`; batch weight/results in `packages/web/src/components/ResultsPanel.tsx`.

## Task dependency & ordering

B1 → B2 → B3 all edit `packages/core/src/insights.ts`; run them in order to avoid churn on the same file. B4 (trace-speed) and B5 (cure-estimate) add new files and can run any time. Recommended order: B1, B2, B3, B4, B5.

---

## Task B1: Two-tier water coaching bands (CP/HP) — roadmap item 12

**Files:**
- Modify: `packages/core/src/insights.ts` (add `waterBand` to input; push water insights)
- Modify: `packages/core/src/insights.test.ts`
- Modify: `packages/web/src/hooks/useFormulationInsights.ts` (resolve the band from the profile, pass it in, add dep)
- (Consumes Wave A `processProfileById`; no UI file changes — insights render through the existing panel.)

**Interfaces:**
- Consumes: `processProfileById(settings.processVariant).waterBand` (Wave A), and the input's existing `waterGrams` / `totalOilGrams`.
- Produces: new optional input field on `FormulationAnalysisInput`:
  ```ts
  /** Two-tier water band (% of oils) for the recipe's process; CP/HP only. Absent for LS. */
  waterBand?: { lowTier: [number, number]; highTier: [number, number]; riversAbove: number };
  ```
  and insight codes `water_band_rivers` (warning), `water_band_between_tiers` (info), `water_band_below_low` (info).

**Verified constants:** CP band lowTier 20–28 / highTier 32–40 / rivers >38 (from Wave A `processProfileById('cp').waterBand`; the roadmap CP-238 constant). HP tiers are Wave A interpolations — copy stays behavior-only.

- [ ] **Step 1: Write the failing test (core)**

Add to `packages/core/src/insights.test.ts`:

```ts
import { analyzeFormulation } from './insights';

const CP_BAND = { lowTier: [20, 28] as [number, number], highTier: [32, 40] as [number, number], riversAbove: 38 };

function waterInput(waterGrams: number, totalOilGrams = 1000, extra = {}) {
  return {
    properties: null,
    fattyAcids: null,
    totalOilGrams,
    superfatPercent: 5,
    lyeConcentrationPercent: 0,
    waterLyeRatio: 0,
    waterGrams,
    lyeGrams: 140,
    isLiquidSoap: false,
    waterBand: CP_BAND,
    ...extra,
  };
}

describe('two-tier water coaching', () => {
  it('warns when water is above the rivers threshold', () => {
    // 42% of 1000 g oils = 420 g > 38% rivers
    const codes = analyzeFormulation(waterInput(420)).map((i) => i.code);
    expect(codes).toContain('water_band_rivers');
  });

  it('flags water sitting in the gap between the low and full-water tiers', () => {
    // 30% is between highTier[0]=32 ... no; 30 is between lowTier[1]=28 and highTier[0]=32
    const codes = analyzeFormulation(waterInput(300)).map((i) => i.code);
    expect(codes).toContain('water_band_between_tiers');
  });

  it('is quiet when water sits within the low tier (25%) or high tier (35%)', () => {
    expect(analyzeFormulation(waterInput(250)).map((i) => i.code)).not.toContain('water_band_between_tiers');
    expect(analyzeFormulation(waterInput(350)).map((i) => i.code)).not.toContain('water_band_between_tiers');
    expect(analyzeFormulation(waterInput(350)).map((i) => i.code)).not.toContain('water_band_rivers');
  });

  it('notes very low water below the low tier', () => {
    const codes = analyzeFormulation(waterInput(180)).map((i) => i.code); // 18% < 20
    expect(codes).toContain('water_band_below_low');
  });

  it('emits no water-band insight for liquid soap even if a band is supplied', () => {
    const codes = analyzeFormulation(waterInput(420, 1000, { isLiquidSoap: true })).map((i) => i.code);
    expect(codes).not.toContain('water_band_rivers');
  });
});
```

- [ ] **Step 2: Run red**

Run: `npm test -w @soap-calc/core -- insights`
Expected: FAIL — the four water-band codes are never produced.

- [ ] **Step 3: Implement (core)**

In `packages/core/src/insights.ts`, add to `FormulationAnalysisInput`:

```ts
  /** Two-tier water band (% of oils) for the recipe's process; CP/HP only. Absent for LS. */
  waterBand?: { lowTier: [number, number]; highTier: [number, number]; riversAbove: number };
```

Then, inside `analyzeFormulation`, after the existing lye-concentration block, add:

```ts
  if (
    input.waterBand &&
    !input.isLiquidSoap &&
    input.totalOilGrams > 0 &&
    input.waterGrams > 0
  ) {
    const waterPercentOfOils = (input.waterGrams / input.totalOilGrams) * 100;
    const { lowTier, highTier, riversAbove } = input.waterBand;
    if (waterPercentOfOils > riversAbove) {
      insights.push({
        level: 'warning',
        code: 'water_band_rivers',
        message:
          'Water is above the typical range for this process — the batter may glycerin-river or take a long time to firm up. Consider a lower water amount.',
      });
    } else if (waterPercentOfOils > lowTier[1] && waterPercentOfOils < highTier[0]) {
      insights.push({
        level: 'info',
        code: 'water_band_between_tiers',
        message:
          'Water sits between the low-water and full-water working ranges — fine, but nudging into either range gives more predictable trace and cure.',
      });
    } else if (waterPercentOfOils < lowTier[0]) {
      insights.push({
        level: 'info',
        code: 'water_band_below_low',
        message:
          'Very low water for this process — trace comes fast and the batter can be stiff; work quickly and keep temperatures modest.',
      });
    }
  }
```

- [ ] **Step 4: Run green (core)**

Run: `npm test -w @soap-calc/core -- insights`
Expected: PASS.

- [ ] **Step 5: Wire the band through the web hook**

In `packages/web/src/hooks/useFormulationInsights.ts`:
1. Add import: `import { processProfileById, isProcessVariantId } from '../lib/processProfile';`
2. Inside the `useMemo`, before the `analyzeFormulation({...})` call, resolve the band (guard the Wave-A carry-forward: only use a band whose process matches the recipe's process):
```ts
    const profile = isProcessVariantId(settings.processVariant)
      ? processProfileById(settings.processVariant)
      : null;
    const waterBand =
      profile && !options.isLiquidSoap && profile.process !== 'ls' ? profile.waterBand : undefined;
```
3. Add `waterBand,` to the `analyzeFormulation({...})` object.
4. Add `settings.processVariant,` and `options.isLiquidSoap` (already present) to the `useMemo` dependency array.

- [ ] **Step 6: Full gate + commit**

Run: `npm test && npm run build:web`
Expected: PASS.
```bash
git add packages/core/src/insights.ts packages/core/src/insights.test.ts packages/web/src/hooks/useFormulationInsights.ts
git commit -m "feat(core): two-tier water-band coaching for CP/HP recipes"
```

---

## Task B2: Superfat + PUFA cap bands (CP) — roadmap item 13

**Files:**
- Modify: `packages/core/src/insights.ts`
- Modify: `packages/core/src/insights.test.ts`

**Interfaces:**
- Consumes: existing input `superfatPercent`, `fattyAcids`, `fattyAcidCoveragePercent`, `isLiquidSoap`; `sumFattyAcids` + `FATTY_ACID_GROUP_KEYS.polyunsaturated` (already imported in `insights.ts`).
- Produces: insight codes `superfat_out_of_band` (info), `pufa_cap_superfat` (warning).

**Verified constants:** superfat 5% common, 3–30% usable; PUFA (linoleic+linolenic) cap 15–20% → keep superfat 3–5% (roadmap CP 161/191). Use PUFA threshold **18** (midpoint of 15–20) and superfat ceiling **5**.

**Reconcile with existing `high_poly_high_superfat`** (`insights.ts`, fires at `poly > 28 && superfatPercent >= 8`, a shelf-life note). `pufa_cap_superfat` is a *different* signal (PUFA cap coupled to a superfat ceiling, threshold 18/5). They can both legitimately fire on a very-high-PUFA + very-high-superfat recipe (one about shelf life, one about superfat sizing). Keep both, but assert in tests that a moderate case (PUFA 20, superfat 6) fires only `pufa_cap_superfat`, not `high_poly_high_superfat`.

- [ ] **Step 1: Write the failing test (core)**

```ts
describe('superfat + PUFA cap bands (CP)', () => {
  const base = {
    properties: null, totalOilGrams: 1000, lyeConcentrationPercent: 0,
    waterLyeRatio: 0, waterGrams: 330, lyeGrams: 140, isLiquidSoap: false,
    fattyAcidCoveragePercent: 100,
  };
  it('warns when PUFA is above the cap and superfat exceeds 5%', () => {
    const codes = analyzeFormulation({
      ...base, superfatPercent: 8,
      fattyAcids: { linoleic: 20, linolenic: 2, oleic: 40 },
    }).map((i) => i.code);
    expect(codes).toContain('pufa_cap_superfat');
  });
  it('does not fire the PUFA cap at a modest superfat even with high PUFA', () => {
    const codes = analyzeFormulation({
      ...base, superfatPercent: 4,
      fattyAcids: { linoleic: 20, linolenic: 2, oleic: 40 },
    }).map((i) => i.code);
    expect(codes).not.toContain('pufa_cap_superfat');
  });
  it('flags superfat outside the 3–30% usable band', () => {
    const low = analyzeFormulation({ ...base, superfatPercent: 1, fattyAcids: { oleic: 60 } }).map((i) => i.code);
    const high = analyzeFormulation({ ...base, superfatPercent: 35, fattyAcids: { oleic: 60 } }).map((i) => i.code);
    expect(low).toContain('superfat_out_of_band');
    expect(high).toContain('superfat_out_of_band');
  });
  it('is quiet on a normal 5% superfat within band', () => {
    const codes = analyzeFormulation({ ...base, superfatPercent: 5, fattyAcids: { oleic: 60 } }).map((i) => i.code);
    expect(codes).not.toContain('superfat_out_of_band');
  });
  it('does not fire either CP superfat band for liquid soap', () => {
    const codes = analyzeFormulation({
      ...base, isLiquidSoap: true, superfatPercent: 35, fattyAcids: { linoleic: 25, oleic: 40 },
    }).map((i) => i.code);
    expect(codes).not.toContain('superfat_out_of_band');
    expect(codes).not.toContain('pufa_cap_superfat');
  });
});
```

- [ ] **Step 2: Run red** — `npm test -w @soap-calc/core -- insights` → FAIL (codes absent).

- [ ] **Step 3: Implement (core)**

Inside `analyzeFormulation`, add a CP-only block (gate `!input.isLiquidSoap`):

```ts
  if (!input.isLiquidSoap) {
    if (input.superfatPercent < 3 || input.superfatPercent > 30) {
      insights.push({
        level: 'info',
        code: 'superfat_out_of_band',
        message:
          'Superfat is outside the usual 3–30% working range (about 5% is common) — intentional for some bars, but double-check it is deliberate.',
      });
    }
    if (
      input.fattyAcids &&
      (input.fattyAcidCoveragePercent ?? 100) >= LOW_COVERAGE_PERCENT
    ) {
      const poly = sumFattyAcids(input.fattyAcids, FATTY_ACID_GROUP_KEYS.polyunsaturated);
      if (poly > 18 && input.superfatPercent > 5) {
        insights.push({
          level: 'warning',
          code: 'pufa_cap_superfat',
          message:
            'High linoleic + linolenic oils with an elevated superfat — the unsaponified oil is prone to going rancid. For high-PUFA recipes keep superfat nearer 3–5%.',
        });
      }
    }
  }
```

- [ ] **Step 4: Run green** — `npm test -w @soap-calc/core -- insights` → PASS.

- [ ] **Step 5: Full gate + commit**
```bash
npm test && npm run build:web
git add packages/core/src/insights.ts packages/core/src/insights.test.ts
git commit -m "feat(core): superfat band + PUFA-cap coaching for CP recipes"
```

---

## Task B3: Property-score exceptions layer — roadmap item 10

**Files:**
- Modify: `packages/core/src/insights.ts`
- Modify: `packages/core/src/insights.test.ts`
- Modify: `packages/web/src/components/PropertiesPanel.tsx` (add an "All soap cleans" note near the cleansing bar)
- Modify: `packages/web/src/components/PropertiesPanel.test.tsx`

**Interfaces:**
- Consumes: input `properties`, `propertyCoveragePercent`, `fattyAcids`, `superfatPercent`, `isLiquidSoap`.
- Produces: insight code `low_cleansing_expected` (info). Also a regression test locking in that a high-coconut + high-superfat recipe does NOT fire `high_cleansing_low_superfat` (existing insight gated at `superfat < 6`).

**Verified constants:** none numeric (qualitative). `SOAP_PROPERTY_GUIDE.cleansing.low = 12`. Anonymity: behavior-only copy; the phrase "All soap cleans" is original UI copy, not a source.

- [ ] **Step 1: Write the failing test (core)**

```ts
describe('property-score exceptions', () => {
  const base = {
    fattyAcids: null, totalOilGrams: 1000, lyeConcentrationPercent: 0,
    waterLyeRatio: 0, waterGrams: 330, lyeGrams: 140, isLiquidSoap: false,
    propertyCoveragePercent: 100, fattyAcidCoveragePercent: 100,
  };
  const props = (over) => ({ bubbly: 10, cleansing: 0, condition: 65, hardness: 30, longevity: 30, creamy: 30, ...over });

  it('notes that near-zero cleansing is expected for an olive-dominant bar', () => {
    const codes = analyzeFormulation({
      ...base, superfatPercent: 5,
      properties: props({ cleansing: 2 }),
      fattyAcids: { oleic: 72 },
    }).map((i) => i.code);
    expect(codes).toContain('low_cleansing_expected');
  });

  it('does not flag a high-coconut bar as stripping when superfat is generous', () => {
    const codes = analyzeFormulation({
      ...base, superfatPercent: 8,
      properties: props({ cleansing: 30 }),
      fattyAcids: { lauric: 40, myristic: 15 },
    }).map((i) => i.code);
    expect(codes).not.toContain('high_cleansing_low_superfat');
  });

  it('suppresses the low-cleansing note for liquid soap (cleansing means solubility there)', () => {
    const codes = analyzeFormulation({
      ...base, isLiquidSoap: true, superfatPercent: 2,
      properties: props({ cleansing: 1 }),
      fattyAcids: { oleic: 72 },
    }).map((i) => i.code);
    expect(codes).not.toContain('low_cleansing_expected');
  });
});
```

- [ ] **Step 2: Run red** — FAIL (`low_cleansing_expected` absent; the high-coconut assertion may already pass — that's fine, it's a regression lock).

- [ ] **Step 3: Implement (core)**

Inside the existing `if (input.properties && coverage >= LOW_COVERAGE_PERCENT)` block in `analyzeFormulation` (the one that computes `cleansing`), add — gated `!input.isLiquidSoap`:

```ts
    // Castile / olive-dominant bars read near-zero cleansing but cure into fine, mild bars.
    // Surface it as reassurance, not a defect: all soap cleans.
    const oleic = input.fattyAcids?.oleic ?? 0;
    if (!input.isLiquidSoap && cleansing < 12 && oleic >= 50) {
      insights.push({
        level: 'info',
        code: 'low_cleansing_expected',
        message:
          'A near-zero cleansing score is normal for olive/high-oleic bars — all soap cleans; this cures into a gentle, low-stripping bar.',
      });
    }
```

(The existing `high_cleansing_low_superfat` already carries `superfat < 6 && !isLiquidSoap`, so the high-coconut+high-superfat test passes without change — the test locks that behavior in.)

- [ ] **Step 4: Run green (core)** — PASS.

- [ ] **Step 5: Add the "All soap cleans" tooltip note (web)**

In `packages/web/src/components/PropertiesPanel.tsx`, add a short muted note attached to the cleansing row (match the existing per-row tooltip/label pattern introduced by PR #48). Copy: `All soap cleans — a low cleansing score means gentler, not ineffective.` Add a test in `PropertiesPanel.test.tsx` asserting the note renders (query by text).

- [ ] **Step 6: Full gate + commit**
```bash
npm test && npm run build:web
git add packages/core/src/insights.ts packages/core/src/insights.test.ts packages/web/src/components/PropertiesPanel.tsx packages/web/src/components/PropertiesPanel.test.tsx
git commit -m "feat: property-score exceptions — castile low-cleansing note and 'all soap cleans'"
```

---

## Task B4: Trace-speed indicator (CP) — roadmap item 9

**Files:**
- Create: `packages/core/src/trace-speed.ts`
- Create: `packages/core/src/trace-speed.test.ts`
- Modify: `packages/core/src/index.ts` (export the new module)
- Modify: `packages/web/src/hooks/useFormulationInsights.ts` OR a small readout: surface the result. **Decision:** surface as an info insight (`trace_speed`) so it flows through the existing insights panel with zero new UI wiring — the hook computes it and pushes it via a new input field, OR compute inside `analyzeFormulation`. To keep the model pure and unit-tested in isolation, compute in `trace-speed.ts`, call it from the web hook, and pass a `traceSpeedLabel` string into `analyzeFormulation` which emits the insight. (Keeps core's insight text in one place, model in another.)

**Model Decision (the roadmap's BRAINSTORM-FIRST item — resolved here as a transparent, tunable heuristic):**
Trace speed has no verified constant; it is a qualitative aggregate. Use a transparent linear score so the behavior is inspectable and easy to retune:
- **Accelerators (raise score):** saturated short+long chain `sumFattyAcids(lauricMyristic) + sumFattyAcids(palmiticStearic)`; ricinoleic (`profile.ricinoleic`), which accelerates; sugar-family additives (sugar/honey/sorbitol/yogurt) present.
- **Decelerators (lower score):** oleic + polyunsaturated `oleic + sumFattyAcids(polyunsaturated)`.
- **Score:** `score = (saturated + ricinoleic*1.5 + sugarBoost) - (oleic + poly)`, where `sugarBoost = 15` if any accelerating additive is present else 0. (Weights are heuristic; documented in the module and adjustable. A brief brainstorm may retune them — they are not verified constants and ship behind behavior-only copy.)
- **Label:** `score > 15 → 'fast'`, `score < -15 → 'slow'`, else `'moderate'`. Return `{ score, label, drivers: string[] }` where `drivers` names the dominant contributors for the tip.
- CP-only (gate at the call site): trace speed is a CP/HP soaping concern; scope this task to CP per the roadmap. Do not compute for LS.

**Interfaces:**
- Produces:
  ```ts
  export type TraceSpeed = { score: number; label: 'slow' | 'moderate' | 'fast'; drivers: string[] };
  export function estimateTraceSpeed(args: {
    fattyAcids: FattyAcidProfile | null;
    hasAcceleratingAdditive: boolean;
  }): TraceSpeed | null; // null when fattyAcids is null (unknown)
  ```
- New optional `FormulationAnalysisInput` field `traceSpeedLabel?: 'slow' | 'moderate' | 'fast'` → emits info insight `trace_speed`.

- [ ] **Step 1: Write the failing test (core)**

`packages/core/src/trace-speed.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { estimateTraceSpeed } from './trace-speed';

describe('estimateTraceSpeed', () => {
  it('returns null when the fatty-acid profile is unknown', () => {
    expect(estimateTraceSpeed({ fattyAcids: null, hasAcceleratingAdditive: false })).toBeNull();
  });
  it('rates a hard, saturated, sugared recipe as fast', () => {
    const r = estimateTraceSpeed({
      fattyAcids: { palmitic: 30, stearic: 20, lauric: 20 },
      hasAcceleratingAdditive: true,
    });
    expect(r?.label).toBe('fast');
  });
  it('rates an olive-dominant recipe as slow', () => {
    const r = estimateTraceSpeed({
      fattyAcids: { oleic: 72, linoleic: 10 },
      hasAcceleratingAdditive: false,
    });
    expect(r?.label).toBe('slow');
  });
  it('rates a balanced recipe as moderate', () => {
    const r = estimateTraceSpeed({
      fattyAcids: { oleic: 35, palmitic: 20, stearic: 10, lauric: 15, linoleic: 10 },
      hasAcceleratingAdditive: false,
    });
    expect(r?.label).toBe('moderate');
  });
});
```

- [ ] **Step 2: Run red** — `npm test -w @soap-calc/core -- trace-speed` → FAIL (module missing).

- [ ] **Step 3: Implement `trace-speed.ts`**
```ts
import { FATTY_ACID_GROUP_KEYS, sumFattyAcids, type FattyAcidProfile } from './fatty-acids.js';

export type TraceSpeed = { score: number; label: 'slow' | 'moderate' | 'fast'; drivers: string[] };

/**
 * Transparent, tunable heuristic — trace speed has no verified constant. Accelerators
 * (saturated + long-chain acids, ricinoleic, sugar-family additives) push the score up;
 * oleic + polyunsaturated acids push it down. Thresholds ±15 split slow/moderate/fast.
 * Weights are deliberate and adjustable; the copy that surfaces this is behavior-only.
 */
export function estimateTraceSpeed(args: {
  fattyAcids: FattyAcidProfile | null;
  hasAcceleratingAdditive: boolean;
}): TraceSpeed | null {
  const fa = args.fattyAcids;
  if (!fa) return null;
  const saturated =
    sumFattyAcids(fa, FATTY_ACID_GROUP_KEYS.lauricMyristic) +
    sumFattyAcids(fa, FATTY_ACID_GROUP_KEYS.palmiticStearic);
  const ricinoleic = fa.ricinoleic ?? 0;
  const oleic = fa.oleic ?? 0;
  const poly = sumFattyAcids(fa, FATTY_ACID_GROUP_KEYS.polyunsaturated);
  const sugarBoost = args.hasAcceleratingAdditive ? 15 : 0;
  const score = saturated + ricinoleic * 1.5 + sugarBoost - (oleic + poly);
  const drivers: string[] = [];
  if (saturated > 30) drivers.push('high saturated fats');
  if (ricinoleic >= 5) drivers.push('castor / ricinoleic');
  if (sugarBoost) drivers.push('sugar additive');
  if (oleic + poly > 45) drivers.push('high soft (oleic/PUFA) oils');
  const label: TraceSpeed['label'] = score > 15 ? 'fast' : score < -15 ? 'slow' : 'moderate';
  return { score, label, drivers };
}
```
Export it from `packages/core/src/index.ts`.

- [ ] **Step 4: Run green** — `npm test -w @soap-calc/core -- trace-speed` → PASS.

- [ ] **Step 5: Emit the insight + wire from web**

Add to `FormulationAnalysisInput`: `traceSpeedLabel?: 'slow' | 'moderate' | 'fast';`. In `analyzeFormulation`, gated `!input.isLiquidSoap`:
```ts
  if (input.traceSpeedLabel) {
    const tip =
      input.traceSpeedLabel === 'fast'
        ? 'Expect a quick trace — soap cool, blend in short bursts, and add fragrance last.'
        : input.traceSpeedLabel === 'slow'
          ? 'Expect a slow trace — this batter stays fluid, giving time for swirls and intricate pours.'
          : 'A moderate trace — comfortable working time for most techniques.';
    insights.push({ level: 'info', code: 'trace_speed', message: `Predicted trace speed: ${input.traceSpeedLabel}. ${tip}` });
  }
```
In `useFormulationInsights.ts`: compute `hasAcceleratingAdditive` from the recipe's additive catalog ids (sugar/honey/sorbitol/yogurt — match on the additive `catalogId`/`name` the way existing additive insights use `additiveEntries`), call `estimateTraceSpeed({ fattyAcids: fattyAcids.profile, hasAcceleratingAdditive })`, and pass `traceSpeedLabel: options.isLiquidSoap ? undefined : traceSpeed?.label`. Add the needed deps.

Add a core test asserting the `trace_speed` insight text carries the label, and that it is suppressed when `isLiquidSoap`.

- [ ] **Step 6: Full gate + commit**
```bash
npm test && npm run build:web
git add packages/core/src/trace-speed.ts packages/core/src/trace-speed.test.ts packages/core/src/index.ts packages/core/src/insights.ts packages/core/src/insights.test.ts packages/web/src/hooks/useFormulationInsights.ts
git commit -m "feat: CP trace-speed indicator (transparent heuristic) surfaced as an insight"
```

---

## Task B5: Process-aware cure estimate + water-loss — roadmap item 11

**Files:**
- Create: `packages/web/src/lib/cureEstimate.ts` (web, not core — reads Wave A's `ProcessProfile`)
- Create: `packages/web/src/lib/cureEstimate.test.ts`
- Modify: `packages/web/src/components/ResultsPanel.tsx` (show cure window + label weight)
- Modify: `packages/web/src/components/ResultsPanel.test.tsx`
- Modify: `packages/web/src/hooks/useRecipeViewModel.ts` (compute and expose `cureEstimate` + `labelWeightGrams`)

**Interfaces:**
- Consumes: `processProfileById(settings.processVariant)` (`.finish`, `.waterLossPercent`, `.process`), and the batch weight already computed in the view model (`batchWeightWithExtras` / `baseBatchGrams`).
- Produces:
  ```ts
  import type { ProcessProfile } from './processProfile';
  export type CureEstimate = { minWeeks: number; maxWeeks?: number; usableAtUnmold: boolean };
  export function estimateCure(profile: ProcessProfile): CureEstimate; // usableAtUnmold = profile.process === 'hp'
  export function labelWeightGrams(batchGrams: number, waterLossPercent: number): number; // batch * (1 - loss)
  ```

**Verified constants:** CP cure ≥4 wk, water loss ~15%; HTHP 3–4 wk (usable at unmold), loss ~6%; LTHP loss ~9%; fluid HP ~6 wk (all from Wave A `processProfile.ts`). HP is usable at unmold. LS `waterLossPercent` is 0 (dilution, not evaporation) → label weight equals batch weight; still show the sequester window.

- [ ] **Step 1: Write the failing test (web)**
```ts
import { describe, expect, it } from 'vitest';
import { estimateCure, labelWeightGrams } from './cureEstimate';
import { processProfileById } from './processProfile';

describe('estimateCure', () => {
  it('CP cures at least 4 weeks and is not usable at unmold', () => {
    const e = estimateCure(processProfileById('cp'));
    expect(e.minWeeks).toBe(4);
    expect(e.usableAtUnmold).toBe(false);
  });
  it('HTHP is usable at unmold with a 3–4 week cure', () => {
    const e = estimateCure(processProfileById('hp-hthp'));
    expect(e).toMatchObject({ minWeeks: 3, maxWeeks: 4, usableAtUnmold: true });
  });
});

describe('labelWeightGrams', () => {
  it('applies the process water-loss fraction', () => {
    expect(labelWeightGrams(1000, 0.15)).toBeCloseTo(850);
    expect(labelWeightGrams(1000, 0)).toBe(1000);
  });
});
```

- [ ] **Step 2: Run red** — `npm test -w @soap-calc/web -- cureEstimate` → FAIL (module missing).

- [ ] **Step 3: Implement `cureEstimate.ts`**
```ts
import type { ProcessProfile } from './processProfile';

export type CureEstimate = { minWeeks: number; maxWeeks?: number; usableAtUnmold: boolean };

/** Cure/sequester window for a process; hot process is usable straight from the mold. */
export function estimateCure(profile: ProcessProfile): CureEstimate {
  return {
    minWeeks: profile.finish.minWeeks,
    maxWeeks: profile.finish.maxWeeks,
    usableAtUnmold: profile.process === 'hp',
  };
}

/** Cured / label weight after water evaporates over cure (loss is 0 for liquid soap). */
export function labelWeightGrams(batchGrams: number, waterLossPercent: number): number {
  return batchGrams * (1 - waterLossPercent);
}
```

- [ ] **Step 4: Run green** — PASS.

- [ ] **Step 5: Expose from the view model + display**

In `useRecipeViewModel.ts`: resolve `profile = isProcessVariantId(settings.processVariant) ? processProfileById(settings.processVariant) : null`, compute `cureEstimate = profile ? estimateCure(profile) : null` and `labelWeight = profile ? labelWeightGrams(batchWeightWithExtras, profile.waterLossPercent) : null`; add both to the returned view model.
In `ResultsPanel.tsx`: render a short line — the cure/sequester window (e.g. "Cure 4+ weeks" / "Sequester 1–4 weeks"), an "usable at unmold" note for HP, and the label weight when it differs from batch weight (loss > 0), using the existing weight-format helper + `finishingLabel` term. Behavior-only copy, no source. Add a `ResultsPanel.test.tsx` case (HP shows usable-at-unmold; CP shows a ≥4 wk cure and a reduced label weight).

- [ ] **Step 6: Full gate + commit**
```bash
npm test && npm run build:web
git add packages/web/src/lib/cureEstimate.ts packages/web/src/lib/cureEstimate.test.ts packages/web/src/hooks/useRecipeViewModel.ts packages/web/src/components/ResultsPanel.tsx packages/web/src/components/ResultsPanel.test.tsx
git commit -m "feat(web): process-aware cure/sequester estimate and cured label weight"
```

---

## Self-Review

**Spec coverage:** Wave B's five roadmap items each map to a task — item 12→B1, 13→B2, 10→B3, 9→B4, 11→B5. ✅

**Purity:** B1/B2/B3/B4 keep thresholds and insight text in core; web-only Wave A numbers (`waterBand`) and the trace-speed label are passed *into* `analyzeFormulation` as plain data. B5's `cureEstimate` lives in web precisely because it consumes the web-side `ProcessProfile` — a correction to the program plan, which had guessed `packages/core`. No `packages/web` import appears in any core file. ✅

**Gating:** every CP/HP insight is gated `!input.isLiquidSoap` and, where it reads renormalized properties/fatty-acids, `>= LOW_COVERAGE_PERCENT`; tests assert the LS-suppression path for B1, B2, B3, B4. ✅

**Wave A carry-forward:** B1 and B5 read the profile via `isProcessVariantId(settings.processVariant)` and guard the process match (carry-forward #1); water coaching is CP/HP-only so it never touches the LS band (#2); the finishKind drift test already exists (#3). ✅

**Verified vs heuristic:** B1's CP band and B5's durations/water-loss come verbatim from Wave A's verified `processProfile` values; B2's PUFA/superfat thresholds cite roadmap CP 161/191; B4's trace-speed weights are explicitly documented as a tunable heuristic (no verified constant exists) shipped behind behavior-only copy — flagged for optional brainstorm retuning, not presented as authoritative. ✅

**Placeholder scan:** every code step carries complete test + implementation code; no "TODO"/"similar to"/"add validation" placeholders. ✅

**Type consistency:** `TraceSpeed`/`estimateTraceSpeed` (B4), `CureEstimate`/`estimateCure`/`labelWeightGrams` (B5), and the new `FormulationAnalysisInput` fields (`waterBand`, `traceSpeedLabel`) are defined once and referenced with matching names/shapes across tasks and wiring. ✅
