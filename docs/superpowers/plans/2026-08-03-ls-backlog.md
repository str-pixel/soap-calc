# LS Backlog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every sourced-but-unimplemented item the LS source audits surfaced — DOS additives, the LS water envelope, the reference's other two dilution methods, measured-paste feedthrough, stearic neutralization, turkey red castor oil — plus three review minors.

**Architecture:** Additive/insight work is data in `@soap-calc/core` (catalog entries, insight rules) consumed by existing web panels. Dilution-method work extends `calculateDilution`/`lsPartialDilution` and the Dilution panel. No new architectural seams; every task lands behind the process gates that already exist (`processOffers`).

**Tech Stack:** TypeScript, React, Vitest, Playwright — existing monorepo patterns only.

## Global Constraints

- **Two references, and they disagree.** The **science reference** (`soap-calc-archive/books for research/SciSoapmaking_extracted/SciSoapmaking_full_text.txt`, cited `SCI:<line>`) ran experiments; the **craft references** (`LS_extracted/LS_reading_text.txt` = `LS:<line>`, `CP_extracted/CP_reading_text.txt`, `UG2HP_extracted/`) state practice. Where a craft book's number contradicts an experiment the book itself gestures at, **follow the experiment and record both figures in a comment** — the precedent is the BHT correction in `insights.ts` (`high_pufa_post_cook_superfat`).
- **ppt is not %.** The science reference doses in parts-per-thousand of oil weight and states the conversion outright (SCI:406, "1 ppt = 0.1%; 1% = 10 ppt"). Every dose taken from it must be converted explicitly in a comment. This exact slip is what put a 10× BHT dose in the app.
- LS-only unless a task says otherwise; CP and HP behaviour must not change.
- TDD: failing test, observe RED, implement, observe GREEN. Characterization tests that pin existing behaviour must be mutation-checked.
- Copy is original and behaviour-only (no book titles, authors, or lifted phrasing).
- Per package: `npm run test -w @soap-calc/core` / `-w @soap-calc/web`. Before finishing: `npm test`, `npx tsc -p packages/web --noEmit`, `npm run build:web`, `npm run test:e2e -w @soap-calc/web`.
- Commit at the end of each task on a branch off `main`.

---

### Task 1: DOS additives — BHT and ROE entries, chelator dose reconciliation

**Files:**
- Modify: `packages/core/src/additives.ts` (two new entries; audit `edta` and `chelator`)
- Modify: `packages/core/src/additives.test.ts`

**Interfaces:**
- Produces: catalog ids `bht`, `roe`. Both `doseUnit: 'percent'`, basis oil (default), `defaultStage: 'oils'`, all processes (DOS is not process-specific — the experiments were on CP bars, and HP/LS carry the same unsaponified oil).

**Grounding (verify each before writing):** SCI:3234 tested every preservative at "0.1 grams of each per 100.0 of oil, i.e., 1 ppt of the oil weight". SCI:3244 gives the author's own recommendations: **1 ppt cosmetic-grade BHT to the oil** (= 0.1%), **1–2 ppt high-rosmarinic ROE to the oil** (= 0.1–0.2%), **0.5 ppt cosmetic-grade EDTA to the lye or water** (= 0.05%). SCI:3239: BHT still effective at 0.7 ppt; EDTA "most potent", effective at 0.3 ppt. SCI:3234 also found **grapefruit seed extract, vitamin C, vitamin E and sodium citrate showed no prophylactic effect alone** — do NOT add those as anti-DOS entries.

- [ ] **Step 1: Write the failing test** — append to `additives.test.ts`:

