# Multi-Process Wave D — Guidance & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Full TDD promotion of **Wave D** (the final wave) from the program plan `docs/superpowers/plans/2026-07-17-multiprocess-remaining-roadmap.md`. Waves A + B + C are merged to `main` (tip `2d3da2b`) and in production. **Branch Wave D from current `origin/main`, not the stale local checkout.** The two content-heavy tasks (D2 process guide, D3 troubleshooting) were brainstormed 2026-07-18 and their decisions are embedded below (see Design Decisions).

**Goal:** Ship the guidance/polish layer — yield outputs (cylinder molds, LS bottle count, HTHP vessel guard), a per-process temperature + cook-stage guide, per-process troubleshooting panels, and CP extras (dose converters, browning/antioxidant/myth-buster notes).

**Architecture:** Pure data/thresholds live in `@soap-calc/core` (`packages/core/src`) — mold/yield math, the troubleshooting content module, and any new insight thresholds. Core must NOT import from `packages/web`. New UI is presentational panels in `packages/web/src/components`, gated by `process` in `App.tsx`, reading Wave A's `processProfile` where relevant. Web-side numbers pass into core as plain data.

**Tech Stack:** TypeScript (strict), React 18 + Vite, Vitest, npm workspaces. Tests colocated as `*.test.ts(x)`.

## Global Constraints

- **Anonymity (supersedes all copy):** numbers, ratios, and generic technique only — never a source title, author, publisher, recipe name, or paraphrased prose. Cite *behavior*, never a source.
- **Verify before asserting:** every numeric default/threshold comes from the roadmap's Verified Constants (reproduced per-task) or Wave A's `processProfile`, or is hedged as an estimate. Wave A's fluid-HP and per-variant LS temps are `// unverified` — D2 must hedge them (Wave B precedent: "≈", "est."), never present them as authoritative. Verified temps: LTHP 120–160 °F, HTHP 215 °F / 240 °F ceiling.
- **Core stays pure:** no React/DOM/`packages/web` imports in `packages/core`.
- **Do not duplicate shipped work:** cured/label weight already ships (Wave B `cureEstimate.labelWeightGrams`, shown in `ResultsPanel`); cure/sequester window already ships (Wave B `estimateCure`). D1 adds only cylinder molds, LS bottle count, and the HTHP vessel guard. The reverse mold sizer (`rectangularMoldVolumeCm3`, `oilGramsFromMoldVolumeCm3`, density 0.92) already exists in `mold-sizer.ts`.
- **Process/coverage gating:** LS-only surfaces gate `process === 'ls'`; HP-only gate `process === 'hp'` (never `!isLiquidSoap`); insights reading renormalized fatty-acids gate coverage ≥ `LOW_COVERAGE_PERCENT` (80).
- **TDD + frequent commits:** failing test → run red → minimal impl → run green → commit, per step.

## Design Decisions (brainstormed 2026-07-18)

- **D2 = a read-only per-process "Process guide" panel that hedges unverified temps.** HP: its temp target (from `processProfileById`) + the ordered cook-stage sequence (trace → applesauce → expansion → mashed → gel/neat) + the "don't over-mix past neat / >5 min" caution. CP: a brief soaping-temp note. LS: the variant temp. Verified temps (LTHP 120–160, HTHP 215/240) render firm; unverified ones (fluid HP, per-variant LS) render hedged ("≈"). No reactive computation — it reads the active variant's profile.
- **D3 = a core troubleshooting-content data module + a per-process collapsible panel.** `TROUBLESHOOTING: Record<process, {symptom, cause, fix}[]>` (behavior-only copy) in core; a `TroubleshootingPanel` renders the active process's entries as a collapsible list. Distinct from the reactive insights engine — this is a static reference. CP: soda ash, gel, volcano, DOS. HP: won't-gel → switch to LTHP, crumbly (over-mixed), lye-heavy (pH > 11). LS: cloud-on-cooling, snot/jello, anhydrous top layer.

