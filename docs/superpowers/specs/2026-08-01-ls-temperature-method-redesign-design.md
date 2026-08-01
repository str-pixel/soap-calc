# LS temperature & method redesign — one slider, method derived from heat

Date: 2026-08-01 · Status: approved for planning · Scope: liquid soap only; CP and HP untouched.
Source of truth: *UG2LS* extraction at `soap-calc-archive/books for research/LS_extracted/LS_reading_text.txt`
(cited below as `LS:<line>`). Design survived two independent adversarial reviews; all findings folded in.

## Problem

The four LS variant tabs (`ls-cpls`, `ls-lowtemp`, `ls-hightemp`, `ls-30min`) carry per-variant
temperature bands that were guesses (marked `unverified`) and are wrong against the source:
the low-temp slider (150–180 °F, default 170) sits above the source's entire 120–160 band and
cannot reach the recommended 140; both high-temp variants default to 198 °F, 17 °F below the
215 °F that defines the method; and the `180` in the code is a coconut-heavy safety *ceiling*
(LS:3291) misread as a general *floor*. Sequester applies one blanket 1–4-week window
(`LS_SEQUESTER`, an admitted interpolation) where the source publishes per-method figures.

## Decisions (user-fixed)

- LS only. Remove the four LS variant tabs entirely — one full temperature slider.
- The method (process-guide steps, sequester window) is **derived from the temperature**.
- Fresh LS recipe defaults to **150 °F**.
- Gap temperatures never block; guidance stays honest about them.
- No migration effort for old recipes beyond silent normalization.
- Companion change, decided separately, not covered here: polysorbate 80 catalog entry + PCSF insight.

## What the slider measures

The **sustained hold temperature** — the crockpot / heat-source setting maintained through
saponification and dilution — not the oil-melt temperature. This is the axis on which the source's
methods actually differ: CPLS applies **no sustained external heat** (LS:705, LS:708) yet melts its
oils at 120–130 °F before combining (LS:2118); LTLS holds 120–160 °F throughout (LS:705, LS:2255);
HTLS heats to and holds 215 °F+ through cook and dilution (LS:2363). Without this definition the
derivation misclassifies the book's own CPLS steps (a user melting oils at 125 °F is not "doing low
temp"). Panel copy states it, scoped correctly: *"CPLS melts oils at 120–130 °F first; heated
methods melt on the way up. This slider is the hold temperature."*

## Zone model

