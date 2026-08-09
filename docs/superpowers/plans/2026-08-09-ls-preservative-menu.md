# LS Preservative Menu, Custom Entry, and Free Dose — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the LS Preservative snippet's four-radio picker into a `<select>` with a `Custom…` entry, stop clamping the dose (warn instead), and persist the pick, custom name and dose with the recipe so they survive a reload and print on the batch sheet.

**Architecture:** Core gains a pure dose *classifier* that replaces the clamp; the snippet renders a ladder of notes off it instead of substituting a figure. `''` is the custom sentinel, matching the additives catalog idiom. Three fields join `RecipeSettings`, which gives save/load/export/import for free because both file paths already funnel through `normalizeSettings`.

**Tech Stack:** TypeScript, React 18, Vitest + @testing-library/react (jsdom), Playwright, npm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-08-ls-preservative-menu-design.md`

## Global Constraints

- **Baseline is green and must stay green.** `npm test` at `5ffc884`: typecheck + oils validation + core + 1196 web tests across 79 files, exit 0. Run it at the end of every task.
- **Every commit compiles.** Task order exists to avoid an intermediate broken tree — do not reorder.
- **No test is deleted to make a new one pass.** Four existing tests assert the inverse of this design and are rewritten *in place* (Tasks 2, 3, 6) so the diff shows the reversal. The one permitted deletion is the `clampLsPreservativePct` `describe` block (Task 2, Step 5) — its subject is removed from the codebase in the same commit, and Task 1's tier tests already cover the behaviour that replaces it. Reviewers: this is the exception, and it is the only one.
- **Doses are % w/w of the finished, ready-for-use product** (the diluted solution) — never of oils or paste.
- **`''` means custom** for `preservativeId`, matching `catalogId: ''` (additives) and `presetKey: ''` (alternative liquids).
- **Session-local state stays session-local:** `dilutionScope`, `portionTargetMl`, `measuredPasteGrams` and the `preservativeBaseGrams` memo are not touched by this work.
- **Never invent product data.** No new preservative is added to `LS_PRESERVATIVES`; no pH rating, ceiling or formaldehyde status is asserted for a custom entry.
- Run all commands from the repo root `/Users/str/soap-calc`. Full suite: `npm test`. Single web file: `npm test -w @soap-calc/web -- src/path/file.test.tsx`. Single core file: `npm test -w @soap-calc/core -- src/file.test.ts`.

---

### Task 1: Core — the dose classifier

Purely additive. `clampLsPreservativePct` stays for now (Task 2 removes it), so the tree stays green.

**Files:**
- Modify: `packages/core/src/ls-preservatives.ts` (append after `clampLsPreservativePct`, before `preservativeDoseGrams`)
- Test: `packages/core/src/ls-preservatives.test.ts` (append a new `describe`)

**Interfaces:**
- Consumes: `LsPreservative` (existing, same file).
- Produces: `LsPreservativeDoseTier` (union type) and `lsPreservativeDoseTier(pct: number, preservative?: LsPreservative): LsPreservativeDoseTier`. Tasks 2, 3 and 5 consume both.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/ls-preservatives.test.ts`. Add `lsPreservativeDoseTier` to the import list at the top of the file.

```ts
describe('lsPreservativeDoseTier', () => {
  const suttocide = byId['suttocide-a'];       // typical [0.5, 1.0], max 1.0 (eu)
  const germall = byId['liquid-germall-plus']; // typical [0.1, 0.5], max 0.5 (supplier)

  test('junk and empty-ish doses are none, so no note fires mid-keystroke', () => {
    expect(lsPreservativeDoseTier(NaN, suttocide)).toBe('none');
    expect(lsPreservativeDoseTier(0, suttocide)).toBe('none');
    expect(lsPreservativeDoseTier(-1, suttocide)).toBe('none');
    expect(lsPreservativeDoseTier(Infinity, suttocide)).toBe('none');
  });

  test('a dose inside the typical range is typical, boundaries included', () => {
    expect(lsPreservativeDoseTier(0.7, suttocide)).toBe('typical');
    expect(lsPreservativeDoseTier(0.5, suttocide)).toBe('typical'); // exactly typicalLow
    expect(lsPreservativeDoseTier(1.0, suttocide)).toBe('typical'); // exactly typicalHigh = maxPct
    expect(lsPreservativeDoseTier(0.1, germall)).toBe('typical');
    expect(lsPreservativeDoseTier(0.5, germall)).toBe('typical');
  });

  test('a dose under the typical range is below-typical', () => {
    expect(lsPreservativeDoseTier(0.4, suttocide)).toBe('below-typical');
    expect(lsPreservativeDoseTier(0.09, germall)).toBe('below-typical');
  });

  test('a dose over the ceiling is above-max — the figure is no longer clamped to it', () => {
    expect(lsPreservativeDoseTier(1.01, suttocide)).toBe('above-max');
    expect(lsPreservativeDoseTier(2, suttocide)).toBe('above-max');
    expect(lsPreservativeDoseTier(0.8, germall)).toBe('above-max');
  });

  test('over 100% is impossible, and outranks above-max: not a ceiling breach, not a dose', () => {
    expect(lsPreservativeDoseTier(101, suttocide)).toBe('impossible');
    // 150 is also far above suttocide's 1.0 ceiling; impossible still wins.
    expect(lsPreservativeDoseTier(150, suttocide)).toBe('impossible');
    expect(lsPreservativeDoseTier(100, suttocide)).toBe('above-max'); // exactly 100 is a dose
  });

  test('with no preservative (a custom entry) only the arithmetic tiers are reachable', () => {
    expect(lsPreservativeDoseTier(1)).toBe('unrated');
    expect(lsPreservativeDoseTier(0.001)).toBe('unrated');
    expect(lsPreservativeDoseTier(100)).toBe('unrated');
    expect(lsPreservativeDoseTier(101)).toBe('impossible');
    expect(lsPreservativeDoseTier(0)).toBe('none');
    expect(lsPreservativeDoseTier(NaN)).toBe('none');
  });

  test('no shipped entry can produce a dose that is above typical but under its ceiling', () => {
    // Why there is no 'above-typical' tier: every entry's typicalHigh IS its maxPct, so the
    // band between them is empty. If an entry with headroom is ever added, this test fails
    // and the tier (plus its UI note) must be added with it.
    for (const p of LS_PRESERVATIVES) {
      expect(p.typicalPctRange[1], p.id).toBe(p.maxPct);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w @soap-calc/core -- src/ls-preservatives.test.ts`