## Current-state anchors (verified at origin/main 2d3da2b)

- `mold-sizer.ts`: `SOAP_FILL_DENSITY_G_PER_CM3 = 0.92`, `rectangularMoldVolumeCm3(...)`, `oilGramsFromMoldVolumeCm3(volumeCm3, {fillDensityGPerCm3?})`. No cylinder helper yet.
- Wave B (already shipped, do not touch): `cureEstimate.ts` (`estimateCure`, `labelWeightGrams`, `CureEstimate`), surfaced in `ResultsPanel`; `useRecipeViewModel` exposes `cureEstimate`/`labelWeight`.
- Wave A: `processProfileById(variant)` → `{ temp: {lowF,highF,ceilingF?} | null, finishKind, label, process, ... }`; `isProcessVariantId`. `settings.processVariant` is coerced to match `process`.
- `dilution.ts` `DilutionResult.solutionGrams`; `useRecipeViewModel` exposes `dilution` (LS only) and `batchWeightWithExtras`.
- Insights: `analyzeFormulation(input)` in `insights.ts`; input has `process?: 'cp'|'hp'|'ls'`, `fattyAcids`, `fattyAcidCoveragePercent`, `oilEntries`, `FATTY_ACID_GROUP_KEYS`/`sumFattyAcids`, `recipeOilMatches`, `LOW_COVERAGE_PERCENT`.
- Panels render in `App.tsx` sidebar, gated by `process` (see DilutionPanel/NeutralizePanel/PreservePanel at `process === 'ls'`). `weightUnits.ts`: `WEIGHT_UNITS` (lb 453.59237, oz 28.349523125); `recipeFile.ts` has a private `ppoOzToPercentOfOil` (import-only today). `format.ts`/`formatDose.ts`/`InfoTip.tsx` exist.

## Task ordering

Tasks are independent (different files); recommended order D1, D2, D3, D4. D2 reads Wave A's `processProfile`; D1 adds an HTHP vessel-guard insight to `insights.ts`.

---

## Task D1: Yield outputs — cylinder molds, LS bottle count, HTHP vessel guard — roadmap item 22

**Files:**
- Modify: `packages/core/src/mold-sizer.ts` (+`.test.ts`) — add cylinder volume
- Create: `packages/core/src/ls-yield.ts` (+`.test.ts`) — LS finished volume + bottle count
- Modify: `packages/core/src/insights.ts` (+`.test.ts`) — HTHP vessel-size guard
- Modify: `packages/core/src/index.ts` (export ls-yield)
- Modify: `packages/web/src/components/MoldSizerPanel.tsx` (cylinder option) / a small LS bottle readout, + `useRecipeViewModel.ts` wiring + `useFormulationInsights.ts` for the vessel-guard input. (Do NOT re-add cured weight — it already ships.)

**Interfaces — Produces:**
```ts
// mold-sizer.ts
export function cylinderMoldVolumeCm3(radiusCm: number, heightCm: number): number | null; // π r² h; null on invalid
// ls-yield.ts
export const LS_SOLUTION_DENSITY_G_PER_ML = 1.03; // documented proxy for diluted-soap density (not a cited constant)
export function lsFinishedVolumeMl(solutionGrams: number, densityGPerMl?: number): number | null;
export function lsBottleCount(solutionGrams: number, bottleMl: number, densityGPerMl?: number): number | null; // floor(volume/bottleMl)
// insights.ts: new input + insight
//   input: hpVesselMultiple?: number  (vessel volume ÷ batch volume, computed by the caller)
//   insight code: hp_vessel_too_small (warning) when process==='hp' and hpVesselMultiple < required
```

**Verified constants (roadmap HP 332/449, CP 433/560):** density 0.92 (exists); cylinder πr²h; HTHP vessel ≥ 2× batch (≥ 3× for coconut-heavy). LS solution density ~1.03 g/ml is a documented proxy (mark it). Bottle count floors (no partial bottles).

