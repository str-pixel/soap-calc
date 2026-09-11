# Fragrance & colorants: a section per process — design

> **Superseded in part (2026-09-10/11):** the typed allergen rows and the typed supplier ceiling
> (`supplierMaxPercent`, `fragranceOverSupplierMax`, the `fragrance_over_supplier_max` and
> `fragrance_no_supplier_rate` insights) were removed at the user's request. What an oil carries and
> the most of it a soap may hold now come off the essential-oil catalog (`packages/core/src/
> essential-oil-catalog.ts`: IFRA's standards and constituent annex, EU Annex III, the SCCS). This
> document is kept as the design record of what shipped on 2026-09-08.

**Status:** approved in brainstorming 2026-09-08; awaiting spec review.
**Adds:** a first-class *Fragrance & colorants* section (CP/HP/LS) with its own state,
core math, manifest/steps/sheet/pricing outputs, and EU dose/allergen guardrails.
**Moves:** fragrance out of the additive catalog (migrated on load). Eugenol stays an additive.

## Why

Research, verified against the sources and the code at `16fe55d`:

- The additives audit (2026-09-07) found colorants have no sourced dose in the books — CP
  says "no set amount" and then gives a rule of thumb whose own worked example disagrees
  with it (0.1% stated, 4 g per 450 g ≈ 0.89% shown; CP:9389–9391) — and the trade doses
  by volume (½–2 tsp per lb of oils; mica density 1.6–2.4 g/tsp makes 1 tsp/lb ≈ 0.35–0.53%
  of oils). Every percent is derived. Colorants therefore stayed out of the catalog and need
  a surface that can carry a range, a dispersal method, a portion split, and honesty.
- Fragrance is dosed against a *rate the supplier tests*, on total oil weight, never a flat
  percent of soap weight or teaspoons (CP:9565–9614). Vanillin predicts browning and sets the
  stabilizer ratio (CP:9727–9797). HP adds fragrance after the cook at room temperature
  (HP:11024–11029); LS doses against the finished solution and needs polysorbate 20 with a
  superfat and a small-solution clouding test (LS:16987–16998). The additive catalog can hold
  a dose but none of the rest.
- EU/IFRA: limits are a maximum concentration **in the finished consumer product, not in
  the fragrance mixture** (IFRA 51st Amendment guidance p. 11; bar soap, liquid soap, body
  washes and shampoo are all Category 9). Annex III of (EC) 1223/2009 names allergens on the
  label above **0.01% of a rinse-off product**; Regulation (EU) 2023/1545 extends the list
  (82 per secondary sources; EUR-Lex blocks automated reading) for products placed on the
  market from 31 July 2026, with sell-through to 31 July 2028. A "% of oils" dose compared to
  a "% of product" max overstates the risk: with CP's 15% cure loss, 5% of oils on a
  1000 g-oils / 140 g-lye / 330 g-water batch is 3.85% of the finished bar (the bar's weight
  includes the fragrance; the test uses the calculator's own figures).

## Decisions (all user-made)

1. **Approach A**: a first-class section with its own `scentColor` state beside `additives`.
2. **Colorants**: rows per colour with an **optional portion split** (CP/HP); LS has no portions.
3. **Colorant dose**: weight % of the portion's oils, **empty by default** ("to shade"), with a
   sourced range as guidance per kind; never a seeded number.
4. **Fragrance**: blend rows with kind, %, supplier max, vanillin %, and an **allergen
   declaration**; browning + stabilizer computed; the guard compares against the **finished
   product**.
5. **Fragrance moves** out of the catalog; a saved fragrance additive line migrates on load.
6. **EU allergen labelling in scope**: allergens above 0.01% of the finished product are
   listed as "name on the label".
7. Guidance renders in the **active weight unit** (per lb ↔ per kg; oz ↔ g).
8. Out of scope for v1: the lye-steeping colorant route (it changes the lye figures), oil-infusion
   substitution, indigo (a 12× supplier spread — "test your product"), gel-phase colour
   prediction.

## 1. Data model, persistence, migration

```ts
type FragranceLine = {
  key: string; name: string;
  kind: 'fragrance-oil' | 'essential-oil';
  percent: string;              // of total oil weight (CP/HP) or of finished solution (LS)
  supplierMaxPercent: string;   // IFRA Category 9 rate, % of finished product; '' = unknown
  vanillinPercent: string;      // '' = unknown/none
  allergens: Array<{ key: string; name: string; percentOfFragrance: string }>;
};
type ColorantLine = {
  key: string; name: string;
  kind: 'mica' | 'oxide' | 'natural' | 'dye' | 'other';
  percent: string;              // of the PORTION's oils; '' = to shade
  portionKey: string;           // '' = whole batter
};
type Portion = { key: string; name: string; percent: string };   // share of the batter (= of the oils; batter is uniform)
type ScentColor = { fragrances: FragranceLine[]; colorants: ColorantLine[]; portions: Portion[] };
```

Derived at compute time, **never stored**: the stage (fragrance — CP trace / HP after cook /
LS after dilution; colorant — in CP and HP a whole-batter colour goes into the oils and a
portion colour at the design stage, CP trace CP:9401–9404, HP after cook HP:11330–11334; in
LS every colorant goes in after dilution, LS:13262 — there are no portions and nothing goes
into the oils), the dose basis (oils vs solution), and the dispersal method (CP 1:1 carrier
oil CP:9395–9400; HP 7–14 g hot water plus a little sugar HP:11319–11321, or the PCSF oil
HP:11300–11302; LS dyes in a little warm water LS:13256, micas settle LS:13390). A recipe
changing process can never carry a stale one.

**Persistence.** Draft slots gain an optional `scentColor` (older drafts load empty). The
recipe file becomes **version 3** with a `scentColor` field; `parseRecipeFile` keeps accepting
v1 and v2 (the v2 parser builds its payload field by field, so a bump is the honest signal).
Normalization mirrors additives: percents through the existing percent-of-oil parser, portions
clamped 0–100, a colorant whose portion was deleted returns to `''`, unknown keys dropped.
Portions summing past 100% raise an insight, never a silent rescale.

**Migration.** The `fragrance` catalog entry is removed. One lib function,
`extractLegacyFragrance(rawAdditives) → { additives, fragrances }`, runs in the storage hook
on the **raw** saved/file additives — before `normalizeAdditiveLine`, which clears unknown
catalog ids — for both the draft and the import path. A `fragrance` line becomes a
`FragranceLine`: name carried; `percent` carried only for basis `oil` (CP/HP) or `solution`
(LS) with unit `percent` — the bases the section derives for those processes; a `batch`-basis
or `ppt` line keeps its name with `percent: ''`. The additive line's `addAt` is dropped: the
section derives the stage, and the audit had already retired the other routes. The import
notice rides the existing `importRoutingSuffix` message. Eleven tests that used `'fragrance'`
as their canonical multi-stage / solution-dosing example move to `silk` and `pearlizer`.

## 2. Core math (`@soap-calc/core`, pure; formatting stays in web)

**`fragrance.ts`**
- `fragranceGrams(percent, basisGrams)` — `% × total oil grams` (CP/HP, the same oil basis
  additives use: `recipeOilWeightGrams`) or `% × finished solution grams` (LS; 0 when no
  dilution resolves). CP:9612–9614.
- `fragranceShareOfProduct(fragranceGrams, productGrams)` — *product* is the label (cured)
  weight for bars (`vm.labelWeight`: cure loss on the base batter only, extras kept) and the
  bottled solution for LS; falls back to the raw batch weight, labelled as such, when no
  process variant resolves.
- `fragranceOverSupplierMax(shareOfProduct, supplierMax)` — silent when the max is unknown;
  the companion `fragrance_no_supplier_rate` insight fires only when a row has a dose and no
  max.
- `essentialOilCaution(kind, name)` — only for `essential-oil` rows whose name contains
  clove or cinnamon, the two the text names (eugenol, cinnamaldehyde): accelerant and
  irritation, CP:9531–9537, 9589–9592. A fragrance oil named "Cinnamon bun" is not an
  essential oil and never triggers it.
- `vanillinBrowning(vanillin)` → `'none' | 'light' | 'deep'` (light at ≤ 1%, CP:9740; deep
  above) and `vanillaStabilizerGrams(fragranceGrams, vanillin)` — 1:2 up to and including 10%
  vanillin, 1:1 **above** 10% (CP:9789–9792); mixed into the fragrance first (CP:9788–9789,
  HP:11027–11029). Antioxidants fail past 1% vanillin (CP:9769–9770); stabilized soap still
  browns in time (CP:9793–9796).
- `allergensToLabel(rows, productGrams)` — each allergen's share of the product =
  Σ over rows (percentOfFragrance/100 × fragranceGrams) / productGrams; flagged when it
  **exceeds** 0.01% (Annex III, rinse-off). The same allergen from two rows sums, matched on
  the name as typed (trimmed, case-insensitive); the app echoes the supplier's declared
  INCI name and never renames it.
- LS: `polysorbate20Grams = fragranceGrams` when the recipe carries a superfat — the vm's
  delivered superfat above 0 (equal parts, LS:16987–16989); perfumer's alcohol is a note, not
  a dose (LS:16991–16998).

**`colorants.ts`**
- `colorantGrams(percent, portionOilGrams)` where `portionOilGrams = totalOil × portion% / 100`
  (whole batter → total oils). The book's rate is stated for a single-colour soap; dosing each
  portion against the whole recipe's oils would colour a three-way swirl three times over —
  "colour the soap, not the lather" (CP:9378–9379). Empty percent → no grams, row lists as
  "to shade".
- `colorantDispersal(process, kind, colorantGrams)` → carrier grams where a figure exists
  (CP 1:1 by weight), the 7–14 g water range for HP, a note for LS.
- **Carrier oil is a superfat shift**, surfaced through the existing
  `superfatShiftFromLiquidFat` pattern: at 1% colorant, +1.0 superfat point.
- `colorantStage(process, hasPortion)` — CP/HP: `oils` for the whole batter, `trace` /
  `after_cook` for a portion; LS: always `after_cook` (after dilution).
  `portionsTotalPercent(portions)` with `over100`.
- Guidance ranges per kind, unit-aware: micas/oxides "about ½–1 tsp per lb of oils — roughly
  0.2–0.5% by weight at a typical mica density, up to about 0.9% for a dense pigment (the
  cold-process text's own example); density varies by product, start low" (CP:9389–9391 +
  supplier density 1.6–2.4 g/tsp, URL and retrieval date in the code comment: ½ tsp/lb =
  0.18–0.26%, 1 tsp/lb = 0.35–0.53%, 4 g/450 g = 0.89%); oxides brown and red at half; LS
  has no range at all — dyes are "to shade", and micas/oxides carry the settling note.
- HP's sugar-water carrier adds a little sugar; it is **not** counted toward the sugar-family
  ceiling (a pinch per colorant, HP:11319–11321).

## 3. The panel, per process

**Placement.** Column 1 under Additives as **06 Fragrance & colorants**; Bar properties → 07,
Fatty acid profile → 08, Results → 09, Dilution → 10 (no test pins a number).

**Fragrance list.** `+ Add fragrance` → row: name, kind seg (*Fragrance oil* / *Essential oil*),
dose labelled **% of oils** (CP/HP) or **% of solution** (LS), *supplier max (IFRA Category 9,
% of finished product)*, *vanillin %*, computed grams, then the fixed stage label (*At trace* /
*After cook* / *After dilution*) and the notes that apply: **over the supplier's rate** (hazard
style, shown with both readings — "3% of oils → 2.3% of the finished bar; supplier max 5%"),
**browning light/deep** with stabilizer grams, the clove/cinnamon caution, LS polysorbate 20
grams and the clouding note. An *Allergens* disclosure per row (name + % of fragrance,
add/remove) feeds the **"name on the label"** list. Blend footer: total % and grams. Process
copy: CP — dose against total oil weight, the supplier's rate is the ceiling, the flashpoint is
not a soaping limit (CP:9844–9860); HP — room temperature, stabilizer may thicken; LS — prove
a new fragrance in a small solution. Regulatory copy (the 0.01% rule, 31 July 2026 / 2028,
CPSR) carries "checked 2026-09-08" in code.

**Colorant list.** `+ Add colorant` → row: name, kind seg (*Mica / Oxide / Natural / Dye /
Other*; LS seeds *Dye*; every kind stays selectable in LS, micas and oxides with the settling
note), dose **% of oils** starting empty with the kind's guidance range in the active unit
(none in LS), and — CP/HP only — a **portion** select. Beneath: grams (when dosed), the
dispersal line, the superfat-shift note for a CP carrier, and the fixed stage.

**Portions (CP/HP).** `Split the batter` → rows (name, % of batter), running total, over-100
warning; deleting a portion returns its colorants to *Whole batter*. Hidden in LS.

**What stays out.** Clays, charcoal, cocoa, botanicals, titanium dioxide and eugenol remain
Additives; one hint line says so. The Additives empty-state hint no longer names fragrance and
its type select no longer offers it.

## 4. Outputs

- **View model:** one memo computes `computedFragrances` and `computedColorants`; fragrance,
  stabilizer, polysorbate, colorant and carrier grams join `extrasGrams` → batch weight, label
  weight and the LS bottle, as additive grams do; the carrier's superfat shift joins the
  liquid-fat shift.
- **Full recipe:** section = *when*. In CP/HP a whole-batter colorant lists inside **Oils**
  ("Yellow oxide — 4 g, in 4 g carrier oil") and portion colorants get a **Colorants** section
  at the design slot grouped by portion ("Portion A — 40 %: …"); in LS every colorant lists in
  the after-dilution slot beside the fragrance; a **Fragrance** section at the fragrance slot
  lists each row (grams · %), then *Vanilla stabilizer — N g*, LS *Polysorbate 20 — N g*, and a
  **Label allergens** line.
- **Steps:** the step plan hosts the new rows under the same exhaustiveness test — CP oils
  step names the base colour, the trace step the fragrance and the portion split; HP after-cook
  step the fragrance (stabilizer premixed) and portion colours in hot sugar water; LS dilute
  step the dyes and the fragrance (+ polysorbate).
- **Batch sheet:** a *Fragrance & colorants* section through the same line formatters as the
  manifest, plus the portion table and the label-allergen list.
- **Pricing:** rows priced through the existing book, keyed `fragrance:name:<lower>` /
  `colorant:name:<lower>`; stabilizer, polysorbate and `carrier-oil` fixed keys. The Pricing
  panel lists them under their own *Fragrance & colorants* group, and its "prices missing"
  count includes them.
- **Insights (core):** `fragrance_over_supplier_max` (warn), `fragrance_no_supplier_rate` (info),
  `fragrance_vanillin_browning` (info), `fragrance_accelerant_eo` (CP info),
  `fragrance_allergens_to_label` (info), `colorant_portions_over_100` (warn),
  `ls_fragrance_clouding` (info).

## 5. Tests

- **Core:** 1000 g × 3% = 30 g; stabilizer 15 g at 5% vanillin, 30 g at 12%, 1:2 at exactly 10%;
  browning light at 1.0%, deep at 1.1%; carrier 1:1 → +1.00 point at 1%; HP water 7.1–14.2 g;
  portion dosing (40% portion at 1% of 1000 g → 4 g, not 10 g); `over100`; share of product
  for 5% of oils computed from the calculator's own CP figures (≈3.85% for a
  1000/140/330 g batch); LS `colorantStage` is after dilution; allergen table — 12% → label, 0.5% → label
  (0.0117%), 0.4% → not (0.0094%), exact 0.01% → not, two rows sharing one allergen sum; LS uses
  the solution as denominator. Every constant asserted against its cited line.
