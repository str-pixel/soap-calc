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
- **D2 — Stamp window: open edge only.** The *open* edge is well-sourced (hard oils reach
  the stamp state sooner). The *close* edge ("harder recipes over-harden faster") is a
  reasoned inference, not sourced, so it is shown as a **qualitative caveat**, not a
  computed number.
- **D3 — Output is a range + confidence, never a single day/hour.** Unit-adaptive display.
- **D4 — Confidence is never "high."** Default moderate; drops to low under 80% FA coverage;
  `null` when there is no usable FA data.
- **D5 — `usableAtUnmold` is left untouched.** It means "cured enough to *use* at unmold"
  (an HP trait), which is distinct from *releasability*. `cureEstimate` only *adds* a
  `workability` field; the existing boolean and finishing-label logic are unchanged, so their
  tests stay green as-is.

## Model

All math is computed internally in **hours** (one continuous unit, no rounding artifacts),
from values the app already has. Constants live in a single tunable block marked
`// not a verified constant` (mirroring `packages/core/src/trace-speed.ts`).

### Inputs
- `hardnessScore` — the recipe hardness property from `packages/core/src/properties.ts`
  (`lauric + myristic + palmitic + stearic + long-chain saturates + elaidic`).
- `faCoverage` — total fatty-acid coverage %, for the confidence gate (reuse the existing
  `LOW_COVERAGE` threshold, 80%).
- `lyeConcentrationPercent`, `superfatPercent` — from `packages/core/src/lye.ts`.
- `process` — `'cp' | 'hp' | 'ls'`.
- `gelMode` — `'none' | 'natural' | 'forced'` (CP only; ignored for HP/LS).
- `additives` — the recipe's additive entries (id + dose), to read `sodium-lactate` and
  `salt` presence *and dose*.

### CP — base bands (Natural-gel baseline)

The base bands below represent a **naturally-gelled** batch (`gelMode: 'natural'`, the
default — most uninsulated CP partially gels). The gel multiplier (below) shifts them.

**Unmold**, from the hardness score (calibrated to the anchors above):

| Hardness score | Unmold base |
|---|---|
| ≥ 45 | 12–24 h |
| 38–45 | 1–2 days |
| 30–38 | 2–4 days |
| 22–30 | 4–8 days |
| < 22 | 1–2 weeks |

**Cut** = unmold band + a small fixed buffer (≈ a few hours), floored so `cut ≥ unmold`.
Rationale: for loaf molds cut ≈ unmold; a small buffer represents "outer surface no longer
sticky/dragging." UI notes slab/individual molds skip the cut step.

**Stamp — open edge only.** You cut first, then stamp, so `stampOpensHours ≥ cut.maxHours`:
the bar opens to stamping a short firm-up after it can be cut (research: stamp when "firm to
touch but slightly soft inside," often ~a day after cutting for a normal recipe; sooner for
hard/fast bars). Model it as `cut.maxHours × ~1.1`, floored at `cut.maxHours`. No close
number; a caveat carries the over-hardening warning.

### Modulators (multiplicative on the whole CP timeline)

Baseline = CP defaults (lye concentration 33%, superfat 5%, `gelMode: 'natural'`):

- **Gel:** `none` → slower (≈ ×1.3); `natural` → ×1.0 (baseline); `forced` → faster
  (≈ ×0.5). This is the strongest single lever for reaching the ~8 h fast end.
- Lye concentration: > ~35% → faster (≈ ×0.85); < ~28% → slower (≈ ×1.25); interpolate.
- Superfat: > ~7% → slower (≈ ×1.15); < ~4% → faster (≈ ×0.9).
- `sodium-lactate` present → faster; **scaled by dose** within its typical 1–3% range
  (about −½ to −1½ days near the fast end, subject to the absolute floor below).
- `salt` present → mild hardening (≈ ×0.9), scaled by dose within its 0.05–1% range.

Worked fast-case: hardness ≥45 (12–24 h base) × forced gel (×0.5) × low water/superfat and
sodium lactate → lands at the ~8 h unmold-and-cut the fast workflow needs.

### HP

Fixed short unmold/cut band (≈ 6–18 h) independent of oils — the cook/gel does the work.
Stamp is a texture-dependent note ("HP's rustic surface takes stamps unevenly"), no window.
Confidence: moderate at best.

### LS

Returns `null`. No milestones.

### Floors, caps, and invariants
- **Two distinct floors.** The hardness→band lookup bottoms out at the **base band** 12–24 h
  (so 100% coconut and a merely-hard recipe share the same *pre-modulator* base). The
  modulators (gel / water / superfat / additives) may then push the final estimate *below*
  that base band — that is how forced-gel + discount + sodium-lactate reaches ~8 h — but
  never below an absolute physical floor `ABSOLUTE_FLOOR_HOURS ≈ 4 h` (CP needs a minimum
  time to firm enough to release). High end caps display at ~2 weeks.
- **Ordering** `unmold ≤ cut ≤ stampOpens`, enforced by clamping after modulators/floors.
- **Monotonic (non-decreasing) in hardness:** higher hardness never yields a later edge;
  within a band the edge is flat (the fuzz test allows equality).

### Confidence & null
- `null` when no usable FA data (avoid emitting a garbage number).
- `'low'` when `faCoverage < 80%`; otherwise `'moderate'`. Never `'high'`.

