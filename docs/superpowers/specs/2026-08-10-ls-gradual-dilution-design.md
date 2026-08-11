# Gradual Dilution, and a Preservative Dosed From What You Actually Poured — Design Spec

**Date:** 2026-08-10
**Status:** Awaiting review (brainstormed in-session; user decisions recorded below)
**Packages:** `@soap-calc/web` (DilutionPanel, PreservativeSnippet, App, lib/recipe, BatchSheet), possibly `@soap-calc/core` (dilution helpers)

## Problem

The preservative dose is a % of `dilution.solutionGrams`, which is **predicted, not measured**:
`solutionGrams = anhydrousGrams ÷ soapFraction`. That is correct arithmetic for a maker who
dilutes *to a target* — but it is not how the source's first method works, and the app
supports no other.

The book gives three ways to determine dilution water, "in order of precision" (LS:1529):

| Method | Source | In the app before this change |
|---|---|---|
| **Gradual Dilution** | LS:1531 — *"add enough water to cover your paste… continue to add water in small increments until you have reached the desired consistency"* | **No** |
| **Ratio Dilution** | LS:1534 — water:paste 1:1 / 2:1 / 3:1, and *"start at 1:1 and then slowly add more water as required"* | Yes (`dilutionMode: 'ratio'`) |
| **Soap Concentration** | LS:1536 — the anhydrous-based calculation | Yes (`dilutionMode: 'concentration'`) |

The app implements the two precise methods and omits the imprecise one — which is exactly
the method where the finished mass **cannot be known in advance**, and therefore the one
where a maker most needs the app to hold the number for them.

The source already prescribes the missing input, inside the Gradual Dilution passage:

> *"You may want to record how much water you started with and how much additional water
> you added. This will help you better estimate how much water is needed for the next time
> that you make the same or similar recipe."* — LS:1531

**The consequence for the preservative.** Dilute to consistency rather than to a target and
your real finished mass differs from the predicted one. Dose from the prediction and the
dose is wrong by the overshoot — and the dangerous direction is undershooting the water,
which raises the concentration and pushes a % of the *predicted* mass past the EU ceiling
in the bottle that actually exists. This is the same class of error as the fixed
batch-mass-used-for-a-portion bug recorded in `PreservativeSnippet`'s own prop doc.

**User decisions (this session):**

| Question | Decision |
|---|---|
| What the maker types | **Water actually added** — the book's own instruction — not a measured finished weight |
| Preservative placement | **Nested inside the Dilution panel**, so the dose cannot be separated from the figure it doses against |
| Persistence of the recorded water | **Saved with the recipe** — a figure that must "always be shown" cannot vanish on reload, and it is the basis of a dose that is itself recipe state |
| Scope | **Both** whole-batch and Custom amount |

## Design

### 1 · A third dilution mode

`dilutionMode` gains `'gradual'` beside `'concentration'` and `'ratio'`, offered in the
Dilution panel's existing mode radiogroup and labelled for the method the book names.

### 2 · Whole-batch gradual: record water, derive everything

**Input:** one field, *Water added so far (g)*. The paste weight is **shown, not typed** —
the app already has it as `wholeBatchPasteGrams`, which is
`anhydrousGrams + cookWaterGrams + splitLiquidSolidsGrams`
(`useRecipeViewModel.ts:442-446`) — an alternative liquid's non-water solids are real mass
in the pot and are counted.

**Which paste, when the maker has weighed theirs.** `wholeBatchPasteGrams` is a *computed*
figure; a measured-paste reading does **not** flow into it (verified — the measurement is
applied separately, through `correctedDilutionWaterGrams` and the `lib/measuredPaste`
helpers). Gradual must therefore choose explicitly, and it chooses the **measurement when
one is present and passes `measuredPasteRejectionFor`**, because a maker recording water
poured into a pot they weighed is describing that pot, not the model of it. When there is
no reading, or the reading is rejected, gradual falls back to the computed figure and the
readout says which of the two it used — the same name-your-basis discipline as
`basisScope`.

```text
paste        = wholeBatchPasteGrams          (shown)
finished     = paste + waterAdded            (shown — "Finished so far")
concentration = anhydrousGrams / finished    (shown — "Lands at N% soap")
```

