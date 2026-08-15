# Whole-App Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the eight defects a six-area whole-app review found, every one of which the green suite misses.

**Architecture:** Eight independent fixes, grouped into seven tasks by file so nothing conflicts. Two need a judgement call about *which* of two contradicting statements is wrong; the rest are mechanical.

**Tech Stack:** TypeScript, React 19.1, Vitest + @testing-library/react (jsdom), Playwright, npm workspaces.

## Global Constraints

- **Baseline green and must stay green.** `npm test` at `46636ac`: typecheck + oils validation (0 errors) + core 525 + oils-data 101 + web 1345. Plus **91/91** Playwright: `npm run test:e2e -w @soap-calc/web`.
- **Commits.** `AGENTS.md` forbids auto-commit unless explicitly asked; the per-task commits below run on the user's explicit choice of subagent-driven execution *for this run*.
- **Every finding needs a test that fails first.** All eight are invisible to a 1,345-test suite — a fix without a failing-first test has not been shown to fix anything. Show the RED output.
- **No existing test deleted or weakened.**
- Doses and concentrations are % w/w of the finished, ready-for-use product. Lye figures burn people; preservative ceilings are legal (EU Annex V).
- Probe files go in the scratchpad, never in `packages/` — a stray `*.test.ts` there is collected by the vitest glob. If you must render inside the package, create/run/delete in ONE command so an interruption cannot leave it behind.
- Run from repo root.

---

### Task 1: Ratio mode must not reject a reading and multiply by it

**Severity: highest.** A maker sees all three of these at once, verified by rendering:

```
⚠ Your paste already weighs more than the 4,000 g this target dilutes to, so it cannot be
  diluted to 30% at all — … check the measurement — if you weighed the crockpot, subtract
  the empty pot's own weight.
  Water to add at this ratio:  9,000 g          ← 4,500 × 2, from that same reading
  …uses your measured paste (4,500 g) … so the measurement is more accurate.
```

**Files:** `packages/web/src/components/DilutionPanel.tsx` (`:1401` alert guard, `:625` `ratioWaterGrams`, `:1627` caveat), its test.

**The judgement call, and the precedent.** Do **not** re-add a ceiling to `weighedOrComputedPotGramsFor`. That ceiling was deliberately removed: a target-derived bound has no business choosing the basis for a mode that has no target, and re-adding it reintroduces a bistability a fixed-point sweep already demonstrated (4,301 of 4,301 readings with two self-consistent answers).

The wrong statement is **the alert**, not the figure. "It cannot be diluted to 30% at all" is a claim about the saved *target*; ratio mode is not aiming at that target, it is aiming at a ratio, and its own "lands at N%" readout already tells the truth. This is the same call already made for gradual mode, where target-derived remedies naming absent controls were suppressed.

- [ ] **Step 1: Write the failing test.** In `DilutionPanel.test.tsx`, using the file's own `RESULT`/`BASE` fixtures: `dilutionMode="ratio"`, `waterPasteRatio="2"`, `measuredPasteGrams="4500"`, `cookWaterGrams={400}`, `wholeBatchPasteGrams={1600}`. Assert the screen does **not** simultaneously say "cannot be diluted" and "the measurement is more accurate". Then assert the positive: the ratio's own readout states where 2:1 actually lands.
- [ ] **Step 2: Run it — RED.** It fails today because both strings render.
- [ ] **Step 3: Extend the guard that already exists on the line.** `DilutionPanel.tsx:1401` reads:

```tsx
{measurementRejection.exceedsSolution && dilutionMode !== 'gradual' && (
```

Gradual is already excluded for exactly this reason. Add ratio to the same guard. Keep every
other rejection reason (below-solids, sub-tenth precision, non-positive) firing in all modes —
those are claims about the *pot*, true whatever the maker is aiming at.

There is a second gate on the same flag at `:2070`
(`!(measurementRejection?.exceedsSolution ?? false)`) — check what it suppresses and whether
ratio mode now needs the same treatment, rather than assuming it does or does not.
- [ ] **Step 4: Check the caveat still reads correctly** in that state, and that the batch-scope and portion-scope wordings both still hold.
- [ ] **Step 5:** Full suite + `npm run test:e2e -w @soap-calc/web`. Commit: `fix(ls): a ratio does not aim at the target the alert is about`

