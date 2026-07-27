# LS Additive Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LS-correct additive dosing: stage-aware citric compensation, a dose-basis seam (solution-based additives), LS dose overrides, four new/extended entries incl. glycerin in both book modes, and consistent ceilings.

**Architecture:** Extends #130's `processOverrides`/`effectiveCatalogEntry` seam with `doseBasis` + `hazards`; replaces #128's process-based citric gate with an `addAt !== 'after_cook'` rule in the web dose resolver; adds a `solvent` alternative-liquid flag and extends `splitLiquidCalcOverride` to `lye_water_ratio` via pure ratio arithmetic (`N × (1 − p/100)`), with row grams resolved post-calc through a new `targetRatio` field.

**Tech Stack:** TypeScript, vitest, @testing-library/react. `packages/core` (pure), `packages/web`.

**Spec:** `docs/superpowers/specs/2026-07-27-ls-additive-audit-design.md`

## Global Constraints

- Anonymity rule: numeric constants only; all copy original; nothing identifies a third-party source.
- Never compensate `after_cook` acid in ANY process; never add lye post-cook.
- Solution-based entries/overrides must be reachable only under LS (invariant test).
- `LATHER_SUPPORT_PACK` unchanged; `calculateNeutralization`/NeutralizePanel untouched.
- Core tests from `packages/core`, web from `packages/web` (`npx vitest run <file>`); `npx tsc --noEmit` in each package (vitest does not typecheck).
- Every commit ends with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Core — citric offered everywhere; LS chelator-route range

**Files:**
- Modify: `packages/core/src/additives.ts` (the `citric-acid` entry)
- Test: `packages/core/src/additives.test.ts`

**Interfaces:**
- Produces: `citric-acid` with no `processes` field and `processOverrides.ls = { typicalLow: 1, typicalHigh: 3 }`. Task 6 relies on it being offered under LS.

- [ ] **Step 1: Write the failing tests** — in `additives.test.ts`, UPDATE the existing citric test (it pins `processes: ['cp','hp']` and the LS exclusion) and add the override case. Replace the body of `'offers citric acid for CP/HP at 1–2% into the lye water, never for LS'`:

```ts
  it('offers citric acid for every process at the lye stage; LS widens to the 1–3% chelator route', () => {
    const citric = catalogEntryById('citric-acid')!;
    expect(citric.name).toBe('Citric acid (anhydrous)');
    expect(citric.defaultStage).toBe('lye');
    expect(citric.processes).toBeUndefined();
    for (const process of ['cp', 'hp', 'ls'] as const) {
      expect(catalogEntriesForProcess(process).some((e) => e.id === 'citric-acid')).toBe(true);
    }
    const cp = effectiveCatalogEntry(citric, 'cp');
    expect([cp.typicalLow, cp.typicalHigh]).toEqual([1, 2]);
    const ls = effectiveCatalogEntry(citric, 'ls');
    expect([ls.typicalLow, ls.typicalHigh]).toEqual([1, 3]);
  });
```

- [ ] **Step 2: Run to verify failure** — `cd packages/core && npx vitest run src/additives.test.ts`. Expected: FAILS (processes is `['cp','hp']`; LS excluded; no ls override).

- [ ] **Step 3: Implement** — on the `citric-acid` entry: delete `processes: ['cp', 'hp'],`, add:

```ts
    processOverrides: {
      // LS chelator route: citric into the lye solution makes potassium citrate in situ,
      // at a wider dose than the CP/HP water-conditioning dose.
      ls: { typicalLow: 1, typicalHigh: 3 },
    },
```

Rewrite the entry's lead comment (replacing the "CP/HP only" rationale):

```ts
    // Acid form of the citrate chelator: dissolved in the lye water it reacts with the
    // alkali to form citrate in situ. Consumes lye — compensated automatically for any
    // stage EXCEPT after_cook (see calculateAdditives): post-cook acid neutralizes
    // existing soap/lye and must never be compensated. That stage rule is what keeps the
    // LS lye-excess neutralization workflow (an after-cook citric dose) uncompensated
    // while allowing the LS in-lye chelator route. Does not lower finished-soap pH; copy
    // must never imply it does.
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/additives.test.ts`.

- [ ] **Step 5: Commit** — `fix(core): citric offered under LS (1-3% chelator route); stage rule documented`

---

### Task 2: Core — `doseBasis` + `hazards` on the override seam

**Files:**
- Modify: `packages/core/src/additives.ts`
- Test: `packages/core/src/additives.test.ts`

**Interfaces:**
- Produces: `AdditiveCatalogEntry.doseBasis?: DoseBasis`; `AdditiveProcessOverride` gains `doseBasis?: DoseBasis; hazards?: string[]`. Task 3 uses them in data; Task 7 seeds `basis` from `doseBasis`.

- [ ] **Step 1: Write the failing tests**:

```ts
describe('doseBasis / hazards on the override seam (LS audit 2026-07-27)', () => {
  it('merges doseBasis and hazards from an override; base entries default to no doseBasis', () => {
    const probe: AdditiveCatalogEntry = {
      id: 'probe', name: 'Probe', typicalLow: 1, typicalHigh: 2, defaultStage: 'trace',
      hazards: ['base hazard'],
      processOverrides: { ls: { doseBasis: 'solution', hazards: ['ls hazard'] } },
    };
    const ls = effectiveCatalogEntry(probe, 'ls');
    expect(ls.doseBasis).toBe('solution');
    expect(ls.hazards).toEqual(['ls hazard']); // replaces, not appends
    const cp = effectiveCatalogEntry(probe, 'cp');
    expect(cp.doseBasis).toBeUndefined();
    expect(cp.hazards).toEqual(['base hazard']);
  });

  it('solution-based dosing is reachable only under LS (data invariant)', () => {
    for (const entry of ADDITIVE_CATALOG) {
      for (const process of ['cp', 'hp'] as const) {
        // Skip entries never offered for this process — unreachable is fine.
        if (entry.processes && !entry.processes.includes(process)) continue;
        expect(effectiveCatalogEntry(entry, process).doseBasis ?? 'oil').not.toBe('solution');
      }
    }
  });
});
```

(Import `AdditiveCatalogEntry` type in the test file if not present.)

- [ ] **Step 2: Run to verify failure** — Expected: TypeScript-level failure surfaces as vitest transform/type errors are NOT raised by esbuild — the probe object with unknown fields compiles structurally? No: `doseBasis`/`hazards` are not in `AdditiveProcessOverride`, so `tsc` fails but vitest may pass the merge test (spread copies unknown fields). Run BOTH: `npx vitest run src/additives.test.ts` AND `npx tsc --noEmit`. Expected: tsc FAILS (excess property on the override literal); treat that as the red.

- [ ] **Step 3: Implement**:

```ts
export type AdditiveProcessOverride = {
  typicalLow?: number;
  typicalHigh?: number;
  defaultStage?: AdditiveStage;
  /** Overrides the entry's dose basis for this process (e.g. LS doses fragrance and
   * pearlizer as % of the finished solution). REPLACES the base value. */
  doseBasis?: DoseBasis;
  /** Replaces (not appends to) the base hazards for this process — e.g. salt's
   * "crumbly bar" tag is meaningless in LS, where the risk is the salt curve. */
  hazards?: string[];
};
```

On `AdditiveCatalogEntry`, after `doseUnit`:

```ts
  /** Default dose basis a catalog pick seeds (absent = 'oil'). 'solution' is LS-only by
   * data invariant — the finished solution exists only for LS. */
  doseBasis?: DoseBasis;
```