## Architecture

New pure module `packages/core/src/workability.ts`, structurally a twin of
`packages/core/src/trace-speed.ts`, exported from the core index:

```ts
export type WorkabilityConfidence = 'low' | 'moderate';

export interface WorkabilityRange { minHours: number; maxHours: number }

export interface WorkabilityEstimate {
  unmold: WorkabilityRange;
  cut: WorkabilityRange;
  stamp: { opensHours: number } | null; // null for HP (texture note instead)
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

### State plumbing for `gelMode`
- Add `gelMode: 'none' | 'natural' | 'forced'` to `RecipeSettings` in
  `packages/web/src/lib/recipe.ts`, with `DEFAULT_SETTINGS.gelMode = 'natural'`.
- Extend the settings coercion/normalizer so saved / URL-shared recipes without the field
  fall back to `'natural'` (an `isGelMode` guard, matching the existing `isLyeType` /
  `isWaterMode` pattern) — keeps round-trip persistence intact.
- Render the control in `CpExtrasPanel.tsx`: it must receive the current `gelMode` and a
  setter as props (it currently holds only local converter state), and reword the gel myth
  line. Wired through the same App → panel path used for other settings.

### Data flow
`recipe` →
`calculateRecipeProperties` (hardness + coverage) +
`lye` result (lyeConcentrationPercent, superfatPercent) +
`settings.gelMode` +
`recipe.additives` +
`process`
→ `estimateWorkability()` →
consumed by `packages/web/src/lib/cureEstimate.ts`, which **adds** a `workability` field to
its return (the existing `usableAtUnmold` boolean and finishing-label logic are untouched —
see D5) →
rendered by `packages/web/src/components/ResultsPanel.tsx`.

### Display (unit-adaptive)
Each range picks a unit by magnitude, kept deliberately wide:
- `< 48 h` → hours (e.g. "≈ 12–24 h")
- `2–10 days` → days (e.g. "≈ 3–5 days")
- `> 10 days` → weeks (e.g. "≈ 1–2 weeks")

### UI
A compact block in `ResultsPanel` near the cure estimate:
- Rows: **Unmold**, **Cut**, **Stamp from** (open edge), each an adaptive-unit range.
- A small confidence chip.
- A factor line (e.g. "Hard-oil score 44 · 33% lye conc · 5% superfat · sodium lactate").
- Caveats (always shown):
  - "Mold type and room temperature shift these by hours — plastic molds run slower.
    (Gel is set above; forcing it reaches the ~8 h end, preventing it runs slower.)"
  - "Don't wait to stamp — hard bars over-harden within a day or two and take faint,
    cracked impressions."
  - "Test firmness on a loaf offcut before stamping the batch."
- Hidden entirely for LS; HP shows unmold/cut + the texture note instead of a stamp row.

## Testing

**Core unit tests (`workability.test.ts`):**
- Anchors (at `gelMode: 'natural'`): hard + water-discount + sodium-lactate → unmold
  ~12–24 h; hard + `forced` gel + water-discount + sodium-lactate → ~8 h (the fast case,
  above the 4 h absolute floor); 100% olive (score ≈14) → unmold ~1–2 weeks; a moderate
  ~40-score recipe (e.g. 30% coconut / 20% palm / 50% olive) → ~1–2 days. Note 34/33/33
  olive/coconut/palm scores ≈47 → the 12–24 h band, *not* 1–2 days.
- Gel monotonicity: `forced` < `natural` < `none` for the same recipe, on every edge.
- Modulator monotonicity: more water ⇒ later; higher superfat ⇒ later; sodium lactate ⇒
  earlier; dose scaling moves the effect in the right direction.
- Ordering invariant `unmold ≤ cut ≤ stampOpens` holds across a fuzz of inputs.
- Unit-switch boundaries at 48 h and 10 days render the expected unit.
- HP → fixed band + `stamp === null`; LS → whole result `null`; zero/low FA coverage →
  `null` / `'low'`; extreme hardness clamps.

**Web tests:**
- `cureEstimate.test.ts`: `workability` populated for CP/HP, absent/omitted for LS; existing
  `usableAtUnmold` assertions unchanged (D5).
- `ResultsPanel.test.tsx`: renders the three rows, chip, factor line, and caveats for CP;
  omits the block for LS; shows the HP texture note.
- `CpExtrasPanel.test.tsx`: renders the three-state gel control, calls the setter on change,
  and shows the reworded gel note.
- `recipe.ts` settings round-trip: a recipe missing `gelMode` coerces to `'natural'`; a
  saved `gelMode` survives serialize → parse.

## Risks & mitigations
- **Calibration is provisional** (sparse blog anchors) → constants centralized and clearly
  marked unverified for easy re-tuning; ranges kept wide; confidence capped at moderate.
- **Gel multiplier magnitudes** (×0.5 / ×1.0 / ×1.3) are estimates → tunable constants,
  wide ranges, moderate confidence cap; `natural` default keeps existing-recipe behavior
  sensible.
- **New `RecipeSettings` field** → guarded coercion defaulting to `'natural'` so older saved
  and URL-shared recipes keep loading; explicit round-trip test.
- **`usableAtUnmold` conflation** → *not* repurposed (D5); the feature only adds a
  `workability` field, so the boolean's consumers and tests are untouched.