```ts
describe('anti-DOS antioxidants', () => {
  it('ships BHT and ROE at the experimentally recommended doses', () => {
    const bht = catalogEntryById('bht')!;
    expect([bht.typicalLow, bht.typicalHigh]).toEqual([0.1, 0.1]); // 1 ppt of oil
    expect(bht.defaultStage).toBe('oils');
    const roe = catalogEntryById('roe')!;
    expect([roe.typicalLow, roe.typicalHigh]).toEqual([0.1, 0.2]); // 1–2 ppt of oil
    expect(roe.defaultStage).toBe('oils');
  });

  it('does not ship the additives the experiment found ineffective alone', () => {
    // Grapefruit seed extract, vitamin C and vitamin E showed no prophylactic effect
    // against DOS; offering them as anti-DOS doses would advertise a null result.
    for (const id of ['gse', 'vitamin-c', 'vitamin-e']) {
      expect(catalogEntryById(id)).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run packages/core/src/additives.test.ts -t "anti-DOS"`. Expected: FAIL, `catalogEntryById('bht')` undefined.

- [ ] **Step 3: Implement** — add to `ADDITIVE_CATALOG`, after the `edta` entry:

```ts
  {
    // BHT — antioxidant, NOT a preservative: it slows the oxidation of unsaponified oil
    // (rancidity / DOS), which is a fat problem, not a microbial one. Bar soap needs it
    // as much as liquid soap does; the study behind this dose was run on CP bars.
    // Dose is the experiment's own recommendation: 1 ppt of oil weight = 0.1%. It was
    // still effective at 0.7 ppt. Three craft books print "1%" — 10x this, above typical
    // cosmetic use and above the EU cap — which is why the figure here is the tested one.
    id: 'bht',
    name: 'BHT (antioxidant)',
    typicalLow: 0.1,
    typicalHigh: 0.1,
    defaultStage: 'oils',
  },
  {
    // Rosemary oleoresin extract — the natural-route antioxidant. Rosmarinic acid is the
    // active fraction, so the effective dose depends on the extract's strength: the
    // experiment found 1.2 ppt of rosmarinic acid needed to push the induction period
    // past its 300-hour limit, and recommends 1–2 ppt of a HIGH-rosmarinic ROE by weight.
    id: 'roe',
    name: 'ROE (rosemary oleoresin)',
    typicalLow: 0.1,
    typicalHigh: 0.2,
    defaultStage: 'oils',
  },
```

- [ ] **Step 4: Verify** — `npm run test -w @soap-calc/core` green. Then check the golden fixture is untouched: `git diff --stat packages/core/src/__fixtures__/insights-golden.json` (expect empty — catalog entries do not feed the insight matrix).

- [ ] **Step 5: Audit the chelator doses (verification, may or may not change code).** Three figures are in play and they do not agree:
  - app `edta`: 0.1–0.5% of **oil** weight; app `chelator` (citrate/gluconate): 1% of oil weight;
  - craft CP book: *"The usage rate for EDTA is commonly 0.5% of the total **cured soap** weight"* — a different basis (cured soap ≈ oils + lye − water loss, so ~0.38% of oil weight);
  - science reference: **0.5 ppt = 0.05% of oil** recommended, effective at 0.3 ppt.

  Read all three in situ, then decide and record. If you conclude the app's figure is another ppt→% slip, correct it and comment both figures as the BHT entry does. If the craft basis is defensible for hard-water chelation (a different purpose from DOS prevention), leave the numbers and add a comment stating that the anti-DOS dose is an order of magnitude lower and why both exist. **Do not change a number without writing down which source won and why.**

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(core): BHT and ROE antioxidant entries at the tested doses"`

---

### Task 2: DOS-risk insight

**Files:**
- Modify: `packages/core/src/insights.ts` (one rule, after `high_pufa_post_cook_superfat`)
- Modify: `packages/core/src/insights.test.ts`, `packages/core/src/insights.golden.test.ts`

**Interfaces:**
- Consumes: `input.fattyAcids`, `fattyAcidCoveragePercent`, `additiveEntries` (all existing).
- Produces: insight code `dos_risk_no_antioxidant` (info, all processes).

- [ ] **Step 1: Write the failing tests:**

