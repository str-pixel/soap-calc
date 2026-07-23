# Workability estimate (unmold / cut / stamp) — design

**Date:** 2026-07-23
**Status:** Approved design, pending implementation plan
**Feature:** Predict a cold-process soap's early workability timeline — when it can be
unmolded, cut, and stamped — from the recipe's oils and levers, rendered as honest,
labeled-heuristic ranges.

## Problem & motivation

Soapmakers plan their day around *when a batch is workable*: some recipes need to
unmold in ~8 hours so the loaf can be cut and logo-stamped the same day; others (high
olive) stay in the mold for 1–2 weeks. The app already computes everything that drives
this (a hardness score, lye concentration, superfat, additives) but exposes no estimate.
Current unmold signalling is a hardcoded `usableAtUnmold = process === 'hp'` boolean in
`packages/web/src/lib/cureEstimate.ts` — a process flag meaning "cured enough to *use* at
unmold," which is a distinct concept from *releasability* and is left unchanged (see D5).

Goal: a recipe-chemistry-driven **workability timeline** — unmold → cut → stamp — that is
useful for planning (including the fast, same-day case) without pretending to a precision
the chemistry cannot support.

## Feasibility summary (from research)

- **Oil composition is the dominant, defensible driver.** SoapCalc's "Hardness" number
  (`lauric + myristic + palmitic + stearic`) is explicitly defined as predicting "how
  relatively easy it will be to unmold." Anchors: 100% olive (score ≈14) → 1–2 weeks;
  ~60% hard oils (score ≈44) → next day; ≥30% hard oils → quick, easy unmold.
- **It cannot be reliable to the hour.** Mold type (plastic can add ~10 days vs
  silicone/wood), gel phase, superfat, water content, sodium lactate, and room
  temperature all move the real moment. No validated quantitative unmold-time formula
  exists; all field guidance is banded heuristics. Therefore: **wide ranges + a
  confidence tag + a caveat**, never a single "ready in N hours" number.
- **Cut and stamp are distinct milestones.** Cut needs firm-not-dragging; stamp needs a
  *window* — "firm to the touch but still slightly soft inside" (cold butter / firm
  playdough / cheddar). Too soft → smears/warps; **too hard / over-cured → cracks,
  stretch-marks, and faint impressions.** Hard oils reach the stamp state sooner; the
  window closes as the bar keeps hardening.

Sources: classicbells (Soapy Stuff) SoapCalc-numbers critique; Bramble Berry / Soap Queen
unmolding + sodium-lactate guides; RusticWise unmold-speed; Soap Legacy hard-oil ratios;
craftedsurprise & houseoftomorrow stamping-timing posts; lilswatara stamping guide.

## Scope

- **CP:** full chemistry timeline — unmold, cut, stamp-open — modulated by a new
  three-state CP **gel** control (see D1).
- **HP:** fixed short unmold/cut band (its cook/gel is intrinsic); stamp shown as a
  texture-dependent note, no chemistry window.
- **LS:** no estimate (diluted to liquid, never molded as a bar) — returns `null`, UI omits
  the whole block.

### Explicitly out of scope (YAGNI)
- No per-mold-type input or soaping-temperature input; those effects stay in caveat text.
- No numeric stamp-window *close* edge (see decision D2).
- No change to the existing cure-week estimate, label-weight math, or `usableAtUnmold`
  boolean; this feature only *adds* a workability block (see D5).

## Key decisions

- **D1 — CP gets a three-state gel control.** A new persisted `gelMode`
  (`'none' | 'natural' | 'forced'`) feeds the CP timeline as a multiplier: `none`
  (gel prevented, e.g. refrigerated) slower, `natural` baseline, `forced`
  (insulated / CPOP) faster — the lever that reaches the fast ~8 h end. Lives in the CP
  extras panel (the CP-only home that already discusses gel). This supersedes the earlier
  "HP-only" idea. The existing "gel phase is optional — it changes look, not safety" myth
  line is reworded: gel doesn't change *safety*, but it does change how fast the bar firms
  and unmolds. HP remains fixed (its cook/gel is intrinsic, not user-selectable).
