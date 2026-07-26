# HP Additive Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the HP additive path: per-process dose overrides (sodium lactate, sugar), remove the lye-blind free-fatty-acid entries, add the finished-soap accelerant, and make the sugar ceiling process-aware.

**Architecture:** A `processOverrides` map on `AdditiveCatalogEntry` resolved by a pure `effectiveCatalogEntry(entry, process)`; AdditivesPanel resolves at its two consumer spots. Catalog data edits ride the same file. The `sugar_total_high` threshold reads the existing `input.process` discriminator.

**Tech Stack:** TypeScript, vitest, @testing-library/react. Monorepo: `packages/core` (pure), `packages/web` (React UI).

**Spec:** `docs/superpowers/specs/2026-07-26-hp-additive-audit-design.md`

## Global Constraints

- Anonymity rule: numeric constants only; all UI copy original; nothing may identify a third-party source.
- LS inherits base values for sodium lactate/sugar — no invented LS numbers.
- `LATHER_SUPPORT_PACK` must not change.
- Run web tests from `packages/web`, core tests from `packages/core` (`npx vitest run <file>`); typecheck is `npx tsc --noEmit` in each package (vitest alone does not typecheck).
- Every commit message ends with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Core — `processOverrides` schema + `effectiveCatalogEntry` + the two overrides

**Files:**
- Modify: `packages/core/src/additives.ts`
- Test: `packages/core/src/additives.test.ts`

**Interfaces:**
- Produces: `type AdditiveProcessOverride = { typicalLow?: number; typicalHigh?: number; defaultStage?: AdditiveStage }`; `AdditiveCatalogEntry.processOverrides?: Partial<Record<AdditiveProcess, AdditiveProcessOverride>>`; `export function effectiveCatalogEntry(entry: AdditiveCatalogEntry, process: AdditiveProcess): AdditiveCatalogEntry`. Task 4 imports `effectiveCatalogEntry` from `@soap-calc/core`.

- [ ] **Step 1: Write the failing tests** — append to `packages/core/src/additives.test.ts` (file already imports `ADDITIVE_CATALOG`, `catalogEntryById`, `catalogEntriesForProcess`; add `effectiveCatalogEntry` to the import):

```ts
describe('per-process catalog overrides (HP audit 2026-07-26)', () => {
  it('sodium lactate: CP/LS keep 0.5–2% in the lye water; HP overrides to 3–4% at trace', () => {
    const base = catalogEntryById('sodium-lactate')!;
    const cp = effectiveCatalogEntry(base, 'cp');
    expect([cp.typicalLow, cp.typicalHigh, cp.defaultStage]).toEqual([0.5, 2, 'lye']);
    // LS has no source coverage — it inherits the base values, never HP's.
    const ls = effectiveCatalogEntry(base, 'ls');
    expect([ls.typicalLow, ls.typicalHigh, ls.defaultStage]).toEqual([0.5, 2, 'lye']);
    const hp = effectiveCatalogEntry(base, 'hp');
    expect([hp.typicalLow, hp.typicalHigh, hp.defaultStage]).toEqual([3, 4, 'trace']);
    // Merge preserves everything the override does not name.
    expect(hp.id).toBe('sodium-lactate');
    expect(hp.name).toBe('Sodium lactate');
  });

  it('sugar: HP overrides the range to 1–5% but keeps the trace stage', () => {
    const base = catalogEntryById('sugar-sorbitol')!;
    const hp = effectiveCatalogEntry(base, 'hp');
    expect([hp.typicalLow, hp.typicalHigh]).toEqual([1, 5]);
    expect(hp.defaultStage).toBe('trace');
  });

  it('returns the entry unchanged for a process with no override', () => {
    const honey = catalogEntryById('honey')!;
    expect(effectiveCatalogEntry(honey, 'hp')).toEqual(honey);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd packages/core && npx vitest run src/additives.test.ts`. Expected: module-load error (`effectiveCatalogEntry` is not an export). Pre-existing tests do not run on this pass; that import error IS the expected failure.

- [ ] **Step 3: Implement** — in `packages/core/src/additives.ts`:

Add after the `AdditiveStage`/`AdditiveProcess` types:

```ts
/** Per-process correction to an entry's typical range and/or default stage. Base fields
 * hold the CP-audited values; an override carries only what differs for that process. */
export type AdditiveProcessOverride = {
  typicalLow?: number;
  typicalHigh?: number;
  defaultStage?: AdditiveStage;
};
```