- [ ] **Step 1: failing test — cylinder + LS yield (core)**

```ts
// mold-sizer.test.ts
it('cylinder volume is π r² h', () => {
  expect(cylinderMoldVolumeCm3(4, 10)).toBeCloseTo(Math.PI * 16 * 10); // ~502.65
  expect(cylinderMoldVolumeCm3(0, 10)).toBeNull();
});
// ls-yield.test.ts
it('finished volume = grams / density; bottles floor to whole', () => {
  expect(lsFinishedVolumeMl(1030)).toBeCloseTo(1000); // 1030 g / 1.03
  expect(lsBottleCount(1030, 250)).toBe(4);            // 1000 ml / 250 = 4
  expect(lsBottleCount(1030, 0)).toBeNull();
});
```

- [ ] **Step 2: Run red** — `npm test -w @soap-calc/core -- mold-sizer ls-yield` → FAIL.

- [ ] **Step 3: Implement cylinder + ls-yield (core)** — `cylinderMoldVolumeCm3` returns null when radius/height ≤ 0 or non-finite; `lsFinishedVolumeMl`/`lsBottleCount` guard ≤ 0 → null; export ls-yield from `index.ts`.

- [ ] **Step 4: Run green** → PASS.

- [ ] **Step 5: HTHP vessel-size guard (core insight) — TDD** — add `hpVesselMultiple?: number` to `FormulationAnalysisInput`; add `hp_vessel_too_small` (warning) gated `input.process === 'hp'` and `hpVesselMultiple !== undefined`: required multiple is 3 when coconut-heavy (`sumFattyAcids(fa, lauricMyristic) >= COCONUT_HEAVY_LAURIC_MYRISTIC` — reuse the C-wave constant, coverage-gated) else 2; fire when `hpVesselMultiple < required`. Behavior-only copy ("use a cook vessel at least ~2× the batch volume — ~3× for coconut-heavy — so the expanding cook doesn't overflow"). Test: HP + multiple 1.5 → fires; HP + 2.5 non-coconut → no; CP + 1.5 → no.

- [ ] **Step 6: Web wiring + UI** — add a cylinder option to `MoldSizerPanel` (radius+height → `cylinderMoldVolumeCm3` → existing `oilGramsFromMoldVolumeCm3`); for LS, a small "bottles filled" readout (bottle-size input × `lsBottleCount(dilution.solutionGrams, bottleMl)`), shown only for LS with a resolvable dilution; wire `hpVesselMultiple` from a vessel-size input (or omit the input and derive from a sensible default — keep the guard input optional). Thread through `useRecipeViewModel`/`useFormulationInsights`. Tests for the panel readouts.

- [ ] **Step 7: Full gate + commit**

```bash
npm test && npm run build:web
git add packages/core/src/mold-sizer.ts packages/core/src/mold-sizer.test.ts packages/core/src/ls-yield.ts packages/core/src/ls-yield.test.ts packages/core/src/index.ts packages/core/src/insights.ts packages/core/src/insights.test.ts packages/web/src/components/MoldSizerPanel.tsx packages/web/src/hooks/useRecipeViewModel.ts packages/web/src/hooks/useFormulationInsights.ts
git commit -m "feat: yield outputs — cylinder molds, LS bottle count, HTHP vessel-size guard"
```

---

## Task D2: Temperature + cook-stage process guide — roadmap item 21 (brainstormed)

**Files:**
- Create: `packages/core/src/cook-stages.ts` (+`.test.ts`) — the ordered HP cook-stage sequence (data-only)
- Create: `packages/web/src/components/ProcessGuidePanel.tsx` (+`.test.tsx`)
- Modify: `packages/web/src/App.tsx` (render it), `packages/web/src/index.css` (panel styles)

**Interfaces — Produces:**
```ts
// cook-stages.ts (core, data-only)
export const HP_COOK_STAGES: readonly string[] =
  ['trace', 'applesauce', 'expansion', 'mashed potato', 'gel / neat'];
// ProcessGuidePanel reads processProfileById(processVariant).temp and renders per process.
```

