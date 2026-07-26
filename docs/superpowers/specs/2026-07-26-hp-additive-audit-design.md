# HP Additive Audit — Design Spec

**Date:** 2026-07-26
**Status:** Approved (brainstormed + adversarially reviewed in-session; one amendment applied)
**Packages:** `@soap-calc/core` (additives, insights), `@soap-calc/web` (AdditivesPanel, useFormulationInsights)

## Problem

A review of the HP reference material against the shipped additive catalog found the HP path
carries CP-audited values that the sources themselves scope per process, plus one structural
miscalculation:

1. **Per-process dose divergence.** Sodium lactate: CP 0.5–2% of oil weight into the lye
   solution vs HP 3–4% at trace (added after thick trace, before expansion). Sugar: CP 0.5–2%
   vs HP 1–5%. The catalog has a single `typicalLow/High` + `defaultStage` per entry, so the
   HP picker shows CP numbers — sodium lactate under-advertised ~4× on the process that
   relies on it for fluidity.
2. **Free fatty acids dosed lye-blind.** `stearic` and `lauric` are ADDITIVE_CATALOG entries
   (5–8%, HP-scoped), but additives are excluded from lye math by contract. Stearic, lauric
   and myristic acid are saponifiable and already exist in the oils DB with SAP values
   (`stearic-acid` 0.1406, `lauric-acid` 0.1996, `myristic-acid` 0.1752 NaOH/g). A user dosing
   the recommended 6% stearic through the additive picker gets no NaOH for it — ~6 points of
   hidden superfat and an undercut hardening effect. Same defect class as the removed
   `jojoba` entry (see #127).
3. **Missing HP accelerant.** Finished soap (grated bar or liquid soap, 0.05–1% of oil weight,
   melted into the hot oils) is the no-stearic trace-accelerant route and is genuinely
   lye-neutral (already saponified) — a legitimate additive, absent from the catalog.
4. **Ceiling contradiction (found in review).** `sugar_total_high` warns above 4% of oil
   weight — a CP-derived constant applied cross-process. With HP sugar advertised at 1–5%,
   a user at the recommended 5% would be warned at ~4%: the app recommending X while warning
   at X−1.

Out of scope (decided): HP myth-buster content; honey/eugenol/salt (sources agree with
shipped values); LS values for sodium lactate/sugar (no source coverage — LS inherits base).

## Design

### 1 · Core schema: per-process overrides

```ts
// additives.ts
export type AdditiveProcessOverride = {
  typicalLow?: number;
  typicalHigh?: number;
  defaultStage?: AdditiveStage;
};

export type AdditiveCatalogEntry = {
  // …existing fields…
  /** Per-process corrections to the typical range and/or default stage. Base fields are the
   * CP-audited values; an override carries only what differs for that process. Resolve with
   * effectiveCatalogEntry — never read typicalLow/High/defaultStage directly when a process
   * is in hand. */
  processOverrides?: Partial<Record<AdditiveProcess, AdditiveProcessOverride>>;
};

/** The entry as it applies under `process`: override fields win, base fields fill the rest.
 * Returns the entry unchanged when there is no override for the process. */
export function effectiveCatalogEntry(
  entry: AdditiveCatalogEntry,
  process: AdditiveProcess,
): AdditiveCatalogEntry;
```

Pure core, no web import. The only non-test consumers of `typicalLow/High/defaultStage` are
two spots in AdditivesPanel (verified), so no other call site changes.

### 2 · Catalog data changes

- `sodium-lactate`: base unchanged (0.5–2, `lye`); add
  `processOverrides: { hp: { typicalLow: 3, typicalHigh: 4, defaultStage: 'trace' } }`.
- `sugar-sorbitol`: base unchanged (0.5–2, `trace`); add
  `processOverrides: { hp: { typicalLow: 1, typicalHigh: 5 } }`.
- Sorbitol (1–5 both processes), honey, salt, eugenol: no change — sources agree.
- **Remove** `stearic` and `lauric` entries. Jojoba-precedent comment at the removal site:
  free fatty acids saponify and belong in the oils list; legacy saved lines load as custom
  rows via `normalizeAdditiveLine`'s existing unknown-id path (no migration code).
- **Add** `finished-soap`: name "Finished soap (grated or liquid)", 0.05–1% of oil weight,
  `defaultStage: 'oils'`, `processes: ['hp']`. Comment: trace accelerant / emulsion
  stabilizer; already saponified, so lye-neutral — unlike the free fatty acids it replaces.

### 3 · Core insight: process-aware sugar ceiling

`sugar_total_high` threshold becomes process-dependent: warn above **5** when
`input.process === 'hp'`, above **4** otherwise. Message text gains the matching "~5%"
variant under HP. Rewrite the insight's doc comment and the mirror comment on
`sugarTotalPercentForInsights` (web): the *mechanism* (sugar mass vs oil mass) is
process-independent; the *tolerance* is not. The HP comparison stays apples-to-apples
because yogurt is already excluded from the HP sum (`excludeYogurt` dedup, hp_yogurt_water
covers it).

### 4 · Web wiring

- `AdditivesPanel` resolves through `effectiveCatalogEntry(entry, process)` at its two
  consumer spots: the catalog pick handler (`addAt`) and the typical-range hint.
- One static, HP-gated hint line near the picker (original copy, numbers only): free fatty
  acids — stearic, lauric, myristic — are dosed **as oils** because they saponify; add them
  on the oils list, typically 5–8% of oils for fluid HP.

### Non-goals / invariants

- No new insight for legacy stearic lines; the custom-row fallback plus the HP hint carry it.
- `LATHER_SUPPORT_PACK` untouched (verified it references none of the changed entries).
- Anonymity rule: numeric constants only; all copy original; no source identification.

## Test plan

Core (`additives.test.ts`):
- `effectiveCatalogEntry` merge semantics: override wins per-field; missing fields fall back;
  no-override process returns the entry unchanged (same values).
- Sodium lactate: cp → 0.5–2 @ lye; hp → 3–4 @ trace; ls → 0.5–2 @ lye (inherits base).
- Sugar: hp → 1–5, stage stays trace.
- Catalog no longer contains `stearic` / `lauric`; `finished-soap` pinned (range, stage,
  HP-only scoping; excluded from cp/ls pickers).

Core (`insights.test.ts`):
- sugar total 4.5%: warns under cp/ls, silent under hp; 5.5%: warns under hp too.

Web (`AdditivesPanel.test.tsx`):
- Range hint shows 3–4% under HP and 0.5–2% under CP for sodium lactate.
- Picking sodium lactate under HP sets `addAt: 'trace'`; under CP sets `'lye'`.
- HP fatty-acid hint renders under HP only.

Web (`recipe.test.ts`):
- A saved line with `catalogId: 'stearic'` normalizes to a custom row, name preserved.

Full suite + `tsc --noEmit` + build.