Extend `AdditiveCatalogEntry`:

```ts
  /** Per-process corrections (see AdditiveProcessOverride). Resolve with
   * effectiveCatalogEntry — never read typicalLow/High/defaultStage directly when a
   * process is in hand. */
  processOverrides?: Partial<Record<AdditiveProcess, AdditiveProcessOverride>>;
```

On the `sodium-lactate` entry (keep its existing comment, base values unchanged):

```ts
    processOverrides: {
      // HP doses it harder and later: into the batter after a very thick trace (before the
      // expansion phase), where it keeps the cook fluid and hardens the finished bar.
      hp: { typicalLow: 3, typicalHigh: 4, defaultStage: 'trace' },
    },
```

On the `sugar-sorbitol` entry:

```ts
    processOverrides: {
      // An HP cook tolerates (and typically uses) more sugar than a CP mold; stage unchanged.
      hp: { typicalLow: 1, typicalHigh: 5 },
    },
```

Add next to `catalogEntryById`:

```ts
/** The entry as it applies under `process`: override fields win, base fields fill the
 * rest. Returns the entry object unchanged when the process has no override. */
export function effectiveCatalogEntry(
  entry: AdditiveCatalogEntry,
  process: AdditiveProcess,
): AdditiveCatalogEntry {
  const override = entry.processOverrides?.[process];
  return override ? { ...entry, ...override } : entry;
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/additives.test.ts`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/additives.ts packages/core/src/additives.test.ts
git commit -m "feat(core): per-process additive overrides; HP sodium-lactate 3-4% at trace, sugar 1-5%"
```

---

### Task 2: Core — remove the free-fatty-acid entries; add `finished-soap`

**Files:**
- Modify: `packages/core/src/additives.ts` (the `stearic` and `lauric` entries; new entry in their place)
- Test: `packages/core/src/additives.test.ts`

**Interfaces:**
- Produces: catalog without ids `stearic`/`lauric`; new entry id `finished-soap` (HP-only). Task 4's tests rely on `catalogEntryById('stearic')` being `undefined`.

- [ ] **Step 1: Write the failing tests** — append to `packages/core/src/additives.test.ts`:

```ts
describe('free fatty acids are oils, not additives (HP audit 2026-07-26)', () => {
  it('carries no stearic/lauric additive entries — they saponify and belong in the oils list', () => {
    expect(catalogEntryById('stearic')).toBeUndefined();
    expect(catalogEntryById('lauric')).toBeUndefined();
  });

  it('offers finished soap as the lye-neutral HP trace accelerant at 0.05–1% into the oils', () => {
    const soap = catalogEntryById('finished-soap');
    expect(soap?.name).toBe('Finished soap (grated or liquid)');
    expect([soap?.typicalLow, soap?.typicalHigh]).toEqual([0.05, 1]);
    expect(soap?.defaultStage).toBe('oils');
    expect(soap?.processes).toEqual(['hp']);
    expect(catalogEntriesForProcess('hp').some((e) => e.id === 'finished-soap')).toBe(true);
    expect(catalogEntriesForProcess('cp').some((e) => e.id === 'finished-soap')).toBe(false);
    expect(catalogEntriesForProcess('ls').some((e) => e.id === 'finished-soap')).toBe(false);
  });
});
```

Existing tests that pin the `stearic`/`lauric` entries (search `additives.test.ts` for `'stearic'` / `'lauric'` — e.g. the HP-picker scoping tests from the fluid-HP set) must be UPDATED in this same step: drop the removed ids from their expectations rather than deleting whole tests. `AdditivesPanel.test.tsx` also references them (Task 4 handles that file — do not touch it here).

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/additives.test.ts`. Expected: the two new tests FAIL (`stearic` still defined / `finished-soap` undefined); updated expectations for old tests still fail against the unmodified catalog. All failures are in the catalog data, none elsewhere.

- [ ] **Step 3: Implement** — in `packages/core/src/additives.ts`, replace the two FFA entries (their comments already say "as oils" — the classification was wrong, not the knowledge) with:

```ts
  {
    // Free fatty acids (stearic, lauric, myristic) are deliberately NOT in this catalog:
    // they saponify, so dosing them outside the lye math builds hidden superfat (5-8% of
    // oils is a typical fluid-HP stearic dose — that much unsaponified acid undercuts the
    // hardening it was added for). They live in the oils database (stearic-acid,
    // lauric-acid, myristic-acid) with SAP values. Legacy saved lines with catalogId
    // 'stearic'/'lauric' load as custom rows (normalizeAdditiveLine clears unknown ids —
    // same path as the removed 'jojoba' entry).
    //
    // Finished soap — the lye-neutral HP trace accelerant / emulsion stabilizer: grated
    // bar or liquid soap melted into the hot oils. Already saponified, so unlike the free
    // fatty acids it genuinely takes no lye.
    id: 'finished-soap',
    name: 'Finished soap (grated or liquid)',
    typicalLow: 0.05,
    typicalHigh: 1,
    defaultStage: 'oils',
    processes: ['hp'],
  },
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/additives.test.ts`, then the whole package: `npx vitest run`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/additives.ts packages/core/src/additives.test.ts
git commit -m "fix(core): free fatty acids leave the additive catalog; finished-soap accelerant joins it"
```

---

### Task 3: Core — process-aware sugar ceiling

**Files:**
- Modify: `packages/core/src/insights.ts` (the `sugar_total_high` block and its comment; the `sugarTotalPercent` field doc)
- Test: `packages/core/src/insights.test.ts`

**Interfaces:**
- Consumes: existing `FormulationAnalysisInput.process?: 'cp' | 'hp' | 'ls'` and `sugarTotalPercent?: number`.
- Produces: `sugar_total_high` fires above 5 under `process === 'hp'`, above 4 otherwise; HP message names only sugar/sorbitol/honey (yogurt is excluded from the HP sum upstream).

- [ ] **Step 1: Write the failing tests** — append to `packages/core/src/insights.test.ts` (follow the file's existing `analyzeFormulation` fixture pattern for a minimal input; reuse whatever base-input helper the sugar tests already use):

```ts
describe('sugar_total_high is process-aware (HP audit 2026-07-26)', () => {
  it('4.5% total sugar warns under CP and LS but not under HP', () => {
    for (const [process, fires] of [['cp', true], ['ls', true], ['hp', false]] as const) {
      const { insights } = analyzeFormulation({ ...BASE_INPUT, process, sugarTotalPercent: 4.5 });
      expect(insights.some((i) => i.code === 'sugar_total_high')).toBe(fires);
    }
  });

  it('5.5% warns under HP too, and the HP copy does not name yogurt (excluded from the HP sum)', () => {
    const { insights } = analyzeFormulation({ ...BASE_INPUT, process: 'hp', sugarTotalPercent: 5.5 });
    const hit = insights.find((i) => i.code === 'sugar_total_high');
    expect(hit).toBeDefined();
    expect(hit!.message).toContain('~5%');
    expect(hit!.message.toLowerCase()).not.toContain('yogurt');
  });
});
```

(`BASE_INPUT` = the file's existing minimal `FormulationAnalysisInput` fixture; if the file builds inputs inline, inline the same minimal shape instead.)

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/insights.test.ts`. Expected: the HP cases fail (fires at 4.5 under HP; message says "~4%" and names yogurt).

- [ ] **Step 3: Implement** — replace the `sugar_total_high` block and its comment:

```ts
  // Sugar-family additives all accelerate trace and heat retention similarly; a single
  // message on the combined total, not per-additive, since it's the total dose that
  // tunnels/overheats the batch. The MECHANISM (sugar mass relative to oil mass) is
  // process-independent, but the TOLERANCE is not: an insulated CP mold traps the heat
  // (ceiling 4), while an HP cook typically runs sugars up to ~5 in an open, watched pot
  // (ceiling 5). Under HP the sum upstream already excludes yogurt (hp_yogurt_water covers
  // it), so the HP copy names only the counted sources. See sugarTotalPercent's doc above
  // for how a solution-dosed LS additive still resolves to its true %-of-oil here.
  const sugarCeiling = input.process === 'hp' ? 5 : 4;
  if (input.sugarTotalPercent !== undefined && input.sugarTotalPercent > sugarCeiling) {
    insights.push({
      level: 'warning',
      code: 'sugar_total_high',
      message:
        input.process === 'hp'
          ? 'Combined sugar-family additives (sugar/sorbitol, honey) exceed ~5% of oil weight — the cook can scorch or volcano. Consider reducing the total dose.'
          : 'Combined sugar-family additives (sugar/sorbitol, honey, yogurt) exceed ~4% of oil weight — the batch can tunnel or overheat, especially when insulated. Consider reducing the total dose.',
    });
  }
```

