# Pricing & Profit Calculator + Batch-Weight Breakdown — Design Spec

- **Date:** 2026-07-20
- **Status:** Design — awaiting review before implementation planning
- **Scope:** Two related additions to Soap Calc: (1) a per-recipe pricing / expenses /
  profit calculator that reports **cost and price per kg/lb**, and (2) a batch-calculator
  improvement that reports the **full batch-weight breakdown** (oils + lye + water +
  additives). The batch-weight total feeds the pricing math.

## 1. Goals & non-goals

### Goals
- Let a maker enter ingredient prices and business assumptions and see, for the current
  recipe: **cost per kg/lb**, **suggested price per kg/lb**, **profit per kg/lb**, and
  **margin %** — recomputed live like the rest of the app.
- Auto-derive materials cost from what the app already knows (oil weights, additive
  grams, lye grams) so the maker enters prices, not weights.
- Add a **full batch-weight breakdown** to the batch tooling (currently the app exposes
  only the oil fraction, never the true total mass that goes in the mold).
- Ship only **anonymised** methodology — universal accounting math plus neutral numeric
  defaults, no reference-source fingerprints (see §7).

### Non-goals (v1 — explicitly deferred)
- Break-even analysis, promo break-even, multi-product portfolio margin blend
  (larger "business suite"; a later spec may add them).
- Wholesale/retail price tiers (keystone).
- Per-bar pricing / bars-produced yield / cure water-loss modelling.
- Multi-currency locale formatting (symbol is a plain string; see §4).
- Persisting prices inside the portable recipe/export (deliberately kept separate).

## 2. Architecture & file map

Pricing is a **separate cross-recipe tool** (like the existing batch sizer), not recipe
content. It reads the current recipe's computed weights but stores its own state under
its own localStorage key. This keeps `RecipeLine`/`RecipeSettings` and recipe export
free of personal cost data.

| Concern | Location | Notes |
|---|---|---|
| Pricing math (pure) | **new** `packages/core/src/pricing.ts` (+ `pricing.test.ts`) | add `export * from './pricing.js';` to `src/index.ts` barrel (note `.js` ext) |
| Batch-weight math (pure) | **new** `packages/core/src/batch-weight.ts` (+ test) | add `export * from './batch-weight.js';` to barrel |
| Neutral constants | `PRICING_GUIDE` in `pricing.ts` | numeric defaults; neutral name per the `*_GUIDE` convention (AGENTS.md:128), e.g. real precedent `SOAP_PROPERTY_GUIDE` (`properties.ts:49`) |
| Pricing store (remembered) | **new** `packages/web/src/lib/pricingStorage.ts` | key `soap-calc:pricing`; versioned load/save + a standalone `normalizePricingProfile()` — precedent is `normalizeSettings` (`recipe.ts:156`), **not** `moldSizerStorage` (which has neither) |
| Pricing orchestration | **new** `packages/web/src/lib/recipePricing.ts` (unit parsing + assembling core inputs from the view model) | mirrors `lib/moldSizer.ts` |
| Pricing UI | **new** `packages/web/src/components/PricingPanel.tsx` (+ `.test.tsx`) | `<section className="panel">` in the sidebar; heavy sub-sections collapsible via `<details>` (like SettingsPanel's advanced area). See §6 for placement |
| Batch-weight display | extend `useRecipeViewModel` to expose the breakdown; render in the results/batch area | see §3 for the exact accessors (only `totalOilGrams` is a clean field today) |

No changes to recipe types, recipe storage, or recipe export.

## 3. Batch-weight breakdown (batch-calculator improvement)

### Core: `packages/core/src/batch-weight.ts`
```ts
export interface BatchWeightInput {
  oilGrams: number;        // vm.totalOilGrams
  lyeGrams: number;        // vm.result.lyeWeightGrams (NaOH+KOH combined)
  waterGrams: number;      // vm.result.waterWeightGrams
  extrasGrams: number;     // additives + split-liquid + post-cook-superfat (vm.extrasGrams)
}
export interface BatchWeightBreakdown {
  oils: number; lye: number; water: number; extras: number; total: number;
}
// Sums the four components; negative/NaN inputs are treated as 0. total = sum.
export function batchWeightBreakdown(input: BatchWeightInput): BatchWeightBreakdown;
```
The four components are chosen so that `total` equals the app's own authoritative
`batchWeightWithExtras` (`useRecipeViewModel.ts:260` = `baseBatchGrams + extrasGrams`). The
`extras` slice deliberately bundles additives + split-liquid + post-cook-superfat because
that is exactly what `extrasGrams` (`computeExtrasGrams`, `calculateAdditives.ts:71-79`)
already sums — using it keeps this readout consistent with the rest of the app and with the
cost-per-kg divisor in §5.

### Web wiring (exact accessors — verified)
Only `totalOilGrams` is a ready-made clean field; the rest need care:
- **oils:** `vm.totalOilGrams` (`useRecipeViewModel.ts:135/333`).
- **lye:** `vm.result?.lyeWeightGrams` — **null-guarded** (`vm.result` can be `null`;
  `LyeCalculationResult`, `lye.ts:50-62`).
- **water:** `vm.result?.waterWeightGrams` — null-guarded.
- **extras:** `vm.extrasGrams` (`:347`). Do **not** try to isolate "additives only" for the
  total — the app's total includes split-liquid/PCSF via `extrasGrams`. (If a UI wants an
  additives-only sub-figure it must sum `computedAdditives` separately;
  `additives.reduce((s,a)=>s+a.grams,0)` — but that is a display detail, not the total.)
