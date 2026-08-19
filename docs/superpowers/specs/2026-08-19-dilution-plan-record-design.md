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
  a record *present* → record arm; else plan arm. "Present" follows
  `parseGradualWaterRecordGrams`'s documented contract exactly: non-blank and ≥ 0 —
  **zero is a record** (the pot before any water is Gradual's own starting entry, LS:1531).
  A 0 g record therefore takes the record arm: the batch that exists is the undiluted
  paste, and every figure — including the dose basis — describes it. The sheet's record
  rows print whatever record the rule reads; they can never disagree. The parser is
  unchanged. Record arm's pot is `weighedOrComputedPotGramsFor` (target-independent).
  The derived % readout is unclamped and display-only.
  The portion jar's precedence (jar-with-both-figures → jar) lives *inside* this one
  function as a scope parameter — decision 2's "one rule feeds every consumer" has one
  reading and one home.
- No schema change: no new fields, `RECIPE_FILE_VERSION` stays 2, exports round-trip
  against old builds unchanged.

## 2. Surface

**Whole batch:**

- *Plan row:* target % input; presets 1:1/2:1/2.5:1/3:1 as **one-shot setters** — a click
  computes `anhydrous/(pot×(1+r))·100` from the pot at click time — the pot being
  `weighedOrComputedPotGramsFor` (the panel's `potBasis`), the same pot ratio mode counts
  from today — rounded to 1 dp,
  clamped [1,99], written into the % field; it does not track later pot changes (the
  caption pattern "2:1 → 28.6%" says what it did). A stale gradual-written plan value
  (e.g. `33.85`) displays as-is with no preset highlighted — expected, not a bug.
- *Record row:* "Water added so far (g)" + readout ("finished so far", derived %).

While the record governs, the results grid follows it: "Finished so far" and the
inclusive ≈ Finished product / volume rows are record figures; the plan's
"Dilution water to add" / "Finished solution" rows stay rendered **labelled as plan**
(the batch-scope twin of the portion rule below) — three masses may be on screen only
because each carries its name.

**Custom amount:** the same two-row shape — plan sizing (amount to make → paste to weigh /
water to add; today's `lsPartialDilution` math) and the jar record (paste weighed out +
water added). **The batch record participates nowhere in portion scope** — sizing, jar
share basis, dose, ceiling and uses are jar-else-plan, never jar-else-batch-record
(decision 8's "records lead wherever they exist" is scoped: each record leads in its own
scope). The portion-scope ceiling/uses read the jar's resolved % when the jar governs,
with the record-arm wording from §4. The jar's anhydrous share remains a share of the
paste pot, as today — a live batch record does not re-base it; the two records describe
alternative framings and only one governs per scope. The plan grid stays rendered beside a filled jar record, labelled as plan;
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
  record arm: `pot + recordWater + (extras − the split-liquid mass the pot already
  holds)`. The record-arm pot (weighed reading or solids-aware corrected basis) already
  contains a split liquid's water AND solids, while `extrasGrams` carries the liquid's
  whole mass — the naive `pot + recordWater + extras` double-counts it (verified:
  4,700 g vs the correct 4,400 g on a 300 g-glycerin recipe; this generalizes
  `splitLiquidInBaseGrams`, `calculateAdditives.ts:257-259`, and is the same
  priced-a-solids'-worth-heavy bug that function's doc records fixing). Water-only
  subtraction on the bare anhydrous+cook fallback pot.
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
- **Additive `'solution'` dosing** uses the resolved *solution*, defined extras-free and
  preservative-free in both arms (decision 7): plan arm = `dilution.solutionGrams`
  (today's basis); record arm = pot + record water, **extras excluded**. The bottled
  figure (which includes extras) is explicitly NOT the basis — additive grams are extras,
  and dosing against a figure containing them is the circular double-count
  `calculateAdditives.ts:279-287` already warns about. Additive grams flow into batch
  weight and pricing as today.

## 4. Alert conversion (the correctness-critical part)

Every mode gate becomes a record-presence gate; suppressions stay keyed on renders, never
flags (this file has paid five times). Conversion table:

| Today | Becomes |
|---|---|
| `exceedsSolutionAlert` excludes ratio/gradual modes | renders only when plan governs |
| `pasteAlreadyPastTarget` excludes gradual | plan-governs only |
| solubility ceiling reads raw setting | reads resolved %; suppression structure unchanged. **Record-arm wording changes**: it may not say "this target" (the record arm has no target) — it describes the batch: "The batch so far is at N% — above what any recipe fully dissolves; keep adding water." |
| BatchSheet's three verdict notes lean on write-back having aligned target≈record | gated on plan-governs |
| gradual/ratio "not applied yet" notes | deleted (nothing to apply) |

**Interpolation rule:** every % interpolated into record-governed copy is the resolved %.
Two sites today read `dilution.soapConcentrationPercent` for caption text
(`DilutionPanel.tsx:2391, 2394`) while the uses matcher (`:409`) will read the resolved
figure — implemented literally, that prints "No common use calls for 30%" against a
46.2% match. Both must read the resolved %.

**Plan figures while the record governs:** the plan % input and any plan rows kept by
§2 render with an explicit plan label; when the plan is unreachable (pot > plan solution
or `targetExceedsPaste`) a **non-alert, plan-labelled caption** accompanies the plan
figures — gating the plan-claims must not resurrect a bare, unexplained "0 g". The
sheet's "That record makes … is what the saved N% target implies instead" contrast copy
survives deliberately — it is a labelled plan-vs-record comparison, not the §2
"reassurance framing".

Evidence bar: the alert matrix (fixtures × record-presence × readings × scope × liquid
states) captured before/after; changed cells must be exactly (a) the record-semantics
cells and (b) today's mode-suppressed no-record cells that legitimately gain plan-claim
alerts — mode is not an axis of the after-matrix, so the projection is: collapse today's
three modes to record-present/absent by the mode's own governing figure, then compare.
Zero same-claim doubling anywhere.

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
  `exceedsRemainingCeiling`, all `isRemaining` params, and in `ls-yield.ts` the
  `measuredPasteIsRemaining` field (`:130-140`) plus the remaining arms inside
  `:204-258` (~9 tests). Surviving explicitly: `measuredPasteGrams`,
  `wholeBatchPasteGrams`, the unmeasured-pot `pasteGrams` block (`:228-251`), and
  `lsPotAnhydrousShare` with its 5 tests (the weighed-jar caller keeps it live).
- `LS_SHAMPOO_NOT_RECOMMENDED` — its rationale (deliberate absence of a shampoo row)
  moves into a comment on `LS_DILUTION_TARGETS`.

## 6. Phases

1. **Foundations:** preservative w/w + the dosing/display figure split + `impossible`
   tier guard; the resolution function extracted and wired to reproduce current behaviour
   exactly (plan arm only); test-suite prep. Intended deltas, all dose-driven but each a
   distinct visible change: the dose grams themselves, the ≈ Finished product row and the
   sheet's finished figure (now inclusive), `lsFinishedVolumeMl`, and bottled-row
   visibility (effectively always-on with a dose). Everything else byte-identical.
2. **The atom, with one legal internal seam.** The forbidden boundary (rule cut over
   while write-back lives) exists only in batch scope — the jar never had a write-back.
   So: **2a** (atomic): batch-scope surface swap, write-back removal, record-first
   cutover, batch + sheet alert conversion — one commit series, one matrix. **2b**:
   portion mirror (two-row shape, jar precedence, plan-beside-jar labelling, portion
   alert cells) — reads the phase-1 function, crosses no forbidden line.
3. **Deletions** (section 5) + test retirements.

Each phase gates on `npm test` + e2e and gets an adversarial review. Phase boundaries
exist because phase 1's rule-under-live-write-back was shown to be a behaviour change if
cut anywhere else (stress-review, Surface 8).

## 7. Testing

- Blast radius (measured by describe-block reading): retire ~85–105 (mode mechanics,
  write-back, restore, widening, remaining) with an explicit list; rewrite ~90–110
  (surviving claims reworded; RED both directions each); ~180–200 untouched.
- New: resolution-rule unit tests (incl. the zero-record rule); w/w dose tests incl.
  `pct >= 100`; record-leads matrix cells; portion plan-beside-jar labelling;
  pinned-gram updates (`ls-preservatives.test.ts:104-118` figures become 10.10 / 20.10;
  `App.test.tsx:280-294`'s finished≈solution equality and dose≈1%×base both break in
  phase 1 and are rewritten against the split figures).
- e2e: the two gradual specs' *claims* survive but their scripts drive the deleted mode
  radio and must be rewritten; the dose-linearity spec survives; under w/w the
  `finished×0.01` comparison holds exactly against the inclusive figure.

## Out of scope (recorded follow-ups)

Recipe-aware solubility ceiling (the flat 40% is wrong on both tails — LS:1603, LS:1690,
LS:2181); recovery affordance for the `:unreadable` slot; the `/code-review` cleanup
findings (flash-chooser helper, test-file dedup, `loadDraftSlot` over-parse — the
over-parse likely dissolves naturally when the resolution rule lands).