**The write-back is what makes this cheap.** Gradual derives a concentration and writes it
into `settings.soapConcentrationPercent`, exactly as ratio mode already does
(`DilutionPanel.tsx:329-331`, gated on `ratioTouched && dilutionMode === 'ratio'`; gradual
gets the equivalent gate). That single figure is what every downstream consumer reads, so
the preservative dose, the batch sheet and the insights all follow the recorded mass with
**no new dose basis and no new plumbing**.

The arithmetic closes exactly:

```text
solutionGrams = anhydrous ÷ concentration
              = anhydrous ÷ (anhydrous / (paste + water))
              = paste + water                       ← precisely what was poured
```

**Rounding is worse than it looks — measured, not estimated.** Ratio mode writes back at
**one decimal place** (`Math.round(x * 10) / 10`, `DilutionPanel.tsx:272-273`). Running
`calculateDilution` over four water amounts on a 1,041 g-anhydrous / 1,423 g-paste batch:

| Water added | Finished (recorded) | Exact | Drift at 0 dp | at 1 dp | at 2 dp |
|---|---|---|---|---|---|
| 1,777 g | 3,200 g | 32.5313% | **−45.5 g** | +3.1 g | +0.1 g |
| 2,000 g | 3,423 g | 30.4119% | **+47.0 g** | +1.3 g | +0.2 g |
| 2,536 g | 3,959 g | 26.2945% | **+44.8 g** | −0.8 g | +0.7 g |
| 3,111 g | 4,534 g | 22.9599% | −7.9 g | −7.9 g | −0.0 g |

So: **gradual writes back at 2 dp**, not ratio's 1 dp. At 1 dp the recovered mass can sit
~8 g from what was poured, which is a visible discrepancy on screen and a real shift in the
preservative dose; 2 dp keeps it under a gram for no cost.

Even at 2 dp the two numbers are not identical, so the panel prints **"Finished so far"
from the raw inputs**, never from `dilution.solutionGrams`. Two figures shown as the same
number must be the same number.

**Clamp, don't refuse.** An extreme record can round the concentration outside
`calculateDilution`'s accepted `(0, 100)`. Ratio already solved this: it clamps what gets
**written** to `[1, 99]` while the readout keeps telling the truth, and flags that it did
(`ratioWriteBackClamped`, `DilutionPanel.tsx:280-286`) — because writing an out-of-range
value sends `dilution` to null upstream and vanishes the entire panel that the maker would
need in order to fix it. Gradual takes the identical approach.

**The re-entry guard is not optional.** `DilutionPanel.tsx:170-179` resets `ratioTouched` on
every `dilutionMode` change, and its comment records the bug that forced it: with the guard
absent, leaving ratio mode to type an exact target and then returning to ratio *without
touching the ratio field* re-fired the write-back and silently reverted the typed value,
"with no visual difference and no undo". Gradual introduces a second derived mode and needs
the identical `gradualTouched` reset, or it reintroduces that bug on a new axis.

### 3 · Custom amount gradual: report, never write back

A maker diluting a weighed-out draw gradually needs different inputs, because the portion
is sized by target volume today and its paste is derived rather than weighed:

**Inputs:** *Paste weighed out (g)* and *Water added so far (g)*.

```text
portionFinished      = portionPaste + portionWater
portionAnhydrousShare = portionPaste × (anhydrousGrams / wholeBatchPasteGrams)
portionConcentration = portionAnhydrousShare / portionFinished
```

**This branch must NOT write back to `settings.soapConcentrationPercent`.** The saved
concentration is the *recipe's* target for the batch; a maker who dilutes one jar thinner
than the batch target has not redefined the recipe. Portion gradual therefore feeds only
the portion's own readouts and the portion's preservative dose — which is already how
portion scope behaves, since `preservativeBaseGrams` takes the portion's `solutionGrams` in
that scope.

Consequence to state plainly in the UI: in Custom amount gradual, two concentrations
coexist — the recipe's target and the jar's actual — and each readout must name which it
is, in the same discipline as `basisScope`'s "(whole batch)" / "(custom amount)" labels.

### 4 · Always show the water

Per the user's requirement, in gradual mode these three are first-class readouts, never
hidden intermediates:

- **Water added** — the figure the maker recorded
- **Finished so far** — paste + water, from the raw inputs
- **Lands at N% soap** — the concentration that implies