- Add a memo `vm.batchWeight = batchWeightBreakdown({...})`; when `vm.result` is null the
  readout shows `—`.
- Render a compact readout near the existing totals:
  `Total batch: 1,612 g  ·  oils 1,000 · lye 138 · water 330 · extras 144`,
  formatted with the existing weight formatter and respecting the active weight unit.
- This `total` is the divisor for cost-per-kg/lb in §5.

### Correctness notes
- Verified: each additive item resolves to a gram value (`ComputedAdditive.grams`,
  `calculateAdditives.ts:18`) regardless of dose unit/basis (percent/ppt · oil/batch/solution) —
  grams are resolved upstream.
- **Split-liquid & post-cook-superfat are NOT part of `waterWeightGrams`** — they live in
  `extrasGrams`. That is why the total uses `extrasGrams` (not a bare additive sum); an
  earlier draft's "split-liquid already summed into water" note was wrong and is removed.

## 4. Pricing data model & state

### Remembered pricing state (localStorage `soap-calc:pricing`)
```ts
type PriceUnit = 'kg' | 'lb';
interface PricedEntry { price: string; unit: PriceUnit; }   // stringly-typed, like recipe fields

interface PricingProfile {
  // price book — remembered across recipes, keyed by stable id (see key strategy)
  oilPrices: Record<string, PricedEntry>;
  additivePrices: Record<string, PricedEntry>;
  lyePrice: PricedEntry;                 // ONE price, applied to total lyeWeightGrams (NaOH+KOH combined) — see key strategy note on dual-lye
  // assumptions
  packagingPerUnit: string;              // cost per kg/lb of finished soap (default '0')
  laborMinutes: string;                  // minutes per batch (global assumption; see §8)
  laborRatePerHour: string;
  laborBurdenPercent: string;            // default PRICING_GUIDE.defaultLaborBurdenPercent
  overheadMode: 'percent' | 'flat';
  overheadPercent: string;               // of (materials + labor)
  overheadFlat: string;                  // per batch
  // pricing lever
  priceLever: 'margin' | 'markup';
  targetMarginPercent: string;           // default PRICING_GUIDE.defaultTargetMarginPercent
  markupPercent: string;
  // presentation
  outputUnit: PriceUnit;                 // kg | lb for the cost/price outputs (default 'kg')
  currencySymbol: string;                // plain prefix string, default '$'
}
```
- **Price-book key strategy (oils vs additives differ — verified):**
  - **Oils:** key is always `line.oilId` (`recipe.ts:8-14`, required; an unknown id is a hard
    error at `lye.ts:233`). No name fallback needed — oils have no custom/unlisted case.
  - **Additives:** `catalogId` (`recipe.ts:18`) can be **blank** for custom additives, and
    `name` can also be blank. Key = `catalogId || normalizedName`; when **both are empty**,
    fall back to the additive line's per-line `key` (accepting that a nameless custom additive's
    price won't persist across sessions — a rare, acceptable edge case). This avoids the
    collision where several blank custom additives would share the key `''`.
- **Dual-lye / KOH note (verified):** a recipe carries both `naohWeightGrams` and
  `kohWeightGrams` (default `lyeType:'dual'` ≈ 5% KOH; LS = 100% KOH) (`lye.ts:50-62`). v1
  uses **one** lye price applied to `lyeWeightGrams` (the combined total). This is exact for
  LS (all KOH) and for single-lye CP (all NaOH); for dual-lye the ~5% KOH share priced at the
  NaOH rate introduces a sub-1% error on lye cost — itself a small share of COGS. Splitting
  NaOH/KOH pricing is deferred (§8).
- **Live reads from the current recipe (never stored here):** per-oil grams, per-additive
  grams, `lyeWeightGrams`, `batchWeightWithExtras`.
