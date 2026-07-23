# Signal re-layout — adopt the "Soap Calc.dc.html" comp

**Date:** 2026-07-23
**Status:** Approved (design)
**Source:** claude.ai/design project `9baa28bc-4592-4ca4-86ce-2204cd56c5a0`, file `Soap Calc.dc.html`

## Context

The design project is a **derived mirror** of the shipping app — its readme states
"Intentional additions: None — component inventory matches `packages/web/src/components`
+ the class patterns in `index.css` exactly." The comp is therefore not a new visual
language; it is a **re-arrangement** of the existing Signal app, rendered as a simplified
single-file prototype with mock oils/calc.

Because the prototype drops real features (HP extras, LS dilution/neutralize/preserve,
troubleshooting, mold sizer, split liquid, dual-lye, post-cook superfat), a literal
implementation would delete working functionality. **This spec adopts the comp's
layout/visual changes only, preserving every existing feature.**

The user approved a **full re-layout (all changes A–E)** with Superfat/Water knobs moved
**left, per the comp**, plus two review fixes folded in (mobile order; shared error gate
stays in Results).

## Goal

Restructure the Recipe view to the comp's arrangement without regressing functionality,
accessibility, or the safety-critical prominence of the lye/water figures on small screens.

## Changes

### A. Column re-order & tint

Three columns keep their information-architecture identities but change position and tint:

| Visual position (desktop) | Column identity | Background | Panels (top → bottom) |
|---|---|---|---|
| Left | Formula (inputs) | paper `--bg` | Settings · **Superfat & water** (new) · Recipe oils `01` · Additives `02` · CP extras (cp-only) |
| Middle | The Bar | **tinted `--surface-2`** | Bar properties `03` · Fatty acid profile · Formulation insights · Process guide · Troubleshooting |
| Right | The Numbers | paper `--bg` | Results `04` · Dilution (ls) · Neutralize (ls) · Preserve (ls) |

The tint moves from today's middle (Numbers) to the new middle (The Bar), matching the
comp painting its properties column `--surface-2`.

**Mobile-order fix (review finding 1).** Keep the **DOM order unchanged from today**:
`formula → numbers → bar` (App.tsx renders `col--formula`, `col--numbers`, `col--bar` in
that order). This preserves today's small-screen stacking — inputs → **results** →
properties — so the safety-critical lye/water figures stay directly below the inputs rather
than being buried under the whole properties column (which is what the comp's raw order
would do). The visual desktop swap to the comp's *inputs · properties · results* is done
with CSS `order` at the 3-column width only.

