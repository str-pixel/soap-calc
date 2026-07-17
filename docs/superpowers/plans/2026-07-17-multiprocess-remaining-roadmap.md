# Multi-Process Roadmap — Remaining Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This is a program plan, not a single-feature plan.** It sequences the ~16 remaining roadmap subsystems into dependency-ordered waves. Wave A (the keystone) is expanded to bite-sized TDD here. Each later task is scoped to hand-off (files, interfaces, verified constants, acceptance criteria); when you reach it, promote it to its own detailed plan file under `docs/superpowers/plans/` following the repo convention (one plan per feature, as with `pcsf-module.md`, `ls-dilution-calculator.md`) and using Wave A as the granularity exemplar. Tasks flagged **BRAINSTORM FIRST** must run `superpowers:brainstorming` before their plan is written — their model/content is not yet decided.

**Goal:** Finish the CP · HP · LS multi-process build by completing the shared foundation and layering the remaining per-process coaching, additive chemistry, and polish onto the existing lye/dilution/PCSF/neutralization engine.

**Architecture:** Pure math and data live in `@soap-calc/core` (`packages/core/src`); the Vite/React web app (`packages/web/src`) wires core to UI through `hooks/useRecipeViewModel.ts` and renders per-process panels gated by `process` in `App.tsx`. The single organizing seam is the process/defaults engine in `packages/web/src/lib/process.ts` — everything downstream (guardrails in `core/src/insights.ts`, panels, defaults) keys off it. New coaching is added as `FormulationInsight`s from `analyzeFormulation`; new calculators as pure core modules with a thin web wiring layer + panel.

**Tech Stack:** TypeScript (strict), React 18 + Vite, Vitest, npm workspaces (`packages/core`, `packages/web`). Tests colocated as `*.test.ts(x)`.

## Global Constraints

- **Anonymity rule (supersedes all copy):** numbers, ratios, and generic technique only. Never surface a title, author, publisher, purchaser, transaction id, recipe name, or paraphrased source prose. Cite *behavior* ("liquid-soap superfat above typical range"), never a source. See memory `soap-calc-multiprocess-initiative`.
- **Verify before asserting:** every numeric default/threshold added must come from the roadmap's Verified Constants table (reproduced per-task below) or be marked supplier-sourced. No invented numbers.
- **DO NOT SHIP (verified out of scope):**
  - Calculated "soap pH" and eutectic Krafft temperatures — unsound models. (The qualitative lauric+oleic lather hint already ships as `eutectic_lather_sources`.)
  - Preservative *percentages* (LS/HP) — references give none. Ship "verify with supplier" placeholders only.
  - LS per-product concentration *ranges* (dish/baby/hand) — use point examples, not broadened ranges.
  - The "0.25–0.50 oz colorant water" HP figure — fabricated, excluded. Real rule: small dispersion water isn't counted unless large.
- **Core stays pure:** no React/DOM imports in `packages/core`. Threshold insights gate on `LOW_COVERAGE_PERCENT` (80) where they read renormalized properties — follow the existing pattern in `insights.ts`.
- **TDD + frequent commits:** failing test → minimal impl → green → commit, per step.
- **Every process-conditional insight** must respect `isLiquidSoap` (KOH) gating the way existing LS insights do (`insights.ts:249-268`).

---

## Current-state baseline (already shipped — do not rebuild)

- Lye engine: NaOH / KOH / dual, 90% KOH purity — `packages/core/src/lye.ts`.
- Quality ranges + radar — `packages/core/src/properties.ts:49-56`, `packages/web/src/components/PropertyRadar.tsx`.
- After-cook additive stage (`after_cook`) — `packages/core/src/additives.ts:1,135-141`.
- Two-part superfat (cook + post-cook) — `packages/web/src/lib/recipe.ts:48-51`, `hooks/useRecipeViewModel.ts:121-141`.
- Additive dose units/basis (`percent`|`ppt`, `oil`|`batch`|`solution`) — `packages/core/src/additives.ts:109-133`.
- Dilution calculator (LS) — `packages/core/src/dilution.ts`.
- PCSF module (HP) + high-PUFA→DOS warning — `packages/web/src/lib/calculateAdditives.ts:85-95`, `insights.ts:240-247`.
- LS superfat guardrail + citric-acid neutralization — `insights.ts:249-268`, `packages/core/src/neutralization.ts`.
- Process selector (top-level CP/HP/LS only), defaults engine (superfat/water/lye only) — `packages/web/src/lib/process.ts`.
- Reverse mold sizer (volume→oil, rectangular, density 0.92) — `packages/core/src/mold-sizer.ts`.

---

## Wave overview & dependency order

