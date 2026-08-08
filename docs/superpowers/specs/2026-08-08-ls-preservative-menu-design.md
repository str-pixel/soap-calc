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
| **Quaternium-15** (Dowicil 200) | Best fit on paper — Dow's own literature: *"The antimicrobial activity of DOWICIL 200 is essentially uniform between pH 4 and pH 10"*, use 0.02–0.2%. **Prohibited in EU cosmetics.** Commission Regulation (EU) 2019/831 recital 6: Quaternium-15 *"should be deleted from the list of preservatives allowed in cosmetic products in Annex V … and added to the list of substances prohibited in cosmetic products in Annex II"* — it lands as Annex II entries 1385/1386. SCCS could not establish its safety; the cis-isomer is CMR cat. 2. Verified against the regulation text (CELEX 32019R0831), not a summary. |
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
export type LsDoseTier =
  | 'none'          // blank, zero, negative, NaN — no figure, no warning
  | 'impossible'    // over 100% of the finished product — not a dose at all
  | 'unrated'       // a real dose, but no product data to judge it against (custom)
  | 'below-typical'
  | 'typical'
  | 'above-typical' // over the typical range, still within the ceiling
  | 'above-max';    // over the EU/supplier ceiling

/** `p` is absent for a custom entry, where the only judgements available are
 * arithmetic ones. Checks run in the order of the union above: `none` first, then
 * `impossible` — which outranks `above-max`, since 150% is not a ceiling breach to
 * warn about but a number that is not a dose. With no `p`, any real dose is
 * `'unrated'`. */
export function lsPreservativeDoseTier(pct: number, p?: LsPreservative): LsDoseTier;
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
| `above-typical` | *"Above the typical 0.5–1% for Suttocide A."* (plain note) | shown |
| `above-max` | `role="alert"`: *"2% is above the EU legal maximum of 1% for Suttocide A in a finished product. The figures below use the 2% you entered."* — or *"…above Liquid Germall Plus's supplier maximum of 0.5%"* per the entry's `ceiling` field | shown, **at the typed dose** |
| `impossible` | `role="alert"`: *"A dose must be 100% or less of the finished product."* | **not shown** |

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
  `below-typical`, `typical`, `above-typical`, `above-max` — is unreachable by
  construction, and the composition/pH line, the typical-range line, the formaldehyde
  note and the per-product `addBelowC` temperature are suppressed alongside them. The app
  knows none of them, and a silent formaldehyde note would imply an exemption that may
  not exist;
- `none` and `impossible` still apply (they are arithmetic, not product data);
- the grams, the `≈ Finished product` row, and the generic "add after dilution, once the
  soap has cooled" stage line all remain;
- one standing note appears, carrying the research outcome to where it is useful — a user
  reaching for `Custom…` is most likely holding exactly one of the products screened out
  above:

  > Few preservatives hold at soap's pH 9–10. Organic-acid systems (sodium benzoate,
  > potassium sorbate, Geogard, Optiphen) are inert here. Check your supplier's rated pH
  > range and use level before dosing.

**Name fallback:** every string that interpolates a product name — warnings and the batch
sheet row — falls back to `Custom preservative` when the custom name is blank.

**Name retention:** the typed custom name stays in state while a known product is
selected (switch back and it is still there), simply unused. This differs from
`AdditivesPanel`, which overwrites `line.name` from the catalog entry; here the name
field and the product select are separate controls, so there is nothing to overwrite.

### 4 · Persistence

Three fields join `RecipeSettings` in `packages/web/src/lib/recipe.ts`:

| Field | Default | Meaning |
|---|---|---|
| `preservativeId` | `'suttocide-a'` (today's `LS_PRESERVATIVES[0].id`) | `''` = custom |
| `preservativeCustomName` | `''` | free text, used only when `preservativeId === ''` |
| `preservativeDosePct` | `'1'` (today's `String(LS_PRESERVATIVES[0].defaultPct)`) | input string, like every other numeric setting |

`normalizeSettings` coercion:

- `preservativeId`: kept when `lsPreservativeById` resolves it, otherwise `''` — an
  unknown id degrades to a custom entry **keeping the typed name**, exactly how a stale
  `catalogId` degrades to a custom additive row.
- `preservativeCustomName`, `preservativeDosePct`: `settingString(...)` with the defaults
  above.

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

### 5 · Batch sheet

The existing **Dilution** section (already LS-gated, since it renders only when
`dilution` is non-null) gains one row, printed when the dose tier is neither `none` nor
`impossible`:

```
Preservative        Suttocide A · 1% · 10.0 g
```

followed by the stage line ("Add after dilution, once the soap has cooled — below 50 °C
for Liquid Germall Plus"), and — when the tier is `above-max` — its caveat, because the
sheet is the page carried to the bench and a figure over a legal ceiling must not print
bare.

The formaldehyde note does **not** print: it is a labelling duty for the finished
product, not a bench instruction.

### 6 · Styles

`.preservative__picker` and `.preservative__legend` (`index.css:996`, `:1003`) go dead
with the radiogroup and are removed. The select and the name input reuse `.field` /
`.input`, as the dose field already does.

## Testing

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
- a blank custom name renders `Custom preservative` in warnings.

**Web — `recipe.test.ts` / `recipeFile.test.ts`.** Defaults; round-trip of all three
fields through save/load and export/import; an unresolvable `preservativeId` degrading to
`''` with the custom name preserved.

**Web — `BatchSheet.test.tsx`.** The row prints with product name, dose and grams; it is
omitted at tier `none` and `impossible`; the custom-name fallback prints; the
`above-max` caveat prints and the formaldehyde note does not.

**E2E — `ls-preservative.spec.ts`.** The radio assertion at line 34 becomes a select
assertion. **Lines 54–58 assert the exact inverse of this design** — *"The ceiling is
hard: typing past it raises the named clamp message and the figure stays at the 1% EU
maximum"* — and must be rewritten to assert the opposite: the alert names the EU maximum
**and** the figure follows the typed 2%. This is a deliberate reversal, not a broken
test; do not restore it. `exploratory.spec.ts` only asserts the heading and is unaffected.

## Out of scope

- Extending the preservative table. The screen above found nothing addable; revisit only
  with the Témoin-Fardini paper or an equivalent primary source in hand.
- Antifungal coverage guidance. Practitioner discussion suggests formaldehyde donors are
  weak against fungi at soap pH and want support, but the only source found is a forum
  thread — too weak for this file's citation standard.
- Any change to the four entries' `typicalPctRange`, `maxPct`, `ceiling`,
  `formaldehydeLabel` or `addBelowC` values, or to the need paragraph.