They render in the Dilution panel's own results area and, in whole-batch gradual, on the
batch sheet: a line recording the water added and the finished mass it produced, so the
page carried to the bench states what was actually poured rather than what was predicted.

### 5 · The preservative nests inside Dilution

`PreservativeSnippet` moves from a sibling `<details>` beneath the Dilution panel to a
disclosure **within** it, after the dilution figures. The dependency becomes structural: the
dose cannot be separated from the mass it is a percentage of, which is what happened when
the panel was moved beside Additives on 2026-08-09 and moved back the next day.

**Nesting is not free, and the obvious way is the wrong way.** The snippet takes 9 props;
`DilutionPanel` already takes 20. Threading the six it does not already have would take
that panel to 26 and make the app's largest component newly responsible for preservative
concerns it has no reason to know about.

Instead **`App` renders the snippet and passes it down as a single node prop** — e.g.
`preservativeSlot?: ReactNode` — which `DilutionPanel` places after its dilution figures
without knowing what it is. One prop, no new coupling, and the preservative's own wiring
stays where it already lives. The snippet's own props are genuinely unchanged.

The comment at `App.tsx:562` recording *why* the placement matters moves with it, and
should now say the adjacency is enforced structurally rather than by convention.

### 6 · Persistence

| Field | Where | Why |
|---|---|---|
| `gradualWaterGrams` | **`RecipeSettings`** (recipe state) | Must always be shown, so it must survive a reload; and it is the basis of a preservative dose that is already recipe state |
| portion paste weighed / portion water added | **session-local in `App`** | Consistent with every other portion input (`portionTargetMl`, `measuredPasteGrams`), which are deliberately bench figures that must not dirty a saved recipe |

`normalizeSettings` coerces `gradualWaterGrams` with `settingString`, defaulting to `''`.
An absent field on a legacy recipe means no gradual record, which is correct.

`dilutionMode` itself stays session-local, as it is today.

### 7 · Edge cases

- **Blank water** → gradual mode is inert: no derived concentration, no write-back, the
  panel asks for the water. It must not write a concentration of `anhydrous / paste` and
  silently retarget the recipe the moment the mode is selected.
- **Zero water is a RECORD, not a blank** — the pot before any dilution, which is where the
  reference's own method starts. It derives a concentration and writes back like any other
  amount. An earlier draft of this bullet said "blank or zero", contradicting §2's ladder and
  the core test that blesses zero explicitly. The code always kept them apart; this section
  was the thing that was wrong.
- **A concentration outside `calculateDilution`'s accepted range** (`<= 0` or `>= 100`) →
  **clamp what is WRITTEN** to `[1, 99]` and flag it, keeping the readout truthful — never
  refuse. Ratio mode already solved this and gradual copies it. An earlier draft said "refuse
  and say so", which §2 already contradicted; refusing means writing back a value that makes
  `calculateDilution` return
  `null` and blanks the whole panel.
- **Water so large the concentration rounds to 0** → same refusal path.
- **Switching modes** must not silently discard the recorded water; leaving gradual keeps
  the value for a return, exactly as `waterPasteRatio` survives a mode switch today.

## Testing

- Core/lib: the gradual arithmetic — `finished = paste + water`, the derived concentration,
  and the round-trip property that `solutionGrams` recovers `paste + water` before rounding.
- Panel: the three readouts render in gradual mode; blank water is inert; an out-of-range
  concentration is refused rather than written back; whole-batch gradual writes back and
  portion gradual does **not** (the guard test for §3).
- Preservative: with gradual water recorded, the dose is a % of `paste + water`, not of the
  previous target's predicted mass.
- Settings: `gradualWaterGrams` defaults, coerces, and round-trips through export/import.
- Batch sheet: the water line prints in whole-batch gradual and is absent otherwise.
- E2E: record water in gradual mode, confirm the finished figure and the preservative dose
  both follow it.

## Out of scope

- Recording each increment separately. The source suggests noting the starting water and the
  additions; this design records their **total**, which is what the dose needs. A running
  log is a larger feature and is not required to make the dose correct.
- Any change to the preservative table, the dose ladder, or `preservativeSetByUser`.
- Viscosity or consistency guidance — the app does not model consistency, and the source's
  stopping condition ("desired consistency") is the maker's judgement, not a computed one.