Also update the `sugarTotalPercent` field doc (the lines saying the 4% ceiling is "intentionally applied to every process"): the ceiling is now per-process (4 CP/LS, 5 HP); keep the sentence about upstream basis resolution.

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/insights.test.ts`, then `npx vitest run`. Expected: all pass (if an existing test pinned the old cross-process 4% under HP, update it to the new contract — that change is this task's point, not collateral).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/insights.ts packages/core/src/insights.test.ts
git commit -m "fix(core): sugar ceiling is process-aware — warn >5% under HP, >4% elsewhere"
```

---

### Task 4: Web — panel resolves per-process; HP fatty-acid hint; legacy-line pin; comment sync

**Files:**
- Modify: `packages/web/src/components/AdditivesPanel.tsx`
- Modify: `packages/web/src/hooks/useFormulationInsights.ts` (doc comment only)
- Test: `packages/web/src/components/AdditivesPanel.test.tsx`, `packages/web/src/lib/recipe.test.ts`

**Interfaces:**
- Consumes: `effectiveCatalogEntry` from `@soap-calc/core` (Task 1); catalog without `stearic`/`lauric` (Task 2).

- [ ] **Step 1: Write the failing tests** — in `packages/web/src/components/AdditivesPanel.test.tsx` (follow the file's existing render/onChange-capture patterns; update any test that still selects the removed `stearic`/`lauric` entries to use `finished-soap` where it needs an HP-scoped id):

```ts
describe('per-process dose resolution (HP audit)', () => {
  it('shows the HP range and stage for sodium lactate under HP, the base under CP', () => {
    const line = makeLine({ catalogId: 'sodium-lactate', name: 'Sodium lactate', amount: '1' });
    const { unmount } = render(
      <AdditivesPanel additives={[line]} computed={[makeComputed(line)]} weightUnit="g" process="hp" onChange={() => {}} />,
    );
    expect(screen.getByText(/Typical 3–4% of oil weight/)).toBeTruthy();
    unmount();
    render(
      <AdditivesPanel additives={[line]} computed={[makeComputed(line)]} weightUnit="g" process="cp" onChange={() => {}} />,
    );
    expect(screen.getByText(/Typical 0.5–2% of oil weight/)).toBeTruthy();
  });

  it('picking sodium lactate under HP seeds the trace stage; under CP the lye stage', () => {
    for (const [process, stage] of [['hp', 'trace'], ['cp', 'lye']] as const) {
      let latest: AdditiveLine[] = [];
      const line = makeLine({});
      const { unmount } = render(
        <AdditivesPanel additives={[line]} computed={[]} weightUnit="g" process={process} onChange={(a) => { latest = a; }} />,
      );
      fireEvent.change(screen.getByLabelText('Additive type'), { target: { value: 'sodium-lactate' } });
      expect(latest[0].addAt).toBe(stage);
      unmount();
    }
  });
});

describe('free-fatty-acid guidance (HP audit)', () => {
  it('tells HP users to dose stearic/lauric/myristic as oils; silent under CP and LS', () => {
    const { unmount } = render(
      <AdditivesPanel additives={[]} computed={[]} weightUnit="g" process="hp" onChange={() => {}} />,
    );
    expect(screen.getByText(/stearic, lauric, myristic/i).textContent).toMatch(/as oils|oils list/i);
    unmount();
    for (const process of ['cp', 'ls'] as const) {
      const r = render(
        <AdditivesPanel additives={[]} computed={[]} weightUnit="g" process={process} onChange={() => {}} />,
      );
      expect(screen.queryByText(/stearic, lauric, myristic/i)).toBeNull();
      r.unmount();
    }
  });
});
```

In `packages/web/src/lib/recipe.test.ts` (next to the existing normalizeAdditiveLine tests):

```ts
it('a saved stearic additive line loads as a custom row, name preserved (entry removed)', () => {
  const line = normalizeAdditiveLine({
    key: 'k1', catalogId: 'stearic', name: 'Stearic acid', amount: '6', basis: 'oil', unit: 'percent', addAt: 'oils',
  });
  expect(line.catalogId).toBe('');
  expect(line.name).toBe('Stearic acid');
  expect(line.amount).toBe('6');
});
```

(Adjust `fireEvent`/`getByLabelText` usage to whatever the file's existing pick-a-catalog-entry tests actually use — mirror them exactly. If the per-row label is name-scoped, use the row-scoped query the neighboring tests use.)

- [ ] **Step 2: Run to verify failure** — `cd packages/web && npx vitest run src/components/AdditivesPanel.test.tsx src/lib/recipe.test.ts`. Expected: HP range hint shows 0.5–2 (fails), pick under HP seeds 'lye' (fails), FFA hint absent everywhere (fails), stearic line normalizes with catalogId 'stearic'… actually FAILS only after Task 2's core rebuild — this file consumes `@soap-calc/core` via the workspace build. If the web tests resolve core from `packages/core/src` directly (vitest alias), Task 2's changes are already visible; if they resolve `dist`, run `npm run build -w @soap-calc/core` first. Check `packages/web/vite.config.ts`/`vitest` aliases and do whichever applies.

- [ ] **Step 3: Implement** — in `AdditivesPanel.tsx`:

1. Import: add `effectiveCatalogEntry` to the `@soap-calc/core` import.
2. `selectCatalog` (the pick handler): resolve before seeding —

```ts
  function selectCatalog(key: string, catalogId: string) {
    const base = catalogEntryById(catalogId);
    if (!base) {
      updateLine(key, { catalogId: '', name: '' });
      return;
    }
    const entry = effectiveCatalogEntry(base, process);
    // …existing updateLine call unchanged (it now reads the resolved entry)…
```

3. The typical-range hint: where the row currently computes `const entry = line.catalogId ? catalogEntryById(line.catalogId) : undefined;`, resolve it: `const entry = line.catalogId ? resolve(catalogEntryById(line.catalogId)) : undefined;` with a small helper in the component body:

```ts
  const resolve = (e: AdditiveCatalogEntry | undefined) =>
    e ? effectiveCatalogEntry(e, process) : undefined;
```

(The hint and the hazards/doseUnit reads below it then all see resolved values; `catalogOptions`' mismatched-select guard keeps using the raw entry — id/name are never overridden, so either works, but keep the guard on the raw entry to avoid churn.)

4. HP-only guidance line — render alongside the panel's existing intro hint (same placement pattern as the citric empty-state sentence, but NOT inside the empty-state branch; it applies whether or not rows exist):

```tsx
      {process === 'hp' && (
        <p className="results-hint">
          Free fatty acids (stearic, lauric, myristic) saponify — dose them as oils in the
          oils list, typically 5–8% of oils for a fluid cook.
        </p>
      )}
```

5. `useFormulationInsights.ts` doc comment: update the `sugarTotalPercentForInsights` doc's "4% ceiling … intentionally applied across every process" sentence to: the ceiling is process-aware in core (4 CP/LS, 5 HP); this helper only computes the oil-relative total.

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/components/AdditivesPanel.test.tsx src/lib/recipe.test.ts`, then all web tests `npx vitest run`, then `npx tsc --noEmit`. Expected: all pass, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/AdditivesPanel.tsx packages/web/src/hooks/useFormulationInsights.ts packages/web/src/components/AdditivesPanel.test.tsx packages/web/src/lib/recipe.test.ts
git commit -m "feat(web): additive panel resolves per-process doses; HP fatty-acids-as-oils hint"
```

---

### Task 5: Full verification + PR

**Files:** none new.

- [ ] **Step 1: Full suite** — from the repo root: `npm test`. Expected: core, oils-data, web all green.
- [ ] **Step 2: Build** — `npm run build:web` (or the root build script if named differently — check root `package.json`). Expected: clean.
- [ ] **Step 3: E2E sanity** — from `packages/web`: `npx playwright test e2e/exploratory.spec.ts -g "additives"`. Expected: pass (the additives suite exercises the picker; no stearic-specific e2e exists).
- [ ] **Step 4: Push + PR** — push the branch; open a PR titled `fix: HP additive audit — per-process doses, fatty acids leave the catalog, finished-soap accelerant`; body summarizes the four spec findings, the review amendment (sugar ceiling), invariants pinned, and verification results.

## Self-Review (completed)

- Spec coverage: schema+overrides (T1), removal+finished-soap (T2), sugar ceiling (T3), panel wiring+hint+comment sync+legacy pin (T4), verification (T5). All spec sections mapped.
- Placeholder scan: none.
- Type consistency: `effectiveCatalogEntry(entry, process)` used identically in T1/T4; `AdditiveProcessOverride` defined once; removed ids referenced only as absences after T2.
