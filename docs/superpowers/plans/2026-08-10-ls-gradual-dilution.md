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

- [ ] **Step 1: Write the failing tests**

Append to `packages/web/src/components/DilutionPanel.test.tsx`. It already has `RESULT`
(anhydrous 1,200 g, solution 4,000 g, totalWater 2,800 g, dilutionWater 2,400 g → **cook
water 400 g, paste 1,600 g**) and a `BASE` props object; reuse both. `vi` is already
imported.

```tsx
describe('gradual dilution — recording the water actually poured', () => {
  // paste 1,600 g (anhydrous 1,200 + cook 400). Pour 2,000 g → finished 3,600 g,
  // concentration 1200/3600 = 33.3333% → written at 2 dp as 33.33.
  const GRADUAL = {
    ...BASE,
    dilutionMode: 'gradual' as const,
    onDilutionModeChange: () => {},
    cookWaterGrams: 400,
    wholeBatchPasteGrams: 1600,
    onGradualWaterChange: () => {},
  };

  it('offers Gradual as a third mode beside the two precise ones', () => {
    render(<DilutionPanel {...BASE} dilutionMode="concentration" onDilutionModeChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /Gradual/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Target concentration' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Water : paste ratio' })).toBeTruthy();
  });

  it('shows the water, the finished mass and where it lands', () => {
    render(<DilutionPanel {...GRADUAL} gradualWaterGrams="2000" />);
    expect(screen.getByText(/Finished so far/)).toBeTruthy();
    expect(screen.getByText('3,600 g')).toBeTruthy();
    expect(screen.getByText(/33\.33% soap/)).toBeTruthy();
  });

  it('the finished figure is paste + water, NOT the recomputed solution', () => {
    // The whole point: 4,000 g is what the old target predicted; 3,600 g is what was
    // poured. Printing solutionGrams here would quietly show the prediction again.
    render(<DilutionPanel {...GRADUAL} gradualWaterGrams="2000" />);
    expect(screen.getByText('3,600 g')).toBeTruthy();
    expect(screen.queryByText(/Finished so far[\s\S]*4,000 g/)).toBeNull();
  });

  it('writes the derived concentration back at 2 dp once the field is touched', () => {
    const onSoapConcentrationChange = vi.fn();
    const { rerender } = render(
      <DilutionPanel {...GRADUAL} gradualWaterGrams="" onSoapConcentrationChange={onSoapConcentrationChange} />,
    );
    fireEvent.change(screen.getByLabelText(/Water added so far/), { target: { value: '2000' } });
    rerender(
      <DilutionPanel {...GRADUAL} gradualWaterGrams="2000" onSoapConcentrationChange={onSoapConcentrationChange} />,
    );
    expect(onSoapConcentrationChange).toHaveBeenCalledWith('33.33');
  });

  it('writes nothing at all until the maker has typed a water amount', () => {
    const onSoapConcentrationChange = vi.fn();
    render(<DilutionPanel {...GRADUAL} gradualWaterGrams="" onSoapConcentrationChange={onSoapConcentrationChange} />);
    expect(onSoapConcentrationChange).not.toHaveBeenCalled();
    expect(screen.queryByText(/Finished so far/)).toBeNull();
  });

  it('an extreme record keeps the readout honest while capping what is written', () => {
    const onSoapConcentrationChange = vi.fn();
    const { rerender } = render(
      <DilutionPanel {...GRADUAL} gradualWaterGrams="" onSoapConcentrationChange={onSoapConcentrationChange} />,
    );
    // Almost no water: true concentration 1200/1610 = 74.5%, still under the cap — use a
    // paste that pushes past it instead.
    fireEvent.change(screen.getByLabelText(/Water added so far/), { target: { value: '0' } });
    rerender(
      <DilutionPanel {...GRADUAL} wholeBatchPasteGrams={1210} gradualWaterGrams="0"
        onSoapConcentrationChange={onSoapConcentrationChange} />,
    );
    // 1200/1210 = 99.17% — the readout says so, the written value is capped at 99.
    expect(screen.getByText(/99\.17% soap/)).toBeTruthy();
    expect(onSoapConcentrationChange).toHaveBeenCalledWith('99');
    expect(screen.getByText(/capp?ed|clamped/i)).toBeTruthy();
  });

  it('does not loop: the paste it derives from is unmoved by the concentration it writes', () => {
    // If wholeBatchPasteGrams ever became concentration-dependent, gradual would chase its
    // own write-back. Nothing else in the suite would notice.
    const { rerender } = render(<DilutionPanel {...GRADUAL} gradualWaterGrams="2000" />);
    const before = screen.getByText('3,600 g');
    rerender(<DilutionPanel {...GRADUAL} gradualWaterGrams="2000"
      dilution={{ ...RESULT, solutionGrams: 3600, soapConcentrationPercent: 33.33 }} />);
    expect(before).toBeTruthy();
    expect(screen.getByText('3,600 g')).toBeTruthy();
  });

  it('never reports over-dilution from an honest record', () => {
    // totalWater = cook + solids + water >= cook, so targetExceedsPaste cannot hold.
    render(<DilutionPanel {...GRADUAL} gradualWaterGrams="2000" />);
    expect(screen.queryByText(/exceeds the paste|more water than the paste/i)).toBeNull();
  });
});

describe('the re-entry guard — a derived mode must not revert a typed target', () => {
  it('returning to gradual without touching the field leaves a typed concentration alone', () => {
    // The bug this guards, in ratio's own words at DilutionPanel.tsx:170-179: the
    // write-back fired on re-entry alone and reverted the typed value, "with no visual
    // difference and no undo".
    const onSoapConcentrationChange = vi.fn();
    const props = {
      ...BASE, cookWaterGrams: 400, wholeBatchPasteGrams: 1600,
      onDilutionModeChange: () => {}, onGradualWaterChange: () => {},
      gradualWaterGrams: '2000', onSoapConcentrationChange,
    };
    const { rerender } = render(<DilutionPanel {...props} dilutionMode="gradual" />);
    fireEvent.change(screen.getByLabelText(/Water added so far/), { target: { value: '2000' } });
    onSoapConcentrationChange.mockClear();
    // leave for concentration mode, type an exact target, come back WITHOUT retyping water
    rerender(<DilutionPanel {...props} dilutionMode="concentration" soapConcentrationPercent="40" />);
    rerender(<DilutionPanel {...props} dilutionMode="gradual" soapConcentrationPercent="40" />);
    expect(onSoapConcentrationChange).not.toHaveBeenCalled();
  });
});
```

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
  // DEPEND ON THE PRIMITIVE, NEVER ON `gradual`. `gradualDilutionFrom` returns a fresh
  // object every render, useEffect compares deps by reference, and the write-back reaches
  // setSettings, which always spreads a new settings object — so an object dependency here
  // re-fires the effect on every render it causes, forever, from the first keystroke.
  // Ratio's own effect above depends on numbers for exactly this reason; its comment names
  // the property being relied on ("React bails out of re-rendering on an unchanged state
  // value"), which only holds for primitives.
  const gradualWriteBack = gradual?.writeBackPercent ?? null;
  useEffect(() => {
    if (gradualTouched && dilutionMode === 'gradual' && gradualWriteBack !== null) {
      onSoapConcentrationChange(String(gradualWriteBack));
    }
  }, [gradualTouched, dilutionMode, gradualWriteBack]);
