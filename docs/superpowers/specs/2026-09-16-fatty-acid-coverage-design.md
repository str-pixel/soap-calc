# Fatty-Acid Coverage — Lower-Bound Readings and Chemistry-Led Categories

**Date:** 2026-09-16
**Status:** Implemented 2026-09-16, uncommitted. Figures below re-measured through the
shipped code path on one identical case set (53,100 cases, the pre-change ingredient partition).
**Measured against:** the built catalog (133 ingredients), the real cure thresholds
(`cure.ts` 15 / 25) and the real verdict bands (`SOAP_PROPERTY_GUIDE`). Every figure below
was produced by running the numbers, not estimated.

## Problem

When a recipe contains an ingredient with no fatty-acid profile, the app raises rancidity
warnings the recipe does not support. Across 53,100 cases — all 118 property-ready oils ×
all 15 ingredients the app treats as "no data" × 10 blend ratios × 3 published-truth levels
for the missing ingredient — today's reading is:

| reading | exact | false alarms | misses |
| --- | --- | --- | --- |
| today (renormalised) | 83.2% | **16.3%** | 0.5% |

A false alarm here is the app warning harder than the recipe's true composition warrants:
a "use within" shelf window, or a rancidity caveat, on a bar that does not need one.

## Root cause

`calculateRecipeFattyAcids` divides the summed profile by **covered** weight
(`fatty-acids.ts`, `profile[acid] /= coveredWeight`) — the weight of oils that have data —
not by the recipe's total oil weight. Every missing gram is therefore redistributed across
the oils that do have data, inflating every percentage by `1 ÷ covered share`. A recipe
that is 10% unprofiled reads its PUFA 11% high; at 30% unprofiled, 43% high.

That is correct for one of the three jobs this single profile does, and wrong for another:

| consumer | what it needs | covered-weight basis |
| --- | --- | --- |
| the six 0–100 scores (`oilPropertiesFromFattyAcids`) | a *relative* measure | **correct** |
| the 09 panel bars | percent of *something*, stated | correct, with the caption |
| cure's 15/25 and the three rancidity insights | an *absolute* percentage | **wrong** |

The 80% coverage gate added in 268cf29 was a patch over the third row: below 80% the three
insights stand down and cure prints a caveat. It does not make the number right, and above
80% nothing is gated at all — that band alone carries 642 false alarms in the test set.

## The obvious fix is wrong — measured

Changing the division to total weight *is* the lower bound mathematically, and it is what
the absolute thresholds want. But the same profile feeds the 0–100 scores, and there it
deflates every score by the missing share. Measured over 17,700 recipes × 5 judged
properties = 88,500 readings:

**19,485 verdicts change (22.0%), of which 8,460 flip "in range" → "Too low".**

| property | verdicts corrupted |
| --- | --- |
| condition | 9,735 |
| creamy | 4,830 |
| hardness | 3,555 |
| bubbly | 1,005 |
| cleansing | 360 |

A bar with 15% beeswax genuinely is hard; we simply cannot break its hardness into acids.
Deflating its scores to punish the gap is a worse error than the one being fixed. **The fix
must be a second quantity, not a changed division.**

## Design

Add the covered share to `RecipeFattyAcidResult` and derive an absolute PUFA from it. The
renormalised profile is untouched, so every score, bar and snapshot test stays put.

```ts
export type RecipeFattyAcidResult = {
  profile: FattyAcidProfile | null;   // unchanged: renormalised over covered weight
  coveragePercent: number;            // unchanged
  missingOilIds: string[];            // unchanged
  /** Covered oil weight ÷ total oil weight (0–1). Multiply a renormalised percentage by
   *  this to get a CERTAIN LOWER BOUND on the whole recipe: unprofiled oils contribute
   *  zero. Only absolute thresholds may use it — the 0–100 scores are relative and must
   *  keep reading the renormalised profile. */
  coveredWeightShare: number;
};
```

Cure and the three rancidity insights then judge `pufa × coveredWeightShare`. Because the
bound can only understate, it cannot over-warn — the false-alarm rate is 0% by construction,
not by tuning.

### Accuracy of each option, same 53,100 cases

| reading | exact | false alarms | misses |
| --- | --- | --- | --- |
| before (renormalised) | 83.2% | 16.3% | 0.5% |
| bound + category fix | 97.6% | **0%** | 2.4% |