- **Persistence:** v1/v2/v3 round-trip; v2 without `scentColor` loads empty; a `fragrance`
  additive in a v2 file and in a draft migrates **before** normalization and leaves
  `additives`; `batch`/`ppt` lines migrate with an empty percent; the import message names it.
- **View model:** extras include every new gram; label weight and bottle include them; the
  superfat shift equals carrier over oils; LS fragrance grams are 0 without a dilution.
- **Panel:** per-process labels and fields; portions hidden in LS; LS seeds *Dye*; over-max,
  browning, stabilizer and allergen list render; unit-aware guidance (lb vs kg); the Additives
  type select no longer offers fragrance.
- **Manifest/steps/sheet:** whole-batter colour inside Oils; portion colours at the design slot;
  fragrance at its slot with the stabilizer and allergen lines; step-plan exhaustiveness covers
  the new hosts; the sheet mirrors via shared formatters.
- **e2e:** CP — a vanillin fragrance with an allergen over threshold and a two-portion split,
  assert the Full recipe sections and the label line; HP — after-cook placement; LS —
  `% of solution` label and a dye after dilution.

## Citations

`CP:<line>` / `HP:<line>` / `LS:<line>` into the extracted texts. Web sources (IFRA 51st
Amendment guidance PDF; Annex III mirror; COSlaw/SGS/ecomundo summaries of 2023/1545; supplier
density FAQ) are cited in code comments with URL and retrieval date 2026-09-08; supplier names
never appear in user-facing copy.
