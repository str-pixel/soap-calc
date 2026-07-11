# Bar Properties Radar + Unitless Scores — Design

**Date:** 2026-07-12
**Status:** Approved (brainstorm w/ user; review amendments folded in)
**Scope:** `@soap-calc/core` (display formatters, fatty-acid key rename), `@soap-calc/oils-data` (key normalization), `@soap-calc/web` (PropertiesPanel, BatchSheet)

## Goal

Make the Bar properties panel easier to interpret at a glance:

1. Replace the six per-property meter bars with a **radar (spider) chart** showing the
   recipe's shape against the suggested ranges.
2. Switch property values from `%` to **unitless whole-number scores** (community
   convention: Hardness 41, not 40.9%), matching how Iodine/INS already read.
3. Ride-along hygiene: rename the misspelled fatty-acid key `docosenoid` → `docosenoic`.

## Math review (verified, no changes needed)

The property formulas and ranges were reviewed against the canonical data and community
convention; they are correct as implemented:

- Hardness = C12+ saturated only (lauric, myristic, palmitic, stearic) — C8/C10 soaps are
  too soluble to harden a bar (per the code comment in `properties.ts`).
- Cleansing/Bubbly include caprylic + capric — affects only fractionated coconut (97% C8/C10),
  where it is more correct than the classic lauric+myristic sum.
- Conditioning includes the rare unsaturateds (eicosenoic, docosenoic, docosadienoic,
  erucic) — affects only meadowfoam and broccoli seed, again more correct.
- Ranges match the widely used calculator convention: hardness 29–54, cleansing 12–22,
  conditioning 44–69, bubbly 14–46, creamy 16–48, longevity 14–43, iodine 41–70,
  INS 136–165.
- Renormalization over covered weight and the LOW_COVERAGE (80%) estimate gating are sound.

## 1. Unitless number display

Property scores are weighted fatty-acid sums on a 0–100 scale — not true percentages.
Display them as whole numbers with no `%`.

- **New formatters** in `packages/core/src/property-display.ts`:
  - `formatPropertyScore(value: number): string` — rounds to an integer, no suffix
    (`40.9 → "41"`).
  - `formatPropertyScoreRange(low, high): string` — `"29–54"`.
  - The existing `formatSoapPropertyPercent` / `formatPropertyRangePercent` **stay** —
    the Fatty-acid panel keeps `%` (those are true percentages of oil weight).
- **PropertiesPanel**: scores and ranges use the new formatters. Subtitle changes from
  "Fatty-acid totals as % of oil weight" to **"Fatty-acid based scores, 0–100 scale"**.
- **BatchSheet** (surgical — one file, two different value kinds):
  - The six property `<dd>`s (hardness/cleansing/conditioning/bubbly/creamy at
    `BatchSheet.tsx` "Estimated bar properties" section) switch to `formatPropertyScore`.
  - The Saturated/Unsaturated fatty-acid line **keeps** `formatSoapPropertyPercent`.
- The `~` low-coverage prefix convention is unchanged everywhere.
- Iodine/INS display is already unitless; unchanged.

## 2. Radar chart component

New `packages/web/src/components/PropertyRadar.tsx`, rendered at the top of the
Properties panel (below Iodine/INS, above the per-property rows).

**Axes & scale.** Six axes in the existing `PROPERTY_ORDER` (hardness, cleansing,
condition, creamy, bubbly, longevity), radial scale 0–100, values clamped to [0, 100].
Axis labels use short forms ("Bubbly", "Creamy" — not "Bubbly lather") to fit the narrow
sidebar.

**Layers (SVG, hand-rolled — no chart library):**

1. Grid: 2–3 concentric hexagons + axis spokes, muted stroke.
2. Suggested-range band: a hexagonal ring between the high-polygon and low-polygon of
   `SOAP_PROPERTY_GUIDE`, drawn as one `<path>` with `fill-rule="evenodd"`, translucent
   fill. (Balanced-target stays text-only below — two nested bands read as mud.)
3. Recipe polygon: stroked + lightly filled, with a dot at each vertex. **Low coverage**
   (rounded coverage < `LOW_COVERAGE_PERCENT`) renders the polygon with a dashed stroke.
4. Vertex highlight: a vertex outside its suggested range gets the same "outside"
   color used by the score text (suppressed under low coverage, same rule as today).

**Geometry.** Pure helper `packages/web/src/lib/radarGeometry.ts`:
`radarPoint(index, count, value, radius)` → `{x, y}`, plus polygon/ring path builders.
Unit-testable without rendering.

**Presentation.** `viewBox`-scaled (responsive, no fixed pixel size), colors via CSS
variables in `index.css` so dark mode and print stay legible. The SVG is `aria-hidden`;
the accessible representation is the score list below it. The radar does not render when
`properties` is null (existing empty-state hint remains).

## 3. Panel layout

Top to bottom: Iodine/INS (unchanged) → radar → coverage caption (unchanged wording:
"Based on / Estimated from N% of recipe oils…") → one compact row per property:

```
Hardness        41        Suggested 29–54 · Target 45–55
```

- Score keeps the existing class hooks: `.property-bars__value` and
  `.property-bars__value--outside` (outside the suggested band AND coverage OK) — the
  e2e test `property panel marks low-coverage recipes as estimated…` keeps passing
  unmodified.
- Each row carries `role="meter"` with `aria-valuemin/max/now` and the existing
  aria-label pattern (moved from the old track div).
- The per-row meter bars and two-swatch legend are removed; a single muted line explains
  the radar band ("Shaded band = suggested range").
- Longevity has no balanced target (as today) — its row shows only "Suggested 14–43".

## 4. Hygiene rider: `docosenoid` → `docosenoic`

- Rename in `packages/core/src/fatty-acids.ts` (`UNSATURATED_ACIDS`) and
  `packages/core/src/properties.ts` (`SOAP_PROPERTY_FATTY_ACIDS.condition`).
- Add a fatty-acid key normalization map in the oils-data build
  (`build-canonical.ts`): `docosenoid → docosenoic`, applied when copying legacy
  profiles; regenerate `canonical-oils*.json`.
- Result: a future correctly-spelled entry can no longer silently drop out of
  conditioning and the saturated/unsaturated ratio.

## Testing

- **Unit:** `radarGeometry` point/path math; `formatPropertyScore(40.9) === "41"`,
  range formatting; a properties.test case confirming the renamed key still counts
  toward conditioning (via build-normalized data shape).
- **RTL:** PropertiesPanel renders scores without `%`; outside-range class applied
  when out of band and suppressed under low coverage; radar absent when properties null.
- **e2e:** existing low-coverage test passes unmodified (selectors preserved).
- **Data:** `npm run build:oils && npm run validate:oils` after the key rename.

## Out of scope (noted for later)

- Process-aware property panel: bar properties are bar-soap concepts and arguably
  shouldn't render for LS recipes — belongs to the LS workstream.
- Qualitative interpretation ("hard, mild bar…") — a possible later layer on top.
- Radar on the printed batch sheet — the sheet keeps its compact `<dl>`.

## Collision note

The in-flight LS changes (process-aware `useRecipeCalculation`, `neutralization.ts`,
LS insight gating, negative superfat floor) do not touch the files this design edits;
rebase risk is low.
