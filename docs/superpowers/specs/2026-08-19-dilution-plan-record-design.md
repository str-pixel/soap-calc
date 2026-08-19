# Dilution: Plan + Record — design

**Status:** approved in brainstorming 2026-08-19; awaiting spec review.
**Replaces:** the three-mode dilution surface (Target concentration / Water:paste ratio /
Gradual) with one surface holding a plan and a record.

## Why

Research (verified against the source and the code at `7d17e9f`):

- The reference teaches three dilution *procedures* (LS:1529–1536) but one workflow:
  compute a starting estimate (as a % or a ratio), pour, add increments, **record what was
  actually used** (LS:2156, LS:1614; every post-batch review sheet opens with "How much
  dilution water was required?"). The app splits that one workflow into three mutually
  exclusive modes.
- In code, the three modes are three framings of one equation
  (`c = 100·anhydrous/(paste + water)`) converging on one persisted number. The cost is
  mode exclusivity, not arithmetic: a 2,621-line panel, 27 props, ~30 suppression consts,
  two write-back effects with touched/reset machinery, a 60-line mode-restore effect, and
  25.3% of the web test suite (364/1,440). Five separate defect rounds in this area were
  mode-boundary reconciliation.
- The book never back-derives a % from poured water (whole-file verified); the write-back
  is an app invention and the source of the widened-ceiling machinery
  (`measuredPaste.ts:690-720`) and the rounding self-refutation corner.

## Decisions (all user-made)

1. End state: **Plan + Record, no mode radio.**
2. **No write-back, ever.** Plan and record are independent state; a single resolution
   rule feeds every consumer; the record's derived % is display-only.
3. Portion scope **mirrors** the batch surface (plan sizing + optional jar record); the
   never-write-back prohibition becomes structural.
4. Ratio survives as **presets only** (1:1, 2:1, 2.5:1, 3:1) that set the plan %.
5. Preservative is included in the final liquid, **display and dosing**:
   `dose = pct/(100−pct) × dosingBasis` (w/w of the finished product including itself).
6. Dead plumbing is deleted — **including core's remaining-mode arithmetic**.
7. Solution-dosed additives follow the **same resolution rule** as the preservative.
8. **No migration for old recipes.** Records lead wherever they exist, including recipes
   saved with a leftover record beside a hand-typed target. (Explicitly decided; this
   reverses the ruling embodied by `measuredPaste.ts:645-656`.)
9. Recipe-aware solubility ceiling: **out of scope**, recorded follow-up.

## 1. Data model

- **Plan:** `settings.soapConcentrationPercent`. Typed by the maker or set by a ratio
  preset. Code never writes it otherwise.
- **Record:** `settings.gradualWaterGrams` (batch); session `portionPasteGrams` /
  `portionWaterGrams` (jar). Code never derives state from them into the plan.
- **Resolution rule** (one function, new, in `packages/web/src/lib/`):
  a record parseable and > 0 (`parseGradualWaterRecordGrams`; blank ≠ zero) → record arm;
  else plan arm. Record arm's pot is `weighedOrComputedPotGramsFor` (target-independent).
  The derived % readout is unclamped and display-only.
- No schema change: no new fields, `RECIPE_FILE_VERSION` stays 2, exports round-trip
  against old builds unchanged.

## 2. Surface

**Whole batch:**

- *Plan row:* target % input; presets 1:1/2:1/2.5:1/3:1 as **one-shot setters** — a click
  computes `anhydrous/(pot×(1+r))·100` from the pot at click time, rounded to 1 dp,
  clamped [1,99], written into the % field; it does not track later pot changes (the
  caption pattern "2:1 → 28.6%" says what it did). A stale gradual-written plan value
  (e.g. `33.85`) displays as-is with no preset highlighted — expected, not a bug.
- *Record row:* "Water added so far (g)" + readout ("finished so far", derived %).

**Custom amount:** the same two-row shape — plan sizing (amount to make → paste to weigh /
water to add; today's `lsPartialDilution` math) and the jar record (paste weighed out +
water added). The plan grid stays rendered beside a filled jar record, labelled as plan;
the jar governs only dose/finished figures. Precedence in portion scope: jar record with
both figures → jar; else plan sizing. The old jar echo of the "saved target" is replaced
by copy that names the plan % as *the plan* (the reassurance framing dies with the
write-back).

**Unchanged:** the scope radio; the measured-paste field (plan-path ceilings become
unwidened; record path is target-independent); alternative liquids; glycerin row;
intended-uses table; collapsed notes.

**Deleted from the surface:** the mode radio, the ratio mode (input, free ratio field,
mode-specific notes), both write-back effects and their touched/not-applied/clamp states.

## 3. Downstream wiring

Every consumer reads resolved figures. Specifically:

- `vm.dilution` becomes the plan arm; `computeBottledSolutionGrams` gains an explicit
  record arm: `pot + recordWater + extras`.
- The two % readers that bypass `dilution` today — `lsDilutionUsesFor` and the solubility
  ceiling check (`DilutionPanel.tsx:409, 2370`) — read the resolved %.
- `overDilutionCertain` and every other plan-claim is gated on plan-governs.
- **Preservative:** `finishedProductGramsFor` splits into two named figures —
  `preservativeDosingBasisGrams` (preservative-free) and `finishedProductGrams`
  (inclusive; used by the ≈ Finished product row, the sheet, and `lsFinishedVolumeMl`).
  Dose = `pct/(100−pct) × dosingBasis`. The `impossible` tier moves to `pct >= 100`
  (the formula diverges at 100); the snippet's over-100 copy changes accordingly.
  Consequence, accepted: the bottled row is effectively always shown for LS recipes with
  a preservative dose.
- **Additive `'solution'` dosing** uses the resolved solution (decision 7). Additive
  grams flow into batch weight and pricing as today.

## 4. Alert conversion (the correctness-critical part)

Every mode gate becomes a record-presence gate; suppressions stay keyed on renders, never
flags (this file has paid five times). Conversion table:

| Today | Becomes |
|---|---|
| `exceedsSolutionAlert` excludes ratio/gradual modes | renders only when plan governs |
| `pasteAlreadyPastTarget` excludes gradual | plan-governs only |
| solubility ceiling reads raw setting | reads resolved %; suppression structure unchanged |
| BatchSheet's three verdict notes lean on write-back having aligned target≈record | gated on plan-governs |
| gradual/ratio "not applied yet" notes | deleted (nothing to apply) |

Evidence bar: the alert matrix (fixtures × record-presence × readings × scope × liquid
states) captured before/after; changed cells must be exactly the record-semantics cells;
zero same-claim doubling anywhere.

Accepted trade, written down: with records leading, a mis-tared crockpot reading plus a
record rescales finished mass and the capped dose with only the solids floor and the
precision fingerprint standing (`measuredPaste.ts:773-784` documents the confined version
of this today).

## 5. Deletions

- Write-back effects + `ratioTouched`/`gradualTouched`/not-applied/clamp machinery.
- Mode-restore effect + `gradualModeChoiceRef` (`App.tsx:196-258`), `dilutionMode` and
  `waterPasteRatio` session state, `narrowDilutionMode`.
- **Widened-ceiling machinery** (dead without write-back):
  `measuredCouldHaveWrittenTarget`, `GRADUAL_WRITE_BACK_ROUNDING`, the widened branch of
  `correctedPotGramsFor`, the `gradualWaterGrams` threading through
  `correctedDilutionWaterGrams` / `computeBottledSolutionGrams`.
- Remaining-mode code, **UI and core**: `MEASURED_PASTE_IS_REMAINING`,
  `exceedsRemainingCeiling`, all `isRemaining` params, and `lsPartialDilution`'s
  remaining branch (`ls-yield.ts:129-157, 204-258`) with its ~10 tests.
- `LS_SHAMPOO_NOT_RECOMMENDED` — its rationale (deliberate absence of a shampoo row)
  moves into a comment on `LS_DILUTION_TARGETS`.

## 6. Phases

1. **Foundations, behaviour-preserving except the dose:** preservative w/w + the
   dosing/display figure split + `impossible` tier guard; the resolution function
   extracted and wired to reproduce current behaviour exactly (plan arm only); test-suite
   prep. The only intended figure changes are the w/w dose deltas.
2. **The atom:** surface swap, write-back removal, record-first cutover, alert
   conversion, portion mirror. One commit series, one matrix, one review.
3. **Deletions** (section 5) + test retirements.

Each phase gates on `npm test` + e2e and gets an adversarial review. Phase boundaries
exist because phase 1's rule-under-live-write-back was shown to be a behaviour change if
cut anywhere else (stress-review, Surface 8).

## 7. Testing

- Blast radius (measured by describe-block reading): retire ~85–105 (mode mechanics,
  write-back, restore, widening, remaining) with an explicit list; rewrite ~90–110
  (surviving claims reworded; RED both directions each); ~180–200 untouched.
- New: resolution-rule unit tests; w/w dose tests incl. `pct >= 100`; record-leads matrix
  cells; portion plan-beside-jar labelling; pinned-gram updates
  (`ls-preservatives.test.ts:104-118` figures become 10.10 / 20.10 etc.).
- e2e: dose-linearity and gradual-reload specs expected to survive; the
  `finished×0.01` comparison must be re-verified against the inclusive figure.

## Out of scope (recorded follow-ups)

Recipe-aware solubility ceiling (the flat 40% is wrong on both tails — LS:1603, LS:1690,
LS:2181); recovery affordance for the `:unreadable` slot; the `/code-review` cleanup
findings (flash-chooser helper, test-file dedup, `loadDraftSlot` over-parse — the
over-parse likely dissolves naturally when the resolution rule lands).