Expected: FAIL — `lsPreservativeDoseTier is not a function` / TypeScript cannot resolve the import.

- [ ] **Step 3: Write the implementation**

In `packages/core/src/ls-preservatives.ts`, insert after `clampLsPreservativePct`:

```ts
/**
 * Where a typed dose sits relative to a product's own numbers. Replaces the old clamp:
 * the caller keeps the dose the user typed and renders a note, rather than substituting
 * the ceiling and computing from that.
 *
 * `preservative` is absent for a custom entry, where the app has no rated range and no
 * ceiling — only the two arithmetic judgements survive, and any real dose is 'unrated'.
 *
 * ORDER MATTERS. 'none' first, so a half-typed field ('', '-', '0.') raises nothing.
 * Then 'impossible', which outranks 'above-max': more preservative than finished product
 * is not a ceiling breach to warn about, it is a number that is not a dose.
 *
 * There is deliberately no 'above-typical' tier. Every shipped entry's typicalHigh IS its
 * maxPct (pinned by a test in this file's suite), so the band between them is empty and
 * such a tier would be unreachable copy. An entry with headroom must add it.
 */
export function lsPreservativeDoseTier(
  pct: number,
  preservative?: LsPreservative,
): LsPreservativeDoseTier {
  if (!Number.isFinite(pct) || pct <= 0) return 'none';
  if (pct > 100) return 'impossible';
  if (!preservative) return 'unrated';
  if (pct > preservative.maxPct) return 'above-max';
  if (pct < preservative.typicalPctRange[0]) return 'below-typical';
  return 'typical';
}
```

And add the type beside the other exported types (after `LsFormaldehydeLabel`):

```ts
/** Where a typed dose sits relative to the selected product — see lsPreservativeDoseTier
 * for the ordering rules and for why there is no 'above-typical'. */
export type LsPreservativeDoseTier =
  | 'none'
  | 'impossible'
  | 'unrated'
  | 'below-typical'
  | 'typical'
  | 'above-max';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @soap-calc/core -- src/ls-preservatives.test.ts`
Expected: PASS, including the pre-existing `clampLsPreservativePct` block (untouched).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: exit 0, previous counts plus 7 new core tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/ls-preservatives.ts packages/core/src/ls-preservatives.test.ts
git commit -m "feat(core): where a dose sits, instead of what it gets clamped to"
```

---

### Task 2: The dose stops being clamped

The picker is still four radios after this task. Only the dose behaviour changes — a shippable improvement on its own.

**Files:**
- Modify: `packages/core/src/ls-preservatives.ts` (delete `clampLsPreservativePct`)
- Modify: `packages/core/src/ls-preservatives.test.ts:117-139` (delete the clamp `describe`; the Task 1 block replaces it)
- Modify: `packages/web/src/components/PreservativeSnippet.tsx` (lines 3, 69-75, 144-162)
- Modify: `packages/web/src/components/PreservativeSnippet.test.tsx:109-137` (invert two tests, add three)

**Interfaces:**
- Consumes: `lsPreservativeDoseTier` from Task 1.
- Produces: the snippet renders grams from the **typed** dose. Task 5 relies on the same tier values to decide whether to print.

- [ ] **Step 1: Rewrite the two inverted tests and add the new rungs**

In `packages/web/src/components/PreservativeSnippet.test.tsx`, replace the tests at lines 109-137 (`'a dose above an EU ceiling is hard-clamped…'`, `"a dose above a supplier ceiling clamps too…"`, `'a dose at or under the ceiling raises no clamp message'`) with:

```tsx
test('a dose above an EU ceiling is NOT clamped — the alert names the EU, the figure follows the typed dose', () => {
  // The inverse of the old assertion, deliberately: the maker owns the number. Nothing on
  // screen may be computed from a dose they did not type.
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(doseInput(), { target: { value: '2' } });
  const alert = screen.getByRole('alert');
  expect(alert.textContent).toContain('1%');
  expect(alert.textContent).toContain('EU legal maximum');
  expect(screen.getByText('80 g')).toBeTruthy();   // 2% of 4,000 g — the typed dose
  expect(screen.queryByText('40 g')).toBeNull();   // never the old clamped 1%
});

test("a dose above a supplier ceiling says whose maximum it is, and still computes", () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Liquid Germall Plus' }));
  fireEvent.change(doseInput(), { target: { value: '0.8' } });
  const alert = screen.getByRole('alert');
  expect(alert.textContent).toContain('0.5%');
  expect(alert.textContent).toContain('supplier');
  expect(alert.textContent).not.toContain('EU legal maximum');
  expect(screen.getByText('32 g')).toBeTruthy();   // 0.8% of 4,000 g
});

test('a dose inside the typical range raises nothing', () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(doseInput(), { target: { value: '0.7' } });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByText(/Below the typical/)).toBeNull();
  expect(screen.getByText('28 g')).toBeTruthy();   // 0.7% of 4,000 g
});

test('an under-dose is flagged as a plain note, not an alert', () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(doseInput(), { target: { value: '0.2' } });
  expect(screen.getByText(/Below the typical 0.5–1% for Suttocide A/)).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();  // plain note: it must not steal focus
  expect(screen.getByText('8 g')).toBeTruthy();    // 0.2% of 4,000 g — still computed
});

test('a dose over 100% is refused outright — no figure, because it is not a dose', () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(doseInput(), { target: { value: '150' } });
  expect(screen.getByRole('alert').textContent).toContain('100% or less');
  expect(screen.queryByText('Preservative to add')).toBeNull();
});

