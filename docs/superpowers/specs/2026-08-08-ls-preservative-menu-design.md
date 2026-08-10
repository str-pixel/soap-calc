# LS Preservative Menu, Custom Entry, and Free Dose — Design Spec

**Date:** 2026-08-08
**Status:** Approved (brainstormed in-session; user decisions recorded below)
**Packages:** `@soap-calc/core` (ls-preservatives), `@soap-calc/web` (PreservativeSnippet, App, lib/recipe, BatchSheet, index.css, e2e)

## Problem

The Preservative snippet below the Dilution panel offers its four products as radio
buttons and **hard-clamps the dose**: type 2% for Suttocide A and the grams on screen are
silently computed at 1%. Three consequences:

1. **The list is closed.** A soapmaker holding any other bottle has nowhere to put it, and
   the snippet reads as "these four or nothing".
2. **The clamp rewrites arithmetic without consent.** `clampLsPreservativePct` returns the
   ceiling and the UI computes from that, so the printed mass is not the mass the entered
   dose implies. The alert explains the substitution, but the user cannot decline it.
3. **Nothing survives a reload.** The pick and the dose are session-local `useState` in
   `App`, deliberately kept out of the recipe — so a typed custom product name would
   vanish on refresh, and the batch sheet carried to the bench never mentions the
   preservative at all.

**What the snippet already does that this design must not break.** Its dose base is not
simply "the batch": `finishedGrams` follows the Dilution panel's scope toggle, and
`basisScope` (`'batch' | 'portion'`) names which of the two masses was resolved, so the
base row can say which it is and the empty state can ask for the right thing. That prop
exists because of a fixed bug its own doc records — the batch's mass was once used in
both scopes, so a 250 ml draw off a 4 kg batch was told to weigh in the batch's 40 g of
Suttocide, about 16% w/w in that bottle and sixteen times the EU ceiling. Everything
below leaves the scope machinery alone, and §5 is where it bites.

**User decisions (this session):**

| Question | Decision |
|---|---|
| Menu shape | `<select>` with `Custom…` first — the AdditivesPanel idiom, not the OilPicker combobox |
| Dose limits | Free entry, warn only. Grams always computed from the typed dose |
| Custom fields | Name + dose % only. No user-entered range |
| Persistence | Save with the recipe (settings, file round-trip, batch sheet) |
| List contents | Research further products, then: keep four, and say in the `Custom…` branch why the list is short |

## Research outcome: the list stays at four

The user asked for additional preservatives. A screen was run against primary and
practitioner sources. **No candidate passed.** Recorded here so it is not re-run blind.

| Candidate | Verdict |
|---|---|
| Benzyl alcohol blends (euxyl K 900 / K 903 / K 940) | Sources conflict; the majority put efficacy falling off between pH 5.5 and 8. Nothing documents pH 9–10. |
| Sodium benzoate, potassium sorbate, Geogard, Optiphen, Sharomix | Organic acids need their undissociated form and are inert at soap pH. Cosmetic chemist PhilGeis, Chemists' Corner "Preservative for pH 9-10 liquid soap": *"Organic acids would be useless in alkaline products, including liquid soap."* |
| Parabens (Phenonip, Germaben II) | Rated pH 3–8; parabens hydrolyse under alkali. |
| CMIT/MIT (Kathon CG) | Rinse-off cap 0.0015%; isothiazolinones unstable above ~pH 8.5. |
| Imidazolidinyl urea (Germall 115), diazolidinyl urea (Germall II), plain Glydant (DMDM hydantoin 55%) | Same chemistry as products already in the table, but rated 3–8/3–9 with no source documenting soap-pH use in their own right. Adding them is extrapolation, which this table has never done. `Custom…` covers them. |

Peer-reviewed work exists — Témoin-Fardini et al., *Int J Cosmet Sci* 2017,
`10.1111/ics.12401`, tested 27 preservatives against *Nesterenkonia lacusekhoensis*, the
bacterium responsible for spoiling alkaline saponified soap, and found 10 that protected
the formula — but the abstract names none of them and the paper is paywalled. If it is
ever obtained, it is the single best source for extending this table.

