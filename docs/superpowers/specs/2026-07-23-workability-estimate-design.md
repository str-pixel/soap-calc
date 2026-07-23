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
`packages/web/src/lib/cureEstimate.ts` — a process flag, not recipe chemistry.

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

- **CP:** full chemistry timeline — unmold, cut, stamp-open.
- **HP:** fixed short unmold/cut band (its cook/gel is intrinsic — see gel decision below);
  stamp shown as a texture-dependent note, no chemistry window.
- **LS:** no estimate (diluted to liquid, never molded as a bar) — returns `null`, UI omits
  the whole block.

### Explicitly out of scope (YAGNI)
- No new gel/insulation/temperature input for CP (see decision D1).
- No numeric stamp-window *close* edge (see decision D2).
- No change to the existing cure-week estimate or label-weight math; this feature only
  *adds* a workability block and *derives* the existing `usableAtUnmold` boolean from it.
- No per-mold-type input; mold effects live in the caveat text.

## Key decisions

- **D1 — Gel phase is HP-only.** No CP gel input is added (it would fight the existing
  "gel phase is optional — it changes look, not safety" copy in `CpExtrasPanel.tsx` and add
  UI/state). CP is calibrated to the **non-gelled baseline**; forcing gel is surfaced as a
  caveat ("insulate / force gel to reach the fast ~8 h end"). HP is inherently cooked/gelled,
  so its speed is baked into its fixed band.
- **D2 — Stamp window: open edge only.** The *open* edge is well-sourced (hard oils reach
  the stamp state sooner). The *close* edge ("harder recipes over-harden faster") is a
  reasoned inference, not sourced, so it is shown as a **qualitative caveat**, not a
  computed number.
- **D3 — Output is a range + confidence, never a single day/hour.** Unit-adaptive display.
- **D4 — Confidence is never "high."** Default moderate; drops to low under 80% FA coverage;
  `null` when there is no usable FA data.

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
- `additives` — the recipe's additive entries (id + dose), to read `sodium-lactate` and
  `salt` presence *and dose*.

### CP — base bands (non-gelled baseline)

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

**Stamp — open edge only.** `stampOpensHours ≈ cut midpoint` (firm-to-touch, takes a dent
without sticking). No close number; a caveat carries the over-hardening warning.

### Modulators (multiplicative on the whole CP timeline)

Baseline = CP defaults (lye concentration 33%, superfat 5%):

- Lye concentration: > ~35% → faster (≈ ×0.85); < ~28% → slower (≈ ×1.25); interpolate.
- Superfat: > ~7% → slower (≈ ×1.15); < ~4% → faster (≈ ×0.9).
- `sodium-lactate` present → faster; **scaled by dose** within its typical 1–3% range
  (about −½ to −1½ days near the fast end, floored at the fastest band).
- `salt` present → mild hardening (≈ ×0.9), scaled by dose within its 0.05–1% range.

### HP

Fixed short unmold/cut band (≈ 6–18 h) independent of oils — the cook/gel does the work.
Stamp is a texture-dependent note ("HP's rustic surface takes stamps unevenly"), no window.
Confidence: moderate at best.

### LS

Returns `null`. No milestones.

### Invariants
- Ordering: `unmold ≤ cut ≤ stampOpens`, enforced by clamping.
- Monotonic in hardness: higher hardness ⇒ all edges earlier.
- Extremes clamped: e.g. 100% coconut floors at the fastest band (12–24 h, not less); 100%
  soft caps display at ~2 weeks.

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
  additives: ReadonlyArray<{ id: string; dosePercent: number }>;
}): WorkabilityEstimate | null;
```

### Data flow
`recipe` →
`calculateRecipeProperties` (hardness + coverage) +
`lye` result (lyeConcentrationPercent, superfatPercent) +
`recipe.additives` +
`process`
→ `estimateWorkability()` →
consumed by `packages/web/src/lib/cureEstimate.ts`, which adds a `workability` field to its
return **and derives the existing `usableAtUnmold` boolean from it** (so `ResultsPanel` and
the finishing-label logic keep working unchanged) →
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
  - "Mold type, gel phase, and room temperature shift these by hours — plastic molds and
    no-gel run slower; insulating / forcing gel runs faster (and can reach the ~8 h end)."
  - "Don't wait to stamp — hard bars over-harden within a day or two and take faint,
    cracked impressions."
  - "Test firmness on a loaf offcut before stamping the batch."
- Hidden entirely for LS; HP shows unmold/cut + the texture note instead of a stamp row.

## Testing

**Core unit tests (`workability.test.ts`):**
- Anchors: hard + water-discount + sodium-lactate → unmold ~12–24 h, cut shortly after,
  stamp opens same-day (the fast case; ~8 h reached only with the "gelled" caveat noted);
  100% olive → unmold ~1–2 weeks; balanced 34/33/33 → unmold ~1–2 days.
- Modulator monotonicity: more water ⇒ later; higher superfat ⇒ later; sodium lactate ⇒
  earlier; dose scaling moves the effect in the right direction.
- Ordering invariant `unmold ≤ cut ≤ stampOpens` holds across a fuzz of inputs.
- Unit-switch boundaries at 48 h and 10 days render the expected unit.
- HP → fixed band + `stamp === null`; LS → whole result `null`; zero/low FA coverage →
  `null` / `'low'`; extreme hardness clamps.

**Web tests:**
- `cureEstimate.test.ts`: `workability` populated for CP/HP, absent/omitted for LS, and the
  derived `usableAtUnmold` boolean still matches its existing expectations.
- `ResultsPanel.test.tsx`: renders the three rows, chip, factor line, and caveats for CP;
  omits the block for LS; shows the HP texture note.

## Risks & mitigations
- **Calibration is provisional** (sparse blog anchors) → constants centralized and clearly
  marked unverified for easy re-tuning; ranges kept wide; confidence capped at moderate.
- **Gel unmodeled for CP** → non-gelled baseline + explicit caveat; the fast ~8 h figure is
  framed as "if gelled," not a headline output.
- **`usableAtUnmold` repurposing** → derive it from the new estimate rather than replace its
  consumers; existing tests must stay green.