```ts
describe('dos_risk_no_antioxidant', () => {
  const softOils = {
    ...base,
    fattyAcids: { linoleic: 30, linolenic: 6, oleic: 40 },
    fattyAcidCoveragePercent: 100,
  };
  it('suggests an antioxidant for a high-PUFA recipe carrying none', () => {
    const insight = analyzeFormulation(softOils).find((i) => i.code === 'dos_risk_no_antioxidant');
    expect(insight?.level).toBe('info');
    expect(insight?.message).toMatch(/0\.1% BHT|ROE/);
  });
  it('goes quiet once an antioxidant is in the recipe', () => {
    for (const entry of [
      { catalogId: 'bht', name: 'BHT (antioxidant)' },
      { catalogId: 'roe', name: 'ROE (rosemary oleoresin)' },
      { catalogId: '', name: 'Rosemary oleoresin extract' },
    ]) {
      expect(has({ ...softOils, additiveEntries: [entry] }, 'dos_risk_no_antioxidant')).toBe(false);
    }
  });
  it('stays quiet for low-PUFA recipes and at low coverage', () => {
    expect(has({ ...softOils, fattyAcids: { oleic: 70 } }, 'dos_risk_no_antioxidant')).toBe(false);
    expect(has({ ...softOils, fattyAcidCoveragePercent: 40 }, 'dos_risk_no_antioxidant')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** — append to `INSIGHT_RULES` after `high_pufa_post_cook_superfat`:

```ts
  {
    code: 'dos_risk_no_antioxidant',
    // PUFA-heavy recipes are the ones that develop DOS: the experiment's induction period
    // shortened with soft oils and with catalytic metals. Two independent routes work —
    // an antioxidant against atmospheric oxygen (BHT, ROE) and a chelator against metal
    // ions (EDTA, citrate) — so this only fires when NEITHER kind is present. Info, not
    // warning: DOS is a shelf-life risk, not a safety one, and plenty of makers accept it.
    check: (input) => {
      if (!input.fattyAcids || (input.fattyAcidCoveragePercent ?? 100) < LOW_COVERAGE_PERCENT) {
        return null;
      }
      const pufa = sumFattyAcids(input.fattyAcids, FATTY_ACID_GROUP_KEYS.polyunsaturated);
      if (pufa <= 25) return null;
      const protected_ =
        additiveMatches(input.additiveEntries, 'bht', 'bht') ||
        additiveMatches(input.additiveEntries, 'roe', 'rosemary') ||
        additiveMatches(input.additiveEntries, 'edta', 'edta') ||
        additiveMatches(input.additiveEntries, 'chelator', 'citrate');
      if (protected_) return null;
      return {
        level: 'info',
        code: 'dos_risk_no_antioxidant',
        message:
          'High linoleic + linolenic with no antioxidant or chelator — this is the profile ' +
          'that develops rancid orange spots first. 0.1% BHT or 0.1–0.2% ROE into the oils ' +
          'protects against oxygen; a chelator binds the metal ions that catalyse it. ' +
          'Distilled water and cool, dark storage do the same job for free.',
      };
    },
  },
```

- [ ] **Step 4: Bookkeeping** — add `'dos_risk_no_antioxidant'` to `ALL_CODES` in `insights.golden.test.ts` (alphabetical, after `dual_lye_advanced`), bump the count comments, and add a `PROBES` entry in `insights.test.ts`. Then check the golden fixture: if any matrix cell has PUFA > 25 with coverage ≥ threshold it will now emit this code — regenerate by replacing only the affected `insights` arrays and confirm with `git diff` that no other cell changed. Report how many cells moved.

- [ ] **Step 5: Verify** — `npm run test -w @soap-calc/core` green.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(core): DOS-risk insight for unprotected high-PUFA recipes"`

---

### Task 3: LS water envelope (25–60% of oils)

**Files:**
- Modify: `packages/web/src/lib/process.ts` (new `waterEnvelope` field on `ProcessProfile`, populated for LS)
- Modify: `packages/core/src/insights.ts` (one rule), `insights.test.ts`, `insights.golden.test.ts`
- Modify: `packages/web/src/hooks/useFormulationInsights.ts` (pass the envelope)
- Modify: `packages/web/src/lib/process.test.ts`