**Consequence for the design:** `Custom…` is not a convenience, it is the mechanism that
carries every product the table cannot cite. Its copy says so.

## Design

### 1 · Core: the clamp becomes a classifier

`packages/core/src/ls-preservatives.ts`. The four entries and their citation comments are
unchanged. What changes is the dose contract.

```ts
export type LsPreservativeDoseTier =
  | 'none'          // blank, zero, negative, NaN — no figure, no warning
  | 'impossible'    // over 100% of the finished product — not a dose at all
  | 'unrated'       // a real dose, but no product data to judge it against (custom)
  | 'below-typical'
  | 'typical'
  | 'above-max';    // over the EU/supplier ceiling

/** `p` is absent for a custom entry, where the only judgements available are
 * arithmetic ones. Checks run in the order of the union above: `none` first, then
 * `impossible` — which outranks `above-max`, since 150% is not a ceiling breach to
 * warn about but a number that is not a dose. With no `p`, any real dose is
 * `'unrated'`. */
export function lsPreservativeDoseTier(pct: number, p?: LsPreservative): LsPreservativeDoseTier;
```

- `clampLsPreservativePct` is **deleted**. Verified: its only production call site is
  `PreservativeSnippet.tsx:71`. Leaving it beside the classifier would leave two ways to
  answer the same question, one of which is now wrong.
- `preservativeDoseGrams` is untouched, and from now on always receives the **typed**
  dose.
- `lsPreservativeById` changes from `(id: LsPreservativeId) => LsPreservative` (non-null
  assertion) to `(id: string) => LsPreservative | undefined`, mirroring
  `catalogEntryById`. Verified: one production call site,
  `PreservativeSnippet.tsx:66`. `undefined` is how the UI learns "this is a custom
  entry", exactly as `catalogId: ''` does for additives.
- `'none'` must absorb every half-typed state (empty string → `NaN`, a lone `-`, `0`,
  `0.`) so no warning fires mid-keystroke. This preserves the one good property of the
  clamp's junk handling.

### 2 · The warning ladder

Nothing is ever recomputed behind the user's back.

| Tier | Copy | Grams |
|---|---|---|
| `none` | — | not shown |
| `unrated` | the `Custom…` standing note (§3) — no range judgement is possible | shown |
| `below-typical` | *"Below the typical 0.5–1% for Suttocide A — an under-dose may not protect the batch."* (plain note) | shown |
| `typical` | — (the existing `Typical 0.5–1% of the finished product.` line already states the range) | shown |
| `above-max` | `role="alert"`: *"2% is above the EU legal maximum of 1% for Suttocide A in a finished product. The figures below use the 2% you entered."* — or *"…above Liquid Germall Plus's supplier maximum of 0.5%"* per the entry's `ceiling` field | shown, **at the typed dose** |
| `impossible` | `role="alert"`: *"A dose must be 100% or less of the finished product."* | **not shown** |

**There is no `above-typical` rung** (dropped while planning, 2026-08-09). An earlier draft
had one for "over the typical range but still under the ceiling". That band is empty:
every shipped entry's `typicalHigh` **is** its `maxPct` — Suttocide A 1.0/1.0, Liquid
Germall Plus 0.5/0.5, Glydant Plus 0.36/0.36, Phenoxyethanol 1.0/1.0 — so the rung and its
note could never render, and no component test could reach them. A core test pins the
coincidence, so adding an entry with headroom fails loudly and the rung comes back with it.

Two deliberate choices:

- **`above-max` still computes.** This is the whole point of the change, and it is the
  inverse of today's behaviour. The alert names who set the limit (`ceiling: 'eu'` →
  "EU legal maximum"; `'supplier'` → "supplier maximum") because breaking one is illegal
  and breaking the other is off-spec.
- **`impossible` does not.** A preservative mass larger than the batch it comes out of is
  not a dose, and `AdditivesPanel.tsx:342-346` already refuses `>100%` with *"Max 100% —
  reduce the amount"* and no grams. Two panels on one screen disagreeing about whether
  150% is a number is worse than either rule alone. This is not a clamp: nothing is
  substituted, the app declines to print.