test('the ceiling alert echoes the dose canonically, not as typed', () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(doseInput(), { target: { value: '2.500' } });
  expect(screen.getByRole('alert').textContent).toContain('2.5%');
  expect(screen.getByRole('alert').textContent).not.toContain('2.500%');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @soap-calc/web -- src/components/PreservativeSnippet.test.tsx`
Expected: FAIL — `80 g` not found (the clamp still shows `40 g`), no `Below the typical` text, no `100% or less` text.

- [ ] **Step 3: Rewrite the snippet's dose logic**

In `packages/web/src/components/PreservativeSnippet.tsx`, change the import at lines 1-7 — drop `clampLsPreservativePct`, add `lsPreservativeDoseTier`:

```tsx
import {
  LS_PRESERVATIVES,
  lsPreservativeById,
  lsPreservativeDoseTier,
  preservativeDoseGrams,
  type LsPreservativeId,
} from '@soap-calc/core';
```

Replace lines 69-75 (the clamp block and `grams`) with:

```tsx
  // NO CLAMP. The grams are always the typed dose against the finished mass; the ladder
  // below explains where that dose sits. A figure computed from a number the maker did
  // not type is the thing this replaced.
  const tier = lsPreservativeDoseTier(doseNum, preservative);
  // Canonical echo: '2.500' and '2.5e0' both print as 2.5, the same rule parseAdditiveLine
  // uses on import.
  const typedPct = String(doseNum);
  const grams =
    finishedGrams !== null && tier !== 'none' && tier !== 'impossible'
      ? preservativeDoseGrams(finishedGrams, doseNum)
      : null;
```

Delete the now-unused `doseEntered` const on line 68.

Replace the `max` attribute on the dose input (line 148) — `max={preservative.maxPct}` becomes `max={100}` — and replace the `{clamped && (…)}` block at lines 154-162 with:

```tsx
      {tier === 'impossible' && (
        <p className="results-hint" role="alert">
          A dose must be 100% or less of the finished product.
        </p>
      )}
      {tier === 'above-max' && (
        <p className="results-hint" role="alert">
          {typedPct}% is above{' '}
          {preservative.ceiling === 'eu'
            ? `the EU legal maximum of ${preservative.maxPct}% for ${preservative.label} in a finished product`
            : `${preservative.label}'s supplier maximum of ${preservative.maxPct}%`}
          . The figures below use the {typedPct}% you entered.
        </p>
      )}
      {tier === 'below-typical' && (
        <p className="results-hint">
          Below the typical {typicalLow}–{typicalHigh}% for {preservative.label} — an
          under-dose may not protect the batch.
        </p>
      )}
```

**Leave the results gate on line 163 (`finishedGrams !== null ? (`) exactly as it is.** It is
tempting to add `&& tier !== 'impossible'` so a refused dose prints no figures — do not.
`grams` is already `null` at that tier, and the results grid is gated on `grams !== null`,
so no figure renders either way. Adding the clause instead drops the whole branch into the
*empty state*, which tells a maker who has entered oils to "Enter oils and a dilution
target" — a stale hint contradicting the screen they are looking at.

- [ ] **Step 4: Run the snippet tests**

Run: `npm test -w @soap-calc/web -- src/components/PreservativeSnippet.test.tsx`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Delete the clamp from core and its test block**

Delete `clampLsPreservativePct` (lines 182-193 of `packages/core/src/ls-preservatives.ts`, including its doc comment) and the whole `describe('clampLsPreservativePct', …)` block at `packages/core/src/ls-preservatives.test.ts:117-139`. Remove `clampLsPreservativePct` from that file's import list.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: exit 0. If typecheck reports any remaining `clampLsPreservativePct` reference, it is a call site this plan did not know about — stop and report it rather than reinstating the function.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/ls-preservatives.ts packages/core/src/ls-preservatives.test.ts packages/web/src/components/PreservativeSnippet.tsx packages/web/src/components/PreservativeSnippet.test.tsx
git commit -m "feat(ls): the dose is the maker's, and the ceiling is a warning"
```

---

### Task 3: The menu and the custom entry

**Files:**
- Modify: `packages/core/src/ls-preservatives.ts:176-180` (widen `lsPreservativeById`)
- Modify: `packages/core/src/ls-preservatives.test.ts` (add the unknown-id case)
- Modify: `packages/web/src/components/PreservativeSnippet.tsx` (props, picker markup, custom branch)
- Modify: `packages/web/src/components/PreservativeSnippet.test.tsx` (Harness, radiogroup tests → select tests, new custom tests)
- Modify: `packages/web/src/App.tsx:147-152, 580-588` (widen state type, pass the new props)
- Modify: `packages/web/src/index.css:994-1007` (delete the dead picker rules)

**Interfaces:**
- Consumes: `lsPreservativeDoseTier` (Task 1), the un-clamped snippet (Task 2).
- Produces: `PreservativeSnippetProps` with `preservativeId: string` (`''` = custom), `preservativeCustomName: string`, `onPreservativeCustomNameChange: (name: string) => void`. Task 4 wires these to settings.

- [ ] **Step 1: Widen the core lookup**

In `packages/core/src/ls-preservatives.ts`, replace `lsPreservativeById` (lines 176-180):

```ts
/** The table entry for an id, or `undefined` when there is none — which is how a caller
 * learns the selection is a CUSTOM entry (`''`), and how a stale id from an older or
 * hand-edited recipe degrades instead of throwing. Mirrors `catalogEntryById`. */
export function lsPreservativeById(id: string): LsPreservative | undefined {
  return BY_ID.get(id);
}
```

Add to the `describe('the preservative table', …)` block in the core test file:

```ts
  test('an id outside the table is undefined — the custom sentinel and any stale id', () => {
    expect(lsPreservativeById('')).toBeUndefined();
    expect(lsPreservativeById('optiphen-plus')).toBeUndefined();
  });
```

- [ ] **Step 2: Write the failing component tests**

In `packages/web/src/components/PreservativeSnippet.test.tsx`, replace the `Harness` (lines 13-35) with:

```tsx
function Harness({
  finishedGrams = 4000,
  basisScope,
  weightUnit = 'g',
}: {
  finishedGrams?: number | null;
  basisScope?: 'batch' | 'portion';
  weightUnit?: WeightUnit;
}) {
  const [id, setId] = useState<string>(LS_PRESERVATIVES[0].id);
  const [customName, setCustomName] = useState('');
  const [dose, setDose] = useState(String(LS_PRESERVATIVES[0].defaultPct));
  return (
    <PreservativeSnippet
      finishedGrams={finishedGrams}
      basisScope={basisScope}
      weightUnit={weightUnit}
      preservativeId={id}
      onPreservativeIdChange={setId}
      preservativeCustomName={customName}
      onPreservativeCustomNameChange={setCustomName}
      dosePct={dose}
      onDosePctChange={setDose}
    />
  );
}

function picker(): HTMLSelectElement {
  return screen.getByLabelText('Which preservative') as HTMLSelectElement;
}
```

Delete the now-unused `type LsPreservativeId` from the file's import on line 5.

Replace the two radio-shaped tests at lines 48-64 with:

```tsx
test('offers the four preservatives plus Custom… in one menu, anchor choice selected', () => {
  render(<Harness />);
  const options = Array.from(picker().options).map((o) => o.textContent);
  expect(options).toEqual([
    'Custom…',
    'Suttocide A',
    'Liquid Germall Plus',
    'Glydant Plus',
    'Phenoxyethanol',
  ]);
  expect(picker().value).toBe('suttocide-a');
});

test("Label-in-Name: the menu's accessible name is its visible caption", () => {
  // Inherited obligation from the radiogroup this replaced — the visible caption and the
  // accessible name must not diverge.
  render(<Harness />);
  expect(screen.getByText('Which preservative')).toBeTruthy();
  expect(picker()).toBeTruthy(); // getByLabelText('Which preservative') resolved it
});
```

Change the radio clicks in the remaining tests (lines 99, 122, 150, 154, 159 of the original file) from
`fireEvent.click(screen.getByRole('radio', { name: 'Liquid Germall Plus' }))` to
`fireEvent.change(picker(), { target: { value: 'liquid-germall-plus' } })`, and likewise
`glydant-plus` and `phenoxyethanol`.

Then append the custom-entry tests:

```tsx
test('picking Custom… clears the dose — a dose typed for one product must not walk onto another', () => {
  render(<Harness finishedGrams={4000} />);
  expect(doseInput().value).toBe('1');
  fireEvent.change(picker(), { target: { value: '' } });
  expect(doseInput().value).toBe('');
  expect(screen.queryByText('Preservative to add')).toBeNull();
});

test('Custom… reveals a name field and suppresses every product-specific fact', () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(picker(), { target: { value: '' } });
  expect(screen.getByLabelText('Name')).toBeTruthy();
  // no composition, no rated pH, no typical range, no formaldehyde note, no °C
  expect(screen.queryByText(/Sodium hydroxymethylglycinate/)).toBeNull();
  expect(screen.queryByText(/Rated pH/)).toBeNull();
  expect(screen.queryByText(/Typical /)).toBeNull();
  expect(screen.queryByText(/formaldehyde/i)).toBeNull();
  expect(screen.queryByText(/below 50 °C/)).toBeNull();
});

test('Custom… carries the standing note about what does not work at soap pH', () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(picker(), { target: { value: '' } });
  expect(screen.getByText(/Few preservatives hold at soap's pH 9–10/)).toBeTruthy();
  expect(screen.getByText(/Organic-acid systems/)).toBeTruthy();
});

test('a custom dose still computes, and still refuses the impossible', () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(picker(), { target: { value: '' } });
  fireEvent.change(doseInput(), { target: { value: '1.5' } });
  expect(screen.getByText('60 g')).toBeTruthy();      // 1.5% of 4,000 g
  expect(screen.queryByRole('alert')).toBeNull();     // no ceiling to breach
  fireEvent.change(doseInput(), { target: { value: '150' } });
  expect(screen.getByRole('alert').textContent).toContain('100% or less');
});

test('Custom… suppresses product facts but never scope facts', () => {
  render(<Harness finishedGrams={257.5} basisScope="portion" />);
  fireEvent.change(picker(), { target: { value: '' } });
  fireEvent.change(doseInput(), { target: { value: '1' } });
  expect(screen.getByText('≈ Finished product (custom amount)')).toBeTruthy();
  expect(screen.getByText('2.6 g')).toBeTruthy();
});

test('switching back from Custom… to a product restores its own default dose', () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(picker(), { target: { value: '' } });
  fireEvent.change(picker(), { target: { value: 'glydant-plus' } });
  expect(doseInput().value).toBe('0.36');
  expect(screen.getByText(/DMDM hydantoin/)).toBeTruthy();
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm test -w @soap-calc/web -- src/components/PreservativeSnippet.test.tsx`
Expected: FAIL — `getByLabelText('Which preservative')` finds no select; the props do not exist.

- [ ] **Step 4: Rewrite the component**

In `packages/web/src/components/PreservativeSnippet.tsx`, change the two id props and add the name pair in `PreservativeSnippetProps` (lines 34-42):

```tsx
  /** Which preservative is being sized. `''` is the CUSTOM sentinel — the same idiom as
   * an additive line's `catalogId: ''` — and means the app has no product data at all:
   * no rated pH, no ceiling, no formaldehyde status. Session state for now, held in App
   * beside the other bench decisions; Task 4 moves it into the recipe. Describe only what
   * is true in THIS commit — App's own comment on the same state says "never enter the
   * recipe", and two comments contradicting each other is worse than either. */
  preservativeId: string;
  onPreservativeIdChange: (id: string) => void;
  /** Free-text product name, used only while `preservativeId` is `''`. Retained across a
   * switch to a known product so switching back restores it. */
  preservativeCustomName: string;
  onPreservativeCustomNameChange: (name: string) => void;
  /** The dose as typed, % of finished product. Reseeded to a product's own default on
   * every pick, and CLEARED when Custom… is chosen — there is no default to reseed from,
   * and carrying the last product's dose onto an unknown one is the hazard the reseed
   * rule exists to prevent. */
  dosePct: string;
  onDosePctChange: (value: string) => void;
```

Add the two new names to the destructured parameter list, then make the lookup nullable and derive the display name (replacing line 66):

```tsx
  // undefined === the custom entry. Everything product-specific below is gated on it.
  const preservative = lsPreservativeById(preservativeId);
  const displayName =
    preservative?.label ?? (preservativeCustomName.trim() || 'Custom preservative');
```

Pass the optional preservative to the classifier — `lsPreservativeDoseTier(doseNum, preservative)` already accepts `undefined`. Guard the typical-range destructure (line 76):

```tsx
  const [typicalLow, typicalHigh] = preservative?.typicalPctRange ?? [0, 0];
```

Replace the radiogroup markup (lines 106-139) with the select, the name field and the two notes:

```tsx
      <label className="field">
        {/* The span IS the accessible name (wrapping label, no aria-label) — the same
            one-string discipline as the dose field, and the visible caption the
            radiogroup's legend used to carry. */}
        <span>Which preservative</span>
        <select
          className="input"
          value={preservativeId}
          onChange={(e) => {
            const id = e.target.value;
            onPreservativeIdChange(id);
            const picked = lsPreservativeById(id);
            // Reseed, don't carry: each product's default IS product data (its own
            // verified typical dose), so a dose typed for one must not silently become
            // another's — 1% of Suttocide is legal, 1% of Germall is double the
            // supplier's maximum. Custom has no default, so it clears instead.
            onDosePctChange(picked ? String(picked.defaultPct) : '');
          }}
        >
          <option value="">Custom…</option>
          {LS_PRESERVATIVES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {preservative ? (
        /* The selected product's own facts — composition, rated pH, typical dose — so the
           default in the field below arrives explained, not asserted. */
        <p className="results-hint">
          {preservative.composition} — {preservative.phNote}. Typical {typicalLow}–
          {typicalHigh}% of the finished product.
        </p>
      ) : (
        <>
          <label className="field">
            <span>Name</span>
            <input
              type="text"
              className="input"
              placeholder="Name"
              maxLength={200}
              value={preservativeCustomName}
              onChange={(e) => onPreservativeCustomNameChange(e.target.value)}
            />
          </label>
          {/* The research this table is built on, at the one moment it is useful: a maker
              reaching for Custom… is most likely holding an organic-acid system, which is
              inert at soap pH. The app has no data for their bottle and says so rather
              than implying a rating it cannot cite. */}
          <p className="results-hint">
            Few preservatives hold at soap&apos;s pH 9–10. Organic-acid systems (sodium
            benzoate, potassium sorbate, Geogard, Optiphen) are inert here. Check your
            supplier&apos;s rated pH range and use level before dosing.
          </p>
        </>
      )}
```

Gate the three product-specific blocks on `preservative`: the `above-max` note and the `below-typical` note from Task 2 become `{preservative && tier === 'above-max' && (…)}` and `{preservative && tier === 'below-typical' && (…)}`; the formaldehyde block (lines 218-234) becomes `{preservative && preservative.formaldehydeLabel !== 'not-a-releaser' && (…)}`. In the stage paragraph, replace `preservative.addBelowC !== null ? \` — below ${preservative.addBelowC} °C for ${preservative.label}\` : ''` with `preservative?.addBelowC != null ? \` — below ${preservative.addBelowC} °C for ${preservative.label}\` : ''`. Replace every other bare `preservative.label` in copy with `displayName`.

- [ ] **Step 5: Update App to the widened type**

In `packages/web/src/App.tsx`, change lines 147-152 to widen the id state and add the name state (persistence lands in Task 4):

```tsx
  const [preservativeId, setPreservativeId] = useState<string>(LS_PRESERVATIVES[0].id);
  const [preservativeCustomName, setPreservativeCustomName] = useState('');
  const [preservativeDosePct, setPreservativeDosePct] = useState(
    String(LS_PRESERVATIVES[0].defaultPct),
  );
```

Remove `type LsPreservativeId` from the core import on line 2 if nothing else uses it. Add the two new props at the call site (after line 585):

```tsx
                preservativeCustomName={preservativeCustomName}
                onPreservativeCustomNameChange={setPreservativeCustomName}
```

- [ ] **Step 6: Delete the dead CSS**

Delete `packages/web/src/index.css` lines 994-1007 — the `/* Same row shape as the Dilution panel's toggles… */` comment, `.preservative__picker` and `.preservative__legend`. The select and name input use the shared `.field` / `.input` rules.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/ls-preservatives.ts packages/core/src/ls-preservatives.test.ts packages/web/src/components/PreservativeSnippet.tsx packages/web/src/components/PreservativeSnippet.test.tsx packages/web/src/App.tsx packages/web/src/index.css
git commit -m "feat(ls): a menu of preservatives, and room for the bottle you actually own"
```

---

### Task 4: The preservative joins the recipe

**Files:**
- Modify: `packages/web/src/lib/recipe.ts` (type, defaults, `normalizeSettings`)
- Modify: `packages/web/src/lib/recipe.test.ts` (coercion tests)
- Modify: `packages/web/src/lib/recipeFile.test.ts` (round-trip test — `recipeFile.ts` itself needs no change)
- Modify: `packages/web/src/App.tsx` (drop the three `useState`s, read/write settings)
- Modify: `packages/web/src/components/PreservativeSnippet.tsx` (the three prose sites)
- Modify: `packages/web/src/components/PreservativeSnippet.test.tsx:170` (subtitle pin)

**Interfaces:**
- Consumes: the widened props from Task 3.
- Produces: `RecipeSettings.preservativeId | preservativeCustomName | preservativeDosePct`. Task 5 reads all three off `data.settings`.

- [ ] **Step 1: Write the failing settings tests**

Append to `packages/web/src/lib/recipe.test.ts`:

```ts
describe('preservative settings', () => {
  it('defaults to the table anchor at its own default dose', () => {
    const s = normalizeSettings({});
    expect(s.preservativeId).toBe(LS_PRESERVATIVES[0].id);
    expect(s.preservativeDosePct).toBe(String(LS_PRESERVATIVES[0].defaultPct));
    expect(s.preservativeCustomName).toBe('');
  });

  it('keeps a preservativeId the table still resolves', () => {
    expect(normalizeSettings({ preservativeId: 'glydant-plus' }).preservativeId).toBe('glydant-plus');
  });

  it('keeps the empty custom sentinel rather than replacing it with the default', () => {
    // '' is a real choice (Custom…), not a missing value.
    const s = normalizeSettings({ preservativeId: '', preservativeCustomName: 'Optiphen Plus' });
    expect(s.preservativeId).toBe('');
    expect(s.preservativeCustomName).toBe('Optiphen Plus');
  });

  it('degrades an unresolvable id to a custom entry, keeping the name', () => {
    // Mirrors normalizeAdditiveLine's stale-catalogId rule: the line survives as free text
    // rather than as a broken pick whose <select> has no matching <option>.
    const s = normalizeSettings({
      preservativeId: 'quaternium-15',
      preservativeCustomName: 'my bottle',
    } as unknown as Partial<RecipeSettings>);
    expect(s.preservativeId).toBe('');
    expect(s.preservativeCustomName).toBe('my bottle');
  });

  it('keeps an over-ceiling dose verbatim — the panel warns, the loader does not edit', () => {
    expect(normalizeSettings({ preservativeDosePct: '2' }).preservativeDosePct).toBe('2');
  });
});
```

Add `LS_PRESERVATIVES` to that file's `@soap-calc/core` import.

Append to `packages/web/src/lib/recipeFile.test.ts`, inside the existing `describe('recipeFile', …)`:

```ts
  it('round-trips a custom preservative through export and import', () => {
    const settings: RecipeSettings = {
      ...DEFAULT_SETTINGS,
      preservativeId: '',
      preservativeCustomName: 'Optiphen Plus',
      preservativeDosePct: '1.5',
    };
    const payload = serializeRecipeFile('LS test', createStarterLines(), settings, [], 'ls');
    const parsed = parseRecipeFile(JSON.stringify(payload));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.settings.preservativeId).toBe('');
    expect(parsed.data.settings.preservativeCustomName).toBe('Optiphen Plus');
    expect(parsed.data.settings.preservativeDosePct).toBe('1.5');
  });
```

Match that file's existing import style for `DEFAULT_SETTINGS` / `RecipeSettings` / `createStarterLines`.

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @soap-calc/web -- src/lib/recipe.test.ts src/lib/recipeFile.test.ts`
Expected: FAIL — `preservativeId` does not exist on `RecipeSettings`.

- [ ] **Step 3: Add the fields**

In `packages/web/src/lib/recipe.ts`, add to the `RecipeSettings` type after `gelMode`:

```ts
  /** Which preservative the LS dose calculator is sizing. `''` = a custom entry, the same
   * sentinel as an additive's `catalogId`. Recipe state rather than session state because
   * a custom product name that vanishes on reload is worthless — but it is a SETTING, not
   * an ingredient: no preservative mass enters the oil, lye or batch arithmetic. */
  preservativeId: string;
  preservativeCustomName: string;
  preservativeDosePct: string;
```

Add to `DEFAULT_SETTINGS` — computed from the table, never literals, so a reorder or a
revised `defaultPct` cannot leave a stale constant behind:

```ts
  preservativeId: LS_PRESERVATIVES[0].id,
  preservativeCustomName: '',
  preservativeDosePct: String(LS_PRESERVATIVES[0].defaultPct),
```

Extend the `@soap-calc/core` import on line 1 with `LS_PRESERVATIVES, lsPreservativeById`.

Add to the object `normalizeSettings` returns:

```ts
    // An id the table no longer resolves becomes a custom entry KEEPING the typed name —
    // the same degradation normalizeAdditiveLine applies to a stale catalogId. '' is
    // already a custom entry and passes through untouched.
    preservativeId: lsPreservativeById(settingString(partial?.preservativeId, d.preservativeId))
      ? settingString(partial?.preservativeId, d.preservativeId)
      : '',
    preservativeCustomName: settingString(partial?.preservativeCustomName, d.preservativeCustomName),
    preservativeDosePct: settingString(partial?.preservativeDosePct, d.preservativeDosePct),
```

- [ ] **Step 4: Run the settings tests**

Run: `npm test -w @soap-calc/web -- src/lib/recipe.test.ts src/lib/recipeFile.test.ts`
Expected: PASS.

- [ ] **Step 5: Move App from useState to settings**

In `packages/web/src/App.tsx`, delete the three `useState` declarations added/kept in Task 3 (lines 143-153, including the comment block that calls them bench decisions) and rewrite the call site props:

```tsx
                preservativeId={settings.preservativeId}
                onPreservativeIdChange={(preservativeId) =>
                  setSettings({ ...settings, preservativeId })
                }
                preservativeCustomName={settings.preservativeCustomName}
                onPreservativeCustomNameChange={(preservativeCustomName) =>
                  setSettings({ ...settings, preservativeCustomName })
                }
                dosePct={settings.preservativeDosePct}
                onDosePctChange={(preservativeDosePct) =>
                  setSettings({ ...settings, preservativeDosePct })
                }
```

**Use the functional form, not an object spread.** The select's `onChange` fires
`onPreservativeIdChange` and `onDosePctChange` back to back in one handler. Two
`setSettings({ ...settings, … })` calls both read the *same* stale `settings` closure, so
the second overwrites the first and the reseeded dose is silently lost on every pick.

```tsx
                preservativeId={settings.preservativeId}
                onPreservativeIdChange={(preservativeId) =>
                  setSettings((s) => ({ ...s, preservativeId }))
                }
                preservativeCustomName={settings.preservativeCustomName}
                onPreservativeCustomNameChange={(preservativeCustomName) =>
                  setSettings((s) => ({ ...s, preservativeCustomName }))
                }
                dosePct={settings.preservativeDosePct}
                onDosePctChange={(preservativeDosePct) =>
                  setSettings((s) => ({ ...s, preservativeDosePct }))
                }
```

`setSettings` comes from the workspace hook at `App.tsx:57`. If it rejects the functional
form, stop and report rather than falling back to the object spread — Task 3's test
`'picking another preservative reseeds the dose with ITS default'` is what catches this,
and making it pass by weakening it would ship the bug.

Remove `LS_PRESERVATIVES` from App's core import if nothing else uses it.

- [ ] **Step 6: Rewrite the three prose sites**

In `packages/web/src/components/PreservativeSnippet.tsx`:

**The `preservativeId` props doc** — Task 3 left it describing session state, which was
true then and is false now. Rewrite it to say the pick, the custom name and the dose are
recipe state: saved with the recipe, exported with it, printed on the sheet — and delete
its "Task 4 moves it into the recipe" forward reference, which this task discharges.

**Delete the dead `displayName`.** Task 3 introduced
`preservative?.label ?? (preservativeCustomName.trim() || 'Custom preservative')` in this
component, but every use site sits inside a `preservative &&` gate, so the fallback branch
is unreachable — and it stays unreachable after this task, because the snippet never
echoes a custom product name anywhere. Replace each use with `preservative.label` and
remove the binding. The `Custom preservative` fallback is genuinely needed only on the
batch sheet, where Task 5 computes it independently.

**Update `App.tsx`'s stale comment** on the preservative state block (the one that today
says these are bench decisions that "never enter the recipe") — it is the counterpart of
the props doc above and must move with it, or the contradiction simply changes which file
it lives in.