Slider range **60–220 °F**. 220 is the sourced ceiling ("not advisable to use any temperature above
220F", LS:2372). Three zones, always drawn; the zone owning the current temperature is highlighted.

| Region (°F) | Zone / owner | Basis |
|---|---|---|
| 60–100 | **Cold process** (ambient hold) | No sustained external heat (LS:705). The 100 boundary is an unsourced convention and is labeled as such. |
| 100–120 | gap → owned by **low temp** | Below the sourced band; copy says so. |
| 120–160 | **Low temp**, recommended sub-band 140–160 | LS:705, LS:2415; recommended 140–160 (LS:2255). |
| 160–215 | gap → owned by **high temp** | Everything the source does here is high-temp-family work: coconut-reduced HTLS 150–175 (LS:3542), 30-HTLS dilution 170–180 (LS:2859). Copy: "running the high-temp method below its 215 start — expect slower stage progression." |
| 215–220 | **High temp** (220 inclusive) | Start 215–220 (LS:2422, LS:2363, LS:2464). |

Gap ownership is an explicit table — there is **no** nearest-zone rule (a nearest rule puts 180 °F
in low temp, which contradicts the source). The 160–215 gap is a quarter of the slider and is the
most-seen state for exploring users; its copy is written as first-class content, not a fallback.

The panel edits in °C. Edges are **defined in °F** and markers positioned from °F. 100/120/140/160 °F
are °C-stable (38/49/60/71 round-trip exactly); 215/220 °F are not (215 → 102 °C → 216 °F back; the
highest °C-reachable stored value is 219 °F). Accepted: zone membership uses `>=`/`<` comparisons on
the stored °F value, so °C granularity affects which exact number is stored, never which zone owns it.
Note for posterity: LS:705 says "above 210F" for HTLS; 215 is the operative repeated instruction
(LS:2363, LS:2464) and is what the zone uses — recorded here so nobody "corrects" it later.

## Core: `lsMethodForTemp`

New pure function in `@soap-calc/core` (own module, mirroring `cook-stages.ts`):

```ts
type LsMethod = 'cold' | 'lowtemp' | 'hightemp';
type LsMethodInfo = {
  method: LsMethod;
  label: string;                     // "Cold-process LS", "Low-temp LS", "High-temp LS"
  inGap: boolean;                    // true in 100–120 and 160–215
  note: string | null;               // the honest gap copy, or null inside a zone
  sequester: { minWeeks: number; maxWeeks?: number };  // core-local shape (web's FinishDuration stays in web)
};
declare function lsMethodForTemp(tempF: number): LsMethodInfo;
```

Zone edges, gap ownership, labels, notes and sequester windows all live here and nowhere else.
Out-of-range input clamps to 60/220 (the slider already prevents it; the function stays total).

## Sequester

Per-method, single source of truth:

- Cold: **1–4 weeks** (`{minWeeks: 1, maxWeeks: 4}`, rendered "1–4 weeks" as today); the
  "3–4 weeks for best clarity" nuance lives in the cold-process guide copy, not the estimate
  (LS:2167).
- Low temp: **1+ weeks**, open-ended — only a floor is published (LS:2291).
- High temp: **1–2 weeks**, recommended (LS:2523). The "not mandatory — usable as soon as it has
  cooled" clause exists **only** in the 30-HTLS chapter (LS:2883) and is shown only when the
  30-minute package is detected (below) — not on high temp generally.

Mechanics: delete `LS_SEQUESTER`; `ProcessProfile.finish` becomes `FinishDuration | null` (null for
the single LS profile — same nullable pattern as its `temp` and `waterBand`); `estimateCure` accepts
an override window, and `useRecipeViewModel` passes `lsMethodForTemp(effectiveTemp).sequester` for
LS. `ResultsPanel` already renders `maxWeeks`-less durations ("1+ weeks"), so the open-ended low-temp
window needs no new rendering.

## Process guide

`ProcessGuidePanel` gains the effective temperature and additive-presence inputs (today it receives
only process + variant) and derives its LS content from `lsMethodForTemp`:

- Cold → CPLS steps; low temp → LTLS steps; high temp (including its owned gap) → HTLS steps.
- HTLS steps include the vessel mandate from the source's own step list: **≥2× total recipe
  volume, mandatory** (LS:2455); 3× for coconut-heavy (see insight below).
- LS guide-step content gets a core data home mirroring `HP_COOK_STAGES` (`cook-stages.ts`).

**30-minute detection.** The no-paste workflow is high temp plus its additive package; temperature
alone cannot distinguish it. Division of labor: `lsMethodForTemp` is temperature-only and knows
nothing of additives; the 30-min check is a web-layer predicate over the resolved recipe, and its
effects (guide note, sequester clause) are appended in web. Trigger: recipe contains glycerin — via the app's existing union of
split-liquid glycerin rows and the glycerin additive (`lsGlycerinSolvent` wiring) — **and** (salt
**or** sodium lactate). Sugar strengthens the match but never gates it. Verified against all twelve
30-HTLS recipes in the source (pages 488–511): every one carries glycerin + salt-or-sodium-lactate;
sugar varies (LS:3271 gives the definitional glycerin+salt pair; LS:2723's formulating guide gives
the salt-**or**-sodium-lactate alternative the predicate encodes; LS:2551 says the additives are
individually not mandatory). When detected, the high-temp guide shows the 30-min note and the sequester line adds the
usable-once-cooled clause.

## Coconut-heavy insight

New LS insight (reusing core `isCoconutHeavy`, lauric+myristic ≥ 55%): fires for coconut-heavy LS
recipes at hold temperature **≥ 150 °F regardless of zone**, so a user who complies (215 → 165 °F)
does not make their own safety guidance vanish. Copy, merging the sourced sub-cases explicitly:
*"Coconut-heavy liquid soap expands hard in a hot cook. If running the high-temp method, reduce the
hold to 150–175 °F (that range dips into the low-temp band on purpose) and use a vessel at least 3×
the total recipe volume; pure-coconut no-paste recipes should not start above 180 °F."*
Basis: LS:3542 (150–175 reduction, HTLS-paste), LS:3291 (pure-coconut 180 ceiling), LS:2455 /
LS:3542 (3× — the source states it against recipe volume and oil volume in different places; recipe
volume is the stricter reading and the one marked mandatory).

## Defaults and migration

- LS `defaultSettings`: `soapingTempF '95' → '150'` (displays as 66 °C), `processVariant → 'ls'`.
- `PROCESS_DEFINITIONS.ls.variants` collapses to the single `'ls'` profile
  (`temp: null`, `waterBand: null`, `finish: null`); `ProcessTabs` already hides single-variant
  processes, so the tab removal is free.
- Saved recipes holding `ls-*` variant ids normalize silently to `'ls'` through the existing
  unknown-variant path; `soapingTempF` is a separate field and is preserved. All historically
  storable LS temps (60–215) fit 60–220, so no clamp hints appear. No further migration (user decision).

## UI rendering

Three visual concepts on the slider, no more: **zone** (shaded region + label), **recommended
sub-band** (stronger shade inside low temp's 140–160), **gap** (unshaded; the derived-method note
renders beside the slider readout, not on the track). The current-temperature readout names the
derived method: "150 °F — Low-temp LS". `VERIFIED_TEMP_VARIANTS` hedging: the LS zones are now
source-verified; both copies of that set (ProcessGuidePanel and SoapingTemperaturePanel) update.

## Ripple checklist (complete — both reviews' findings folded in)

`packages/web/src/lib/process.ts` (variant union, LS definition/defaults, `soapingTempRangeFor`'s
`ls-cpls` special case → `'ls'` branch 60–220 default 150, `LS_SEQUESTER` deletion, nullable
`finish`); `cureEstimate.ts` (+ its test); `useRecipeViewModel.ts` (sequester override, insight
inputs); `ProcessGuidePanel.tsx` (+ new props from `App.tsx`, `VERIFIED_TEMP_VARIANTS`);
`SoapingTemperaturePanel.tsx` (markers, second `VERIFIED_TEMP_VARIANTS` copy, + test);
`core`: new `lsMethodForTemp` module + test, guide-step data home, coconut insight (+ golden
fixture regeneration). Tests asserting old variants: `process.test.ts`, `processDefinitions.test.ts`,
`processVariants.golden.test.ts`, `recipe.test.ts`, `recipeFile.test.ts`, `ProcessTabs.test.tsx`,
`ProcessGuidePanel.test.tsx`, `SoapingTemperaturePanel.test.tsx`; e2e: `exploratory.spec.ts:139`
(asserts the four LS variant tab labels today), plus an LS-tab pass.

## Testing

- `lsMethodForTemp` unit tests: every zone edge (100/120/160/215 at `>=`/`<` semantics), gap
  ownership both sides, sequester mapping per method, out-of-range clamping.
- 30-min detection: each sourced combination (glycerin+salt, glycerin+NaLac, glycerin alone → no,
  salt alone → no); via both glycerin paths (split-liquid row, additive).
- Coconut insight: fires ≥150 across zones, silent below, silent for non-coconut-heavy.
- Panel tests: markers render, readout names the method, gap note appears at 180.
- Golden/process tests reworked for the collapsed variant; e2e over the LS tab.

## Non-goals

CP/HP temperature models; old-recipe migration beyond normalization; the polysorbate 80 entry +
PCSF insight (separate, already-decided change); any numeric viscosity/salt-curve modelling.