The `max={preservative.maxPct}` attribute comes **off** the number input (it would mark
the field `:invalid` and cap the spinner at the ceiling). `min={0}` and `step={0.1}`
stay; `max={100}` is set, matching the additives amount input.

Doses echoed back into copy are canonicalised with `String(Number(raw))`, as
`parseAdditiveLine` already does — otherwise `1e3` and `2.0000001` print raw.

### 3 · The menu and the custom entry

A `<select>` with `Custom…` as the first option, then the four products in table order.
`''` is the custom sentinel — the same idiom as `catalogId: ''` (additives) and
`presetKey: ''` (alternative liquids).

**Accessible name:** the select keeps a **visible** label, `Which preservative`, wrapping
it — following the panel it lives in (whose radiogroup has a visible legend and
Label-in-Name discipline) rather than the panel it borrows its shape from (whose labels
are `sr-only`).

**On picking a known product:** reseed the dose to that product's own `defaultPct`. This
existing rule is kept and its reason is unchanged — 1% of Suttocide A is legal, 1% of
Liquid Germall Plus is double the supplier's maximum, so a dose typed for one must never
silently become another's.

**On picking `Custom…`:** **clear the dose to blank.** There is no default to reseed
from, and carrying the previous product's dose onto an unknown product is precisely the
hazard the reseed rule exists to prevent. A blank field forces a deliberate entry.

**While `Custom…` is selected:**

- a name text input appears (placeholder `Name`, `maxLength={200}` on the input, matching
  `settingString`'s 200-character cap on load);
- the tier is computed with no `p`, so every product-relative rung —
  `below-typical`, `typical`, `above-max` — is unreachable by
  construction, and the composition/pH line, the typical-range line, the formaldehyde
  note and the per-product `addBelowC` temperature are suppressed alongside them. The app
  knows none of them, and a silent formaldehyde note would imply an exemption that may
  not exist;
- `none` and `impossible` still apply (they are arithmetic, not product data);
- the grams, the scope-named `≈ Finished product (whole batch | custom amount)` row, and
  the generic "add after dilution, once the soap has cooled" stage line all remain;
- one standing note appears, carrying the research outcome to where it is useful — a user
  reaching for `Custom…` is most likely holding exactly one of the products screened out
  above:

  > Few preservatives hold at soap's pH 9–10. Organic-acid systems (sodium benzoate,
  > potassium sorbate, Geogard, Optiphen) are inert here. Check your supplier's rated pH
  > range and use level before dosing.

**Name fallback:** on the **batch sheet**, a blank custom name falls back to
`Custom preservative` so the row is never headless. The snippet itself needs no fallback:
it interpolates a product name only into product-specific copy, which a custom entry
suppresses entirely, so there is no string there for a custom name to fill. (An earlier
draft asserted the fallback applied to warnings too; the unreachable binding that implied
was deleted before merge.)

**Name retention:** the typed custom name stays in state while a known product is
selected (switch back and it is still there), simply unused. This differs from
`AdditivesPanel`, which overwrites `line.name` from the catalog entry; here the name
field and the product select are separate controls, so there is nothing to overwrite.

**Props.** Two change, one is added, the scope pair is untouched:

```ts
type PreservativeSnippetProps = {
  finishedGrams: number | null;               // unchanged — scope-resolved by App
  basisScope?: 'batch' | 'portion';           // unchanged
  weightUnit: WeightUnit;                     // unchanged
  preservativeId: string;                     // was LsPreservativeId; '' = custom
  onPreservativeIdChange: (id: string) => void;
  preservativeCustomName: string;             // new
  onPreservativeCustomNameChange: (name: string) => void;
  dosePct: string;
  onDosePctChange: (value: string) => void;
};
```