---

### Task 2: A mistyped post-cook superfat must not silently reserve nothing

**Severity: high — it changes the lye figure.** A row typed `200` (meaning `20`) contributes `0` to `pcsfSubtractPercent`, `cookFactor` stays `1`, and no lye is reserved — while the panel reports "200% allocated".

**Files:** `packages/web/src/components/SuperfatWaterPanel.tsx` (`setPcsfTotal` `:199`, `updatePcsfOil` `:166`; the inputs carry `max={50}`, an HTML hint that blocks nothing typed — 3 occurrences), `packages/web/src/hooks/useRecipeViewModel.ts` (`:212-221`), tests for both.

**Root cause, and what NOT to change.** `parsePercentOfOil` returns `null` above 100 (`core/src/additives.ts:488` → `parseDoseAmount`, ceiling 100 — verified). That is correct for the additives catalog, which surfaces a "Max 100%" hint on it. **Do not change core** — other callers depend on rejection.

The comment at `useRecipeViewModel.ts:206-221` says the clamp handles "several rows sum past 100". It does. What it misses is a *single row* over 100, which `parsePercentOfOil` rejects one step earlier so it never reaches the sum. Fix the reachability, and correct that comment — it currently asserts safety over the gap.

- [ ] **Step 1: Write two failing tests.** (a) In `useRecipeViewModel.test.tsx`, a `subtract`-mode recipe with one row at `'200'` must not produce the same lye as a recipe with no post-cook oil at all. (b) In `SuperfatWaterPanel.test.tsx`, typing `200` into the total must not leave the panel reporting it as allocated.
- [ ] **Step 2: Run them — RED.**
- [ ] **Step 3: Clamp at entry.** `setPcsfTotal` currently applies only `Math.max(0, …)`; give it and `updatePcsfOil` a ceiling of 100 so an out-of-range row is unreachable from the UI. The `max={50}` on the inputs is an HTML hint and blocks nothing typed.
- [ ] **Step 4: Guard the imported path too.** A recipe file can carry any string, so clamping the UI is not sufficient. In `normalizePostCookSuperfatOils` (`lib/recipe.ts`), clamp each row's percent into `[0, 100]` on load. **Verify** this does not disturb the existing legacy-migration tests.
- [ ] **Step 5: Rewrite the comment** at `useRecipeViewModel.ts:206-221` so it describes what is now guarded.
- [ ] **Step 6:** Full suite + e2e. Commit: `fix(ls): a superfat you cannot type is a superfat that is not silently dropped`

---

### Task 3: Cap the arrays that arrive inside settings

`parseRecipeFile` caps `lines` at 100 and `additives` at 50 — *"without a cap a malformed/hostile file … hangs the tab"*. `settings.splitLiquids` and `settings.postCookSuperfatOils` are the same shape one level down and are uncapped. **Verified: 50,000 rows import cleanly**, one React row each; a 200-line `lines` array is refused.

**Files:** `packages/web/src/lib/recipe.ts` (`normalizeSplitLiquids` `:192`, `normalizePostCookSuperfatOils` `:262`), `recipe.test.ts`, `recipeFile.test.ts`.

- [ ] **Step 1: Failing test** — a payload with 50,000 `splitLiquids` and one with 50,000 `postCookSuperfatOils`, asserting the normalized arrays are capped.
- [ ] **Step 2: RED.**
- [ ] **Step 3:** Cap both in `normalizeSettings`' helpers, so every load, import *and* localStorage draft is covered — not only the file path. Name the constants beside `MAX_RECIPE_LINES`'s reasoning and reuse its comment's logic. Truncate rather than reject: a self-export must still import.
- [ ] **Step 4:** Full suite. Commit: `fix(ls): the row caps reach the arrays nested in settings`

---

### Task 4: LS fragrance belongs after dilution, not at trace

**Files:** `packages/core/src/additives.ts` (the entry starts at `:182`), `additives.test.ts`.

