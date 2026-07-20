# Iodine derivation basis fix + gate-threshold recalibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `deriveChemistryFromProfile`'s iodine oil-basis (consistent with its SAP calc and its "g I₂/100 g oil" contract) and raise the iodine gate's warn threshold above the measured cross-source scatter, so the gate compares like-with-like and stops flagging literature spread as error.

**Architecture:** Part 1 adds the glyceryl factor (already used by the SAP calc) to the FA-basis iodine sum in `packages/core/src/fatty-acid-chemistry.ts`. Its only downstream consumer is the iodine gate (`profile-iodine-deviations.ts`); shipped `iodine`/`ins` come from stored iodine, so oil records don't move. Part 2 raises `IODINE_REL_THRESHOLD_PCT` 8→15, updates the gate's threshold-relative unit fixtures, and removes the now-stale pomegranate acknowledgment (its oil-basis deviation ~10% falls below 15%). Rebuild regenerates the catalog (only `generatedAt` churns) and the gitignored build report.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), vitest, npm workspaces, tsx. Spec: `docs/superpowers/specs/2026-07-20-iodine-basis-and-threshold-design.md`.

## Global Constraints

- **Ship Part 1 and Part 2 together.** Part 1 alone only *churns* the warn set (see spec); both land before any merge.
- **Do not change shipped `iodine`/`ins`/`sapKoh`.** They derive from *stored* iodine (`sapKoh` from the profile, unaffected by the iodine fix). After rebuild, `canonical-oils.json` oil records must be identical except `generatedAt` — verify this.
- **Do not touch `IODINE_GROSS_PCT = 25` or `IODINE_ABS_THRESHOLD = 10`.** Only the relative warn threshold moves.
- Constants are exact: `GLYCERYL_ADJUSTMENT = 38.049` (already defined in core); new `IODINE_REL_THRESHOLD_PCT = 15`.
- `build-report.json` is **gitignored** — never stage it. Stage explicit paths only; never `git add -A`. Do not push/PR.
- Work in the worktree `/Users/str/soap-calc-wt-iodine-basis` on branch `feat/iodine-basis-fix`. The Bash tool's cwd resets — prefix every command with `cd /Users/str/soap-calc-wt-iodine-basis && …`.
- **Merge-time caution:** this touches `@soap-calc/core` on the `feat/iodine-consistency-gate` lineage, which a concurrent effort may also touch — reconcile `fatty-acid-chemistry.ts` before merging (not a concern during isolated implementation here).

---

### Task 1: Oil-basis iodine in `deriveChemistryFromProfile`

**Files:**
- Modify: `packages/core/src/fatty-acid-chemistry.ts` (the derivation body, ~lines 79-95)
- Test: `packages/core/src/fatty-acid-chemistry.test.ts`