The base row keeps its scope-named label — `≈ Finished product (whole batch)` /
`(custom amount)` — and **both** empty-state branches survive unchanged, including the
portion-specific one ("Enter an Amount to make above — with Custom amount chosen, the
dose is a % of the portion you are making now, not of the whole batch"). `Custom…`
suppresses product facts, never scope facts.

### 4 · Persistence

Four fields join `RecipeSettings` in `packages/web/src/lib/recipe.ts`:

| Field | Default | Meaning |
|---|---|---|
| `preservativeId` | `LS_PRESERVATIVES[0].id` | `''` = custom |
| `preservativeCustomName` | `''` | free text, used only when `preservativeId === ''` |
| `preservativeDosePct` | `String(LS_PRESERVATIVES[0].defaultPct)` | input string, like every other numeric setting |
| `preservativeSetByUser` | `false` | has the maker touched any of the three above? Gates the batch-sheet row — see §5 |

The two defaults are **computed from the table, not written as literals** — they are the
same expressions `App` seeds today, and a literal `'suttocide-a'` / `'1'` would drift
silently if the table is ever reordered or its `defaultPct` revised.

`normalizeSettings` coercion:

- `preservativeId`: kept when `lsPreservativeById` resolves it, otherwise `''` — an
  unknown id degrades to a custom entry **keeping the typed name**, exactly how a stale
  `catalogId` degrades to a custom additive row.
- `preservativeCustomName`, `preservativeDosePct`: `settingString(...)` with the defaults
  above.
- `preservativeSetByUser`: `partial?.preservativeSetByUser === true` — an absent field, as
  on any recipe written before this feature, must mean **false**, so an untouched recipe
  prints no row. All three handlers in `App` set it true alongside the value they change,
  in the same functional update.

Adding them to `DEFAULT_SETTINGS` enrols them in `KNOWN_SETTING_KEYS` automatically, so
`preserveUnknownSettings` will not shadow them.

**`recipeFile.ts` needs no code change.** Verified: `serializeRecipeFile` runs
`normalizeSettings(settings)` and `parseRecipeFile` runs
`normalizeSettings(parsed.settings)`, and `RecipeFilePayload.settings` is typed
`RecipeSettings` — so save, load, export and import all follow from the three fields
above. It gains tests only.

`App.tsx` drops its two `useState` hooks (`preservativeId`, `preservativeDosePct`) and
reads/writes through the settings object like every other setting. These fields ride
along on CP and HP recipes unused, the same way `soapConcentrationPercent` already does.

**What stays session-local:** `dilutionScope` (`App.tsx:142`), `portionTargetMl`,
`measuredPasteGrams` and the `preservativeBaseGrams` memo built from them are untouched.
The persistence decision covers the preservative *pick, name and dose* — the three things
a maker would be annoyed to retype — and deliberately not the scope, which is a
bench-time view over the saved recipe rather than part of it. §5 depends on this.

### 5 · Batch sheet

The existing **Dilution** section (already LS-gated, since it renders only when
`dilution` is non-null) gains one row, printed when the dose tier is neither `none` nor
`impossible`:

```
Preservative        Suttocide A · 1% · 10.0 g (whole batch)
```

followed by the stage line ("Add after dilution, once the soap has cooled — below 50 °C
for Liquid Germall Plus"), and — when the tier is `above-max` — its caveat, because the
sheet is the page carried to the bench and a figure over a legal ceiling must not print
bare.

The formaldehyde note does **not** print: it is a labelling duty for the finished
product, not a bench instruction.

**The row prints only once the maker has chosen** (user decision, 2026-08-09, raised by the
final whole-branch review). The settings default to Suttocide A at 1%, so gating the row on
the dose alone would print `Preservative | Suttocide A · 1% · 41 g` on *every* liquid-soap
sheet — including recipes saved before this feature existed, and makers who never opened
the snippet. The printed page is an instruction naming a specific commercial product, and
the snippet's own copy says using one at all "is your informed call" (LS:3228); the sheet
must not make that call on the maker's behalf.

So `RecipeSettings` carries `preservativeSetByUser`, mirroring the existing
`batchSetByUser` idiom for exactly this "did the maker touch it" question. It flips true
when the picker, the custom name or the dose changes. The snippet is unaffected — it still
opens showing a complete, legal worked dose. Only the sheet waits.

**The row is always whole-batch, and says so.** This is the one place the scope machinery
described in *Problem* bites, and it decides the row's mass:

- The sheet uses the `bottledGrams` it **already computes** at `BatchSheet.tsx:159` —
  `finishedProductGramsFor(bottledSolutionGrams, dilution)`. Verified: that is the exact
  expression behind `vm.finishedProductGrams` (`useRecipeViewModel.ts:756`), which is
  what `App` hands the snippet in batch scope (`App.tsx:290`). Sheet and panel therefore
  agree by construction, the way the dilution rows already do — no second rule to drift.
- **`dilutionScope` must not reach the sheet.** It is session-local `useState`
  (`App.tsx:142`), so a sheet that mirrored it would print a different preservative mass
  before and after a reload, from a recipe file that records no scope. Worse, the two
  masses differ by the whole batch-to-portion ratio: mirroring the scope on a batch
  document is the same class of error as the fixed bug the `basisScope` doc records,
  printed onto paper instead of shown on screen.
- Hence the `(whole batch)` suffix is **not decoration** — while a maker is working in
  Custom amount scope, the screen shows the portion's dose and the sheet shows the
  batch's. Two different correct numbers, and each has to name which it is.
- The portion figure is deliberately not printed. The portion sizer is a bench-time
  scratch calculation over an unsaved amount; the sheet is the batch document.

### 6 · The prose that says this is not recipe state

Persistence contradicts three separate pieces of writing, one of them user-visible and
pinned by a test. All three are rewritten together — the distinction to preserve is
**setting vs ingredient**: the preservative is now saved with the recipe, but it still
never enters the oil, lye or batch arithmetic.

| Site | Today | Status |
|---|---|---|
| `PreservativeSnippet.tsx:34-36` (props doc) | *"Session-local UI state living in App beside portionTargetMl … Deliberately NOT recipe state — this snippet is a bench figure like the portion sizer, and it never adds anything to the recipe."* | **Flatly false** after §4. Rewritten: recipe state, saved and exported and printed; why it moved (a custom product name that vanishes on reload is worthless); and the half that stays true — it adds nothing to the batch arithmetic. Note it no longer sits "beside `portionTargetMl`", which *does* stay session-local. |
| `PreservativeSnippet.tsx:48-50` (component doc) | *"A dose calculator, not a recipe field … writes nothing back into the recipe."* | **Half false.** Rewritten to "a recipe setting, not a recipe ingredient". |
| `PreservativeSnippet.tsx:86-87` (subtitle, on screen) | *"Grams to weigh into the finished, diluted soap — a bench figure, never added into the recipe"* | **Misleading** once the pick and dose persist and print on the sheet. Reworded (below). |

**Decided subtitle** — user confirmed the preservative belongs in the recipe, so the copy
states what persists and keeps the claim that survives:

> Grams to weigh into the finished, diluted soap — saved with the recipe, never counted
> in the batch or lye figures

This is the only user-visible copy change in the design. It is pinned by
`PreservativeSnippet.test.tsx:170` (`/never added into the recipe/i`), whose assertion
moves to the new claim.

### 7 · Styles

`.preservative__picker` and `.preservative__legend` (`index.css:996`, `:1003`) go dead
with the radiogroup and are removed. The select and the name input reuse `.field` /
`.input`, as the dose field already does.

## Testing

**Baseline before any change:** `npm test` is green at `dd38741` — typecheck, oils
validation, core, and 1196 web tests across 79 files, exit 0. Every figure below was read
off the suite as it stands, not recalled.

**Four existing test sites assert the exact inverse of this design** and are deliberate
reversals, not breakage to be repaired:

| Site | Asserts today |
|---|---|
| `ls-preservatives.test.ts:117-139` | the whole `clampLsPreservativePct` describe block — pass-through, clamp-at-ceiling, junk-to-zero |
| `PreservativeSnippet.test.tsx:109-118` | *"a dose above an EU ceiling is hard-clamped"* — and pins `queryByText('80 g')` **null**, i.e. the typed 2% must NOT show |
| `PreservativeSnippet.test.tsx:120-129` | the supplier-ceiling twin, grams pinned to the clamped 0.5% |
| `ls-preservative.spec.ts:54-58` | *"The ceiling is hard … the figure stays at the 1% EU maximum"* |

The first is replaced by tier tests; the other three inverted — same alert, opposite
figure. Anyone who "fixes" one back has undone the feature.

**Two more existing tests transform rather than disappear:**

- `PreservativeSnippet.test.tsx:58-64` — Label-in-Name over `getByRole('radiogroup')`,
  asserting the accessible name leads with the visible caption verbatim. The select
  inherits the obligation, so this becomes the select's version of the same assertion.
- `PreservativeSnippet.test.tsx:170` — pins the subtitle rewritten in §6.

The `Harness` at `PreservativeSnippet.test.tsx:13-35` gains custom-name state and its
`useState<LsPreservativeId>` widens to `string`.

**Core — `ls-preservatives.test.ts`.** The `clampLsPreservativePct` describe block is
replaced by `lsPreservativeDoseTier` boundary tests: exactly `typicalLow`, a hair below;
exactly `typicalHigh`, a hair above; exactly `maxPct`, a hair above; exactly 100, above
100; and `NaN` / negative / zero → `'none'`. Precedence: a dose above 100 that is *also*
above `maxPct` → `'impossible'`, not `'above-max'`. Called with no `p`: any real dose →
`'unrated'`, above 100 → `'impossible'`, junk → `'none'`, and no product-relative tier is
ever returned. `lsPreservativeById`'s test gains an unknown-id case returning
`undefined`.

**Web — `PreservativeSnippet.test.tsx`.**

- the select renders five options, `Custom…` first;
- picking a product reseeds its `defaultPct`; picking `Custom…` blanks the dose;
- `Custom…` reveals the name field, shows the standing note, and suppresses composition,
  typical range, range warnings, formaldehyde note and `addBelowC`;
- each rung of the ladder renders its own copy, and only its own;
- **the regression the old clamp made untestable: with a dose above the ceiling, the
  grams equal `finishedGrams × typedPct / 100`**;
- (the blank-custom-name fallback is a batch-sheet concern, covered in the `BatchSheet`
  tests below — the snippet has no string for it to fill);
- the scope behaviour still holds with a custom entry selected: `basisScope="portion"`
  keeps the scope-named base row and the portion-specific empty state, so `Custom…`
  suppresses product facts without suppressing scope facts.

**Web — `recipe.test.ts` / `recipeFile.test.ts`.** Defaults; round-trip of all three
fields through save/load and export/import; an unresolvable `preservativeId` degrading to
`''` with the custom name preserved.

**Web — `BatchSheet.test.tsx`.** The row prints with product name, dose and grams; it is
omitted at tier `none` and `impossible`; the custom-name fallback prints; the
`above-max` caveat prints and the formaldehyde note does not. **The scope guard:** the
printed grams equal the dose against the sheet's own `bottledGrams`, and are unaffected
by anything portion-shaped — the sheet has no `dilutionScope` input to be affected by,
and this test is what stops one being added later.

**E2E — `ls-preservative.spec.ts`.** The radio assertion at line 34 becomes a select
assertion; lines 54–58 invert per the table above — the alert names the EU maximum **and**
the figure follows the typed 2%. `exploratory.spec.ts` only asserts the heading
(lines 94, 155) and is unaffected.

**Definition of done:** `npm test` green again — same 79 files, test count up by the new
cases — plus the Playwright spec passing. No existing test is deleted to make a new one
pass; the four inversions above are rewritten in place, so the diff shows the reversal
rather than hiding it.

## Out of scope

- Extending the preservative table. The screen above found nothing addable; revisit only
  with the Témoin-Fardini paper or an equivalent primary source in hand.
- Antifungal coverage guidance. Practitioner discussion suggests formaldehyde donors are
  weak against fungi at soap pH and want support, but the only source found is a forum
  thread — too weak for this file's citation standard.
- Any change to the four entries' `typicalPctRange`, `maxPct`, `ceiling`,
  `formaldehydeLabel` or `addBelowC` values, or to the need paragraph.