**Verified constants (roadmap HP 326):** LTHP 120–160 °F, HTHP 215 °F, ceiling 240 °F; stages trace→applesauce→expansion→mashed→gel/neat; don't mix past neat / >5 min. Fluid-HP + per-variant LS temps are Wave A `// unverified` → render hedged ("≈").

- [ ] **Step 1: failing test — cook-stage data (core)**

```ts
// cook-stages.test.ts
it('lists the HP cook stages in order', () => {
  expect(HP_COOK_STAGES).toEqual(['trace', 'applesauce', 'expansion', 'mashed potato', 'gel / neat']);
});
```

- [ ] **Step 2: Run red** → FAIL (module missing).

- [ ] **Step 3: Implement `cook-stages.ts`** + export from `index.ts`.

- [ ] **Step 4: Run green** → PASS.

- [ ] **Step 5: ProcessGuidePanel (web) — TDD.** Props: `processVariant: ProcessVariantId` (+ `process`). Reads `processProfileById(processVariant)`.
  - Temp line: format `temp` as °F. **Hedge unverified variants**: fluid-HP and all LS variants render with a leading "≈" and an "(estimated)" marker; LTHP/HTHP render firm. (Encode which variants are verified as a small local set, or read a `tempVerified` flag — simplest: a local `VERIFIED_TEMP_VARIANTS = new Set(['hp-lthp','hp-hthp'])`.) CP (`temp === null`) shows a soaping-temp note ("soap at a comfortable working temperature; no cook").
  - HP: also render the ordered `HP_COOK_STAGES` list + the caution "stop mixing once the batter reaches neat — over-mixing past ~5 minutes can seize or dry the cook."
  - Behavior-only copy, no source.
  - Tests: HP-HTHP shows firm "215 °F" + all 5 cook stages + the over-mix caution; HP-fluid shows a hedged "≈" temp; CP shows the soaping-temp note and no cook stages; an LS variant shows a hedged temp and no cook stages.

- [ ] **Step 6: Render in App** — add `<ProcessGuidePanel process={process} processVariant={settings.processVariant} />` in the sidebar (e.g. near SettingsPanel). Show for all processes (content differs per process). Confirm it renders and reads the active variant.

- [ ] **Step 7: Full gate + commit**

```bash
npm test && npm run build:web
git add packages/core/src/cook-stages.ts packages/core/src/cook-stages.test.ts packages/core/src/index.ts packages/web/src/components/ProcessGuidePanel.tsx packages/web/src/components/ProcessGuidePanel.test.tsx packages/web/src/App.tsx packages/web/src/index.css
git commit -m "feat: per-process temperature + cook-stage guide (unverified temps hedged)"
```

---

## Task D3: Per-process troubleshooting panels — roadmap item 20 (brainstormed)

**Files:**
- Create: `packages/core/src/troubleshooting.ts` (+`.test.ts`) — content data module
- Create: `packages/web/src/components/TroubleshootingPanel.tsx` (+`.test.tsx`)
- Modify: `packages/web/src/App.tsx` (render it), `packages/web/src/index.css`

**Interfaces — Produces:**
```ts
// troubleshooting.ts (core, data-only)
export type TroubleshootingEntry = { symptom: string; cause: string; fix: string };
export const TROUBLESHOOTING: Record<'cp' | 'hp' | 'ls', readonly TroubleshootingEntry[]>;
export function troubleshootingFor(process: 'cp' | 'hp' | 'ls'): readonly TroubleshootingEntry[];
```

**Content (behavior-only, no source):**
- CP: soda ash (ashy top — cover/gel or steam off); gel line (partial gel — insulate evenly or force full gel); volcano (overheated — cooler soaping temp, less sugar); DOS (orange spots — fresh oils, antioxidant, cool dry storage).
- HP: won't gel/stiff cook (switch to LTHP / add heat); crumbly bar (over-mixed past neat — work faster, more water); lye-heavy (pH > 11 / zap — recheck lye, rebatch).
- LS: cloud on cooling (chill-haze — reheat/stir or add a solubilizer); snot/jello dilution (over-diluted or under-cooked paste — cook longer / less water); anhydrous top layer (excess unsaponified oil — reduce superfat, skim).

