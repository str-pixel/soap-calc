# Cure Estimate — Recipe-Derived Two-Milestone Model

**Date:** 2026-07-24
**Status:** Approved design (prototype-validated); implementation not started
**Prototype:** executed against real `soap_oils.json` profiles before this spec was written; the
archetype table below reproduces its validated outputs with the v1 knees.

## Problem

The cure window shown to users is a fixed per-process constant (`processProfile.ts` —
CP "4+ weeks", HP 3–4 wk, LS sequester 1–4 wk). The recipe never moves it, so a 100%
coconut bar and a castile bar read identically, when in reality they cure on timescales
that differ by an order of magnitude. Workability (#87) already models the hours-scale
timeline (unmold/cut/stamp) from the recipe; this feature extends the same philosophy to
the weeks-scale timeline.

## What "cure" means here: two milestones

Cure conflates two physical processes that finish at very different times. The UI shows
both:

1. **Usable from** — water has evaporated enough that the bar is weight-stable-ish, hard
   enough to use, and lathers acceptably. Driven by water amount (lye concentration),
   lauric+myristic content, and early hardness. **Measurable at home** (weight plateau on
   a kitchen scale) — this is the calibratable milestone.
2. **At its best** — crystal/phase maturation: milder, less soluble, longer-lasting bar.
   Driven almost entirely by the slow fatty acids (oleic, ricinoleic, PUFA). Not
   measurable at home; literature-anchored with an honest confidence label.

Invariant: `best.minWeeks >= usable.minWeeks` (enforced; 100% coconut actually hits it).

### High-PUFA flip: "use within" instead of "at its best"

When PUFA (linoleic+linolenic) is high, DOS typically arrives before the theoretical
maturation peak — recommending long aging would age the bar into rancidity. Rules:

- PUFA > **15%**: DOS caveat string fires (matches the existing DOS-risk convention).
- PUFA > **25%**: the second milestone flips from `best` ("at its best ~X") to
  `useWithin` ("use within ~X"), with the window taken from the shelf knees below.

## Model

Same architecture as `workability.ts`: pure function, one exported `CURE_TUNING` constant,
every value a deliberate adjustable default, piecewise-linear interpolation between knees
(reuse/mirror `piecewise()`), transparent factors/caveats output.

### Drivers (from the recipe's oil-weighted FA profile, in % of FA)

- `fast = lauric + myristic`
- `pufa = linoleic + linolenic`
- `slow = oleic + ricinoleic + 0.6 × pufa`

Ricinoleic at full weight in `slow` is the least-grounded constant (castor is hygroscopic
and rubbery-soft early, so a high weight is directionally right, but the magnitude is a
guess). It is the **top retune candidate** — marked as such in the tuning comments.

### v1 tuning

```ts
export const CURE_TUNING = {
  linoleicWeight: 0.6,          // PUFA counts toward slow, discounted
  // slow -> usable-from min weeks
  usableKnees: [[10, 2], [35, 3.8], [55, 5], [70, 6.5], [80, 8]],
  // lauric+myristic shortens usable-from (multiplier)
  fastCredit:  [[0, 1.0], [30, 0.9], [55, 0.8]],
  // lye concentration % -> water factor (applies to usable-from ONLY;
  // water barely affects maturation)
  lyeConc:     [[25, 1.25], [33, 1.0], [40, 0.85]],
  usableFloorWeeks: 2,
  usableSpread: 1.5,            // maxWeeks = minWeeks * spread
  // slow -> at-its-best min weeks
  bestKnees:   [[10, 4], [50, 8], [65, 13], [78, 26], [88, 40]],
  bestSpread: 1.6,
  // PUFA thresholds and shelf window (weeks) for the use-within flip
  pufaCaveatPercent: 15,
  pufaFlipPercent: 25,
  shelfKnees:  [[25, 52], [40, 26], [70, 13]],
} as const;
```

Pipeline:

```
usableMin = piecewise(slow, usableKnees) × piecewise(fast, fastCredit) × piecewise(lyeConc%, lyeConc)
usableMin = max(usableMin, usableFloorWeeks);  usableMax = usableMin × usableSpread
bestMin   = max(piecewise(slow, bestKnees), usableMin);  bestMax = bestMin × bestSpread
if pufa > pufaFlipPercent: second milestone = useWithin, window from piecewise(pufa, shelfKnees)
```

### Validated anchors (prototype output vs community consensus)

These become the anchor test fixture (`FIELD_ANCHORS` pattern from
`workability-calibration.test.ts`). Community windows are de-branded consensus values,
consistent with the anonymity rule for reference-derived data.

| Archetype | usable (model) | best (model) | reference |
|---|---|---|---|
| 100% coconut | 2.0–3.0 wk (floor) | 4–6.4 wk | usable ~2–3 wk |
| Balanced trinity 40/30/30 | ~4.2–6.3 wk | ~7.7–12 wk | 4–6 wk |
| Castile (100% olive) | ~7.5–11.3 wk | ~25–40 wk (≈6–9 mo) | ~8 wk / 6–12 mo |
| Bastile 70/20/10 | ~5.7–8.6 wk | 13–21 wk | ~6–8 wk |
| 100% lard | ~4.7–7 wk | 8–13 wk | 4–6 wk |
| 100% tallow | ~3.9–5.8 wk | 7–11 wk | 4–6 wk |
| 100% sunflower (PUFA 71%) | ~5.4–8.0 wk | **use within ~13 wk** + DOS caveat | long cure, DOS risk |

Seam probes validated in the prototype: olive 50%→100% sweep is smooth and monotonic (no
archetype-threshold cliff); lye-concentration factor moves usable-from ±25% with no
discontinuities.

## Architecture

Mirrors the workability split exactly:

- **`packages/core/src/cure.ts`** — pure model. Input
  `{ fa: FattyAcidProfile, faCoverage, lyeConcentrationPercent, process }` (the
  `FattyAcidProfile` type core already exports from `fatty-acids.ts`; the web adapter feeds
  it the view model's existing `fattyAcids` + `properties.coveragePercent`);
  output `CureModelEstimate { usable: WeeksRange, second: { kind: 'best' | 'useWithin' } & WeeksRange, confidence, factors, caveats } | null`.
  Returns `null` for LS (sequester is not an oil-driven cure) and for non-finite inputs.
- **`packages/core/src/cure.test.ts`** — unit tests + anchor fixtures.
- **`packages/core/src/cure-calibration.test.ts`** — `REAL_BATCHES`-style harness for
  observed weight-plateau dates (usable-from side only; starts empty, same retuning rules
  as workability: never tune to one batch, anchors must still overlap).
- **`packages/web/src/lib/cureEstimate.ts`** — becomes the adapter: merges the core
  estimate with `ProcessProfile` (LS keeps the fixed 1–4 wk sequester window; HP keeps
  `usableAtUnmold: true` and still shows the maturation milestone — HP soap is usable at
  unmold but keeps improving). Existing `labelWeightGrams` stays put.
- **Display:** windows ≥ 13 weeks render in months ("≈6–9 months") — weeks become
  unreadable at castile scale.

Confidence: `low` by default (calibration scaffolded, not validated — same honest posture
as workability at launch); downgraded further / caveated when `faCoverage < 80%`
(reuse the existing `lowCoveragePercent` gate value; incomplete FA breakdowns must not
silently read as zero).

## Error handling

- LS process → core returns `null`; web adapter falls back to the fixed sequester window.
- Non-finite FA/lye inputs → `null` (adapter falls back to today's fixed per-process window).
- `faCoverage < 80%` → estimate still produced, confidence-capped with an explicit caveat.
- Salt bars (salt ≥ 25% of oils) remain out of scope — same exclusion as workability.

## Out of scope

- Environment (temperature, humidity, airflow) — caveat strings only, as workability does.
- Bar geometry / surface-area evaporation modeling (rejected approach C: inputs we don't
  have, false precision).
- Superfat as a driver — plausible small effect on usable-from; deferred until the
  calibration harness has data that would justify a knee.
- DOS *prediction* — the PUFA rules here are display heuristics, not a rancidity model.

## Testing

1. Unit: piecewise edges, floor, spread, `best >= usable` invariant, PUFA caveat at >15,
   flip at >25, LS/non-finite → null, faCoverage gate.
2. Anchors: the archetype table above as fixtures with tolerance bands (workability's
   `FIELD_ANCHORS` pattern) — retuning must keep all anchors passing.
3. Web adapter: HP `usableAtUnmold` preserved, LS sequester fallback, months formatting
   threshold.
4. E2E: milestone rows render in the results timeline for a CP recipe; castile recipe
   shows months-scale "at its best"; sunflower-heavy recipe shows "use within" + DOS
   caveat.