| Wave | Task | Roadmap item | Blocks / depends |
|------|------|--------------|------------------|
| A | 1. Process/defaults engine extension (sub-variants, temps, durations, water bands) | 1, 5 | Unblocks 2,3,6,13,14 |
| B | 2. Two-tier water coaching bands (CP/HP) | 12 | reads Wave A |
| B | 3. Superfat + PUFA bands (CP) | 13 | independent |
| B | 4. Property-score exceptions layer | 10 | independent |
| B | 5. Trace-speed indicator (CP) | 9 | independent |
| B | 6. Process-aware cure estimate + water-loss | 11 | reads Wave A durations |
| C | 7. CP additive corrections + new additives | 18 | catalog |
| C | 8. Fluid-HP additive set | 14 | catalog + Wave A HP variant |
| C | 9. Additive hazard tags + sugar aggregator | 19 | after 7,8 |
| C | 10. Thickeners (LS) + salt curve — **BRAINSTORM FIRST** | 15 | catalog |
| C | 11. LS quality remap + dual-lye recommender — **BRAINSTORM FIRST** | 17 | properties/insights |
| C | 12. Preservative advisory panel (LS) | 16 | Wave A `preserve` panel key |
| D | 13. Yield outputs (cured weight, cylinder, LS bottles, HTHP guard) | 22 | reads Wave A durations |
| D | 14. Temperature model + cook stages — **BRAINSTORM FIRST (content)** | 21 | reads Wave A temps |
| D | 15. Troubleshooting panels (per process) — **BRAINSTORM FIRST (content)** | 20 | independent |
| D | 16. CP extras (tsp→% converter, vanillin/browning, antioxidants, myths) | 23 | independent |

---

# WAVE A — Foundation completion

## Task 1: Extend the process/defaults engine with sub-variants, temperatures, cure/sequester durations, and water bands

**Why first:** Items 6 (cure estimate), 12 (water coaching), 13 (yield), 14 (temperature model), and the sub-variant selector all read these numbers. Today `ProcessDefinition` carries only lye/superfat/water defaults and a finishing *label* string (`process.ts:10-19`) — no temps, no durations, no bands, no sub-variants.

**Files:**
- Modify: `packages/web/src/lib/process.ts` (extend `ProcessDefinition`, add sub-variant registry + accessors)
- Modify: `packages/web/src/lib/process.test.ts`
- Create: `packages/web/src/lib/processProfile.ts` (typed accessors: bands, temps, durations by process + variant)
- Create: `packages/web/src/lib/processProfile.test.ts`
- (Later tasks consume; no UI change required in this task beyond keeping `ProcessTabs` compiling.)

**Interfaces:**
- Consumes: existing `ProcessId`, `PROCESS_DEFINITIONS` (`process.ts:4,30`).
- Produces:
  ```ts
  export type ProcessVariantId =
    | 'cp'                                   // cold process (single)
    | 'hp-lthp' | 'hp-hthp' | 'hp-fluid'     // hot-process variants
    | 'ls-cpls' | 'ls-lowtemp' | 'ls-hightemp' | 'ls-30min'; // liquid-soap variants

  // Two-tier by design (roadmap item 12): a low tier and a high tier with a gap between,
  // plus the rivers threshold. A flat {low,high} cannot express the 28–32 gap or drive
  // Task 2's tiered coaching. Tiers are inclusive [min,max] % of oils.
  export type WaterBand = {
    lowTier: [number, number];   // e.g. [20, 28]
    highTier: [number, number];  // e.g. [32, 40]
    riversAbove: number;         // e.g. 38
  };
  export type TempTarget = { lowF: number; highF: number; ceilingF?: number };
  export type FinishDuration = { minWeeks: number; maxWeeks?: number }; // cure or sequester

  export type ProcessProfile = {
    variant: ProcessVariantId;
    process: ProcessId;
    label: string;
    waterBand: WaterBand;
    temp: TempTarget | null;      // null for CP (ambient) and CPLS
    finish: FinishDuration;
    finishKind: 'cure' | 'sequester';
    waterLossPercent: number;     // fraction lost over cure/sequester, for label weight
  };

  export function processProfilesFor(process: ProcessId): ProcessProfile[];
  export function processProfileById(variant: ProcessVariantId): ProcessProfile;
  export function defaultVariantFor(process: ProcessId): ProcessVariantId;
  ```

