# Process Separation — PR A (follow-up fixes) + PR B (Slice 1: no-bridge) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two parked review fixes (dilution-hint dedup, batch-sheet caveats), then Slice 1 of the process-separation spec: no cross-process bridge — imports route by declared process, legacy inference is announced, invalid process refuses, and the coercion seam is renamed and narrowed to within-process normalization.

**Architecture:** Spec at `docs/superpowers/specs/2026-07-30-process-separation-design.md`. Slices 2–4 get their own plans after PR B lands (their details depend on PR B's landed shape). Two PRs, each branch off current `main`, each adversarially reviewed before merge.

**Tech Stack:** TypeScript, React, vitest (unit; `// @vitest-environment jsdom` + @testing-library/react for components), Playwright (e2e in `packages/web/e2e/`). Monorepo: `npm test` at root runs typecheck + all workspaces.

## Global Constraints

- Never cite book/brand names in UI copy or comments (de-branded sources only).
- Comments state constraints code can't show — never narrate the diff.
- New tests must FAIL when their gate/fix is reverted (mutation check before commit).
- All processes: `'cp' | 'hp' | 'ls'` (`ProcessId`). Weight strings via `formatWeight(grams, weightUnit)`.
- Run full verification before each PR: `npm test` (expect 3 suites green), `npm run build --workspace packages/web`, `cd packages/web && npx playwright test` (expect 81+ passing).

---

## PR A — follow-up fixes (branch: `fix/dilution-hint-dedup-sheet-caveats`)

### Task 1: DilutionPanel — kill the duplicated/vacuous unknown-liquid hint

**Files:**
- Modify: `packages/web/src/components/DilutionPanel.tsx:135` (the `altLiquidWaterGrams > 0 && unknownLiquidGrams > 0` branch)
- Test: `packages/web/src/components/DilutionPanel.test.tsx`

**Interfaces:**
- Consumes: existing props `dilution: DilutionResult`, `unknownLiquidGrams`, `altLiquidWaterGrams`, `overDilutionCertain` (all already wired from the view model).
- Produces: nothing new — render-logic fix only.

**Background (why):** When `targetExceedsPaste && !overDilutionCertain && unknownLiquidGrams > 0`, TWO hints render together: the "Can't tell whether N% is reachable — … Declare its % water" hint (line 118) AND the floor hint (line 135) — which repeats "has no declared water content … Declare its % water" verbatim and, because `dilutionWaterGrams` is clamped to 0 in exactly that case, degenerates to "0 g is the LEAST you will need". One added condition fixes both: the floor hint only makes sense when there IS a positive floor, i.e. when the target does NOT already exceed the paste.

- [ ] **Step 1: Write the failing test**

Append to `packages/web/src/components/DilutionPanel.test.tsx` (inside the existing `describe`-less test style; reuse the `dilution` fixture object pattern already in the file):

```tsx
test('unknown-liquid hints never repeat "declare its % water" on one screen', () => {
  // targetExceedsPaste + unknown + not-certain: the can't-tell hint covers the message,
  // and dilutionWaterGrams is 0 — so the floor hint would be vacuous AND a verbatim repeat.
  render(
    <DilutionPanel
      dilution={{
        anhydrousGrams: 1215, solutionGrams: 2431, totalWaterGrams: 1215,
        dilutionWaterGrams: 0, glycerinGrams: 100, soapConcentrationPercent: 50,
        targetExceedsPaste: true,
      }}
      soapConcentrationPercent="50"
      onSoapConcentrationChange={() => {}}
      weightUnit="g"
      bottleSizeMl="250"
      onBottleSizeMlChange={() => {}}
      altLiquidWaterGrams={900}
      unknownLiquidGrams={900}
      overDilutionCertain={false}
    />,
  );
  expect(screen.getAllByText(/declare its % water/i)).toHaveLength(1);
  expect(screen.queryByText(/0 g is the LEAST/i)).toBeNull();
});

test('the floor hint still renders when the floor is real', () => {
  render(
    <DilutionPanel
      dilution={{
        anhydrousGrams: 1218, solutionGrams: 4059, totalWaterGrams: 2841,
        dilutionWaterGrams: 2000, glycerinGrams: 107, soapConcentrationPercent: 30,
        targetExceedsPaste: false,
      }}
      soapConcentrationPercent="30"
      onSoapConcentrationChange={() => {}}
      weightUnit="g"
      bottleSizeMl="250"
      onBottleSizeMlChange={() => {}}
      altLiquidWaterGrams={300}
      unknownLiquidGrams={300}
      overDilutionCertain={false}
    />,
  );
  expect(screen.getByText(/is the LEAST you will need/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify the first test fails**

Run: `cd /Users/str/soap-calc && npx vitest run packages/web/src/components/DilutionPanel.test.tsx`
Expected: FAIL — `getAllByText(/declare its % water/i)` returns 2, and `/0 g is the LEAST/i` is found.

- [ ] **Step 3: Implement**

In `DilutionPanel.tsx`, change the floor-hint condition (line ~135):

```tsx
{altLiquidWaterGrams > 0 && unknownLiquidGrams > 0 && !dilution.targetExceedsPaste && (
```

Add above it (replacing nothing) this comment:

```tsx
{/* Floor hint only when a positive floor exists. When the target already exceeds the
    paste, the can't-tell / certain-alert branches above own the message — rendering
    this too repeated "declare its % water" verbatim and printed a vacuous
    "0 g is the LEAST you will need". */}
```

- [ ] **Step 4: Run tests to verify both pass**

Run: `npx vitest run packages/web/src/components/DilutionPanel.test.tsx`
Expected: PASS (all tests in file).

- [ ] **Step 5: Mutation check + commit**

Revert the condition mentally (or via `git stash` diff review): the first test must fail without the `!dilution.targetExceedsPaste` clause. Then:

```bash
git add packages/web/src/components/DilutionPanel.tsx packages/web/src/components/DilutionPanel.test.tsx
git commit -m "fix(web): dilution unknown-liquid hints no longer repeat or print a vacuous 0 g floor"
```

### Task 2: Batch sheet carries the unknown-liquid caveats

**Files:**
- Modify: `packages/web/src/lib/batchSheet.ts` (add two fields to `BatchSheetData`, after `dilution: DilutionResult | null;` at ~line 40)
- Modify: `packages/web/src/hooks/useRecipeViewModel.ts:703-733` (the `buildBatchSheetData({...})` object literal — add the two fields)
- Modify: `packages/web/src/components/BatchSheet.tsx:281-289` (dilution section)
- Test: `packages/web/src/components/BatchSheet.test.tsx`

**Interfaces:**
- Consumes: `vm.unknownLiquidGrams: number`, `vm.lyeWaterUnverifiable: boolean` (already computed and exported by the view model).
- Produces: `BatchSheetData.unknownLiquidGrams?: number`, `BatchSheetData.lyeWaterUnverifiable?: boolean` (optional — older callers/tests omit them and get no caveat, matching the `soapingTempF?` precedent in the same type).

**Background (why):** The on-screen Dilution panel gained lower-bound and can't-verify caveats in #142; the PRINTED sheet still shows the bare figure with no qualifier — the one surface a maker takes to the bench.

- [ ] **Step 1: Write the failing test**

There is NO shared fixture in `BatchSheet.test.tsx` — each test builds a full real
`buildBatchSheetData({...})` from `calculateRecipe(createStarterLines(), settings)` (see
the first test in the file, ~line 13). Write ONE local helper at the bottom of the file
and two tests:

```tsx
function lsSheetData(extra: { unknownLiquidGrams?: number; lyeWaterUnverifiable?: boolean }) {
  const lines = createStarterLines();
  const settings = { ...DEFAULT_SETTINGS, lyeType: 'koh' as const };
  const { result, displayTotals, linePercents } = calculateRecipe(lines, settings);
  if (!result || !displayTotals) throw new Error('expected a valid calculation');
  // Copy the remaining required fields of the buildBatchSheetData literal from the FIRST
  // test in this file verbatim (recipeName/batchNotes/weightUnit/lyeLabel/settings/
  // additives/splitLiquidRows/…), then set:
  //   process: 'ls',
  //   dilution: { anhydrousGrams: 1218, solutionGrams: 4059, totalWaterGrams: 2841,
  //     dilutionWaterGrams: 2000, glycerinGrams: 107, soapConcentrationPercent: 30,
  //     targetExceedsPaste: false },
  //   ...extra,
}

test('printed dilution carries the unknown-liquid caveat when water content is undeclared', () => {
  render(<BatchSheet data={lsSheetData({ unknownLiquidGrams: 300 })} weightUnit="g" />);
  expect(screen.getByText(/at least/i)).toBeTruthy();
  expect(screen.getByText(/no declared water content/i)).toBeTruthy();
});

test('no caveat rows when everything is declared', () => {
  render(<BatchSheet data={lsSheetData({})} weightUnit="g" />);
  expect(screen.queryByText(/no declared water content/i)).toBeNull();
});
```

(The helper body's field list comes from the file's own first test — it is the complete
required-field set for `buildBatchSheetData`, and copying it inside THIS file keeps the
test self-contained without inventing a second fixture convention.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/web/src/components/BatchSheet.test.tsx`
Expected: FAIL — TS error (unknown fields) or missing text.

- [ ] **Step 3: Implement — type, threading, render**

`packages/web/src/lib/batchSheet.ts`, after `dilution: DilutionResult | null;`:

```ts
  /** Grams of split liquid with undeclared water content. Non-zero makes the printed
   * dilution figure a lower bound, and the sheet must say so — the bench copy is the one
   * surface with no sibling panel to explain it. Optional: data built before the field
   * existed prints no caveat (same convention as soapingTempF). */
  unknownLiquidGrams?: number;
  /** The 1:1 lye-dissolution check could not run (an in-lye liquid's water content is
   * undeclared) — printed beside the lye figures for the same reason. */
  lyeWaterUnverifiable?: boolean;
```

`packages/web/src/hooks/useRecipeViewModel.ts` — inside the `buildBatchSheetData({` literal (which already passes `dilution,` at ~line 720), add:

```ts
      unknownLiquidGrams,
      lyeWaterUnverifiable,
```

and add both names to that memo's dependency array (same list that already contains `dilution`).

`packages/web/src/components/BatchSheet.tsx` — inside the dilution `<dl>` (after the `Dilution water to add` row at line 285), change the existing row and add a caveat paragraph after the `</dl>`:

```tsx
            <div><dt>Dilution water to add</dt><dd>
              {formatWeight(dilution.dilutionWaterGrams, weightUnit)}
              {data.unknownLiquidGrams ? ' (at least)' : ''}
            </dd></div>
```

```tsx
          {data.unknownLiquidGrams ? (
            <p className="batch-sheet__note">
              {formatWeight(data.unknownLiquidGrams, weightUnit)} of alternative liquid has
              no declared water content — it is counted as all water, so the dilution
              figure is the least you will need. Dilute in increments and check by weight.
            </p>
          ) : null}
          {data.lyeWaterUnverifiable ? (
            <p className="batch-sheet__note">
              The 1:1 lye-dissolution check could not run — an in-lye liquid has no
              declared water content.
            </p>
          ) : null}
```

(If `batch-sheet__note` has no style yet, reuse the sheet's existing small-print class — grep `batch-sheet__` in `index.css` and use the existing note/hint class if one exists; only add a new class if none does.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/web/src/components/BatchSheet.test.tsx packages/web/src/hooks/useRecipeViewModel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full verification + commit**

```bash
npm test && npm run build --workspace packages/web
git add -A && git commit -m "feat(web): printed batch sheet carries the unknown-liquid dilution and lye caveats"
```

- [ ] **Step 6: Open PR A, wait for CI, request adversarial review**

```bash
git push -u origin fix/dilution-hint-dedup-sheet-caveats
gh pr create --title "fix: dilution hint dedup + batch-sheet caveats (parked #142 review items)" --body "Closes the two follow-ups from the #142 adversarial review. See plan doc."
gh pr checks --watch
```

Do not merge until the adversarial pass (workflow, per the verification discipline) reports no blocking findings.

---

## PR B — Slice 1: no bridge (branch: `feat/no-cross-process-bridge`, off main after PR A merges)

### Task 3: recipeFile — absent vs invalid process are different cases

**Files:**
- Modify: `packages/web/src/lib/recipeFile.ts:239-260` (the parse-result `process:` field)
- Test: `packages/web/src/lib/recipeFile.test.ts` (exists — follow its fixture style)

**Interfaces:**
- Consumes: `isProcessId`, `processForLyeType` (already imported).
- Produces: `RecipeFilePayload.processSource: 'declared' | 'inferred'` (new field consumed by Task 4); parse REFUSES (`{ ok: false, error }`) when `parsed.process` is present but not a valid `ProcessId`.

**Background (why):** Today `isProcessId(parsed.process) ? parsed.process : processForLyeType(...)` treats a garbage value and an absent field identically — silent inference. Spec: declared → route; absent → infer once and announce; present-but-invalid → refuse.

- [ ] **Step 1: Write the failing tests**

The file's tests build payloads with `serializeRecipeFile(name, lines, settings, additives?, process?)` then `parseRecipeFile(JSON.stringify(payload))` (see its existing tests at lines ~16 and ~92). Follow that exactly:

```ts
test('a declared process routes as declared', () => {
  const payload = serializeRecipeFile('Declared', createStarterLines(), DEFAULT_SETTINGS, [], 'hp');
  const parsed = parseRecipeFile(JSON.stringify(payload));
  expect(parsed.ok).toBe(true);
  if (parsed.ok) {
    expect(parsed.data.process).toBe('hp');
    expect(parsed.data.processSource).toBe('declared');
  }
});

test('an absent process is inferred from the alkali and marked inferred', () => {
  const payload = serializeRecipeFile('Legacy', createStarterLines(), {
    ...DEFAULT_SETTINGS,
    lyeType: 'koh' as const,
  });
  delete (payload as { process?: unknown }).process; // legacy file: field absent entirely
  const parsed = parseRecipeFile(JSON.stringify(payload));
  expect(parsed.ok).toBe(true);
  if (parsed.ok) {
    expect(parsed.data.process).toBe('ls');
    expect(parsed.data.processSource).toBe('inferred');
  }
});

test('a present-but-invalid process refuses instead of guessing', () => {
  const payload = serializeRecipeFile('Garbage', createStarterLines(), DEFAULT_SETTINGS);
  (payload as { process?: unknown }).process = 'melt-and-pour';
  const parsed = parseRecipeFile(JSON.stringify(payload));
  expect(parsed.ok).toBe(false);
  if (!parsed.ok) expect(parsed.error).toMatch(/process/i);
});
```

(Imports `serializeRecipeFile`, `createStarterLines`, `DEFAULT_SETTINGS` are already used by this test file. NOTE: check what `serializeRecipeFile` writes when the process argument is omitted — if it always writes a process, the absent-case `delete` above is the correct simulation of a legacy file either way.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run packages/web/src/lib/recipeFile.test.ts`
Expected: FAIL — `processSource` undefined; invalid case currently parses ok.

- [ ] **Step 3: Implement**

In the payload type (same file, `RecipeFilePayload`), add:

```ts
  /** Whether the file named its process, or we inferred it from the alkali (legacy files
   * predate the process tag). Inference must be announced to the user at import — it is
   * the only silent-guess path left, and it is wrong for legacy NaOH hot-process files. */
  processSource: 'declared' | 'inferred';
```

Replace the `process:` expression (lines ~246-248):

```ts
      // Three cases, spec 2026-07-30: declared → use it; absent (legacy file) → infer
      // from the alkali, marked so the import can announce it; present-but-invalid →
      // refuse. Guessing over a garbage value is how a cross-process record sneaks in.
```

and above the `return { ok: true, ... }`, insert the refusal:

```ts
  if (parsed.process !== undefined && !isProcessId(parsed.process)) {
    return {
      ok: false,
      error:
        'This file names an unknown process. Fix its "process" field to cp, hp or ls — or remove the field to import by alkali type.',
    };
  }
```

then in the payload:

```ts
      process: isProcessId(parsed.process)
        ? parsed.process
        : processForLyeType((parsed.settings as { lyeType?: unknown } | undefined)?.lyeType),
      processSource: isProcessId(parsed.process) ? 'declared' : 'inferred',
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/web/src/lib/recipeFile.test.ts`
Expected: PASS, including all pre-existing tests (legacy no-process fixtures must still parse — they hit the `inferred` path).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/recipeFile.ts packages/web/src/lib/recipeFile.test.ts
git commit -m "feat(web): recipe files distinguish declared, inferred and invalid process"
```

### Task 4: announce the inference at import

**Files:**
- Modify: `packages/web/src/hooks/useRecipeStorage.ts:196-200` (the `flashSaveMessage` after import)
- Test: `packages/web/src/lib/recipeStorage.test.ts` or the hook's existing test file — whichever already exercises import; if neither does, add to `packages/web/src/hooks/useRecipeStorage.test.tsx` following its render-hook pattern.

**Interfaces:**
- Consumes: `parsed.data.processSource` from Task 3; `PROCESS_DEFINITIONS[nextProcess].label` for the human name.

**Background (why):** The import flash currently says only `Imported "name"`. When the process was inferred, the routing must be stated — that announcement is what makes the known NaOH-HP-legacy misfiling survivable.

- [ ] **Step 1: Write the failing test** — the message is built by a new PURE helper so the
test needs no hook harness. Append to `packages/web/src/lib/process.test.ts`:

```ts
test('importRoutingSuffix announces inference and stays silent for declared files', () => {
  expect(importRoutingSuffix('inferred', 'cp')).toBe(
    ' as cold process — this file predates process tags',
  );
  expect(importRoutingSuffix('declared', 'hp')).toBe('');
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run packages/web/src/lib/process.test.ts`. Expected: FAIL, `importRoutingSuffix` not exported.

- [ ] **Step 3: Implement** — in `packages/web/src/lib/process.ts`:

```ts
/** Suffix for the import flash. Inference is the one silent-guess path left, so it is
 * always announced — it is wrong for legacy NaOH hot-process files, and the announcement
 * is what makes that survivable (spec 2026-07-30). */
export function importRoutingSuffix(
  source: 'declared' | 'inferred',
  process: ProcessId,
): string {
  return source === 'inferred'
    ? ` as ${PROCESS_DEFINITIONS[process].label.toLowerCase()} — this file predates process tags`
    : '';
}
```

Then in `useRecipeStorage.ts`'s import success branch:

```ts
        const routing = importRoutingSuffix(parsed.data.processSource, nextProcess);
        flashSaveMessage(
          flushedOutgoing && savedImported
            ? `Imported “${parsed.data.name}”${routing}`
            : `Imported “${parsed.data.name}”${routing} — but storage is full, so changes may not persist. Export to keep a copy.`,
        );
```

(Add `importRoutingSuffix` to the existing `../lib/process` import in `useRecipeStorage.ts`.)

- [ ] **Step 4: Run tests. Step 5: Commit** (`feat(web): announce process inference when importing a legacy recipe file`).

### Task 5: rename and narrow the coercion seam

**Files:**
- Modify: `packages/web/src/lib/process.ts:102-123`
- Modify: `packages/web/src/hooks/useRecipeStorage.ts:20,59,166` (import + two call sites)
- Modify: `packages/web/src/hooks/useRecipeViewModel.ts:638` (comment reference only)
- Test: `packages/web/src/lib/process.test.ts` (rename in existing tests; add the provenance-comment test below)

**Interfaces:**
- Produces: `normalizeSettingsWithinProcess(settings, process)` — same signature and behaviour as today's `coerceSettingsForProcess`. The RENAME is the contract change: the name now states that callers must have already established the record belongs to `process` (same-process draft load, or post-routing import).

**Background (why):** The old name invited cross-process use ("coerce these foreign settings for CP"). Behaviour is already within-process at both call sites (workspace drafts are per-process; imports route first, Task 3 hardened the routing) — the rename plus doc makes the invariant legible, and the spec's "cross-process branch becomes an error path" is satisfied by the routing refusal upstream, not by a runtime check here (a runtime check would need provenance the settings object doesn't carry — YAGNI).

- [ ] **Step 1: Rename** `coerceSettingsForProcess` → `normalizeSettingsWithinProcess` in all four files (definition, two call sites, comment at useRecipeViewModel.ts:638, and the recipeStorage.ts:202 comment + recipeFile.ts:244 comment which reference the old name). Replace the function's doc comment with:

```ts
/**
 * Normalize a record WITHIN its own process: reset a stale/foreign variant to the
 * process's default, clamp a lye type the process no longer offers (legacy drafts from
 * before a gate existed). Callers must already have established that `settings` belongs
 * to `process` — per-process workspaces guarantee it for drafts, and import routing
 * (recipeFile: declared/inferred/refused) guarantees it for imports. This is NOT a
 * cross-process converter; there is deliberately no bridge (spec 2026-07-30).
 */
```

- [ ] **Step 2: Verify no cross-process feed path remains** — the spec bullet "delete any
remaining call path where one process's settings object is fed to another process's
calculator" closes here by inspection:

```bash
grep -rn "normalizeSettingsWithinProcess" packages/web/src --include="*.ts" --include="*.tsx" | grep -v "\.test\.\|lib/process.ts"
```

Expected: exactly the two call sites (`useRecipeStorage.ts` draft load + import), both
post-routing. Any third caller is a finding — stop and investigate before committing.

- [ ] **Step 3: Run the full unit suite** — `npm test`. Expected: green (pure rename).

- [ ] **Step 4: Commit** (`refactor(web): coerceSettingsForProcess → normalizeSettingsWithinProcess (no-bridge, spec 2026-07-30)`).

### Task 6: cross-process leak canary (e2e)

**Files:**
- Create: `packages/web/e2e/process-isolation.spec.ts`

**Interfaces:**
- Consumes: the app's real UI only. Patterns from `e2e/ls-split-liquid.spec.ts` (processTab helper, localStorage seeding via autosaved draft).

**Background (why):** The spec's testing section calls for one canary per process pair, definition-driven. It pins the no-bridge guarantee at the only layer that survives refactors: the rendered app.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect, type Page } from '@playwright/test';

/**
 * No-bridge canary (spec 2026-07-30): each process's workspace is untouched by work done
 * in the others. A distinctive recipe is written in every process; after cycling through
 * all tabs, each tab still shows exactly its own recipe — no field bled across.
 */

const processTab = (page: Page, name: RegExp) => page.getByRole('tab', { name });
const TABS: Array<[RegExp, string]> = [
  [/Cold process/, 'canary-cp'],
  [/Hot process/, 'canary-hp'],
  [/Liquid soap/, 'canary-ls'],
];

test('each process keeps its own workspace through a full tab cycle', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  for (const [tab, name] of TABS) {
    await processTab(page, tab).click();
    await page.getByLabel(/Recipe name/i).fill(name);
    await page.getByLabel(/Recipe name/i).blur();
  }
  // Second cycle: every tab must still hold its own name and its own lye default.
  for (const [tab, name] of TABS) {
    await processTab(page, tab).click();
    await expect(page.getByLabel(/Recipe name/i)).toHaveValue(name);
  }
  await processTab(page, /Liquid soap/).click();
  await expect(page.locator('.panel--results')).toContainText(/KOH/);
  await processTab(page, /Cold process/).click();
  await expect(page.locator('.panel--results')).toContainText(/NaOH/);
});
```

(Verified: the recipe-name input's accessible name IS "Recipe name" — App.tsx wraps it in
a label with an `sr-only` span (App.tsx:310-314), so `getByLabel(/Recipe name/i)` resolves.)

- [ ] **Step 2: Run it** — `cd packages/web && npx playwright test e2e/process-isolation.spec.ts`. Expected: PASS on today's code (workspaces already isolate). This canary exists to fail if slices 2–4 ever break isolation.

- [ ] **Step 3: Full verification, commit, open PR B**

```bash
npm test && npm run build --workspace packages/web && cd packages/web && npx playwright test
git add -A && git commit -m "feat: no cross-process bridge — routed imports, announced inference, isolation canary"
git push -u origin feat/no-cross-process-bridge
gh pr create --title "feat: Slice 1 — no cross-process bridge (spec 2026-07-30)" --body "Slice 1 of the process-separation spec. Declared/inferred/refused import routing, announced inference, coercion narrowed to within-process, isolation canary e2e."
```

Adversarial review before merge, as with PR A.

---

## After PR B

Write the Slice 2 plan (`ProcessDefinition` absorbs `processProfile.ts`) against the then-current main. Slices 3 and 4 likewise, sequentially. Do not plan them now — their file states will have shifted.