- [ ] **Step 1: failing test — content module (core)**

```ts
it('provides at least three troubleshooting entries per process, each with symptom/cause/fix', () => {
  for (const p of ['cp', 'hp', 'ls'] as const) {
    const entries = troubleshootingFor(p);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    for (const e of entries) {
      expect(e.symptom).toBeTruthy(); expect(e.cause).toBeTruthy(); expect(e.fix).toBeTruthy();
    }
  }
});
```

- [ ] **Step 2: Run red** → FAIL.

- [ ] **Step 3: Implement `troubleshooting.ts`** with the content above; export from `index.ts`.

- [ ] **Step 4: Run green** → PASS.

- [ ] **Step 5: TroubleshootingPanel (web) — TDD.** Props: `process`. Renders `troubleshootingFor(process)` as a collapsible list (use `<details>/<summary>` per entry, or the existing panel/InfoTip idiom — match sibling panels). Test: HP shows the "won't gel" entry; switching process shows that process's entries; each entry shows symptom + cause + fix.

- [ ] **Step 6: Render in App** — `<TroubleshootingPanel process={process} />` in the sidebar. Shows for all processes (content differs). Confirm process-gated content.

- [ ] **Step 7: Full gate + commit**

```bash
npm test && npm run build:web
git add packages/core/src/troubleshooting.ts packages/core/src/troubleshooting.test.ts packages/core/src/index.ts packages/web/src/components/TroubleshootingPanel.tsx packages/web/src/components/TroubleshootingPanel.test.tsx packages/web/src/App.tsx packages/web/src/index.css
git commit -m "feat: per-process troubleshooting panels (core content module + collapsible panel)"
```

---

## Task D4: CP extras — dose converters + browning/antioxidant/myth notes — roadmap item 23