- **D2 — Stamp window: open edge only.** Both edges are real and sourced (over-hardening
  causes shallow imprints and edge cracks — documented, not inferred). But the *close* timing
  is not quantifiable to the hour, and there are two legitimate schools (stamp-fresh at cut
  vs. stamp-firm a day or more later). So the open edge is a modeled **range** and the close
  is a **qualitative caveat**, not a number.
- **D3 — Output is a range + confidence, never a single day/hour.** Unit-adaptive display.
- **D4 — Confidence is never "high."** Default moderate; drops to low under 80% FA coverage;
  `null` when there is no usable FA data.
- **D5 — `usableAtUnmold` is left untouched.** It means "cured enough to *use* at unmold"
  (an HP trait), which is distinct from *releasability*. `cureEstimate` only *adds* a
  `workability` field; the existing boolean and finishing-label logic are unchanged, so their
  tests stay green as-is.

## Model

All math is computed internally in **hours** as a single deterministic pipeline. Every
constant below is a concrete default living in one tunable block (a JSDoc-annotated
`WORKABILITY_TUNING` object, the way `trace-speed.ts` documents "no verified constant"); the
`~` notation is reserved for prose. **One composition model only: every modulator is a
multiplier, composed by multiplication.** (This is the key deep-review fix — an earlier draft
mixed a "days-subtracted" sodium-lactate into a multiplicative pipeline, which drove the fast
case negative.)

### Inputs
- `hardnessScore` — the recipe `hardness` property from `packages/core/src/properties.ts`
  (sum of lauric+myristic+palmitic+stearic + long-chain saturates + elaidic; a 0–100-ish
  percentage sum, guide band 29–54). Clamped to `[0, 60]` before the band lookup.
- `faCoverage` — the `coveragePercent` (0–100) from the same result; drives the confidence /
  null gate. Threshold constant is `LOW_COVERAGE_PERCENT = 80` (from `properties.ts`).
- `lyeConcentrationPercent` — computed on the lye result; `superfatPercent` — **from
  `settings.superfatPercent`** (a string to parse), *not* the lye result (it is only an input
  field there). Both types live in `packages/core/src/lye.ts`.
- `process` — `'cp' | 'hp' | 'ls'`.
- `gelMode` — `'none' | 'natural' | 'forced'` (CP only; ignored for HP/LS; an unrecognized
  value defaults to `'natural'`).
- `additives` — `ReadonlyArray<{ id: string; dosePercent: number }>` where `id` is the
  catalog id and `dosePercent` is % of oil weight. **The recipe does not store this shape**
  (see Architecture → additive adapter); it is derived before the call.

### Gate order (runs first)
1. If `process === 'ls'` → return `null`.
2. If any numeric input is non-finite (`hardnessScore`, `faCoverage`, `lyeConcentrationPercent`,
   `superfatPercent`) → return `null`.
3. If `process === 'hp'` → return the fixed HP band (below). **HP is never gated by coverage.**
4. CP only: if `faCoverage <= 0` → return `null` (no usable FA data). This is the *only*
   null-for-CP condition; a valid all-unsaturated recipe (`hardnessScore ≈ 0`, coverage high)
   is **not** null — it is a legitimate ~2-week bar.
5. Confidence (CP): `'low'` when `faCoverage < 80`, else `'moderate'`. Never `'high'`.

### CP base band (Natural-gel baseline)

The bands represent a **naturally-gelled loaf** (`gelMode: 'natural'`, the default). Rows are
**half-open, top-down** (no double-counted boundary), and each carries explicit hours — the
single source of truth from which display labels are derived:

| Hardness (clamped 0–60) | `baseUnmold` min–max |
|---|---|
| `>= 45` | 12–36 h |
| `>= 38 && < 45` | 36–72 h |
| `>= 30 && < 38` | 72–120 h |
| `>= 22 && < 30` | 120–192 h |
| `< 22` | 192–336 h |

