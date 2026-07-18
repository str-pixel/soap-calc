# Multi-Process Wave C — Additives & Chemistry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Full TDD promotion of **Wave C** from the program plan `docs/superpowers/plans/2026-07-17-multiprocess-remaining-roadmap.md`. Waves A + B are merged to `main` and in production. **Branch Wave C from current `origin/main`, not the stale local checkout.** The two design-heavy tasks (C4 thickeners/salt, C5 LS remap/recommender) were brainstormed on 2026-07-18 and their decisions are embedded below (see Design Decisions).

**Goal:** Extend the additive catalog and per-process chemistry — CP additive corrections + new additives, a fluid-HP additive set, additive hazard tags + a sugar aggregator, LS thickeners + a salt advisory, an LS quality remap + dual-lye recommender, and an LS preservative advisory.

**Architecture:** Pure data/thresholds live in `@soap-calc/core` (`packages/core/src`) — the additive catalog (`additives.ts`) and all coaching/guardrail insights (`insights.ts`, emitted by `analyzeFormulation`). Core must NOT import from `packages/web`. Web-side numbers are passed into `analyzeFormulation` as plain data. New per-process additive scoping is a small catalog-level mechanism consumed by `AdditivesPanel`. One new web panel (LS preservative advisory) and one `PropertiesPanel` prop are the only UI additions.

**Tech Stack:** TypeScript (strict), React 18 + Vite, Vitest, npm workspaces. Tests colocated as `*.test.ts(x)`.

## Global Constraints

- **Anonymity (supersedes all copy):** numbers, ratios, and generic technique only — never a source title, author, publisher, recipe name, or paraphrased prose. Cite *behavior*, never a source.
- **Verify before asserting:** every numeric default/threshold comes from the roadmap's Verified Constants (reproduced per-task) or is marked a documented proxy/heuristic. No invented numbers presented as authoritative.
- **DO NOT SHIP (verified out of scope):**
  - **Preservative percentages** (LS/HP) — the references give none. The LS preservative panel ships **"verify with supplier" guidance only, ZERO dose numbers.**
  - LS per-product concentration ranges (dish/baby/hand) — not in this wave.
  - No numeric salt-thickening viscosity prediction — the references give no calibrated curve (see C4 Design Decision).
- **Core stays pure:** no React/DOM/`packages/web` imports in `packages/core`.
- **Process/coverage gating:** LS-only insights gate `input.isLiquidSoap`; CP/HP-only gate `!input.isLiquidSoap`; any insight reading renormalized fatty-acids/properties gates on `(input.fattyAcidCoveragePercent ?? 100) >= LOW_COVERAGE_PERCENT` (80), per the established pattern in `insights.ts`.
- **TDD + frequent commits:** failing test → run red → minimal impl → run green → commit, per step.

## Design Decisions (brainstormed 2026-07-18, validated against origin/main)

- **Salt thickening = qualitative advisory, not a numeric model.** No calibrated curve exists; ship a behavior-only insight (thicken-then-thin; add dilute brine gradually and test; barely works on coconut-heavy soap). Guar/HEC ship as real thickeners with their verified 0.5–1% ranges.
- **Per-process additive scoping is a NEW mechanism.** Catalog entries are not process-scoped today (`AdditivesPanel` gates only stages/dose-modes). Add optional `processes?: ProcessId[]` to `AdditiveCatalogEntry` and filter the picker; guar/HEC are `processes: ['ls']`.
- **LS quality remap = insights + a contextual note only.** No scoring/radar/label changes. The cleansing InfoTip gains an LS-only "tracks solubility, not harshness" note; a castor-no-lather-in-LS insight; and `eutectic_lather_sources` (a bar-lather claim, currently ungated) is gated `!isLiquidSoap` to avoid contradicting the LS lather framing.
- **Dual-lye recommender = read-only advisory, actionable cases only, anchor rules (no interpolation).** Evaluate in order: (1) coconut-heavy → "~30% NaOH share" (always); (2) else palmitic+stearic ≤ 15% **and recipe already dual-lye** → "~0–20% NaOH share"; (3) otherwise silent (no nag). "Coconut-heavy" is a documented FA proxy (lauric+myristic ≥ 55%, since ~75% coconut oil ≈ 60% of that group) — marked as a proxy, not a source number.
- **`solution` dose basis already works** (`calculateAdditives` resolves it against `dilution.solutionGrams`, which the view model already passes) — guar/HEC dosed "% of solution" needs no new wiring beyond the catalog entry.

