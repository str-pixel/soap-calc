# Pricing & Profit Calculator + Batch-Weight Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-recipe pricing/expenses/profit calculator that reports cost & price per kg/lb, and a batch-weight breakdown (oils + lye + water + extras) to the batch tooling.

**Architecture:** Pure math lives in `@soap-calc/core` (`batch-weight.ts`, `pricing.ts`). The web app adds a money formatter, a remembered pricing profile (localStorage), an orchestration layer that assembles core inputs from the recipe view model, a batch-weight readout in the existing `ResultsPanel`, and a new `PricingPanel` in the sidebar. Pricing is a separate cross-recipe tool — recipe types/exports are untouched.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), React 19, Vite, vitest (+ jsdom, Testing Library for components). npm workspaces.

## Global Constraints

- **Anonymity / copyright-safe (AGENTS.md:109):** ship ideas and numbers only. No book title, author, publisher, website, third-party formula attributions, example company names, or paraphrased passages in code, UI copy, tests, or docs. UI copy must be original and behaviour-based.
- **Neutral constant naming (AGENTS.md:128):** the pricing constant is `PRICING_GUIDE` (follows the real `*_GUIDE` convention, e.g. `SOAP_PROPERTY_GUIDE`).
- **No changes** to `RecipeLine`, `RecipeSettings`, recipe storage, or recipe export. Pricing state persists under its own key `soap-calc:pricing`.
- **Core import specifiers use `.js`** (e.g. `export * from './pricing.js'`), matching `packages/core/src/index.ts`.
- **Stringly-typed inputs:** UI numeric fields store strings; parse at compute time (repo convention).
- `npm test` (typecheck → validate:oils → unit tests) must stay green.
- **lb→g constant is `453.59237`** everywhere (matches `WEIGHT_UNITS.lb.gramsPerUnit`).
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Core — batch-weight breakdown

**Files:**
- Create: `packages/core/src/batch-weight.ts`
- Test: `packages/core/src/batch-weight.test.ts`
- Modify: `packages/core/src/index.ts` (add barrel export)

**Interfaces:**
- Produces: `batchWeightBreakdown(input: BatchWeightInput): BatchWeightBreakdown`,
  `interface BatchWeightInput { oilGrams: number; lyeGrams: number; waterGrams: number; extrasGrams: number }`,
  `interface BatchWeightBreakdown { oils: number; lye: number; water: number; extras: number; total: number }`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/batch-weight.test.ts
import { describe, expect, it } from 'vitest';
import { batchWeightBreakdown } from './batch-weight.js';