Retiring the abyssinian exclusion removes 556 of the 595 remaining misses. On the shipped
catalog's own population (26,460 cases, seven unprofiled ingredients left — all true waxes, wax
esters and tars) the reading is now **99.85% exact, 0% false alarms, 0.15% misses**.

Both rows are the real code over the same 53,100 recipes. An earlier simulation projected 98.2%
for this row by also crediting a completed abyssinian profile, which was not sourced and did not
ship; and a first end-to-end run reported 98.0% by measuring the shipped system over its OWN
(smaller) ingredient partition rather than the pre-change one, which is not a like-for-like
comparison. 97.6% is the figure on an identical case set.

## The category fix

81% of the lower bound's only weakness (its 1,298 misses) comes from two ingredients that
have real PUFA and are wrongly excluded from the data: abyssinian oil (556) and commercial
oleic acid (493). Both are excluded by **name patterns, not chemistry**.

Saponification value — already stored for every ingredient — separates the two groups with
a 56-point gap and no ambiguity:

```
candelilla 49 · tars 60 · carnauba 87 · jojoba 92 · beeswax 94 · lanolin 106
              ←——— 56-point gap, nothing in it ———→
nutmeg butter 162 · abyssinian 168 · meadowfoam 169 · rapeseed 175 · soy-FHSO 192 · japan wax 215
```

Everything at or below 106 genuinely cannot be broken into fatty acids. Everything at or
above 162 can. The current rules put three ingredients on the wrong side:

- **abyssinian-oil** — hard-coded into `WAX_ESTER_OIL_IDS` under a comment reading
  *"do not infer from incomplete fatty-acid sums"*, which is precisely why it is there: its
  stored profile sums to 38. Its SAP of 168 is meadowfoam's 169, not jojoba's 92. An
  independent measured analysis of raw Abyssinian oil (Molecules 2018, PMC6320842) reports
  SAP **170.5 mg KOH/g** and erucic **63.77%** — confirming both that it saponifies as a
  triglyceride and that the missing 62 points are erucic, an acid already modelled in 7
  other oils. Rapeseed (high erucic), the same chemistry, sits at SAP 175 with a complete
  profile summing 100.
- **japan-wax** (SAP 215) and **soybean-fully-hydrogenated** (192) — triglycerides caught by
  the `/wax|beeswax|candelilla|carnauba|lanolin/i` pattern in `normalize.ts` because their
  common names contain "wax".
- **the five free acids** (SAP 197–280) — profiles are complete and definitional (stearic
  acid is 99% stearic). Excluded by a `category === 'free_acid'` test. Their `sapRole` is
  *not* `acid_neutralization` (only the two tars carry that), so the validator rule
  forbidding property data on neutralised entries does not apply to them.

Proposed rule, enforced at build time so it cannot drift: an ingredient whose SAP is in the
triglyceride/free-acid cluster **must** carry a usable profile, and one below the gap must
not. A mismatch is a build error naming the ingredient — never a silent inference.

Abyssinian needs its erucic entered as a cited `PROFILE_BACKFILL` entry before it can be
reclassified; the placeholder used in the measurement (erucic 57, giving a sum of 95 and a
profile-derived iodine of ~90 against a stored 98, inside the 15% gate) is **not** a source
and must be replaced with a real one.

## An asymmetry worth deciding deliberately

The lower bound is conservative about **whether** to warn and optimistic about **how long**
the shelf window is. `shelfKnees` maps higher PUFA to a shorter window, so feeding it a
lower-bound PUFA produces a *longer* "use within" window than today's reading — the less
cautious direction. The cautious combination is to let the bound decide whether the flip
happens, and today's higher reading size the window once it has.

## What this does not do

It does not ingest anything. The PlantFAdb licence question (GPL-3.0, MSU copyright, an
upstream whose own site no longer resolves, against a repo with no licence file that ships
its catalog to browsers) stays open and stays blocking for bulk import — but nothing here
depends on it. The only new datum required is one cited profile for one oil, through the
backfill mechanism the repo already uses.

