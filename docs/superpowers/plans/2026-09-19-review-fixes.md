# Whole-App Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every confirmed math, data, copy, and code defect from the 2026-09-19 whole-app review, plus the two optimisations with a measured payoff, each grounded in a cited source or in first-principles arithmetic, each pinned by a test.

**Architecture:** Core math and data fixes go first (they change shipped numbers), then core insight rules, then the web calculation layer, then performance and cleanup. Every task is independent unless its **Interfaces** block says otherwise. No task invents a number: each threshold, formula, or method is quoted from the source archive (line-cited below) or derived from the repo's own existing definition.

**Tech Stack:** TypeScript, vitest, React 18 + @testing-library/react (jsdom), npm workspaces. Run all commands from `/Users/str/soap-calc`.

**Spec:** This plan is its own spec. Section **Grounding** below records, per finding, what the review measured and what the sources say. The review's confirmed findings are also recorded in `~/.claude/projects/-Users-str-soap-calc/memory/whole-app-review-2026-09-19.md`.

## Global Constraints

- Minimal patches. No drive-by refactors beyond the tasks listed. (AGENTS.md)
- `npm test` must pass before finishing (typecheck → validate:oils → unit tests). (AGENTS.md)
- Book quotes are for grounding only. UI copy must be original and short; cite behaviour, not sources. (AGENTS.md "Formulation features & content")
- Property/insight constants live in `@soap-calc/core` under neutral names. (AGENTS.md)
- Do not auto-commit or auto-push unless the user asks; each task below ends with a commit step the executor runs only when the user has asked for commits. (AGENTS.md)
- Source archive citations use the conventions verified 2026-09-19: `LS:<n>` with n ≤ 3637 → `LS_extracted/LS_reading_text.txt`, n > 3637 → `LS_extracted/LS_full_text.txt`; `HP:<n>` → `UG2HP_extracted/UG2HP_full_text.txt`; `CP:<n>` → `CP_extracted/CP_full_text.txt`; `Sci:<n>` → `SciSoapmaking_extracted/SciSoapmaking_full_text.txt`; all under `/Users/str/soap-calc-archive/books for research/`.
- Data tasks rebuild and validate: `npm run build:oils && npm run validate:oils`, and commit the regenerated `packages/oils-data/data/*.json`.

---

## Grounding (what was measured, what the sources say)

Every item was reproduced by running a script against the real modules on 2026-09-19 before this plan was written. Baseline: 2,792 tests green.