The component doc (lines 48-50) — replace "A dose calculator, not a recipe field … writes nothing back into the recipe." with:

```
 * A recipe SETTING, not a recipe ingredient: the pick, the custom name and the dose are
 * saved with the recipe, exported with it and printed on the batch sheet — but no
 * preservative mass ever enters the oil, lye or batch arithmetic.
```

The subtitle (lines 85-88):

```tsx
      <p className="panel__subtitle">
        Grams to weigh into the finished, diluted soap — saved with the recipe, never
        counted in the batch or lye figures
      </p>
```

And in `PreservativeSnippet.test.tsx`, line 170's assertion becomes:

```tsx
  expect(screen.getByText(/never counted in the batch or lye figures/i)).toBeTruthy();
```

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: exit 0.

- [ ] **Step 8: Manual check — the whole point of the task**

Run: `npm run dev:web`. Choose Liquid soap, enter an oil weight, open Preservative, pick `Custom…`, type a name and a dose, then reload the page. The name and dose must still be there.

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/lib/recipe.ts packages/web/src/lib/recipe.test.ts packages/web/src/lib/recipeFile.test.ts packages/web/src/App.tsx packages/web/src/components/PreservativeSnippet.tsx packages/web/src/components/PreservativeSnippet.test.tsx
git commit -m "feat(ls): the preservative is part of the recipe, and the copy says so"
```

---

### Task 5: The batch sheet prints the dose

**Files:**
- Modify: `packages/web/src/components/BatchSheet.tsx` (import, Dilution section after line 379)
- Modify: `packages/web/src/components/BatchSheet.test.tsx`

**Interfaces:**
- Consumes: `lsPreservativeDoseTier`, `lsPreservativeById`, `preservativeDoseGrams` (core); `data.settings` (already `RecipeSettings`) and the local `bottledGrams` at line 159. No change to `BatchSheetData` — verified it already carries `settings`.

- [ ] **Step 1: Write the failing tests**

`packages/web/src/components/BatchSheet.test.tsx` **already has** the fixture builder this
needs — `lsSheetData` at line 425, LS/KOH with a real dilution block whose
`solutionGrams` is `4059` and no `bottledSolutionGrams`, so `bottledGrams` resolves to
`4059`. It takes no settings overrides yet. Add one field to its parameter type:

```ts
  /** Merged into the fixture's settings — for the preservative row, whose three fields
   * live in RecipeSettings and do not affect calculateRecipe. */
  preservative?: Partial<
    Pick<
      import('../lib/recipe').RecipeSettings,
      'preservativeId' | 'preservativeCustomName' | 'preservativeDosePct'
    >
  >;
