# Gradual Dilution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the book's third dilution method — record the water you actually poured — so the preservative doses from the batch that exists rather than the one that was predicted, and nest the preservative inside the Dilution panel.

**Architecture:** Gradual derives a concentration from `paste + water` and writes it into `settings.soapConcentrationPercent`, the one figure every downstream consumer already reads. Verified: `solutionGrams` then recovers `paste + water` exactly, so there is **no new dose basis and no new plumbing**. Portion scope reports without writing back, because a jar diluted thinner has not redefined the recipe.

**Tech Stack:** TypeScript, React 19.1, Vitest + @testing-library/react (jsdom), Playwright, npm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-10-ls-gradual-dilution-design.md`

## Global Constraints

- **Baseline green and must stay green.** `npm test` at `0f47cf6`: typecheck + oils validation (0 errors) + core 513 + oils-data 101 + web 1227. Run it at the end of every task.
- **Commits.** `AGENTS.md` forbids auto-commit unless explicitly asked. The per-task commit steps below run on the user's explicit choice of subagent-driven execution **for this run**; a reuser does not inherit that authorisation.
- **Every commit compiles.** Task order avoids an intermediate broken tree — do not reorder.
- **No test deleted or weakened to make another pass.**
- **Write back at 2 decimal places, not ratio's 1.** Measured: at 1 dp the recovered mass sits up to **7.9 g** from what was poured; at 0 dp up to **47.0 g**; at 2 dp under a gram. See the spec's drift table.
- **Clamp the written value to `[1, 99]` and flag it** — never refuse. `calculateDilution` rejects `<= 0` and `>= 100`, and writing out of range sends `dilution` to null, vanishing the panel the maker needs in order to fix it. Ratio already solved this (`DilutionPanel.tsx:280-286`); copy it.
- **"Finished so far" prints from the raw inputs**, never from `dilution.solutionGrams`. Even at 2 dp they differ; two figures shown as one number must be one number.
- **Portion gradual must NEVER write back** to `settings.soapConcentrationPercent`.
- Doses remain % w/w of the finished, ready-for-use product.
- Run from repo root. Full: `npm test`. Web file: `npm test -w @soap-calc/web -- src/path/f.test.tsx`. Core file: `npm test -w @soap-calc/core -- src/f.test.ts`. E2E: `npm run test:e2e -w @soap-calc/web -- e2e/f.spec.ts`.

---

### Task 1: Core — the gradual arithmetic

Pure, additive, no UI. Nothing else changes, so the tree stays green.

**Files:**
- Modify: `packages/core/src/dilution.ts` (append after `calculateDilution`)
- Test: `packages/core/src/dilution.test.ts` (append a `describe`)

**Interfaces:**
- Produces: `gradualDilutionFrom(input): GradualDilutionResult | null`. Tasks 3, 5 and 7 consume it.

- [ ] **Step 1: Write the failing tests**

```ts
describe('gradualDilutionFrom', () => {
  // A 1,041 g-anhydrous batch whose paste weighs 1,423 g (382 g cook water).
  const base = { pasteGrams: 1423, anhydrousGrams: 1041 };

  test('finished mass is exactly paste + water, and the concentration follows', () => {
    const r = gradualDilutionFrom({ ...base, waterAddedGrams: 2000 })!;
    expect(r.finishedGrams).toBe(3423);
    expect(r.concentrationPercent).toBeCloseTo(30.4119, 4);
  });

  test('the written concentration is rounded to 2 dp — 1 dp drifts ~8 g, which is visible', () => {
    const r = gradualDilutionFrom({ ...base, waterAddedGrams: 2000 })!;
    expect(r.writeBackPercent).toBe(30.41);
    expect(r.clamped).toBe(false);
  });

  test('round trip: calculateDilution on the written value recovers what was poured, under a gram', () => {
    const r = gradualDilutionFrom({ ...base, waterAddedGrams: 2000 })!;
    const d = calculateDilution({
      anhydrousGrams: 1041, cookWaterGrams: 382, kohGrams: 191, naohGrams: 0,
      soapConcentrationPercent: r.writeBackPercent,
    })!;
    expect(Math.abs(d.solutionGrams - r.finishedGrams)).toBeLessThan(1);
  });

  test('an extreme record clamps what is WRITTEN and says so, keeping the readout honest', () => {
    // Almost no water: the true concentration exceeds 99%.
    const r = gradualDilutionFrom({ pasteGrams: 1050, anhydrousGrams: 1041, waterAddedGrams: 0 })!;
    expect(r.concentrationPercent).toBeGreaterThan(99); // readout tells the truth
    expect(r.writeBackPercent).toBe(99);                // written value is clamped
    expect(r.clamped).toBe(true);
  });

  test('junk and blanks yield null rather than a bogus concentration', () => {
    expect(gradualDilutionFrom({ ...base, waterAddedGrams: NaN })).toBeNull();
    expect(gradualDilutionFrom({ ...base, waterAddedGrams: -1 })).toBeNull();
    expect(gradualDilutionFrom({ pasteGrams: 0, anhydrousGrams: 1041, waterAddedGrams: 100 })).toBeNull();
    expect(gradualDilutionFrom({ pasteGrams: 1423, anhydrousGrams: 0, waterAddedGrams: 100 })).toBeNull();
  });

  test('zero water is a legitimate record — the pot before any dilution', () => {
    const r = gradualDilutionFrom({ ...base, waterAddedGrams: 0 })!;
    expect(r.finishedGrams).toBe(1423);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @soap-calc/core -- src/dilution.test.ts`
Expected: FAIL — `gradualDilutionFrom is not a function`.

- [ ] **Step 3: Implement**

```ts
export type GradualDilutionInput = {
  /** The pot's paste mass — measured when the maker weighed it, else computed. */
  pasteGrams: number;
  /** Anhydrous soap (oils + lye), the numerator of soap concentration. */
  anhydrousGrams: number;
  /** Total water poured in so far. Zero is legitimate: the pot before dilution. */
  waterAddedGrams: number;
};

export type GradualDilutionResult = {
  /** paste + water, from the raw inputs. What the panel prints. */
  finishedGrams: number;
  /** The true concentration, unrounded — the readout tells the truth. */
  concentrationPercent: number;
  /** What may be WRITTEN to settings: 2 dp, clamped to calculateDilution's range. */
  writeBackPercent: number;
  /** True when the clamp moved the written value away from the true one. */
  clamped: boolean;
};

/**
 * The book's Gradual Dilution (LS:1531) turned into figures: the maker records the water
 * they poured, and the concentration is DERIVED rather than targeted.
 *
 * Rounded to 2 dp, not ratio mode's 1 dp: measured against calculateDilution, 1 dp leaves
 * the recovered mass up to ~8 g from what was actually poured and 0 dp up to ~47 g, which
 * is a visible discrepancy and a real shift in a preservative dose. 2 dp keeps it under a
 * gram for no cost.
 *
 * The clamp mirrors ratio's: what is WRITTEN is bounded to [1, 99] because calculateDilution
 * rejects the endpoints and a rejected value nulls `dilution`, vanishing the very panel the
 * maker would need to correct it. `concentrationPercent` stays unclamped so the readout
 * never lies about what was recorded.
 */
export function gradualDilutionFrom(
  input: GradualDilutionInput,
): GradualDilutionResult | null {
  const { pasteGrams, anhydrousGrams, waterAddedGrams } = input;
  if (!Number.isFinite(pasteGrams) || pasteGrams <= 0) return null;
  if (!Number.isFinite(anhydrousGrams) || anhydrousGrams <= 0) return null;
  if (!Number.isFinite(waterAddedGrams) || waterAddedGrams < 0) return null;
  const finishedGrams = pasteGrams + waterAddedGrams;
  const concentrationPercent = (anhydrousGrams / finishedGrams) * 100;
  const rounded = Math.round(concentrationPercent * 100) / 100;
  const writeBackPercent = Math.min(99, Math.max(1, rounded));
  return {
    finishedGrams,
    concentrationPercent,
    writeBackPercent,
    clamped: writeBackPercent !== rounded,
  };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -w @soap-calc/core -- src/dilution.test.ts` → PASS.

- [ ] **Step 5: Full suite**

Run: `npm test` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/dilution.ts packages/core/src/dilution.test.ts
git commit -m "feat(core): the water you poured, turned into a concentration"
```

---

### Task 2: The recorded water becomes recipe state

**Files:**
- Modify: `packages/web/src/lib/recipe.ts` (type, `DEFAULT_SETTINGS`, `normalizeSettings`)
- Modify: `packages/web/src/lib/recipe.test.ts`, `packages/web/src/lib/recipeFile.test.ts`

**Interfaces:** Produces `RecipeSettings.gradualWaterGrams: string`. Tasks 3, 5, 7 read it.

- [ ] **Step 1: Failing tests**

```ts
describe('gradual dilution water', () => {
  it('defaults to blank — no gradual record on a fresh or legacy recipe', () => {
    expect(normalizeSettings({}).gradualWaterGrams).toBe('');
  });

  it('keeps a recorded amount verbatim, including one that lands off-target', () => {
    expect(normalizeSettings({ gradualWaterGrams: '2000' }).gradualWaterGrams).toBe('2000');
  });

  it('coerces junk to the default rather than throwing', () => {
    const s = normalizeSettings({ gradualWaterGrams: 12 } as unknown as Partial<RecipeSettings>);
    expect(s.gradualWaterGrams).toBe('12'); // settingString coerces a finite number
  });
});
```

And in `recipeFile.test.ts`, inside the existing `describe('recipeFile', …)` — note the fixture needs `lyeType: 'koh'`, since `parseRecipeFile` refuses an `ls` file carrying NaOH:

```ts
  it('round-trips the recorded gradual water', () => {
    const settings: RecipeSettings = {
      ...DEFAULT_SETTINGS,
      lyeType: 'koh' as const,
      gradualWaterGrams: '2000',
    };
    const payload = serializeRecipeFile('LS gradual', createStarterLines(), settings, [], 'ls');
    const parsed = parseRecipeFile(JSON.stringify(payload));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.settings.gradualWaterGrams).toBe('2000');
  });
```

- [ ] **Step 2: Run to verify they fail** — `gradualWaterGrams` does not exist on `RecipeSettings`.

- [ ] **Step 3: Implement**

Add to `RecipeSettings` after the preservative fields:

```ts
  /** Water actually poured in, in grams, recorded by a maker diluting gradually (LS:1531
   * — "record how much water you started with and how much additional water you added").
   * Recipe state, not a bench figure: it must survive a reload because it is always on
   * screen, and it is the basis of a preservative dose that is itself recipe state.
   * Blank means no gradual record — the default, and what every legacy recipe means. */
  gradualWaterGrams: string;
```

`DEFAULT_SETTINGS`: `gradualWaterGrams: ''`.
`normalizeSettings`: `gradualWaterGrams: settingString(partial?.gradualWaterGrams, d.gradualWaterGrams),`.

`recipeFile.ts` needs **no** code change — both paths already funnel settings through `normalizeSettings`.

- [ ] **Step 4-5: Tests pass, full suite green.**

- [ ] **Step 6: Commit** — `feat(ls): the recorded dilution water is part of the recipe`

---

### Task 3: Gradual mode in the panel — whole batch

**Files:**
- Modify: `packages/web/src/components/DilutionPanel.tsx`
- Modify: `packages/web/src/App.tsx` (pass the new value/handler)
- Modify: `packages/web/src/components/DilutionPanel.test.tsx`

**Interfaces:** Consumes `gradualDilutionFrom` (Task 1) and `settings.gradualWaterGrams` (Task 2).

- [ ] **Step 1: Failing tests** covering: the third radio exists and is selectable; entering water renders the three readouts (`Water added`, `Finished so far`, `Lands at N% soap`); **"Finished so far" equals paste + water exactly**, not `dilution.solutionGrams`; blank water renders no readouts and writes nothing; an extreme record shows the true concentration while reporting that the written value was capped.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement.** Extend the `DilutionMode` union with `'gradual'`
(`DilutionPanel.tsx:27`) — **and `App.tsx:137` with it**, which does *not* use that type:
it declares `useState<'concentration' | 'ratio'>('concentration')` with the union written
out inline. Widen it to `useState<DilutionMode>` and import the type, or App can never hold
`'gradual'` and `onDilutionModeChange={setDilutionMode}` stops typechecking. Add the third radio to the existing `dilution-mode-toggle` radiogroup (`DilutionPanel.tsx:558-578`), matching the two present exactly:

```tsx
          <label className="field field--inline">
            <input
              type="radio"
              name="dilutionMode"
              checked={dilutionMode === 'gradual'}
              onChange={() => onDilutionModeChange?.('gradual')}
            />
            <span>Gradual — record what you added</span>
          </label>
```

Add a `dilutionMode === 'gradual'` branch beside the existing ratio branch, with one numeric field (`Water added so far (g)`, `min={0}`) that calls `setGradualTouched(true)` then `onGradualWaterChange?.(...)`, mirroring the ratio field at `:580-590`.

- [ ] **Step 4: THE RE-ENTRY GUARD.** `DilutionPanel.tsx:176-179` resets `ratioTouched` on every `dilutionMode` change. Its comment records the bug: without it, leaving a derived mode to type an exact target and returning *without touching the field* re-fired the write-back and silently reverted the typed value, "with no visual difference and no undo". Add `gradualTouched` to that same effect. **Write a test that fails without it**: enter gradual water, switch to Target concentration, type a different %, switch back to gradual, and assert the typed % survives.

- [ ] **Step 5: The write-back**, mirroring `:329-332`. `gradual` is the memoised
`gradualDilutionFrom({ pasteGrams, anhydrousGrams: dilution.anhydrousGrams, waterAddedGrams })`
result, where `pasteGrams` is Task 4's chosen basis:

```tsx
  useEffect(() => {
    if (gradualTouched && dilutionMode === 'gradual' && gradual !== null) {
      onSoapConcentrationChange(String(gradual.writeBackPercent));
    }
  }, [gradualTouched, dilutionMode, gradual]);
```

Render the clamp notice when `gradual.clamped`, in the same shape as `ratioWriteBackClamped`'s.

**Why this cannot loop, and a test to keep it that way.** Gradual writes a concentration
that is derived from the paste — so if the paste moved when the concentration did, the
write-back would chase itself. Verified that it does not: `calculateDilution` takes
`anhydrousGrams` as an input and returns it untouched (`dilution.ts:48`, `:77`), and
`wholeBatchPasteGrams` is `anhydrous + cookWater + splitLiquidSolids`
(`useRecipeViewModel.ts:442-446`) whose solids term derives from the liquid rows and their
water fractions (`:279-289`), not from the concentration. **Add a regression test**: record
water, let the write-back settle, and assert the displayed paste is unchanged — a future
edit that makes `wholeBatchPasteGrams` concentration-dependent would otherwise introduce an
oscillation that no existing test would catch.

**`targetExceedsPaste` interaction.** From an unclamped gradual record the flag is
unreachable: `totalWater = solution − anhydrous = cookWater + solids + water`, which is
`≥ cookWater`, so `totalWaterGrams < cookWaterGrams` (`dilution.ts:57`) cannot hold. Under
the **clamp** it becomes reachable again, and the panel carries substantial over-dilution
messaging keyed on that flag. Assert the unreachability in the normal case, and check the
clamped case renders something coherent rather than a contradiction.

- [ ] **Step 6-7: Full suite green, commit** — `feat(ls): gradual dilution — the app holds the number you poured`

---

### Task 4: Which paste — the measured pot, or the computed one

**Files:** `DilutionPanel.tsx`, its test.

The spec's finding: `wholeBatchPasteGrams` is `anhydrous + cookWater + splitLiquidSolids` and is **not** corrected by a measured reading. Gradual must choose.

- [ ] **Step 1: Failing tests.** With a valid `measuredPasteGrams`, "Finished so far" uses the measurement and the readout names it. With no reading, or one that `measuredPasteRejectionFor` rejects, it falls back to `wholeBatchPasteGrams` and names *that*.

- [ ] **Step 2-3:** Implement the selection, reusing `measuredPasteRejectionFor` from `lib/measuredPaste` so this panel and the rest of the app cannot disagree about whether a reading is usable. The readout names its basis — the same discipline as `basisScope`'s "(whole batch)" / "(custom amount)".

- [ ] **Step 4-5: Full suite, commit** — `feat(ls): gradual measures the pot you weighed, when you weighed it`

---

### Task 5: Gradual in Custom amount scope — report, never write back

**Files:** `DilutionPanel.tsx` / `PortionDilutionResults.tsx`, `App.tsx` (two session-local states), tests.

- [ ] **Step 1: Failing tests.** In Custom amount + gradual: the two inputs render (*Paste weighed out (g)*, *Water added so far (g)*); the portion's finished mass and its own concentration render, each naming that they are the portion's; the preservative dose follows the portion's finished mass. **The guard test that matters: `onSoapConcentrationChange` is NEVER called in portion gradual** — assert on the spy, not on a rendered figure.

- [ ] **Step 2-3: Implement — through core's existing helper, NOT a fresh formula.**

An earlier draft of this plan restated the share arithmetic inline as
`portionPaste × (anhydrousGrams / wholeBatchPasteGrams)`. **Do not do that.**
`lsPartialDilution` (`packages/core/src/ls-yield.ts:65`) already owns this derivation —
its own doc states the rule, *"the paste is homogeneous, so the pot's own anhydrous soap is
a proportional share of the measurement (measured × anhydrousGrams / predictedPasteGrams)"* —
and it deliberately distinguishes `predictedPasteGrams` from `wholeBatchPasteGrams`, a
distinction the inline formula above silently collapsed by picking one of them. The same
file warns in terms: *"do not re-derive a 'predicted paste' from
totalWaterGrams/dilutionWaterGrams elsewhere; it will silently reproduce this trap."*

So: derive the portion's finished mass as `portionPaste + portionWater` (that part is just
addition), and take the portion's **anhydrous share from `lsPartialDilution`'s existing
result**, extending that function if it does not expose what is needed rather than
duplicating its ratio in the panel. If extending core proves larger than expected, stop and
report — a second portion-share derivation is the outcome this step exists to prevent.

The two inputs are **session-local in `App`**, consistent with `portionTargetMl` and `measuredPasteGrams` — bench figures that must not dirty a saved recipe. Only the whole-batch record is recipe state.

- [ ] **Step 4-5: Full suite, commit** — `feat(ls): a jar diluted thinner has not redefined the recipe`

---

### Task 6: The preservative nests inside Dilution

**Files:** `DilutionPanel.tsx` (one new prop), `App.tsx`, tests.

- [ ] **Step 1: Failing test** — the preservative disclosure renders *inside* the Dilution panel's DOM subtree, after the dilution figures.

- [ ] **Step 2-3: Implement via a single node slot**, not by threading props. `DilutionPanel` gains **one** prop:

```tsx
  /** Rendered after the dilution figures. App supplies the Preservative snippet here so
   * the dose sits with the mass it is a percentage of — structurally, not by convention.
   * A node rather than the snippet's own six props: this panel already takes 20 and has
   * no reason to learn about preservatives. */
  preservativeSlot?: ReactNode;
```

`App` renders `<PreservativeSnippet …/>` exactly as it does today and passes it as that prop; the standalone sibling render is removed. Move the placement comment from `App.tsx:562` with it, rewritten to say the adjacency is now structural.

- [ ] **Step 4-5: Full suite, commit** — `feat(ls): the preservative sits inside the panel it doses against`

---

### Task 7: The batch sheet records what was poured

**Files:** `BatchSheet.tsx`, `BatchSheet.test.tsx`.

- [ ] **Step 1: Failing tests.** With `gradualWaterGrams` recorded, the Dilution section prints a line naming the water added and the finished mass it produced. Absent otherwise. The existing `lsSheetData` fixture gains a `gradualWaterGrams` override, the way it gained `preservative`.

- [ ] **Step 2-4: Implement, full suite, commit** — `feat(ls): the sheet says what you poured, not what was predicted`

---

### Task 8: The browser guard

**Files:** `packages/web/e2e/ls-gradual-dilution.spec.ts` (new).

- [ ] **Step 1:** A spec that switches to Liquid soap, enters oils, selects Gradual, records water, and asserts: the three readouts appear; "Finished so far" equals paste + water; and **the preservative dose follows the recorded water** rather than the previous target's predicted mass.

- [ ] **Step 2:** Run `npm run test:e2e -w @soap-calc/web -- e2e/ls-gradual-dilution.spec.ts`. If Playwright cannot execute, report that honestly — do not weaken assertions to obtain a pass.

- [ ] **Step 3: Commit** — `test(ls): the browser guard follows the water you recorded`

---

## Definition of done

- `npm test` exits 0 — core, oils-data and web all up by the new cases, nothing removed.
- Both Playwright specs pass.
- Manual: record water in gradual mode, reload the page, confirm the water and the dose are still there.
- No test deleted or weakened; the portion no-write-back guard and the mode re-entry guard both exist and both fail when their protection is removed.