It also leaves profile *incompleteness* alone. 12 of 118 oils sum below 95%, 5 below 93%
(sea buckthorn 69, macadamia butter 79, sheep tallow 82, bear tallow 91, avocado butter 92).
Incompleteness deflates rather than inflates, so it costs precision, not safety — and
several of those are butters and blends whose identity is ambiguous in any source.

> **2026-09-19:** those five, plus japan wax (92%), were removed from the catalog outright
> rather than left short — see `sources/excluded-oils.json`. Three are blends or butters of
> unknown formula that no analysis can honestly complete, two are animal fats (sheep tallow's
> stearic looked wrong, not merely truncated), and japan wax's balance is dibasic acids the
> model has no key for. The sweep's pre-change population is 47,460 cases as a result; the
> bound's figures did not move.

## Decisions settled

- **A — scope: absolute thresholds only.** Decided on evidence, not size. The scores cannot
  follow the bars onto a whole-recipe basis (that is the 22% corruption above), so switching
  the bars alone would leave 08 and 09 on *different bases while showing the same acids*:
  they would visibly disagree by more than 5 points in 49% of readings, and the
  Saturated/Unsaturated line would stop reading as a decomposition of the fat (it prints
  93–100% for 113 of 118 oils today; 69% at 30% unprofiled). What that buys is deleting a
  caption that already states the basis exactly. Bad trade — the bars stay as they are.
- **B — the bound applies at every coverage level**, and the 80% rancidity gate retires with
  it. The gate exists to suppress a number that could over-warn; a bound that cannot
  over-warn does not need suppressing. Above 80% this trades 642 false alarms for 93 misses.
- **C — the SAP rule ships for seven ingredients; abyssinian is deferred.** See below.
- **D — "use within" is sized from the renormalised reading**, not the bound. The bound
  decides *whether* to flip; the higher figure sizes the window, so partial data never buys
  a longer shelf-life promise.

### Why the seven are worth reclassifying — and it is not rancidity

Reclassification only improves a rancidity reading if the ingredient's stored profile
actually carries PUFA. Checked across all fifteen: **only abyssinian does** (linoleic 11 +
linolenic 4). Japan wax, fully hydrogenated soy and the five free acids all carry zero, so
counting them changes no rancidity verdict at all.

Their real cost is in the bar properties, and it is much larger. For recipes containing
them — 4,956 combinations across the ratio ladder — **27.6% of property readings are wrong
today** (6,845 of 24,780), because the app drops the ingredient from the scores entirely:

| property | median score error today | verdicts corrected |
| --- | --- | --- |
| condition | +8.7 overstated | 1,638 |
| hardness | −8.9 understated | 1,467 |
| creamy | −4.3 understated | 1,822 |
| cleansing | — | 1,053 |
| bubbly | — | 865 |

A bar with 20% stearic acid genuinely is harder than the app says. All seven profiles are
already stored, complete (sums 92–100) and need no new data.

### Abyssinian: retired, not deferred

This shipped deferred at first, because no source carrying a complete profile could be read:
Europe PMC held only transgenic lines, the CIR oils report is a 2010 scan with no text layer,
supplier specs give envelopes rather than profiles, and both the definitive characterisation
(Lalas et al. 2012) and the USDA Cruciferae survey (Mikolajczak et al., JAOCS 1961,
doi:10.1007/bf02633053) are paywalled.

The route that worked was theses. Wageningen ran a crambe breeding programme and its theses are
open access with real text layers. **Cheng (doi:10.18174/305620), Table 1** measures the seed-oil
composition of six commercial crambe varieties grown in the field at Wageningen in 2007, two
blocks each, in duplicate — primary data, read directly from the full text. Its mean is oleic
18.81, linoleic 9.39, linolenic 6.24, erucic 59.69, normalized to 100 for the backfill.

The repo's own oracles confirm it independently, which is what makes this more than a plausible
table: the profile derives **SAP 169.9 against the stored 168 (+1.1%)** and **iodine 97.8 against
the stored 98 (−0.2%)**, and a laboratory measurement of raw Abyssinian oil reports SAP 170.5
(Molecules 2018, PMC6320842). Iodine is a sharp test here — it is sensitive to the
erucic/oleic/PUFA balance — and 0.2% is not a coincidence. The legacy 38% profile, by contrast,
maps below `MIN_MAPPED_PERCENT` and derives no chemistry at all.