Mechanism (finalize exact values in the plan):
- The current grid is `repeat(auto-fit, minmax(min(100%, 21rem), 1fr))`, whose 3/2/1-column
  transitions are intrinsic (container-width driven), so they can't be targeted precisely by
  a media query. Introduce an explicit **`@media (min-width: ~63rem)`** block that (a) is
  wide enough to guarantee 3 tracks and (b) is where the desktop order swap + edge gutters
  apply. Below it, natural DOM order and the existing `:first-child`/`:last-child` 3rem
  gutters stand (today's behavior); at ≤700px the existing symmetric 1.25rem gutters win.
- In that wide block: `.col--bar { order: 2 }`, `.col--numbers { order: 3 }` (formula stays
  `order: 0`) → visual formula · bar · numbers. Because the visually-last column is then
  `.col--numbers` (not the DOM `:last-child`, which is `.col--bar`), set the 3rem right edge
  gutter explicitly on `.col--numbers` and reset `.col--bar` back to the standard 2.4rem
  right padding in this block. Left 3rem gutter stays on formula (`:first-child`, unchanged).

CSS classes for tint: `.col--numbers` no longer carries the tint; `.col--bar` gets
`background: var(--surface-2)`.

### B. Extract "Superfat & water" panel

Move the editable Superfat slider + Water-method select + Water slider (today's
`editableNumbers` block and its local `SliderField`, `WATER_SLIDER_MAX`) **out of
`ResultsPanel`** into a new **`SuperfatWaterPanel.tsx`** placed second in the left column.

- New component owns: `SliderField` (moved verbatim), superfat slider, water-method select,
  water slider. Props: `settings`, `setSettings`, `process` (for `NEG_SUPERFAT_FLOOR` min
  and `waterModeChoicesFor`).
- `ResultsPanel` loses `settings`/`setSettings` props and the `editableNumbers` block; it
  becomes a pure figures readout.
- Panel title "Superfat & water", unnumbered (matches comp). Reuse `.numbers-inputs`
  styling; drop its bottom hairline/padding now that it is a standalone panel, not a header
  block atop Results.
- `SettingsPanel` subtitle currently reads "Superfat and the water ratio now live in
  The Numbers…" → update to reference the left column / the Superfat & water panel above.

**Accepted trade-off (review finding 2):** this separates the two most-touched knobs from
the Results figures they drive (the inverse of the note at `ResultsPanel.tsx:196`). User
accepted this consciously to match the comp.

**Shared error gate (review finding 3):** `inputErrors` from `calculateRecipe` is a
recipe-wide blocking list (superfat + purity + line-weight errors combined,
`calculateRecipe.ts:28-45`). It is **not** split into the new panel — it stays rendered in
`ResultsPanel` as today. The error text is self-identifying ("Superfat must be…"), so the
minor cross-column seam is acceptable and avoids a fragile field-partition of a shared list.

### C. Radar/Bars toggle in Bar properties

`PropertiesPanel` gains a two-tab toggle (`Radar` / `Bars`) styled like the comp's
`propTabStyle` (hairline `1px solid var(--text)`, ink-fill active, mono uppercase micro-type;
`role="tablist"`/`role="tab"`/`aria-selected`). Today the panel stacks radar **and** bars;
the toggle shows one visualization at a time.

- **Default: Bars** (not the comp's Radar default). Rationale: the accessible
  `role="meter"` property readings live in the bars markup; Bars is the information-complete
  view and today's behavior. `PropertiesPanel.test.tsx:119` only asserts `.property-radar`
  is *absent* on no-data, so a Bars default is test-safe.
- **A11y safety net:** when Radar is active, keep the six property readings present as
  `sr-only` (label + `role="meter"` value) so assistive tech and any value-reading tests
  never lose them behind the visual toggle.
- The no-data path (hint text, no radar) is unchanged and sits above/outside the toggle;
  the Iodine/INS index block and modeled-oils note stay above the toggle too.
- Local `useState` for the active view; default `'bars'`.

### D. Actions menu

New **`ActionsMenu.tsx`** dropdown replacing the four toolbar buttons (New · Export ·
Print batch sheet · Import), modeled on the comp's `ActionsMenu`:
- Trigger button (mono uppercase, chevron, ink-fill when open), `aria-haspopup="menu"`,
  `aria-expanded`; click-outside + Escape to close; `role="menu"`/`role="menuitem"` items.
- Wires to existing handlers: `inputs.handleNewRecipe`, `inputs.handleExportCommitted`,
  `handlePrintBatchSheet` (disabled when `!vm.batchSheetData`), and the hidden import
  `<input type="file">` (retained; "Import" item triggers `importInputRef.current.click()`).
- Undo/redo (`HistoryControls`) stay in the Recipe-oils panel header — unchanged.
- `saveMessage` status line stays in the toolbar.

### E. Panel numbering

Swap so numbers read top-to-bottom of the comp's reading order:
- Bar properties `04` → `03` (`PropertiesPanel.tsx:83`).
- Results `03` → `04` (`ResultsPanel.tsx` — all three render paths, lines 259/276/328).
- Recipe oils `01`, Additives `02` unchanged. All other panels stay unnumbered.

### Pricing view

The Pricing view keeps its real content (`ResultsPanel` batch figures + `PricingPanel`).
Only the tint is realigned to the comp's pricing screen: tint the **left** column (the
batch-cost/results side) `--surface-2`, right column paper. This is a class swap on the two
pricing-view `.col` wrappers; no functional change.

## Components

**New:**
- `src/components/SuperfatWaterPanel.tsx` (+ `.test.tsx`)
- `src/components/ActionsMenu.tsx` (+ `.test.tsx`)

**Changed:**
- `src/App.tsx` — column DOM/markup re-order, render `SuperfatWaterPanel`, `ActionsMenu`,
  move panels into their new columns, drop superfat/water props to `ResultsPanel`.
- `src/components/ResultsPanel.tsx` — remove `editableNumbers`/`SliderField`/settings props;
  renumber to `04`.
- `src/components/PropertiesPanel.tsx` — add Radar/Bars toggle + sr-only readings; renumber
  to `03`.
- `src/components/SettingsPanel.tsx` — update subtitle copy.
- `src/index.css` — retarget tint (`.col--bar`), add wide-width `order` swap, pricing-view
  tint swap, `SuperfatWaterPanel` panel spacing, toggle + actions-menu styles.

## Testing

- **Unit (Vitest):** new `SuperfatWaterPanel.test.tsx` (superfat edit, LS negative min,
  water-method field swap, empty-recipe reachability — migrated from `ResultsPanel.test.tsx:34-79`);
  new `ActionsMenu.test.tsx` (open/close, each item fires its handler, Print disabled state);
  update `ResultsPanel.test.tsx` (remove the moved-block tests, keep figures tests);
  update `PropertiesPanel.test.tsx` (toggle default Bars, switching shows radar, sr-only
  readings present in Radar mode).
- **App tests:** `App.test.tsx` / `App.pricing.test.tsx` — confirm headings still resolve
  (`getByRole('heading', …)`), Actions menu items reachable.
- **e2e (Playwright):** run full suite. Expected-safe: heading set at `exploratory.spec.ts:85`
  (all preserved + new "Superfat & water"), `getByLabel('Superfat %' | 'Water method')`
  (location-agnostic), mobile-overflow at `:98`, beeswax no-data at `:694`. The toggle is the
  main watch item — Bars default + sr-only net should keep value reads green.
- TDD: write/adjust the failing tests before each component change.

## Out of scope (explicitly NOT done)

The comp's omissions are **not** implemented as deletions: HP CP-extras, LS dilution /
neutralize / preserve, troubleshooting, mold sizer, split liquid, dual-lye, and post-cook
superfat all remain. No copy rewrites beyond the SettingsPanel subtitle. No token/color
changes (palette is already shared). No changes to `@soap-calc/core` math.