**Verified constants to encode (from roadmap Verified Constants table):**
- CP: water low 20–28% / high 32–40%, rivers >38%; cure 4 wk min; water loss ~15%.
- HP LTHP: temp 120–160 °F; water band 28–40%; water loss ~9%.
- HP HTHP: temp 215 °F (102 °C), ceiling 240 °F; cure 3–4 wk (≤30% water); water loss ~6%.
- HP fluid: 38% water ~6 wk cure.
- LS: cook water 25–60% (default 38%); soap concentration coconut ≤40% · castile ~25% · blends 25–35% (marked **Partial** — encode as point targets, not enforced ranges); superfat 1–3%; sequester 1–4 wk.
- Shared: quality ranges already live in `SOAP_PROPERTY_GUIDE` (`properties.ts:49-56`) — **do not duplicate, and do NOT "reconcile" the shipped guide to the roadmap's quoted numbers.** The roadmap table (H 30–60 · Cl 8–20 · …) is a *different* range convention from what ships (hardness 29–54, cleansing 12–22, longevity 14–43); the shipped values are what the radar and existing insights depend on. Treat any apparent discrepancy as intentional, not a bug to fix.

- [ ] **Step 1: Write the failing test for the variant registry**

```ts
// packages/web/src/lib/processProfile.test.ts
import { describe, expect, it } from 'vitest';
import { processProfilesFor, processProfileById, defaultVariantFor } from './processProfile';

describe('processProfilesFor', () => {
  it('returns three HP variants with the verified temperature targets', () => {
    const hp = processProfilesFor('hp');
    expect(hp.map((p) => p.variant)).toEqual(['hp-lthp', 'hp-hthp', 'hp-fluid']);
    expect(processProfileById('hp-lthp').temp).toEqual({ lowF: 120, highF: 160 });
    expect(processProfileById('hp-hthp').temp).toEqual({ lowF: 215, highF: 215, ceilingF: 240 });
  });

  it('encodes CP two-tier water band and cure minimum', () => {
    const cp = processProfileById('cp');
    expect(cp.waterBand).toEqual({ lowTier: [20, 28], highTier: [32, 40], riversAbove: 38 });
    expect(cp.finish).toEqual({ minWeeks: 4 });
    expect(cp.waterLossPercent).toBeCloseTo(0.15);
  });

  it('defaults HP to LTHP and LS to CPLS', () => {
    expect(defaultVariantFor('hp')).toBe('hp-lthp');
    expect(defaultVariantFor('ls')).toBe('ls-cpls');
    expect(defaultVariantFor('cp')).toBe('cp');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @soap-calc/web -- processProfile`
Expected: FAIL — `processProfile` module not found.

- [ ] **Step 3: Implement `processProfile.ts`**