**Files:**
- Create: `packages/web/src/lib/doseConverters.ts` (+`.test.ts`) — tsp→%TOW and PPO→% (reuse the PPO math, don't duplicate `ppoOzToPercentOfOil`)
- Modify: `packages/web/src/components/SettingsPanel.tsx` or a small `CpExtrasPanel` (converter UI + notes) (+ test)
- Modify: `packages/web/src/App.tsx` (render for CP)

**Interfaces — Produces:**
```ts
// doseConverters.ts
export const GRAMS_PER_TSP = 4.1; // verified (roadmap CP 308)
export function tspToPercentOfOil(tsp: number, totalOilGrams: number): number | null; // (tsp*4.1)/oil*100
export function ppoOzToPercentOfOil(ppoOz: number): number | null; // oz-per-lb-of-oil → % (28.349523125 / 453.59237 * ppoOz * 100)
```
(If `recipeFile.ts`'s private `ppoOzToPercentOfOil` can be exported and reused, do that instead of a second copy — one source of truth. Note it currently returns a string; the converter wants a number — extract a numeric core and have recipeFile format it.)

**Verified constants (roadmap CP 308/163):** 4.1 g/tsp; 453.59237 g/lb, 28.349523125 g/oz (in weightUnits); anti-DOS 1% BHT + 1% sodium citrate (already surfaced in the PCSF insight — reference, don't restate as new). Antioxidants: Vitamin E, ROE, BHT+sodium citrate. Vanillin → browning.

- [ ] **Step 1: failing test — converters (web lib)**

```ts
it('tsp→% of oil uses 4.1 g/tsp', () => {
  expect(tspToPercentOfOil(1, 100)).toBeCloseTo(4.1); // 4.1 g / 100 g oil
  expect(tspToPercentOfOil(1, 0)).toBeNull();
});
it('ppo (oz per lb of oil) → % of oil', () => {
  expect(ppoOzToPercentOfOil(1)).toBeCloseTo((28.349523125 / 453.59237) * 100, 3); // ~6.25%
});
```

- [ ] **Step 2: Run red** → FAIL.

- [ ] **Step 3: Implement `doseConverters.ts`** — null on non-finite/≤0 oil; reuse the oz/lb constants from `weightUnits.ts`. Refactor `recipeFile.ts` to reuse the numeric PPO core if practical (single source of truth).

- [ ] **Step 4: Run green** → PASS.

- [ ] **Step 5: CP extras UI (web) — TDD** — a small CP-gated section: the tsp→% and PPO→% converters (live inputs → computed %), a vanillin field → browning-prediction note ("vanillin/vanilla darkens soap to tan/brown over weeks — expected, not a defect"), an antioxidant note (Vitamin E / ROE / 1% BHT + 1% sodium citrate for shelf life), and 1–2 myth-busters (e.g. "lye is fully consumed — no lye remains in a correctly-cured bar"; "gel phase is optional — it affects look, not safety"). Behavior-only copy. Render for CP only. Tests: a converter computes correctly in the UI; the notes render for CP and not for LS.

- [ ] **Step 6: Full gate + commit**

```bash
npm test && npm run build:web
git add packages/web/src/lib/doseConverters.ts packages/web/src/lib/doseConverters.test.ts packages/web/src/components/SettingsPanel.tsx packages/web/src/components/SettingsPanel.test.tsx packages/web/src/App.tsx packages/web/src/lib/recipeFile.ts
git commit -m "feat: CP extras — tsp/PPO dose converters + browning/antioxidant/myth notes"
```

---

## Self-Review

**Spec coverage:** Wave D's four roadmap items each map to a task — item 22→D1, 21→D2, 20→D3, 23→D4. ✅

**No duplication of shipped work:** D1 explicitly excludes cured/label weight and the cure window (both shipped in Wave B); it adds only cylinder molds, LS bottles, and the HTHP vessel guard. D4 reuses the PPO math rather than re-copying it, and references the existing anti-DOS insight rather than restating it. ✅

**Brainstormed decisions embedded:** D2 is a read-only process-guide panel with verified temps firm and unverified (fluid-HP, LS) temps hedged "≈"; D3 is a core content data module + collapsible per-process panel, distinct from the reactive insights engine. ✅

**Purity:** cook-stage + troubleshooting content live in core as data (testable, no logic); mold/LS-yield math is pure core; the HTHP vessel guard is a core insight fed a caller-computed `hpVesselMultiple`. Web adds only panels + the dose-converter lib. No `packages/web` import in core. ✅

**Verify vs proxy:** cylinder πr²h, density 0.92, HTHP ≥2×/≥3×, 4.1 g/tsp, oz/lb constants, LTHP/HTHP temps, and the anti-DOS combo are verified; LS solution density (~1.03) and the hedged fluid-HP/LS temps are documented proxies/estimates marked as such. ✅

**Gating:** HP-only surfaces (cook stages, vessel guard) gate `process === 'hp'` (reusing `COCONUT_HEAVY_LAURIC_MYRISTIC` + coverage gate for the coconut multiple); LS bottle readout and CP extras are process-gated in App; troubleshooting/process-guide content is keyed by the active process. ✅

**Placeholder scan:** each task carries concrete test + implementation guidance and exact constants; the one place modeled via a new input field (`hpVesselMultiple`) names it and says to compute it caller-side keeping core pure. ✅

**Type consistency:** `cylinderMoldVolumeCm3`, `lsFinishedVolumeMl`/`lsBottleCount`, `HP_COOK_STAGES`, `TroubleshootingEntry`/`troubleshootingFor`, `tspToPercentOfOil`/`ppoOzToPercentOfOil`, and the new `hpVesselMultiple` input + `hp_vessel_too_small` code are defined once and referenced consistently. ✅