## Current-state anchors (verified at origin/main)

- Catalog `ADDITIVE_CATALOG` + `AdditiveCatalogEntry { id, name, typicalLow, typicalHigh, defaultStage }` + `catalogEntryById` — `packages/core/src/additives.ts`. Current ids: sugar-sorbitol, chelator, cetyl-alcohol, charcoal, oatmeal, honey, fragrance, jojoba, clay, salt (0.05–1%, lye), sodium-lactate (1–3%, lye). `AdditiveStage = 'lye'|'oils'|'trace'|'top'|'after_cook'`. `DoseUnit`/`DoseBasis`, `parseDoseAmount`, `gramsFromDose`.
- Insights: `analyzeFormulation(input: FormulationAnalysisInput): FormulationInsight[]` — `packages/core/src/insights.ts`. `FormulationInsight = { level:'info'|'warning'; code:string; message:string }`. Existing helpers imported there: `sumFattyAcids`, `FATTY_ACID_GROUP_KEYS` (`lauricMyristic`, `palmiticStearic`, `polyunsaturated`), `additiveMatches(entries, catalogIdKw, nameKw)`, `recipeOilMatches(oilEntries, {oilIds, nameKeyword})`, `LOW_COVERAGE_PERCENT`. Input already carries `additiveEntries: {catalogId,name}[]`, `oilEntries`, `fattyAcids`, `fattyAcidCoveragePercent`, `isLiquidSoap`, `lyeType`, `superfatPercent`, `totalOilGrams`, `totalAdditivePercent`.
- `AdditivesPanel` picker renders `ADDITIVE_CATALOG.map(...)` (~line 189); `offeredStagesForProcess`/`offeredDoseModesForProcess` gate stages/dose-modes; takes a `process: ProcessId` prop — `packages/web/src/components/AdditivesPanel.tsx`.
- `useFormulationInsights.ts` builds the `analyzeFormulation` input (already maps `additiveEntries`, `oilEntries`, `isLiquidSoap`, coverage). `useRecipeViewModel.ts` exposes `process` and `dilution.solutionGrams`.
- `PropertiesPanel` renders `PROPERTY_GUIDANCE[key]` via `InfoTip`; props today are `result/indexes/modeledOilIds` only (NO process) — `packages/web/src/components/PropertiesPanel.tsx`. App renders it at `App.tsx:250`.
- LS panels render for `process==='ls'` in `App.tsx` (Dilution, Neutralize). `process.ts` `PanelKey` union already includes `'preserve'` (declared in `PROCESS_DEFINITIONS.ls.panels`) but nothing renders it.

## Task ordering

C1 → C2 → C3 all touch `additives.ts`/`insights.ts`; do them in order. **Both C2 and C4 depend on C1's `processes[]` mechanism** (introduced in C1). C2 also depends on the **`process` discriminator** it adds to `FormulationAnalysisInput` (see C2 Step 0) — C3's and C5's HP/CP-specific logic may reuse it. C5 and C6 are otherwise independent. Recommended order: C1, C2, C3, C4, C5, C6.

## Prerequisite the plan discovered: HP vs CP is not currently distinguishable in core

`FormulationAnalysisInput` today carries only `isLiquidSoap?: boolean` and `lyeType?` — there is **no way to tell CP from HP** in `analyzeFormulation`. Wave C's HP-specific insights (C2) therefore cannot be gated correctly with `!isLiquidSoap` (that includes CP). C2 Step 0 adds a `process?: 'cp' | 'hp' | 'ls'` field to the input and threads it from the web hook (`useRecipeViewModel` already knows `process`). Every HP-only insight gates on `input.process === 'hp'`; existing `isLiquidSoap` gates are left untouched (no refactor — the new field is additive).