```

**No inert-mock test can catch that loop**, because every test in this file wires
`onSoapConcentrationChange` to a `vi.fn()` that never triggers a further render. The
regression test must close the feedback loop itself: wrap the panel in a harness whose
handler actually sets state and feeds the value back as a prop, then assert the call count
settles instead of growing.

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

- [ ] **Step 1: Write the failing tests**

```tsx
describe('gradual: which paste it counts from', () => {
  const G = {
    ...BASE, dilutionMode: 'gradual' as const, onDilutionModeChange: () => {},
    cookWaterGrams: 400, wholeBatchPasteGrams: 1600, onGradualWaterChange: () => {},
    gradualWaterGrams: '2000',
  };

  it('uses the pot the maker actually weighed, and says so', () => {
    // Weighed 1,500 g (the cook drove off more than the recipe predicted). Finished is
    // 1,500 + 2,000 = 3,500 g, not the computed 3,600 g.
    render(<DilutionPanel {...G} measuredPasteGrams="1500" />);
    expect(screen.getByText('3,500 g')).toBeTruthy();
    expect(screen.getByText(/measured/i)).toBeTruthy();
  });

  it('falls back to the computed paste when no reading was taken, and names that instead', () => {
    render(<DilutionPanel {...G} measuredPasteGrams="" />);
    expect(screen.getByText('3,600 g')).toBeTruthy();
    expect(screen.getByText(/computed|from the recipe/i)).toBeTruthy();
  });

  it('ignores a reading the shared gate rejects, rather than counting from an impossible pot', () => {
    // Below the anhydrous floor: physically impossible, and measuredPasteRejectionFor
    // already refuses it everywhere else in the app.
    render(<DilutionPanel {...G} measuredPasteGrams="900" />);
    expect(screen.getByText('3,600 g')).toBeTruthy();
  });
});
```

- [ ] **Step 2-3:** Implement the selection, reusing `measuredPasteRejectionFor` from `lib/measuredPaste` so this panel and the rest of the app cannot disagree about whether a reading is usable. The readout names its basis — the same discipline as `basisScope`'s "(whole batch)" / "(custom amount)".

- [ ] **Step 4-5: Full suite, commit** — `feat(ls): gradual measures the pot you weighed, when you weighed it`

---

### Task 5: Gradual in Custom amount scope — report, never write back

**Files:** `DilutionPanel.tsx` / `PortionDilutionResults.tsx`, `App.tsx` (two session-local states), tests.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('gradual in Custom amount scope', () => {
  const P = {
    ...BASE, dilutionMode: 'gradual' as const, onDilutionModeChange: () => {},
    dilutionScope: 'portion' as const, cookWaterGrams: 400, wholeBatchPasteGrams: 1600,
    onGradualWaterChange: () => {},
    onPortionPasteChange: () => {}, onPortionWaterChange: () => {},
  };

  it('asks for the paste weighed out, not a target volume', () => {
    render(<DilutionPanel {...P} portionPasteGrams="" portionWaterGrams="" />);
    expect(screen.getByLabelText(/Paste weighed out/)).toBeTruthy();
    expect(screen.getByLabelText(/Water added so far/)).toBeTruthy();
  });

  it("reports the jar's own figures, each named as the portion's", () => {
    // 400 g of paste is a quarter of the 1,600 g batch, so it carries 300 g anhydrous.
    // Add 600 g water → 1,000 g finished, 30% soap.
    render(<DilutionPanel {...P} portionPasteGrams="400" portionWaterGrams="600" />);
    expect(screen.getByText('1,000 g')).toBeTruthy();
    expect(screen.getByText(/30(\.0+)?% soap/)).toBeTruthy();
    expect(screen.getByText(/custom amount/i)).toBeTruthy();
  });

  // THE GUARD. A jar diluted thinner has not redefined the recipe. Asserted on the spy
  // rather than on a rendered figure, because the damage is the write, not the display.
  it('NEVER writes the jar\'s concentration back into the recipe', () => {
    const onSoapConcentrationChange = vi.fn();
    const { rerender } = render(
      <DilutionPanel {...P} portionPasteGrams="" portionWaterGrams=""
        onSoapConcentrationChange={onSoapConcentrationChange} />,
    );
    fireEvent.change(screen.getByLabelText(/Paste weighed out/), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText(/Water added so far/), { target: { value: '900' } });
    rerender(
      <DilutionPanel {...P} portionPasteGrams="400" portionWaterGrams="900"
        onSoapConcentrationChange={onSoapConcentrationChange} />,
    );
    expect(onSoapConcentrationChange).not.toHaveBeenCalled();
  });

  it('leaves the recipe target on screen unchanged beside the jar figure', () => {
    render(<DilutionPanel {...P} portionPasteGrams="400" portionWaterGrams="900"
      soapConcentrationPercent="30" />);
    // 400 + 900 = 1,300 g at 300/1300 = 23.1% — the jar. The recipe still says 30%.
    expect(screen.getByText(/23(\.\d+)?% soap/)).toBeTruthy();
    expect(screen.getByDisplayValue('30')).toBeTruthy();
  });
});
```

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

