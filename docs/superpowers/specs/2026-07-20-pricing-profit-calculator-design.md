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
| Pricing math (pure) | **new** `packages/core/src/pricing.ts` (+ `pricing.test.ts`) | add to `src/index.ts` barrel |
| Batch-weight math (pure) | **new** `packages/core/src/batch-weight.ts` (+ test) | add to barrel |
| Neutral constants | `PRICING_GUIDE` in `pricing.ts` | numeric defaults; neutral name (cf. `FORMULATION_PROPERTY_GUIDE`) |
| Pricing store (remembered) | **new** `packages/web/src/lib/pricingStorage.ts` | key `soap-calc:pricing`; mirrors `moldSizerStorage.ts` |
| Pricing orchestration | **new** `packages/web/src/lib/pricing.ts` (unit parsing + assembling core inputs from the view model) | mirrors `lib/moldSizer.ts` |
| Pricing UI | **new** `packages/web/src/components/PricingPanel.tsx` (+ `.test.tsx`) | top-level collapsible `<details>`, default collapsed |
| Batch-weight display | extend `useRecipeViewModel` to expose the breakdown; render in the results/batch area | reads existing lye/water/additive numbers |

No changes to recipe types, recipe storage, or recipe export.

## 3. Batch-weight breakdown (batch-calculator improvement)

### Core: `packages/core/src/batch-weight.ts`
```ts
export interface BatchWeightInput {
  oilGrams: number;
  lyeGrams: number;
  waterGrams: number;      // total liquid (water or alt-liquid); split-liquid already summed upstream
  additiveGrams: number;   // Σ additive.grams
}
export interface BatchWeightBreakdown {
  oils: number; lye: number; water: number; additives: number; total: number;
}
// Sums the four components; negative/NaN inputs are treated as 0. total = sum.
export function batchWeightBreakdown(input: BatchWeightInput): BatchWeightBreakdown;
```

### Web wiring
- `useRecipeViewModel` already computes oil grams, lye grams, liquid grams
  (`calculateRecipe`), and additive grams (`additives.reduce((s,a)=>s+a.grams,0)`).
  Add a memo `vm.batchWeight = batchWeightBreakdown({...})`.
- Render a compact readout near the existing totals:
  `Total batch: 1,540 g  ·  oils 1,000 · lye 138 · water 330 · additives 72`,
  formatted with the existing weight formatter and respecting the active weight unit.
- This `total` is the divisor for cost-per-kg/lb in §5.

### Correctness notes
- Verified: each additive item resolves to a gram value (`item.grams`), summed today in
  `ResultsPanel.tsx`. So the additives slice and the total are reliable regardless of the
  additive's dose unit/basis (percent/ppt, oil/batch/solution) — grams are already resolved
  upstream.
- Split-liquid: `waterGrams` is the total liquid; the breakdown shows liquid as one
  "water" slice in v1 (no split sub-rows).

## 4. Pricing data model & state

### Remembered pricing state (localStorage `soap-calc:pricing`)
```ts
type PriceUnit = 'kg' | 'lb';
interface PricedEntry { price: string; unit: PriceUnit; }   // stringly-typed, like recipe fields

interface PricingProfile {
  // price book — remembered across recipes, keyed by stable id (see key strategy)
  oilPrices: Record<string, PricedEntry>;
  additivePrices: Record<string, PricedEntry>;
  lyePrice: PricedEntry;                 // one price for the recipe's lye (NaOH/KOH)
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
- **Price-book key strategy:** use the catalog oil/additive **id** when present; fall back
  to a normalized (lowercased, trimmed) **name** for custom/unlisted entries. Documented in
  `pricingStorage.ts`.
- **Live reads from the current recipe (never stored here):** per-oil grams, per-additive
  grams, lye grams, total batch weight.
- Loaded/saved via `loadPricingProfile()` / `savePricingProfile()` with a version field and
  a `normalizePricingProfile()` that fills defaults for missing keys (mirrors
  `moldSizerStorage.ts` + `normalizeSettings`).

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
  lyeGrams: number; lyePricePerGram: number | null;
  totalBatchGrams: number;
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
price (margin m)  = m < 1 ? costPerUnit / (1 − m/100) : null     // m as percent; guard m>=100
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

Top-level collapsible `<details>` panel (default collapsed) in the app layout, near the
results/batch area. Three sections:

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
- Number formatting reuses the `toLocaleString('en-US', { minimumFractionDigits: 2 })`
  pattern from `weightUnits.ts`; currency symbol is a plain prefix (e.g. `$12.00`).
  Suffix-style currencies are a known v1 cosmetic limitation.

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
- Constant is `PRICING_GUIDE` (neutral), matching the `FORMULATION_PROPERTY_GUIDE`
  convention. No reference **dataset** ships, so no `sourceType`/provenance record is needed.

## 8. Known limitations (accepted for v1)
- **Labor minutes is a global assumption**, not per-recipe — a small test batch and a large
  production batch share one labor-minutes value unless the user edits it. Labelled "per
  batch" so the assumption is visible. Making it per-recipe would mean touching recipe state,
  which this design deliberately avoids.
- **Currency** is a prefix symbol only (no locale/suffix formatting).
- **Water/liquid** shows as a single slice (no split-liquid sub-rows) in the batch breakdown.

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
2. Web store + orchestration (`pricingStorage.ts`, `lib/pricing.ts`).
3. `useRecipeViewModel` batch-weight memo + results readout.
4. `PricingPanel` + wiring into the app layout.
5. Component tests; manual verification in the running app.

Branch: `feat/pricing-profit-calculator` (rebase onto `main` before implementation once the
concurrent branch's untracked plan files clear).