- Loaded/saved via `loadPricingProfile()` / `savePricingProfile()` with a `version` field and
  a standalone `normalizePricingProfile()` that fills defaults for missing keys — following the
  `normalizeSettings` precedent (`recipe.ts:156-198`). (`moldSizerStorage.ts` is *not* the
  precedent here: it has no version field and inlines its normalization.)

### Constants (`PRICING_GUIDE`, neutral name, informed-not-copied defaults)
```ts
export const PRICING_GUIDE = {
  defaultTargetMarginPercent: 65,   // typical handmade-goods margin floor
  defaultLaborBurdenPercent: 15,    // payroll burden on take-home wage
  defaultOverheadPercent: 20,       // overhead as % of product cost
} as const;
```

## 5. Pricing math (`packages/core/src/pricing.ts`, pure)

All money in the currency's base unit; all weights in grams internally. Conversions:
`perGram = pricePerUnit / (unit === 'kg' ? 1000 : 453.59237)`.

```ts
export interface PricingInput {
  oilLines: Array<{ grams: number; pricePerGram: number | null }>;
  additiveLines: Array<{ grams: number; pricePerGram: number | null }>;
  lyeGrams: number; lyePricePerGram: number | null;   // lyeGrams = vm.result.lyeWeightGrams (NaOH+KOH combined)
  totalBatchGrams: number;                             // = vm.batchWeightWithExtras (the app's authoritative total; see §3)
  packagingPerGram: number;          // already converted from per kg/lb
  laborMinutes: number; hourlyRate: number; laborBurdenPercent: number;
  overhead: { mode: 'percent'; percent: number } | { mode: 'flat'; amount: number };
  lever: { mode: 'margin'; marginPercent: number } | { mode: 'markup'; markupPercent: number };
  outputUnit: 'kg' | 'lb';
}
export interface PricingResult {
  materialsOils: number; materialsAdditives: number; lyeCost: number;
  labor: number; overhead: number; packaging: number;
  cogsBatch: number;
  costPerUnit: number | null;        // per kg/lb; null if totalBatchGrams <= 0
  suggestedPricePerUnit: number | null;
  profitPerUnit: number | null;
  marginPercent: number | null;
  markupPercent: number | null;
}
export function computePricing(input: PricingInput): PricingResult;
```

Formulas:
```
materialsOils     = Σ (grams × pricePerGram)         // null price → contributes 0, and see below
materialsAdditives= Σ (grams × pricePerGram)
lyeCost           = lyeGrams × lyePricePerGram        // null → 0
labor             = (laborMinutes / 60) × hourlyRate × (1 + laborBurdenPercent/100)
materials         = materialsOils + materialsAdditives + lyeCost
overhead          = mode==='flat' ? amount : (overheadPercent/100) × (materials + labor)
packaging         = packagingPerGram × totalBatchGrams
cogsBatch         = materials + labor + overhead + packaging
unitGrams         = outputUnit==='kg' ? 1000 : 453.59237
costPerUnit       = totalBatchGrams > 0 ? cogsBatch / (totalBatchGrams / unitGrams) : null
price (margin m)  = m < 100 ? costPerUnit / (1 − m/100) : null    // m is a percent; guard m>=100 (unreachable margin)
price (markup k)  = costPerUnit × (1 + k/100)
profitPerUnit     = price − costPerUnit
marginPercent     = price>0 ? (price − cost)/price × 100 : null
markupPercent     = cost>0 ? (price − cost)/cost × 100 : null
```

**Design decisions inside the math:**
- **Universal accounting formulas**, deliberately not the reference's branded worksheet.
  This also avoids a self-inconsistency in that worksheet (a "×2.33" constant it labels as
  "70% margin / 233% markup", which actually computes to ~57% margin; the correct 70%-margin
  factor is ×3.33). Deriving price from the margin/markup identities is correct at any target.
- **Missing prices:** a `null` `pricePerGram` contributes 0 to cost. Because a silent 0 can
  read as "free," the UI (§6) shows a "prices incomplete" hint whenever any in-recipe oil or
  additive has no price, and shows outputs as `—` until at least the oils are priced.