- [ ] **Step 1: Write the failing tests**

`lsSheetData` (`BatchSheet.test.tsx:425`) gains a `gradualWaterGrams` override on its
`preservative` settings-merge parameter — extend that same merge rather than adding a
second convention.

```tsx
test('records the water actually poured, and what it produced', () => {
  render(<BatchSheet data={lsSheetData({ preservative: { gradualWaterGrams: '2000' } })} />);
  const row = screen.getByText(/Water added/).closest('div')!;
  expect(row.textContent).toContain('2,000 g');
});

test('says nothing about gradual water when none was recorded', () => {
  render(<BatchSheet data={lsSheetData({})} />);
  expect(screen.queryByText(/Water added/)).toBeNull();
});

test('the recorded line does not contradict the computed dilution row', () => {
  // Both print. The sheet must not show one figure as if it were the other.
  render(<BatchSheet data={lsSheetData({ preservative: { gradualWaterGrams: '2000' } })} />);
  expect(screen.getByText('Dilution water to add')).toBeTruthy();
  expect(screen.getByText(/Water added/)).toBeTruthy();
});
```

- [ ] **Step 2-4: Implement, full suite, commit** — `feat(ls): the sheet says what you poured, not what was predicted`

---

### Task 8: The browser guard

**Files:** `packages/web/e2e/ls-gradual-dilution.spec.ts` (new).