**Interfaces:**
- Unchanged signature: `deriveChemistryFromProfile(profile) → { sapKoh, iodineValue, ins, mappedPercent } | null`. Only `iodineValue` (and the derived `ins`) change value — now oil-basis.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/fatty-acid-chemistry.test.ts` (inside the existing `describe`):

```ts
  it('derives iodine on the OIL (triglyceride) basis: FA-basis sum × glyceryl factor', () => {
    // Pure oleic (C18:1, MW 282.46, 1 double bond): FA-basis IV = 100·253.809/282.46 = 89.86.
    // Triglyceride factor = 3·282.46 / (3·282.46 + 38.049) = 0.95702 → oil-basis IV ≈ 86.00.
    const r = deriveChemistryFromProfile({ oleic: 100 })!;
    const faBasis = (100 * 253.809) / 282.46;
    const factor = (3 * 282.46) / (3 * 282.46 + 38.049);
    expect(r.iodineValue).toBeCloseTo(faBasis * factor, 4);
    expect(r.iodineValue).toBeCloseTo(86.0, 1);
    expect(r.iodineValue).toBeLessThan(faBasis); // strictly below the FA-basis value
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -w @soap-calc/core -- fatty-acid-chemistry`
Expected: FAIL — current code returns the FA-basis value (89.86), so `iodineValue` is `89.86`, not `86.02`; the `toBeCloseTo(86.02, 1)` and `toBeLessThan` assertions fail.

- [ ] **Step 3: Apply the oil-basis conversion**

In `packages/core/src/fatty-acid-chemistry.ts`, rename the accumulator to `iodineValueFaBasis` and derive the oil-basis value after `meanMolarMass`. Replace the block:

```ts
  let molarMassSum = 0;
  let mappedPercent = 0;
  let iodineValue = 0;

  for (const [acid, percent] of Object.entries(profile)) {
    const fa = FATTY_ACID_PROPERTIES[acid];
    if (!fa || !(percent > 0)) continue;
    molarMassSum += percent * fa.molecularWeight;
    mappedPercent += percent;
    iodineValue += (percent * fa.doubleBonds * DIIODINE_MASS) / fa.molecularWeight;
  }

  if (mappedPercent < MIN_MAPPED_PERCENT) return null;

  const meanMolarMass = molarMassSum / mappedPercent;
  const sapKoh = (3 * KOH_MOLAR_MASS) / (3 * meanMolarMass + GLYCERYL_ADJUSTMENT);
  const ins = Math.round(sapKoh * 1000 - iodineValue);

  return { sapKoh, iodineValue, ins, mappedPercent };
```

with:

```ts
  let molarMassSum = 0;
  let mappedPercent = 0;
  let iodineValueFaBasis = 0;

  for (const [acid, percent] of Object.entries(profile)) {
    const fa = FATTY_ACID_PROPERTIES[acid];
    if (!fa || !(percent > 0)) continue;
    molarMassSum += percent * fa.molecularWeight;
    mappedPercent += percent;
    iodineValueFaBasis += (percent * fa.doubleBonds * DIIODINE_MASS) / fa.molecularWeight;
  }

  if (mappedPercent < MIN_MAPPED_PERCENT) return null;

  const meanMolarMass = molarMassSum / mappedPercent;
  const sapKoh = (3 * KOH_MOLAR_MASS) / (3 * meanMolarMass + GLYCERYL_ADJUSTMENT);
  // The Σ above is per 100 g of *fatty acids*; an iodine value is defined per 100 g of *oil*.
  // Convert with the same fatty-acyl mass fraction the SAP calc uses (shares the denominator),
  // so iodineValue honors its "g I₂ / 100 g oil" contract instead of running ~4.4% high.
  const glycerideFactor = (3 * meanMolarMass) / (3 * meanMolarMass + GLYCERYL_ADJUSTMENT);
  const iodineValue = iodineValueFaBasis * glycerideFactor;
  const ins = Math.round(sapKoh * 1000 - iodineValue);

  return { sapKoh, iodineValue, ins, mappedPercent };
```

Also update the `DerivedChemistry.iodineValue` doc comment (~line 62) to affirm it is oil-basis (the contract text "g I₂ / 100 g oil" is now accurate — no wording change required if it already says that; add "(computed on the triglyceride basis)" for clarity).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w @soap-calc/core -- fatty-acid-chemistry`
Expected: PASS. The new test passes; the existing loose assertions still hold (olive oil-basis IV ~82.7 is still `> 70` and still `> coconut`; the `ins == round(sapKoh*1000 - iodineValue)` identity still holds by construction).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck -w @soap-calc/core`
Expected: no errors.

- [ ] **Step 6: Verify shipped oil records do NOT move**

Rebuild the catalog and confirm only `generatedAt` changed (oil `iodine`/`ins`/`sapKoh` come from stored iodine, so they must be identical):

Run:
```
cd /Users/str/soap-calc-wt-iodine-basis && npm run build -w @soap-calc/oils-data
git diff --stat packages/oils-data/data/canonical-oils.json
git diff packages/oils-data/data/canonical-oils.json | grep -E '"iodine"|"ins"|"sapKoh"' | head
```
Expected: the second command shows the file changed; the third shows **no** `iodine`/`ins`/`sapKoh` line changes (only `generatedAt` differs). If any oil record's numbers moved, STOP — the core change leaked into shipped data, which it must not.

- [ ] **Step 7: Commit**

```bash
cd /Users/str/soap-calc-wt-iodine-basis
git add packages/core/src/fatty-acid-chemistry.ts \
  packages/core/src/fatty-acid-chemistry.test.ts \
  packages/oils-data/data/canonical-oils.json \
  packages/oils-data/data/canonical-oils-lite.json
git commit -m "fix(core): compute derived iodine on the oil (triglyceride) basis

Derived iodine used the FA-basis sum (~4.4% high) while its sibling SAP calc
and its 'g I2/100g oil' contract are oil-basis. Apply the same glyceryl factor.
Only the iodine gate consumes derived.iodineValue; shipped iodine/ins use stored
iodine, so oil records are unchanged (generatedAt churn only)."
```

---

### Task 2: Recalibrate the warn threshold + fixtures + acknowledgments

**Files:**
- Modify: `packages/oils-data/src/profile-iodine-deviations.ts` (threshold constant ~line 7; remove pomegranate from `KNOWN_PROFILE_IODINE_DEVIATIONS`)
- Modify: `packages/oils-data/src/profile-iodine-deviations.test.ts` (threshold-relative fixtures)
- Regenerate: `packages/oils-data/data/canonical-oils.json`, `canonical-oils-lite.json`

**Interfaces:**
- Consumes: the oil-basis `deriveChemistryFromProfile` (Task 1). `classifyProfileIodineDeviations` / `KNOWN_PROFILE_IODINE_DEVIATIONS` signatures unchanged.

- [ ] **Step 1: Update the gate unit-test fixtures for the 15% threshold**

The fixtures in `profile-iodine-deviations.test.ts` are defined relative to the derived `iv`, but their multipliers were tuned to the 8% threshold. Update them:

Replace:
```ts
const grossHi = iv * 1.3; // rel +30%, abs ~+24  -> gross
const moderate = iv * 1.14; // rel +14%, abs ~+11 -> flagged but not gross
const relOnly = iv * 1.09; // rel +9%,  abs ~+7  -> abs below floor, NOT flagged
```
with:
```ts
const grossHi = iv * 1.3; // rel +30% -> gross (>= IODINE_GROSS_PCT 25)
const moderate = iv * 1.2; // rel +20% -> warn (>= 15% threshold, < 25% gross)
const belowThreshold = iv * 1.12; // rel +12% -> below the 15% warn threshold, NOT flagged
```
Then rename the fixture use on line ~52's `relOnly` test to `belowThreshold`, and change that test's title/body:
```ts
  it('does not flag a deviation below the relative warn threshold', () => {
    expect(classifyProfileIodineDeviations([oil({ id: 'bt', iodine: belowThreshold })])).toEqual([]);
  });
```
The `moderate`-based test (`treats a moderate verified deviation as warn`) keeps `moderate` and its `expect(d.tier).toBe('warn')` — now valid at +20%.

Add a low-IV fixture + test to preserve absolute-floor coverage (at low IV, 15% rel is below the 10-unit floor, so the floor still governs):
```ts
  it('does not flag a low-IV oil whose deviation clears 15% but not the 10-unit floor', () => {
    // deriveChemistry oil-basis IV for this profile is ~38.7; +20% rel is only ~+7.7 units.
    const lowProfile = { oleic: 45, palmitic: 30, stearic: 25 };
    const ivLow = deriveChemistryFromProfile(lowProfile)!.iodineValue;
    const [none] = classifyProfileIodineDeviations([
      oil({ id: 'lo', fattyAcids: lowProfile, iodine: ivLow * 1.2 }),
    ]);
    expect(none).toBeUndefined();
  });
```
(Ensure `deriveChemistryFromProfile` is imported in the test — it already is.)

- [ ] **Step 2: Run the fixtures against the OLD threshold to see them fail**

Run: `npm run test -w @soap-calc/oils-data -- profile-iodine-deviations`
Expected: FAIL — with the threshold still 8, `moderate = iv*1.2` is fine but `belowThreshold = iv*1.12` (+12%) now flags (12 ≥ 8), so the "does not flag below threshold" test fails. This proves the fixture pins the threshold.

- [ ] **Step 3: Raise the relative warn threshold to 15**

In `packages/oils-data/src/profile-iodine-deviations.ts`, change:
```ts
export const IODINE_REL_THRESHOLD_PCT = 8;
```
to:
```ts
export const IODINE_REL_THRESHOLD_PCT = 15;
```
Update its doc comment to state the rationale: independent published iodine values scatter ±10–16% per oil (research-papers cross-check), so a warn threshold below that flags literature spread, not error; 15% sits at the top of the measured scatter. Leave `IODINE_ABS_THRESHOLD` (10) and `IODINE_GROSS_PCT` (25) unchanged.

- [ ] **Step 4: Run the gate unit tests — expect PASS**

Run: `npm run test -w @soap-calc/oils-data -- profile-iodine-deviations`
Expected: PASS (all fixtures now consistent with the 15% threshold).

- [ ] **Step 5: Rebuild + recalibrate acknowledgments against the consistency guard**

Run: `npm run build -w @soap-calc/oils-data && npm run test -w @soap-calc/oils-data -- profile-iodine-consistency`
Expected: the consistency test's "every acknowledged oil still deviates" assertion FAILS for `pomegranate-seed-oil` — at oil-basis its deviation is ~10% (stored 200 vs derived ~222), below the new 15% threshold, so it no longer flags and its acknowledgment is stale.

Remove the stale acknowledgment: in `packages/oils-data/src/profile-iodine-deviations.ts`, delete the `'pomegranate-seed-oil': …` entry from `KNOWN_PROFILE_IODINE_DEVIATIONS`. Keep `nutmeg-butter` and `tallow-deer` (both still grossly deviate — nutmeg ~46 vs ~4, tallow-deer ~31 vs ~60). Do NOT lower the threshold to keep the pomegranate ack; the IODINE_CORRECTIONS note (which set pomegranate to 200) already records the conjugated-punicic reasoning.

Re-run: `npm run test -w @soap-calc/oils-data -- profile-iodine-consistency`
Expected: PASS (no stale acknowledgment; error tier still empty).

- [ ] **Step 6: Full validate — Errors: 0, warn backlog shrunk**

Run: `npm run validate -w @soap-calc/oils-data`
Expected: `Errors: 0`. The iodine warn backlog is now a short list of >15% outliers (the ±10–16% scatter no longer trips). Inspect the deferred set is sane:
```
node -e "const r=require('./packages/oils-data/data/build-report.json'); console.log(r.iodineDeviations.map(d=>d.id+':'+d.tier))"
```
Expected: only `warn`/`acknowledged` tiers, zero `error`; a shorter warn list than the pre-change ~13-oil backlog.

- [ ] **Step 7: Typecheck + commit**

Run: `npm run typecheck -w @soap-calc/oils-data`
Then:
```bash
cd /Users/str/soap-calc-wt-iodine-basis
git add packages/oils-data/src/profile-iodine-deviations.ts \
  packages/oils-data/src/profile-iodine-deviations.test.ts \
  packages/oils-data/data/canonical-oils.json \
  packages/oils-data/data/canonical-oils-lite.json
git commit -m "feat(oils): raise iodine warn threshold 8->15% above measured scatter

Now that derived iodine is oil-basis, calibrate the moderate warn tier above the
+/-10-16% cross-source scatter so it flags outliers, not literature spread. Remove
the now-within-threshold pomegranate acknowledgment (drift guard). Gross/error tier
(25%) and abs floor (10) unchanged."
```

---

### Task 3: Repo-wide verification

**Files:** none (verification only).

- [ ] **Step 1: Full repo gate**

Run: `cd /Users/str/soap-calc-wt-iodine-basis && npm test`
Expected: `typecheck` clean, `validate:oils` **Errors: 0**, all workspace tests pass (core + oils-data + web).

- [ ] **Step 2: Confirm the invariants held**

Run:
```
cd /Users/str/soap-calc-wt-iodine-basis
node -e "const r=require('./packages/oils-data/data/build-report.json'); const d=r.iodineDeviations; console.log('tiers:',[...new Set(d.map(x=>x.tier))],'anyError:',d.some(x=>x.tier==='error'))"
git diff --stat feat/iodine-consistency-gate..HEAD -- packages/oils-data/data/canonical-oils.json
```
Expected: tiers ⊆ `['warn','acknowledged']`, `anyError: false`. The canonical-oils.json diff over the branch is `generatedAt`-only (grep it to confirm no `iodine`/`ins`/`sapKoh` line moved) — shipped oil records unchanged, exactly as intended.

- [ ] **Step 3: Final commit if anything changed**

If Steps 1–2 produced no file changes, nothing to commit. Otherwise stage explicit paths and commit `chore(oils): iodine-basis fix verification`.

## Self-Review notes (author)

- **Spec coverage:** oil-basis iodine via glyceryl factor (Task 1) ✓; only-consumer-is-the-gate / shipped records unchanged (Task 1 Step 6, Task 3 Step 2) ✓; warn threshold → 15% above measured scatter (Task 2) ✓; acknowledgment recalibration incl. the pomegranate removal the drift guard forces (Task 2 Step 5) ✓; gross/error tier + abs floor untouched (Global Constraints) ✓; ship-together / build-stays-green ordering (Task 1 before Task 2, both before merge) ✓.
- **Fixtures are threshold-relative:** grossHi/moderate/belowThreshold scale with derived `iv`, which itself drops ~4.4% under Task 1 — the multipliers (1.3/1.2/1.12) are chosen relative to the 15%/25% thresholds, not absolute values, so Task 1's change doesn't invalidate them.
- **Type consistency:** `IODINE_REL_THRESHOLD_PCT`, `KNOWN_PROFILE_IODINE_DEVIATIONS`, `deriveChemistryFromProfile`, `glycerideFactor` used consistently; no signature changes.
- **Known follow-up:** conjugated fatty acids (punicic mapped as linolenic) still make derived iodine an imperfect oracle for a few oils — out of scope; the wider warn band tolerates it.