**Grounding:** LS:1487 — *"You can use anything from a 25-60% water concentration or anywhere from a one to five ratio."* The 30-minute method narrows to 30–40% (LS:2723). This is a single envelope, NOT the two-tier `WaterBand` CP/HP use — which is why LS's `waterBand` is null and must stay null.

**Interfaces:**
- Produces: `ProcessProfile.waterEnvelope: [number, number] | null`; `FormulationAnalysisInput.waterEnvelope?: [number, number]`; insight code `ls_water_outside_envelope`.

- [ ] **Step 1: Failing tests** — in `process.test.ts`:

```ts
it('LS carries a single sourced water envelope, not a two-tier band', () => {
  const ls = PROCESS_DEFINITIONS.ls.variants[0];
  expect(ls.waterEnvelope).toEqual([25, 60]);
  expect(ls.waterBand).toBeNull(); // the two-tier shape has no LS source
});
```

  and in `insights.test.ts`:

```ts
describe('ls_water_outside_envelope', () => {
  const lsBase = { ...base, process: 'ls' as const, waterEnvelope: [25, 60] as [number, number] };
  it('flags water below and above the sourced envelope', () => {
    // 200 g water on 1,000 g oils = 20%; 700 g = 70%.
    expect(has({ ...lsBase, waterGrams: 200 }, 'ls_water_outside_envelope')).toBe(true);
    expect(has({ ...lsBase, waterGrams: 700 }, 'ls_water_outside_envelope')).toBe(true);
  });
  it('is quiet inside it, and never fires for CP or HP', () => {
    expect(has({ ...lsBase, waterGrams: 380 }, 'ls_water_outside_envelope')).toBe(false);
    expect(has({ ...base, process: 'cp', waterGrams: 200 }, 'ls_water_outside_envelope')).toBe(false);
  });
});
```

- [ ] **Step 2: Verify RED.**

- [ ] **Step 3: Implement** — add `waterEnvelope: [number, number] | null` to `ProcessProfile` (doc: *"Single acceptable water range as % of oils. LS only: the reference gives one envelope rather than the two tiers CP/HP publish, so this cannot reuse WaterBand."*), set `[25, 60]` on the LS variant and `null` on all CP/HP variants. Thread it in `useFormulationInsights` alongside `waterBand`. Add the rule:

```ts
  {
    code: 'ls_water_outside_envelope',
    processes: ['ls'],
    // The one water figure the LS reference publishes: 25–60% of oil weight (equivalently
    // about 1:1 to 5:1 water:lye). Outside it the recipe still works, so this is info —
    // low water makes a stiffer paste that takes longer to dilute, high water a softer one
    // that can weep. The 1:1 dissolution floor is a separate, harder rule (water_below_lye).
    check: (input) => {
      const [lo, hi] = (input.waterEnvelope ?? []) as [number, number];
      if (lo === undefined || input.totalOilGrams <= 0 || input.waterGrams <= 0) return null;
      const pct = (input.waterGrams / input.totalOilGrams) * 100;
      const EPS = 1e-9;
      if (pct >= lo - EPS && pct <= hi + EPS) return null;
      return {
        level: 'info',
        code: 'ls_water_outside_envelope',
        message:
          pct < lo
            ? `Water is ${pct.toFixed(0)}% of oils, below the usual ${lo}–${hi}% for liquid soap — the paste will be stiffer and slower to dilute. Workable, but check it stays mixable.`
            : `Water is ${pct.toFixed(0)}% of oils, above the usual ${lo}–${hi}% for liquid soap — a softer paste that can weep in storage. Fine if you are diluting straight away.`,
      };
    },
  },
```

- [ ] **Step 4: Bookkeeping + verify** — `ALL_CODES`, counts, `PROBES`, golden regeneration if any LS matrix cell moves (report the count). `npm test` green.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ls): water envelope insight (25-60% of oils)"`

---

### Task 4: Ratio dilution and gradual-dilution guidance