(`effectiveCatalogEntry`'s spread already merges both.) Note: `DoseBasis` is defined lower in the file — move the `type DoseBasis`/`DoseUnit` block above the entry types if declaration order requires.

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/additives.test.ts && npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `feat(core): doseBasis + per-process hazards on the additive override seam`

---

### Task 3: Core — LS overrides + glycerin/pearlizer/wd-shea + finished-soap LS

**Files:**
- Modify: `packages/core/src/additives.ts`
- Test: `packages/core/src/additives.test.ts`

**Interfaces:**
- Produces: catalog ids `glycerin`, `pearlizer`, `wd-shea`; `finished-soap.processes = ['hp','ls']`; `ls` overrides on `sodium-lactate`, `sugar-sorbitol`, `salt`, `fragrance`. Tasks 7–8 depend on these.

- [ ] **Step 1: Write the failing tests**:

```ts
describe('LS dose corrections and new entries (LS audit 2026-07-27)', () => {
  it('sodium lactate LS: 3–5% into the oils (envelope 1–10 documented, not encoded)', () => {
    const ls = effectiveCatalogEntry(catalogEntryById('sodium-lactate')!, 'ls');
    expect([ls.typicalLow, ls.typicalHigh, ls.defaultStage]).toEqual([3, 5, 'oils']);
  });

  it('sugar LS: 1–5% into the oils (less browning than the lye water)', () => {
    const ls = effectiveCatalogEntry(catalogEntryById('sugar-sorbitol')!, 'ls');
    expect([ls.typicalLow, ls.typicalHigh, ls.defaultStage]).toEqual([1, 5, 'oils']);
  });

  it('salt LS: 3–8% at the lye stage, with the salt-curve hazard replacing the bar tag', () => {
    const ls = effectiveCatalogEntry(catalogEntryById('salt')!, 'ls');
    expect([ls.typicalLow, ls.typicalHigh, ls.defaultStage]).toEqual([3, 8, 'lye']);
    expect(ls.hazards).toEqual(['past the salt curve more salt thins, not thickens']);
    const cp = effectiveCatalogEntry(catalogEntryById('salt')!, 'cp');
    expect(cp.hazards).toEqual(['can make the bar crumbly']);
  });

  it('fragrance LS: 0.5–3% of the finished solution (3% max)', () => {
    const ls = effectiveCatalogEntry(catalogEntryById('fragrance')!, 'ls');
    expect([ls.typicalLow, ls.typicalHigh, ls.doseBasis]).toEqual([0.5, 3, 'solution']);
    expect(effectiveCatalogEntry(catalogEntryById('fragrance')!, 'cp').doseBasis).toBeUndefined();
  });

  it('glycerin: LS-only, 20–25% of oils into the lye solution', () => {
    const g = catalogEntryById('glycerin');
    expect([g?.typicalLow, g?.typicalHigh, g?.defaultStage, g?.processes]).toEqual([20, 25, 'lye', ['ls']]);
    expect(g?.doseBasis).toBeUndefined(); // % of oil weight
  });

  it('pearlizer and water-dispersible shea: LS-only, solution-based, after cook', () => {
    const p = catalogEntryById('pearlizer');
    expect([p?.typicalLow, p?.typicalHigh, p?.defaultStage, p?.doseBasis, p?.processes])
      .toEqual([2, 10, 'after_cook', 'solution', ['ls']]);
    const s = catalogEntryById('wd-shea');
    expect([s?.typicalLow, s?.typicalHigh, s?.defaultStage, s?.doseBasis, s?.processes])
      .toEqual([1, 25, 'after_cook', 'solution', ['ls']]);
  });

  it('finished soap extends to LS', () => {
    expect(catalogEntryById('finished-soap')?.processes).toEqual(['hp', 'ls']);
    expect(catalogEntriesForProcess('ls').some((e) => e.id === 'finished-soap')).toBe(true);
  });
});
```

UPDATE broken pins from #130 in this same step: the `finished-soap` test's `catalogEntriesForProcess('ls')… toBe(false)` flips to `true` (or drop that line — the new describe pins it).

- [ ] **Step 2: Run to verify failure** — Expected: every new test fails against current data.

- [ ] **Step 3: Implement** — data only. Overrides (append to existing `processOverrides` where one exists):

```ts
    // sodium-lactate — after the existing hp override:
      // LS runs it harder still, typically into the oils before the lye goes in; the
      // source's full envelope is 1–10% of oils (liquid form, ~60–70% solution).
      ls: { typicalLow: 3, typicalHigh: 5, defaultStage: 'oils' },

    // sugar-sorbitol — after the hp override:
      // LS doses sugar like HP but prefers the oils over the lye water (less browning).
      ls: { typicalLow: 1, typicalHigh: 5, defaultStage: 'oils' },

    // salt — new processOverrides map:
    processOverrides: {
      // The LS start-of-cook dose (3–8% of oils ≈ 0.5–3% of the final solution at ~35%
      // concentration) suppresses the paste phase; past the salt curve more salt THINS.
      // The bar-crumble tag is meaningless in LS, so the hazard is replaced per-process.
      ls: {
        typicalLow: 3,
        typicalHigh: 8,
        hazards: ['past the salt curve more salt thins, not thickens'],
      },
    },

    // fragrance — new processOverrides map:
    processOverrides: {
      // LS doses fragrance as a concentration in the finished solution, 3% max — well
      // below bar-soap oil-weight percentages.
      ls: { typicalLow: 0.5, typicalHigh: 3, doseBasis: 'solution' },
    },
```

New entries (place glycerin near sugar/sorbitol; pearlizer/wd-shea near guar/hec):

```ts
  {
    // Glycerin — LS solvent and saponification/dilution accelerant, dosed into the lye
    // solution as % of oils (source envelope 1–25%; 20–25% is the typical high-temp
    // no-paste dose). The other book mode — swapping 1–2 parts of the lye-solution water
    // for glycerin — is the 'glycerin' split-liquid preset, not this entry. Excluded from
    // the high_total_additives sum (a 20%+ solvent dose is deliberate, not an extras
    // load). Solvent effect: expect less dilution water — glycerin_solvent_dilution
    // advises, no numeric model exists.
    id: 'glycerin',
    name: 'Glycerin',
    typicalLow: 20,
    typicalHigh: 25,
    defaultStage: 'lye',
    processes: ['ls'],
  },
  {
    // Pearlizer (glycol stearate/distearate) — melted flakes, dosed as % of the finished
    // solution; some products go in at trace, most after cook/dilution.
    id: 'pearlizer',
    name: 'Pearlizer (glycol stearate)',
    typicalLow: 2,
    typicalHigh: 10,
    defaultStage: 'after_cook',
    doseBasis: 'solution',
    processes: ['ls'],
  },
  {
    // Water-dispersible shea — self-emulsifying emollient/opacifier, % of the finished
    // solution, after dilution.
    id: 'wd-shea',
    name: 'Water-dispersible shea',
    typicalLow: 1,
    typicalHigh: 25,
    defaultStage: 'after_cook',
    doseBasis: 'solution',
    processes: ['ls'],
  },
```

`finished-soap`: `processes: ['hp', 'ls'],` + append to its comment: `// LS uses it identically (into the hot oils); the LS source doses it in absolute ounces — the % range carries over from the HP use of the same technique.`

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/additives.test.ts`, then `npx vitest run` (whole package).

- [ ] **Step 5: Commit** — `feat(core): LS dose overrides (SL, sugar, salt, fragrance); glycerin/pearlizer/wd-shea; finished-soap LS`

---

### Task 4: Core — sugar ceiling CP 4 / HP+LS 5

**Files:**
- Modify: `packages/core/src/insights.ts`
- Test: `packages/core/src/insights.test.ts`

**Interfaces:**
- Consumes: existing `input.process`, `input.sugarTotalPercent`.
- Produces: `sugar_total_high` fires >4 under CP (and no-process), >5 under HP and LS.

- [ ] **Step 1: Write the failing tests** — UPDATE the #130 describe (`'is process-aware: 4.5% warns under CP and LS but not under HP'`) to the new contract and add the LS copy case:

```ts
  it('is process-aware: 4.5% warns under CP only; HP and LS tolerate up to 5%', () => {
    for (const [process, fires] of [['cp', true], ['ls', false], ['hp', false]] as const) {
      expect(has({ ...base, process, sugarTotalPercent: 4.5 }, 'sugar_total_high')).toBe(fires);
    }
    for (const process of ['ls', 'hp'] as const) {
      expect(has({ ...base, process, sugarTotalPercent: 5.5 }, 'sugar_total_high')).toBe(true);
    }
  });

  it('LS copy carries the ~5% figure and still names yogurt (only HP excludes it upstream)', () => {
    const hit = analyzeFormulation({ ...base, process: 'ls', sugarTotalPercent: 5.5 }).find(
      (i) => i.code === 'sugar_total_high',
    );
    expect(hit!.message).toContain('~5%');
    expect(hit!.message.toLowerCase()).toContain('yogurt');
  });
```

- [ ] **Step 2: Run to verify failure** — LS at 4.5 currently fires; LS message says ~4%.

- [ ] **Step 3: Implement** — in the `sugar_total_high` block:

```ts
  // …existing mechanism/tolerance comment, updated: CP's insulated mold keeps ceiling 4;
  // HP's open cook and LS's high-temp paste both run sugars to ~5 (LS sources endorse
  // 1–5% of oils). Under HP the sum excludes yogurt upstream; CP/LS keep it.
  const sugarCeiling = input.process === 'hp' || input.process === 'ls' ? 5 : 4;
  if (input.sugarTotalPercent !== undefined && input.sugarTotalPercent > sugarCeiling) {
    insights.push({
      level: 'warning',
      code: 'sugar_total_high',
      message:
        input.process === 'hp'
          ? 'Combined sugar-family additives (sugar/sorbitol, honey) exceed ~5% of oil weight — the cook can scorch or volcano. Consider reducing the total dose.'
          : `Combined sugar-family additives (sugar/sorbitol, honey, yogurt) exceed ~${sugarCeiling}% of oil weight — the batch can tunnel or overheat, especially when insulated. Consider reducing the total dose.`,
    });
  }
```

Update the `sugarTotalPercent` field doc: ceiling 4 CP / 5 HP+LS.

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/insights.test.ts`, then `npx vitest run`.

- [ ] **Step 5: Commit** — `fix(core): sugar ceiling — CP 4%, HP and LS 5%`

---

### Task 5: Core — `solvent` flag, glycerin split preset, dilution advisory insight

**Files:**
- Modify: `packages/core/src/alternative-liquids.ts`, `packages/core/src/insights.ts`
- Test: `packages/core/src/alternative-liquids.test.ts`, `packages/core/src/insights.test.ts`

**Interfaces:**
- Produces: `AlternativeLiquidFlag` includes `'solvent'`; preset `glycerin` (waterFraction 0, flags `['solvent']`); `FormulationAnalysisInput.lsGlycerinSolvent?: boolean` → info insight `glycerin_solvent_dilution`. Task 8 consumes the flag; Task 8 wires the input.

- [ ] **Step 1: Write the failing tests** — `alternative-liquids.test.ts`:

```ts
describe('glycerin preset (LS audit 2026-07-27)', () => {
  it('is a zero-water solvent: full grams dissolve lye (hot), none count as water', () => {
    const g = alternativeLiquidPreset('glycerin');
    expect(g?.waterFraction).toBe(0);
    expect(g?.flags).toEqual(['solvent']);
    expect(g?.lyeNeutralization).toBeUndefined();
  });
});
```

`insights.test.ts`:

```ts
  it('advises on dilution when an LS recipe runs glycerin as solvent', () => {
    expect(has({ ...base, process: 'ls', lsGlycerinSolvent: true }, 'glycerin_solvent_dilution')).toBe(true);
    expect(has({ ...base, process: 'ls' }, 'glycerin_solvent_dilution')).toBe(false);
    expect(has({ ...base, process: 'cp', lsGlycerinSolvent: true }, 'glycerin_solvent_dilution')).toBe(false);
  });
```

- [ ] **Step 2: Run to verify failure**.

- [ ] **Step 3: Implement** — `alternative-liquids.ts`:

```ts
export type AlternativeLiquidFlag = 'sugars' | 'alcohol' | 'acid' | 'solvent';
// on ALTERNATIVE_LIQUID_GUIDE (alphabetical/near-water spot):
  {
    key: 'glycerin',
    label: 'Glycerin',
    // Zero water — but a 'solvent' liquid still dissolves the lye when hot (the whole
    // premise of glycerin-method liquid soap), so the 1:1 dissolution floor counts its
    // FULL grams (see the web lyeWaterStatus wiring) while every water-fraction consumer
    // correctly sees 0. Not flagged 'sugars': the method deliberately heats it.
    waterFraction: 0,
    flags: ['solvent'],
  },
```

`insights.ts` — input field + insight:

```ts
  /** True when the recipe delivers glycerin as a lye-solution solvent (split-liquid row
   * or the LS glycerin additive). Advisory only: the source gives no numeric model for
   * how much less dilution water a glycerin recipe needs. */
  lsGlycerinSolvent?: boolean;

  // in analyzeFormulation, near the LS-scoped insights:
  if (input.process === 'ls' && input.lsGlycerinSolvent) {
    insights.push({
      level: 'info',
      code: 'glycerin_solvent_dilution',
      message:
        'Glycerin acts as a solvent: the paste dissolves faster and needs less dilution water than the water-only figure — dilute in increments and stop at the target consistency.',
    });
  }
```

- [ ] **Step 4: Run to verify pass** — both test files, then package + `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `feat(core): glycerin solvent split preset + dilution advisory insight`

---

### Task 6: Web — stage-aware compensation (supersedes the #128 LS gate)

**Files:**
- Modify: `packages/web/src/lib/calculateAdditives.ts`, `packages/web/src/hooks/useRecipeViewModel.ts`, `packages/web/src/components/AdditivesPanel.tsx` (empty-state line only)
- Test: `packages/web/src/lib/calculateAdditives.test.ts`, `packages/web/src/hooks/useRecipeViewModel.test.tsx`, `packages/web/src/components/AdditivesPanel.test.tsx`

**Interfaces:**
- Consumes: Task 1's catalog. Produces: compensation for any line with `addAt !== 'after_cook'`, all processes.

- [ ] **Step 1: Write the failing tests** — `calculateAdditives.test.ts`, in the per-line acid describe:

```ts
  it('never attaches extraLye to an after_cook citric line (post-cook acid is never compensated)', () => {
    const [line] = computeRecipeAdditives(
      [{ key: 'c', catalogId: 'citric-acid', name: 'Citric', amount: '2', basis: 'oil', unit: 'percent', addAt: 'after_cook' }],
      { oilGrams: 1000, batchGrams: 1500, solutionGrams: 0 },
      NAOH_RECIPE,
    );
    expect(line.extraLye).toBeUndefined();
  });
```

`useRecipeViewModel.test.tsx` — REPLACE the #128 test `'under LS a stray citric line is never compensated…'` with:

```ts
test('LS citric: the lye-stage chelator route compensates; the after-cook neutralization route never does', () => {
  let without: any;
  let lyeStage: any;
  let afterCook: any;
  probe((vm) => { without = vm; }, { lyeType: 'koh' }, 'ls');
  probe((vm) => { lyeStage = vm; }, { lyeType: 'koh' }, 'ls', undefined, [CITRIC_LINE]);
  probe((vm) => { afterCook = vm; }, { lyeType: 'koh' }, 'ls', undefined, [{ ...CITRIC_LINE, addAt: 'after_cook' }]);
  // Lye-stage: compensation lands in the KOH figure (grossed by the default KOH purity).
  const line = lyeStage.computedAdditives.find((a: any) => a.catalogId === 'citric-acid');
  expect(line.extraLye.kohGrams).toBeGreaterThan(0);
  expect(lyeStage.result.kohWeightGrams).toBeCloseTo(
    without.result.kohWeightGrams + line.extraLye.kohGrams, 3);
  // After-cook: inert — the #128 protection, now stage-scoped.
  const acLine = afterCook.computedAdditives.find((a: any) => a.catalogId === 'citric-acid');
  expect(acLine.extraLye).toBeUndefined();
  expect(afterCook.result.kohWeightGrams).toBeCloseTo(without.result.kohWeightGrams, 6);
});
```

`AdditivesPanel.test.tsx` — UPDATE the `'does not mention citric under LS…'` test: the empty-state parenthetical now shows for LS too (assert `getByText(/citric acid's compensation lye/)` under `process="ls"`; rename the test accordingly).

- [ ] **Step 2: Run to verify failure** — after_cook line currently GETS extraLye (calculateAdditives is stage-blind) → first test fails; LS lye-stage currently uncompensated → vm test fails; LS empty-state omits the parenthetical → panel test fails.

- [ ] **Step 3: Implement**:

`calculateAdditives.ts` — the factors line becomes stage-aware:

```ts
    // Acid compensation is a PRE-COOK concept: an acid dosed into the lye/oils/batter
    // consumes alkali that the calc must replace. An after_cook acid neutralizes the
    // finished soap's excess lye (the LS neutralization workflow) — compensating it would
    // add that lye straight back, in any process. Stage decides, not process.
    const factors =
      acidLyeRecipe && line.addAt !== 'after_cook'
        ? catalogEntryById(line.catalogId)?.lyeNeutralization
        : undefined;
```

`useRecipeViewModel.ts` — computedAdditives memo: pass `acidLyeRecipe` unconditionally (remove the `process === 'ls' ? undefined :` ternary and its comment; replace with a one-liner pointing at the stage rule in calculateAdditives; drop `process` from the dep array). Dilution memo: add the review-mandated comment:

```ts
  // Deliberately reads the BASE result, not finalResult: acid-compensation alkali (vinegar,
  // lye-stage citric) is consumed into a dissolved salt (acetate/citrate) — no soap solids
  // for the concentration model, no glycerin byproduct (0.55 g/g applies to saponified KOH
  // only). Do not "fix" this to finalResult.
```

`AdditivesPanel.tsx` — empty-state: `math{process === 'ls' ? '' : …}` becomes the unconditional `math (citric acid's compensation lye is added automatically).`

- [ ] **Step 4: Run to verify pass** — the three test files, then all web tests + `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `fix(web): acid compensation is stage-aware — after_cook never compensates, LS lye-stage citric does`

---

### Task 7: Web — basis seeding, basis-aware hint, zero-basis guard, FFA LS variant, glycerin extras exclusion

**Files:**
- Modify: `packages/web/src/components/AdditivesPanel.tsx`, `packages/web/src/hooks/useFormulationInsights.ts`
- Test: `packages/web/src/components/AdditivesPanel.test.tsx`, `packages/web/src/hooks/useFormulationInsights.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3 (doseBasis data), Task 3 entries.

- [ ] **Step 1: Write the failing tests** — `AdditivesPanel.test.tsx`:

```ts
describe('dose-basis seeding and display (LS audit)', () => {
  it('picking pearlizer under LS seeds the solution basis; sodium lactate stays oil-based', () => {
    for (const [id, basis] of [['pearlizer', 'solution'], ['sodium-lactate', 'oil']] as const) {
      let latest: AdditiveLine[] = [];
      const line = makeLine({ name: '' });
      const { unmount } = render(
        <AdditivesPanel additives={[line]} computed={[]} weightUnit="g" process="ls" onChange={(a) => { latest = a; }} />,
      );
      fireEvent.change(screen.getByLabelText(/^Additive type/), { target: { value: id } });
      expect(latest[0].basis).toBe(basis);
      unmount();
    }
  });

  it('the typical-range hint names the basis: solution under LS fragrance, oils under CP', () => {
    const line = makeLine({ catalogId: 'fragrance', name: 'Fragrance / essential oil', amount: '1' });
    const { unmount } = render(
      <AdditivesPanel additives={[line]} computed={[makeComputed(line)]} weightUnit="g" process="ls" onChange={() => {}} />,
    );
    expect(screen.getByText(/Typical 0.5–3% of diluted solution/)).toBeTruthy();
    unmount();
    render(
      <AdditivesPanel additives={[line]} computed={[makeComputed(line)]} weightUnit="g" process="cp" onChange={() => {}} />,
    );
    expect(screen.getByText(/Typical 2–6% of oil weight/)).toBeTruthy();
  });

  it('a solution-based row with no dilution shows the set-concentration hint instead of silent 0 g', () => {
    const line = makeLine({ catalogId: 'pearlizer', name: 'Pearlizer (glycol stearate)', amount: '5', basis: 'solution' });
    const zeroRow = { ...makeComputed(line), grams: 0, basis: 'solution' as const };
    render(
      <AdditivesPanel additives={[line]} computed={[zeroRow]} weightUnit="g" process="ls" onChange={() => {}} />,
    );
    expect(screen.getByText(/soap concentration/i)).toBeTruthy();
  });

  it('salt shows the salt-curve hazard under LS and the crumble hazard under CP', () => {
    const line = makeLine({ catalogId: 'salt', name: 'Table salt (NaCl)', amount: '4' });
    const { unmount } = render(
      <AdditivesPanel additives={[line]} computed={[makeComputed(line)]} weightUnit="g" process="ls" onChange={() => {}} />,
    );
    expect(screen.getByText(/salt curve/)).toBeTruthy();
    unmount();
    render(
      <AdditivesPanel additives={[line]} computed={[makeComputed(line)]} weightUnit="g" process="cp" onChange={() => {}} />,
    );
    expect(screen.getByText(/crumbly/)).toBeTruthy();
  });
});
```

UPDATE the #130 FFA-hint test (`'tells HP users…; silent under CP and LS'`): LS now shows the 5–10% variant; CP stays silent:

```ts
  it('tells HP (5–8%) and LS (5–10%) users to dose free fatty acids as oils; silent under CP', () => {
    for (const [process, range] of [['hp', '5–8%'], ['ls', '5–10%']] as const) {
      const r = render(
        <AdditivesPanel additives={[]} computed={[]} weightUnit="g" process={process} onChange={() => {}} />,
      );
      expect(screen.getByText(/stearic, lauric, myristic/i).textContent).toContain(range);
      r.unmount();
    }
    render(<AdditivesPanel additives={[]} computed={[]} weightUnit="g" process="cp" onChange={() => {}} />);
    expect(screen.queryByText(/stearic, lauric, myristic/i)).toBeNull();
  });
```

`useFormulationInsights.test.ts`:

```ts
  it('excludes glycerin from the total-additives percent (deliberate solvent dose, not extras)', () => {
    const total = totalAdditivePercentForInsights(
      [
        { catalogId: 'glycerin', name: 'Glycerin', grams: 220 },
        { catalogId: 'clay', name: 'Clay', grams: 10 },
      ] as any,
      1000,
    );
    expect(total).toBeCloseTo(1, 5);
  });
```

(Match `totalAdditivePercentForInsights`'s real signature/fixture shape from the file's existing tests.)

- [ ] **Step 2: Run to verify failure** — basis seeds 'oil' for pearlizer; hint always says "of oil weight"; zero-basis rows silent; salt shows crumble under LS (base hazards); FFA hint absent under LS; glycerin counts in extras total.

- [ ] **Step 3: Implement** — `AdditivesPanel.tsx`:

1. `selectCatalog`: add `basis: entry.doseBasis ?? 'oil',` to the `updateLine` patch (entry is already resolved per process from #130).
2. Range hint: `…{entry.doseUnit === 'ppt' ? ' ppt' : '%'} of {entry.doseBasis === 'solution' ? 'diluted solution' : 'oil weight'}`.
3. Zero-basis guard, after the range hint block:

```tsx
                {row && row.grams === 0 && line.basis === 'solution' &&
                  parseDoseAmount(line.amount, line.unit) !== null && line.amount !== '' && (
                  <p className="additive-list__hint" role="alert">
                    Set the soap concentration (dilution) to size solution-based doses
                  </p>
                )}
```

4. FFA hint becomes process-variant (`process === 'hp' || process === 'ls'` gate):

```tsx
      {(process === 'hp' || process === 'ls') && (
        <p className="results-hint">
          Free fatty acids (stearic, lauric, myristic) saponify — dose them as oils in the oils
          list, typically {process === 'hp' ? '5–8%' : '5–10%'} of oils for a fluid
          {process === 'hp' ? ' cook' : ' no-paste cook'}.
        </p>
      )}
```

`useFormulationInsights.ts` — in `totalAdditivePercentForInsights`, filter out glycerin with a why-comment (deliberate solvent dose at 20–25% of oils; counting it makes the 10% extras warning permanent for every glycerin-method recipe — same shape as `excludeYogurt`).

- [ ] **Step 4: Run to verify pass** — both files, all web tests, `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `feat(web): solution-basis seeding + basis-aware hints; LS FFA variant; glycerin off the extras total`

---

### Task 8: Web — glycerin split row end-to-end (ratio-mode sizing, solvent floor, step copy, advisory wiring)

**Files:**
- Modify: `packages/web/src/lib/splitLiquidSizing.ts`, `packages/web/src/hooks/useRecipeViewModel.ts`, `packages/web/src/hooks/useFormulationInsights.ts`, the split-liquid step-copy module (locate via `grep -rn "splitLiquidProcedureStep" packages/web/src/lib`)
- Test: `packages/web/src/lib/splitLiquidSizing.test.ts`, `packages/web/src/hooks/useRecipeViewModel.test.tsx`, the step-copy module's test

**Interfaces:**
- Consumes: Task 5's preset/flag/insight.
- Produces: `SplitLiquidCalcOverride.targetRatio?: number` (total liquid = targetRatio × lye grams, resolved post-calc); `percent_of_liquid` and `rest` sizing valid under `lye_water_ratio`.

- [ ] **Step 1: Write the failing tests** — `splitLiquidSizing.test.ts`:

```ts
describe('lye_water_ratio budget allocation (LS audit 2026-07-27)', () => {
  const ratioSettings = (rows: SplitLiquidRow[]) =>
    ({ ...DEFAULT_SETTINGS, waterMode: 'lye_water_ratio', lyeWaterRatio: '3', splitLiquids: rows }) as RecipeSettings;

  it('a 66.7% glycerin share reduces the effective ratio to 3×(1−0.667)≈1 and reports targetRatio 3', () => {
    const rows = [{ key: 'g1', presetKey: 'glycerin', name: 'Glycerin', customWaterPercent: '', sizeMode: 'percent_of_liquid' as const, amount: '66.7', addAt: 'lye' as const }];
    const o = splitLiquidCalcOverride(ratioSettings(rows), 1000);
    expect(o).not.toBeNull();
    expect(Number(o!.settingsForCalc.lyeWaterRatio)).toBeCloseTo(3 * (1 - 0.667), 3);
    expect(o!.targetRatio).toBe(3);
    expect(o!.targetLiquidGrams).toBeNull();
  });

  it('a rest row under ratio mode pins the water at the 1:1 floor', () => {
    const rows = [{ key: 'r1', presetKey: '', name: 'Milk', customWaterPercent: '', sizeMode: 'rest' as const, amount: '', addAt: 'trace' as const }];
    const o = splitLiquidCalcOverride(ratioSettings(rows), 1000);
    expect(o!.settingsForCalc.waterMode).toBe('lye_water_ratio');
    expect(o!.settingsForCalc.lyeWaterRatio).toBe('1');
    expect(o!.targetRatio).toBe(3);
  });

  it('percent_of_oils behavior is unchanged (regression)', () => {
    const rows = [{ key: 'p1', presetKey: 'milk', name: 'Milk', customWaterPercent: '', sizeMode: 'percent_of_liquid' as const, amount: '50', addAt: 'lye' as const }];
    const o = splitLiquidCalcOverride(
      { ...DEFAULT_SETTINGS, waterMode: 'percent_of_oils', waterPercentOfOils: '38', splitLiquids: rows } as RecipeSettings,
      1000,
    );
    expect(o!.targetLiquidGrams).toBe(380);
    expect(o!.targetRatio).toBeUndefined();
  });
});
```

`useRecipeViewModel.test.tsx`:

```ts
test('an LS glycerin split row (2 of 3 parts) passes the lye floor and yields the dilution advisory', () => {
  const GLYCERIN_ROW = {
    key: 'g1', presetKey: 'glycerin', name: 'Glycerin', customWaterPercent: '',
    sizeMode: 'percent_of_liquid' as const, amount: '66.7', addAt: 'lye' as const,
  };
  let vm: any;
  probe((v) => { vm = v; }, { lyeType: 'koh', waterMode: 'lye_water_ratio', lyeWaterRatio: '3', splitLiquids: [GLYCERIN_ROW] }, 'ls');
  // Water dropped to ~1 part per part of lye…
  expect(vm.result.waterWeightGrams).toBeCloseTo(vm.result.lyeWeightGrams * 3 * (1 - 0.667), 0);
  // …the glycerin grams resolved post-calc against targetRatio × lye…
  const row = vm.splitLiquidRows.find((r: any) => r.row.presetKey === 'glycerin');
  expect(row.grams).toBeCloseTo(vm.result.lyeWeightGrams * 3 * 0.667, 0);
  // …the floor counts the solvent grams, so no shortfall warning fires…
  expect(vm.lyeWaterStatus?.belowFloor ?? false).toBe(false);
  // …and the advisory insight is present.
  expect(vm.insights.some((i: any) => i.code === 'glycerin_solvent_dilution')).toBe(true);
});
```

(Adapt the `lyeWaterStatus` assertion to the real shape — check `lyeSolutionWaterStatus`'s return type; assert whatever field expresses "below the 1:1 floor" is not raised.)

- [ ] **Step 2: Run to verify failure** — override returns null under ratio mode today; row grams null; floor warns (glycerin brings 0 effective water); no advisory.

- [ ] **Step 3: Implement**:

`splitLiquidSizing.ts`:
- `SplitLiquidCalcOverride` becomes `{ settingsForCalc; targetLiquidGrams: number | null; targetRatio?: number }` — `targetRatio` set for ratio-mode overrides (total liquid = targetRatio × lyeGrams, known only post-calc).
- `splitLiquidCalcOverride`: replace the `waterMode !== 'percent_of_oils'` early-return with a two-branch body. Ratio branch (mirroring the existing structure):

```ts
  if (settings.waterMode === 'lye_water_ratio') {
    const ratio = Number(settings.lyeWaterRatio);
    if (!Number.isFinite(ratio) || ratio <= 0) return null;
    if (hasRest) {
      return {
        settingsForCalc: { ...settings, lyeWaterRatio: '1' },
        targetLiquidGrams: null,
        targetRatio: ratio,
      };
    }
    // Pure ratio arithmetic — no lye grams needed pre-calc: water' = N(1−p)·lye keeps the
    // total liquid constant at N·lye (split, not discount).
    const reduced = ratio * (1 - Math.min(percentOfLiquidShare, 100) / 100);
    return {
      settingsForCalc: { ...settings, lyeWaterRatio: String(Math.round(reduced * 1000) / 1000) },
      targetLiquidGrams: null,
      targetRatio: ratio,
    };
  }
```

- `resolveSplitLiquidRows`'s `SizingContext.targetLiquidGrams` keeps its meaning; the CALLER supplies the post-calc figure.

`useRecipeViewModel.ts`:
- `splitLiquidRows` memo: `targetLiquidGrams: splitOverride ? (splitOverride.targetLiquidGrams ?? splitOverride.targetRatio! * result.lyeWeightGrams) : result.waterWeightGrams` (guard `result` non-null as the memo already does).
- `splitAllocation` (the `targetLiquidGrams` read at ~line 263): same `??` treatment.
- `lyeWaterStatus` memo — solvent floor:

```ts
    // A 'solvent' liquid (glycerin) contributes no water anywhere else (waterFraction 0)
    // but DOES dissolve lye when hot — the glycerin-method premise — so the 1:1
    // dissolution floor counts its full grams.
    const solventGrams = splitLiquidRows.reduce((sum, { row, grams }) => {
      const preset = alternativeLiquidPreset(row.presetKey);
      return row.addAt === 'lye' && grams != null && preset?.flags.includes('solvent')
        ? sum + grams
        : sum;
    }, 0);
```

  …and pass `waterGrams: r.waterWeightGrams + inLyeWaterGrams + solventGrams`.
- Wire the advisory: extend the `useFormulationInsights` options with `lsGlycerinSolvent: splitLiquidRows.some(({ row }) => alternativeLiquidPreset(row.presetKey)?.flags.includes('solvent')) || computedAdditives.some((a) => a.catalogId === 'glycerin')` (the hook forwards it into `analyzeFormulation`; add the passthrough in `useFormulationInsights.ts`).

Step copy — in the module `grep` finds (`splitLiquidProcedureStep`): the in-lye branch appends, for solvent-flagged presets, an original sentence such as `Heat until the glycerin fully dissolves the lye — expect it to take longer than water.` (mirror how the `sugars` scorch caution is keyed on flags; add a matching unit test beside the existing scorch-caution test).

- [ ] **Step 4: Run to verify pass** — the three test files, all web tests, `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `feat(web): glycerin lye-solution mode — ratio-mode split sizing, solvent floor, step copy, advisory`

---

### Task 9: Full verification + PR

- [ ] **Step 1:** Root `npm test` (all workspaces). Expected: green.
- [ ] **Step 2:** `npm run build:web`. Expected: clean.
- [ ] **Step 3:** From `packages/web`: `npx playwright test e2e/exploratory.spec.ts -g "additives|liquid soap|split"`. Expected: pass.
- [ ] **Step 4:** Push; PR titled `fix: LS additive audit — solution-basis dosing, stage-aware citric, glycerin both modes, LS doses`; body maps the spec's six findings to the implementation, lists pinned invariants, verification results.

## Self-Review (completed)

- Spec coverage: §1→T1+T6, §2→T2+T7, §3→T3, §4→T4+T7, §5→T5+T8, §6→T7; amendments (dilution comment→T6, zero-basis guard→T7). All covered.
- Placeholder scan: the step-copy sentence and `lyeWaterStatus` field name are grep-then-mirror instructions with concrete anchors, not TBDs; everything else is literal code.
- Type consistency: `targetLiquidGrams: number | null` + `targetRatio?: number` used identically in T8's two files; `doseBasis`/`hazards` names match T2 def in T3 data and T7 reads; `lsGlycerinSolvent` matches T5 def in T8 wiring.
