# LS Additive Audit — Design Spec

**Date:** 2026-07-27
**Status:** Approved (brainstormed in-session after the LS-source additive review; user decisions recorded below)
**Packages:** `@soap-calc/core` (additives, insights, alternative-liquids), `@soap-calc/web` (AdditivesPanel, calculateAdditives, useRecipeViewModel, useFormulationInsights, splitLiquidSizing, SplitLiquidPanel copy)

## Problem

An LS-source review of the additive catalog (mirroring the HP audit, #130) found:

1. **Dose-basis blindness.** The book doses several LS additives against the **final diluted
   solution** (guar/HEC per the diluted soap; fragrance 0.5–3% *concentration*, 3% max;
   pearlizer 2–10% of solution; water-dispersible shea 1–25% of solution). The app has
   LS-only `solution` dose modes and correct downstream math, but catalog entries cannot
   declare a default basis and the pick handler always seeds `oil`. A user typing the book's
   "1%" guar gets 1% of oils ≈ 0.29% of solution at 35% concentration — a ~3.5× thickener
   under-dose that reads as "the feature doesn't work".
2. **LS dose divergences** (same class as #130's HP finding): sodium lactate LS typical
   3–5% TOW into the oils (envelope 1–10; base 0.5–2 @ lye); sugar LS 1–5% TOW, oils
   preferred (base 0.5–2 @ trace); salt LS 3–8% TOW at the start (base 0.05–1) with a
   bar-specific hazard tag ("crumbly") shown to LS users.
3. **Missing entries**: glycerin (20–25% TOW into the lye solution — the defining 30-HTLS
   additive; envelope 1–25), pearlizer (glycol stearate), water-dispersible shea; finished
   soap is HP-only but the LS source uses it identically.
4. **The #128 LS citric gate is half right.** The LS source endorses BOTH routes: post-cook
   citric to neutralize a lye excess (uncompensated — what the gate protects) AND citric
   into the lye solution at 1–3% TOW as a chelator-maker, explicitly with added lye
   (compensated). The blanket process gate blocks the second.
5. **Glycerin's second mode**: replace 1–2 parts of the lye-solution water with glycerin
   (e.g. lye:water:glycerin 1:1:2 from a 3:1 solution). USER DECISION: in scope for this arc.
6. **Ceiling interactions** (found while designing): LS sugar at the new 1–5% typical
   contradicts the 4% family ceiling (same as #130's HP case); glycerin at 20–25% TOW
   permanently trips `high_total_additives` (>10%).

**User decisions:** stage-aware citric gate — yes; all four new entries — yes; glycerin
lye-solution mode — in this arc (not backlog).

## Design

### 1 · Citric compensation becomes stage-aware (supersedes #128's process gate)

Rule: **acid-additive compensation applies to any line NOT dosed `after_cook`, in every
process.** Post-cook acid must never be compensated (it neutralizes existing soap/lye;
adding lye back is the documented failure) — that is a property of the *stage*, not of LS.

- `computeRecipeAdditives`: per-line — factors apply only when `line.addAt !== 'after_cook'`.
- `useRecipeViewModel`: pass `acidLyeRecipe` unconditionally again (drop the `process === 'ls'`
  ternary and its dep).
- Catalog: `citric-acid` loses `processes: ['cp','hp']` (offered everywhere);
  `processOverrides.ls = { typicalLow: 1, typicalHigh: 3 }` (the chelator-route dose).
  Entry comment rewritten: lye-stage citric is the compensated citrate-chelator route (all
  processes); after-cook citric is the LS lye-excess neutralization route and is never
  compensated — the stage decides.
- Note the improvement over #128 even for HP: an `after_cook` citric line under HP used to
  compensate (violating the never-add-lye-post-cook rule); now it cannot.
- AdditivesPanel empty-state: the citric parenthetical shows for every process again
  (remove the LS ternary from #128 fix 3).
- The `chelator` entry (pre-made citrate/gluconate, no lye consumption) stays at 1%.
- **Dilution stays on the BASE result (documented decision, found in spec review):** the LS
  dilution calc reads `result`, not `finalResult`, so a lye-stage citric line's compensation
  KOH is excluded from `anhydrousGrams`/`kohGrams`. That is correct, not an oversight: the
  compensation KOH is consumed by the citric to form potassium citrate — a dissolved
  non-soap salt — so it contributes no soap solids to the concentration model and no
  glycerin byproduct (0.55 g/g applies to saponified KOH only). Vinegar under LS behaves
  identically today (acetate). Record the rationale as a comment on the dilution memo.

### 2 · Dose-basis seam

- `AdditiveCatalogEntry.doseBasis?: DoseBasis` (absent = `'oil'`, today's behavior).
- `AdditiveProcessOverride` gains `doseBasis?: DoseBasis` and `hazards?: string[]`
  (override replaces the base hazards array when present).
- `effectiveCatalogEntry` merge covers the new fields (spread already does).
- `selectCatalog` seeds `basis: entry.doseBasis ?? 'oil'` exactly as it seeds `addAt`/`unit`.
- The typical-range hint becomes basis-aware: `% of oil weight` / `% of diluted solution`
  (ppt variants likewise).
- Data invariant (asserted in a test): entries/overrides with `doseBasis: 'solution'` are
  reachable only under LS (`processes: ['ls']` or an `ls` override), because solution dose
  modes are LS-only in the UI and `solutionGrams` is 0 outside LS.
- **Zero-basis guard (found in spec review):** `soapConcentrationPercent` defaults to '30',
  but a user can blank it — dilution goes null, `solutionGrams` falls back to 0, and
  `gramsFromDose(0, amount, unit)` returns 0 (not null), so every solution-based row
  silently renders 0 g. AdditivesPanel shows a per-row hint when `basis === 'solution'`,
  the amount is > 0, and the computed grams are 0: set the soap concentration (dilution)
  to size solution-based doses.

### 3 · Catalog data (LS overrides + new entries)

Overrides (base values unchanged):
- `sodium-lactate`: `ls: { typicalLow: 3, typicalHigh: 5, defaultStage: 'oils' }` (author-typical,
  matching the HP-override precedent of typical-not-envelope; envelope 1–10 in the comment).
- `sugar-sorbitol`: `ls: { typicalLow: 1, typicalHigh: 5, defaultStage: 'oils' }` (less browning
  than lye-stage).
- `salt`: `ls: { typicalLow: 3, typicalHigh: 8, hazards: ['past the salt curve it thins, not thickens'] }`
  (stage stays `lye`; comment notes the figure is the high-temp paste-suppression dose and
  cross-checks: 3–8% TOW ≈ 0.5–3% of final solution at ~35% concentration).
- `fragrance`: `ls: { typicalLow: 0.5, typicalHigh: 3, doseBasis: 'solution' }` (3% max; LS
  doses fragrance as concentration in the finished soap).
- `citric-acid`: per §1.

New entries:
- `glycerin` — "Glycerin", LS-only, 20–25% TOW, `defaultStage: 'lye'`. Comment: solvent /
  saponification + dilution accelerant / humectant; envelope 1–25% TOW; the
  parts-of-lye-solution mode is the split-liquid preset (§5).
- `pearlizer` — "Pearlizer (glycol stearate)", LS-only, 2–10%, `doseBasis: 'solution'`,
  `defaultStage: 'after_cook'` (melted; some products go in at trace — comment).
- `wd-shea` — "Water-dispersible shea", LS-only, 1–25%, `doseBasis: 'solution'`,
  `defaultStage: 'after_cook'`.
- `finished-soap`: `processes: ['hp', 'ls']`. Comment flags that the LS source doses it in
  absolute ounces; the 0.05–1% range carries over from the identical HP use (inference).

### 4 · Ceilings

- `sugar_total_high`: ceiling becomes `process === 'cp' ? 4 : 5` (LS joins HP at 5 — the LS
  source endorses 1–5% TOW). Message: the "~4%"/"~5%" figure follows the ceiling; yogurt
  stays in the copy except under HP (where the sum excludes it).
- `high_total_additives`: `totalAdditivePercentForInsights` excludes `glycerin` lines
  (documented like `excludeYogurt`): glycerin at 20–25% TOW is a deliberate solvent dose,
  not an "extras" load — counting it would make the warning permanent for every
  glycerin-method recipe.

### 5 · Glycerin lye-solution mode = split-liquid preset

The book's "1–2 parts of the lye solution" swap is exactly the split-liquid model
(part of the liquid budget delivered as another liquid, total constant):

- `ALTERNATIVE_LIQUID_GUIDE` gains `{ key: 'glycerin', label: 'Glycerin', waterFraction: 0,
  flags: ['solvent'] }`; `AlternativeLiquidFlag` gains `'solvent'`.
- **Floor check**: a solvent-flagged in-lye row counts its FULL grams toward the 1:1
  dissolution floor (hot glycerin dissolves lye — the glycerin-method's whole premise),
  while contributing 0 effective water everywhere else (`waterFraction: 0` handles that).
  Implementation: the vm's `lyeWaterStatus` memo adds solvent-row grams alongside
  `inLyeWaterGrams`. An info-level note in the panel copy: needs heat to dissolve fully.
- **Sizing**: `splitLiquidCalcOverride` currently gates budget modes to
  `waterMode === 'percent_of_oils'`. Extend the gate to also accept `lye_water_ratio`
  (LS's native mode). Mechanism — the override runs BEFORE the calc, so it cannot use lye
  grams; but under ratio mode the allocation is pure ratio arithmetic: a
  `percent_of_liquid` share p reduces the effective ratio, `settingsForCalc.lyeWaterRatio
  = N × (1 − p)` (water' = N(1−p) × lye; total liquid constant at N × lye — split, not
  discount). Row GRAMS (p × N × lyeGrams) are only known post-calc: resolve them against
  the computed result the same way the batch sheet reads other post-calc figures; if the
  current `resolveSplitLiquidRows` shape can't see the result, the row shows its share
  ("67% of liquid") pre-calc and grams once the result exists. `percent_of_liquid` then
  expresses the book's parts directly (2 of 3 parts = 66.7%).
- **Dilution advisory**: new info insight `glycerin_solvent_dilution` when an LS recipe
  carries a glycerin split row or glycerin additive: glycerin is a solvent — expect to need
  less dilution water / a higher effective concentration (no numeric model in the source;
  advisory only, no math change).
- Batch-sheet: the existing per-row split-liquid step machinery covers the new preset; the
  in-lye step copy for a solvent row notes heating to dissolve (no scorch caution — the
  method deliberately heats it; glycerin is NOT flagged `sugars`).

### 6 · FFA hint

The AdditivesPanel free-fatty-acid hint extends to LS with the LS figure:
HP "typically 5–8%", LS "typically 5–10%" of oils (the source's 30-HTLS range; lauric and
myristic named — as oils in the lye calc, corroborating #130's removal).

### Non-goals / invariants

- No preservative percentages (source gives none — PreservePanel stays dose-free).
- No borax, no polysorbate catalog entries (polysorbate 1:1-with-fragrance is technique
  copy, candidate for troubleshooting content later).
- No numeric dilution-water model for glycerin (source gives none).
- LS neutralization feature (`calculateNeutralization`, NeutralizePanel) untouched.
- Anonymity rule: numeric constants only; all copy original.
- `LATHER_SUPPORT_PACK` unchanged.

## Test plan

Core: stage rule (after_cook citric never compensates in any process; lye/trace/oils do);
citric offered under LS with 1–3; override merge with `doseBasis`/`hazards`; new entries
pinned (ranges, stages, bases, scoping); solvent flag on the glycerin preset; sugar ceiling
LS 4.5 silent / 5.5 warns; glycerin excluded from the extras total.
Web: pick seeds solution basis for pearlizer/wd-shea under LS; fragrance hint shows
0.5–3% of diluted solution under LS and 2–6% of oil weight under CP; salt hazard chip swaps
under LS; LS lye-stage citric raises the KOH result and shows the row hint; LS after_cook
citric changes nothing; FFA hint LS variant; glycerin split row passes the floor check via
solvent grams and yields the dilution advisory; `percent_of_liquid` sizing works under
`lye_water_ratio`.
Full suite + `tsc --noEmit` both packages + build + additive/split e2e groups.