Verified: `effectiveCatalogEntry(catalogEntryById('fragrance'), 'ls')` gives `stage=trace, basis=solution`. Every other solution-dosed LS entry is `after_cook`:

```text
fragrance          stage=trace        <-- odd one out
guar, hec, pearlizer, wd-shea, turkey-red-castor   stage=after_cook
```

Dosed as % of a finished solution that does not exist at trace, and the source places fragrance after dilution in all four of its procedures (CPLS, LTLS, HTLS, 30-minute HTLS) because these oils separate and cloud.

- [ ] **Step 1: Failing test** — a structural one, not a spot check: *every* catalog entry whose effective LS `doseBasis` is `'solution'` must default to `'after_cook'`. That pins the class, so the next solution-dosed entry cannot repeat it.
- [ ] **Step 2: RED** (fragrance fails).
- [ ] **Step 3:** Add `defaultStage: 'after_cook'` to the entry's `ls` override. Note in the comment why the basis and the stage travel together.
- [ ] **Step 4:** Full suite. Commit: `fix(core): fragrance is dosed against a solution that exists only after dilution`

---

### Task 5: Two controls announce something other than what they show

This app enforces Label-in-Name deliberately (see `DilutionPanel.tsx:1098`). Two controls break it, and their tests query the `aria-label`, so the mismatch is invisible.

| File | Visible | Announced |
|---|---|---|
| `SoapingTemperaturePanel.tsx:132-137` | "Starting temperature" | "Soaping temperature" |
| `PricingPanel.tsx:169-171` | "Price per" | "Output unit" |
| `PricingPanel.tsx:176-178` | "Price from" | "Pricing lever" |

- [ ] **Step 1: Failing tests** asserting each control's accessible name *contains* its visible caption. Use the `accessibleNameOf` helper that already exists in `DilutionPanel.test.tsx` rather than writing a new one.
- [ ] **Step 2: RED.**
- [ ] **Step 3:** Make each accessible name a superset of the visible text, the way the shared `SliderField` already does ("Superfat" → "Superfat %"). Prefer widening the aria-label over renaming visible copy — but if the visible caption is the weaker wording, say so and change that instead.
- [ ] **Step 4:** Update the three existing queries that use the old names (`SoapingTemperaturePanel.test.tsx:36,51,178`). Full suite + e2e. Commit: `fix(a11y): two controls say what they show`

---

### Task 6: Stop rounding a stored value to one decimal

`normalizePostCookSuperfatTotal` ends `String(Math.round(total * 10) / 10)` under a comment about *printing*. It runs on every load, export and import, so a typed `12.34` becomes `12.3` permanently. Verified: `12.34 → 12.3`, `12.37 → 12.4`, `5.25 → 5.3`.

**Files:** `packages/web/src/lib/recipe.ts` (the rounding is at `:323-324`), `recipe.test.ts`.

- [ ] **Step 1: Failing test** — `normalizeSettings({ postCookSuperfatTotalPercent: '12.34' })` keeps `'12.34'`; a round trip through `serializeRecipeFile`/`parseRecipeFile` keeps it too.
- [ ] **Step 2: RED.**
- [ ] **Step 3:** Keep the stored string faithful. A display rule belongs at the display, and the panel already formats its own readouts — **check that** before removing the rounding, and if some readout depended on it, move the rounding there rather than deleting it.
- [ ] **Step 4:** Full suite. Commit: `fix(ls): a stored figure keeps the precision the maker typed`

---

### Task 7: An unreadable draft must not vanish silently

A future-version or corrupt draft is parked at `<key>:unreadable` and the app presents a starter recipe **with no message**. Nothing ever reads that key — verified by grep. The maker sees a generic 1,000 g recipe where their work was, and the starter's first autosave lands ~500 ms later.

**Files:** `packages/web/src/lib/recipeStorage.ts` (`loadDraft` `:130`, `backupUnreadableDraft` `:97`), `packages/web/src/hooks/useRecipeStorage.ts` (`loadWorkspace` `:55`, `flashSaveMessage` `:116`), tests.