Bands are contiguous (each row's max = the next row's min), so crossing a boundary is a small
step, not a days→weeks cliff. (Top row widened to 12–36 h per review: the common trinity
≈47 unmolds ~24 h–1.5 d at natural gel, not 12 h — 12 h needs the fast levers.)

### Modulators (all multiplicative; neutral = 1.0 at the CP defaults)

Baseline recipe (lye conc 33%, superfat 5%, `natural` gel, no additives) → composite ×1.0.
Each factor is piecewise-linear through explicit knees, **clamped flat outside the stated
range** so no input runs away:

- **Gel** (categorical): `none` = 1.30, `natural` = 1.00, `forced` = 0.55.
- **Lye concentration %** (3-point, neutral knee at the 33% default): `(25 → 1.30)`,
  `(33 → 1.00)`, `(40 → 0.78)`; flat outside [25, 40]. (Wider spread than the first draft so
  water carries real weight at the soft end, per review.)
- **Superfat %** (3-point, neutral knee at 5%): `(2 → 0.90)`, `(5 → 1.00)`, `(10 → 1.20)`;
  flat outside [2, 10].
- **`sodium-lactate`** (dose % of oil, clamped [0, 3]): `(0% → 1.00)` → `(3% → 0.90)`, linear.
  As a multiplier it saves proportionally — ~1.4 days off a 2-week bar, a couple of hours off
  a same-day bar — which matches the field "1–2 days earlier" guidance where it is cited.
- **`salt`** (dose % of oil, clamped [0, 1]): `(0% → 1.00)` → `(1% → 0.90)`, linear.

`composite = gel × lyeConc × superfat × sodiumLactate × salt`.

### Pipeline (deterministic order)

1. `baseUnmold` = band lookup (min, max hours).
2. `m = composite` (each factor clamped as above).
3. `unmold = { min: baseUnmold.min × m, max: baseUnmold.max × m }`.
4. **Floor each edge** to `ABSOLUTE_FLOOR_HOURS = 4` (no hard value cap — see step 5 and the
   display ceiling). The band floor (12 h) is *pre-modulator only*; modulators may push below
   it down to 4 h — that is how forced gel + discount + sodium lactate reaches ~8 h.
5. **Minimum band width:** if `unmold.max < unmold.min × 1.5`, set `unmold.max = unmold.min ×
   1.5`. Guarantees D3 (never a single-point band). *(This is why there is no hard value cap:
   an earlier draft capped both edges at 336 h, which collapsed the slow case to a
   single-point 336–336 h band and broke this rule — verified by a fuzz over 25 200 inputs.
   The 2-week ceiling is applied at **display** time instead, below, leaving internal widths
   and ordering intact.)*
6. `cut = { min: unmold.min + BUFFER_HOURS, max: unmold.max + BUFFER_HOURS }`,
   `BUFFER_HOURS = 4`, added **after** flooring so it never scales away or vanishes.
7. `stamp = { opensMinHours: cut.max, opensMaxHours: cut.max × 1.3 }` — a *range for when
   stamping becomes possible* (not a scalar). You cut first, so it starts at `cut.max`; the
   ×1.3 spread reflects firmer-is-cleaner without asserting a hard close (the over-hardening
   **close** stays a qualitative caveat, D2).
8. Ordering is guaranteed by construction (`cut = unmold + positive buffer`;
   `stamp.opensMin = cut.max ≥ cut.min`), compared per-edge; overlap between unmold and cut is
   expected and allowed. Monotonic non-decreasing in hardness (verified by fuzz).

**Worked fast case (verified):** hardness ≥45 → base 12–36 h; forced gel 0.55 × lye@38%≈0.84
× superfat@3%≈0.93 × SL@3% 0.90 ≈ composite 0.39 → 4.7–14.0 h → **≈5–14 h**, cut ≈9–18 h,
stamp opens ≈18–23 h — the ~8 h unmold-and-cut the fast workflow needs, above the 4 h floor.
**Worked slow case (verified):** 100% olive (score 14) → 192–336 h; none-gel 1.30 ×
lye@28%≈1.19 × superfat@8% 1.12 ≈ 1.73 → 332–581 h (width 1.75×) → **displayed "≈ 2+ weeks"**,
not a bogus 24-day figure.