**Files:**
- Modify: `packages/web/src/components/DilutionPanel.tsx`, `DilutionPanel.test.tsx`
- Modify: `packages/web/src/App.tsx` (one piece of state)

**Grounding:** LS:1531 gradual — *add enough water to cover, then small increments to the consistency wanted*. LS:1534 ratio — *weigh the paste, then add 1:1 / 2:1 / 3:1 water:paste by weight*. LS:1536 concentration — what the app already implements. The app has the ratio as a READOUT (Task: `waterPasteRatio` in `PartialDilution`) but never as an INPUT.

**Interfaces:**
- Produces: `dilutionMode: 'concentration' | 'ratio'` App state; when `ratio`, the panel takes a water:paste ratio and derives the concentration rather than the reverse.

- [ ] **Step 1: Failing test** — in `DilutionPanel.test.tsx`:

```ts
test('ratio mode derives the concentration a water:paste ratio lands on', () => {
  // Paste 1,600 g (1,200 anhydrous + 400 cook water) at 2:1 → 3,200 g water added,
  // solution 4,800 g, so anhydrous is 1,200/4,800 = 25% soap.
  render(
    <DilutionPanel
      dilution={RESULT}
      soapConcentrationPercent="30"
      onSoapConcentrationChange={() => {}}
      weightUnit="g"
      dilutionMode="ratio"
      waterPasteRatio="2"
      onDilutionModeChange={() => {}}
      onWaterPasteRatioChange={() => {}}
    />,
  );
  expect(screen.getByText(/lands at 25% soap/i)).toBeTruthy();
  expect(screen.getByText(/^3,200 g/)).toBeTruthy();
});
```

- [ ] **Step 2: Verify RED.**

- [ ] **Step 3: Implement.** Add a mode selector (`Target concentration` / `Water : paste ratio`) above the concentration field. In ratio mode, replace the concentration input with a ratio input (`step={0.5}`, min 0.5) and compute: `pasteGrams = anhydrous + cookWater` (or the measured paste from Task 5 when present), `waterGrams = pasteGrams × ratio`, `solution = pasteGrams + waterGrams`, `concentration = anhydrous / solution × 100`. Render the derived concentration prominently (`lands at N% soap`) so the two modes stay reconcilable, and keep every existing row rendering off the same figures.

- [ ] **Step 4: Add the gradual-dilution note** — one `results-hint` below the figures, shown in both modes:

```tsx
<p className="results-hint">
  Whichever figure you start from, add the water in stages: enough to cover the paste,
  then more in small amounts, and give it time between — the paste swells and keeps
  absorbing. Recording where you stopped makes the next batch of the same recipe exact.
</p>
```

- [ ] **Step 5: Verify** — web suite + `tsc` green. **Step 6: Commit** — `git add -A && git commit -m "feat(ls): dilute by water:paste ratio, plus incremental-dilution guidance"`

---

### Task 5: Measured paste corrects the batch figures

**Files:**
- Modify: `packages/web/src/App.tsx` (pass `measuredPasteGrams` to `DilutionPanel`)
- Modify: `packages/web/src/components/DilutionPanel.tsx`, `DilutionPanel.test.tsx`

**Why:** the measurement currently only reaches `PartialDilution`. The reference weighs the paste precisely because the computed figure cannot account for cook evaporation (LS:2172, LS:2294 — its own tables are asterisked as estimates for this reason), so the BATCH dilution water is wrong by the same amount the portion figures were.

- [ ] **Step 1: Failing test:**

```ts
test('a measured paste corrects the batch dilution water', () => {
  // Predicted paste 1,600 g. Measured 1,480 g — 120 g evaporated — so reaching the same
  // 4,000 g solution needs 120 g more water: 2,520 g rather than 2,400 g.
  render(
    <DilutionPanel
      dilution={RESULT}
      soapConcentrationPercent="30"
      onSoapConcentrationChange={() => {}}
      weightUnit="g"
      measuredPasteGrams="1480"
    />,
  );
  expect(screen.getByText(/^2,520 g/)).toBeTruthy();
  expect(screen.getByText(/measured paste/i)).toBeTruthy();
});
```