- [ ] **Step 1: Failing test** — a stored draft with `version: 99` must leave the app able to tell the user something happened, rather than silently returning starter state.
- [ ] **Step 2: RED.**
- [ ] **Step 3:** Surface it. `loadDraft` already distinguishes "absent" from "unreadable"; carry that distinction out to `loadWorkspace` and show it through the existing `flashSaveMessage` channel — do not invent a new UI. The message must say the recipe was kept, not merely that something failed.
- [ ] **Step 4:** Full suite + e2e. Commit: `fix(ls): a recipe we cannot read is not a recipe we lost`

**If surfacing it through `flashSaveMessage` turns out to need more UI than that channel offers, stop and report** rather than building a dialog this plan did not scope.

---

### Task 8: Guard the three unvalidated inputs in `lsPartialDilution`

Latent, not live: the one production caller passes a validated `DilutionResult`. But the exported signature takes a bare object, so the contract is narrower than the type. Verified: `anhydrousGrams: NaN` returns a **non-null** object with NaN paste/water figures beside a clean `solutionGrams: 1999.951`; `dilutionWaterGrams: Infinity` returns `predictedPasteGrams: 1200` where 1600 is right — a plausible wrong number with no NaN to notice.

The two guards that look like they cover it do not: `potAnhydrousGrams === null` never fires because `NaN !== null`, and `batchWaterGrams < 0` never fires because `NaN < 0` is `false`.

**Files:** `packages/core/src/ls-yield.ts` (signature `:114`; the two guards that cannot catch NaN are `:201` `potAnhydrousGrams === null` and `:238` `batchWaterGrams < 0`), `ls-yield.test.ts`.

- [ ] **Step 1: Failing tests** — NaN in each of `anhydrousGrams`, `totalWaterGrams`, `dilutionWaterGrams`, and `Infinity` in `dilutionWaterGrams`, each expected to return `null`.
- [ ] **Step 2: RED.**
- [ ] **Step 3:** Validate all three at the top, matching how every sibling input in this file is already checked. Note in the doc comment that the guards below cannot catch NaN, so this one has to.
- [ ] **Step 4:** Full suite. Commit: `fix(core): a partial dilution refuses what it cannot compute`

---

## Definition of done

- `npm test` green: typecheck, oils validation 0 errors, core and web both up by the new tests, none deleted.
- `npm run test:e2e -w @soap-calc/web` — 91/91.
- **Every task has a test that was seen failing before its fix.** Eight defects survived 1,345 tests; a fix whose test was never RED has not been demonstrated.
- Task 1 and Task 2 additionally verified by rendering/executing the maker-visible result, not only by unit assertion.

---

### Task 9: Gradual mode shows no warning at all above the solubility ceiling

**Added during execution of Task 1**, which is how it surfaced: fixing ratio's version of this
exposed that gradual has the same hole, and two independent renders confirmed it on `main`.

With a saved target above the solubility ceiling and a paste reading heavier than that
target's solution, `dilutionMode="gradual"` renders **zero alerts** — verified by rendering
all three modes side by side against one fixture (50% saved target, 40% ceiling, 3,000 g
reading, 2,400 g solution):

```text
concentration → 1 alert (the primary exceeds-solution alert)
ratio         → 1 alert (the solubility-ceiling sentence, after Task 1)
gradual       → 0 alerts
```

Gradual was excluded from the primary alert before this plan began, and the suppression at
`DilutionPanel.tsx:2070` evaluates identically for gradual before and after Task 1 — so this
is shipped behaviour, not something Task 1 caused.

**Files:** `packages/web/src/components/DilutionPanel.tsx` (`:2070`), its test.

- [ ] **Step 1: Failing test** — the three-mode fixture above, asserting gradual warns about a
  target above the solubility ceiling. Reuse Task 1's fixture rather than inventing one.
- [ ] **Step 2: RED.**
- [ ] **Step 3:** Apply the same treatment Task 1 gave ratio at `:2070`. Confirm by rendering
  that concentration mode's subsumption still holds — it must keep showing exactly one alert,
  not two.
- [ ] **Step 4:** Full suite + e2e. Commit: `fix(ls): gradual warns when the target is past what will dissolve`