An alternative itemised profile including the saturates (Li, doi:10.18174/311403, Table 1.1) was
rejected: it is an uncited compilation in that thesis's introduction rather than a measurement,
and its iodine misses by 6.0%. The cost of preferring Cheng is that its four named acids leave an
unbroken "Others 5.9%", so the saturates go unrepresented and hardness reads 0 for this oil
against a true ~3 — understating, never overstating.

`PROFILE_TOO_INCOMPLETE_TO_USE` is now empty, and kept so: an entry in it is a debt, and
`validate-canonical` requires one before it will allow an ingredient that contributes fatty acids
to be dropped from the scores.

## An asymmetry worth deciding deliberately

The lower bound is conservative about **whether** to warn and optimistic about **how long**
the shelf window is. `shelfKnees` maps higher PUFA to a shorter window, so feeding it a
lower-bound PUFA produces a *longer* "use within" window than today's reading — the less
cautious direction. The cautious combination is to let the bound decide whether the flip
happens, and today's higher reading size the window once it has.

## What this does not do

It does not ingest anything. The PlantFAdb licence question (GPL-3.0, MSU copyright, an
upstream whose own site no longer resolves, against a repo with no licence file that ships
its catalog to browsers) stays open and stays blocking for bulk import — but nothing here
depends on it. The only new datum required is one cited profile for one oil, through the
backfill mechanism the repo already uses.

It also leaves profile *incompleteness* alone. 12 of 118 oils sum below 95%, 5 below 93%
(sea buckthorn 69, macadamia butter 79, sheep tallow 82, bear tallow 91, avocado butter 92).
Incompleteness deflates rather than inflates, so it costs precision, not safety — and
several of those are butters and blends whose identity is ambiguous in any source.

> **2026-09-19:** those five, plus japan wax (92%), were removed from the catalog outright
> rather than left short — see `sources/excluded-oils.json`. Three are blends or butters of
> unknown formula that no analysis can honestly complete, two are animal fats (sheep tallow's
> stearic looked wrong, not merely truncated), and japan wax's balance is dibasic acids the
> model has no key for. The sweep's pre-change population is 47,460 cases as a result; the
> bound's figures did not move.

## Decisions settled

- **A — scope: absolute thresholds only.** Decided on evidence, not size. The scores cannot
  follow the bars onto a whole-recipe basis (that is the 22% corruption above), so switching
  the bars alone would leave 08 and 09 on *different bases while showing the same acids*:
  they would visibly disagree by more than 5 points in 49% of readings, and the
  Saturated/Unsaturated line would stop reading as a decomposition of the fat (it prints
  93–100% for 113 of 118 oils today; 69% at 30% unprofiled). What that buys is deleting a
  caption that already states the basis exactly. Bad trade — the bars stay as they are.
- **B — the bound applies at every coverage level**, and the 80% rancidity gate retires with
  it. The gate exists to suppress a number that could over-warn; a bound that cannot
  over-warn does not need suppressing. Above 80% this trades 642 false alarms for 93 misses.
- **C — the SAP rule ships for seven ingredients; abyssinian is deferred.** See below.
- **D — "use within" is sized from the renormalised reading**, not the bound. The bound
  decides *whether* to flip; the higher figure sizes the window, so partial data never buys
  a longer shelf-life promise.

### Why the seven are worth reclassifying — and it is not rancidity

Reclassification only improves a rancidity reading if the ingredient's stored profile
actually carries PUFA. Checked across all fifteen: **only abyssinian does** (linoleic 11 +
linolenic 4). Japan wax, fully hydrogenated soy and the five free acids all carry zero, so
counting them changes no rancidity verdict at all.

Their real cost is in the bar properties, and it is much larger. For recipes containing
them — 4,956 combinations across the ratio ladder — **27.6% of property readings are wrong
today** (6,845 of 24,780), because the app drops the ingredient from the scores entirely:

| property | median score error today | verdicts corrected |
| --- | --- | --- |
| condition | +8.7 overstated | 1,638 |
| hardness | −8.9 understated | 1,467 |
| creamy | −4.3 understated | 1,822 |
| cleansing | — | 1,053 |
| bubbly | — | 865 |

A bar with 20% stearic acid genuinely is harder than the app says. All seven profiles are
already stored, complete (sums 92–100) and need no new data.