---

## Task C1: CP additive corrections + new additives (+ `processes[]` scoping mechanism) — roadmap item 18

**Files:**
- Modify: `packages/core/src/additives.ts` (+ `.test.ts`)
- Modify: `packages/web/src/components/AdditivesPanel.tsx` (+ `.test.tsx`) — filter the picker by `processes[]`

**Interfaces — Produces:**
- `AdditiveCatalogEntry` gains `processes?: ProcessId[]` (absent = all processes). Add `import type { ProcessId } from './...'` — but `ProcessId` lives in `packages/web/src/lib/process.ts` and core must stay pure. **Define a local `AdditiveProcess = 'cp' | 'hp' | 'ls'` type in `additives.ts`** (structurally identical) so core owns no web import; the web layer's `ProcessId` is assignable to it.
- New helper `catalogEntriesForProcess(process: AdditiveProcess): AdditiveCatalogEntry[]` returning entries whose `processes` is absent or includes `process`.
- Corrected/added catalog entries (see constants).

**Verified constants (roadmap CP 308/163):** sugar 0.5–2% (was 1–5%); 4.1 g/tsp; 453.592 g/lb (already in weightUnits). New additives: sodium-lactate (exists 1–3%), silk (0.1–1%), edta (0.1–0.5%), titanium-dioxide (0.1–1%), eugenol (1–3 ppt), loofah. Anti-DOS combo 1% BHT + 1% sodium citrate (already surfaced in the PCSF insight — do not duplicate).

- [ ] **Step 1: Write the failing test (core) for the scoping mechanism + corrected sugar range**

```ts
// packages/core/src/additives.test.ts (add)
import { ADDITIVE_CATALOG, catalogEntriesForProcess, catalogEntryById } from './additives';

describe('additive catalog process scoping', () => {
  it('sugar range is corrected to 0.5–2%', () => {
    const sugar = catalogEntryById('sugar-sorbitol');
    expect(sugar?.typicalLow).toBe(0.5);
    expect(sugar?.typicalHigh).toBe(2);
  });
  it('unscoped entries appear for every process', () => {
    const cp = catalogEntriesForProcess('cp');
    expect(cp.some((e) => e.id === 'sugar-sorbitol')).toBe(true);
  });
});
```

- [ ] **Step 2: Run red** — `npm test -w @soap-calc/core -- additives` → FAIL (helper missing; sugar still 1–5).

- [ ] **Step 3: Implement (core)** — add `AdditiveProcess` type + `processes?` field, `catalogEntriesForProcess`, correct sugar to 0.5–2, and add the new entries:

```ts
export type AdditiveProcess = 'cp' | 'hp' | 'ls';
export type AdditiveCatalogEntry = {
  id: string; name: string; typicalLow: number; typicalHigh: number;
  defaultStage: AdditiveStage;
  /** Processes this additive is offered for; absent = all. */
  processes?: AdditiveProcess[];
};
// ...correct sugar-sorbitol to typicalLow:0.5, typicalHigh:2
// ...add entries (unscoped unless noted): silk {0.1,1,'lye'}, edta {0.1,0.5,'lye'},
//    titanium-dioxide {0.1,1,'oils'}, eugenol {1,3,'trace'} (dosed ppt), loofah {..,'oils'}.
export function catalogEntriesForProcess(process: AdditiveProcess): AdditiveCatalogEntry[] {
  return ADDITIVE_CATALOG.filter((e) => !e.processes || e.processes.includes(process));
}
```

- [ ] **Step 4: Run green (core)** — `npm test -w @soap-calc/core -- additives` → PASS.

- [ ] **Step 5: Filter the picker by process (web) — TDD**

In `AdditivesPanel.tsx`, replace `ADDITIVE_CATALOG.map(...)` (~line 189) with `catalogEntriesForProcess(process).map(...)`. The positive "LS-only entry hidden in CP" assertion needs a real scoped entry, which doesn't exist until C4 (guar/hec) — do NOT try to inject one into the readonly `ADDITIVE_CATALOG`. For C1, the scoping *logic* is unit-tested in core (`catalogEntriesForProcess`, Step 1); the panel test here asserts only the no-regression invariant: all current (unscoped) entries still render in the CP picker. The positive cross-process filter assertion (guar absent in CP, present in LS) lands in C4 Step 1's panel test.