describe('batchWeightBreakdown', () => {
  it('sums the four components and totals them', () => {
    expect(batchWeightBreakdown({ oilGrams: 1000, lyeGrams: 138, waterGrams: 330, extrasGrams: 144 }))
      .toEqual({ oils: 1000, lye: 138, water: 330, extras: 144, total: 1612 });
  });

  it('clamps negative and non-finite components to 0', () => {
    expect(batchWeightBreakdown({ oilGrams: -5, lyeGrams: NaN, waterGrams: 100, extrasGrams: Infinity }))
      .toEqual({ oils: 0, lye: 0, water: 100, extras: 0, total: 100 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @soap-calc/core -- batch-weight`
Expected: FAIL — cannot resolve `./batch-weight.js` / `batchWeightBreakdown is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/batch-weight.ts
export interface BatchWeightInput {
  oilGrams: number;
  lyeGrams: number;
  waterGrams: number;
  /** additives + split-liquid + post-cook superfat (the app's extrasGrams) */
  extrasGrams: number;
}

export interface BatchWeightBreakdown {
  oils: number;
  lye: number;
  water: number;
  extras: number;
  total: number;
}

const clamp = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

export function batchWeightBreakdown(input: BatchWeightInput): BatchWeightBreakdown {
  const oils = clamp(input.oilGrams);
  const lye = clamp(input.lyeGrams);
  const water = clamp(input.waterGrams);
  const extras = clamp(input.extrasGrams);
  return { oils, lye, water, extras, total: oils + lye + water + extras };
}
```

- [ ] **Step 4: Add the barrel export**

In `packages/core/src/index.ts`, add after the `mold-sizer.js` line:
```ts
export * from './batch-weight.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace @soap-calc/core -- batch-weight`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/batch-weight.ts packages/core/src/batch-weight.test.ts packages/core/src/index.ts
git commit -m "feat(core): batch-weight breakdown (oils/lye/water/extras)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Core — pricing math + `PRICING_GUIDE`

**Files:**
- Create: `packages/core/src/pricing.ts`
- Test: `packages/core/src/pricing.test.ts`
- Modify: `packages/core/src/index.ts` (add barrel export)

**Interfaces:**
- Produces:
  - `PRICING_GUIDE` = `{ defaultTargetMarginPercent: 65, defaultLaborBurdenPercent: 15, defaultOverheadPercent: 20 }`
  - `interface PricingLine { grams: number; pricePerGram: number | null }`
  - `interface PricingInput { oilLines: PricingLine[]; additiveLines: PricingLine[]; lyeGrams: number; lyePricePerGram: number | null; totalBatchGrams: number; packagingPerGram: number; laborMinutes: number; hourlyRate: number; laborBurdenPercent: number; overhead: { mode: 'percent'; percent: number } | { mode: 'flat'; amount: number }; lever: { mode: 'margin'; marginPercent: number } | { mode: 'markup'; markupPercent: number }; outputUnit: 'kg' | 'lb' }`
  - `interface PricingResult { materialsOils: number; materialsAdditives: number; lyeCost: number; labor: number; overhead: number; packaging: number; cogsBatch: number; costPerUnit: number | null; suggestedPricePerUnit: number | null; profitPerUnit: number | null; marginPercent: number | null; markupPercent: number | null }`
  - `computePricing(input: PricingInput): PricingResult`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/pricing.test.ts
import { describe, expect, it } from 'vitest';
import { computePricing, PRICING_GUIDE, type PricingInput } from './pricing.js';

const base: PricingInput = {
  oilLines: [{ grams: 1000, pricePerGram: 0.0045 }],   // $4.50/kg
  additiveLines: [{ grams: 30, pricePerGram: 0.05 }],   // $50/kg fragrance
  lyeGrams: 140, lyePricePerGram: 0.002,                // $2/kg lye
  totalBatchGrams: 1610,
  packagingPerGram: 0,
  laborMinutes: 30, hourlyRate: 20, laborBurdenPercent: 15,
  overhead: { mode: 'percent', percent: 20 },
  lever: { mode: 'margin', marginPercent: 65 },
  outputUnit: 'kg',
};

describe('computePricing', () => {
  it('computes the COGS split', () => {
    const r = computePricing(base);
    expect(r.materialsOils).toBeCloseTo(4.5, 6);
    expect(r.materialsAdditives).toBeCloseTo(1.5, 6);
    expect(r.lyeCost).toBeCloseTo(0.28, 6);
    expect(r.labor).toBeCloseTo((30 / 60) * 20 * 1.15, 6);        // 11.5
    // overhead = 20% of (materials 6.28 + labor 11.5) = 3.556
    expect(r.overhead).toBeCloseTo(0.2 * (6.28 + 11.5), 6);
    expect(r.cogsBatch).toBeCloseTo(6.28 + 11.5 + 0.2 * (6.28 + 11.5), 6);
  });

  it('derives cost & price per kg and round-trips margin', () => {
    const r = computePricing(base);
    expect(r.costPerUnit).toBeCloseTo(r.cogsBatch / (1610 / 1000), 6);
    // price = cost / (1 - 0.65)
    expect(r.suggestedPricePerUnit).toBeCloseTo(r.costPerUnit! / 0.35, 6);
    expect(r.marginPercent).toBeCloseTo(65, 6);         // round-trips the input margin
    expect(r.profitPerUnit).toBeCloseTo(r.suggestedPricePerUnit! - r.costPerUnit!, 6);
  });

  it('converts to per-lb when outputUnit is lb', () => {
    const r = computePricing({ ...base, outputUnit: 'lb' });
    expect(r.costPerUnit).toBeCloseTo(r.cogsBatch / (1610 / 453.59237), 6);
  });

  it('applies markup lever', () => {
    const r = computePricing({ ...base, lever: { mode: 'markup', markupPercent: 200 } });
    expect(r.suggestedPricePerUnit).toBeCloseTo(r.costPerUnit! * 3, 6);
    expect(r.markupPercent).toBeCloseTo(200, 6);
  });

  it('guards zero batch weight and unreachable margin', () => {
    expect(computePricing({ ...base, totalBatchGrams: 0 }).costPerUnit).toBeNull();
    expect(computePricing({ ...base, lever: { mode: 'margin', marginPercent: 100 } }).suggestedPricePerUnit)
      .toBeNull();
  });

  it('treats null prices as zero cost', () => {
    const r = computePricing({
      ...base,
      oilLines: [{ grams: 1000, pricePerGram: null }],
      additiveLines: [], lyePricePerGram: null,
    });
    expect(r.materialsOils).toBe(0);
    expect(r.lyeCost).toBe(0);
  });

  it('exposes neutral numeric defaults', () => {
    expect(PRICING_GUIDE.defaultTargetMarginPercent).toBe(65);
    expect(PRICING_GUIDE.defaultLaborBurdenPercent).toBe(15);
    expect(PRICING_GUIDE.defaultOverheadPercent).toBe(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @soap-calc/core -- pricing`
Expected: FAIL — cannot resolve `./pricing.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/pricing.ts
const GRAMS_PER_KG = 1000;
const GRAMS_PER_LB = 453.59237;

/** Neutral numeric defaults (informed, not copied). Follows the *_GUIDE convention. */
export const PRICING_GUIDE = {
  defaultTargetMarginPercent: 65,
  defaultLaborBurdenPercent: 15,
  defaultOverheadPercent: 20,
} as const;

export interface PricingLine {
  grams: number;
  pricePerGram: number | null;
}

export interface PricingInput {
  oilLines: PricingLine[];
  additiveLines: PricingLine[];
  lyeGrams: number;
  lyePricePerGram: number | null;
  /** = the app's batchWeightWithExtras; the cost-per-unit divisor */
  totalBatchGrams: number;
  packagingPerGram: number;
  laborMinutes: number;
  hourlyRate: number;
  laborBurdenPercent: number;
  overhead: { mode: 'percent'; percent: number } | { mode: 'flat'; amount: number };
  lever: { mode: 'margin'; marginPercent: number } | { mode: 'markup'; markupPercent: number };
  outputUnit: 'kg' | 'lb';
}

export interface PricingResult {
  materialsOils: number;
  materialsAdditives: number;
  lyeCost: number;
  labor: number;
  overhead: number;
  packaging: number;
  cogsBatch: number;
  costPerUnit: number | null;
  suggestedPricePerUnit: number | null;
  profitPerUnit: number | null;
  marginPercent: number | null;
  markupPercent: number | null;
}

const pos = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

function sumLines(lines: PricingLine[]): number {
  return lines.reduce(
    (s, l) => s + (l.pricePerGram != null && Number.isFinite(l.pricePerGram) ? pos(l.grams) * l.pricePerGram : 0),
    0,
  );
}

export function computePricing(input: PricingInput): PricingResult {
  const materialsOils = sumLines(input.oilLines);
  const materialsAdditives = sumLines(input.additiveLines);
  const lyeCost =
    input.lyePricePerGram != null && Number.isFinite(input.lyePricePerGram)
      ? pos(input.lyeGrams) * input.lyePricePerGram
      : 0;

  const labor = (pos(input.laborMinutes) / 60) * pos(input.hourlyRate) * (1 + pos(input.laborBurdenPercent) / 100);
  const materials = materialsOils + materialsAdditives + lyeCost;
  const overhead =
    input.overhead.mode === 'flat'
      ? pos(input.overhead.amount)
      : (pos(input.overhead.percent) / 100) * (materials + labor);
  const packaging = pos(input.packagingPerGram) * pos(input.totalBatchGrams);
  const cogsBatch = materials + labor + overhead + packaging;

  const unitGrams = input.outputUnit === 'lb' ? GRAMS_PER_LB : GRAMS_PER_KG;
  const costPerUnit = input.totalBatchGrams > 0 ? cogsBatch / (input.totalBatchGrams / unitGrams) : null;

  let suggestedPricePerUnit: number | null = null;
  if (costPerUnit != null) {
    if (input.lever.mode === 'margin') {
      const m = input.lever.marginPercent;
      suggestedPricePerUnit = m < 100 ? costPerUnit / (1 - m / 100) : null;
    } else {
      suggestedPricePerUnit = costPerUnit * (1 + input.lever.markupPercent / 100);
    }
  }

  const profitPerUnit =
    costPerUnit != null && suggestedPricePerUnit != null ? suggestedPricePerUnit - costPerUnit : null;
  const marginPercent =
    costPerUnit != null && suggestedPricePerUnit != null && suggestedPricePerUnit > 0
      ? ((suggestedPricePerUnit - costPerUnit) / suggestedPricePerUnit) * 100
      : null;
  const markupPercent =
    costPerUnit != null && suggestedPricePerUnit != null && costPerUnit > 0
      ? ((suggestedPricePerUnit - costPerUnit) / costPerUnit) * 100
      : null;

  return {
    materialsOils, materialsAdditives, lyeCost, labor, overhead, packaging, cogsBatch,
    costPerUnit, suggestedPricePerUnit, profitPerUnit, marginPercent, markupPercent,
  };
}
```

- [ ] **Step 4: Add the barrel export**

In `packages/core/src/index.ts`, add:
```ts
export * from './pricing.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace @soap-calc/core -- pricing`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/pricing.ts packages/core/src/pricing.test.ts packages/core/src/index.ts
git commit -m "feat(core): pricing math (COGS, cost/price per kg-lb, margin/markup)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Web — money formatter + price/unit helper

**Files:**
- Create: `packages/web/src/lib/money.ts`
- Test: `packages/web/src/lib/money.test.ts`

**Interfaces:**
- Consumes: `WEIGHT_UNITS` from `./weightUnits`.
- Produces:
  - `type PriceUnit = 'kg' | 'lb'`
  - `formatMoney(amount: number, currencySymbol: string): string` — 2-dp, `en-US` grouping, symbol prefix; `'—'`-safe callers pass finite numbers only.
  - `pricePerGram(priceStr: string, unit: PriceUnit): number | null` — parses a price string; returns per-gram price, or `null` when blank/invalid/negative.

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/lib/money.test.ts
import { describe, expect, it } from 'vitest';
import { formatMoney, pricePerGram } from './money';

describe('formatMoney', () => {
  it('formats with symbol prefix and 2 decimals', () => {
    expect(formatMoney(12, '$')).toBe('$12.00');
    expect(formatMoney(1234.5, '$')).toBe('$1,234.50');
  });
});

describe('pricePerGram', () => {
  it('converts per-kg and per-lb prices to per-gram', () => {
    expect(pricePerGram('4.50', 'kg')).toBeCloseTo(0.0045, 8);
    expect(pricePerGram('4.50', 'lb')).toBeCloseTo(4.5 / 453.59237, 8);
  });
  it('returns null for blank or invalid input', () => {
    expect(pricePerGram('', 'kg')).toBeNull();
    expect(pricePerGram('abc', 'kg')).toBeNull();
    expect(pricePerGram('-2', 'kg')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @soap-calc/web -- money`
Expected: FAIL — cannot resolve `./money`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/web/src/lib/money.ts
import { WEIGHT_UNITS } from './weightUnits';

export type PriceUnit = 'kg' | 'lb';

export function formatMoney(amount: number, currencySymbol: string): string {
  const body = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currencySymbol}${body}`;
}

export function pricePerGram(priceStr: string, unit: PriceUnit): number | null {
  if (priceStr.trim() === '') return null;
  const value = Number(priceStr);
  if (!Number.isFinite(value) || value < 0) return null;
  const gramsPerUnit = WEIGHT_UNITS[unit].gramsPerUnit;
  return value / gramsPerUnit;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @soap-calc/web -- money`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/money.ts packages/web/src/lib/money.test.ts
git commit -m "feat(web): money formatter and price-per-gram helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Web — pricing profile type, defaults, normalize, storage

**Files:**
- Create: `packages/web/src/lib/pricingProfile.ts`
- Create: `packages/web/src/lib/pricingStorage.ts`
- Test: `packages/web/src/lib/pricingStorage.test.ts`

**Interfaces:**
- Consumes: `PriceUnit` from `./money`; `PRICING_GUIDE` from `@soap-calc/core`.
- Produces (`pricingProfile.ts`):
  - `interface PricedEntry { price: string; unit: PriceUnit }`
  - `interface PricingProfile { oilPrices: Record<string, PricedEntry>; additivePrices: Record<string, PricedEntry>; lyePrice: PricedEntry; packagingPerUnit: string; laborMinutes: string; laborRatePerHour: string; laborBurdenPercent: string; overheadMode: 'percent' | 'flat'; overheadPercent: string; overheadFlat: string; priceLever: 'margin' | 'markup'; targetMarginPercent: string; markupPercent: string; outputUnit: PriceUnit; currencySymbol: string }`
  - `DEFAULT_PRICING_PROFILE: PricingProfile`
  - `normalizePricingProfile(raw: unknown): PricingProfile`
- Produces (`pricingStorage.ts`): `loadPricingProfile(): PricingProfile`, `savePricingProfile(profile: PricingProfile): void`, `PRICING_STORAGE_KEY = 'soap-calc:pricing'`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/lib/pricingStorage.test.ts
// Web unit tests run under environment:'node' (vitest.config.ts) — no global localStorage.
// Mirror moldSizerStorage.test.ts: stub a Storage impl via vi.stubGlobal (NOT a jsdom pragma).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PRICING_PROFILE, normalizePricingProfile } from './pricingProfile';
import { loadPricingProfile, savePricingProfile } from './pricingStorage';

function createStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear() { store.clear(); },
    getItem(key: string) { return store.get(key) ?? null; },
    key(index: number) { return [...store.keys()][index] ?? null; },
    removeItem(key: string) { store.delete(key); },
    setItem(key: string, value: string) { store.set(key, value); },
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage());
});

describe('normalizePricingProfile', () => {
  it('fills defaults for missing/invalid keys', () => {
    const p = normalizePricingProfile({ currencySymbol: '€', outputUnit: 'lb', junk: 1 });
    expect(p.currencySymbol).toBe('€');
    expect(p.outputUnit).toBe('lb');
    expect(p.targetMarginPercent).toBe(DEFAULT_PRICING_PROFILE.targetMarginPercent);
    expect(p.oilPrices).toEqual({});
  });
  it('returns defaults for non-object input', () => {
    expect(normalizePricingProfile(null)).toEqual(DEFAULT_PRICING_PROFILE);
  });
  it('keeps a valid price-book entry', () => {
    const p = normalizePricingProfile({ oilPrices: { 'olive-oil': { price: '4.50', unit: 'kg' } } });
    expect(p.oilPrices['olive-oil']).toEqual({ price: '4.50', unit: 'kg' });
  });
});

describe('load/save round-trip', () => {
  it('persists and reloads a profile', () => {
    const profile = { ...DEFAULT_PRICING_PROFILE, currencySymbol: '£', laborMinutes: '45' };
    savePricingProfile(profile);
    expect(loadPricingProfile()).toEqual(profile);
  });
  it('returns defaults when storage is empty', () => {
    expect(loadPricingProfile()).toEqual(DEFAULT_PRICING_PROFILE);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @soap-calc/web -- pricingStorage`
Expected: FAIL — cannot resolve `./pricingProfile`.

- [ ] **Step 3: Write `pricingProfile.ts`**

```ts
// packages/web/src/lib/pricingProfile.ts
import { PRICING_GUIDE } from '@soap-calc/core';
import type { PriceUnit } from './money';

export interface PricedEntry {
  price: string;
  unit: PriceUnit;
}

export interface PricingProfile {
  oilPrices: Record<string, PricedEntry>;
  additivePrices: Record<string, PricedEntry>;
  lyePrice: PricedEntry;
  packagingPerUnit: string;
  laborMinutes: string;
  laborRatePerHour: string;
  laborBurdenPercent: string;
  overheadMode: 'percent' | 'flat';
  overheadPercent: string;
  overheadFlat: string;
  priceLever: 'margin' | 'markup';
  targetMarginPercent: string;
  markupPercent: string;
  outputUnit: PriceUnit;
  currencySymbol: string;
}

export const DEFAULT_PRICING_PROFILE: PricingProfile = {
  oilPrices: {},
  additivePrices: {},
  lyePrice: { price: '', unit: 'kg' },
  packagingPerUnit: '0',
  laborMinutes: '0',
  laborRatePerHour: '0',
  laborBurdenPercent: String(PRICING_GUIDE.defaultLaborBurdenPercent),
  overheadMode: 'percent',
  overheadPercent: String(PRICING_GUIDE.defaultOverheadPercent),
  overheadFlat: '0',
  priceLever: 'margin',
  targetMarginPercent: String(PRICING_GUIDE.defaultTargetMarginPercent),
  markupPercent: '0',
  outputUnit: 'kg',
  currencySymbol: '$',
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function priceUnit(v: unknown, fallback: PriceUnit): PriceUnit {
  return v === 'kg' || v === 'lb' ? v : fallback;
}

function pricedEntry(v: unknown, fallback: PricedEntry): PricedEntry {
  if (!isRecord(v)) return { ...fallback };
  return { price: str(v.price, fallback.price), unit: priceUnit(v.unit, fallback.unit) };
}

function priceBook(v: unknown): Record<string, PricedEntry> {
  if (!isRecord(v)) return {};
  const out: Record<string, PricedEntry> = {};
  for (const [key, entry] of Object.entries(v)) {
    if (isRecord(entry) && typeof entry.price === 'string') {
      out[key] = { price: entry.price, unit: priceUnit(entry.unit, 'kg') };
    }
  }
  return out;
}

export function normalizePricingProfile(raw: unknown): PricingProfile {
  if (!isRecord(raw)) return { ...DEFAULT_PRICING_PROFILE };
  const d = DEFAULT_PRICING_PROFILE;
  return {
    oilPrices: priceBook(raw.oilPrices),
    additivePrices: priceBook(raw.additivePrices),
    lyePrice: pricedEntry(raw.lyePrice, d.lyePrice),
    packagingPerUnit: str(raw.packagingPerUnit, d.packagingPerUnit),
    laborMinutes: str(raw.laborMinutes, d.laborMinutes),
    laborRatePerHour: str(raw.laborRatePerHour, d.laborRatePerHour),
    laborBurdenPercent: str(raw.laborBurdenPercent, d.laborBurdenPercent),
    overheadMode: raw.overheadMode === 'flat' ? 'flat' : 'percent',
    overheadPercent: str(raw.overheadPercent, d.overheadPercent),
    overheadFlat: str(raw.overheadFlat, d.overheadFlat),
    priceLever: raw.priceLever === 'markup' ? 'markup' : 'margin',
    targetMarginPercent: str(raw.targetMarginPercent, d.targetMarginPercent),
    markupPercent: str(raw.markupPercent, d.markupPercent),
    outputUnit: priceUnit(raw.outputUnit, d.outputUnit),
    currencySymbol: str(raw.currencySymbol, d.currencySymbol),
  };
}
```

- [ ] **Step 4: Write `pricingStorage.ts`**

```ts
// packages/web/src/lib/pricingStorage.ts
import {
  DEFAULT_PRICING_PROFILE,
  normalizePricingProfile,
  type PricingProfile,
} from './pricingProfile';

export const PRICING_STORAGE_KEY = 'soap-calc:pricing';
const PRICING_STORAGE_VERSION = 1;

export function loadPricingProfile(): PricingProfile {
  try {
    const raw = localStorage.getItem(PRICING_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PRICING_PROFILE };
    const data = JSON.parse(raw) as unknown;
    const payload =
      typeof data === 'object' && data !== null && 'profile' in data
        ? (data as { profile: unknown }).profile
        : data;
    return normalizePricingProfile(payload);
  } catch {
    return { ...DEFAULT_PRICING_PROFILE };
  }
}

export function savePricingProfile(profile: PricingProfile): void {
  try {
    localStorage.setItem(
      PRICING_STORAGE_KEY,
      JSON.stringify({ version: PRICING_STORAGE_VERSION, profile }),
    );
  } catch {
    // ignore quota errors
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace @soap-calc/web -- pricingStorage`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/lib/pricingProfile.ts packages/web/src/lib/pricingStorage.ts packages/web/src/lib/pricingStorage.test.ts
git commit -m "feat(web): remembered pricing profile + versioned storage

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Web — orchestration (`recipePricing.ts`)

**Files:**
- Create: `packages/web/src/lib/recipePricing.ts`
- Test: `packages/web/src/lib/recipePricing.test.ts`

**Interfaces:**
- Consumes: `computePricing`, `PricingInput`, `PricingResult` from `@soap-calc/core`; `pricePerGram` from `./money`; `PricingProfile`, `PricedEntry` from `./pricingProfile`.
- Produces:
  - `interface RecipePricingContext { oilLines: Array<{ oilId: string; grams: number; name: string }>; additives: Array<{ key: string; catalogId: string; name: string; grams: number }>; lyeGrams: number; totalBatchGrams: number }`
  - `additivePriceKey(a: { key: string; catalogId: string; name: string }): string`
  - `buildPricingInput(ctx: RecipePricingContext, profile: PricingProfile): PricingInput`
  - `computeRecipePricing(ctx: RecipePricingContext, profile: PricingProfile): PricingResult`
  - `hasMissingMaterialPrice(ctx: RecipePricingContext, profile: PricingProfile): boolean` — true if any in-recipe oil or additive lacks a price (drives the UI hint).

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/lib/recipePricing.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICING_PROFILE } from './pricingProfile';
import {
  additivePriceKey,
  buildPricingInput,
  computeRecipePricing,
  hasMissingMaterialPrice,
  type RecipePricingContext,
} from './recipePricing';

const ctx: RecipePricingContext = {
  oilLines: [{ oilId: 'olive-oil', grams: 1000, name: 'Olive Oil' }],
  additives: [{ key: 'k1', catalogId: 'fragrance', name: 'Fragrance', grams: 30 }],
  lyeGrams: 140,
  totalBatchGrams: 1610,
};

describe('additivePriceKey', () => {
  it('prefers catalogId', () => {
    expect(additivePriceKey({ key: 'k1', catalogId: 'fragrance', name: 'X' })).toBe('fragrance');
  });
  it('falls back to a name key, then the line key', () => {
    expect(additivePriceKey({ key: 'k1', catalogId: '', name: 'My Blend' })).toBe('name:my blend');
    expect(additivePriceKey({ key: 'k1', catalogId: '', name: 'Additive' })).toBe('line:k1');
    expect(additivePriceKey({ key: 'k1', catalogId: '', name: '' })).toBe('line:k1');
  });
});

describe('buildPricingInput', () => {
  it('maps price-book entries to per-gram prices', () => {
    const profile = {
      ...DEFAULT_PRICING_PROFILE,
      oilPrices: { 'olive-oil': { price: '4.50', unit: 'kg' as const } },
      additivePrices: { fragrance: { price: '50', unit: 'kg' as const } },
      lyePrice: { price: '2', unit: 'kg' as const },
    };
    const input = buildPricingInput(ctx, profile);
    expect(input.oilLines[0].pricePerGram).toBeCloseTo(0.0045, 8);
    expect(input.additiveLines[0].pricePerGram).toBeCloseTo(0.05, 8);
    expect(input.lyePricePerGram).toBeCloseTo(0.002, 8);
    expect(input.totalBatchGrams).toBe(1610);
  });
});

describe('hasMissingMaterialPrice', () => {
  it('is true when an oil has no price', () => {
    expect(hasMissingMaterialPrice(ctx, DEFAULT_PRICING_PROFILE)).toBe(true);
  });
  it('is false when all oils and additives are priced', () => {
    const profile = {
      ...DEFAULT_PRICING_PROFILE,
      oilPrices: { 'olive-oil': { price: '4.50', unit: 'kg' as const } },
      additivePrices: { fragrance: { price: '50', unit: 'kg' as const } },
    };
    expect(hasMissingMaterialPrice(ctx, profile)).toBe(false);
  });
});

describe('computeRecipePricing', () => {
  it('returns a full PricingResult', () => {
    const profile = {
      ...DEFAULT_PRICING_PROFILE,
      oilPrices: { 'olive-oil': { price: '4.50', unit: 'kg' as const } },
    };
    const r = computeRecipePricing(ctx, profile);
    expect(r.materialsOils).toBeCloseTo(4.5, 6);
    expect(r.costPerUnit).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @soap-calc/web -- recipePricing`
Expected: FAIL — cannot resolve `./recipePricing`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/web/src/lib/recipePricing.ts
import { computePricing, type PricingInput, type PricingResult } from '@soap-calc/core';
import { pricePerGram } from './money';
import type { PricedEntry, PricingProfile } from './pricingProfile';

export interface RecipePricingContext {
  oilLines: Array<{ oilId: string; grams: number; name: string }>;
  additives: Array<{ key: string; catalogId: string; name: string; grams: number }>;
  lyeGrams: number;
  totalBatchGrams: number;
}

export function additivePriceKey(a: { key: string; catalogId: string; name: string }): string {
  if (a.catalogId) return a.catalogId;
  const n = a.name.trim().toLowerCase();
  return n && n !== 'additive' ? `name:${n}` : `line:${a.key}`;
}

function entryPerGram(entry: PricedEntry | undefined): number | null {
  return entry ? pricePerGram(entry.price, entry.unit) : null;
}

export function buildPricingInput(ctx: RecipePricingContext, profile: PricingProfile): PricingInput {
  return {
    oilLines: ctx.oilLines.map((o) => ({
      grams: o.grams,
      pricePerGram: entryPerGram(profile.oilPrices[o.oilId]),
    })),
    additiveLines: ctx.additives.map((a) => ({
      grams: a.grams,
      pricePerGram: entryPerGram(profile.additivePrices[additivePriceKey(a)]),
    })),
    lyeGrams: ctx.lyeGrams,
    lyePricePerGram: entryPerGram(profile.lyePrice),
    totalBatchGrams: ctx.totalBatchGrams,
    packagingPerGram: pricePerGram(profile.packagingPerUnit, profile.outputUnit) ?? 0,
    laborMinutes: Number(profile.laborMinutes) || 0,
    hourlyRate: Number(profile.laborRatePerHour) || 0,
    laborBurdenPercent: Number(profile.laborBurdenPercent) || 0,
    overhead:
      profile.overheadMode === 'flat'
        ? { mode: 'flat', amount: Number(profile.overheadFlat) || 0 }
        : { mode: 'percent', percent: Number(profile.overheadPercent) || 0 },
    lever:
      profile.priceLever === 'markup'
        ? { mode: 'markup', markupPercent: Number(profile.markupPercent) || 0 }
        : { mode: 'margin', marginPercent: Number(profile.targetMarginPercent) || 0 },
    outputUnit: profile.outputUnit,
  };
}

export function computeRecipePricing(ctx: RecipePricingContext, profile: PricingProfile): PricingResult {
  return computePricing(buildPricingInput(ctx, profile));
}

export function hasMissingMaterialPrice(ctx: RecipePricingContext, profile: PricingProfile): boolean {
  const oilMissing = ctx.oilLines.some((o) => entryPerGram(profile.oilPrices[o.oilId]) == null);
  const addMissing = ctx.additives.some((a) => entryPerGram(profile.additivePrices[additivePriceKey(a)]) == null);
  return oilMissing || addMissing;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @soap-calc/web -- recipePricing`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/recipePricing.ts packages/web/src/lib/recipePricing.test.ts
git commit -m "feat(web): recipe pricing orchestration (context -> PricingInput)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Web — batch-weight breakdown readout in `ResultsPanel`

**Files:**
- Modify: `packages/web/src/components/ResultsPanel.tsx`
- Modify: `packages/web/src/App.tsx:199-217` (pass `totalOilGrams` prop)
- Test: `packages/web/src/components/ResultsPanel.batchWeight.test.tsx`

**Interfaces:**
- Consumes: `batchWeightBreakdown` from `@soap-calc/core`; existing `ResultsPanel` props `result`, `extrasGrams`, `batchWeightWithExtras`, `weightUnit`; **new OPTIONAL** prop `totalOilGrams?: number` (default `0`, mirroring the existing optional `extrasGrams?` — a required prop would break the 7 render sites in the existing `ResultsPanel.test.tsx`).
- Produces: a `data-testid="batch-weight"` readout inside `ResultsPanel`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// packages/web/src/components/ResultsPanel.batchWeight.test.tsx
// NOTE: the jsdom pragma above MUST be line 1 — web vitest defaults to environment:'node'.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ResultsPanel } from './ResultsPanel';

afterEach(cleanup);

// Minimal props: a real recipe render is covered elsewhere; here we assert the
// breakdown readout appears and totals the four slices from the props it receives.
const baseResult = {
  totalOilWeightGrams: 1000, lyeWeightGrams: 138, naohWeightGrams: 138, kohWeightGrams: 0,
  waterWeightGrams: 330, totalBatchWeightGrams: 1468, lyeConcentrationPercent: 30,
  waterLyeRatio: 2.4, lines: [], warnings: [], errors: [],
};

function renderPanel() {
  render(
    <ResultsPanel
      result={baseResult as never}
      inputErrors={[] as never}
      lyeLabel="NaOH"
      process={'cp' as never}
      lyeType={'naoh' as never}
      kohBlendPercent={'0'}
      displayTotals={{ recipeOilWeightGrams: 1000 } as never}
      weightUnit="g"
      waterMode={'concentration' as never}
      splitLiquid={undefined as never}
      splitLiquidGrams={null}
      additives={[] as never}
      superfatPercent={'5'}
      postCookSuperfat={null as never}
      pcsfIsExtra={false}
      extrasGrams={144}
      batchWeightWithExtras={1612}
      totalOilGrams={1000}
    />,
  );
}

describe('ResultsPanel batch-weight breakdown', () => {
  it('renders the total and the four slices', () => {
    renderPanel();
    const el = screen.getByTestId('batch-weight');
    expect(el.textContent).toMatch(/1,612 g/);   // total = oils+lye+water+extras
    expect(el.textContent).toMatch(/oils/i);
    expect(el.textContent).toMatch(/extras/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @soap-calc/web -- ResultsPanel.batchWeight`
Expected: FAIL — `totalOilGrams` not a prop / no `batch-weight` testid.

- [ ] **Step 3: Implement — add the prop and readout**

In `ResultsPanel.tsx`: add `totalOilGrams?: number;` to the `ResultsPanelProps` type (optional, like `extrasGrams?`), and destructure it with a default in the component signature: `totalOilGrams = 0,` (next to the existing `extrasGrams = 0,`). Import `batchWeightBreakdown`; `formatWeight` may already be imported — add it only if absent:
```tsx
import { batchWeightBreakdown } from '@soap-calc/core';
import { formatWeight } from '../lib/weightUnits'; // skip if already imported
```
Inside the component body (after existing derived values), compute:
```tsx
const batchWeight = batchWeightBreakdown({
  oilGrams: totalOilGrams,
  lyeGrams: result?.lyeWeightGrams ?? 0,
  waterGrams: result?.waterWeightGrams ?? 0,
  extrasGrams,
});
```
Render (place it near the existing totals; keep copy original and behaviour-based):
```tsx
{batchWeight.total > 0 && (
  <p className="results-batch-weight" data-testid="batch-weight">
    <strong>Total batch:</strong> {formatWeight(batchWeight.total, weightUnit)}
    {' · '}oils {formatWeight(batchWeight.oils, weightUnit)}
    {' · '}lye {formatWeight(batchWeight.lye, weightUnit)}
    {' · '}water {formatWeight(batchWeight.water, weightUnit)}
    {batchWeight.extras > 0 && <> · extras {formatWeight(batchWeight.extras, weightUnit)}</>}
  </p>
)}
```
In `App.tsx`, add to the `<ResultsPanel ... />` props (after `batchWeightWithExtras={vm.batchWeightWithExtras}`):
```tsx
totalOilGrams={vm.totalOilGrams}
```

> Consistency note: `batchWeight.total` (oils+lye+water+extras) should equal the
> `batchWeightWithExtras` prop the panel already receives (the pricing divisor in Task 8),
> since the base batch = oils+lye+water. In Step 5's manual check, confirm the readout total
> matches; if a recipe ever diverges, prefer displaying `batchWeightWithExtras` as the headline
> total and keep the slices as detail.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @soap-calc/web -- ResultsPanel.batchWeight`
Expected: PASS (1 test).

- [ ] **Step 5: Run typecheck + full web tests (guard against prop/type breakage)**

Run: `npm run typecheck && npm test --workspace @soap-calc/web -- ResultsPanel`
Expected: PASS (existing ResultsPanel tests still green).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/ResultsPanel.tsx packages/web/src/components/ResultsPanel.batchWeight.test.tsx packages/web/src/App.tsx
git commit -m "feat(web): batch-weight breakdown readout in results

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Web — `PricingPanel` component (props-driven)

**Files:**
- Create: `packages/web/src/components/PricingPanel.tsx`
- Test: `packages/web/src/components/PricingPanel.test.tsx`

**Interfaces:**
- Consumes: `RecipePricingContext`, `computeRecipePricing`, `hasMissingMaterialPrice`, `additivePriceKey` from `../lib/recipePricing`; `PricingProfile`, `PricedEntry` from `../lib/pricingProfile`; `formatMoney` from `../lib/money`; `formatWeight` from `../lib/weightUnits`.
- Produces: `PricingPanel` with props
  `{ context: RecipePricingContext; profile: PricingProfile; onProfileChange: (next: PricingProfile) => void }`.

**Implementation notes (no new math — all math is Tasks 2 & 5):**
- Render a `<section className="panel">` with a heading. Three sub-areas (Materials / Labour & overhead / Price & profit); the panel's heavy Materials + Labour areas may be wrapped in `<details>` for collapse.
- **Materials:** one row per `context.oilLines` (name + read-only grams via `formatWeight(grams, 'g')` + a price `<input>` + a kg/lb `<select>`), then one row per `context.additives` (same shape, keyed by `additivePriceKey`), then a lye price row, then a packaging input. Editing a price calls `onProfileChange` with an updated `oilPrices`/`additivePrices`/`lyePrice`/`packagingPerUnit`.
- Show a hint (`data-testid="price-incomplete"`) when `hasMissingMaterialPrice(context, profile)`.
- **Price & profit:** compute `const r = computeRecipePricing(context, profile)` and render `formatMoney(...)` for costPerUnit, cogsBatch, suggestedPricePerUnit, profitPerUnit; show `—` (via a `money(v)` helper: `v == null ? '—' : formatMoney(v, profile.currencySymbol)`) when a value is null. Margin/markup as `x.toFixed(1)%` or `—`.
- Currency symbol input, output-unit toggle, and lever toggle (margin/markup) all call `onProfileChange`.
- **UI copy must be original and behaviour-based** (Global Constraints).

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// packages/web/src/components/PricingPanel.test.tsx
// NOTE: the jsdom pragma above MUST be line 1 — web vitest defaults to environment:'node'.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_PRICING_PROFILE } from '../lib/pricingProfile';
import type { RecipePricingContext } from '../lib/recipePricing';
import { PricingPanel } from './PricingPanel';

afterEach(cleanup);

const context: RecipePricingContext = {
  oilLines: [{ oilId: 'olive-oil', grams: 1000, name: 'Olive Oil' }],
  additives: [],
  lyeGrams: 140,
  totalBatchGrams: 1610,
};

describe('PricingPanel', () => {
  it('lists recipe oils and shows the incomplete-price hint', () => {
    render(<PricingPanel context={context} profile={DEFAULT_PRICING_PROFILE} onProfileChange={() => {}} />);
    expect(screen.getByText('Olive Oil')).toBeTruthy();
    expect(screen.getByTestId('price-incomplete')).toBeTruthy();
  });

  it('emits a profile update when an oil price is entered', () => {
    const onProfileChange = vi.fn();
    render(<PricingPanel context={context} profile={DEFAULT_PRICING_PROFILE} onProfileChange={onProfileChange} />);
    fireEvent.change(screen.getByLabelText('Price for Olive Oil'), { target: { value: '4.50' } });
    expect(onProfileChange).toHaveBeenCalledTimes(1);
    const next = onProfileChange.mock.calls[0][0];
    expect(next.oilPrices['olive-oil'].price).toBe('4.50');
  });

  it('shows outputs once oils are priced', () => {
    const profile = {
      ...DEFAULT_PRICING_PROFILE,
      oilPrices: { 'olive-oil': { price: '4.50', unit: 'kg' as const } },
    };
    render(<PricingPanel context={context} profile={profile} onProfileChange={() => {}} />);
    expect(screen.queryByTestId('price-incomplete')).toBeNull();
    expect(screen.getByTestId('cost-per-unit').textContent).toMatch(/\$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @soap-calc/web -- PricingPanel`
Expected: FAIL — cannot resolve `./PricingPanel`.

- [ ] **Step 3: Implement `PricingPanel.tsx`**

```tsx
// packages/web/src/components/PricingPanel.tsx
import { computeRecipePricing, hasMissingMaterialPrice, additivePriceKey } from '../lib/recipePricing';
import type { RecipePricingContext } from '../lib/recipePricing';
import type { PricedEntry, PricingProfile } from '../lib/pricingProfile';
import { formatMoney, type PriceUnit } from '../lib/money';
import { formatWeight } from '../lib/weightUnits';

interface PricingPanelProps {
  context: RecipePricingContext;
  profile: PricingProfile;
  onProfileChange: (next: PricingProfile) => void;
}

const UNIT_OPTIONS: PriceUnit[] = ['kg', 'lb'];

export function PricingPanel({ context, profile, onProfileChange }: PricingPanelProps) {
  const result = computeRecipePricing(context, profile);
  const incomplete = hasMissingMaterialPrice(context, profile);
  const symbol = profile.currencySymbol;
  const money = (v: number | null) => (v == null ? '—' : formatMoney(v, symbol));
  const pct = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`);

  const setEntry = (
    book: 'oilPrices' | 'additivePrices',
    key: string,
    patch: Partial<PricedEntry>,
  ) => {
    const prev = profile[book][key] ?? { price: '', unit: profile.outputUnit };
    onProfileChange({ ...profile, [book]: { ...profile[book], [key]: { ...prev, ...patch } } });
  };

  const priceRow = (
    label: string,
    grams: number,
    entry: PricedEntry | undefined,
    onPatch: (patch: Partial<PricedEntry>) => void,
  ) => (
    <div className="pricing-row">
      <span className="pricing-row__name">{label}</span>
      <span className="pricing-row__grams">{formatWeight(grams, 'g')}</span>
      <input
        className="pricing-row__price"
        aria-label={`Price for ${label}`}
        inputMode="decimal"
        value={entry?.price ?? ''}
        onChange={(e) => onPatch({ price: e.target.value })}
      />
      <select
        aria-label={`Unit for ${label}`}
        value={entry?.unit ?? profile.outputUnit}
        onChange={(e) => onPatch({ unit: e.target.value as PriceUnit })}
      >
        {UNIT_OPTIONS.map((u) => (
          <option key={u} value={u}>{u}</option>
        ))}
      </select>
    </div>
  );

  const setField = (patch: Partial<PricingProfile>) => onProfileChange({ ...profile, ...patch });

  return (
    <section className="panel">
      <h2>Pricing &amp; profit</h2>

      <details open>
        <summary>Materials</summary>
        {context.oilLines.map((o) =>
          <div key={o.oilId}>
            {priceRow(o.name, o.grams, profile.oilPrices[o.oilId], (patch) => setEntry('oilPrices', o.oilId, patch))}
          </div>,
        )}
        {context.additives.map((a) => {
          const key = additivePriceKey(a);
          return (
            <div key={a.key}>
              {priceRow(a.name, a.grams, profile.additivePrices[key], (patch) => setEntry('additivePrices', key, patch))}
            </div>
          );
        })}
        {priceRow('Lye', context.lyeGrams, profile.lyePrice, (patch) =>
          setField({ lyePrice: { ...profile.lyePrice, ...patch } }),
        )}
        <label className="field">
          Packaging cost (per {profile.outputUnit})
          <input
            aria-label="Packaging cost"
            inputMode="decimal"
            value={profile.packagingPerUnit}
            onChange={(e) => setField({ packagingPerUnit: e.target.value })}
          />
        </label>
        {incomplete && (
          <p className="pricing-hint" data-testid="price-incomplete">
            Enter a price for every oil and additive for an accurate cost.
          </p>
        )}
      </details>

      <details>
        <summary>Labour &amp; overhead</summary>
        <label className="field">
          Labour (minutes per batch)
          <input aria-label="Labour minutes" inputMode="decimal" value={profile.laborMinutes}
            onChange={(e) => setField({ laborMinutes: e.target.value })} />
        </label>
        <label className="field">
          Rate per hour
          <input aria-label="Labour rate per hour" inputMode="decimal" value={profile.laborRatePerHour}
            onChange={(e) => setField({ laborRatePerHour: e.target.value })} />
        </label>
        <label className="field">
          Labour burden %
          <input aria-label="Labour burden percent" inputMode="decimal" value={profile.laborBurdenPercent}
            onChange={(e) => setField({ laborBurdenPercent: e.target.value })} />
        </label>
        <label className="field">
          Overhead
          <select aria-label="Overhead mode" value={profile.overheadMode}
            onChange={(e) => setField({ overheadMode: e.target.value === 'flat' ? 'flat' : 'percent' })}>
            <option value="percent">% of cost</option>
            <option value="flat">flat per batch</option>
          </select>
        </label>
        {profile.overheadMode === 'percent' ? (
          <input aria-label="Overhead percent" inputMode="decimal" value={profile.overheadPercent}
            onChange={(e) => setField({ overheadPercent: e.target.value })} />
        ) : (
          <input aria-label="Overhead flat" inputMode="decimal" value={profile.overheadFlat}
            onChange={(e) => setField({ overheadFlat: e.target.value })} />
        )}
      </details>

      <div className="pricing-outputs">
        <label className="field">
          Currency symbol
          <input aria-label="Currency symbol" value={profile.currencySymbol}
            onChange={(e) => setField({ currencySymbol: e.target.value })} />
        </label>
        <label className="field">
          Price per
          <select aria-label="Output unit" value={profile.outputUnit}
            onChange={(e) => setField({ outputUnit: e.target.value as PriceUnit })}>
            {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label className="field">
          Price from
          <select aria-label="Pricing lever" value={profile.priceLever}
            onChange={(e) => setField({ priceLever: e.target.value === 'markup' ? 'markup' : 'margin' })}>
            <option value="margin">target margin %</option>
            <option value="markup">markup %</option>
          </select>
        </label>
        {profile.priceLever === 'margin' ? (
          <input aria-label="Target margin percent" inputMode="decimal" value={profile.targetMarginPercent}
            onChange={(e) => setField({ targetMarginPercent: e.target.value })} />
        ) : (
          <input aria-label="Markup percent" inputMode="decimal" value={profile.markupPercent}
            onChange={(e) => setField({ markupPercent: e.target.value })} />
        )}

        <dl className="pricing-results">
          <dt>Cost per {profile.outputUnit}</dt><dd data-testid="cost-per-unit">{money(result.costPerUnit)}</dd>
          <dt>Cost per batch</dt><dd>{money(result.cogsBatch)}</dd>
          <dt>Suggested price per {profile.outputUnit}</dt><dd>{money(result.suggestedPricePerUnit)}</dd>
          <dt>Profit per {profile.outputUnit}</dt><dd>{money(result.profitPerUnit)}</dd>
          <dt>Margin</dt><dd>{pct(result.marginPercent)}</dd>
          <dt>Markup</dt><dd>{pct(result.markupPercent)}</dd>
        </dl>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @soap-calc/web -- PricingPanel`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/PricingPanel.tsx packages/web/src/components/PricingPanel.test.tsx
git commit -m "feat(web): PricingPanel component (materials, labour, price & profit)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Web — wire pricing into the app (state, persistence, render)

**Files:**
- Modify: `packages/web/src/App.tsx`
- Test: `packages/web/src/App.pricing.test.tsx`

**Interfaces:**
- Consumes: `PricingPanel` (Task 7); `loadPricingProfile`, `savePricingProfile` (Task 4); `RecipePricingContext` (Task 5); `oilDisplayName` from `./lib/oilDisplay` (canonical id→name resolver — do **not** read `.displayName` off the record directly); `vm.previewState.lines`, `vm.computedAdditives`, `vm.result`, `vm.batchWeightWithExtras` (existing).

**Implementation notes:**
- Mirror the existing `moldSizerInput` pattern (`App.tsx:44-47` local `useState` + a persistence effect). Add:
  ```tsx
  const [pricingProfile, setPricingProfile] = useState<PricingProfile>(() => loadPricingProfile());
  useEffect(() => { savePricingProfile(pricingProfile); }, [pricingProfile]);
  ```
  (Import `useEffect`/`useState` are already used in `App.tsx`; add `PricingProfile` + the storage fns + `PricingPanel` + `oilDisplayName` + `RecipePricingContext` imports.)
- Build the pricing context from the view model (`oilDisplayName` is the canonical id→name
  resolver — `oilById(...).name` does **not** exist; the field is `displayName`):
  ```tsx
  const pricingContext: RecipePricingContext = {
    oilLines: vm.previewState.lines.map((l) => ({
      oilId: l.oilId,
      grams: Number(l.weightGrams) || 0,
      name: oilDisplayName(l.oilId),
    })),
    additives: vm.computedAdditives.map((a) => ({
      key: a.key, catalogId: a.catalogId, name: a.name, grams: a.grams,
    })),
    lyeGrams: vm.result?.lyeWeightGrams ?? 0,
    totalBatchGrams: vm.batchWeightWithExtras,
  };
  ```
- Render `<PricingPanel context={pricingContext} profile={pricingProfile} onProfileChange={setPricingProfile} />` in the `<aside className="sidebar">` immediately after `<ResultsPanel ... />` (i.e. after `App.tsx:217`).

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// packages/web/src/App.pricing.test.tsx
// NOTE: the jsdom pragma above MUST be line 1 — web vitest defaults to environment:'node'.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import App from './App';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('App pricing integration', () => {
  it('renders the pricing panel with the recipe default oils', () => {
    render(<App />);
    // The default recipe has oils; the pricing panel heading and at least one oil row appear.
    expect(screen.getByRole('heading', { name: /pricing/i })).toBeTruthy();
    // Every default oil exposes a price input labelled "Price for <name>".
    expect(screen.getAllByLabelText(/^Price for /).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @soap-calc/web -- App.pricing`
Expected: FAIL — no pricing heading (panel not wired).

- [ ] **Step 3: Implement the wiring**

Apply the imports, state, effect, `pricingContext`, and `<PricingPanel .../>` render described in the Implementation notes above.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @soap-calc/web -- App.pricing`
Expected: PASS (1 test).

- [ ] **Step 5: Full gate**

Run: `npm run typecheck && npm test`
Expected: PASS (typecheck → validate:oils → all unit tests across workspaces).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/App.pricing.test.tsx
git commit -m "feat(web): wire pricing panel + remembered profile into the app

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Manual verification in the running app

**Files:** none (verification only).

- [ ] **Step 1: Start the app**

Run: `npm run dev --workspace @soap-calc/web`
Open the printed local URL.

- [ ] **Step 2: Verify batch-weight readout**

In Results, confirm a "Total batch:" line shows oils/lye/water(/extras) summing to the total. Add a trace additive and confirm `extras` appears and the total grows.

- [ ] **Step 3: Verify pricing**

Open the Pricing & profit panel. Enter an oil price (e.g. `4.50`, `kg`); confirm the incomplete hint clears once all oils are priced, and cost/price per kg, profit, and margin populate. Toggle output unit kg↔lb and confirm the per-unit figures rescale. Switch the lever to markup and confirm the suggested price changes. Reload the page and confirm entered prices persist.

- [ ] **Step 4: Verify anonymity**

Run: `git grep -niE "modern *soap|creative *hive|kenna|island tropics|matahari|caribbean skies" -- packages/ docs/superpowers/plans/2026-07-20-pricing-profit-calculator.md`
Expected: no matches (no brand/author fingerprints shipped).

- [ ] **Step 5: Finalize**

Use `superpowers:finishing-a-development-branch` to decide merge/PR. Before merging, rebase `feat/pricing-profit-calculator` onto `main` (the branch was cut from `feat/iodine-consistency-gate` due to blocking untracked files at spec time).

---

## Notes for the implementer

- **Test environment (web package):** `packages/web/vitest.config.ts` sets `environment: 'node'`. Therefore:
  - **Component tests** (render/DOM) MUST start with `// @vitest-environment jsdom` as **line 1** and use `afterEach(cleanup)` (import `cleanup` from `@testing-library/react`). jsdom also provides a real `localStorage`.
  - **Pure-lib tests that touch `localStorage`** (e.g. `pricingStorage.test.ts`) stay under `node` and stub it with `vi.stubGlobal('localStorage', createStorage())` in `beforeEach` — mirror `moldSizerStorage.test.ts`. Do NOT rely on a global `localStorage` under node.
  - **Pure-math tests** (core, `money.test.ts`, `recipePricing.test.ts`) need neither — no DOM, no storage.
- **Styling:** class names (`pricing-row`, `pricing-hint`, `pricing-results`, `results-batch-weight`, etc.) are referenced but no CSS is required for tests to pass. Add styles in `packages/web/src/index.css` following the existing `.panel` / `.field` conventions; unstyled markup is functionally correct.
- **Anonymity:** every string the user sees is original, behaviour-based copy. Do not add tooltips or help text that reference any book, author, brand, or third-party formula.
- **Do not** add prices to `RecipeLine`/`RecipeSettings` or to recipe export — pricing lives only in `soap-calc:pricing`.