```

and thread it through — change the destructure on line 438 and the `settings` line 440:

```ts
  const { targetExceedsPaste, dilutionOverride, preservative, ...rest } = extra;
  const lines = createStarterLines();
  const settings = { ...DEFAULT_SETTINGS, lyeType: 'koh' as const, ...preservative };
```

Then append the tests:

```tsx
test('prints the preservative dose against the whole batch, and names the scope', () => {
  render(<BatchSheet data={lsSheetData({
    preservative: { preservativeId: 'suttocide-a', preservativeDosePct: '1' },
  })} />);
  const row = screen.getByText('Preservative').closest('div')!;
  expect(row.textContent).toContain('Suttocide A');
  expect(row.textContent).toContain('1%');
  expect(row.textContent).toContain('whole batch');
  // 1% of the fixture's 4,059 g finished solution
  expect(row.textContent).toContain('41 g');
});

test('a blank custom name still prints a headed row', () => {
  render(<BatchSheet data={lsSheetData({
    preservative: { preservativeId: '', preservativeCustomName: '', preservativeDosePct: '1' },
  })} />);
  expect(screen.getByText('Preservative').closest('div')!.textContent)
    .toContain('Custom preservative');
});

test('no dose, no row', () => {
  render(<BatchSheet data={lsSheetData({ preservative: { preservativeDosePct: '' } })} />);
  expect(screen.queryByText('Preservative')).toBeNull();
});