- [ ] **Step 6: Full gate + commit**

```bash
npm test && npm run build:web
git add packages/core/src/additives.ts packages/core/src/additives.test.ts packages/web/src/components/AdditivesPanel.tsx packages/web/src/components/AdditivesPanel.test.tsx
git commit -m "feat: CP additive corrections + new additives + per-process catalog scoping"
```

---

## Task C2: Fluid-HP additive set — roadmap item 14

**Files:** modify `packages/core/src/insights.ts` (+`.test.ts`), `packages/core/src/additives.ts` (+`.test.ts`), and `packages/web/src/hooks/useFormulationInsights.ts`.

**Interfaces — Produces:** `FormulationAnalysisInput` gains `process?: 'cp' | 'hp' | 'ls'` (Step 0). New catalog entries scoped to HP (`processes:['hp']`): `stearic` and `lauric` "as oils" 5–8%, `yogurt` 2–5% (stage `after_cook`); `salt`/`sodium-lactate`/`sugar`/`eugenol` stay unscoped and are reused. New insights: `hp_thick_phase_suppressant` (info), `hp_yogurt_water` (warning), `hp_relaxed_caps` (info). New optional input `hpYogurtPercent?: number`.

**Verified constants (roadmap HP 346/252):** stearic/lauric 5–8% · sodium lactate 3–4% · salt 0.05–1% · yogurt 2–5% · sugar 1–5% · eugenol 1–3 ppt. HP tolerates higher castor (10–15%) and shea (30–40%) than a CP bar — note: **there is no existing castor/shea cap guardrail in `insights.ts` to "relax,"** so this ships as a new HP-gated advisory (`hp_relaxed_caps`), NOT a change to a nonexistent cap.

- [ ] **Step 0: Add the `process` discriminator (TDD) — the prerequisite above**