### Abyssinian: deferred, with the reason recorded

Reclassifying abyssinian needs its erucic entered first, and no open source carries a
complete profile:

- Europe PMC holds only transgenic and enzymology work; the single wild-type profile
  (PMC3664313, WT1: 18:1 14.9, 18:2 7.4, 18:3 6.1, 20:1 2.9, 22:1 58.4, 24:1 1.2) omits
  saturates entirely and is one seed measured by peak area.
- The CIR plant-derived oils report is a 2010 scan with no text layer.
- Supplier specs give ranges far too wide to midpoint (oleic 10–35%, linoleic 3–24%,
  C22:1 35–65%) and omit saturates — a validator envelope, not a profile.
- The fullest profile located is the USDA Northern Regional Research Laboratory survey —
  Mikolajczak, Miwa, Earle, Wolff & Jones, "Search for new industrial oils. V. Oils of
  Cruciferae", JAOCS 1961, doi:10.1007/bf02633053 — erucic 59.0, oleic 18.0, linoleic 11.0,
  linolenic 4.0, palmitic 2.0, stearic 0.5, plus small C20–C22 (sum 100.1). Our stored
  oleic/linoleic/linolenic match it exactly at 18/11/4, but palmitic (3 vs 2.0) and stearic
  (2 vs 0.5) do not, so the legacy row is **not** a straight truncation of it. It is paywalled
  and was not read.
- The definitive characterisation (Lalas et al. 2012, JAOCS, doi 10.1007/s11746-012-2122-y)
  is paywalled and was **not** read; its numbers are therefore not cited here.

Finding those citations went wrong once in a way worth recording: in the PlantFAdb dump,
`PLANTS_PUBS.PUB_ID` resolves into `PUBS`, **not** `PUBLICATIONS`. The two tables share an id
range, so the wrong lookup returns a different paper silently — it produced a confident citation
to a *Salvia* record, and a "the source looks sloppy" conclusion that was purely the join error.
Check that a join resolves for every row before trusting anything it returns.

Until one source carries a complete profile that someone has actually read, abyssinian stays
excluded. Measured on the shipped code, it accounts for **556 of the 1,298 remaining misses** —
misses, never false alarms, so the bound stays safe. (An earlier draft said "428"; that was the
*difference* a simulation projected between deferring and completing it, using a placeholder
erucic value, not a measured figure. 556 is what the shipped system actually costs.) The build-time SAP check must therefore allow a named, documented
exception rather than failing on it.

## The figures in this document are executable

Every number quoted above is produced by a committed test, because three of them were wrong when
they were produced by throwaway harnesses instead:

- `packages/web/src/lib/fattyAcidLowerBound.test.ts` sweeps both readings over **one** case set and
  reproduces 83.2 / 16.3 / 0.5 → 97.6 / 0 / 2.4 on the 53,100-case pre-change population. It also
  asserts the invariant directly — the bound never exceeds the true whole-recipe PUFA for any
  composition of the unprofiled oils — and names abyssinian as the largest remaining miss rather
  than quoting a count. Both readings come out of the real `estimateCureModel`, one with the share
  and one without, so it fails if cure stops applying it (mutation-checked).
- `packages/web/src/lib/propertyScoreScoping.test.ts` pins the boundary the prose kept blurring:
  the bound moves **no** score at any proportion of unprofiled weight, and the category fix moves
  them deliberately (a fifth to a third of verdicts for recipes containing the seven). It fails
  under the naive total-weight division (mutation-checked).

The populations are the thing to be careful with: the fix moves seven ingredients from "missing"
to "ready", so the catalog before and after describes different sets of recipes. Sweeping the
shipped catalog gives 30,000 cases on which the old reading raises 4,673 false alarms; sweeping
the pre-change one gives 53,100 and 8,667. Both are true; quoting one against the other is not.

## Test plan

Adversarial set built from the full input space, not hand-picked: every property-ready oil
crossed with every unprofiled ingredient across the ratio ladder, asserted against published
composition ranges for the missing ingredient. Plus mutation checks that each new test fails
against the pre-change behaviour, a regression assertion that **no** 0–100 score or panel bar
moves for any recipe, and a build-time test that a mis-declared category fails the build.