### HP
Fixed band `unmold/cut = 6–18 h`, `stamp = null` (rustic surface stamps unevenly — a texture
note, no window). Independent of oils, gel, and coverage; confidence `'moderate'`.

### LS
Returns `null` (gate step 1).

## Architecture

New pure module `packages/core/src/workability.ts`, structurally a twin of
`packages/core/src/trace-speed.ts`, exported from the core index:

```ts
export type WorkabilityConfidence = 'low' | 'moderate';

export interface WorkabilityRange { minHours: number; maxHours: number }

export interface WorkabilityEstimate {
  unmold: WorkabilityRange;
  cut: WorkabilityRange;
  stamp: { opensMinHours: number; opensMaxHours: number } | null; // null for HP
  confidence: WorkabilityConfidence;
  factors: string[];   // human-readable reasons, trace-speed style
  caveats: string[];   // always-shown warnings
}

export function estimateWorkability(input: {
  hardnessScore: number;
  faCoverage: number;
  lyeConcentrationPercent: number;
  superfatPercent: number;
  process: 'cp' | 'hp' | 'ls';
  gelMode: 'none' | 'natural' | 'forced';
  additives: ReadonlyArray<{ id: string; dosePercent: number }>;
}): WorkabilityEstimate | null;
```

New module must add its own `export * from './workability.js'` line to
`packages/core/src/index.ts` (mirroring the `trace-speed` export).

### Additive adapter (web side)
The recipe stores additives as `AdditiveLine { catalogId, amount: string, basis:
'oil'|'batch'|'solution', unit: 'percent'|'ppt', addAt }` — **not** `{ id, dosePercent }`.
Build the adapter from the already-computed `ComputedAdditive.grams`
(`packages/web/src/lib/calculateAdditives.ts`): `dosePercent = grams / totalOilGrams × 100`,
`id = catalogId`. This normalizes any basis/unit (percent-of-batch, ppt) to a single
percent-of-oil number the pure core function consumes. Only `sodium-lactate` and `salt` ids
are read, but the adapter is general.

### Wiring `estimateWorkability` into cureEstimate
`estimateCure` currently takes **only** `profile: ProcessProfile`
(`packages/web/src/lib/cureEstimate.ts`) and its call site memoizes on `[profile]`
(`useRecipeViewModel.ts`). To add `workability` either grow `estimateCure`'s signature to
accept the extra inputs, or call `estimateWorkability` in the view model and merge it into the
`CureEstimate` object. **Either way the `useMemo` dependency array must widen** to include
`properties` (hardness+coverage), the lye `result`, `settings.superfatPercent`, `settings.gelMode`,
the computed additives, `totalOilGrams`, and `process` — all already in scope there — or the
estimate goes stale. Adding the `workability` field to the `CureEstimate` type is purely
additive; `usableAtUnmold` and `finishingLabel` are untouched (D5).

### State plumbing for `gelMode`
- Add `gelMode: 'none' | 'natural' | 'forced'` to `RecipeSettings` in
  `packages/web/src/lib/recipe.ts`, with `DEFAULT_SETTINGS.gelMode = 'natural'`.
- Add a `GEL_MODES` const + `isGelMode` guard (matching the existing `isLyeType` /
  `isWaterMode` pattern) and return `gelMode` from `normalizeSettings` so recipes missing the
  field coerce to `'natural'`. `KNOWN_SETTING_KEYS` derives from `Object.keys(DEFAULT_SETTINGS)`,
  so the new key auto-registers for unknown-key preservation. Persistence is **localStorage**
  (`recipeStorage.ts`) + **file export/import** (`recipeFile.ts`), both routed through
  `normalizeSettings` — there is *no* URL/hash serialization. `parseRecipeSettings.ts` (the lye
  parser) does not need touching. **Note:** `recipe.test.ts` asserts a normalized empty input
  `toEqual({ ...DEFAULT_SETTINGS, processVariant })`; that passes only once `normalizeSettings`
  returns `gelMode` — a helpful guard, not a spec problem.