test('an impossible dose prints no row either', () => {
  render(<BatchSheet data={lsSheetData({ preservative: { preservativeDosePct: '150' } })} />);
  expect(screen.queryByText('Preservative')).toBeNull();
});

test('an over-ceiling dose prints its caveat; the formaldehyde note stays off the sheet', () => {
  render(<BatchSheet data={lsSheetData({
    preservative: { preservativeId: 'suttocide-a', preservativeDosePct: '2' },
  })} />);
  expect(screen.getByText(/above the EU legal maximum/i)).toBeTruthy();
  expect(screen.queryByText(/releases formaldehyde/i)).toBeNull();
});

test('the printed dose is the batch figure — the sheet has no portion scope to follow', () => {
  // bottledSolutionGrams overrides the finished mass; the row must track THAT, and there
  // must be no way to make it track a Custom-amount portion instead.
  render(<BatchSheet data={lsSheetData({
    bottledSolutionGrams: 2000,
    preservative: { preservativeId: 'suttocide-a', preservativeDosePct: '1' },
  })} />);
  expect(screen.getByText('Preservative').closest('div')!.textContent).toContain('20 g');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @soap-calc/web -- src/components/BatchSheet.test.tsx`
Expected: FAIL — no `Preservative` text on the sheet.

- [ ] **Step 3: Implement the row**

Add to the core import in `BatchSheet.tsx`:

```tsx
import {
  lsPreservativeById,
  lsPreservativeDoseTier,
  preservativeDoseGrams,
} from '@soap-calc/core';
```

Above the `return`, beside the other derived values (near line 159):

```tsx
  // THE SHEET IS A BATCH DOCUMENT. It prints the batch's dose and says so — never the
  // Dilution panel's Custom amount portion. `dilutionScope` is session-only state that no
  // recipe file records, so a sheet that mirrored it would print one mass before a reload
  // and another after. bottledGrams is finishedProductGramsFor(...), the same expression
  // behind vm.finishedProductGrams that App hands the snippet in batch scope, so sheet and
  // panel cannot drift.
  const preservative = lsPreservativeById(settings.preservativeId);
  const preservativeDosePct = Number(settings.preservativeDosePct);
  const preservativeTier = lsPreservativeDoseTier(preservativeDosePct, preservative);
  const preservativeName =
    preservative?.label ?? (settings.preservativeCustomName.trim() || 'Custom preservative');
  const preservativeGrams =
    bottledGrams !== null && preservativeTier !== 'none' && preservativeTier !== 'impossible'
      ? preservativeDoseGrams(bottledGrams, preservativeDosePct)
      : null;
```

In the Dilution section, after the `≈ Bottled (with extras)` row (line 379-381):

```tsx
            {preservativeGrams !== null && (
              <div>
                <dt>Preservative</dt>
                <dd>
                  {preservativeName} · {preservativeDosePct}% ·{' '}
                  {formatWeight(preservativeGrams, weightUnit)} (whole batch)
                  {preservative?.addBelowC != null
                    ? ` — add after dilution, below ${preservative.addBelowC} °C`
                    : ' — add after dilution, once cooled'}
                  {preservativeTier === 'above-max' && preservative
                    ? `. NOTE: above the ${preservative.ceiling === 'eu' ? 'EU legal maximum' : "supplier's maximum"} of ${preservative.maxPct}%.`
                    : ''}
                </dd>
              </div>
            )}
```

- [ ] **Step 4: Run the sheet tests**

Run: `npm test -w @soap-calc/web -- src/components/BatchSheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/BatchSheet.tsx packages/web/src/components/BatchSheet.test.tsx
git commit -m "feat(ls): the sheet carries the preservative dose to the bench"
```

---

### Task 6: The browser guard

**Files:**
- Modify: `packages/web/e2e/ls-preservative.spec.ts:33-59`

**Interfaces:** Consumes the finished UI from Tasks 2-5.

- [ ] **Step 1: Rewrite the spec's assertions**

Replace lines 33-58 of `packages/web/e2e/ls-preservative.spec.ts`:

```ts
  // The anchor choice is pre-selected with its default dose seeded.
  await expect(page.getByLabel('Which preservative')).toHaveValue('suttocide-a');
  const dose = page.getByLabel('Dose (% of finished product)');
  await expect(dose).toHaveValue('1');

  const gramsOf = async (label: string) => {
    const dd = snippet
      .locator('.results-grid__item')
      .filter({ hasText: label })
      .locator('dd');
    return Number((await dd.innerText()).replace(/[^\d.]/g, ''));
  };
  const finished = await gramsOf('≈ Finished product');
  const doseGrams = await gramsOf('Preservative to add');
  expect(finished).toBeGreaterThan(0);
  expect(Math.abs(doseGrams - finished * 0.01)).toBeLessThanOrEqual(0.6);

  // THE CEILING IS A WARNING, NOT A CLAMP — the inverse of what this spec asserted before
  // 2026-08-09, and deliberately so. The alert still names the EU as the authority, but the
  // figure follows the dose the maker typed. Do not "restore" the old assertion.
  await dose.fill('2');
  await expect(page.getByRole('alert').filter({ hasText: 'EU legal maximum' })).toBeVisible();
  expect(await gramsOf('Preservative to add')).toBeCloseTo(doseGrams * 2, 1);

  // Custom… clears the dose and offers a name field.
  await page.getByLabel('Which preservative').selectOption('');
  await expect(dose).toHaveValue('');
  await expect(page.getByLabel('Name')).toBeVisible();
```

Update the file's header comment (lines 3-7) to describe the menu and the warn-don't-clamp rule.

- [ ] **Step 2: Run the browser spec**

Run: `npm run test:e2e -w @soap-calc/web -- e2e/ls-preservative.spec.ts`
Expected: PASS. (`test:e2e` is `playwright test`; `npm test` in that workspace is `vitest run` and does **not** cover e2e, which is why this step is separate.)

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/web/e2e/ls-preservative.spec.ts
git commit -m "test(ls): the browser guard follows the typed dose"
```

---

## Definition of done

- `npm test` exits 0: typecheck, oils validation, core, and the web suite (79 files, 1196 tests plus the ~25 added here).
- The Playwright preservative spec passes.
- No test was deleted to make another pass; the four inversions are rewritten in place.
- Manual: a custom preservative name and dose survive a page reload and appear on the printed sheet.