- [ ] **Step 1: Write the spec**

Follow `e2e/ls-preservative.spec.ts`'s shape — same `freshLsRecipe` helper and `gramsOf`
reader. Note its documented gotchas: `getByLabel('Name')` needs `{ exact: true }` because
the toolbar has a "Recipe name" field, and two independently whole-gram-rounded readings
can differ by up to `0.5 + 2 × 0.5 = 1.5 g`.

```ts
test('the dose follows the water you recorded, not the target you left behind', async ({ page }) => {
  await freshLsRecipe(page);

  const snippet = page.locator('details.preservative');
  await snippet.locator('summary').click();
  const doseAtTarget = await gramsOf(snippet, 'Preservative to add');
  expect(doseAtTarget).toBeGreaterThan(0);

  // Switch to Gradual and record less water than the target assumed.
  await page.getByRole('radio', { name: /Gradual/ }).click();
  const water = page.getByLabel('Water added so far (g)', { exact: true });
  await water.fill('1000');
  await water.blur();

  // The panel states what is in the pot.
  await expect(page.getByText(/Finished so far/)).toBeVisible();

  // And the dose follows it DOWN — less soap in the bottle, less preservative.
  const doseAfter = await gramsOf(snippet, 'Preservative to add');
  expect(doseAfter).toBeLessThan(doseAtTarget);

  // The finished-product row the dose is a % of now equals what was recorded.
  const finished = await gramsOf(snippet, '≈ Finished product');
  expect(Math.abs(doseAfter - finished * 0.01)).toBeLessThanOrEqual(1.5);
});

test('the recorded water survives a reload', async ({ page }) => {
  await freshLsRecipe(page);
  await page.getByRole('radio', { name: /Gradual/ }).click();
  await page.getByLabel('Water added so far (g)', { exact: true }).fill('1000');
  await page.getByLabel('Water added so far (g)', { exact: true }).blur();
  await page.reload();
  await expect(page.getByLabel('Water added so far (g)', { exact: true })).toHaveValue('1000');
});
```

- [ ] **Step 2:** Run `npm run test:e2e -w @soap-calc/web -- e2e/ls-gradual-dilution.spec.ts`. If Playwright cannot execute, report that honestly — do not weaken assertions to obtain a pass.

- [ ] **Step 3: Commit** — `test(ls): the browser guard follows the water you recorded`

---

## Definition of done

- `npm test` exits 0 — core, oils-data and web all up by the new cases, nothing removed.
- Both Playwright specs pass.
- Manual: record water in gradual mode, reload the page, confirm the water and the dose are still there.
- No test deleted or weakened; the portion no-write-back guard and the mode re-entry guard both exist and both fail when their protection is removed.