```ts
// packages/web/src/lib/processProfile.ts
import type { ProcessId } from './process';

export type ProcessVariantId =
  | 'cp'
  | 'hp-lthp' | 'hp-hthp' | 'hp-fluid'
  | 'ls-cpls' | 'ls-lowtemp' | 'ls-hightemp' | 'ls-30min';

export type WaterBand = {
  lowTier: [number, number];
  highTier: [number, number];
  riversAbove: number;
};
export type TempTarget = { lowF: number; highF: number; ceilingF?: number };
export type FinishDuration = { minWeeks: number; maxWeeks?: number };

export type ProcessProfile = {
  variant: ProcessVariantId;
  process: ProcessId;
  label: string;
  waterBand: WaterBand;
  temp: TempTarget | null;
  finish: FinishDuration;
  finishKind: 'cure' | 'sequester';
  waterLossPercent: number;
};

const PROFILES: Record<ProcessVariantId, ProcessProfile> = {
  cp: { variant: 'cp', process: 'cp', label: 'Cold process',
    waterBand: { lowTier: [20, 28], highTier: [32, 40], riversAbove: 38 }, temp: null,
    finish: { minWeeks: 4 }, finishKind: 'cure', waterLossPercent: 0.15 },
  'hp-lthp': { variant: 'hp-lthp', process: 'hp', label: 'Low-temp HP (LTHP)',
    waterBand: { lowTier: [28, 32], highTier: [34, 40], riversAbove: 40 }, temp: { lowF: 120, highF: 160 },
    finish: { minWeeks: 3, maxWeeks: 8 }, finishKind: 'cure', waterLossPercent: 0.09 },
  'hp-hthp': { variant: 'hp-hthp', process: 'hp', label: 'High-temp HP (HTHP)',
    waterBand: { lowTier: [28, 32], highTier: [34, 40], riversAbove: 40 }, temp: { lowF: 215, highF: 215, ceilingF: 240 },
    finish: { minWeeks: 3, maxWeeks: 4 }, finishKind: 'cure', waterLossPercent: 0.06 },
  'hp-fluid': { variant: 'hp-fluid', process: 'hp', label: 'Fluid HP',
    waterBand: { lowTier: [28, 32], highTier: [34, 40], riversAbove: 40 }, temp: { lowF: 160, highF: 215 },
    finish: { minWeeks: 6 }, finishKind: 'cure', waterLossPercent: 0.09 },
  'ls-cpls': { variant: 'ls-cpls', process: 'ls', label: 'Cold-process LS (CPLS)',
    waterBand: { lowTier: [25, 38], highTier: [38, 60], riversAbove: 60 }, temp: null,
    finish: { minWeeks: 1, maxWeeks: 4 }, finishKind: 'sequester', waterLossPercent: 0 },
  'ls-lowtemp': { variant: 'ls-lowtemp', process: 'ls', label: 'Low-temp LS',
    waterBand: { lowTier: [25, 38], highTier: [38, 60], riversAbove: 60 }, temp: { lowF: 160, highF: 180 },
    finish: { minWeeks: 1, maxWeeks: 4 }, finishKind: 'sequester', waterLossPercent: 0 },
  'ls-hightemp': { variant: 'ls-hightemp', process: 'ls', label: 'High-temp LS',
    waterBand: { lowTier: [25, 38], highTier: [38, 60], riversAbove: 60 }, temp: { lowF: 180, highF: 215 },
    finish: { minWeeks: 1, maxWeeks: 4 }, finishKind: 'sequester', waterLossPercent: 0 },
  'ls-30min': { variant: 'ls-30min', process: 'ls', label: '30-minute LS',
    waterBand: { lowTier: [25, 38], highTier: [38, 60], riversAbove: 60 }, temp: { lowF: 180, highF: 215 },
    finish: { minWeeks: 1, maxWeeks: 4 }, finishKind: 'sequester', waterLossPercent: 0 },
};

const ORDER: Record<ProcessId, ProcessVariantId[]> = {
  cp: ['cp'],
  hp: ['hp-lthp', 'hp-hthp', 'hp-fluid'],
  ls: ['ls-cpls', 'ls-lowtemp', 'ls-hightemp', 'ls-30min'],
};

export function processProfilesFor(process: ProcessId): ProcessProfile[] {
  return ORDER[process].map((v) => PROFILES[v]);
}
export function processProfileById(variant: ProcessVariantId): ProcessProfile {
  return PROFILES[variant];
}
export function defaultVariantFor(process: ProcessId): ProcessVariantId {
  return ORDER[process][0];
}
```

> Note: Only CP's two-tier water band (20–28 / 32–40, rivers >38) and the LTHP 120–160 / HTHP 215/240 temps are verified constants. The HP water tiers ([28,32]/[34,40]), the LS water tiers ([25,38]/[38,60]), the LTHP/fluid/LS temperature ranges, and the LS sequester durations above are reasonable interpolations, NOT verified. Before this task's PR, re-verify them against the source or mark them `// unverified` in a comment, and do not surface them as hard defaults in user-facing copy.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @soap-calc/web -- processProfile`
Expected: PASS.

- [ ] **Step 5: Add `variant` to recipe settings, defaults, AND the (de)serialization layer**

`processVariant` is a persisted, importable setting, so it must round-trip through every layer that reads settings — not just the process-switch path:
1. Add `processVariant: ProcessVariantId` to `RecipeSettings` and to `DEFAULT_SETTINGS` (`packages/web/src/lib/recipe.ts:48-51,84-87`), defaulting to `'cp'`.
2. Give it a per-process default in `PROCESS_DEFINITIONS[*].defaultSettings` (`process.ts`) so `defaultsForProcess`/`coerceSettingsForProcess` set it on new recipes and process switches (`hooks/useRecipeStorage.ts:39,59,148`). `coerceSettingsForProcess` must also **reset `processVariant` to `defaultVariantFor(process)` when the current variant's `process` doesn't match the target** (e.g. switching HP→CP with `processVariant: 'hp-hthp'` must become `'cp'`).
3. Parse/normalize it for stored + imported recipes: `parseRecipeSettings.ts` enumerates each field, and `recipeFile.ts:221` deserializes via `normalizeSettings(parsed.settings)` — add `processVariant` there with a fallback to `defaultVariantFor(processForLyeType(lyeType))` when absent or invalid (an old saved recipe has no `processVariant`).
4. Guard `isProcessVariantId(value): value is ProcessVariantId` in `processProfile.ts` for the parse/normalize validation.

Tests: `recipe.test.ts` — a new HP recipe gets `processVariant: 'hp-lthp'`; switching to CP coerces `'hp-hthp'` → `'cp'`. `parseRecipeSettings.test.ts` / `recipeFile.test.ts` — a legacy settings object with **no** `processVariant` normalizes to the lye-inferred default (KOH → an LS variant, else `'cp'`), and an invalid variant string is rejected to that same default.

- [ ] **Step 6: Run affected suites**

Run: `npm test -w @soap-calc/web -- process recipe processProfile`
Expected: PASS.

- [ ] **Step 7: Add the sub-variant selector to `ProcessTabs`**

Render a secondary segmented control (variant chips) under the CP/HP/LS tabs when the active process has >1 variant (`processProfilesFor(process).length > 1`). Selecting a chip sets `settings.processVariant`. Update `ProcessTabs.test.tsx`: switching to HP shows three variant chips; selecting HTHP updates settings.

- [ ] **Step 8: Full typecheck + tests + build**

Run: `npm test && npm run build:web`
Expected: all PASS. (Root `npm test` already runs `typecheck` + `validate:oils` + every workspace's `vitest run` — see root `package.json`; there is no root `build` script, so build the web workspace explicitly.)

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/lib/processProfile.ts packages/web/src/lib/processProfile.test.ts \
  packages/web/src/lib/process.ts packages/web/src/lib/process.test.ts \
  packages/web/src/lib/recipe.ts packages/web/src/lib/recipe.test.ts \
  packages/web/src/lib/parseRecipeSettings.ts packages/web/src/lib/parseRecipeSettings.test.ts \
  packages/web/src/lib/recipeFile.ts packages/web/src/lib/recipeFile.test.ts \
  packages/web/src/hooks/useRecipeStorage.ts \
  packages/web/src/components/ProcessTabs.tsx packages/web/src/components/ProcessTabs.test.tsx
git commit -m "feat(web): add process sub-variants, temps, durations, and water bands to the defaults engine"
```

