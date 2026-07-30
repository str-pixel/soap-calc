# Process separation: CP / HP / LS as declared calculators

**Date:** 2026-07-30 · **Status:** approved-pending-review · **Owner arc:** follows #138–#146

## Problem

Seven of the last nine merged PRs fixed the same bug class: something belonging to one
process acting under another. Vinegar compensated lye under LS (#141), glycerin added
100 g to CP batches (#145), an LS remedy clause shipped in a shared alert (#142), a
CP-only assumption sat inside a shared helper's default (#142). The mechanism was always
the same: **process scoping enforced at the offer (a picker filter, a field) while the
behaviour (computation, warning, print) stayed shared and unguarded.**

There are ~70 `process === 'x'` / `isLiquidSoap` sites across web+core. The math modules
have almost none (the chemistry is genuinely shared); the branching concentrates in
`insights.ts` (25) and the view-model/panel layer. Every new feature re-decides where its
process gates go, which is how these bugs are born one at a time.

## Decisions taken (brainstorm 2026-07-30)

1. **Pain:** all three — leakage, switching behaviour, maintainability.
2. **Shape:** one app, tabs as today. Separation is internal only.
3. **Bridge:** **none.** A recipe belongs to its process, full stop. No silent
   reinterpretation, no conversion action. Imports land in the process the file declares.

## Design review corrections (baked in below)

- "Three insight registries" was **measured false**: only ~⅓ of the 36 insight codes are
  process-exclusive; the rest are shared with per-process parameters. Three registries
  would triplicate shared insights — the drift risk this design exists to remove. The
  corrected shape is one catalog with `processes` + `processOverrides`, the pattern
  `ADDITIVE_CATALOG` already proves.
- A per-process definition layer **already exists** (`PROCESS_DEFINITIONS` in
  `lib/process.ts`: defaults, lyeChoices, waterModeChoices, panels, terms) alongside a
  per-variant one (`processProfile.ts`: bands, temps, cure, water loss). The design
  extends the existing `ProcessDefinition` and makes it own its variant profiles — it
  does not add a third layer.
- `coerceSettingsForProcess` runs at **load/import time only** (useRecipeStorage, import
  path), not render time. It is retitled and narrowed, not deleted blind.

## Architecture

**Layering rule.** Core stays definition-agnostic: it declares per-process data on its
own entities (catalog `processes` fields, `processOverrides`) and takes everything else
as parameters. The composed `ProcessDefinition` lives in `packages/web` and is the only
thing that reads those declarations together. Core never imports a definition; a
definition never reaches into core internals. Violating this is how the coupling this
design removes would grow back.

**One engine, three declarations.** The chemistry (SAP, lye, purity, superfat, dilution
arithmetic) stays in `@soap-calc/core`, shared and unforked — it is identical across
processes and forking it creates drift where none exists. Everything process-*specific*
is declared in the extended `ProcessDefinition`, one per process, each owning:

- its **variant profiles** (absorbing `processProfile.ts`'s per-variant constants)
- its **offers**: additives, alternative liquids, stages, water modes, sizing modes,
  panels — via the existing `processes` fields, read through the two predicates
- its **insight set**: which shared insights apply and with what parameters
- its **procedure-step builder** and terminology

**The invariant** (the arc's lesson made structural): *offer and behaviour read the same
declaration.* Nothing is computed, warned about, or printed for a record unless the
active process's definition offers it; nothing offered is ever silently inert. The
`isAdditiveOfferedFor` / `isAlternativeLiquidOfferedFor` predicates are the only gate
pattern, and they live behind the definition.

**Stray records** (saved before a gate existed, or imported): render honestly + inert,
with the row-level notice pattern from #141/#145. This is unchanged and remains necessary
— no-bridge stops new strays, not historical ones.

## Slices (each independently shippable, behind the 1,329-test + 81-e2e suites)

### Slice 1 — No bridge (kill cross-process reinterpretation)

- `coerceSettingsForProcess` → `normalizeSettingsWithinProcess`: it may fix a stale
  *variant* or clamp a value **within the record's own process**, and must never
  reinterpret a record from another process. The cross-process branch becomes an error
  path, not a coercion.
- Imports: a file that declares its process routes to that process's workspace (already
  partially true in `recipeFile.ts`). A legacy file with no process uses
  `processForLyeType` **once, at import, with the routing stated to the user** ("Imported
  as cold process — this file predates process tags"). Known gap to note in copy: legacy
  NaOH HP files infer as CP; the import notice is what makes that survivable.
- Delete any remaining call path where one process's settings object is fed to another
  process's calculator.

### Slice 2 — ProcessDefinition owns its variants

- Move `processProfile.ts`'s per-variant data inside each process's definition entry;
  `processProfilesFor(process)` reads the definition. One definition layer, nested, not
  two overlapping ones.
- The mold sizer, cure estimate, soaping temperature and water bands all read through the
  active definition (they already read profiles — this is a re-homing, not a rewrite).

### Slice 3 — Insight catalog

- `analyzeFormulation`'s 25 branch sites become declarations: each insight entry carries
  `processes` (absent = all) and optional `processOverrides` (thresholds, copy), mirroring
  `AdditiveCatalogEntry` exactly. The analyzer filters by the active process's definition
  and resolves overrides — two generic code paths replacing 25 bespoke gates.
- `isLiquidSoap` (the boolean that also means "not CP and not HP", the #131-documented
  trap) is retired from the input shape; the process id is the only discriminator.

### Slice 4 — View model reads the definition

- `useRecipeViewModel`'s process-shaped memos (dilution/neutralization for LS, cook
  factor/vessel for HP, temperature clamps) gate on `definition.panels` /
  `definition.offers`, not on raw `process === 'x'` comparisons. The remaining literals
  in panels and App.tsx follow.

## Error handling

- A record referencing something its process doesn't offer: **inert + honest notice**
  (existing pattern), never dropped, never acting.
- An import for another process while a different tab is active: routed to the right
  workspace with a visible confirmation, never merged into the active one.
- Import process field, three distinct cases: **declared** → route to that workspace;
  **absent** (legacy file) → infer via `processForLyeType` once, stating the routing to
  the user; **present but invalid** (garbage) → refuse, offering the legacy inference as
  an explicit choice. Never guess silently; the absent case is the only inference and it
  is always announced.

## Testing

- Every slice keeps the invariant testable the same way: **assert the effect, not the
  list** (grams, batch weight, printed sheet) — the offer-vs-behaviour lesson from #145.
- New e2e: import-routing (file declares HP while LS tab active), and one
  cross-process-leak canary per process pair (a definition-driven loop, not hand cases).
- Mutation check on new tests (a test must fail when its gate is removed).

## Migration

None. No slice changes the shape of saved drafts, recipe files, or pricing storage —
the per-process workspaces already exist and their payloads are untouched. The only
behavioural change a user can notice is import routing (slice 1), which is announced
in the UI when it happens.

## Non-goals

- No URL/route split, no separate deployables.
- No forking of core chemistry.
- No recipe conversion feature (explicitly decided against — can be revisited later as a
  standalone exporter that *creates a new file*, which the no-bridge rule permits).

## Order and size

Slice 1 is small and delivers the user-facing guarantee immediately. Slice 2 is a
mechanical re-homing. Slice 3 is the largest single win (25 sites → declarations).
Slice 4 is cleanup that the first three make mostly mechanical. Estimated at four PRs,
each adversarially reviewed before merge (the verification discipline established across #138–#146).