- [ ] **Step 2: Verify RED.** **Step 3: Implement** — accept optional `measuredPasteGrams?: string`; when present and valid (finite, > `anhydrousGrams`, ≤ `solutionGrams` — the same guards `PartialDilution` uses), render `solutionGrams − measured` as the dilution water instead of `dilution.dilutionWaterGrams`, and add a hint naming that the figure came from the measurement. Leave `DilutionResult` itself untouched: this is a display-level correction, and pushing it into `calculateDilution` would require threading the measurement through the whole view model.

- [ ] **Step 4: Verify + commit** — `git add -A && git commit -m "feat(ls): measured paste corrects the batch dilution water too"`

---

### Task 6: Stearic acid as a neutralization alternative

**Files:**
- Modify: `packages/core/src/neutralization.ts`, `neutralization.test.ts`
- Modify: `packages/web/src/components/NeutralizePanel.tsx` + its test

**Grounding:** LS:1234–1240. Stearic acid reacts with the excess alkali to form a water-soluble soap; any surplus cools, floats and is filtered off — so unlike citric it **cannot be overdosed** (*"you can't use 'too much' like you can with citric acid"*), which makes it the beginner-safe route. Stoichiometry is 1 mol stearic per 1 mol OH⁻; stearic acid C₁₈H₃₆O₂, MW **284.484** g/mol (verify: 18×12.011 + 36×1.008 + 2×15.999).

- [ ] **Step 1: Failing test** — in `neutralization.test.ts`:

```ts
it('offers a stearic-acid alternative sized to the same excess alkali', () => {
  const r = calculateNeutralization({
    kohGrams: 206, naohGrams: 0, superfatPercent: -3,
    kohPurityPercent: 90, naohPurityPercent: 100,
  })!;
  // Same molOH the citric figure is built from, at 1 mol stearic per mol OH.
  const molOH = (206 * (3 / 103) * 0.9) / 56.1056;
  expect(r.stearicAcidGrams).toBeCloseTo(molOH * 284.484, 1);
  // Citric is triprotic, stearic monoprotic, so stearic is ~4.4x the citric weight.
  expect(r.stearicAcidGrams / r.citricAcidGrams).toBeGreaterThan(4);
});
```

- [ ] **Step 2: Verify RED.** **Step 3: Implement** — add `STEARIC_ACID_MW = 284.484` to `molar-masses.ts`, `stearicAcidGrams: number` to `NeutralizationResult`, and `stearicAcidGrams: molOH * STEARIC_ACID_MW` to the returned object, with a comment carrying the monoprotic-vs-triprotic reason and the cannot-overdose property.

- [ ] **Step 4: Surface it** — in `NeutralizePanel`, add a row `Or stearic acid` with the grams and a one-line note: *"Melt it into the warm soap. It cannot be overdosed — any surplus cools into a white layer you filter off — which makes it the safer first attempt."* Test that both figures render.

- [ ] **Step 5: Verify + commit** — `git add -A && git commit -m "feat(ls): stearic acid neutralization alongside citric"`

---

### Task 7: Turkey red castor oil entry

**Files:** `packages/core/src/additives.ts`, `additives.test.ts`

**Grounding:** LS:1260–1263 — sulfonated castor oil, the one oil that is water-soluble, added **after dilution**, typical rate **1–5% of the total solution**; LS:3062 confirms the after-dilution timing and its colour/odour caveats.

- [ ] **Step 1: Failing test:**

```ts
it('ships turkey red castor oil as an LS solution-dosed conditioner', () => {
  const e = catalogEntryById('turkey-red-castor')!;
  expect([e.typicalLow, e.typicalHigh]).toEqual([1, 5]);
  expect(e.doseBasis).toBe('solution');
  expect(e.defaultStage).toBe('after_cook');
  expect(e.processes).toEqual(['ls']);
});
```

- [ ] **Step 2: Verify RED.** **Step 3: Implement** — add after `wd-shea`:

```ts
  {
    // Sulfonated castor oil — the one oil that disperses in water, so it conditions a
    // finished liquid soap without the separation an ordinary oil would cause. Added
    // after dilution, as % of the finished solution. It carries a light red-orange colour
    // and a faint own odour; both show at the top of the range.
    id: 'turkey-red-castor',
    name: 'Turkey red castor oil',
    typicalLow: 1,
    typicalHigh: 5,
    defaultStage: 'after_cook',
    doseBasis: 'solution',
    processes: ['ls'],
  },
```

- [ ] **Step 4: Verify + commit** — `git add -A && git commit -m "feat(ls): turkey red castor oil additive"`

---

### Task 8: Review minors

**Files:** `packages/core/src/ls-yield.ts` + test, `packages/web/src/components/PartialDilution.tsx` + test, `packages/web/src/App.tsx`

- [ ] **Step 1: Failing tests** for all three:

```ts
// ls-yield.test.ts — core returns what the component was recomputing
it('returns the predicted paste weight so callers need not recompute it', () => {
  const r = lsPartialDilution(
    { anhydrousGrams: 1200, totalWaterGrams: 2800, dilutionWaterGrams: 2400, solutionGrams: 4000,
      measuredPasteGrams: 1480 },
    1000,
  )!;
  expect(r.predictedPasteGrams).toBeCloseTo(1600, 0);
});
```

```tsx
// PartialDilution.test.tsx — ratio keeps a useful digit at the extremes
test('the water:paste ratio never renders as 0.0 beside a real water figure', () => {
  render(<PartialDilution {...PROPS} targetMl="1000" measuredPasteGrams="3900" />);
  expect(screen.queryByText(/^0\.0 : 1/)).toBeNull();
});
```

```tsx
// App-level: the measurement must not outlive the recipe it describes
test('clears the measured paste when the recipe oils change', () => { /* drive the App
   harness: set a measurement, change an oil weight, assert the field is empty */ });
```

- [ ] **Step 2: Verify RED.** **Step 3: Implement:**
  - add `predictedPasteGrams` to `LsPartialDilution` (it is already computed in the unmeasured branch — return it in both) and consume it in `PartialDilution` instead of the component's duplicate expression;
  - format the ratio with `ratio < 0.1 ? ratio.toFixed(2) : ratio.toFixed(1)`;
  - in `App.tsx`, clear `measuredPasteGrams` in the same handler that mutates recipe lines (a `useEffect` on the lines' identity is acceptable if no single handler covers every path — state the choice in a comment).

- [ ] **Step 4: Verify + commit** — `git add -A && git commit -m "fix(ls): review minors — predicted paste from core, ratio precision, measurement reset"`

---

### Task 9: Full verification

- [ ] `npm test` — all three packages green.
- [ ] `npx tsc -p packages/web --noEmit` — clean.
- [ ] `npm run build:web` — clean.
- [ ] `npm run test:e2e -w @soap-calc/web` — update only assertions the new UI genuinely moved (the dilution mode selector adds a control above the concentration field). Report every changed assertion.
- [ ] Commit — `git add -A && git commit -m "test(ls): full verification for the LS backlog"`

---

## Out of scope

Anything requiring a source we do not have: a measured LS solution density (the 1.03 g/ml proxy stays), per-variant LS water-loss constants, and any numeric model for how much less dilution water a glycerin recipe needs (the reference states the effect and gives no figure — `glycerin_solvent_dilution` stays advisory).

## Self-review notes

- Every dose in this plan carries its source line and its ppt→% conversion where one applies.
- Task 1 Step 5 and Task 2 Step 4 are deliberately verification-first: the chelator doses and the golden-fixture impact cannot be settled from the desk, and guessing them is how the BHT error shipped.
- Type consistency: `waterEnvelope` is `[number, number] | null` on the profile and `[number, number] | undefined` on the insight input (matching how `waterBand` is already threaded); `predictedPasteGrams` is added to `LsPartialDilution` in Task 8 and consumed in the same task.