Add `process?: 'cp' | 'hp' | 'ls'` to `FormulationAnalysisInput` in `insights.ts`. Thread it from `useFormulationInsights.ts` (add `process` to the hook's inputs/options — `useRecipeViewModel` already computes `process` and passes `isLiquidSoap: process === 'ls'`; pass `process` too) into the `analyzeFormulation({...})` object, and add it to the `useMemo` dep array. Write a test first asserting an HP-only insight (added below) fires for `process:'hp'` and NOT for `process:'cp'`.

- [ ] **Step 1: failing test (core)** — assert `catalogEntriesForProcess('hp')` includes `stearic`/`lauric`/`yogurt` and `catalogEntriesForProcess('cp')` excludes them; assert `process:'hp'` + `hpYogurtPercent: 6` yields `hp_yogurt_water` (and 4 does not); `process:'hp'` + salt or sodium-lactate additive yields `hp_thick_phase_suppressant`; and **crucially** `process:'cp'` + salt does NOT yield `hp_thick_phase_suppressant` (the gating-correctness regression this task exists to prevent). `process:'hp'` + castor ≥ 10% (ricinoleic proxy) or shea present yields `hp_relaxed_caps`.

- [ ] **Step 2: Run red** → FAIL.

- [ ] **Step 3: Implement** — add the HP-scoped catalog entries; add the three insights gated `input.process === 'hp'` (NOT `!isLiquidSoap`). Salt/SL suppressant: info when HP and the recipe carries salt or sodium-lactate (`additiveMatches`). Yogurt-water: warning when HP and `hpYogurtPercent > 5` (deducts from water). Relaxed caps: info when HP and the profile shows elevated castor/shea (behavior-only copy; introduces no hard cap).

- [ ] **Step 4: Run green** → PASS.

- [ ] **Step 5: Wire yogurt-% + process from the web hook** — in `useFormulationInsights.ts`, resolve the yogurt additive line's percent-of-oil (grams / totalOilGrams × 100, mirroring `totalAdditivePercentForInsights`) and pass `hpYogurtPercent` only for HP; pass `process`. Add deps. Test the hook path (HP recipe with a yogurt line → `hp_yogurt_water`).

- [ ] **Step 6: Full gate + commit**

```bash
npm test && npm run build:web
git add packages/core/src/additives.ts packages/core/src/additives.test.ts packages/core/src/insights.ts packages/core/src/insights.test.ts packages/web/src/hooks/useFormulationInsights.ts
git commit -m "feat: fluid-HP additive set + HP-gated thick-phase/yogurt/relaxed-caps insights (adds process discriminator)"
```

---

## Task C3: Additive hazard tags + sugar aggregator — roadmap item 19

**Files:** modify `packages/core/src/additives.ts` (+`.test.ts`), `packages/core/src/insights.ts` (+`.test.ts`), and the additive display (`packages/web/src/components/AdditivesPanel.tsx` to show hazard tags) (+`.test.tsx`).

**Interfaces — Produces:** `AdditiveCatalogEntry` gains `hazards?: string[]` (short behavior-only tags). New insight `sugar_total_high` (warning). New optional input `sugarTotalPercent?: number` (the hook computes it — `additiveEntries` carries no percentages, so summing there is impossible; core must receive the total).

**Verified constants (roadmap CP 308):** total sugar ceiling 4% of oil. Hazard tags (behavior-only): eugenol → "can seize"; sugar/wax → "can tunnel/overheat"; excess salt → "can make the bar crumbly"; titanium-dioxide → "can glycerin-river at high water".

- [ ] **Step 1: failing test (core)** — hazard tag present on eugenol/sugar/salt/TiO₂ entries; `sugar_total_high` fires when `sugarTotalPercent > 4` and does NOT fire at 3.

- [ ] **Step 2: Run red** → FAIL.

- [ ] **Step 3: Implement (core)** — add `hazards?` to the type + tag the relevant entries; add the `sugar_total_high` warning keyed on `input.sugarTotalPercent` (one message on the total, not per-additive). TiO₂ "glycerin-river at high water" is a static hazard *tag* only (no water-signal insight — wiring water here is out of proportion).

- [ ] **Step 3b: Compute `sugarTotalPercent` in the hook** — in `useFormulationInsights.ts`, sum the percent-of-oil of the sugar-family computed additives (match `sugar`/`sorbitol`/`honey`/`yogurt` via `additiveMatches` over the computed additives, converting each one's `grams / totalOilGrams × 100`, mirroring `totalAdditivePercentForInsights`) and pass `sugarTotalPercent`. Add the dep. Test the hook path (two sugar sources summing past 4% → one warning).

- [ ] **Step 4: Run green** → PASS.

- [ ] **Step 5: Display hazard tags (web)** — render `entry.hazards` as small muted chips on the selected additive row in `AdditivesPanel`, following the existing row layout. Test they render.

- [ ] **Step 6: Full gate + commit**

```bash
npm test && npm run build:web
git add packages/core/src/additives.ts packages/core/src/additives.test.ts packages/core/src/insights.ts packages/core/src/insights.test.ts packages/web/src/hooks/useFormulationInsights.ts packages/web/src/hooks/useFormulationInsights.test.ts packages/web/src/components/AdditivesPanel.tsx packages/web/src/components/AdditivesPanel.test.tsx
git commit -m "feat: additive hazard tags + total-sugar aggregator warning"
```

---

## Task C4: Thickeners (LS) + salt advisory — roadmap item 15 (brainstormed)

**Files:** modify `packages/core/src/additives.ts` (+`.test.ts`), `packages/core/src/insights.ts` (+`.test.ts`). No new UI beyond the picker (guar/HEC flow through the existing additive UI; the salt advisory is an insight).

**Interfaces — Produces:** catalog entries `guar` (guar gum) and `hec` (hydroxyethylcellulose), both `{typicalLow:0.5, typicalHigh:1, defaultStage:'after_cook', processes:['ls']}`. New insight `ls_salt_thickening` (info).

**Verified constants (roadmap LS 447):** guar 0.5–1% · HEC 0.5–1%. Salt curve is qualitative (no numbers). Coconut-heavy proxy: lauric+myristic ≥ 55% (documented proxy, not a source number).

- [ ] **Step 1: failing test (core)**

```ts
// additives: guar/hec exist, LS-scoped
it('guar and hec are LS-only thickeners at 0.5–1% added after dilution', () => {
  for (const id of ['guar', 'hec']) {
    const e = catalogEntryById(id)!;
    expect(e.typicalLow).toBe(0.5); expect(e.typicalHigh).toBe(1);
    expect(e.defaultStage).toBe('after_cook'); expect(e.processes).toEqual(['ls']);
  }
  expect(catalogEntriesForProcess('cp').some((e) => e.id === 'guar')).toBe(false);
});
// insights: ls_salt_thickening
it('LS + salt additive → salt thickening advisory; adds a coconut caveat when coconut-heavy', () => {
  const base = { /* LS input, salt in additiveEntries, fattyAcidCoveragePercent:100 */ };
  const normal = analyzeFormulation({ ...base, fattyAcids: { oleic: 60 } }).find(i => i.code==='ls_salt_thickening');
  expect(normal).toBeTruthy();
  const coconut = analyzeFormulation({ ...base, fattyAcids: { lauric: 45, myristic: 12 } }).find(i => i.code==='ls_salt_thickening');
  expect(coconut?.message).toMatch(/coconut|barely|little/i);
  // not for CP even with salt:
  expect(analyzeFormulation({ ...base, isLiquidSoap:false, fattyAcids:{oleic:60} }).some(i=>i.code==='ls_salt_thickening')).toBe(false);
});
```

- [ ] **Step 2: Run red** → FAIL.

- [ ] **Step 3: Implement** — add guar/hec entries; add `ls_salt_thickening` insight gated `input.isLiquidSoap && additiveMatches(additiveEntries,'salt','salt')`. Base message: thicken-then-thin + "add a dilute brine gradually and test." When coverage ≥ 80 and `sumFattyAcids(fa, lauricMyristic) >= 55`, append the coconut caveat ("high-coconut liquid soap barely responds to salt — use guar or HEC instead").

- [ ] **Step 4: Run green** → PASS.

- [ ] **Step 5: Full gate + commit**

```bash
npm test && npm run build:web
git add packages/core/src/additives.ts packages/core/src/additives.test.ts packages/core/src/insights.ts packages/core/src/insights.test.ts
git commit -m "feat: LS thickeners (guar/HEC) + qualitative salt-thickening advisory"
```

---

## Task C5: LS quality remap + dual-lye recommender — roadmap item 17 (brainstormed)

**Files:** modify `packages/core/src/insights.ts` (+`.test.ts`); `packages/web/src/components/PropertiesPanel.tsx` (+`.test.tsx`) for the cleansing note; `packages/web/src/App.tsx` + `packages/web/src/hooks/useFormulationInsights.ts` wiring as needed.

**Interfaces — Produces:** insights `ls_castor_no_lather` (info), `ls_dual_lye_recommendation` (info); `eutectic_lather_sources` gains `!input.isLiquidSoap` gate. `PropertiesPanel` gains an `isLiquidSoap?: boolean` prop.

**Verified constants (roadmap LS 86):** dual-lye NaOH share — palmitic+stearic ≤ 15% → 0–20% NaOH; >75% coconut → ~30% NaOH. Coconut-heavy proxy: lauric+myristic ≥ 55% (documented). Castor signal: ricinoleic ≥ 4% (documented proxy) OR castor oil present via `recipeOilMatches`.

- [ ] **Step 1: failing test (core)**

```ts
describe('LS quality remap + dual-lye recommender', () => {
  const ls = { /* isLiquidSoap:true, fattyAcidCoveragePercent:100, ... */ };
  it('gates eutectic_lather_sources out for liquid soap', () => {
    const codes = analyzeFormulation({ ...ls, fattyAcids:{lauric:10,oleic:40} }).map(i=>i.code);
    expect(codes).not.toContain('eutectic_lather_sources');
    // still fires for CP:
    expect(analyzeFormulation({ ...ls, isLiquidSoap:false, fattyAcids:{lauric:10,oleic:40} }).map(i=>i.code)).toContain('eutectic_lather_sources');
  });
  it('notes castor gives little lather in LS', () => {
    expect(analyzeFormulation({ ...ls, fattyAcids:{ricinoleic:6,oleic:50} }).map(i=>i.code)).toContain('ls_castor_no_lather');
  });
  it('recommends ~30% NaOH for coconut-heavy LS (always)', () => {
    const i = analyzeFormulation({ ...ls, fattyAcids:{lauric:45,myristic:12} }).find(x=>x.code==='ls_dual_lye_recommendation');
    expect(i?.message).toMatch(/30%/);
  });
  it('recommends 0–20% NaOH only when already dual-lye and low P+S', () => {
    const koh = analyzeFormulation({ ...ls, lyeType:'koh', fattyAcids:{oleic:70,palmitic:5,stearic:3} }).map(i=>i.code);
    expect(koh).not.toContain('ls_dual_lye_recommendation'); // pure KOH low-P+S → silent
    const dual = analyzeFormulation({ ...ls, lyeType:'dual', fattyAcids:{oleic:70,palmitic:5,stearic:3} }).find(x=>x.code==='ls_dual_lye_recommendation');
    expect(dual?.message).toMatch(/0.?20%|20%/);
  });
});
```

- [ ] **Step 2: Run red** → FAIL.

- [ ] **Step 3: Implement (core)** — add `!input.isLiquidSoap` to the existing `eutectic_lather_sources` condition. Add `ls_castor_no_lather` (LS + ricinoleic ≥ 4 or castor oil in `oilEntries`, coverage-gated). Add `ls_dual_lye_recommendation`, coverage-gated, evaluated in order: (1) `lauricMyristic >= 55` → "~30% NaOH share firms/thickens high-coconut liquid soap"; (2) else `palmiticStearic <= 15 && input.lyeType === 'dual'` → "a small NaOH share (~0–20%) in your blend gives a firmer, thicker soap"; (3) else no insight.

- [ ] **Step 4: Run green (core)** → PASS.

- [ ] **Step 5: Cleansing-as-solubility note (web)** — thread `isLiquidSoap` (from `process === 'ls'`) into `PropertiesPanel` (App passes it; view model has `process`). When true, the cleansing row's `InfoTip` shows an appended LS note ("In liquid soap this tracks solubility/how well it dilutes, not harshness") — append to the rendered guidance conditionally, do not mutate the static `PROPERTY_GUIDANCE` map. Test both the LS-shown and CP-absent cases.

- [ ] **Step 6: Full gate + commit**

```bash
npm test && npm run build:web
git add packages/core/src/insights.ts packages/core/src/insights.test.ts packages/web/src/components/PropertiesPanel.tsx packages/web/src/components/PropertiesPanel.test.tsx packages/web/src/App.tsx
git commit -m "feat: LS quality remap (cleansing note, castor-no-lather, eutectic gate) + dual-lye recommender"
```

---

## Task C6: Preservative advisory panel (LS) — roadmap item 16

**Files:** create `packages/web/src/components/PreservePanel.tsx` (+`.test.tsx`); render it in `App.tsx` where `process === 'ls'` (the `'preserve'` PanelKey already exists in `PROCESS_DEFINITIONS.ls.panels` but nothing renders it).

**Interfaces — Produces:** a presentational `PreservePanel` (no core logic; advisory copy only).

**Verified constants (roadmap LS 465):** water activity bar ~0.66–0.76 (self-preserving) vs diluted LS ~0.98 (needs a preservative). **NO preservative percentages — DO NOT SHIP any dose numbers** (supplier-sourced only).

- [ ] **Step 1: failing test (web)**

```tsx
// PreservePanel.test.tsx
it('explains why diluted LS needs a preservative and cites no dose numbers', () => {
  render(<PreservePanel />);
  expect(screen.getByText(/water activity/i)).toBeTruthy();
  expect(screen.getByText(/verify.*supplier/i)).toBeTruthy();
  // guard the DO-NOT-SHIP rule: no percentage figures in the panel
  expect(document.body.textContent).not.toMatch(/\d+(\.\d+)?\s*%/);
});
```

- [ ] **Step 2: Run red** — `npm test -w @soap-calc/web -- PreservePanel` → FAIL (component missing).

- [ ] **Step 3: Implement `PreservePanel.tsx`** — advisory-only: diluted liquid soap sits at a high water activity (~0.98) where a bar (~0.66–0.76) is self-preserving, so a broad-spectrum, high-pH-stable preservative is needed; **choose the product and its use level with your supplier's guidance.** No percentages, no product/brand/source names.

- [ ] **Step 4: Run green** → PASS.

- [ ] **Step 5: Render for LS in App** — add `{process === 'ls' && <PreservePanel />}` in the LS panel group (near Dilution/Neutralize). Confirm it appears only for LS.

- [ ] **Step 6: Full gate + commit**

```bash
npm test && npm run build:web
git add packages/web/src/components/PreservePanel.tsx packages/web/src/components/PreservePanel.test.tsx packages/web/src/App.tsx
git commit -m "feat(web): LS preservative advisory panel (supplier-sourced, no dose numbers)"
```

---

## Self-Review

**Spec coverage:** Wave C's six roadmap items each map to a task — item 18→C1, 14→C2, 19→C3, 15→C4, 17→C5, 16→C6. ✅

**Brainstormed decisions embedded:** C4 salt = qualitative advisory (no numeric model); `processes[]` scoping introduced in C1 and used by C4/C2; C5 remap = insights + note only, `eutectic_lather_sources` gated to !LS, recommender actionable-cases-only with coconut-first ordering; C6 ships zero preservative dose numbers (guarded by a test). ✅

**Purity:** all catalog/threshold/insight logic in core; core owns a local `AdditiveProcess` type (no web import); web-only additions are the picker filter, hazard chips, the cleansing note, and the PreservePanel. ✅

**Verify vs proxy:** guar/HEC ranges, sugar 0.5–2%, sugar ceiling 4%, HP additive ranges, P+S≤15 and coconut→30% anchors, and water-activity figures are verified constants; the coconut-heavy `lauricMyristic ≥ 55%` and castor `ricinoleic ≥ 4%` thresholds are documented proxies marked as such; the salt curve ships no numbers. ✅

**Gating (corrected after code review):** the plan originally gated HP insights on `!isLiquidSoap`, which wrongly includes CP — `FormulationAnalysisInput` had no CP-vs-HP discriminator. C2 Step 0 adds `process?: 'cp'|'hp'|'ls'`; HP insights now gate `input.process === 'hp'` (with an explicit `process:'cp'`-doesn't-fire regression test). LS insights still gate `isLiquidSoap`; FA-reading insights gate coverage ≥ 80; the eutectic gate and recommender ordering are tested including the LS/CP and dual/pure-KOH split. ✅

**Errors fixed in review:** (1) HP gating gap → added the `process` discriminator (above). (2) C2 "relaxed caps" cannot relax a nonexistent guardrail → reframed as a new HP-gated `hp_relaxed_caps` advisory. (3) C3 sugar total cannot be summed from `additiveEntries` (no percentages) → computed as `sugarTotalPercent` in the hook. (4) C1 picker filter can't test the positive case until C4 has a scoped entry → C1 tests core logic + no-regression, positive assertion deferred to C4. ✅

**Placeholder scan:** each task carries concrete test + implementation guidance and exact constants; the two places modeled via a new input field (`hpYogurtPercent`, sugar total) name the field and say to resolve it in the hook keeping core pure — not left vague. ✅

**Type consistency:** `AdditiveProcess`, `processes?`, `catalogEntriesForProcess`, `hazards?`, and the new insight codes (`ls_salt_thickening`, `ls_castor_no_lather`, `ls_dual_lye_recommendation`, `hp_thick_phase_suppressant`, `hp_yogurt_water`, `sugar_total_high`) are defined once and referenced consistently across tasks. ✅