- Render the control in `CpExtrasPanel.tsx`: pass `gelMode={settings.gelMode}` + a setter
  (`setSettings({ ...settings, gelMode })`) from App, matching the `SuperfatWaterPanel` /
  `DilutionPanel` pattern already in `App.tsx`. It currently holds only local converter state
  and takes just `totalOilGrams`. Reword the gel myth line (`CpExtrasPanel.tsx:70`).

### Data flow
`recipe` →
`calculateRecipeProperties` (`hardness` + `coveragePercent`) +
lye `result` (`lyeConcentrationPercent`) + `settings.superfatPercent` (parsed) +
`settings.gelMode` +
computed additives → `{ id, dosePercent }` adapter +
`process`
→ `estimateWorkability()` →
merged into `packages/web/src/lib/cureEstimate.ts`'s `CureEstimate` as a **new** `workability`
field (existing `usableAtUnmold` + finishing-label logic untouched — D5) →
rendered by `packages/web/src/components/ResultsPanel.tsx`.

### Display (unit-adaptive, with a 2-week ceiling)
Each range picks **one** unit from its **`maxHours`** (single stated basis), boundaries
half-open so exactly-48 h and exactly-240 h are unambiguous:
- `maxHours < 48` → hours (e.g. "≈ 12–36 h")
- `48 ≤ maxHours < 240` → days (e.g. "≈ 3–5 days"; a 40–56 h range renders in days as ~2–2.3 d)
- `240 ≤ maxHours < 336` → weeks (e.g. "≈ 1–2 weeks")
- `maxHours ≥ 336` (14 days) → **open-ended ceiling: render "≈ 2+ weeks"** (a single label, no
  numeric range). This is `CEILING_HOURS = 336` applied only at display — internal values stay
  uncapped so widths/ordering/monotonicity hold. Past two weeks the estimate is meaningless
  precision anyway, so an open-ended label is the honest output.

Both edges render in the chosen unit (no split-unit ranges). Hours round to whole numbers,
days to 0.5, weeks to 0.5.

### UI
A compact block in `ResultsPanel` near the cure estimate:
- Rows: **Unmold**, **Cut**, **Stamp from** (the open range), each an adaptive-unit range.
- A small confidence chip.
- A factor line (e.g. "Hard-oil score 44 · 33% lye conc · 5% superfat · sodium lactate").
- Caveats (always shown):
  - "Mold type and **room temperature** move these as much as the recipe does — plastic molds
    and cool rooms run slower; a warm room runs faster."
  - "The gel setting assumes a loaf; **small/individual molds often don't gel on their own** —
    treat those as *None* unless you insulate."
  - "Don't wait to stamp — bars over-harden and then take faint, cracked impressions. There
    are two schools: stamp fresh at cut, or wait a day for a firmer, cleaner deep impression."
  - "Test firmness on a loaf offcut before cutting/stamping the batch."
  - "Salt bars (salt at 25%+ of oils) are out of scope — they must be cut within ~1–2 h and
    break the 4 h floor."
- Hidden entirely for LS; HP shows unmold/cut + the texture note instead of a stamp row.

## Testing

**Core unit tests (`workability.test.ts`):**
- Anchors: baseline hard bar (score ≥45, natural gel, 33% lye, 5% SF) → unmold ~12–36 h;
  same + `forced` gel + ~38% lye + 3% SF + sodium-lactate → ~5–14 h (fast case, above the
  4 h floor); 100% olive (score ~14, none gel, 28% lye, 8% SF) → internal ~332–581 h,
  **displays "≈ 2+ weeks"** (not a 24-day figure); trinity 34/33/33 (score ≈47, natural) →
  the 12–36 h band; all-unsaturated (score ≈0, coverage high) → "2+ weeks", **not** `null`.