- **Guards:** `totalBatchGrams <= 0` → `costPerUnit = null` (→ all downstream null → `—`).
  `marginPercent >= 100` → price `null` (can't reach 100% margin).

## 6. UI — `PricingPanel`

A `<section className="panel">` placed in the sidebar `<aside className="sidebar">`
immediately after `ResultsPanel` (`App.tsx:199-217`). Note: there is **no** top-level
`<details>` panel precedent in the app — every panel is a `<section className="panel">`, and
the existing batch tool (`MoldSizerPanel`) is itself nested inside `SettingsPanel`'s advanced
`<details>`, not a top-level sibling. The panel's heavier sub-sections use `<details>` for
collapse (as `SettingsPanel`'s advanced area does), so pricing stays out of the way until
opened. Three sections:

1. **Materials** — auto list of the current recipe's oils, each row: name · grams (read-only)
   · price input · unit toggle (kg/lb) · line cost. Then the additive rows (same shape), a
   single lye price row, and an optional packaging cost (per kg/lb). A subtotal line shows
   materials cost. An inline hint appears if any oil/additive price is blank.
2. **Labor & overhead** — labor minutes (labelled "per batch"), rate/hour, burden %, and
   overhead (mode toggle: % of cost / flat per batch).
3. **Price & profit** — currency symbol, output-unit toggle (kg/lb), pricing lever toggle
   (target margin % / markup ×), then outputs: **cost per unit** (+ COGS split
   materials/labor/overhead/packaging), **cost per batch**, **suggested price per unit**,
   **profit per unit**, **margin %**, **markup %**. Zero/'—' when inputs incomplete.

- Live recompute via `useMemo` off the pricing profile + `vm` weights (no explicit
  "calculate" button), consistent with the rest of the app.
- A **new** money formatter follows the `toLocaleString('en-US', …)` convention used in
  `weightUnits.ts:74-77` but with `minimumFractionDigits: 2` (that file itself uses
  `minimumFractionDigits: 0`, so this is new formatting code, not a reuse). Currency symbol is
  a plain prefix (e.g. `$12.00`); suffix-style currencies are a known v1 cosmetic limitation.

## 7. Anonymity compliance

Checked against `AGENTS.md:106-128` (copyright-safe rule) and the oils-data de-branding
precedent:
- The reference book and the anonymised methodology brief stay in
  `/Users/str/soap-calc-archive/` — never committed.
- Only **ideas and numbers** enter the product: universal COGS/margin/markup math plus a few
  neutral numeric defaults (`PRICING_GUIDE`), which the rule explicitly permits.
- **No** book title, author, publisher, website, third-party formula attributions, example
  company names, or paraphrased passages in code, UI copy, or docs. UI copy is original and
  behaviour-based.
- Constant is `PRICING_GUIDE` (neutral), following the real `*_GUIDE` naming convention
  (AGENTS.md:128; existing examples `SOAP_PROPERTY_GUIDE` in `properties.ts:49`,
  `IODINE_GUIDE`/`INS_GUIDE` in `formulation-guide.ts`). (`FORMULATION_PROPERTY_GUIDE` from an
  earlier draft is not a real constant — it appears only as an illustration in AGENTS.md.) No
  reference **dataset** ships, so no `sourceType`/provenance record is needed.

## 8. Known limitations (accepted for v1)
- **Labor minutes is a global assumption**, not per-recipe — a small test batch and a large
  production batch share one labor-minutes value unless the user edits it. Labelled "per
  batch" so the assumption is visible. Making it per-recipe would mean touching recipe state,
  which this design deliberately avoids.
- **Currency** is a prefix symbol only (no locale/suffix formatting).
- **Single lye price** applied to combined `lyeWeightGrams`: exact for LS (100% KOH) and
  single-lye CP (100% NaOH); ~sub-1% lye-cost error for the default dual-lye 5% KOH blend.
  Splitting NaOH/KOH pricing is deferred.
- **Batch breakdown** shows a single `extras` slice (additives + split-liquid + post-cook
  superfat combined), matching the app's `extrasGrams`; no per-extra sub-rows in v1.

## 9. Testing
- `packages/core/src/batch-weight.test.ts` — component sums, total, negative/NaN → 0.
- `packages/core/src/pricing.test.ts` — pure input/output (like `mold-sizer.test.ts`):
  materials/labor/overhead/packaging arithmetic; kg vs lb conversion; margin↔markup identity
  round-trip (price from margin m ⇒ recomputed marginPercent == m); guard cases
  (`totalBatchGrams=0`, `margin>=100`, all-null prices → `costPerUnit` reflects 0 materials).
- `packages/web/src/components/PricingPanel.test.tsx` — auto-materials wiring (oil grams
  pulled from recipe), price-incomplete hint, empty-state `—`, lever toggle switches formula.
- Existing gates unaffected; `npm test` (typecheck → validate:oils → unit tests) must stay
  green.

## 10. Rollout
1. Core math + tests (`batch-weight.ts`, `pricing.ts`) — no UI, fully unit-tested.
2. Web store + orchestration (`pricingStorage.ts`, `lib/recipePricing.ts`).
3. `useRecipeViewModel` batch-weight memo + results readout.
4. `PricingPanel` + wiring into the app layout.
5. Component tests; manual verification in the running app.

Branch: `feat/pricing-profit-calculator` (rebase onto `main` before implementation once the
concurrent branch's untracked plan files clear).