---

# WAVE B — Coaching & guardrails (core `insights.ts` + view-model wiring)

Each Wave B task adds `FormulationInsight`s from `analyzeFormulation` (`packages/core/src/insights.ts`) and/or a small readout. Pattern for every task: add fields to `FormulationAnalysisInput`, push a coded insight, gate on `isLiquidSoap`/coverage as appropriate, test in `insights.test.ts`, then thread the new input from `packages/web/src/hooks/useRecipeViewModel.ts`.

## Task 2: Two-tier water coaching bands (CP/HP) — roadmap item 12

**Files:** modify `packages/core/src/insights.ts` (+`.test.ts`); thread `waterBand` + `waterPercentOfOils` from `hooks/useRecipeViewModel.ts` using `processProfileById(settings.processVariant).waterBand`.
**Approach:** consume the two-tier `WaterBand` from Wave A (`{ lowTier, highTier, riversAbove }`). Emit: `water_band_rivers` (warn above `riversAbove` — "may glycerin-river"); `water_band_between_tiers` (info when water% falls in the gap between `lowTier[1]` and `highTier[0]` — "between the low-water and full-water tiers"); `water_band_below_low` (info below `lowTier[0]` — steep-water); nothing when water% sits within either tier. Only for CP/HP (`!isLiquidSoap`); LS is covered by the `DilutionPanel` soap-concentration hint — leave LS out.
**Verified constants:** CP lowTier 20–28 / highTier 32–40 / rivers >38 (from Wave A `waterBand` — reuse, do not re-hardcode). HP tiers are Wave A interpolations; keep copy behavior-only.
**Acceptance:** CP recipe at 42% water → `water_band_rivers` warning; at 30% (the 28–32 gap) → `water_band_between_tiers` info; at 25% (within low tier) and 35% (within high tier) → no water insight; at 18% → `water_band_below_low` info. Existing `lye_conc_*` warnings unchanged.

## Task 3: Superfat + PUFA bands (CP) — roadmap item 13

**Files:** modify `packages/core/src/insights.ts` (+`.test.ts`).
**Approach:** add `superfat_out_of_band` info when `superfatPercent` outside 3–30 (CP); add `pufa_cap_superfat` warning when recipe PUFA (linoleic+linolenic via `FATTY_ACID_GROUP_KEYS.polyunsaturated`) exceeds 15–20% *and* superfat is above 5% ("high-PUFA recipes: keep superfat 3–5%"). Distinct from existing `high_poly_high_superfat` (which is a shelf-life note at poly>28 & SF≥8) — this couples the PUFA cap to a superfat *ceiling*. Reconcile thresholds so the two don't double-fire redundantly (prefer folding into one insight if messages overlap).
**Verified constants:** SF 5% common, 3–30% usable; PUFA cap 15–20% → SF 3–5% (CP 161/191).
**Acceptance:** recipe with 22% linoleic+linolenic and 8% superfat → `pufa_cap_superfat` warning; 5% superfat, 10% PUFA → none.

## Task 4: Property-score exceptions layer — roadmap item 10