- Composition: baseline recipe → composite exactly 1.0 (lye 33%, SF 5%, natural, no
  additives all neutral). Compounded extremes stay finite and ≥ 4 h (no upper clamp internally).
- Monotonicity: gel `forced` < `natural` < `none`; more water (lower lye conc) ⇒ later;
  higher superfat ⇒ later; higher SL/salt dose ⇒ earlier; non-decreasing in hardness.
- Pipeline invariants (fuzz ≥25 000 inputs): `unmold ≤ cut ≤ stamp.opensMin` per-edge; band
  width `max ≥ min × 1.5` **always**, including at the display ceiling (regression: the hard
  336 h cap collapsed the slow case to 336–336 h — must not recur); every edge ≥ 4 h.
- Display: unit chosen from `maxHours` with half-open boundaries; a 40–56 h range renders in
  days; exactly-48 h and exactly-240 h land on the defined side; `maxHours ≥ 336` → the
  open-ended "≈ 2+ weeks" label (no numeric range).
- Gates: `process:'ls'` → `null`; non-finite `lyeConcentrationPercent` → `null`; CP
  `faCoverage:0` → `null`; `faCoverage:79.9` → `'low'`, `80` → `'moderate'`; HP with sparse
  coverage still returns its 6–18 h band (never `null`).
- Guards: unknown `gelMode` → treated as `natural`; `dosePercent` above range clamps (SL 50%
  ⇒ ×0.90 floor, not runaway); `hardnessScore` 200 clamps to 60, −5 clamps to 0.

**Web tests:**
- `cureEstimate.test.ts`: `workability` populated for CP/HP, absent/omitted for LS; existing
  `usableAtUnmold` assertions unchanged (D5).
- `ResultsPanel.test.tsx`: renders the three rows, chip, factor line, and caveats for CP;
  omits the block for LS; shows the HP texture note.
- `CpExtrasPanel.test.tsx`: renders the three-state gel control, calls the setter on change,
  and shows the reworded gel note.
- `recipe.ts` settings round-trip: a recipe missing `gelMode` coerces to `'natural'`; a
  saved `gelMode` survives normalize → localStorage/file → parse; the existing
  `recipe.test.ts` `toEqual(DEFAULT_SETTINGS…)` assertion still holds.
- Additive adapter: `{catalogId:'sodium-lactate', grams}` + `totalOilGrams` →
  `{id:'sodium-lactate', dosePercent}`; non-oil basis / ppt unit normalize correctly.

## Risks & mitigations
- **Calibration is provisional** (blog/anecdote anchors, no validated formula) → all
  constants in one tunable block, wide ranges, confidence capped at moderate, honest caveats.
- **Gel & modulator magnitudes** are estimates → tunable; `natural`/33%/5% compose to exactly
  ×1.0 so a default recipe is never silently shifted.
- **Water is co-primary, not secondary** (sources: physical hardness tracks water as much as
  oils) → lye-concentration knees widened to 25–40% so it carries real spread at the soft end.
- **New `RecipeSettings` field** → guarded coercion defaulting to `'natural'`; persists via
  localStorage + file (no URL path); round-trip test + the existing `recipe.test.ts` guard.
- **Additive shape mismatch** → recipe stores `{catalogId, amount, basis, unit}`, so a
  `grams/oil → dosePercent` adapter is required before the pure core call (not an afterthought).
- **`estimateCure` signature / `useMemo` deps must grow** → without widening the dependency
  array the workability estimate goes stale; called out explicitly for the plan.
- **`usableAtUnmold` conflation** → *not* repurposed (D5); the feature only adds a
  `workability` field, so the boolean's consumers and tests are untouched.
- **Out-of-scope by design:** salt bars (break the 4 h floor), plastic-mold and ambient-temp
  swings, and individual-mold gel behavior — all surfaced as caveats, not modeled.