| # | Finding | Measured | Source ruling |
|---|---------|----------|---------------|
| G1 | `deriveChemistryFromProfile` averages molar mass by weight; the stoichiometry needs the mole-weighted (harmonic) mean | Equal-mass trilaurin + tristearin: exact SAP 0.226103, harmonic 0.226103, current code 0.219628 (−2.9%). Catalog: coconut-oil-76 derives 0.2468 vs 0.2537; cohune correction shipped as 0.246, harmonic 0.253. No profile-closest tiebreak flips (59 checked). Iodine changes < 0.1 across the catalog. | Sci:2557 single-triglyceride derivation (glycerol + 3·FA − 3·H₂O); Sci:2563 "The saponification value of an oil will depend on the percentages of its tags and their individual saponification values". A mass mixture's SAP is the mass-weighted mean of the component SAPs; only the harmonic form reproduces it (the test in Task 1 is that identity). No book names a mean. |
| G2 | INS never recomputed after SAP resolution | 54/127 oils have `ins ≠ round(sapMgKohPerGram − iodine)`; tucuma 175 vs 225, canola 56 vs 76, flax −6 vs 11, coconut-oil-76 258 vs 248. Legacy catalog itself is inconsistent on 41/133 rows. | No book defines INS (only calculator screenshots: HP:9941, CP:13120, "136 - 165"). The repo's own definition, applied on the correction paths (`build-canonical.ts:323`, `:407`; `fatty-acid-chemistry.ts` `ins`), is INS = round(SAP mg KOH/g − iodine). Task 2 applies that one definition everywhere; the tars keep their placeholder. |
| G3 | Three `LEGACY_TO_FNWL_ALIASES` keys keep parenthetical text the normalizer strips | Lard, jojoba, carnauba ship `legacy_only`; FNWL rows exist (Lard 0.193; Jojoba Oil, Natural 0.092; Carnauba Wax Flakes 0.087). | Code contract: "Keys MUST be normalizeOilName(legacy display name)" (`normalize.ts:26`). |
| G4 | Even-count FNWL name groups pick the lower-middle row | Baobab: rows 'Baobab Oil'=0.19 and 'Baobab Oil, Unrefined'=0.173 → 0.173 → 13.5% delta → `estimated` 0.20. | Engineering rule, not a source figure: prefer the FNWL row whose raw name equals the catalog name (median among several such rows). Dry-run effect: baobab → 0.19 `verified`; grapeseed 0.193 → 0.19 `verified` (INCI kept via a correction entry); hemp 0.191 → 0.193; watermelon, kukui, soybean unchanged. |
| G5 | Tamanu ships the wrong species INCI | FNWL product `oiltamanucpvirin728` says "Calophyllum Tacamahaca"; FNWL's other tamanu row and the curated `byOilId` entry say inophyllum; `resolve-inci.ts` ranks the chart above `byOilId`, so the curated entry is unreachable. | AGENTS.md: `inciCorrections` is the authoritative override layer for malformed FNWL chart values, verified against the CosIng inventory. The `byOilId` note already records "matches CALOPHYLLUM INOPHYLLUM SEED OIL". |
| G6 | Post-cook superfat, subtract mode | Lye is scaled for p% of ALL oils, but the sheet prints the oils at full weight and says the PCSF comes "from oils above"; the picker accepts oils not in the recipe. Following the sheet literally (1000 g oils + 50 g jojoba, lye for 950 g) delivers 9.88% superfat where 7.85% is claimed. | HP:5684-5686 "PCSF% X Total Oil Weight = Total PCSF Weight, then Total Oil Weight – PCSF = Starting soap calculator weight"; HP:5699-5703 the calculator is run on the reduced total; HP:5563-5566 the PCSF is weighed and set aside; HP:5639-5640 it is an oil "of my choice". So: the recipe oils are reduced proportionally (the blend keeps its percentages), the lye is sized to the reduced oils, and the PCSF oil is a separate material. The app's lye scaling and its delivered-superfat figure (7.85%) are already this method; the printed oil weights and the provenance copy are not. |
| G7 | LS dilution counts subtract-reserved oil as soap solids, append-mode oil as an extra | Subtract: anhydrous 1199.92 (1000 oil + 199.92 lye) though only 900 g was saponified; append: 1222.13 with the 100 g as an extra. At 30% the subtract arm sizes ~333 g more water. | LS:1543 "Anhydrous soap … is the total amount of soap created through the saponification reaction, not including the water. … adding the weight of the KOH/NaOH to the weight of the oils"; LS:1267 the PCSF is "without counting them in our initial formulation". Anhydrous = oils that went through the cook + alkali, in both methods. This supersedes the 2026-07-11 PCSF spec's "Dilution needs no change". |
| G8 | Split-liquid printed equation | "140 g lye water + 290 g alternative liquid = 330 g total liquid" when a `percent_of_oils` row (100 g) sits on top of a `rest` row (190 g). | Code contract: `allocation.targetLiquidGrams` is the budget; only `isBudgetSizeMode` rows draw on it (`splitLiquidSizing.ts:28`). |
| G9 | Insight copy and gating | Epsom/Dead Sea salt fires "do not use" AND "add salt gradually"; `no_superfat_margin` fires at −3% with "0% superfat" copy beside `ls_lye_excess`; LS sugar ceiling 5 vs catalog 1–6; "Dried rosemary"/"Rosemary oil" silence the DOS warning; Polysorbate 20 / Tween 20 silence the polysorbate-80 prompt; `ls_salt_thickening` prints the after-dilution brine copy for a lye-stage salt. | CP:10623-10626 magnesium salts "not advised" (scum). LS:1161/1195 lye excess is a distinct, deliberate state neutralized after dilution. LS:1069 sugar "between 1-6% Total Oil Weight" (the 5% figures at LS:2665-2752 are the 30-minute-method chapter). LS:1018/HP:4871/CP:5566 name the antioxidant "Rosemary Oleoresin Extract (ROE)"; rosemary leaves/EO appear only as fragrance or botanicals (CP:9941). LS:1274 "Polysorbate 80 … emulsify carrier oils and Polysorbate 20 … fragrance and essential oils". LS:2625/2628 salt at the start (3–8% of oils) keeps the paste fluid; LS:3089-3091 salt after dilution thickens to a peak then thins, dissolved 1:2 in water. |
| G10 | Formatting | `formatWeight(0.04,'g')` → "0 g" (turmeric's sourced low end on 100 g oils is 0.028 g); a 0.3 g line stores "0". | App's own rules: the weightUnits test title "never renders a positive dose as 0 g"; `syncWeightEdit` empties a line only for an exact zero. |
| G11 | Line sync | Typing a total clears the grams of a line that has grams but no percent when another line has a percent (reachable: clear total → edit one percent → edit another weight → type total). | Module's own principle: "editing one oil never moves another" (`lineWeightSync.test.ts` header). |
| G12 | `capAllocatedSum` writes "33.400000000000006" | 33.3/33.3/40 → third row `'33.400000000000006'`. | Percents display at 0.1 (`PERCENT_ROUNDING_EPSILON`, `roundPct`). |
| G13 | Blank / whitespace settings | Dual lye under CP with `kohBlendPercent: ''` computes 0% KOH silently; `' '` water % computes 0 g water. | Every other blank numeric field either defaults or errors visibly; none silently computes zero. |
| G14 | `solveOilTotalForBatchTarget` loops forever at `currentBatchGrams` 0 | Killed after 15 s. Caller-guarded today. | Defensive guard only. |
| G15 | pagehide flush ignores an unblurred draft | Field 600, stored 450 after `pagehide`; 600 after blur. | Autosave's stated purpose (useRecipeAutosave.ts:85-90). |
| G16 | Settings keystroke rebuilds everything | A `batchNotes`, `soapingTempF` or `preservativeDosePct` keystroke changes the identity of `result`, `insights`, `cureEstimate`, `batchSheetData`. Cause: `usePreviewSettings` spreads the whole settings object and `useRecipeCalculation` memoizes on it. (Insights recomputing on `soapingTempF` is legitimate — the rules read it; the rest is not.) | `calculateRecipe` reads exactly nine settings fields (via `parseRecipeSettings`); `resolveLineWeights` ignores settings by contract (`useRecipeProperties.ts:8`). |
| G17 | Lite bundle | `confidence` is emitted for 127 oils and read nowhere in the web (typed only). 70,582 → 66,315 bytes without it. `aliases` IS read by `searchOils`; 126/127 equal `[normalizeOilName(displayName)]` (a further 6.8 KB, gated below). | Measured. |
| G18 | Dead code / duplicates | `isRecord` ×5; `normalizePostCookSuperfatOils` called twice in `normalizeSettings`; `resolveLineWeights` returns `weightPercent` and `errors` nobody reads; `calculateProperties.ts` imported only by its own test; `commitOnEnter` ×2; App has three non-functional `setSettings({ ...settings })` closures and one unused memo dep. | Measured by grep. |

**Not planned, with reasons** (so nobody re-reviews them):
- `high_short_chain_low_long_chain` + `high_cleansing_low_superfat` co-firing on coconut bars: two distinct conditions (chain balance vs cleansing verdict × superfat); no source says one supersedes the other.
- DilutionPanel per-render recomputation, unmemoized panels, insight-internal re-summing, per-call `RegExp`, catalog linear `find`s: measured trivial at recipe sizes; memoizing panels first needs stable handlers (`useRecipeInputs` returns a fresh object per render).
- PCSF rows keyed by index: no visible symptom; a fix needs a persisted `key` on `PostCookSuperfatOil` (storage + normalize change).
- Pricing divides by the wet batch weight: a product choice, not a defect.
- Six blank-number parsers with divergent `''` handling: each is correct for its caller; unifying is a behaviour change with no defect behind it.
- `ldg` source record duplicating FNWL, unused `FnwlRow.sapNaoh`, `buildBatchSheetData` identity spread, radar geometry constants ×2, `recipeSummary.ts` size: harmless.
- Autosave duplicate write after import (plausible, unverified): verify first with a test; not planned until it fails.

---

## Phase A — core math and oil data

### Task 1: Mole-weighted mean in the SAP/iodine derivation

**Files:**
- Modify: `packages/core/src/fatty-acid-chemistry.ts:77-106`
- Modify: `packages/oils-data/src/sap-corrections.ts:31-35`
- Modify: `packages/oils-data/src/profile-backfill.ts:44-45` (comment only)
- Test: `packages/core/src/fatty-acid-chemistry.test.ts`

**Interfaces:**
- Produces: `deriveChemistryFromProfile(profile)` — same signature; `sapKoh` and `iodineValue` now computed with `meanMolarMass = mappedPercent / Σ(pct_i / MW_i)`.

- [ ] **Step 1: Write the failing mixture tests**

Append to `packages/core/src/fatty-acid-chemistry.test.ts`:

```ts
describe('mixture stoichiometry (mole-weighted mean molar mass)', () => {
  // Sci:2563: an oil's SAP "will depend on the percentages of its tags and their individual
  // saponification values" — a mass mixture's SAP is the mass-weighted mean of the components'.
  // Only the mole-weighted (harmonic) mean over a WEIGHT-% fatty-acid profile reproduces that.
  const backbone = GLYCEROL_MOLAR_MASS - 3 * WATER_MOLAR_MASS;
  const lauricMw = 200.32;
  const stearicMw = 284.48;
  const oleicMw = 282.46;
  const trilaurinMw = 3 * lauricMw + backbone;
  const tristearinMw = 3 * stearicMw + backbone;
  const trioleinMw = 3 * oleicMw + backbone;

  /** Equal MASSES of two pure triglycerides, expressed as the fatty-acid weight-% profile the
   * catalog stores (each TG contributes 3·MW_fa / MW_tg of its mass as fatty acid). */
  function equalMassProfile(a: { acid: string; faMw: number; tgMw: number }, b: { acid: string; faMw: number; tgMw: number }) {
    const faA = (0.5 * 3 * a.faMw) / a.tgMw;
    const faB = (0.5 * 3 * b.faMw) / b.tgMw;
    const total = faA + faB;
    return { [a.acid]: (100 * faA) / total, [b.acid]: (100 * faB) / total };
  }

  it('derives the mass-weighted mean SAP of equal masses of trilaurin and tristearin', () => {
    const expected = ((3 * KOH_MOLAR_MASS) / trilaurinMw + (3 * KOH_MOLAR_MASS) / tristearinMw) / 2;
    const profile = equalMassProfile(
      { acid: 'lauric', faMw: lauricMw, tgMw: trilaurinMw },
      { acid: 'stearic', faMw: stearicMw, tgMw: tristearinMw },
    );
    expect(deriveChemistryFromProfile(profile)!.sapKoh).toBeCloseTo(expected, 6);
  });

  it('derives the mass-weighted mean iodine value of equal masses of trilaurin and triolein', () => {
    // Trilaurin has no double bond; triolein's oil-basis IV is 3·253.809·100 / MW_tg.
    const expected = (0 + (3 * 253.809 * 100) / trioleinMw) / 2;
    const profile = equalMassProfile(
      { acid: 'lauric', faMw: lauricMw, tgMw: trilaurinMw },
      { acid: 'oleic', faMw: oleicMw, tgMw: trioleinMw },
    );
    expect(deriveChemistryFromProfile(profile)!.iodineValue).toBeCloseTo(expected, 6);
  });
});
```

- [ ] **Step 2: Run the test file to verify the two new tests fail**

Run: `npm run test -w @soap-calc/core -- src/fatty-acid-chemistry.test.ts`
Expected: 2 failures. SAP: `expected 0.2196284… to be close to 0.2261034…`. IV: `expected 43.0615… to be close to 42.9976…` (off in the second decimal).

- [ ] **Step 3: Switch the derivation to the mole-weighted mean**

In `packages/core/src/fatty-acid-chemistry.ts`, replace the body of `deriveChemistryFromProfile` (lines 80-106) with:

```ts
  let molesPerMapped = 0; // Σ pct_i / MW_i — moles of fatty acid per `mappedPercent` grams of FA
  let mappedPercent = 0;
  let iodineValueFaBasis = 0;

  for (const [acid, percent] of Object.entries(profile)) {
    const fa = FATTY_ACID_PROPERTIES[acid];
    if (!fa || !(percent > 0)) continue;
    molesPerMapped += percent / fa.molecularWeight;
    mappedPercent += percent;
    iodineValueFaBasis += (percent * fa.doubleBonds * DIIODINE_MASS) / fa.molecularWeight;
  }

  if (mappedPercent < MIN_MAPPED_PERCENT) return null;

  // Mole-weighted (harmonic) mean molar mass. The profile is in WEIGHT percent and
  // saponification consumes one KOH per MOLE of fatty acid, so the mean that makes a
  // blend's SAP the mass-weighted mean of its triglycerides' SAPs (Sci:2563) is
  // mapped ÷ Σ(pct/MW). The mass-weighted arithmetic mean used until 2026-09-19 over-
  // weighted the heavy acids and derived lauric oils ~3% low (coconut 0.2468 against a
  // measured ~0.258; see the mixture tests).
  const meanMolarMass = mappedPercent / molesPerMapped;
  const sapKoh = (3 * KOH_MOLAR_MASS) / (3 * meanMolarMass + GLYCERYL_ADJUSTMENT);
  // The Σ above is per `mappedPercent` grams of *fatty acids*; renormalize to a
  // per-100 g FA basis, then convert FA→oil basis with the fatty-acyl mass fraction of the
  // mixture's triglyceride — exact for the same harmonic mean (100 g FA is 100/MW_h moles,
  // carried on (100/MW_h)/3 moles of backbone).
  const glycerideFactor = (3 * meanMolarMass) / (3 * meanMolarMass + GLYCERYL_ADJUSTMENT);
  const iodineValue = iodineValueFaBasis * (100 / mappedPercent) * glycerideFactor;
  const ins = Math.round(sapKoh * 1000 - iodineValue);

  return { sapKoh, iodineValue, ins, mappedPercent };
```

- [ ] **Step 4: Run the core tests**

Run: `npm run test -w @soap-calc/core -- src/fatty-acid-chemistry.test.ts src/fatty-acid-display-groups.test.ts`
Expected: PASS (single-acid profiles are unchanged: the two means coincide for one acid, so the tristearin drift guard and the triolein IV tests still hold).

- [ ] **Step 5: Re-derive the cohune correction**

In `packages/oils-data/src/sap-corrections.ts` replace the `'cohune-oil'` entry with:

```ts
  'cohune-oil': {
    sapKoh: 0.253,
    iodine: 10,
    note: 'Corrected: legacy SAP (0.205) is impossibly low for a lauric palm-kernel oil — below the saponification value of any lauric composition, and inconsistent with cohune’s own fatty-acid profile (which derives ~0.253 with the mole-weighted mean; the 0.246 shipped until 2026-09-19 came from the mass-weighted mean). 0.253 sits beside the catalog’s FNWL-verified lauric relatives (babassu 0.251, coconut 0.258). No FNWL match, so the correction applies here. Legacy iodine (30) is likewise high vs the profile-derived ~10 (cohune is ~96% saturated); corrected to 10 so the recomputed INS is not re-poisoned.',
  },
```

In `packages/oils-data/src/profile-backfill.ts` lines 44-45, replace the whole clause `FA-derived SAP ≈ 0.247 (runs ~4% below the measured ~0.257 — the known lauric-oil range-midpoint effect)` with `FA-derived SAP ≈ 0.254 (1.3% below the measured ~0.257 — within the 8% gate)` (measured: coconut-oil-76 derives 0.2537 with the mole-weighted mean).

- [ ] **Step 6: Rebuild, validate, run the data tests**

Run: `npm run build:oils && npm run validate:oils && npm run test -w @soap-calc/oils-data`
Expected: build OK; validate reports no new errors (the `ESTIMATED_SAP_KOH` map pulls cohune's 0.253 from `LEGACY_SAP_CORRECTIONS`); `profile-sap-consistency.test.ts` still lists exactly buriti, nutmeg-butter, ucuuba-butter (measured: 10.1%, −29.5%, −13.3%); `profile-backfill.test.ts` avocado gate still inside 8%.
Check: `node -e "const d=require('./packages/oils-data/data/canonical-oils.json');const o=d.oils.find(x=>x.id==='cohune-oil');console.log(o.sapKoh,o.iodine,o.ins)"` prints `0.253 10 243`.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/fatty-acid-chemistry.ts packages/core/src/fatty-acid-chemistry.test.ts packages/oils-data/src/sap-corrections.ts packages/oils-data/src/profile-backfill.ts packages/oils-data/data
git commit -m "fix(core): derive SAP and iodine with the mole-weighted mean molar mass

A weight-% fatty-acid profile needs the harmonic mean to reproduce the
mass-weighted SAP of a triglyceride mixture; the arithmetic mean read lauric
oils ~3% low. Cohune's profile-derived correction moves 0.246 -> 0.253.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: INS derived from the resolved SAP and iodine for every oil

**Files:**
- Modify: `packages/oils-data/scripts/build-canonical.ts` (after the `IODINE_CORRECTIONS` block, ~line 410)
- Modify: `packages/oils-data/scripts/validate-canonical.ts` (per-oil loop, after the `sapMgKohPerGram` check ~line 92)

**Interfaces:**
- Produces: `canonical-oils.json` / `-lite.json` where every non-tar oil satisfies `ins === Math.round(sapMgKohPerGram − iodine)`.

- [ ] **Step 1: Add the validator check first (it is the failing test)**

In `packages/oils-data/scripts/validate-canonical.ts`, inside `for (const oil of db.oils)`, directly after the `sapMgKohPerGram inconsistent with sapKoh` check, add:

```ts
    // INS is a derived index — SAP (mg KOH/g) minus iodine value, the repo's one definition
    // (fatty-acid-chemistry.ts, the SAP and iodine correction paths in build-canonical).
    // Tars are exempt: no triglyceride, placeholder 0/0, and the web excludes them.
    if (oil.iodine !== undefined && oil.ins !== undefined && oil.category !== 'tar') {
      const expectedIns = Math.round(oil.sapMgKohPerGram - oil.iodine);
      if (oil.ins !== expectedIns) {
        errors.push(`${oil.id}: ins ${oil.ins} != round(sapMgKohPerGram − iodine) = ${expectedIns}`);
      }
    }
```

- [ ] **Step 2: Run validate to see it fail on the shipped data**

Run: `npm run validate:oils`
Expected: exits non-zero with 52 `ins … != round(…)` errors (tucuma-seed-butter 175 vs 225, canola-oil 56 vs 76, flax-oil-linseed −6 vs 11, hemp-oil 39 vs 26, coconut-oil-76 258 vs 248, …). Pine-tar and birch-tar are not listed.

- [ ] **Step 3: Derive INS in the build**

In `packages/oils-data/scripts/build-canonical.ts`, directly after the `if (iodineCorrection) { … }` block (which ends with `report.iodineCorrected.push(leg.name);` and `}`), add:

```ts
    // INS = round(SAP mg KOH/g − iodine): the definition the two correction paths above
    // already apply. Until 2026-09-19 it was applied ONLY there, and every other oil kept
    // the legacy catalog's INS — a figure that catalog computed from ITS SAP and iodine.
    // Once resolution moved the SAP (45 FNWL oils) the shipped INS no longer matched the
    // shipped SAP and iodine (54 of 127 oils; tucuma read 175 where its own numbers give
    // 225). Tars keep their placeholder: no triglyceride, and the web excludes them.
    if (iodine !== undefined && category !== 'tar') {
      ins = Math.round(sapKoh * 1000 - iodine);
    }
```

(`sapKoh`, `iodine`, `ins`, `category` are the loop's existing `let`/`const` bindings; `sapKoh` is final at this point — resolution and both correction paths run above.)

- [ ] **Step 4: Rebuild and validate**

Run: `npm run build:oils && npm run validate:oils`
Expected: validate passes with zero `ins` errors.
Check: `node -e "const d=require('./packages/oils-data/data/canonical-oils.json');for(const id of ['tucuma-seed-butter','canola-oil','flax-oil-linseed','coconut-oil-76'])console.log(id,d.oils.find(x=>x.id===id).ins)"` prints `225 76 11 248`.

- [ ] **Step 5: Run the whole suite; fix any golden that pinned an inherited INS**

Run: `npm test`
Expected: PASS. If a web or oils-data test asserts a specific oil's old INS (search `grep -rn "ins:" packages/web/src --include='*.test.*' | grep -v "ins: null"` — quote the glob or zsh reports "no matches found"; in the dry run all 15 hits were `indexes: { iodine, ins }` fixture objects and none pinned a catalog INS), update the literal to the derived value and note it in the commit body — those tests were pinning the stale figure.

- [ ] **Step 6: Commit**

```bash
git add packages/oils-data/scripts/build-canonical.ts packages/oils-data/scripts/validate-canonical.ts packages/oils-data/data
git commit -m "fix(oils-data): derive INS from the resolved SAP and iodine for every oil

INS = round(SAP mg KOH/g - iodine) was applied only on the correction paths;
52 oils shipped an inherited INS that no longer matched their SAP. The
validator now asserts the identity for every non-tar oil.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3: FNWL alias keys that can match

**Files:**
- Modify: `packages/oils-data/src/normalize.ts:57,64,66` (the three keys inside `LEGACY_TO_FNWL_ALIASES`)
- Test: `packages/oils-data/src/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/oils-data/src/normalize.test.ts`, add imports at the top:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
```

and inside `describe('LEGACY_TO_FNWL_ALIASES', …)` add:

```ts
  it('every alias key is the normalized name of an oil in the legacy catalog (else the alias is dead)', () => {
    const legacyPath = join(dirname(fileURLToPath(import.meta.url)), '../../../soap_oils.json');
    // soap_oils.json is `{ oils: [...] }` (133 rows).
    const legacy = JSON.parse(readFileSync(legacyPath, 'utf8')) as { oils: Array<{ name: string }> };
    const legacyKeys = new Set(legacy.oils.map((row) => normalizeOilName(row.name)));
    const dead = Object.keys(LEGACY_TO_FNWL_ALIASES).filter((key) => !legacyKeys.has(key));
    expect(dead).toEqual([]);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -w @soap-calc/oils-data -- src/normalize.test.ts`
Expected: FAIL with `dead` = `['lard pig tallow manteca', 'jojoba oil a liquid wax ester', 'carnauba copernicia cerifera wax']`.

- [ ] **Step 3: Fix the three keys**

In `packages/oils-data/src/normalize.ts` change:

```ts
  'lard pig tallow manteca': ['lard'],
```
to
```ts
  // "Lard, Pig Tallow (Manteca)": the normalizer strips the parenthetical.
  'lard pig tallow': ['lard'],
```

```ts
  'jojoba oil a liquid wax ester': ['jojoba oil natural', 'jojoba oil golden organic'],
```
to
```ts
  // "Jojoba Oil (a Liquid Wax Ester)" normalizes to the bare name.
  'jojoba oil': ['jojoba oil natural', 'jojoba oil golden organic'],
```

```ts
  'carnauba copernicia cerifera wax': ['carnauba wax flakes'],
```
to
```ts
  // "Carnauba (Copernicia cerifera) wax" normalizes to the bare name.
  'carnauba wax': ['carnauba wax flakes'],
```

- [ ] **Step 4: Run the test, rebuild, validate**

Run: `npm run test -w @soap-calc/oils-data -- src/normalize.test.ts && npm run build:oils && npm run validate:oils`
Expected: test PASS; build report's `unmatched` no longer lists Lard, Jojoba, Carnauba.
Check: `node -e "const d=require('./packages/oils-data/data/canonical-oils.json');for(const id of ['lard-pig-tallow','jojoba-oil','carnauba-wax'])console.log(id,d.oils.find(x=>x.id===id)?.sapKoh,d.oils.find(x=>x.id===id)?.confidence)"` prints `lard-pig-tallow 0.193 verified`, `jojoba-oil 0.092 verified`, `carnauba-wax 0.087 verified`. (Lard's emitted id is `lard-pig-tallow`; legacy 0.198 vs FNWL 0.193 is a 2.5% delta → `fnwl_agrees`; its INS becomes 136 under Task 2.) The build log's `Unmatched (legacy only)` count drops 66 → 63.

- [ ] **Step 5: Run the full suite and commit**

Run: `npm test`
Expected: PASS (lard's INS moves with Task 2's rule; no test pins it).

```bash
git add packages/oils-data/src/normalize.ts packages/oils-data/src/normalize.test.ts packages/oils-data/data
git commit -m "fix(oils-data): alias keys for lard, jojoba and carnauba now match their legacy names

The keys kept parenthetical text that normalizeOilName strips, so the three
oils never reached their FNWL rows. A test now checks every key against
soap_oils.json.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4: Prefer the FNWL row named exactly as the catalog oil

This is the one judgment-call task in the plan (G4): the rule is an identity preference, not a sourced number. The dry run found two side effects the first draft missed, both handled below: the chosen row also decides which FNWL product's chart INCI is used (grapeseed), and several rows can share the exact name (kukui). Effects, measured: baobab 0.20 `estimated` → 0.19 `verified`; grapeseed 0.193 `estimated` → 0.19 `verified` (legacy 0.181, delta 4.97%); hemp 0.191 → 0.193 (`verified` either way); watermelon unchanged at 0.192 (two FNWL rows carry the exact name and the even-count median is the lower one); kukui unchanged; soybean unchanged; `build-report.json` `sapProfileClosest` 11 → 9.

**Files:**
- Modify: `packages/oils-data/src/parse-fnwl.ts:3-9` (`FnwlRow` type) and `:63-69` (dedup)
- Modify: `packages/oils-data/src/match-fnwl.ts:14-29`
- Modify: `packages/oils-data/sources/supplemental-inci.json` (`inciCorrections`: grapeseed)
- Test: `packages/oils-data/src/match-fnwl.test.ts`

**Interfaces:**
- Produces: `FnwlRow.variants?: FnwlRow[]` — every raw row in the name group, set by `parseFnwlCsv` on the representative row. `findFnwlMatch(legacyName, index)` returns the exact-name variant when exactly one row carries the looked-up name; the median of the exact-name rows when several do; else the group's median row as before.

- [ ] **Step 1: Write the failing test**

Add `import { parseFnwlCsv } from './parse-fnwl.js';` to the imports at the top of `packages/oils-data/src/match-fnwl.test.ts`, then append:

```ts
describe('exact-name preference inside a name group', () => {
  it("returns the row literally named as the catalog oil, not the group's lower-middle", () => {
    // Real FNWL: 'Baobab Oil' 0.19 and 'Baobab Oil, Unrefined' 0.173 normalize to one key.
    const text = [
      'OIL,SAP,NAOH,KOH,PRODUCT_ID',
      "'Baobab Oil',180 - 200,0.135,0.19,OILBAOBABCPZW789",
      "'Baobab Oil, Unrefined',140 - 205,0.123,0.173,OILBAOBABEXPFEU614",
    ].join('\n');
    const index = buildFnwlIndex(parseFnwlCsv(text));
    expect(findFnwlMatch('Baobab Oil', index)?.sapKoh).toBe(0.19);
    // No exact name → the documented median rule still applies.
    expect(findFnwlMatch('Baobab Oil, Organic', index)?.sapKoh).toBe(0.173);
  });

  it('takes the median among several rows that all carry the exact name (kukui has four)', () => {
    const text = [
      'OIL,SAP,NAOH,KOH,PRODUCT_ID',
      // A non-median row FIRST in chart order, so a first-match implementation fails this.
      "'Kukui Nut Oil',175 - 195,0.132,0.185,K2",
      "'Kukui Nut Oil',180 - 200,0.135,0.19,K1",
      "'Kukui Nut Oil',185 - 205,0.139,0.195,K3",
    ].join('\n');
    const index = buildFnwlIndex(parseFnwlCsv(text));
    expect(findFnwlMatch('Kukui Nut Oil', index)?.productId).toBe('K1'); // the 0.19 median row
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -w @soap-calc/oils-data -- src/match-fnwl.test.ts`
Expected: 2 failures — the baobab test receives 0.173; the kukui test receives `'K2'` (no exact-name logic yet, so the group median of all three is K1 only by accident of the plan's first draft — with K2 listed first, a first-match rule returns K2 and the group median rule returns K1; only the median-among-exact-names rule returns K1 for both orderings).

- [ ] **Step 3: Carry the group on the representative row and prefer the exact name**

In `packages/oils-data/src/parse-fnwl.ts` add to the `FnwlRow` type:

```ts
  /** Every raw chart row that normalized to this name (set on the representative row by
   * parseFnwlCsv), so a matcher can prefer the row literally named as the catalog oil. */
  variants?: FnwlRow[];
```

and replace the final `return [...byName.values()].map(…)` with:

```ts
  // Keep an actual row per name (preserving its range/productId), chosen at the median
  // sapKoh. For an even count the lower-middle row is used. The whole group rides along as
  // `variants` so findFnwlMatch can prefer an exact-name row (baobab: 'Baobab Oil' 0.19 vs
  // 'Baobab Oil, Unrefined' 0.173 shared one key and the median picked the variant).
  return [...byName.values()].map((group) => {
    const sorted = [...group].sort((a, b) => a.sapKoh - b.sapKoh);
    return { ...sorted[Math.floor((sorted.length - 1) / 2)], variants: group };
  });
```

In `packages/oils-data/src/match-fnwl.ts` replace `findFnwlMatch` with:

```ts
export function findFnwlMatch(
  legacyName: string,
  fnwlIndex: Map<string, FnwlRow>,
): FnwlRow | undefined {
  const norm = normalizeOilName(legacyName);
  const direct = fnwlIndex.get(norm);
  if (direct) return preferExactName(direct, legacyName);

  const aliases = LEGACY_TO_FNWL_ALIASES[norm] ?? [];
  for (const alias of aliases) {
    const hit = fnwlIndex.get(normalizeOilName(alias));
    if (hit) return preferExactName(hit, alias);
  }

  return undefined;
}

/** The chart row whose raw name IS the name we looked up beats the group's median: it is
 * the best-identified row for that oil. Several rows can carry the exact name (kukui has
 * four), so the median among THOSE keeps the documented median rule; with no exact-name
 * row the group's median representative stands. */
function preferExactName(row: FnwlRow, rawName: string): FnwlRow {
  const exact = (row.variants ?? []).filter((v) => v.name.toLowerCase() === rawName.toLowerCase());
  if (exact.length === 0) return row;
  const sorted = [...exact].sort((a, b) => a.sapKoh - b.sapKoh);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}
```

- [ ] **Step 4: Keep grapeseed's verified INCI**

The exact-name grapeseed row is product `OILGRAPECPCL64`, whose chart INCI (`fnwl-inci.txt:1945`) is the tocopherol-blend name "Vitis Vinifera (Grape) Seed Oil, Tocopherol" — present in the FNWL-derived glossary but NOT in the CosIng inventory, and the validator does not warn on that case. Before rebuilding, read the currently shipped name: `node -e "console.log(require('./packages/oils-data/data/canonical-oils.json').oils.find(o=>o.id==='grapeseed-oil').inciName)"` (it is confirmed against the inventory today). Add to `inciCorrections` in `sources/supplemental-inci.json`, using that string verbatim as `inciName`:

```json
    "grapeseed-oil": {
      "inciName": "<the string printed above>",
      "source": "cosing",
      "notes": "The FNWL 'Grape Seed Oil' product (OILGRAPECPCL64) carries a tocopherol-blend chart INCI (\"…Seed Oil, Tocopherol\"); the oil itself is the plain seed oil (matches VITIS VINIFERA (GRAPE) SEED OIL)."
    }
```

- [ ] **Step 5: Run tests, rebuild, validate**

Run: `npm run test -w @soap-calc/oils-data -- src/match-fnwl.test.ts src/parse-fnwl.test.ts && npm run build:oils && npm run validate:oils`
Expected: PASS, 0 validator errors. Data effects (all measured in the dry run): baobab-oil 0.2 `estimated` → 0.19 `verified`; grapeseed-oil 0.193 `estimated` → 0.19 `verified` with its INCI unchanged (the correction now applies; the build's `INCI corrected` count rises by one); hemp-oil 0.191 → 0.193; watermelon-seed-oil unchanged (0.192); kukui-nut-oil unchanged (median of its four exact-name rows; the build's `INCI corrections now redundant: 1` line stays); soybean unchanged. Dry-run figures: `INCI corrected` 10 → 11, oils-data tests 112. `build-report.json` `sapProfileClosest` 11 → 9. Check the four with: `node -e "const d=require('./packages/oils-data/data/canonical-oils.json');for(const id of ['baobab-oil','grapeseed-oil','watermelon-seed-oil','kukui-nut-oil'])console.log(id,d.oils.find(x=>x.id===id).sapKoh,d.oils.find(x=>x.id===id).confidence,d.oils.find(x=>x.id===id).inciName)"`.

- [ ] **Step 6: Full suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add packages/oils-data/src/parse-fnwl.ts packages/oils-data/src/match-fnwl.ts packages/oils-data/src/match-fnwl.test.ts packages/oils-data/sources/supplemental-inci.json packages/oils-data/data
git commit -m "fix(oils-data): prefer the FNWL row named exactly as the catalog oil

An even name group picked the lower-middle row, so baobab matched its
'Unrefined' variant (0.173) and shipped estimated instead of verified 0.19.
Grapeseed keeps its inventory-confirmed INCI through a correction entry.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: Tamanu INCI through the authoritative correction layer

**Files:**
- Modify: `packages/oils-data/sources/supplemental-inci.json` (`inciCorrections`, `byOilId`, `byFnwlProductId`)
- Test: `packages/oils-data/src/resolve-inci.test.ts` (existing correction-beats-chart behaviour), validator drift check (`validate-canonical.ts:150-157`)

- [ ] **Step 1: Confirm the current shipped name (the failing state)**

Run: `node -e "const d=require('./packages/oils-data/data/canonical-oils.json');console.log(d.oils.find(x=>x.id==='tamanu-oil-kamani').inciName)"`
Expected: `Calophyllum Tacamahaca (Tamanu) Seed Oil`.

- [ ] **Step 2: Move the curated name into `inciCorrections`**

In `packages/oils-data/sources/supplemental-inci.json`:
- Add to `inciCorrections`:
```json
    "tamanu-oil-kamani": {
      "inciName": "Calophyllum Inophyllum (Tamanu) Seed Oil",
      "source": "cosing",
      "notes": "Corrects the FNWL chart species for the kamani product (\"Calophyllum Tacamahaca\"): kamani is Calophyllum inophyllum (matches CALOPHYLLUM INOPHYLLUM SEED OIL); FNWL's other tamanu row (oiltamanuexpid383) agrees."
    }
```
- Remove the `"tamanu-oil-kamani"` entry from `byOilId` and the `"oiltamanucpvirin728"` entry from `byFnwlProductId` (both were unreachable behind the chart value). `oiltamanucpvirin728` is the LAST entry of `byFnwlProductId`, so also remove the trailing comma after the `beeftallow` entry's closing brace.

- [ ] **Step 3: Rebuild, validate, test**

Run: `npm run build:oils && npm run validate:oils && npm run test -w @soap-calc/oils-data`
Expected: PASS. The validator's global `source:"cosing"` inventory check accepts the name (it was already accepted as a `byOilId` claim); the `inciCorrections` drift check confirms the built name equals the correction.
Check: the Step 1 command now prints `Calophyllum Inophyllum (Tamanu) Seed Oil`.

- [ ] **Step 4: Commit**

```bash
git add packages/oils-data/sources/supplemental-inci.json packages/oils-data/data
git commit -m "fix(oils-data): tamanu (kamani) ships the Calophyllum inophyllum INCI

The curated byOilId entry was unreachable behind the FNWL chart's
tacamahaca value; the correction layer is the sanctioned override.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 6: Close the oil-keyed guard gaps

**Files:**
- Modify: `packages/oils-data/scripts/build-canonical.ts:484-491` (guard list), imports
- Modify: `packages/oils-data/scripts/validate-canonical.ts:332-338` (`IODINE_CORRECTIONS` lookup; `OIL_ID_OVERRIDES` is already imported at line 20)

- [ ] **Step 1: Extend the guard list**

In `packages/oils-data/scripts/build-canonical.ts` add imports:

```ts
import { KNOWN_PROFILE_SAP_DEVIATIONS } from '../src/profile-sap-deviations.js';
import { KNOWN_PROFILE_IODINE_DEVIATIONS } from '../src/profile-iodine-deviations.js';
```

(`classifyProfileIodineDeviations` is already imported from the second module; add the constant to that import instead of a duplicate line.)

Replace the `oilKeyedEntries` array with:

```ts
  const oilKeyedEntries = [
    ...Object.keys(supplementalInci.inciCorrections),
    ...Object.keys(supplementalInci.byOilId),
    ...Object.keys(LEGACY_SAP_CORRECTIONS),
    ...Object.keys(IODINE_CORRECTIONS),
    ...Object.keys(KNOWN_PROFILE_SAP_DEVIATIONS),
    ...Object.keys(KNOWN_PROFILE_IODINE_DEVIATIONS),
    ...Object.keys(OIL_DISPLAY_NAMES),
    ...Object.keys(OIL_ALLERGEN_ORIGINS),
    ...WAX_ESTER_OIL_IDS,
  ];
```

After the `inertOilKeys` warning block, add a warning for excluded ids that match no legacy row:

```ts
  // An excluded id that no longer matches any legacy row is dead weight in excluded-oils.json
  // (the rows it named have since left soap_oils.json). Warn, so the next exclusion prunes it.
  // Compared against the legacy slugs, not usedSlugs — that set is filled AFTER the exclusion
  // `continue`, so every excluded id is absent from it by construction.
  const legacySlugs = new Set(legacy.oils.map((leg) => slugify(leg.name)));
  const deadExcludedIds = [...excludedOilIds].filter((id) => !legacySlugs.has(id) && !oilIds.has(id));
  if (deadExcludedIds.length) {
    console.warn(`  Excluded ids matching no legacy row (prune from excluded-oils.json): ${deadExcludedIds.join(', ')}`);
  }
```

(`legacy` is the parsed `soap_oils.json` object the build already loads; `excludedOilIds` is the existing set; `slugify` is imported from `../src/normalize.js` — add it to that import if absent.)

- [ ] **Step 2: Unify the `IODINE_CORRECTIONS` key space in the validator**

In `packages/oils-data/scripts/validate-canonical.ts`, replace the iodine-corrections loop with:

```ts
  // Iodine corrections are the single source of truth (build applies, validate asserts).
  // Keyed by BUILD SLUG in both places: the build looks up `baseSlug` before the id override
  // is applied, so the validator maps each emitted id back to its slug the same way.
  const slugByEmittedId = new Map(Object.entries(OIL_ID_OVERRIDES).map(([slug, id]) => [id, slug]));
  for (const oil of db.oils) {
    const corr = IODINE_CORRECTIONS[slugByEmittedId.get(oil.id) ?? oil.id];
    if (corr && oil.iodine !== corr.iodine) {
      errors.push(`${oil.id}: built iodine ${oil.iodine} != IODINE_CORRECTIONS ${corr.iodine}`);
    }
  }
```

- [ ] **Step 3: Build and validate**

Run: `npm run build:oils && npm run validate:oils`
Expected: PASS, 0 errors. Expected warnings: `byOilId` key `linseed-oil-flax` reported as inert (excluded oil); the dead-excluded-ids warning lists 17 ids (chicken-fat, crisco-new-w-palm, crisco-old, duck-fat-flesh-and-skin, emu-oil, ghee-any-bovine, goose-fat, horse-oil, milk-fat-any-bovine, mink-oil, neatsfoot-oil, ostrich-oil, rabbit-fat, salmon-oil, soapquick-conventional, soapquick, walmart-gv-shortening-tallow-palm). The slug-keyed iodine lookup changes no value today: none of the three `IODINE_CORRECTIONS` keys has an id override.

- [ ] **Step 4: Commit**

```bash
git add packages/oils-data/scripts/build-canonical.ts packages/oils-data/scripts/validate-canonical.ts
git commit -m "chore(oils-data): guard byOilId and the deviation maps; key iodine corrections by slug in validate

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 7: AGENTS.md describes the SAP policy the code implements

**Files:**
- Modify: `AGENTS.md` ("SAP resolution policy" bullets)

- [ ] **Step 1: Replace the four policy bullets**

Replace:

```
- FNWL match within 5% of legacy SAP: use FNWL.
- FNWL/legacy delta from 5% to 10%: use the higher SAP as a conservative estimate.
- Delta above 10%: retain legacy unless FNWL is higher.
```

with:

```
- FNWL within 5% of legacy (|legacy − FNWL| ÷ legacy ≤ 5%): use FNWL, confidence `verified`.
- Otherwise, when the oil's fatty-acid profile derives a SAP (≥93% mapped, triglyceride/blend): use whichever of legacy or FNWL lies closer to the profile-derived SAP, confidence `estimated`. A higher SAP is not "safer" — it means more lye and less superfat.
- Otherwise: the midpoint of legacy and FNWL, confidence `estimated`.
```

(The `legacy_only` bullet stays.) This matches `packages/oils-data/src/sap-policy.ts` and its tests; the previous text described a 5–10% "higher SAP" tier that the code never had.

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: describe the SAP resolution policy sap-policy.ts actually implements

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Phase B — core insight rules

### Task 8: Insight gating and copy that match the sources

**Files:**
- Modify: `packages/core/src/keyword-match.ts` (add `matchingAdditiveEntries`, optional `addAt` on `NamedCatalogEntry`)
- Modify: `packages/core/src/insights.ts` (rules `no_superfat_margin` :330-350, `sugar_total_high` :640-652, `magnesium_salt_scum` :735-760, `dos_risk_no_antioxidant` :846-849, `ls_split_liquid_fat_superfat` :938-945, `ls_salt_thickening` :1100-1120, `ls_pcsf_emulsifier` :1165-1175, `hp_thick_phase_suppressant` :1185-1195)
- Modify: `packages/web/src/hooks/useFormulationInsights.ts:214-217` (pass `addAt`)
- Test: `packages/core/src/insights.test.ts`

**Interfaces:**
- Produces: `NamedCatalogEntry.addAt?: 'lye' | 'oils' | 'trace' | 'top' | 'after_cook'`; `matchingAdditiveEntries(entries, catalogId, nameKeyword): T[]` (the entries `additiveMatches` would have matched).

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/insights.test.ts`:

```ts
describe('review fixes 2026-09-19: insight gating and copy', () => {
  const codesFor = (input: FormulationAnalysisInput) => analyzeFormulation(input).map((i) => i.code);
  const messageFor = (input: FormulationAnalysisInput, code: string) =>
    analyzeFormulation(input).find((i) => i.code === code)?.message ?? '';

  it('a magnesium salt gets the scum warning and NOT the add-salt coaching (CP:10623-10626)', () => {
    for (const process of ['ls', 'hp'] as const) {
      const codes = codesFor({ ...base, process, additiveEntries: [{ catalogId: '', name: 'Epsom salt' }] });
      expect(codes).toContain('magnesium_salt_scum');
      expect(codes).not.toContain('ls_salt_thickening');
      expect(codes).not.toContain('hp_thick_phase_suppressant');
    }
    // Plain salt still gets the coaching.
    expect(codesFor({ ...base, process: 'ls', additiveEntries: [{ catalogId: 'salt', name: 'Table salt (NaCl)' }] })).toContain('ls_salt_thickening');
    expect(codesFor({ ...base, process: 'hp', additiveEntries: [{ catalogId: 'salt', name: 'Table salt (NaCl)' }] })).toContain('hp_thick_phase_suppressant');
  });

  it('no_superfat_margin is the 0% case only; a lye excess is ls_lye_excess alone (LS:1161, LS:1195)', () => {
    for (const process of ['cp', 'hp'] as const) {
      const codes = codesFor({ ...base, process, superfatPercent: -3 });
      expect(codes).toContain('ls_lye_excess');
      expect(codes).not.toContain('no_superfat_margin');
      expect(codesFor({ ...base, process, superfatPercent: 0 })).toContain('no_superfat_margin');
    }
  });

  it('LS sugar ceiling is the catalog range top, 6% (LS:1069)', () => {
    expect(has({ ...base, process: 'ls', sugarTotalPercent: 5.5 }, 'sugar_total_high')).toBe(false);
    expect(has({ ...base, process: 'ls', sugarTotalPercent: 6 }, 'sugar_total_high')).toBe(false);
    expect(has({ ...base, process: 'ls', sugarTotalPercent: 6.5 }, 'sugar_total_high')).toBe(true);
    expect(messageFor({ ...base, process: 'ls', sugarTotalPercent: 6.5 }, 'sugar_total_high')).toContain('~6%');
    // HP keeps its own 5.
    expect(has({ ...base, process: 'hp', sugarTotalPercent: 5.5 }, 'sugar_total_high')).toBe(true);
  });

  it('only ROE / rosemary oleoresin / rosemary extract counts as the antioxidant, not the herb or its EO (LS:1018, CP:9941)', () => {
    // A PUFA-heavy profile so the DOS rule is live.
    const pufa = { ...base, process: 'cp' as const, fattyAcids: { linoleic: 40, oleic: 40, palmitic: 20 }, fattyAcidCoveragePercent: 100 };
    const fires = (name: string, catalogId = '') => has({ ...pufa, additiveEntries: [{ catalogId, name }] }, 'dos_risk_no_antioxidant');
    expect(fires('Dried rosemary')).toBe(true);
    expect(fires('Rosemary powder')).toBe(true);
    expect(fires('Rosemary oil')).toBe(true);
    expect(fires('Rosemary essential oil')).toBe(true);
    expect(fires('ROE (rosemary oleoresin)', 'roe')).toBe(false);
    expect(fires('rosemary oleoresin')).toBe(false);
    expect(fires('Rosemary extract')).toBe(false);
    expect(fires('ROE')).toBe(false);
  });

  it('polysorbate 20 / Tween 20 do not satisfy the polysorbate-80 emulsifier prompt (LS:1274)', () => {
    const ls = { ...base, process: 'ls' as const, postCookSuperfatPercent: 2 };
    const fires = (name: string, catalogId = '') => has({ ...ls, additiveEntries: [{ catalogId, name }] }, 'ls_pcsf_emulsifier');
    expect(fires('Polysorbate 20')).toBe(true);
    expect(fires('Tween 20')).toBe(true);
    expect(fires('Polysorbate 80', 'polysorbate-80')).toBe(false);
    expect(fires('Polysorbate 80')).toBe(false);
    expect(fires('Tween 80')).toBe(false);
    expect(fires('poly 80')).toBe(false);
  });

  it('the LS fat-shift remedy never tells a recipe already at a lye excess to "run a small lye excess"', () => {
    const atExcess = messageFor({ ...base, process: 'ls', superfatPercent: -2, lsSplitLiquidFatShiftPercent: 6 }, 'ls_split_liquid_fat_superfat');
    expect(atExcess).not.toContain('run a small lye excess');
    expect(atExcess).toContain('lye excess');
    const atSuperfat = messageFor({ ...base, process: 'ls', superfatPercent: 2, lsSplitLiquidFatShiftPercent: 6 }, 'ls_split_liquid_fat_superfat');
    expect(atSuperfat).toContain('lower the superfat');
  });

  it('LS salt copy follows the stage: start-of-cook keeps the paste fluid, after dilution thickens then thins (LS:2625, LS:3089)', () => {
    const lyeStage = messageFor({ ...base, process: 'ls', additiveEntries: [{ catalogId: 'salt', name: 'Table salt (NaCl)', addAt: 'lye' }] }, 'ls_salt_thickening');
    expect(lyeStage).toMatch(/fluid/i);
    expect(lyeStage).not.toMatch(/dilute brine gradually/i);
    const afterDilution = messageFor({ ...base, process: 'ls', additiveEntries: [{ catalogId: 'salt', name: 'Table salt (NaCl)', addAt: 'after_cook' }] }, 'ls_salt_thickening');
    expect(afterDilution).toMatch(/thickens diluted liquid soap/i);
    // No stage known → the catalog's LS default (lye water) reading.
    const unknown = messageFor({ ...base, process: 'ls', additiveEntries: [{ catalogId: 'salt', name: 'Table salt (NaCl)' }] }, 'ls_salt_thickening');
    expect(unknown).toMatch(/fluid/i);
  });
});
```

Also update the existing LS sugar expectations in the `sugar_total_high` describe (around lines 533-555): change `['ls', false]` at 4.5 to stay, replace `for (const process of ['ls', 'hp']) expect(has({..., sugarTotalPercent: 5.5}, ...)).toBe(true)` with `hp` only, and change the "LS copy carries the ~5% figure" test to `sugarTotalPercent: 6.5` and `toContain('~6%')`.

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npm run test -w @soap-calc/core -- src/insights.test.ts`
Expected: 8 failures — the seven new tests (magnesium: `ls_salt_thickening` present; no_superfat_margin present at −3; LS 5.5 fires; 'Dried rosemary' silences; 'Polysorbate 20' silences; remedy text contains "run a small lye excess"; salt copy identical for both stages) plus the retargeted "~6%" copy test. `npm run typecheck` also rejects `addAt` on the entry (`TS2353`) until Step 3.

- [ ] **Step 3: Extend the keyword matcher**

In `packages/core/src/keyword-match.ts` replace the `NamedCatalogEntry` type and `additiveMatches` with:

```ts
export type NamedCatalogEntry = {
  catalogId: string;
  name: string;
  /** Where the line is added — mirrors additives.ts AdditiveStage (spelled out here so this
   * module keeps importing nothing). Optional: rules that read it treat an unknown stage as
   * the catalog's default for that additive. */
  addAt?: 'lye' | 'oils' | 'trace' | 'top' | 'after_cook';
};

/** The entries `additiveMatches` would match — by catalog id, or by a word-boundary keyword
 * on a name that does not read as a fragrance. Rules that need the matched LINES (to read
 * their stage) call this; the boolean form below stays for everyone else. */
export function matchingAdditiveEntries<T extends NamedCatalogEntry>(
  entries: T[] | undefined,
  catalogId: string,
  nameKeyword: string,
): T[] {
  if (!entries?.length) return [];
  return entries.filter(
    (entry) =>
      entry.catalogId === catalogId ||
      (!isLikelyFragranceName(entry.name) && wordBoundaryMatch(entry.name, nameKeyword)),
  );
}

export function additiveMatches(
  entries: NamedCatalogEntry[] | undefined,
  catalogId: string,
  nameKeyword: string,
): boolean {
  return matchingAdditiveEntries(entries, catalogId, nameKeyword).length > 0;
}
```

- [ ] **Step 4: Fix the eight rules**

In `packages/core/src/insights.ts`:

(a) Add `matchingAdditiveEntries` and `wordBoundaryMatch` to the `./keyword-match.js` import, and after the imports add:

```ts
/** Magnesium-bearing salts: warned against outright (magnesium_salt_scum, CP:10623-10626),
 * so every "salt" advisory filters them out first — a maker must never read "do not use"
 * and "add it gradually" about the same line. */
const MAGNESIUM_SALT_KEYWORDS = ['epsom', 'magnesium', 'dead sea'] as const;
function withoutMagnesiumSalts(
  entries: NamedCatalogEntry[] | undefined,
): NamedCatalogEntry[] | undefined {
  return entries?.filter(
    (entry) => !MAGNESIUM_SALT_KEYWORDS.some((keyword) => wordBoundaryMatch(entry.name, keyword)),
  );
}
```

(b) `no_superfat_margin`: change `if (input.lyeGrams > 0 && input.superfatPercent <= 0) {` to `if (input.lyeGrams > 0 && input.superfatPercent === 0) {` and add above it: `// Exactly 0%: a NEGATIVE figure is a deliberate lye excess with its own rule (ls_lye_excess) and its own remedy — this copy says "0% superfat" and must not fire beside it.`

(c) `sugar_total_high` `processOverrides`: change `ls: { ceilingPercent: 5 },` to `ls: { ceilingPercent: 6 },` and add the comment `// LS: the catalog's own LS range for sugar/sorbitol/honey tops out at 6 (LS:1069 "between 1-6% Total Oil Weight"); the 5 this carried until 2026-09-19 was HP's.`

(d) `magnesium_salt_scum` check: replace `['epsom', 'magnesium', 'dead sea'].some(` with `MAGNESIUM_SALT_KEYWORDS.some(`.

(e) `dos_risk_no_antioxidant`: replace

```ts
        additiveMatches(input.additiveEntries, 'roe', 'rosemary') ||
```
with
```ts
        // The antioxidant is "Rosemary Oleoresin Extract (ROE)" (LS:1018, HP:4871, CP:5566);
        // the herb and its essential oil are fragrance/botanicals (CP:9941) and protect nothing.
        additiveMatches(input.additiveEntries, 'roe', 'roe') ||
        additiveNameMatches(input.additiveEntries, 'oleoresin') ||
        additiveNameMatches(input.additiveEntries, 'rosemary extract') ||
```

(f) `ls_split_liquid_fat_superfat` message: replace the last template segment

```ts
            `${effective.toFixed(1)}%. Liquid soap clouds and separates past ~3%: lower the superfat ` +
            `(or run a small lye excess) to absorb it.`,
```
with
```ts
            `${effective.toFixed(1)}%. Liquid soap clouds and separates past ~3%: ` +
            (input.superfatPercent < 0
              ? 'increase the lye excess to absorb it.'
              : 'lower the superfat (or run a small lye excess) to absorb it.'),
```

(g) `ls_salt_thickening` check — replace the whole `check` with:

```ts
    check: (input) => {
      const saltLines = matchingAdditiveEntries(withoutMagnesiumSalts(input.additiveEntries), 'salt', 'salt');
      if (saltLines.length === 0) return null;
      // Two jobs, by stage. At the START (lye water or oils, the catalog's LS default) salt
      // keeps the cooking soap fluid instead of a thick paste, and the soap thickens once it
      // is diluted and cools. Stirred into DILUTED soap it thickens up to a peak, then thins
      // past it. An unknown stage reads as the default start-of-cook use.
      const afterDilution = saltLines.some((line) => line.addAt === 'after_cook');
      let message = afterDilution
        ? 'Salt thickens diluted liquid soap up to a point, then thins it past that point — add a dilute brine gradually and test as you go.'
        : 'Salt in the lye water or the oils keeps the soap fluid through the cook instead of setting into a thick paste; it thickens once diluted and cooled. Every recipe has a turning point past which more salt thins it, so add any later brine a little at a time.';

      if (isCoconutHeavy(input)) {
        message +=
          ' High-coconut liquid soap barely responds to salt — use guar or HEC instead if you need more body.';
      }

      return {
        level: 'info',
        code: 'ls_salt_thickening',
        message,
      };
    },
```

(h) `ls_pcsf_emulsifier`: replace the five-line condition with:

```ts
      // Polysorbate 80 is the oil emulsifier; polysorbate 20 is for fragrance (LS:1274).
      if (
        additiveMatches(input.additiveEntries, 'polysorbate-80', 'polysorbate 80') ||
        additiveNameMatches(input.additiveEntries, 'poly 80') ||
        additiveNameMatches(input.additiveEntries, 'poly-80') ||
        additiveNameMatches(input.additiveEntries, 'tween 80') ||
        additiveNameMatches(input.additiveEntries, 'tween80')
      ) {
```

(i) `hp_thick_phase_suppressant`: change `additiveMatches(input.additiveEntries, 'salt', 'salt') ||` to `additiveMatches(withoutMagnesiumSalts(input.additiveEntries), 'salt', 'salt') ||`.

- [ ] **Step 5: Pass the stage from the web**

In `packages/web/src/hooks/useFormulationInsights.ts` change the `additiveEntries` map to:

```ts
    const additiveEntries = (options.additives ?? []).map((item) => ({
      catalogId: item.catalogId,
      name: item.name,
      addAt: item.addAt,
    }));
```

`FormulationInsightOptions.additives` is already `ComputedAdditive[]`, whose `addAt` is the core `AdditiveStage`, so no type change is needed.

- [ ] **Step 6: Run core and web tests**

Run: `npm run test -w @soap-calc/core && npm run test -w @soap-calc/web -- src/hooks/useFormulationInsights.test.ts`
Expected: every suite passes EXCEPT `packages/core/src/insights.golden.test.ts`, an exact snapshot of every matrix cell in `packages/core/src/__fixtures__/insights-golden.json`. Seven cells change, each a direct consequence of a rule edited above:
- `1:cp`, `1:hp` (superfat −2): `no_superfat_margin` removed
- `10:ls` (sugar 5.5): `sugar_total_high` removed
- `35:hp` (Epsom salt): `hp_thick_phase_suppressant` removed; `35:ls`: `ls_salt_thickening` removed
- `36:ls`, `40:ls` (table salt, no stage): `ls_salt_thickening` message becomes the start-of-cook copy

There is no regen script. Regenerate the fixture with a scratch script that imports the golden test's own `base` and `MATRIX` (read `insights.golden.test.ts` for their names and the cell-key format), runs `analyzeFormulation` over the matrix exactly as the test does, and writes `JSON.stringify(actual, null, 1) + '\n'` (the file's existing format). Diff the fixture: exactly the seven cells above may change. Then re-run: core `822 passed`.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/keyword-match.ts packages/core/src/insights.ts packages/core/src/insights.test.ts packages/web/src/hooks/useFormulationInsights.ts
git commit -m "fix(insights): gate and word eight rules to the sources

Magnesium salts no longer get add-salt coaching; no_superfat_margin is the
0% case only; LS sugar ceiling follows the catalog's 6%; only ROE counts as
the antioxidant; only polysorbate 80 satisfies the oil emulsifier; the LS
fat-shift remedy and the LS salt copy read the recipe's own state.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Phase C — web calculation layer

### Task 9: Subtract-mode post-cook superfat lists the recipe at its cook weight

Grounding: G6 and G7. The lye scaling and the delivered figure are already the HP method; what changes is what the maker is told to weigh, what is priced, and what the LS dilution calls anhydrous soap.

**Files:**
- Modify: `packages/web/src/lib/calculateAdditives.ts:96-135` (`AppliedPostCookSuperfat`, `computeExtrasGrams`)
- Modify: `packages/web/src/hooks/useRecipeViewModel.ts` (:300-316 cook oil + base batch, :396-420 dilution, :674-686 stamping, the `RecipeViewModel` type, the `batchSheetData` memo, the return object)
- Modify: `packages/web/src/lib/recipeSummary.ts:21-41,368-376`
- Modify: `packages/web/src/components/ResultsPanel.tsx` (new `cookFactor` prop; :204-210, :224-238, :390)
- Modify: `packages/web/src/lib/batchSheet.ts` (`BatchSheetData.cookFactor`), `packages/web/src/components/BatchSheet.tsx` (:120, :313-323, :393, :743)
- Modify: `packages/web/src/lib/recipePricing.ts:100-135`, `packages/web/src/App.tsx:248-273,485-` (pass `cookFactor`)
- Modify: `packages/web/src/components/SuperfatWaterPanel.tsx:73-75` (help copy)
- Modify: `docs/superpowers/specs/2026-07-11-pcsf-module-design.md` (append a dated supersession note)
- Test: `useRecipeViewModel.test.tsx`, `ResultsPanel.test.tsx`, `BatchSheet.test.tsx`, `batchSheet.test.ts`, `recipePricing.test.ts`, `recipeSummary.test.ts`

**Interfaces:**
- Produces: `RecipeViewModel.cookFactor: number` (1 unless a subtract reserve is applied; then `1 − Σ PCSF% / 100`, clamped as today). `AppliedPostCookSuperfat.reserveApplied: boolean` replaces `isExtra` (inverted meaning: `reserveApplied === true` ⇔ old `isExtra === false`). `BatchSheetData.cookFactor: number`. `RecipePricingSource.cookFactor?: number`. `ResultsPanel` prop `cookFactor?: number`.
- Consumes: nothing from other tasks.

- [ ] **Step 1: Write the failing view-model test**

Append to `packages/web/src/hooks/useRecipeViewModel.test.tsx`:

```ts
test('subtract trims the recipe to its cook weight: cookFactor, LS anhydrous soap and batch weight (HP:5684-5703, LS:1543)', () => {
  // Same LS shape the file's other liquid-soap probes use (KOH, ratio water, a dilution target).
  const pcsf = {
    lyeType: 'koh' as const,
    waterMode: 'lye_water_ratio' as const,
    lyeWaterRatio: '2',
    superfatPercent: '2',
    soapConcentrationPercent: '30',
    postCookSuperfatOils: [{ oilId: 'olive-oil', percent: '10' }],
  };
  let append: any;
  let subtract: any;
  probe((vm) => { append = vm; }, { ...pcsf, postCookSuperfatMethod: 'append' }, 'ls');
  probe((vm) => { subtract = vm; }, { ...pcsf, postCookSuperfatMethod: 'subtract' }, 'ls');

  expect(append.cookFactor).toBe(1);
  expect(subtract.cookFactor).toBeCloseTo(0.9);
  // The formulation stays on the target oil weight; the cook uses 90% of it.
  expect(subtract.totalOilGrams).toBeCloseTo(append.totalOilGrams);
  // Anhydrous soap = the oils that were saponified + their alkali, in BOTH methods.
  expect(append.dilution.anhydrousGrams).toBeCloseTo(append.totalOilGrams + append.result.lyeWeightGrams);
  expect(subtract.dilution.anhydrousGrams).toBeCloseTo(0.9 * subtract.totalOilGrams + subtract.result.lyeWeightGrams);
  // The PCSF oil is weighed separately in both methods and rides into the batch weight.
  expect(subtract.postCookSuperfat.reserveApplied).toBe(true);
  expect(append.postCookSuperfat.reserveApplied).toBe(false);
  expect(subtract.batchWeightWithExtras).toBeCloseTo(
    0.9 * subtract.totalOilGrams + subtract.result.lyeWeightGrams + subtract.result.waterWeightGrams + subtract.postCookSuperfat.grams,
  );
  // Following the sheet literally now lands on the claimed superfat: trimmed oils + PCSF = target.
  expect(0.9 * subtract.totalOilGrams + subtract.postCookSuperfat.grams).toBeCloseTo(subtract.totalOilGrams);
});
```

Update the existing fixture at line ~88 from `isExtra: true,` to `reserveApplied: false,`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -w @soap-calc/web -- src/hooks/useRecipeViewModel.test.tsx`
Expected: 2 failures — the new test stops at its first assertion (`expected undefined to be 1`, `append.cookFactor`), and the flipped line-88 fixture fails its `toEqual` against the still-stamped `isExtra` (the intended pre-rename state).

- [ ] **Step 3: Rename the flag and count the PCSF oil as an extra in both methods**

In `packages/web/src/lib/calculateAdditives.ts` replace the `AppliedPostCookSuperfat` doc + type with:

```ts
/** The vm's stamped post-cook superfat — the one object every surface downstream of the
 * view model sees. `reserveApplied` is true when subtract mode actually trimmed the recipe:
 * every recipe oil and the lye were scaled by the view model's cookFactor (1 − Σ PCSF %), so
 * the sheet lists the oils at their cook weights and the PCSF oil, weighed separately, brings
 * the batch back to the target oil weight — the HP method ("PCSF% × Total Oil Weight = PCSF
 * weight, then Total Oil Weight − PCSF = starting soap calculator weight"). False for append,
 * and for a subtract reserve the lye-excess guard left unapplied (`method` tells those apart).
 * Stamped ONCE in useRecipeViewModel beside cookFactor; there is no separate flag to pair
 * with it, stale or otherwise. */
export type AppliedPostCookSuperfat = ComputedPostCookSuperfat & {
  reserveApplied: boolean;
  method: 'append' | 'subtract';
  /** What the batch actually delivers with this reserve in (core deliveredSuperfatPercent,
   * method-aware), or null when there is nothing to add up: a subtract reserve the lye-excess
   * guard left unapplied. Surfaces render this field and gate on non-null — none re-derives
   * the guard or picks its own formula. */
  deliveredSuperfatPercent: number | null;
};
```

and in `computeExtrasGrams` replace `const pcsfGrams = postCookSuperfat?.isExtra ? postCookSuperfat.grams : 0;` with:

```ts
  // The PCSF oil is weighed separately in BOTH methods (HP:5563-5566): in subtract mode the
  // recipe oils were trimmed to make room for it, so it is still real mass added to the pot.
  const pcsfGrams = postCookSuperfat?.grams ?? 0;
```

Update the function's doc comment ("+ the post-cook superfat when it is an extra") to "+ the post-cook superfat oil".

- [ ] **Step 4: View model — cook oil, base batch, dilution, stamping, exposure**

In `packages/web/src/hooks/useRecipeViewModel.ts`:

(a) Replace the block from the comment `// The PCSF oil is an added extra whenever the subtract reserve is not actually applied:` (five lines above `const pcsfIsExtra = cookFactor === 1;` — those lines describe the old semantics) through the `baseBatchGrams` assignment with:

```ts
  // Was the subtract reserve actually applied? cookFactor < 1 is the single source of truth:
  // append mode, and subtract under a lye excess (the guard above forces cookFactor to 1),
  // both leave the recipe untrimmed.
  const pcsfReserveApplied = cookFactor < 1;
  // The oils that actually go through the cook: the formulation × cookFactor — HP's "Total
  // Oil Weight − PCSF = Starting soap calculator weight". Equal to totalOilGrams in append.
  const cookOilGrams = totalOilGrams * cookFactor;
  // The water-bearing base batch: trimmed oils + the lye/water sized to them. The PCSF oil is
  // an extra in both methods (computeExtrasGrams), so subtract's total is
  // trimmed oils + trimmed lye/water + PCSF — numerically the target oil weight + lye + water.
  const baseBatchGrams = pcsfReserveApplied
    ? cookOilGrams + (result?.lyeWeightGrams ?? 0) + (result?.waterWeightGrams ?? 0)
    : displayTotals?.batchWeightGrams ?? fullResult?.totalBatchWeightGrams ?? 0;
```

(b) In the `dilution` memo replace `anhydrousGrams: result.totalOilWeightGrams + result.lyeWeightGrams,` with:

```ts
            // Anhydrous soap is what the saponification made: the oils that went through
            // the cook plus their alkali (LS:1543). A subtract reserve trimmed those oils by
            // cookFactor; the PCSF oil is never soap in either method (append already keeps
            // it out as an extra). Until 2026-09-19 this read the untrimmed oils under
            // subtract and sized ~333 g of surplus water on a 10% reserve at 30%.
            anhydrousGrams: result.totalOilWeightGrams * cookFactor + result.lyeWeightGrams,
```

and add `cookFactor` to that memo's dependency array.

(c) In the `postCookSuperfat` memo replace `const unapplied = pcsfMethod === 'subtract' && pcsfIsExtra;` with `const unapplied = pcsfMethod === 'subtract' && !pcsfReserveApplied;`, replace `isExtra: pcsfIsExtra` with `reserveApplied: pcsfReserveApplied`, and swap `pcsfIsExtra` for `pcsfReserveApplied` in its deps.

(d) In the `RecipeViewModel` type, next to `postCookSuperfat`, add:

```ts
  /** 1, or 1 − Σ PCSF % / 100 when a subtract reserve is applied: the factor every recipe oil
   * and the lye were trimmed by. Surfaces that print what to WEIGH (Full recipe, batch sheet,
   * pricing) multiply the formulation's oil weights by it; the formulation itself stays on
   * the target oil weight. */
  cookFactor: number;
```

Add `cookFactor,` to the returned object, and `cookFactor,` to the `batchSheetData` memo's object literal (and its deps).

- [ ] **Step 5: Manifest copy and sheet data**

In `packages/web/src/lib/recipeSummary.ts` replace the two provenance helpers with:

```ts
/** The one provenance phrase every surface appends to an APPLIED subtract reserve — the
 * results-grid row, the Full recipe line, and the printed sheet. The PCSF oil is weighed on
 * its own; the recipe oils listed above it are already trimmed by the cook factor to make
 * room, so the manifest's oils + this line = the target oil weight. Empty for append and
 * for an unapplied reserve. */
export function postCookSuperfatProvenance(reserveApplied: boolean): string {
  return reserveApplied ? ' · weighed separately; the oils above are already trimmed to make room' : '';
}

/** The one PCSF line detail the Full recipe and the printed sheet quote —
 * "140 g · 5% of oil" plus the shared provenance phrase — so the two are structurally
 * identical rather than hand-synchronized. */
export function postCookSuperfatLineDetail(
  oil: { grams: number; percentOfOil: number },
  weightUnit: WeightUnit,
  reserveApplied: boolean,
): string {
  return `${formatWeight(oil.grams, weightUnit)} · ${formatGrams(oil.percentOfOil, 1)}% of oil${postCookSuperfatProvenance(reserveApplied)}`;
}
```

and at the call site (~:374) pass `postCookSuperfat.reserveApplied`. Update the section comment above it ("An applied subtract reserve says its grams come out of the oils already listed") to "An applied subtract reserve says the oils above were trimmed to make room for it".

In `packages/web/src/lib/batchSheet.ts` add to `BatchSheetData`:

```ts
  /** useRecipeViewModel.cookFactor — the oils print at formulation weight × this. */
  cookFactor: number;
```

- [ ] **Step 6: Results panel prints cook weights**

In `packages/web/src/components/ResultsPanel.tsx`:
- Add prop `cookFactor?: number;` (doc: "useRecipeViewModel.cookFactor; defaults to 1 for legacy callers") and destructure `cookFactor = 1`.
- In `buildFullRecipe({ … })` change `lines: result.lines.map((line) => ({ oilId: line.oilId, weightGrams: line.weightGrams })),` to `lines: result.lines.map((line) => ({ oilId: line.oilId, weightGrams: line.weightGrams * cookFactor })),` and `recipeOilWeightGrams,` to `recipeOilWeightGrams: recipeOilWeightGrams * cookFactor,` (so each oil's % is unchanged).
- Change `postCookSuperfat?.isExtra ? 'post-cook superfat' : null,` to `postCookSuperfat ? 'post-cook superfat' : null,`.
- Change `postCookSuperfatProvenance(postCookSuperfat.isExtra)` to `postCookSuperfatProvenance(postCookSuperfat.reserveApplied)`.
- The "Total batch" breakdown (`batchWeightBreakdown({ oilGrams: totalOilGrams, … })`, ~line 219) must show the oils that are in the pot: change `oilGrams: totalOilGrams,` to `oilGrams: totalOilGrams * cookFactor,`. Otherwise it prints `oils 1000 g · lye 126 g · water 297 g · extras 100 g` against a 1423 g total — slices summing 1523, over by exactly the PCSF (measured in the dry run). `ResultsPanel` is that helper's only consumer.

In `packages/web/src/App.tsx` pass `cookFactor={vm.cookFactor}` to `<ResultsPanel …>`, and reword the comment at `App.tsx:258` (`already carries isExtra` → `already carries reserveApplied`).

- [ ] **Step 7: Batch sheet prints cook weights**

In `packages/web/src/components/BatchSheet.tsx`:
- Destructure `cookFactor` from `data`.
- `const includedLines = result.lines.filter((line) => line.includedInLye && line.weightGrams > 0).map((line) => ({ ...line, weightGrams: line.weightGrams * cookFactor }));`
- Oils table: `heaviestFirst(lines.filter(...), (line) => Number(line.weightGrams))` stays; the weight cell becomes `<td>{formatWeight(Number(line.weightGrams) * cookFactor, weightUnit)}</td>`.
- Total oil row (~:393): `<dd>{formatWeight(displayTotals.recipeOilWeightGrams * cookFactor, weightUnit)}</dd>`.
- PCSF section: `postCookSuperfatLineDetail(oil, weightUnit, postCookSuperfat.reserveApplied)`; reword its comment at `:734` (`"from oils above"` → `"weighed separately"`).

- [ ] **Step 8: Pricing prices what is weighed**

In `packages/web/src/lib/recipePricing.ts` change `RecipePricingSource`:

```ts
  /** Post-cook superfat oils — weighed separately in both methods, so always priced. */
  postCookSuperfat: { oils: { oilId: string; grams: number }[] } | null;
  /** useRecipeViewModel.cookFactor: a subtract reserve trims every recipe oil by this. */
  cookFactor?: number;
```

and in `buildRecipePricingContext`:

```ts
  const cookFactor = src.cookFactor ?? 1;
  const oilLines = src.lines
    .filter((l) => (Number(l.weightGrams) || 0) > 0)
    .map((l) => ({
      key: l.key,
      oilId: l.oilId,
      grams: (Number(l.weightGrams) || 0) * cookFactor,
      name: oilDisplayName(l.oilId),
    }));
  if (src.postCookSuperfat) {
    src.postCookSuperfat.oils.forEach((o, i) => {
```

In `App.tsx`'s `pricingContext` memo add `cookFactor: vm.cookFactor,` to the source and `vm.cookFactor` to the deps; remove `vm.splitLiquidGrams` from the deps (the memo body does not read it).

- [ ] **Step 9: Help copy and spec note**

In `packages/web/src/components/SuperfatWaterPanel.tsx` replace the `subtract` help text with:

```ts
  subtract:
    'Trims every recipe oil by the post-cook share and sizes the lye to the trimmed oils; the post-cook oil is weighed separately, so the batch still totals your target oil weight and the superfat comes out at exactly the number you set.',
```

In `packages/web/src/components/SuperfatWaterPanel.test.tsx:307` ("each method shows a plain-language explanation…") change the matcher `/trims the lye/i` to `/trims every recipe oil/i`.

Append to `docs/superpowers/specs/2026-07-11-pcsf-module-design.md`:

```markdown
## Superseded 2026-09-19

- "Dilution needs no change" is withdrawn. Anhydrous soap is the oils that went through the cook plus their alkali (LS:1543); under subtract those oils are the formulation × cookFactor. The PCSF oil is not soap in either method.
- The manifest, batch sheet and pricing now list the recipe oils at their cook weight (formulation × cookFactor) and the PCSF oil as a separately weighed material (HP:5684-5703, HP:5563-5566). `AppliedPostCookSuperfat.isExtra` became `reserveApplied`; the PCSF oil counts as an extra in both methods.
```

- [ ] **Step 10: Update fixtures and add surface tests**

Search and replace in tests: `isExtra: true` → `reserveApplied: false`; `isExtra: false` → `reserveApplied: true` in `ResultsPanel.test.tsx`, `BatchSheet.test.tsx`, `batchSheet.test.ts`, `recipeSummary.test.ts`, `recipePricing.test.ts` (there, also drop the `isExtra` field from the pricing source objects). Every `BatchSheetData` fixture gains `cookFactor: 1` — 19 sites: 17 `buildBatchSheetData({` calls in `BatchSheet.test.tsx` (including the `lsSheetData`, `cpSheetData` and `sheetWith` helpers) and 2 in `batchSheet.test.ts` (`makeBatchSheetInput` at ~:100 and the inline literal at ~:163). The old phrase is asserted NEGATIVELY in three places, which would go vacuous: `queryByText(/from oils above/)` at `BatchSheet.test.tsx:68` and `:257` and `queryByText(/lye reduced/)` at `ResultsPanel.test.tsx:159` become `queryByText(/weighed separately/)` (update the comment at `BatchSheet.test.tsx:65` and `recipeSummary.test.ts:429` too). The Playwright spec `packages/web/e2e/exploratory.spec.ts:522` expects `/from oils above \(lye reduced\)/` — change it to `/weighed separately; the oils above are already trimmed/` (it is not run by `npm test`).

Add to `packages/web/src/lib/recipePricing.test.ts`:

```ts
  it('prices the trimmed recipe oils and the separately weighed PCSF oil under subtract', () => {
    const ctx = buildRecipePricingContext({
      lines: [{ key: 'a', oilId: 'olive-oil', weightGrams: '1000' }],
      computedAdditives: [], lyeGrams: 130, batchWeightWithExtras: 1500, splitLiquids: [],
      postCookSuperfat: { oils: [{ oilId: 'jojoba-oil', grams: 50 }] },
      cookFactor: 0.95,
    });
    expect(ctx.oilLines.map((l) => [l.oilId, l.grams])).toEqual([['olive-oil', 950], ['jojoba-oil', 50]]);
  });
```

In `packages/web/src/lib/recipePricing.test.ts` replace the test `'leaves a subtract-mode (reserved) superfat out — those grams are already priced'` with the new test below (the old expectation pinned the defect: under the HP method the PCSF oil is weighed separately in both modes), and drop `isExtra` from the remaining `postCookSuperfat` fixtures.

Add to `packages/web/src/components/ResultsPanel.test.tsx` (the file renders `<ResultsPanel …>` directly from `calculateRecipe`; a one-line olive recipe makes the percent 100%):

```ts
test('lists the recipe oils at their cook weight when a subtract reserve is applied', () => {
  const lines = [{ key: 'a', oilId: 'olive-oil', weightGrams: '1000', weightPercent: '100' }];
  const { result, displayTotals } = calculateRecipe(lines, DEFAULT_SETTINGS);
  render(
    <ResultsPanel
      result={result}
      inputErrors={[]}
      lyeLabel="NaOH"
      process="hp"
      lyeType="naoh"
      displayTotals={displayTotals}
      weightUnit="g"
      batchWeightWithExtras={displayTotals?.batchWeightGrams ?? 0}
      totalOilGrams={displayTotals?.recipeOilWeightGrams ?? 0}
      cookFactor={0.95}
      postCookSuperfat={{ oils: [{ oilId: 'shea-butter', percentOfOil: 5, grams: 50 }], percentOfOil: 5, grams: 50, reserveApplied: true, method: 'subtract', deliveredSuperfatPercent: 9.75 }}
    />,
  );
  // 1000 g formulation × 0.95 = the 950 g that actually goes into the pot, still 100% of the blend.
  expect(screen.getByText(/950 g · 100%/)).toBeTruthy();
  // The phrase appears in the results-grid row AND the Full recipe line (the neighbouring
  // post-cook test expects ≥ 2 for the same reason), so getAllByText.
  expect(screen.getAllByText(/weighed separately; the oils above are already trimmed/).length).toBeGreaterThanOrEqual(1);
  // The Total batch slices must sum to the total: trimmed oils, not the formulation's 1000 g.
  expect(screen.getByText(/oils 950 g/)).toBeTruthy();
});
```

(The breakdown line renders plain text nodes, so the bare regex matches — but only when `totalOilGrams` is passed; the panel's default of 0 would print `oils 0 g`. Measured after the change on the HP starter with 10% olive subtract: `Total batch: 1423 g · oils 900 g · lye 126 g · water 297 g · extras 100 g`; append and no-PCSF recipes print byte-identical lines to before, since `cookFactor` is exactly 1 there.)

Add to `packages/web/src/components/BatchSheet.test.tsx` a case with `cookFactor: 0.95` and an olive line of `'400'` g asserting `screen.getAllByText('380 g').length` is at least 1 (400 × 0.95 is exact in floating point; the Oils table, the lye-per-oil table and the Oil-weight `<dd>` all print it).

- [ ] **Step 11: Run the web suite**

Run: `npm run test -w @soap-calc/web`
Expected: PASS (94 files, 1871 tests in the dry run) once the SuperfatWaterPanel matcher and the negative-assertion updates above are in. The pre-existing "subtract reduces the lye by (1 − PCSF%)…" test still holds: subtract's batch (0.9·(oil+lye+water) + 0.1·oil) is below append's (oil + lye + water + 0.1·oil). Measured after the change, HP starter with 10% olive subtract: `cookFactor 0.9`, lye 125.62, water 297, PCSF 100 g, batch 1422.62 = 900 + 125.62 + 297 + 100; LS at 30%: subtract anhydrous 1099.92 (was 1199.92), append 1222.13.

- [ ] **Step 12: Typecheck, full suite, commit**

Run: `npm test`
Expected: PASS.

```bash
git add packages/web/src docs/superpowers/specs/2026-07-11-pcsf-module-design.md
git commit -m "fix(web): subtract-mode post-cook superfat lists the recipe at its cook weight

The lye was already sized to the trimmed oils; the manifest, sheet and
pricing printed the untrimmed oils, so weighing the sheet delivered 9.88%
where 7.85% was claimed. The LS dilution now calls anhydrous soap the oils
that were saponified plus their alkali in both methods. isExtra becomes
reserveApplied; the PCSF oil is a separately weighed extra either way.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 10: The split-liquid allocation line sums budget rows only

**Files:**
- Modify: `packages/web/src/components/SplitLiquidPanel.tsx:16,91,377-386`
- Test: `packages/web/src/components/SplitLiquidPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `packages/web/src/components/SplitLiquidPanel.test.tsx`:

```ts
test('the allocation line adds only the rows that draw on the liquid budget', () => {
  // A `rest` row shares the budget with the lye water; a `percent_of_oils` row sits ON TOP
  // of it. 140 + 190 = 330 is the equation; the 100 g beer is not part of it.
  const rows = [
    ROW({ name: 'goat milk', sizeMode: 'rest', amount: '' }),
    ROW({ name: 'beer', sizeMode: 'percent_of_oils', amount: '10' }),
  ];
  renderPanel({
    rows,
    resolvedRows: [{ row: rows[0], grams: 190 }, { row: rows[1], grams: 100 }],
    allocation: { lyeWaterGrams: 140, targetLiquidGrams: 330 },
  });
  const line = screen.getByText(/lye water .* alternative liquid = .* total liquid/i);
  expect(line.textContent).toMatch(/140 g lye water .* 190 g alternative liquid = 330 g total liquid/);
  expect(line.textContent).not.toMatch(/290 g/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -w @soap-calc/web -- src/components/SplitLiquidPanel.test.tsx`
Expected: FAIL — the line reads "… 290 g alternative liquid = 330 g total liquid".

- [ ] **Step 3: Sum the budget rows**

In `packages/web/src/components/SplitLiquidPanel.tsx`:
- Change the import to `import { budgetSizingAvailable, isBudgetSizeMode } from '../lib/splitLiquidSizing';`
- After `const totalGrams = …` add:

```ts
  // The allocation equation is lye water + BUDGET rows = target: additive-mode rows
  // (% of oils, grams) sit on top of the budget and must not be added into it.
  const budgetGrams = resolvedRows.reduce(
    (sum, { row, grams }) => (isBudgetSizeMode(row.sizeMode) ? sum + (grams ?? 0) : sum),
    0,
  );
```
- In the preview paragraph change the gate `{allocation && totalGrams > 0 && (` to `{allocation && budgetGrams > 0 && (` and `{formatWeight(totalGrams, weightUnit)} alternative liquid` to `{formatWeight(budgetGrams, weightUnit)} alternative liquid`. If `totalGrams` is then unused, delete it.

- [ ] **Step 4: Run tests and commit**

Run: `npm run test -w @soap-calc/web -- src/components/SplitLiquidPanel.test.tsx`
Expected: PASS (the existing single-`rest`-row test is unchanged: 138 + 192 = 330).

```bash
git add packages/web/src/components/SplitLiquidPanel.tsx packages/web/src/components/SplitLiquidPanel.test.tsx
git commit -m "fix(web): the split-liquid allocation line sums only the rows that draw on the budget

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 11: Sub-gram doses and weights never print or store as zero

**Files:**
- Modify: `packages/web/src/lib/weightUnits.ts:94-116` (`formatWeightParts`)
- Modify: `packages/web/src/lib/lineWeightSync.ts:10-12` (`formatGrams`)
- Test: `packages/web/src/lib/weightUnits.test.ts`, `packages/web/src/lib/lineWeightSync.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/web/src/lib/weightUnits.test.ts`, inside `describe('formatWeight keeps sub-gram doses visible', …)`, add:

```ts
  it('widens the precision below 0.05 g until a digit shows (turmeric’s sourced low end on 100 g oils is 0.028 g)', () => {
    expect(formatWeight(0.04, 'g')).toBe('0.04 g');
    expect(formatWeight(0.028, 'g')).toBe('0.03 g');
    expect(formatWeight(0.004, 'g')).toBe('0.004 g');
    expect(formatWeight(0.028, 'oz')).toBe('0.001 oz');
    // An explicit digits request is honoured as typed.
    expect(formatWeight(0.04, 'g', 0)).toBe('0 g');
  });
```

In `packages/web/src/lib/lineWeightSync.test.ts` add:

```ts
describe('syncWeightEdit stores a real sub-gram weight', () => {
  it('keeps 0.3 g as "0.3", never "0" (zero is what EMPTIES a line)', () => {
    const synced = syncWeightEdit(twoLines, 'a', '0.3', '1000', true);
    expect(synced.lines[0].weightGrams).toBe('0.3');
  });
  it('still stores whole grams otherwise', () => {
    expect(syncWeightEdit(twoLines, 'a', '453.6', '1000', true).lines[0].weightGrams).toBe('454');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test -w @soap-calc/web -- src/lib/weightUnits.test.ts src/lib/lineWeightSync.test.ts`
Expected: FAIL — `expected '0 g' to be '0.04 g'` (the later `oz` assertion is not reached until that one passes) and `expected '0' to be '0.3'`.

- [ ] **Step 3: Widen the precision and keep the deci-gram**

In `packages/web/src/lib/weightUnits.ts` replace the `const d = …` statement in `formatWeightParts` with:

```ts
  let d =
    digits ??
    (value > 0 && value < 10 ? Math.max(config.displayDigits, 1) : config.displayDigits);
  // A positive dose must never print as zero (the promise in this function's own test):
  // below 0.05 g the one-decimal rule still rounds to "0", so widen until a digit shows.
  // Capped at 4 places; a caller that asked for explicit digits gets exactly those.
  if (digits === undefined) {
    while (value > 0 && d < 4 && Number(value.toFixed(d)) === 0) d += 1;
  }
```

In `packages/web/src/lib/lineWeightSync.ts` replace `formatGrams` with:

```ts
function formatGrams(n: number): string {
  const whole = Math.round(n);
  // Whole grams are the stored basis — except where rounding would erase a real weight:
  // a 0.3 g line stores "0.3", never "0", because 0 is what EMPTIES a line (syncWeightEdit).
  // parseInputDisplayToGrams already rounds to 0.1 g, so anything under 0.05 g arrives as 0.
  return whole === 0 && n > 0 ? String(Math.round(n * 10) / 10) : String(whole);
}
```

- [ ] **Step 4: Run and commit**

Run: `npm run test -w @soap-calc/web -- src/lib/weightUnits.test.ts src/lib/lineWeightSync.test.ts src/hooks/useRecipeInputs.test.ts`
Expected: PASS.

```bash
git add packages/web/src/lib/weightUnits.ts packages/web/src/lib/weightUnits.test.ts packages/web/src/lib/lineWeightSync.ts packages/web/src/lib/lineWeightSync.test.ts
git commit -m "fix(web): a positive dose never prints as 0 g, and a sub-gram line keeps its weight

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 12: Typing a total keeps a grams-only line

**Files:**
- Modify: `packages/web/src/lib/lineWeightSync.ts:190-193` (`syncBatchTotalEdit` tail — the final `return baseLines.map(…)`)
- Test: `packages/web/src/lib/lineWeightSync.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/web/src/lib/lineWeightSync.test.ts`:

```ts
describe('syncBatchTotalEdit on a mixed recipe (some percents, some grams-only)', () => {
  // Reachable: clear the total, set one line's percent (no grams without a total), type
  // another line's grams (no percent without a total), then type a total.
  const mixed: RecipeLine[] = [
    { key: 'a', oilId: 'olive-oil', weightGrams: '', weightPercent: '60' },
    { key: 'b', oilId: 'coconut-oil-76', weightGrams: '300', weightPercent: '' },
    { key: 'c', oilId: 'shea-butter', weightGrams: '', weightPercent: '' },
  ];
  it('sizes the percent line from the total and keeps the grams line, giving it its percent', () => {
    const out = syncBatchTotalEdit(mixed, '1000');
    expect(out[0]).toMatchObject({ weightGrams: '600', weightPercent: '60' });
    expect(out[1]).toMatchObject({ weightGrams: '300', weightPercent: '30' });
    expect(out[2]).toMatchObject({ weightGrams: '', weightPercent: '' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -w @soap-calc/web -- src/lib/lineWeightSync.test.ts`
Expected: FAIL — `out[1].weightGrams` is `''`.

- [ ] **Step 3: Keep the grams**

In `packages/web/src/lib/lineWeightSync.ts` replace the final `return baseLines.map(…)` of `syncBatchTotalEdit` with:

```ts
  return baseLines.map((line, i) => {
    if (exact[i] !== null) {
      return { ...line, weightGrams: String(floors[i] + (bumped.has(i) ? 1 : 0)) };
    }
    // No percent, but grams the maker typed (a line edited while the total was blank):
    // keep them and give the line the percent those grams are of the new total. The
    // footer flags an off-100% sum; independent entry means one edit never erases another.
    const grams = parseNum(line.weightGrams);
    if (grams !== null && grams > 0) {
      return { ...line, weightPercent: formatPercent((grams / batch) * 100) };
    }
    return { ...line, weightGrams: '' };
  });
```

- [ ] **Step 4: Run the sync, inputs and commit-drafts tests**

Run: `npm run test -w @soap-calc/web -- src/lib/lineWeightSync.test.ts src/lib/commitDrafts.test.ts src/hooks/useRecipeInputs.test.ts`
Expected: PASS. (If an existing test asserted that a grams-only line is cleared by a total edit, it pinned the data loss; replace its expectation with the kept grams and note it in the commit body.)

```bash
git add packages/web/src/lib/lineWeightSync.ts packages/web/src/lib/lineWeightSync.test.ts
git commit -m "fix(web): typing a total keeps a line that has grams but no percent

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 13: Percent headroom is written at display precision

**Files:**
- Modify: `packages/web/src/lib/recipe.ts:312-327` (`capAllocatedSum`)
- Test: `packages/web/src/lib/recipe.test.ts`

- [ ] **Step 1: Write the failing test**

Next to the existing "caps the running sum of post-cook superfat percents at 100" test add:

```ts
  it('writes the capped row at display precision, not float noise', () => {
    const s = normalizeSettings({
      postCookSuperfatOils: [
        { oilId: 'olive-oil', percent: '33.3' },
        { oilId: 'coconut-oil-76', percent: '33.3' },
        { oilId: 'shea-butter', percent: '40' },
      ],
    });
    expect(s.postCookSuperfatOils[2].percent).toBe('33.4');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -w @soap-calc/web -- src/lib/recipe.test.ts`
Expected: FAIL — received `'33.400000000000006'`.

- [ ] **Step 3: Round to a tenth**

In `capAllocatedSum` replace `return { ...oil, percent: String(headroom) };` with:

```ts
    // Percents display at one decimal (PERCENT_ROUNDING_EPSILON); write the cap the same way,
    // or 100 − 66.6 lands in the input as "33.400000000000006".
    return { ...oil, percent: String(Math.round(headroom * 10) / 10) };
```

- [ ] **Step 4: Run and commit**

Run: `npm run test -w @soap-calc/web -- src/lib/recipe.test.ts`
Expected: PASS.

```bash
git add packages/web/src/lib/recipe.ts packages/web/src/lib/recipe.test.ts
git commit -m "fix(web): write the capped post-cook percent at display precision

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 14: Whitespace and a blank KOH blend are not silent zeros

**Files:**
- Modify: `packages/web/src/lib/parseRecipeSettings.ts:100-130`
- Test: `packages/web/src/lib/parseRecipeSettings.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside the top-level `describe('parseRecipeSettings', …)` of `packages/web/src/lib/parseRecipeSettings.test.ts` (the file's fixture helper is `settings(overrides)`):

```ts
describe('blank and whitespace numeric settings (review 2026-09-19)', () => {
  it('a whitespace-only water % reads as blank → the default, not 0 g of water', () => {
    const r = parseRecipeSettings(settings({ waterMode: 'percent_of_oils', waterPercentOfOils: ' ' }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values.waterPercentOfOils).toBeUndefined();
  });
  it('a whitespace-only water:lye ratio reads as blank → the default, not an error', () => {
    const r = parseRecipeSettings(settings({ waterMode: 'lye_water_ratio', lyeWaterRatio: ' ' }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values.lyeWaterRatio).toBeUndefined();
  });
  it('dual lye with a blank KOH blend is an error, never a silent 0% KOH', () => {
    const r = parseRecipeSettings(settings({ lyeType: 'dual', kohBlendPercent: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/KOH blend/);
  });
});
```

Also DELETE the pre-existing test `'dual: empty blend percent is treated as 0 (not an error)'` inside `describe('kohBlendPercent — dual only', …)` (~line 244-250): it pinned the silent 0% KOH this task removes, and the new test above pins the replacement contract.

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test -w @soap-calc/web -- src/lib/parseRecipeSettings.test.ts`
Expected: FAIL — water `' '` returns `waterPercentOfOils: 0` (`expected +0 to be undefined`); ratio `' '` returns an error (`expected false to be true`); dual `''` returns `ok: true` with `kohBlendPercent: 0` (`expected true to be false`).

- [ ] **Step 3: Trim the numeric fields once; require the blend**

In `packages/web/src/lib/parseRecipeSettings.ts` add above `parseRecipeSettings`:

```ts
const NUMERIC_SETTING_KEYS = [
  'superfatPercent',
  'kohBlendPercent',
  'naohPurityPercent',
  'kohPurityPercent',
  'waterPercentOfOils',
  'lyeConcentrationPercent',
  'lyeWaterRatio',
] as const;

/** Numeric fields with surrounding whitespace trimmed, so `' '` is the same blank as `''`
 * everywhere below (Number(' ') is 0, which read as "0 g of water" and "0% KOH"). Only the
 * numeric fields: notes and names keep their whitespace. */
function trimNumericSettings(settings: RecipeSettings): RecipeSettings {
  const out = { ...settings };
  for (const key of NUMERIC_SETTING_KEYS) out[key] = settings[key].trim();
  return out;
}
```

Rename the parameter of `parseRecipeSettings` to `rawSettings` and add as its first line `const settings = trimNumericSettings(rawSettings);`.

Replace the dual-lye blend block with:

```ts
  let blend: { n: number | null; error?: string } | undefined;
  if (settings.lyeType === 'dual') {
    if (naohPurity.error) errors.push(naohPurity.error);
    if (kohPurity.error) errors.push(kohPurity.error);
    const [blendMin, blendMax] = opts.kohBlendRange ?? kohBlendRangeFor('cp');
    if (settings.kohBlendPercent === '') {
      // A blank blend is not 0% KOH: dual lye has no meaning without the split.
      errors.push(`KOH blend % is required for dual lye (${blendMin}–${blendMax})`);
    } else {
      blend = parseNonNegative(settings.kohBlendPercent, 'KOH blend %');
      if (blend.error) errors.push(blend.error);
      else if (blend.n! < blendMin || blend.n! > blendMax) {
        errors.push(`KOH blend % must be between ${blendMin} and ${blendMax}`);
      }
    }
  }
```

(The existing comment about the process registry default stays above the range read.)

- [ ] **Step 4: Run and commit**

Run: `npm run test -w @soap-calc/web -- src/lib/parseRecipeSettings.test.ts src/lib/calculateRecipe.test.ts src/App.test.tsx`
Expected: PASS.

```bash
git add packages/web/src/lib/parseRecipeSettings.ts packages/web/src/lib/parseRecipeSettings.test.ts
git commit -m "fix(web): whitespace numeric settings read as blank; a blank KOH blend is an error

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 15: The batch-target solver cannot loop forever

**Files:**
- Modify: `packages/web/src/lib/lineWeightSync.ts:~202-225` (`solveOilTotalForBatchTarget` entry, before `const fixed = …`)
- Test: `packages/web/src/lib/lineWeightSync.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('solveOilTotalForBatchTarget degenerate inputs', () => {
  it('returns the current oil total (no change) when the current batch is 0, instead of looping', { timeout: 2000 }, () => {
    expect(solveOilTotalForBatchTarget(twoLines, 1500, 1000, 0)).toBe(1000);
  });
  it('returns the current oil total for a non-finite target', { timeout: 2000 }, () => {
    expect(solveOilTotalForBatchTarget(twoLines, Number.NaN, 1000, 1400)).toBe(1000);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -w @soap-calc/web -- src/lib/lineWeightSync.test.ts`
Expected: the run HANGS with no output — the loop centre is `Infinity` and the loop is synchronous, so vitest's per-test `timeout` cannot fire and the second test never runs. That hang IS the failure: run under an external limit (`timeout 20 npm run test -w @soap-calc/web -- src/lib/lineWeightSync.test.ts` on a system with GNU timeout, or kill the process by hand), then proceed to Step 3.

- [ ] **Step 3: Guard the entry**

At the top of `solveOilTotalForBatchTarget`, before `const fixed = …`, add:

```ts
  // Degenerate inputs have no ratio to solve: a zero or non-finite current batch makes the
  // linear centre ±Infinity and the candidate loop below never terminates. Return the
  // current oil total — "no change" — which is what the callers' own guards do today.
  if (!(targetBatchGrams > 0) || !(currentOilTotalGrams > 0) || !(currentBatchGrams > 0)) {
    return Math.max(1, Math.round(currentOilTotalGrams > 0 ? currentOilTotalGrams : 1));
  }
```

- [ ] **Step 4: Run and commit**

Run: `npm run test -w @soap-calc/web -- src/lib/lineWeightSync.test.ts`
Expected: PASS.

```bash
git add packages/web/src/lib/lineWeightSync.ts packages/web/src/lib/lineWeightSync.test.ts
git commit -m "fix(web): guard the batch-target solver against a zero or non-finite batch

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 16: The pagehide flush commits an unblurred draft

**Files:**
- Modify: `packages/web/src/hooks/useRecipeAutosave.ts` (new optional `flushDrafts` parameter, used in `flush()`)
- Modify: `packages/web/src/App.tsx:231-233`
- Test: `packages/web/src/hooks/useRecipeAutosave.test.tsx`, `packages/web/src/App.test.tsx`

**Interfaces:**
- Produces: `useRecipeAutosave(process, recipeName, lines, settings, additives, scentColor, onSaveError?, flushDrafts?: () => SyncedRecipe)`. `SyncedRecipe` is `{ lines: RecipeLine[]; batchOilGrams: string; batchSetByUser: boolean }` from `lib/lineWeightSync`. App passes `() => inputs.flushCommittedDrafts()`.

- [ ] **Step 1: Write the failing hook test**

Append inside `describe('useRecipeAutosave', …)` in `packages/web/src/hooks/useRecipeAutosave.test.tsx`:

```ts
  it('commits the in-flight field drafts on pagehide before saving (a tab closed mid-edit keeps the edit)', () => {
    const lines = createStarterLines();
    const edited = lines.map((l, i) => (i === 0 ? { ...l, weightGrams: '600' } : l));
    const flushDrafts = vi.fn(() => ({ lines: edited, batchOilGrams: '1150', batchSetByUser: true }));
    renderHook(() =>
      useRecipeAutosave('cp', 'r', lines, DEFAULT_SETTINGS, [] as AdditiveLine[], SCENT, undefined, flushDrafts),
    );
    window.dispatchEvent(new Event('pagehide'));
    expect(flushDrafts).toHaveBeenCalledTimes(1);
    const draft = loadDraft('cp');
    expect(draft?.lines[0].weightGrams).toBe('600');
    expect(draft?.settings.batchOilGrams).toBe('1150');
    expect(draft?.settings.batchSetByUser).toBe(true);
  });
```

Append to `packages/web/src/App.test.tsx` (the file stubs `localStorage` in `beforeEach` and already imports `render`, `screen`, `fireEvent`, `loadDraft`; add `act` to the `@testing-library/react` import):

```ts
describe('autosave flush on pagehide', () => {
  it('a weight typed but not blurred survives the flush', () => {
    vi.useFakeTimers();
    try {
      render(<App />);
      const weight = screen.getByLabelText('Weight in g for Olive Oil') as HTMLInputElement;
      fireEvent.focus(weight);
      fireEvent.change(weight, { target: { value: '600' } });
      act(() => { window.dispatchEvent(new Event('pagehide')); });
      expect(loadDraft('cp')?.lines.find((l) => l.oilId === 'olive-oil')?.weightGrams).toBe('600');
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test -w @soap-calc/web -- src/hooks/useRecipeAutosave.test.tsx src/App.test.tsx`
Expected: FAIL — the hook test fails at runtime (`flushDrafts` called 0 times; vitest does not typecheck, `npm run typecheck` would flag the extra argument); the App test finds `'450'` where `'600'` is expected.

- [ ] **Step 3: Flush drafts before the hide-save**

In `packages/web/src/hooks/useRecipeAutosave.ts`:
- Import `type SyncedRecipe` from `'../lib/lineWeightSync'`.
- Add the parameter `flushDrafts?: () => SyncedRecipe,` after `onSaveError`, and beside `onSaveErrorRef`:

```ts
  // The inputs hook's draft flush (commitDrafts over the live refs). Held in a ref for the
  // same reason as onSaveError: the hide listener is registered once.
  const flushDraftsRef = useRef(flushDrafts);
  flushDraftsRef.current = flushDrafts;
```

- Replace the body of `flush()` with:

```ts
    function flush() {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // A field still focused holds its edit as a DRAFT (committed on blur/Enter), and a
      // tab close or mobile background-kill does not reliably blur first. Commit the drafts
      // now, exactly as export does (useRecipeInputs.handleExportCommitted), and save what
      // they resolve to.
      const synced = flushDraftsRef.current?.();
      const lines = synced ? synced.lines : linesRef.current;
      const settings = synced
        ? { ...settingsRef.current, batchOilGrams: synced.batchOilGrams, batchSetByUser: synced.batchSetByUser }
        : settingsRef.current;
      const draftsChanged =
        synced !== undefined &&
        (synced.lines !== linesRef.current || synced.batchOilGrams !== settingsRef.current.batchOilGrams);
      // Dirty check instead of timer-presence: a committed edit whose debounce effect
      // hasn't run yet has no timer but still needs saving. Also re-persist when the
      // slot is EMPTY (external deletion/eviction): this tab may hold the only copy,
      // and writing into an empty slot cannot clobber another tab's newer draft.
      if (!draftsChanged && !isDirty() && hasDraft(processRef.current)) return;
      const saved = saveDraft(
        processRef.current,
        recipeNameRef.current,
        lines,
        settings,
        additivesRef.current,
        scentColorRef.current,
      );
      if (saved) {
        lastSavedRef.current = {
          process: processRef.current,
          recipeName: recipeNameRef.current,
          lines,
          settings,
          additives: additivesRef.current,
          scentColor: scentColorRef.current,
        };
      } else {
        onSaveErrorRef.current?.();
      }
    }
```

In `packages/web/src/App.tsx` change the call to:

```ts
  useRecipeAutosave(
    process, recipeName, lines, settings, additives, scentColor,
    () => flashSaveMessage('Could not auto-save — export your recipe so you don’t lose it.'),
    () => inputs.flushCommittedDrafts(),
  );
```

(`inputs` is declared above this call at App.tsx:203; `flushCommittedDrafts` also applies the committed state, so the UI agrees with what was saved if the page survives.)

- [ ] **Step 4: Run and commit**

Run: `npm run test -w @soap-calc/web -- src/hooks/useRecipeAutosave.test.tsx src/App.test.tsx`
Expected: PASS.

```bash
git add packages/web/src/hooks/useRecipeAutosave.ts packages/web/src/hooks/useRecipeAutosave.test.tsx packages/web/src/App.tsx packages/web/src/App.test.tsx
git commit -m "fix(web): commit in-flight field drafts on pagehide before the autosave flush

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Phase D — performance and cleanup

### Task 17: The lye calculation memo is keyed on the fields it reads

**Files:**
- Modify: `packages/web/src/lib/calculateRecipe.ts` (export `CALC_SETTING_KEYS`, `recipeCalcKey`)
- Modify: `packages/web/src/hooks/useRecipeCalculation.ts`
- Test: `packages/web/src/hooks/useRecipeViewModel.test.tsx`

**Interfaces:**
- Produces: `recipeCalcKey(settings: RecipeSettings): string` — `JSON.stringify` of the nine fields `parseRecipeSettings` reads; `useRecipeCalculation` memoizes on `[lines, recipeCalcKey(settings), process]`.

- [ ] **Step 1: Write the failing test**

Append to `packages/web/src/hooks/useRecipeViewModel.test.tsx` (imports: `renderHook`, `act` from `@testing-library/react`; `useState` from `react`; `normalizeSettings` from `../lib/recipe`; `defaultsForProcess`, `normalizeSettingsWithinProcess` from `../lib/process`):

```ts
function useKeystrokeHarness({ process }: { process: ProcessId }) {
  const [settings, setSettings] = useState<RecipeSettings>(() =>
    normalizeSettingsWithinProcess(
      normalizeSettings({ ...DEFAULT_SETTINGS, ...defaultsForProcess(process), batchSetByUser: true }),
      process,
    ),
  );
  const [lines] = useState(() => createStarterLines());
  const [additives] = useState(() => createEmptyAdditives());
  const [scent] = useState(() => createEmptyScentColor());
  const vm = useRecipeViewModel({
    recipeName: 'r', lines, settings, additives, scentColor: scent, drafts: {}, weightUnit: 'g', process,
  });
  return { vm, setSettings };
}

test('a keystroke in a field the lye calc does not read leaves result, cure and properties untouched', () => {
  // Third element: whether the INSIGHTS may keep their identity too. The soaping temperature
  // is read directly by the insight rules (soaping_temp_high, ls_coconut_hot_cook) and is a
  // dependency of useFormulationInsights' own memo, so that row legitimately recomputes them.
  for (const [process, patch, insightsStable] of [
    ['cp', { batchNotes: 'x' }, true],
    ['cp', { soapingTempF: '126' }, false],
    ['ls', { preservativeDosePct: '0.9' }, true],
  ] as const) {
    const { result } = renderHook(useKeystrokeHarness, { initialProps: { process } });
    const before = result.current.vm;
    act(() => result.current.setSettings((s) => ({ ...s, ...patch })));
    const after = result.current.vm;
    expect(after.result).toBe(before.result);
    expect(after.cureEstimate).toBe(before.cureEstimate);
    expect(after.properties).toBe(before.properties);
    if (insightsStable) expect(after.insights).toBe(before.insights);
  }
});

test('a keystroke in a field the lye calc DOES read recomputes it', () => {
  const { result } = renderHook(useKeystrokeHarness, { initialProps: { process: 'cp' as ProcessId } });
  const before = result.current.vm;
  act(() => result.current.setSettings((s) => ({ ...s, superfatPercent: '8' })));
  expect(result.current.vm.result).not.toBe(before.result);
});
```

- [ ] **Step 2: Run to verify the first test fails**

Run: `npm run test -w @soap-calc/web -- src/hooks/useRecipeViewModel.test.tsx`
Expected: FAIL on the first assertion — `after.result` is a new object after a `batchNotes` change (measured in the dry run: before the fix a `batchNotes` keystroke changes `result, inputErrors, displayTotals, linePercents, insights, withheldRancidity, batchSheetData, cureEstimate, previewSettings`). The second test already passes; it guards the other direction.

- [ ] **Step 3: Key the memo on the read fields**

In `packages/web/src/lib/calculateRecipe.ts` add after the imports:

```ts
/** The settings fields calculateRecipe reads — exactly the ones parseRecipeSettings parses.
 * resolveLineWeights ignores settings by contract (useRecipeProperties.ts). Anything else on
 * RecipeSettings (notes, soaping temperature, preservative, dilution target, …) cannot change
 * the lye result, so the calc memo is keyed on these and nothing else. */
export const CALC_SETTING_KEYS = [
  'superfatPercent',
  'lyeType',
  'waterMode',
  'kohBlendPercent',
  'naohPurityPercent',
  'kohPurityPercent',
  'waterPercentOfOils',
  'lyeConcentrationPercent',
  'lyeWaterRatio',
] as const satisfies readonly (keyof RecipeSettings)[];

export function recipeCalcKey(settings: RecipeSettings): string {
  return JSON.stringify(CALC_SETTING_KEYS.map((key) => settings[key]));
}
```

Replace `packages/web/src/hooks/useRecipeCalculation.ts` with:

```ts
import { useMemo } from 'react';
import { calculateRecipe, recipeCalcKey } from '../lib/calculateRecipe';
import type { RecipeLine, RecipeSettings } from '../lib/recipe';
import type { ProcessId } from '../lib/process';

export function useRecipeCalculation(
  lines: RecipeLine[],
  settings: RecipeSettings,
  process: ProcessId,
) {
  // Keyed on the fields the calc reads (recipeCalcKey), not on the settings object: the
  // preview settings are rebuilt on every settings change, so a notes or temperature
  // keystroke used to recompute the lye result and, through its identity, the insights,
  // cure model and batch sheet (measured 2026-09-19). Same serialized-key discipline as
  // useRecipeViewModel's pcsfOilsKey.
  const calcKey = recipeCalcKey(settings);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by content, see above
  return useMemo(() => calculateRecipe(lines, settings, process), [lines, calcKey, process]);
}
```

If the existing tests build `RecipeSettings` objects that lack one of the nine keys (an older `Partial` fixture), `settings[key]` is simply `undefined` in the key — no behaviour change.

- [ ] **Step 4: Run the web suite and commit**

Run: `npm run test -w @soap-calc/web`
Expected: PASS. Afterwards a `batchNotes` or `preservativeDosePct` keystroke changes only `previewState` (the harness passes a fresh `drafts` literal), `previewSettings` and `batchSheetData` (it prints the notes) — correct and cheap. A `soapingTempF` keystroke also recomputes `insights` and `withheldRancidity`, which read it.

```bash
git add packages/web/src/lib/calculateRecipe.ts packages/web/src/hooks/useRecipeCalculation.ts packages/web/src/hooks/useRecipeViewModel.test.tsx
git commit -m "perf(web): key the lye calculation memo on the settings fields it reads

A notes, temperature or preservative keystroke rebuilt the lye result and,
through its identity, the insights, cure model and batch sheet.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 18: Drop the unused `confidence` field from the lite bundle

Measured: 70,582 → 66,315 bytes (−4,267, −6%). `aliases` stays: `searchOils` reads it. (Optional follow-up, gated: emitting `aliases` only when it differs from `[normalizeOilName(displayName)]` — true for birch-tar alone — and matching the normalized display name in `searchOils` instead would save a further 6,834 bytes; do it only with a test that every current `oils.test.ts` search query still returns the same ids.)

**Files:**
- Modify: `packages/oils-data/scripts/build-canonical.ts:593` (lite writer)
- Modify: `packages/web/src/lib/oils.ts:13` (type)

- [ ] **Step 1: Confirm nothing reads it**

Run: `grep -rn "\.confidence" packages/web/src | grep -v "\.test\." | grep -v "model.confidence\|workability.confidence"`
Expected: no output (the two excluded hits are cure/workability model fields, not the oil record).

- [ ] **Step 2: Remove the field**

In `packages/oils-data/scripts/build-canonical.ts` delete the line `confidence: oil.confidence,` from the `liteDb.oils` map. In `packages/web/src/lib/oils.ts` delete `confidence?: string;` from `LiteOilRecord`.

- [ ] **Step 3: Rebuild, typecheck, test, measure**

Run: `npm run build:oils && npm run validate:oils && npm run typecheck && npm run test -w @soap-calc/web -- src/lib/oils.test.ts && wc -c packages/oils-data/data/canonical-oils-lite.json`
Expected: PASS; the byte count drops from 70,582 to 66,315.

- [ ] **Step 4: Commit**

```bash
git add packages/oils-data/scripts/build-canonical.ts packages/web/src/lib/oils.ts packages/oils-data/data
git commit -m "perf(oils-data): drop the unread confidence field from the lite bundle

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 19: Withdrawn — `colorantsByFamily()` is already called once

Checked while writing this plan: the only caller is `packages/web/src/components/ColorantsPanel.tsx:71`, `const COLORANT_GROUPS = colorantsByFamily();` at module scope. The function runs once per page load, so hoisting the grouping inside `colorant-catalog.ts` would change nothing measurable. No action.

### Task 20: Dead code and duplicate helpers

**Files:**
- Create: `packages/web/src/lib/isRecord.ts`, `packages/web/src/lib/commitOnEnter.ts`
- Modify: `packages/web/src/lib/recipe.ts` (re-export `isRecord`; single `normalizePostCookSuperfatOils` call), `recipeFile.ts:81`, `recipeStorage.ts:59`, `pricingProfile.ts:55`, `moldSizerStorage.ts:8`, `resolveLineWeights.ts`, `calculateRecipe.ts:48-50`, `RecipeOilsPanel.tsx:16`, `BatchBasics.tsx:8`, `App.tsx:641,749,759`
- Delete: `packages/web/src/lib/calculateProperties.ts`, `packages/web/src/lib/calculateProperties.test.ts`

- [ ] **Step 1: Confirm each item is dead or duplicated (the guard against removing a reader)**

Run:
```bash
grep -rn "calculateProperties" packages/web/src | grep -v "^packages/web/src/lib/calculateProperties"
grep -rn "\.weightPercent" packages/web/src/lib/calculateRecipe.ts packages/web/src/lib/calculateFattyAcids.ts packages/web/src/lib/calculateRecipeIndexes.ts
grep -rn "resolved\.errors\|\.errors" packages/web/src/lib/calculateRecipe.ts
grep -rn "function isRecord" packages/web/src | grep -v test
grep -rn "const commitOnEnter" packages/web/src
```
Expected: no `calculateProperties` reference outside the module and its own test (the grep prints nothing); no `.weightPercent` read on resolved rows; two `.errors` hits in calculateRecipe.ts — `parsed.errors` (kept) and the `resolved.errors` loop (~line 48 before Task 17, ~68 after it); five `function isRecord`; two `const commitOnEnter` (both arrow functions with identical bodies, `RecipeOilsPanel.tsx:16` and `BatchBasics.tsx:8`).

- [ ] **Step 2: One `isRecord`**

Create `packages/web/src/lib/isRecord.ts`:

```ts
/** A non-null object — the one guard every JSON-reading module uses. Arrays pass, as they
 * always have in each of the five copies this replaces; tightening it would be a behaviour
 * change in every loader. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
```

(All five existing copies have exactly this body — verified in the dry run.) In `recipe.ts` delete the definition, add `import { isRecord } from './isRecord';` after the last import (recipe.ts calls it itself at ~lines 222 and 345) AND `export { isRecord } from './isRecord';` (scentColor.ts imports it from `./recipe`). In the four other files delete the local definition and add `import { isRecord } from './isRecord';`.

- [ ] **Step 3: One normalize call**

In `normalizeSettings` (recipe.ts ~:640-644) add `const postCookSuperfatOils = normalizePostCookSuperfatOils(partial ?? {});` above the returned object and use it in both places: `postCookSuperfatTotalPercent: normalizePostCookSuperfatTotal(partial ?? {}, postCookSuperfatOils),` and `postCookSuperfatOils,`.

- [ ] **Step 4: Trim `resolveLineWeights`**

In `resolveLineWeights.ts` remove `weightPercent` from `ResolvedLine` and its computation loop, and remove `errors` from `ResolvedWeights` (return `{ lines: resolved, recipeOilWeightGrams }`). In `calculateRecipe.ts` delete the `for (const err of resolved.errors) {…}` loop. In `resolveLineWeights.test.ts` (~line 15) delete the assertion on `result.lines[0].weightPercent` and retitle that test `'resolves gram weights and the recipe oil total'`. Delete `calculateProperties.ts` and `calculateProperties.test.ts`.

- [ ] **Step 5: One `commitOnEnter`**

Create `packages/web/src/lib/commitOnEnter.ts` with the arrow function currently at `RecipeOilsPanel.tsx:16` (verified identical to `BatchBasics.tsx:8`), its doc comment, and `import type { KeyboardEvent } from 'react'`; export it as `commitOnEnter`. In both components delete the local copy AND the now-unused `import type { KeyboardEvent } from 'react'` (typecheck fails on the unused import otherwise), then `import { commitOnEnter } from '../lib/commitOnEnter';`.

- [ ] **Step 6: App hygiene**

In `App.tsx` change the three `setSettings({ ...settings, X })` calls (lines 641, 749, 759) to `setSettings((s) => ({ ...s, X }))`. (The `pricingContext` deps fix landed in Task 9.)

- [ ] **Step 7: Typecheck, test, commit**

Run: `npm run typecheck && npm run test -w @soap-calc/web`
Expected: PASS — one test file and two tests fewer (the deleted `calculateProperties.test.ts`).

```bash
git add -A packages/web/src
git commit -m "chore(web): one isRecord, one commitOnEnter, one normalize call; drop dead resolveLineWeights fields and calculateProperties

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Verify-first items (write the test; act only if it fails)

- **Autosave writes the just-imported workspace back after `setProcess`/import** (`useRecipeAutosave.ts:68-85`, plausible): in `useRecipeAutosave.test.tsx`, rerender the hook with a new `lines` identity AND a matching `lastSaved` (simulate import by rendering, saving, then rerendering with the loaded objects); assert `saveDraft` is not called again within 500 ms. If it is, seed `lastSavedRef` from the new props on an import path — not planned until the test fails.

## Final gate (after every task)

Run: `npm test && npm run build:web`
Expected: typecheck, validate:oils, all unit tests pass; the web build succeeds.

## Self-review notes

- Coverage: every Grounding row G1–G18 maps to a task (G1→1, G2→2, G3→3, G4→4, G5→5, G6/G7→9, G8→10, G9→8, G10→11, G11→12, G12→13, G13→14, G14→15, G15→16, G16→17, G17→18, G18→20 (Task 19 withdrawn, see its note); the guard/docs gaps → 6, 7).
- Names used across tasks: `reserveApplied` (Task 9 only), `cookFactor` (Task 9 only), `matchingAdditiveEntries` / `NamedCatalogEntry.addAt` (Task 8 only), `recipeCalcKey` / `CALC_SETTING_KEYS` (Task 17 only), `FnwlRow.variants` (Task 4 only), `flushDrafts` (Task 16 only). No task depends on another's new name.
- Data tasks (1–6, 18) each regenerate `packages/oils-data/data/*.json`; run them in order so each commit's data diff is its own.