**Files:** modify `packages/core/src/insights.ts` (+`.test.ts`); possibly `packages/web/src/components/PropertiesPanel.tsx` for the softened copy.
**Approach:** suppress/soften two known false alarms — (a) castile-type recipes reading ~0 cleansing (very high oleic, low lauric/myristic): emit info `low_cleansing_expected` ("~0 cleansing is normal for olive-dominant bars — all soap cleans; this cures to a mild bar") instead of any harsh flag; (b) high-coconut + high-superfat should *not* read as drying — if cleansing high but superfat also high, downgrade `high_cleansing_low_superfat` (already gated at superfat<6, so verify it doesn't fire — add a test locking that in). Add an "All soap cleans" note to the cleansing bar tooltip.
**Verified constants:** none (qualitative). Anonymity: behavior-only copy.
**Acceptance:** 100% olive recipe → `low_cleansing_expected` info, no stripping warning; 60% coconut at 8% superfat → no `high_cleansing_low_superfat`.

## Task 5: Trace-speed indicator (CP) — roadmap item 9

**Files:** create `packages/core/src/trace-speed.ts` (+`.test.ts`); wire in `hooks/useRecipeViewModel.ts`; small readout in `PropertiesPanel.tsx` or a new inline chip.
**Approach:** pure function `estimateTraceSpeed({ fattyAcids, additiveEntries }): { score: number; label: 'slow'|'moderate'|'fast'; drivers: string[] }`. Accelerators: saturated % (palmitic+stearic+lauric+myristic), ricinoleic/castor, sugar/honey additives. Decelerators: high oleic/linoleic. Aggregate into a fast↔slow score with a one-line tip. Behavior-only copy.
**Verified constants:** none numeric (qualitative aggregation). Keep the model transparent and documented; **BRAINSTORM the exact weighting if it isn't obvious from a first pass.**
**Acceptance:** high-lard/butter recipe + sugar → `fast`; high-olive recipe → `slow`.

## Task 6: Process-aware cure estimate + water-loss — roadmap item 11

**Files:** create `packages/core/src/cure-estimate.ts` (+`.test.ts`); wire via `hooks/useRecipeViewModel.ts`; display in `ResultsPanel.tsx` and/or `MoldSizerPanel`.
**Approach:** `estimateCure(profile: ProcessProfile, waterPercentOfOils): { minWeeks, maxWeeks?, usableAtUnmold: boolean }` reading Wave A `finish` + `temp`. HP `usableAtUnmold = true`. `curedWeight(batchGrams, profile.waterLossPercent)` for label weight.
**Verified constants:** CP 4–6 wk; HTHP 3–4 vs CP 6–8 (same recipe ≤30% water); fluid HP 38% ~6 wk; water loss CP ~15% / LTHP ~9% / HTHP ~6% (HP 449).
**Acceptance:** CP profile → min 4 wk, not usable at unmold; HTHP → 3–4 wk, usable at unmold; `curedWeight(1000, 0.15) === 850`.

---

# WAVE C — Additive catalog & chemistry (`additives.ts` + `insights.ts`)

## Task 7: CP additive corrections + new additives — roadmap item 18

**Files:** modify `packages/core/src/additives.ts` (+`.test.ts`).
**Approach:** correct sugar entry `typicalLow/High` from 1–5 → 0.5–2 (`additives.ts:13-18`); split `sugar-sorbitol` into separate `sugar` and `sorbitol` entries; add catalog entries: `sodium-lactate` (1–3%, lye stage), `silk` (0.1–1%, lye), `edta` (0.1–0.5%, lye), `titanium-dioxide` (0.1–1%, oils), `eugenol` (1–3 ppt via ppt unit, trace), `loofah` (oils). Add clay minimum floor note (0.1%) and a magnesium-salt caution insight.
**Verified constants:** sugar 0.5–2% (max 4%); 4.1 g/tsp; 453.592 g/lb (CP 308).
**Acceptance:** catalog contains all six new ids with the specified ranges; sugar entry reads 0.5–2; existing `LATHER_SUPPORT_PACK` still resolves.

## Task 8: Fluid-HP additive set — roadmap item 14

**Files:** modify `packages/core/src/additives.ts` (+`.test.ts`) and `insights.ts` (+`.test.ts`); gate UI availability to HP (fluid) in `AdditivesPanel.tsx`.
**Approach:** add `stearic` and `lauric` "as oils" 5–8%, `sodium-lactate` 3–4% (reuse Task 7 entry), `salt` 0.05–1%, `yogurt` 2–5%, `sugar` 1–5%, `eugenol` 1–3 ppt. Add insight: salt/sodium-lactate suppress the thick middle phase (info); yogurt >5% deducts from water (warn + note it reduces lye water).
**Verified constants:** stearic 5–8% · SL 3–4% · yogurt 2–5% · eugenol 1–3 ppt (HP 346); relaxed HP caps castor 10–15% · shea 30–40% (HP 252) — encode as HP-only relaxed caps in the relevant guardrail.
**Acceptance:** HP-fluid recipe with yogurt 6% → water-deduction warning; salt present → thick-middle-phase info; HP castor at 12% → no over-cap warning (vs CP which would warn).

## Task 9: Additive hazard tags + sugar aggregator — roadmap item 19

**Files:** modify `packages/core/src/additives.ts` (add `hazards?: string[]` to `AdditiveCatalogEntry`, `additives.ts:3-9`) + `insights.ts` (+ both `.test.ts`).
**Approach:** tag entries: eugenol → seize; sugar/wax → tunnels/volcano; excess salt → crumble; TiO₂ + high water → rivers. Add a **sugar aggregator**: sum all sugar sources (sugar, sorbitol, honey, yogurt-sugar) against one ceiling (4% of oil) and warn once on the total rather than per-additive.
**Verified constants:** sugar ceiling max 4% (CP 308).
**Acceptance:** honey 2% + sugar 3% → single `sugar_total_high` warning (>4%); TiO₂ + 40% water → rivers hazard surfaced.

## Task 10: Thickeners (LS-only) + salt curve — roadmap item 15 — **BRAINSTORM FIRST**

**Why brainstorm:** the salt response is *non-monotonic* (thickens then thins; won't thicken coconut-heavy soap) — this needs a genuine non-linear model, not % of oil. Decide the model shape (piecewise/curve, inputs, coconut-share guard) in a brainstorming session before writing the plan.
**Files (anticipated):** create `packages/core/src/thickeners.ts` (+`.test.ts`); LS-only panel or section in `DilutionPanel`.
**Verified constants:** salt curve (non-linear) · guar 0.5–1% · HEC 0.5–1% (LS 447).

## Task 11: LS quality remap + dual-lye recommender — roadmap item 17 — **BRAINSTORM FIRST**

**Why brainstorm:** LS reinterprets the property model (cleansing = solubility, not harshness; castor gives no lather in LS). Decide whether to add an LS-specific `SOAP_PROPERTY_GUIDE` variant or a remap layer, and the dual-lye NaOH-share heuristic, before planning.
**Files (anticipated):** modify `packages/core/src/properties.ts` / new `ls-properties.ts`; `insights.ts` for the recommender.
**Verified constants:** dual-lye NaOH share — ≤15% P+S → 0–20% NaOH; >75% coconut → ~30% NaOH; LS dual-lye default 80/20 KOH/NaOH (LS 86).

## Task 12: Preservative advisory panel (LS) — roadmap item 16

**Files:** create `packages/web/src/components/PreservePanel.tsx` (+`.test.tsx`); render it in `App.tsx` where `process === 'ls'` (the `'preserve'` panel key already exists in `process.ts:8,74` but nothing renders it).
**Approach:** advisory-only. Explain diluted LS water activity ~0.98 (vs bar ~0.66–0.76 = self-preserving) needs a broad-spectrum, high-pH-stable preservative. **Ship "verify percentage with your supplier" placeholders only — NO percentages** (Global Constraint / DO NOT SHIP).
**Verified constants:** water activity bar 0.66–0.76 (safe) · diluted LS ~0.98 (needs preserve) (LS 465). No dose numbers.
**Acceptance:** panel renders only for LS; contains water-activity explanation; contains zero preservative percentages; links to no source.

---

# WAVE D — Guidance & polish

## Task 13: Yield outputs — roadmap item 22

**Files:** modify `packages/core/src/mold-sizer.ts` (+`.test.ts`) to add forward cured/label weight and cylinder volume (`πr²h`); create `packages/core/src/ls-yield.ts` for finished volume + bottle count; UI in `MoldSizerPanel.tsx` / a new yield section; HTHP vessel-size guard as an insight.
**Approach:** cured weight = batch × (1 − `profile.waterLossPercent`) (reuse Task 6). Cylinder mold volume `π r² h`. LS: finished solution volume → "bottles filled" given a bottle size input. HTHP vessel guard: warn if vessel < 2× batch volume (< 3× for coconut-heavy).
**Verified constants:** density 0.92; cylinder πr²h (CP 433/560); HTHP vessel ≥2× (≥3× coconut-heavy) (HP 332/449).
**Acceptance:** cylinder r=4cm h=10cm → ~502 cm³ → oil grams via density; LS 2000 g solution / 250 g bottles → 8 bottles; HTHP batch in 1.5× vessel → guard warning.

## Task 14: Temperature model + cook stages — roadmap item 21 — **BRAINSTORM FIRST (content)**

**Why brainstorm:** cook-stage sequence and copy are content-heavy and per-process; decide the stage list and presentation (timeline vs list) first.
**Files (anticipated):** create `packages/web/src/components/CookStagesPanel.tsx`; read temps from Wave A `processProfileById`.
**Verified constants:** LTHP 120–160 °F, HTHP 215 °F, ceiling 240 °F (HP 326); stages trace→applesauce→expansion→mashed→gel/neat; don't mix past neat / >5 min.
**Acceptance:** HP shows temp target + ordered cook stages; CP shows soaping-temp note only; LS shows temp per variant.

## Task 15: Troubleshooting panels (per process) — roadmap item 20 — **BRAINSTORM FIRST (content)**

**Files (anticipated):** create `packages/web/src/components/TroubleshootingPanel.tsx` + a core content module `packages/core/src/troubleshooting.ts` (data-only, behavior-cited).
**Content (behavior-only, no source):** CP: soda ash, gel, volcano, DOS. HP: won't-gel → switch to LTHP; crumbly (over-mix); lye-heavy (pH >11). LS: cloud-on-cooling, snot/jello, anhydrous top layer.
**Acceptance:** panel is process-gated; each entry is symptom → cause → fix; no source attribution.

## Task 16: CP extras — roadmap item 23

**Files:** create `packages/web/src/lib/doseConverters.ts` (+`.test.ts`) for tsp→%TOW and PPO→% (reuse `ppoOzToPercentOfOil` from `recipeFile.ts:44-78`, don't duplicate); a small converter UI; a vanillin field → browning-prediction note; antioxidant preset (Vit E, ROE, 1% BHT + 1% sodium citrate); a myth-busters info section.
**Verified constants:** 4.1 g/tsp; 453.592 g/lb (`weightUnits.ts:10`); anti-DOS 1% BHT + 1% sodium citrate (CP 163).
**Acceptance:** 1 tsp of a 100 g-oil batch → 4.1% ; vanillin >0 → browning note; antioxidant preset adds both additives at 1%.

---

## Self-Review

**Spec coverage:** All 12 not-found + 5 partial roadmap items map to a task — item 1→Task 1, 5→Task 1, 9→Task 5, 10→Task 4, 11→Task 6, 12→Task 2, 13→Task 3, 14→Task 8, 15→Task 10, 16→Task 12, 17→Task 11, 18→Task 7, 19→Task 9, 20→Task 15, 21→Task 14, 22→Task 13, 23→Task 16. The three already-done "core" items (dilution/PCSF/neutralization) and the six other shipped foundations are listed in the baseline as do-not-rebuild. ✅

**DO-NOT-SHIP guardrails:** Task 12 explicitly forbids preservative %s; the plan omits soap-pH/Krafft calculations entirely; LS concentration encoded as point targets (Task 1) not ranges; the fabricated colorant-water figure is nowhere. ✅

**Placeholder scan:** Wave A carries full test + impl code. Waves B–D are scoped-to-hand-off task specs with real files/interfaces/constants/acceptance — they are deliberately promoted to full TDD plans when reached (stated in the header), not shipped as-is. BRAINSTORM-FIRST tags mark the four items whose model/content must be decided before their plan exists. ✅

**Type consistency:** `ProcessVariantId`, `ProcessProfile`, `processProfileById`, `defaultVariantFor` are defined in Task 1 and referenced by Tasks 2, 6, 13, 14 with matching names. `waterLossPercent` (Task 1) is consumed by `curedWeight` (Task 6) and Task 13. ✅

**Unverified-number flag:** Task 1 Step 3's note marks all interpolated values (HP/LS water tiers, LTHP/fluid/LS temperature ranges, LS sequester durations) as requiring re-verification before PR, per the "verify before asserting" constraint; only CP water tiers and LTHP/HTHP temps are treated as verified. ✅

**Serialization coverage:** Task 1 Step 5 adds `processVariant` to `RecipeSettings`, `DEFAULT_SETTINGS`, the per-process defaults, `coerceSettingsForProcess` (with cross-process reset), and the parse/normalize layer (`parseRecipeSettings`, `recipeFile` via `normalizeSettings`), with legacy-recipe fallback tests — so no stored/imported recipe carries an undefined variant into `processProfileById`. ✅

**Command validity:** verification steps use `npm test` (root: typecheck + validate:oils + all `vitest run`) and `npm run build:web`; there is no root `build` script, and `vitest run <pattern>` path-filtering is confirmed valid. ✅
