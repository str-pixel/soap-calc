# Fragrance & Colorants Section Implementation Plan

> **Superseded in part (2026-09-10/11):** the typed allergen rows and the typed supplier ceiling
> (`supplierMaxPercent`, `fragranceOverSupplierMax`, two insight codes) this plan builds were later
> removed; each listed oil's ceiling is now resolved from the catalog (`essentialOilCeiling`). Kept as
> the record of the 2026-09-08 build.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A first-class *Fragrance & colorants* section (CP/HP/LS) with its own state, core math, EU/IFRA guardrails, and outputs in the Full recipe, steps, batch sheet and pricing — with fragrance migrated out of the additive catalog.

**Architecture:** Pure math lives in `@soap-calc/core` (`fragrance.ts`, `colorants.ts`). The web package holds the `scentColor` state beside `additives` (types + normalization + legacy migration in `lib/scentColor.ts`), computes it once in the view model (`lib/computeScentColor.ts`), and threads the result into extras/batch weight, the manifest and steps (`lib/recipeSummary.ts`), the batch sheet, pricing and insights. A new panel (`FragranceColorantsPanel.tsx`) edits the state; everything derived per process (stage, basis, dispersal) is computed, never stored.

**Tech Stack:** TypeScript, React 18, Vite, Vitest (+ @testing-library/react, jsdom), Playwright. npm workspaces; run everything from `/Users/str/soap-calc`.

**Spec:** `docs/superpowers/specs/2026-09-08-fragrance-colorants-design.md`

## Global Constraints

- Every user-facing number and stage cites its source line in a code comment: `CP:<line>` / `HP:<line>` / `LS:<line>`; web-sourced figures carry URL + `retrieved 2026-09-08`. **Supplier names never appear in user-facing copy.**
- UI copy is original and short; cite behaviour, not sources (AGENTS.md).
- Colorant dose starts **empty** in every process; never seed a number. LS has no guidance range.
- IFRA/supplier max is compared **against the finished product** (label weight for bars, bottled solution for LS), never against oils.
- Allergens are flagged when their share **exceeds** 0.01% of the finished product (strictly greater).
- Fragrance migration runs on the **raw** saved/file additives, before `normalizeAdditiveLine`.
- `@soap-calc/core` stays pure (no React, no web imports). Core exports go through `packages/core/src/index.ts`.
- Run tests from the repo root: `npx vitest run <path>`; e2e from `packages/web`: `npx playwright test`. Before finishing: `npm test`, `npm run -ws typecheck --if-present`, full e2e.
- Do not commit unless the user asked; the steps below say "Commit" — perform them only with the user's standing permission (they asked for the implementation; ask once before the first commit).

---

### Task 1: Core fragrance math

**Files:**
- Create: `packages/core/src/fragrance.ts`
- Create: `packages/core/src/fragrance.test.ts`
- Modify: `packages/core/src/index.ts` (add `export * from './fragrance.js';` after the `additives.js` line)

**Interfaces:**
- Produces:
  ```ts
  export type FragranceKind = 'fragrance-oil' | 'essential-oil';
  export type VanillinBrowning = 'none' | 'light' | 'deep';
  export type AllergenInput = { name: string; percentOfFragrance: number; fragranceGrams: number };
  export type LabelAllergen = { name: string; percentOfProduct: number };
  export const ALLERGEN_LABEL_THRESHOLD_RINSE_OFF_PERCENT: number; // 0.01
  export function fragranceGrams(percent: number | null, basisGrams: number): number;
  export function fragranceShareOfProduct(fragranceGrams: number, productGrams: number): number; // % of product
  export function fragranceOverSupplierMax(shareOfProduct: number, supplierMaxPercent: number | null): boolean;
  export function essentialOilCaution(kind: FragranceKind, name: string): boolean;
  export function vanillinBrowning(vanillinPercent: number | null): VanillinBrowning;
  export function vanillaStabilizerGrams(fragranceGrams: number, vanillinPercent: number | null): number;
  export function allergensToLabel(allergens: AllergenInput[], productGrams: number): LabelAllergen[];
  export function polysorbate20Grams(fragranceGrams: number, deliveredSuperfatPercent: number | null): number;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/src/fragrance.test.ts
import { describe, expect, it } from 'vitest';
import {
  ALLERGEN_LABEL_THRESHOLD_RINSE_OFF_PERCENT,
  allergensToLabel,
  essentialOilCaution,
  fragranceGrams,
  fragranceOverSupplierMax,
  fragranceShareOfProduct,
  polysorbate20Grams,
  vanillaStabilizerGrams,
  vanillinBrowning,
} from './fragrance';

describe('fragranceGrams — total oil weight × % (CP:9612-9614), or the finished solution for LS', () => {
  it('1000 g × 3% = 30 g', () => expect(fragranceGrams(3, 1000)).toBe(30));
  it('is 0 for a blank, negative or non-finite percent and for a zero basis', () => {
    expect(fragranceGrams(null, 1000)).toBe(0);
    expect(fragranceGrams(-1, 1000)).toBe(0);
    expect(fragranceGrams(NaN, 1000)).toBe(0);
    expect(fragranceGrams(3, 0)).toBe(0);
  });
});

describe('fragranceShareOfProduct — the IFRA basis is the FINISHED product, not the oils', () => {
  it('5% of 1000 g oils is 3.85% of a 1299.5 g finished bar (1470 g batch, 15% cure loss, fragrance kept)', () => {
    const base = 1000 + 140 + 330;
    const product = base * (1 - 0.15) + 50;
    expect(fragranceShareOfProduct(50, product)).toBeCloseTo(3.85, 2);
  });
  it('is 0 when the product weight is unknown or zero', () => {
    expect(fragranceShareOfProduct(50, 0)).toBe(0);
  });
});

describe('fragranceOverSupplierMax', () => {
  it('flags only above the supplier rate, and never when the rate is unknown', () => {
    expect(fragranceOverSupplierMax(5.1, 5)).toBe(true);
    expect(fragranceOverSupplierMax(5, 5)).toBe(false);
    expect(fragranceOverSupplierMax(9, null)).toBe(false);
  });
});

describe('essentialOilCaution — clove and cinnamon EOs accelerate and irritate (CP:9531-9537, 9589-9592)', () => {
  it('fires for an essential oil named clove or cinnamon, case-insensitively', () => {
    expect(essentialOilCaution('essential-oil', 'Clove bud')).toBe(true);
    expect(essentialOilCaution('essential-oil', 'CINNAMON leaf')).toBe(true);
    expect(essentialOilCaution('essential-oil', 'Lavender')).toBe(false);
  });
  it('never fires for a fragrance oil, whatever its name', () => {
    expect(essentialOilCaution('fragrance-oil', 'Cinnamon bun')).toBe(false);
  });
});

describe('vanillin — browning (CP:9740) and the stabilizer ratio (CP:9789-9792)', () => {
  it('browning: none without vanillin, light at ≤1%, deep above', () => {
    expect(vanillinBrowning(null)).toBe('none');
    expect(vanillinBrowning(0)).toBe('none');
    expect(vanillinBrowning(1)).toBe('light');
    expect(vanillinBrowning(1.1)).toBe('deep');
  });
  it('stabilizer: 1:2 up to and including 10% vanillin, 1:1 above', () => {
    expect(vanillaStabilizerGrams(30, 5)).toBe(15);
    expect(vanillaStabilizerGrams(30, 10)).toBe(15);
    expect(vanillaStabilizerGrams(30, 12)).toBe(30);
    expect(vanillaStabilizerGrams(30, 0)).toBe(0);
    expect(vanillaStabilizerGrams(30, null)).toBe(0);
  });
});

describe('allergensToLabel — Annex III names an allergen above 0.01% of a rinse-off product', () => {
  // 30 g fragrance in a 1279.5 g bar = 2.34% share.
  const product = 1279.5;
  it('flags 12% and 0.5% of the fragrance, not 0.4%', () => {
    const rows = [
      { name: 'Linalool', percentOfFragrance: 12, fragranceGrams: 30 },
      { name: 'Limonene', percentOfFragrance: 0.5, fragranceGrams: 30 },
      { name: 'Coumarin', percentOfFragrance: 0.4, fragranceGrams: 30 },
    ];
    const out = allergensToLabel(rows, product);
    expect(out.map((a) => a.name)).toEqual(['Linalool', 'Limonene']);
    expect(out[1].percentOfProduct).toBeCloseTo(0.0117, 4);
  });
  it('is strict: exactly 0.01% is not "exceeds"', () => {
    const exact = (ALLERGEN_LABEL_THRESHOLD_RINSE_OFF_PERCENT / 100) * product; // grams of allergen at the threshold
    const pct = (exact / 30) * 100; // as % of a 30 g fragrance
    expect(allergensToLabel([{ name: 'Geraniol', percentOfFragrance: pct, fragranceGrams: 30 }], product)).toEqual([]);
  });
  it('sums the same allergen across two rows, matching the name trimmed and case-insensitively', () => {
    const rows = [
      { name: 'Limonene', percentOfFragrance: 0.3, fragranceGrams: 30 },
      { name: ' limonene ', percentOfFragrance: 0.3, fragranceGrams: 30 },
    ];
    const out = allergensToLabel(rows, product);
    expect(out).toHaveLength(1);
    expect(out[0].percentOfProduct).toBeCloseTo(0.0141, 4);
  });
  it('returns nothing when the product weight is unknown', () => {
    expect(allergensToLabel([{ name: 'Linalool', percentOfFragrance: 12, fragranceGrams: 30 }], 0)).toEqual([]);
  });
});

describe('polysorbate20Grams — equal parts to the fragrance when LS carries a superfat (LS:16987-16989)', () => {
  it('matches the fragrance grams above 0% superfat, and is 0 otherwise', () => {
    expect(polysorbate20Grams(30, 2)).toBe(30);
    expect(polysorbate20Grams(30, 0)).toBe(0);
    expect(polysorbate20Grams(30, null)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/core/src/fragrance.test.ts`
Expected: FAIL — "Failed to resolve import './fragrance'".

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/fragrance.ts
/**
 * Fragrance math. Dose on total oil weight (CP:9612-9614) — never a flat percent of soap
 * weight or teaspoons (CP:9577-9605) — or on the finished solution for liquid soap.
 * Compliance figures compare against the FINISHED PRODUCT: IFRA Standards express limits
 * "as a Maximum Acceptable Concentration of fragrance ingredients in the finished consumer
 * product, not in the fragrance mixture" (IFRA 51st Amendment, Guidance for the use of the
 * IFRA Standards, p.11, https://ifrafragrance.org/ — retrieved 2026-09-08); bar soap, liquid
 * soap, body washes and shampoo are all Category 9 in its product mapping.
 */

export type FragranceKind = 'fragrance-oil' | 'essential-oil';
export type VanillinBrowning = 'none' | 'light' | 'deep';
export type AllergenInput = { name: string; percentOfFragrance: number; fragranceGrams: number };
export type LabelAllergen = { name: string; percentOfProduct: number };

/** Annex III of (EC) 1223/2009: the listed allergens are named on the label when their
 * concentration EXCEEDS 0.01% in a rinse-off product (0.001% leave-on). Regulation (EU)
 * 2023/1545 widens the list for products placed on the market from 31 July 2026
 * (secondary sources, retrieved 2026-09-08: coslaw.eu, sgs.com — EUR-Lex blocks fetching). */
export const ALLERGEN_LABEL_THRESHOLD_RINSE_OFF_PERCENT = 0.01;

const finite = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

export function fragranceGrams(percent: number | null, basisGrams: number): number {
  if (!finite(percent) || percent <= 0 || !finite(basisGrams) || basisGrams <= 0) return 0;
  return (basisGrams * percent) / 100;
}

export function fragranceShareOfProduct(fragranceGrams: number, productGrams: number): number {
  if (!finite(fragranceGrams) || fragranceGrams <= 0 || !finite(productGrams) || productGrams <= 0) return 0;
  return (100 * fragranceGrams) / productGrams;
}

export function fragranceOverSupplierMax(shareOfProduct: number, supplierMaxPercent: number | null): boolean {
  if (!finite(supplierMaxPercent) || supplierMaxPercent <= 0) return false;
  return shareOfProduct > supplierMaxPercent;
}

/** Only the two the text names: clove and cinnamon essential oils carry eugenol /
 * cinnamaldehyde, react with the lye as accelerants (CP:9531-9537) and irritate — the text
 * advises against cinnamon EO in soap outright (CP:9589-9592). A fragrance OIL named after
 * them is a synthetic blend and never triggers this. */
export function essentialOilCaution(kind: FragranceKind, name: string): boolean {
  if (kind !== 'essential-oil') return false;
  return /clove|cinnamon/i.test(name);
}

/** "A higher vanillin content will cause a deeper browning … while a 1% vanillin
 * concentration will create a lighter shade" (CP:9740). */
export function vanillinBrowning(vanillinPercent: number | null): VanillinBrowning {
  if (!finite(vanillinPercent) || vanillinPercent <= 0) return 'none';
  return vanillinPercent <= 1 ? 'light' : 'deep';
}

/** Vanilla stabilizer, mixed into the fragrance first (CP:9788-9789): 1 part to 2 parts
 * fragrance for less than 10% vanillin, 1 to 1 for more than 10% (CP:9789-9792). */
export function vanillaStabilizerGrams(fragranceGrams: number, vanillinPercent: number | null): number {
  if (!finite(vanillinPercent) || vanillinPercent <= 0 || !finite(fragranceGrams) || fragranceGrams <= 0) return 0;
  return vanillinPercent > 10 ? fragranceGrams : fragranceGrams / 2;
}

export function allergensToLabel(allergens: AllergenInput[], productGrams: number): LabelAllergen[] {
  if (!finite(productGrams) || productGrams <= 0) return [];
  const grams = new Map<string, { name: string; grams: number }>();
  for (const a of allergens) {
    if (!finite(a.percentOfFragrance) || a.percentOfFragrance <= 0 || !finite(a.fragranceGrams) || a.fragranceGrams <= 0) continue;
    const id = a.name.trim().toLowerCase();
    if (!id) continue;
    const g = (a.fragranceGrams * a.percentOfFragrance) / 100;
    const cur = grams.get(id);
    if (cur) cur.grams += g;
    else grams.set(id, { name: a.name.trim(), grams: g });
  }
  const out: LabelAllergen[] = [];
  for (const { name, grams: g } of grams.values()) {
    const percentOfProduct = (100 * g) / productGrams;
    if (percentOfProduct > ALLERGEN_LABEL_THRESHOLD_RINSE_OFF_PERCENT) out.push({ name, percentOfProduct });
  }
  return out;
}

/** "If using a superfat in the recipe, there is an increased risk of separation … mix equal
 * parts polysorbate 20 to your FO/EO" (LS:16987-16989). */
export function polysorbate20Grams(fragranceGrams: number, deliveredSuperfatPercent: number | null): number {
  if (!finite(deliveredSuperfatPercent) || deliveredSuperfatPercent <= 0) return 0;
  if (!finite(fragranceGrams) || fragranceGrams <= 0) return 0;
  return fragranceGrams;
}
```

Then add to `packages/core/src/index.ts`, directly after `export * from './additives.js';`:

```ts
export * from './fragrance.js';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/core/src/fragrance.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Typecheck core and commit**

Run: `cd packages/core && npx tsc --noEmit && cd ../..`
Expected: no output.

```bash
git add packages/core/src/fragrance.ts packages/core/src/fragrance.test.ts packages/core/src/index.ts
git commit -m "feat(core): fragrance math — oil/solution dosing, finished-product share, vanillin, allergens"
```

---

### Task 2: Core colorant math

**Files:**
- Create: `packages/core/src/colorants.ts`
- Create: `packages/core/src/colorants.test.ts`
- Modify: `packages/core/src/index.ts` (add `export * from './colorants.js';` after the fragrance line)

**Interfaces:**
- Consumes: `AdditiveStage`, `AdditiveProcess` from `./additives.js`.
- Produces:
  ```ts
  export type ColorantKind = 'mica' | 'oxide' | 'natural' | 'dye' | 'other';
  export type ColorantDispersal =
    | { method: 'carrier-oil'; carrierGrams: number | null }        // CP: 1:1 by weight
    | { method: 'hot-sugar-water'; waterGramsLow: number; waterGramsHigh: number } // HP
    | { method: 'warm-water' };                                      // LS
  export type ColorantGuidance = { tspPerLbLow: number; tspPerLbHigh: number; percentLow: number; percentHigh: number };
  export const HP_COLORANT_WATER_GRAMS: { low: number; high: number }; // 7.1, 14.2
  export const COLORANT_GUIDANCE: Record<ColorantKind, ColorantGuidance | null>;
  export function portionOilGrams(totalOilGrams: number, portionPercent: number | null): number;
  export function colorantGrams(percent: number | null, portionOilGrams: number): number | null;
  export function colorantDispersal(process: AdditiveProcess, colorantGrams: number | null): ColorantDispersal;
  export function colorantStage(process: AdditiveProcess, hasPortion: boolean): AdditiveStage;
  export function portionsTotalPercent(portions: Array<{ percent: number | null }>): { total: number; over100: boolean };
  export function carrierOilSuperfatShift(carrierGrams: number, totalOilGrams: number): number;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/src/colorants.test.ts
import { describe, expect, it } from 'vitest';
import {
  COLORANT_GUIDANCE,
  HP_COLORANT_WATER_GRAMS,
  carrierOilSuperfatShift,
  colorantDispersal,
  colorantGrams,
  colorantStage,
  portionOilGrams,
  portionsTotalPercent,
} from './colorants';

describe('colorant dosing is against the PORTION\'s oils (a single-colour rule applied per colour)', () => {
  it('a 40% portion at 1% of 1000 g oils takes 4 g, not 10 g', () => {
    expect(portionOilGrams(1000, 40)).toBe(400);
    expect(colorantGrams(1, portionOilGrams(1000, 40))).toBe(4);
  });
  it('the whole batter is the whole oil weight', () => {
    expect(portionOilGrams(1000, null)).toBe(1000);
    expect(colorantGrams(1, 1000)).toBe(10);
  });
  it('an empty or invalid percent is "to shade": no grams', () => {
    expect(colorantGrams(null, 1000)).toBeNull();
    expect(colorantGrams(0, 1000)).toBeNull();
    expect(colorantGrams(NaN, 1000)).toBeNull();
  });
});

describe('dispersal per process', () => {
  it('CP: 1:1 with a light carrier oil, by weight (CP:9395-9400)', () => {
    expect(colorantDispersal('cp', 4)).toEqual({ method: 'carrier-oil', carrierGrams: 4 });
    expect(colorantDispersal('cp', null)).toEqual({ method: 'carrier-oil', carrierGrams: null });
  });
  it('HP: 0.25–0.50 oz hot water per colorant plus a little sugar (HP:11319-11321) = 7.1–14.2 g', () => {
    expect(HP_COLORANT_WATER_GRAMS.low).toBeCloseTo(7.1, 1);
    expect(HP_COLORANT_WATER_GRAMS.high).toBeCloseTo(14.2, 1);
    expect(colorantDispersal('hp', 4)).toEqual({ method: 'hot-sugar-water', waterGramsLow: HP_COLORANT_WATER_GRAMS.low, waterGramsHigh: HP_COLORANT_WATER_GRAMS.high });
  });
  it('LS: dyes dissolve in a little warm water (LS:13256)', () => {
    expect(colorantDispersal('ls', 4)).toEqual({ method: 'warm-water' });
  });
});

describe('the carrier oil is extra unsaponified oil — a superfat shift', () => {
  it('10 g carrier on 1000 g oils is +1.00 point', () => {
    expect(carrierOilSuperfatShift(10, 1000)).toBeCloseTo(1, 6);
    expect(carrierOilSuperfatShift(0, 1000)).toBe(0);
    expect(carrierOilSuperfatShift(10, 0)).toBe(0);
  });
});

describe('stage: whole-batter colour into the oils; a portion at the design stage; LS after dilution', () => {
  it.each([
    ['cp', false, 'oils'], ['cp', true, 'trace'],           // CP:9401-9404
    ['hp', false, 'oils'], ['hp', true, 'after_cook'],      // HP:11330-11334
    ['ls', false, 'after_cook'], ['ls', true, 'after_cook'], // LS:13262
  ] as const)('%s hasPortion=%s → %s', (process, hasPortion, stage) => {
    expect(colorantStage(process, hasPortion)).toBe(stage);
  });
});

describe('portionsTotalPercent', () => {
  it('sums, and flags past 100', () => {
    expect(portionsTotalPercent([{ percent: 40 }, { percent: 60 }])).toEqual({ total: 100, over100: false });
    expect(portionsTotalPercent([{ percent: 70 }, { percent: 40 }])).toEqual({ total: 110, over100: true });
    expect(portionsTotalPercent([{ percent: null }])).toEqual({ total: 0, over100: false });
  });
});

describe('guidance ranges are derived, and say so', () => {
  it('micas/oxides carry the tsp-per-lb range and its weight derivation; dyes and "other" carry none', () => {
    expect(COLORANT_GUIDANCE.mica).toEqual({ tspPerLbLow: 0.5, tspPerLbHigh: 1, percentLow: 0.2, percentHigh: 0.9 });
    expect(COLORANT_GUIDANCE.oxide).toEqual({ tspPerLbLow: 0.25, tspPerLbHigh: 0.5, percentLow: 0.1, percentHigh: 0.45 });
    expect(COLORANT_GUIDANCE.natural).toEqual({ tspPerLbLow: 0.5, tspPerLbHigh: 1, percentLow: 0.2, percentHigh: 0.9 });
    expect(COLORANT_GUIDANCE.dye).toBeNull();
    expect(COLORANT_GUIDANCE.other).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/core/src/colorants.test.ts`
Expected: FAIL — "Failed to resolve import './colorants'".

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/colorants.ts
import type { AdditiveProcess, AdditiveStage } from './additives.js';

/**
 * Colorant math. There is no sourced dose for a colorant — the cold-process text says so
 * ("There isn't a 'set' amount", CP:9384) and then gives a rule of thumb whose own worked
 * example disagrees with it (0.1% stated; 4 g per 450 g ≈ 0.89% shown; CP:9389-9391). The
 * trade doses by volume (½–2 tsp per lb of oils). Every percent here is DERIVED and the
 * guidance copy says so; the dose field starts empty everywhere.
 */

export type ColorantKind = 'mica' | 'oxide' | 'natural' | 'dye' | 'other';

export type ColorantDispersal =
  | { method: 'carrier-oil'; carrierGrams: number | null }
  | { method: 'hot-sugar-water'; waterGramsLow: number; waterGramsHigh: number }
  | { method: 'warm-water' };

export type ColorantGuidance = {
  tspPerLbLow: number;
  tspPerLbHigh: number;
  percentLow: number;
  percentHigh: number;
};

const OZ_TO_G = 28.3495;

/** "add 0.25-0.50 ounces water per colorant" with a little sugar (HP:11319-11321). */
export const HP_COLORANT_WATER_GRAMS = { low: 0.25 * OZ_TO_G, high: 0.5 * OZ_TO_G };

/**
 * Derived ranges. Volume figures: micas ½–2 tsp per lb of oils, 1 typical; oxides and
 * ultramarines 1 tsp/lb, HALF OR LESS for brown and red; natural powders ½–1 tsp/lb
 * (supplier usage pages, retrieved 2026-09-08 — URLs in the project memory file, never in
 * copy). Weight derivation: a supplier FAQ puts its micas at 12–18 tsp/oz = 1.6–2.4 g/tsp,
 * so ½ tsp/lb = 0.18–0.26% and 1 tsp/lb = 0.35–0.53% of oils; the CP text's own example
 * (4 g per 450 g, CP:9389-9391) is 0.89%. The band below spans that whole spread. Dyes are
 * "to shade" (LS:13256-13262) and "other" is unknown by definition: no range.
 */
export const COLORANT_GUIDANCE: Record<ColorantKind, ColorantGuidance | null> = {
  mica: { tspPerLbLow: 0.5, tspPerLbHigh: 1, percentLow: 0.2, percentHigh: 0.9 },
  oxide: { tspPerLbLow: 0.25, tspPerLbHigh: 0.5, percentLow: 0.1, percentHigh: 0.45 },
  natural: { tspPerLbLow: 0.5, tspPerLbHigh: 1, percentLow: 0.2, percentHigh: 0.9 },
  dye: null,
  other: null,
};

const finite = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

export function portionOilGrams(totalOilGrams: number, portionPercent: number | null): number {
  if (!finite(totalOilGrams) || totalOilGrams <= 0) return 0;
  if (!finite(portionPercent) || portionPercent <= 0) return totalOilGrams;
  return (totalOilGrams * portionPercent) / 100;
}

/** The book's rate is for a single-colour soap; each colour is dosed against the oils it
 * actually colours, or a three-way swirl would carry three times the pigment —
 * "colour the soap, not the lather" (CP:9378-9379). Null = to shade. */
export function colorantGrams(percent: number | null, portionOilGrams: number): number | null {
  if (!finite(percent) || percent <= 0 || !finite(portionOilGrams) || portionOilGrams <= 0) return null;
  return (portionOilGrams * percent) / 100;
}

/** CP: "mixed at a 1:1 ratio with a light carrier oil" — glycerin or water discouraged
 * (CP:9395-9400). HP: hot water plus a little sugar per colorant (HP:11319-11321), or into
 * the PCSF oil (HP:11300-11302). LS: dyes dissolve in water (LS:13256); micas settle (LS:13390). */
export function colorantDispersal(process: AdditiveProcess, colorantGrams: number | null): ColorantDispersal {
  if (process === 'cp') return { method: 'carrier-oil', carrierGrams: colorantGrams };
  if (process === 'hp') {
    return { method: 'hot-sugar-water', waterGramsLow: HP_COLORANT_WATER_GRAMS.low, waterGramsHigh: HP_COLORANT_WATER_GRAMS.high };
  }
  return { method: 'warm-water' };
}

/** The carrier is unsaponified oil riding on the recipe oils: 1:1 at a 1% colorant is a
 * full superfat point. Same arithmetic as superfatShiftFromLiquidFat. */
export function carrierOilSuperfatShift(carrierGrams: number, totalOilGrams: number): number {
  if (!finite(carrierGrams) || carrierGrams <= 0 || !finite(totalOilGrams) || totalOilGrams <= 0) return 0;
  return (100 * carrierGrams) / totalOilGrams;
}

/** A whole-batter colour goes into the oils at the start (CP:9401-9404; HP:11330-11334); a
 * portion colour at the design stage — CP trace, HP after the cook. LS dyes are "added
 * directly to your soap after the dilution" (LS:13262), portions or not. */
export function colorantStage(process: AdditiveProcess, hasPortion: boolean): AdditiveStage {
  if (process === 'ls') return 'after_cook';
  if (!hasPortion) return 'oils';
  return process === 'cp' ? 'trace' : 'after_cook';
}

export function portionsTotalPercent(portions: Array<{ percent: number | null }>): { total: number; over100: boolean } {
  const total = portions.reduce((sum, p) => sum + (finite(p.percent) && p.percent > 0 ? p.percent : 0), 0);
  return { total, over100: total > 100 };
}
```

Then add to `packages/core/src/index.ts`, after the fragrance export:

```ts
export * from './colorants.js';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/core/src/colorants.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `cd packages/core && npx tsc --noEmit && cd ../..`

```bash
git add packages/core/src/colorants.ts packages/core/src/colorants.test.ts packages/core/src/index.ts
git commit -m "feat(core): colorant math — portion dosing, dispersal per process, carrier superfat shift"
```

---

### Task 3: Web state model, normalization, and the legacy-fragrance migration

**Files:**
- Create: `packages/web/src/lib/scentColor.ts`
- Create: `packages/web/src/lib/scentColor.test.ts`

**Interfaces:**
- Consumes: `parsePercentOfOil` from `@soap-calc/core` (returns `number | null`), `newAdditiveKey` from `./recipe`, `AdditiveLine`.
- Produces:
  ```ts
  export type FragranceLine = { key: string; name: string; kind: FragranceKind; percent: string; supplierMaxPercent: string; vanillinPercent: string; allergens: AllergenLine[] };
  export type AllergenLine = { key: string; name: string; percentOfFragrance: string };
  export type ColorantLine = { key: string; name: string; kind: ColorantKind; percent: string; portionKey: string };
  export type Portion = { key: string; name: string; percent: string };
  export type ScentColor = { fragrances: FragranceLine[]; colorants: ColorantLine[]; portions: Portion[] };
  export type SavedScentColor = { fragrances: Array<Omit<FragranceLine,'key'|'allergens'> & { allergens: Array<Omit<AllergenLine,'key'>> }>; colorants: Array<Omit<ColorantLine,'key'>>; portions: Array<Omit<Portion,'key'>> };
  export function createEmptyScentColor(): ScentColor;
  export function newFragranceLine(): FragranceLine;
  export function newColorantLine(process: 'cp'|'hp'|'ls'): ColorantLine;   // LS seeds kind 'dye'; percent '' always
  export function newPortion(): Portion;
  export function normalizeScentColor(raw: unknown): ScentColor;             // tolerant: unknown → empty
  export function scentColorToSaved(scent: ScentColor): SavedScentColor;
  export function extractLegacyFragrance(rawAdditives: Array<Record<string, unknown>>): { additives: Array<Record<string, unknown>>; fragrances: FragranceLine[] };
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// packages/web/src/lib/scentColor.test.ts
import { describe, expect, it } from 'vitest';
import {
  createEmptyScentColor,
  extractLegacyFragrance,
  newColorantLine,
  newFragranceLine,
  normalizeScentColor,
  scentColorToSaved,
} from './scentColor';

describe('normalizeScentColor', () => {
  it('turns junk into an empty section', () => {
    expect(normalizeScentColor(undefined)).toEqual(createEmptyScentColor());
    expect(normalizeScentColor({ fragrances: 'nope' })).toEqual(createEmptyScentColor());
  });
  it('keeps valid rows, assigns keys, drops unknown fields, clamps portions to 0–100, and unlinks a deleted portion', () => {
    const s = normalizeScentColor({
      fragrances: [{ name: 'Lavender', kind: 'essential-oil', percent: '3', supplierMaxPercent: '5', vanillinPercent: '', allergens: [{ name: 'Linalool', percentOfFragrance: '12' }], junk: 1 }],
      colorants: [{ name: 'Ultramarine', kind: 'oxide', percent: '0.5', portionKey: 'gone' }],
      portions: [{ name: 'A', percent: '150' }],
    });
    expect(s.fragrances[0]).toMatchObject({ name: 'Lavender', kind: 'essential-oil', percent: '3', supplierMaxPercent: '5', vanillinPercent: '' });
    expect(s.fragrances[0].key).toBeTruthy();
    expect(s.fragrances[0].allergens[0]).toMatchObject({ name: 'Linalool', percentOfFragrance: '12' });
    expect((s.fragrances[0] as unknown as { junk?: unknown }).junk).toBeUndefined();
    expect(s.portions[0].percent).toBe('100');
    expect(s.colorants[0].portionKey).toBe(''); // 'gone' matched no portion
  });
  it('a colorant keeps its portion when the portion exists (matched by the saved portion index)', () => {
    const s = normalizeScentColor({
      fragrances: [],
      colorants: [{ name: 'Mica', kind: 'mica', percent: '', portionKey: 'p0' }],
      portions: [{ key: 'p0', name: 'A', percent: '40' }],
    });
    expect(s.colorants[0].portionKey).toBe(s.portions[0].key);
  });
  it('unknown kinds fall back: fragrance → fragrance-oil, colorant → other', () => {
    const s = normalizeScentColor({
      fragrances: [{ name: 'x', kind: 'perfume', percent: '' }],
      colorants: [{ name: 'y', kind: 'glitter', percent: '' }],
      portions: [],
    });
    expect(s.fragrances[0].kind).toBe('fragrance-oil');
    expect(s.colorants[0].kind).toBe('other');
  });
});

describe('row factories', () => {
  it('a new colorant seeds Dye in LS and an EMPTY percent everywhere', () => {
    expect(newColorantLine('ls').kind).toBe('dye');
    expect(newColorantLine('cp').kind).toBe('mica');
    expect(newColorantLine('cp').percent).toBe('');
    expect(newColorantLine('hp').percent).toBe('');
  });
  it('a new fragrance is a fragrance oil with everything blank', () => {
    expect(newFragranceLine()).toMatchObject({ kind: 'fragrance-oil', percent: '', supplierMaxPercent: '', vanillinPercent: '', allergens: [] });
  });
});

describe('scentColorToSaved round-trips through normalizeScentColor', () => {
  it('drops keys on save and restores them on load, keeping the portion link', () => {
    const s = normalizeScentColor({
      fragrances: [{ name: 'Rose', kind: 'fragrance-oil', percent: '4', supplierMaxPercent: '', vanillinPercent: '2', allergens: [] }],
      colorants: [{ name: 'Pink mica', kind: 'mica', percent: '', portionKey: 'p' }],
      portions: [{ key: 'p', name: 'Swirl', percent: '30' }],
    });
    const back = normalizeScentColor(scentColorToSaved(s));
    expect(back.fragrances[0].name).toBe('Rose');
    expect(back.colorants[0].portionKey).toBe(back.portions[0].key);
    expect(scentColorToSaved(s).portions[0]).toEqual({ name: 'Swirl', percent: '30' });
  });
});

describe('extractLegacyFragrance — the additive catalog no longer has fragrance', () => {
  it('moves a percent/oil fragrance line into a fragrance row and out of the additives', () => {
    const raw = [
      { catalogId: 'sugar-sorbitol', name: 'Sugar', amount: '2', basis: 'oil', unit: 'percent', addAt: 'lye' },
      { catalogId: 'fragrance', name: 'Fragrance / essential oil', amount: '3', basis: 'oil', unit: 'percent', addAt: 'trace' },
    ];
    const { additives, fragrances } = extractLegacyFragrance(raw);
    expect(additives.map((a) => a.catalogId)).toEqual(['sugar-sorbitol']);
    expect(fragrances).toHaveLength(1);
    expect(fragrances[0]).toMatchObject({ name: 'Fragrance / essential oil', kind: 'fragrance-oil', percent: '3' });
  });
  it('carries the percent for a solution basis (LS) too', () => {
    const { fragrances } = extractLegacyFragrance([{ catalogId: 'fragrance', name: 'F', amount: '1.5', basis: 'solution', unit: 'percent', addAt: 'after_cook' }]);
    expect(fragrances[0].percent).toBe('1.5');
  });
  it('keeps the name but not the number for a batch basis or a ppt unit', () => {
    const { fragrances } = extractLegacyFragrance([
      { catalogId: 'fragrance', name: 'A', amount: '3', basis: 'batch', unit: 'percent', addAt: 'trace' },
      { catalogId: 'fragrance', name: 'B', amount: '3', basis: 'oil', unit: 'ppt', addAt: 'trace' },
    ]);
    expect(fragrances.map((f) => [f.name, f.percent])).toEqual([['A', ''], ['B', '']]);
  });
  it('leaves other additives untouched and returns no rows when there is nothing to migrate', () => {
    const raw = [{ catalogId: 'salt', name: 'Salt', amount: '0.5', basis: 'oil', unit: 'percent', addAt: 'lye' }];
    expect(extractLegacyFragrance(raw)).toEqual({ additives: raw, fragrances: [] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/web/src/lib/scentColor.test.ts`
Expected: FAIL — cannot resolve `./scentColor`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/web/src/lib/scentColor.ts
import type { ColorantKind, FragranceKind } from '@soap-calc/core';
import { newAdditiveKey } from './recipe';
import type { ProcessId } from './process';

export type AllergenLine = { key: string; name: string; percentOfFragrance: string };
export type FragranceLine = {
  key: string;
  name: string;
  kind: FragranceKind;
  /** Of total oil weight (CP/HP) or of the finished solution (LS) — the basis is derived
   * from the process at compute time, never stored. */
  percent: string;
  /** The supplier's IFRA Category 9 rate, % of the FINISHED product. '' = unknown. */
  supplierMaxPercent: string;
  vanillinPercent: string;
  allergens: AllergenLine[];
};
export type ColorantLine = {
  key: string;
  name: string;
  kind: ColorantKind;
  /** Of the portion's oils; '' = to shade. Never seeded. */
  percent: string;
  /** '' = whole batter. */
  portionKey: string;
};
export type Portion = { key: string; name: string; percent: string };
export type ScentColor = { fragrances: FragranceLine[]; colorants: ColorantLine[]; portions: Portion[] };

export type SavedScentColor = {
  fragrances: Array<Omit<FragranceLine, 'key' | 'allergens'> & { allergens: Array<Omit<AllergenLine, 'key'>> }>;
  colorants: Array<Omit<ColorantLine, 'key'>>;
  portions: Array<Omit<Portion, 'key'>>;
};

export const MAX_SCENT_ROWS = 20;

const FRAGRANCE_KINDS: FragranceKind[] = ['fragrance-oil', 'essential-oil'];
const COLORANT_KINDS: ColorantKind[] = ['mica', 'oxide', 'natural', 'dye', 'other'];

export function createEmptyScentColor(): ScentColor {
  return { fragrances: [], colorants: [], portions: [] };
}

export function newFragranceLine(): FragranceLine {
  return { key: newAdditiveKey(), name: '', kind: 'fragrance-oil', percent: '', supplierMaxPercent: '', vanillinPercent: '', allergens: [] };
}

export function newAllergenLine(): AllergenLine {
  return { key: newAdditiveKey(), name: '', percentOfFragrance: '' };
}

/** LS seeds a dye (water-soluble is what a liquid tolerates, LS:13256); bars seed a mica.
 * The dose is EMPTY in every process — there is no sourced number to seed. */
export function newColorantLine(process: ProcessId): ColorantLine {
  return { key: newAdditiveKey(), name: '', kind: process === 'ls' ? 'dye' : 'mica', percent: '', portionKey: '' };
}

export function newPortion(): Portion {
  return { key: newAdditiveKey(), name: '', percent: '' };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** A percent string kept as typed when it parses to a finite non-negative number (or is
 * blank), else ''. Mirrors the additive amount rule: the field is text, validation is at read. */
function percentString(v: unknown): string {
  const s = str(v).trim();
  if (s === '') return '';
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? s : '';
}

function clampPortionPercent(v: unknown): string {
  const s = percentString(v);
  if (s === '') return '';
  const n = Number(s);
  return n > 100 ? '100' : s;
}

export function normalizeScentColor(raw: unknown): ScentColor {
  if (!isRecord(raw) || !Array.isArray(raw.fragrances) || !Array.isArray(raw.colorants) || !Array.isArray(raw.portions)) {
    return createEmptyScentColor();
  }
  // Portions first: saved rows carry no keys, so a colorant's saved `portionKey` is matched by
  // the portion's SAVED key when one was present (in-memory objects) or by index otherwise.
  const portionKeyMap = new Map<string, string>();
  const portions: Portion[] = raw.portions.slice(0, MAX_SCENT_ROWS).flatMap((p, i) => {
    if (!isRecord(p)) return [];
    const key = newAdditiveKey();
    portionKeyMap.set(str(p.key) || `#${i}`, key);
    return [{ key, name: str(p.name), percent: clampPortionPercent(p.percent) }];
  });
  const fragrances: FragranceLine[] = raw.fragrances.slice(0, MAX_SCENT_ROWS).flatMap((f) => {
    if (!isRecord(f)) return [];
    const kind = FRAGRANCE_KINDS.includes(f.kind as FragranceKind) ? (f.kind as FragranceKind) : 'fragrance-oil';
    const allergens: AllergenLine[] = Array.isArray(f.allergens)
      ? f.allergens.slice(0, MAX_SCENT_ROWS).flatMap((a) =>
          isRecord(a) ? [{ key: newAdditiveKey(), name: str(a.name), percentOfFragrance: percentString(a.percentOfFragrance) }] : [],
        )
      : [];
    return [{
      key: newAdditiveKey(),
      name: str(f.name),
      kind,
      percent: percentString(f.percent),
      supplierMaxPercent: percentString(f.supplierMaxPercent),
      vanillinPercent: percentString(f.vanillinPercent),
      allergens,
    }];
  });
  const colorants: ColorantLine[] = raw.colorants.slice(0, MAX_SCENT_ROWS).flatMap((c, i) => {
    if (!isRecord(c)) return [];
    const kind = COLORANT_KINDS.includes(c.kind as ColorantKind) ? (c.kind as ColorantKind) : 'other';
    const savedPortion = str(c.portionKey);
    // Saved files link by index ("#n"); in-memory rows link by key. A link to a portion that
    // no longer exists returns the colorant to the whole batter rather than dangling.
    const portionKey = portionKeyMap.get(savedPortion) ?? '';
    void i;
    return [{ key: newAdditiveKey(), name: str(c.name), kind, percent: percentString(c.percent), portionKey }];
  });
  return { fragrances, colorants, portions };
}

export function scentColorToSaved(scent: ScentColor): SavedScentColor {
  const portionIndex = new Map(scent.portions.map((p, i) => [p.key, `#${i}`]));
  return {
    fragrances: scent.fragrances.map(({ name, kind, percent, supplierMaxPercent, vanillinPercent, allergens }) => ({
      name, kind, percent, supplierMaxPercent, vanillinPercent,
      allergens: allergens.map(({ name: n, percentOfFragrance }) => ({ name: n, percentOfFragrance })),
    })),
    colorants: scent.colorants.map(({ name, kind, percent, portionKey }) => ({
      name, kind, percent, portionKey: portionIndex.get(portionKey) ?? '',
    })),
    portions: scent.portions.map(({ name, percent }) => ({ name, percent })),
  };
}

/**
 * The `fragrance` catalog entry is gone. A saved additive line that carried it becomes a
 * fragrance row — run on the RAW saved/file additives, before normalizeAdditiveLine clears
 * the unknown id. The percent is carried only for the bases the section derives for the
 * process (oil for CP/HP, solution for LS) with a percent unit; a batch-basis or ppt line
 * keeps its name with an empty percent rather than a silently re-dosed number. The stage is
 * dropped: the section derives it.
 */
export function extractLegacyFragrance(
  rawAdditives: Array<Record<string, unknown>>,
): { additives: Array<Record<string, unknown>>; fragrances: FragranceLine[] } {
  const fragrances: FragranceLine[] = [];
  const additives = rawAdditives.filter((line) => {
    if (line.catalogId !== 'fragrance') return true;
    const carriesPercent = line.unit === 'percent' && (line.basis === 'oil' || line.basis === 'solution');
    fragrances.push({
      ...newFragranceLine(),
      name: str(line.name) || 'Fragrance',
      percent: carriesPercent ? percentString(line.amount) : '',
    });
    return false;
  });
  return { additives, fragrances };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/web/src/lib/scentColor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/scentColor.ts packages/web/src/lib/scentColor.test.ts
git commit -m "feat(web): scentColor state model, normalization, and legacy-fragrance migration"
```

---

### Task 4: Persistence — drafts, recipe file v3, storage hook, autosave

**Files:**
- Modify: `packages/web/src/lib/recipeStorage.ts` (DraftPayload, LoadedDraft, loadDraftSlot, saveDraft)
- Modify: `packages/web/src/lib/recipeFile.ts` (RECIPE_FILE_VERSION 3, payload field, serialize, parse)
- Modify: `packages/web/src/hooks/useRecipeStorage.ts` (state, loadWorkspace, setProcess, handleNew, handleExport, handleImportFile, return)
- Modify: `packages/web/src/hooks/useRecipeAutosave.ts` (extra arg threaded to both saveDraft calls)
- Modify: `packages/web/src/App.tsx` (destructure `scentColor`/`setScentColor`; pass to autosave)
- Test: `packages/web/src/lib/recipeStorage.test.ts`, `packages/web/src/lib/recipeFile.test.ts`, `packages/web/src/hooks/useRecipeStorage.test.tsx` (existing files — add cases)

**Interfaces:**
- Consumes: Task 3's `ScentColor`, `SavedScentColor`, `normalizeScentColor`, `scentColorToSaved`, `createEmptyScentColor`, `extractLegacyFragrance`.
- Produces: `saveDraft(process, name, lines, settings, additives, scentColor = createEmptyScentColor())`; `LoadedDraft.scentColor: ScentColor`; `RecipeFilePayload.scentColor: SavedScentColor`; `RECIPE_FILE_VERSION = 3`, `RECIPE_FILE_VERSION_LEGACY` becomes the tuple `[1, 2]`; `serializeRecipeFile(name, lines, settings, additives, process, scentColor)`; `useRecipeStorage()` returns `scentColor`, `setScentColor`; `useRecipeAutosave(process, name, lines, settings, additives, scentColor, onSaveError?)`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/web/src/lib/recipeStorage.test.ts` (it already imports `loadDraft`, `saveDraft`, and uses jsdom localStorage — follow its existing setup; if it uses a `beforeEach(() => localStorage.clear())`, reuse it):

```ts
import { createEmptyScentColor, normalizeScentColor } from './scentColor';

describe('drafts carry the Fragrance & colorants section', () => {
  it('round-trips scentColor, and an older draft without it loads empty', () => {
    const scent = normalizeScentColor({
      fragrances: [{ name: 'Rose', kind: 'fragrance-oil', percent: '4', supplierMaxPercent: '', vanillinPercent: '', allergens: [] }],
      colorants: [],
      portions: [],
    });
    expect(saveDraft('cp', 'r', createStarterLines(), DEFAULT_SETTINGS, [], scent)).toBe(true);
    expect(loadDraft('cp')?.scentColor.fragrances[0].name).toBe('Rose');
    // strip the field as an older build would have written it
    const raw = JSON.parse(localStorage.getItem('soap-calc:draft:cp')!);
    delete raw.scentColor;
    localStorage.setItem('soap-calc:draft:cp', JSON.stringify(raw));
    expect(loadDraft('cp')?.scentColor).toEqual(createEmptyScentColor());
  });

  it('migrates a saved fragrance additive into a fragrance row BEFORE normalization strips its id', () => {
    const raw = JSON.parse(JSON.stringify({
      version: 3, name: 'old', updatedAt: new Date().toISOString(), settings: DEFAULT_SETTINGS,
      lines: [{ oilId: 'olive-oil', weightGrams: '1000' }],
      additives: [{ catalogId: 'fragrance', name: 'Lavender FO', amount: '3', basis: 'oil', unit: 'percent', addAt: 'trace' }],
    }));
    localStorage.setItem('soap-calc:draft:cp', JSON.stringify(raw));
    const draft = loadDraft('cp')!;
    expect(draft.additives).toEqual([]);
    expect(draft.scentColor.fragrances[0]).toMatchObject({ name: 'Lavender FO', percent: '3' });
  });
});
```

(Check the draft key: `grep -n "function draftKey" packages/web/src/lib/recipeStorage.ts` and use the exact string it builds.)

Append to `packages/web/src/lib/recipeFile.test.ts`:

```ts
import { normalizeScentColor, createEmptyScentColor } from './scentColor';

describe('recipe file v3 carries scentColor', () => {
  it('serializes at version 3 and parses it back; v2 without the field parses as empty', () => {
    const scent = normalizeScentColor({
      fragrances: [{ name: 'Rose', kind: 'fragrance-oil', percent: '4', supplierMaxPercent: '5', vanillinPercent: '2', allergens: [{ name: 'Citronellol', percentOfFragrance: '3' }] }],
      colorants: [{ name: 'Pink mica', kind: 'mica', percent: '', portionKey: '' }],
      portions: [{ name: 'A', percent: '40' }],
    });
    const payload = serializeRecipeFile('r', createStarterLines(), DEFAULT_SETTINGS, [], 'cp', scent);
    expect(payload.version).toBe(3);
    const parsed = parseRecipeFile(JSON.stringify(payload));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.data.scentColor.fragrances[0].allergens[0].name).toBe('Citronellol');
    const v2 = { ...payload, version: 2 } as Record<string, unknown>;
    delete v2.scentColor;
    const parsedV2 = parseRecipeFile(JSON.stringify(v2));
    if (!parsedV2.ok) throw new Error(parsedV2.error);
    expect(parsedV2.data.scentColor).toEqual(createEmptyScentColor());
    expect(parsedV2.data.version).toBe(3);
  });
});
```

Append to `packages/web/src/hooks/useRecipeStorage.test.tsx` (find its existing import-file harness — it renders the hook and calls `handleImportFile` with a `File`; mirror the nearest existing test exactly):

```ts
it('importing a v2 file with a fragrance additive lands it in the Fragrance & colorants section', async () => {
  const file = new File([JSON.stringify({
    version: 2, process: 'cp', name: 'legacy', exportedAt: new Date().toISOString(), settings: DEFAULT_SETTINGS,
    lines: [{ oilId: 'olive-oil', weightGrams: '1000' }],
    additives: [{ catalogId: 'fragrance', name: 'Lavender FO', amount: '3', basis: 'oil', unit: 'percent', addAt: 'trace' }],
  })], 'legacy.json', { type: 'application/json' });
  const { result } = renderHook(() => useRecipeStorage());
  await act(async () => { await result.current.handleImportFile(file); });
  expect(result.current.additives).toEqual([]);
  expect(result.current.scentColor.fragrances[0]).toMatchObject({ name: 'Lavender FO', percent: '3' });
  expect(result.current.saveMessage).toMatch(/fragrance/i);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/web/src/lib/recipeStorage.test.ts packages/web/src/lib/recipeFile.test.ts packages/web/src/hooks/useRecipeStorage.test.tsx`
Expected: FAIL — `scentColor` undefined / wrong version / extra arguments ignored.

- [ ] **Step 3: Implement persistence**

`packages/web/src/lib/recipeStorage.ts`:

```ts
// imports
import { createEmptyScentColor, extractLegacyFragrance, normalizeScentColor, scentColorToSaved, type SavedScentColor, type ScentColor } from './scentColor';

// DraftPayload gains:
  scentColor?: SavedScentColor;

// LoadedDraft gains:
  scentColor: ScentColor;

// in loadDraftSlot, where the draft is assembled (the object with `additives: additivesFromSaved(data.additives)`):
      const rawAdditives = Array.isArray(data.additives)
        ? (data.additives as unknown[]).filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
        : [];
      // Migration runs on the RAW rows: normalizeAdditiveLine would clear the retired id.
      const { additives: keptAdditives, fragrances: legacyFragrances } = extractLegacyFragrance(rawAdditives);
      const scentColor = normalizeScentColor(data.scentColor);
      if (legacyFragrances.length) scentColor.fragrances.unshift(...legacyFragrances);
      // ...then in the returned draft:
        additives: additivesFromSaved(keptAdditives as SavedAdditiveLine[]),
        scentColor,

// saveDraft signature + payload:
export function saveDraft(
  process: ProcessId,
  name: string,
  lines: RecipeLine[],
  settings: RecipeSettings,
  additives: AdditiveLine[] = createEmptyAdditives(),
  scentColor: ScentColor = createEmptyScentColor(),
): boolean {
  // ... unchanged guard ...
  const payload: DraftPayload = {
    version: STORAGE_VERSION,
    name,
    lines: cloneLines(lines),
    additives: cloneAdditives(additives),
    scentColor: scentColorToSaved(scentColor),
    settings,
    updatedAt: new Date().toISOString(),
  };
```

`packages/web/src/lib/recipeFile.ts`:

```ts
export const RECIPE_FILE_VERSION = 3 as const;
/** Older files still parse; a v3 file opened by an older build is refused, which is the
 * honest signal — the v2 parser builds its payload field by field and would silently drop
 * the section. */
export const RECIPE_FILE_LEGACY_VERSIONS: readonly number[] = [1, 2];

// RecipeFilePayload gains:
  scentColor: SavedScentColor;

// serializeRecipeFile gains a trailing param and field:
  scentColor: ScentColor = createEmptyScentColor(),
  // ...
    scentColor: scentColorToSaved(scentColor),

// parseRecipeFile: replace the version check
  if (version !== RECIPE_FILE_VERSION && !RECIPE_FILE_LEGACY_VERSIONS.includes(version as number)) {
    return { ok: false, error: 'Unsupported or missing recipe file version' };
  }
// and in the returned data object add:
      scentColor: normalizeScentColor(parsed.scentColor),
```

Keep `RECIPE_FILE_VERSION_LEGACY` exported as `1` if anything still imports it (`grep -rn RECIPE_FILE_VERSION_LEGACY packages/web/src`); otherwise delete it.

`packages/web/src/hooks/useRecipeAutosave.ts`: add `scentColor: ScentColor` as the parameter after `additives` and pass it as the sixth argument to both `saveDraft(...)` calls (lines 67 and 99). Add it to the effect dependency arrays beside `additives`.

`packages/web/src/hooks/useRecipeStorage.ts`:

```ts
// state
const [scentColor, setScentColor] = useState<ScentColor>(initial.current.ws.scentColor);
// workspaceRef carries it; loadWorkspace returns `scentColor: draft?.scentColor ?? createEmptyScentColor()`;
// setProcess: saveDraft(process, recipeName, lines, settings, additives, scentColor) and setScentColor(ws.scentColor);
// handleNew: setScentColor(createEmptyScentColor());
// handleExport: serializeRecipeFile(recipeName, linesToExport, settingsToExport, additivesToExport, process, scentColor);
// handleImportFile, after parse succeeds and BEFORE recipeAdditivesFromFile:
        const { additives: keptRaw, fragrances: legacyFragrances } = extractLegacyFragrance(
          parsed.data.additives as unknown as Array<Record<string, unknown>>,
        );
        const importedAdditives = recipeAdditivesFromFile(keptRaw as RecipeFilePayload['additives']);
        const importedScent = parsed.data.scentColor;
        if (legacyFragrances.length) importedScent.fragrances.unshift(...legacyFragrances);
// then setScentColor(importedScent), pass importedScent to the saveDraft that persists the import,
// and extend the flashed message: append ' Fragrance moved to Fragrance & colorants.' when legacyFragrances.length > 0
// (build it beside `routing`, the same way the routing suffix is appended).
// return { ..., scentColor, setScentColor }
```

`packages/web/src/App.tsx`: destructure `scentColor, setScentColor` from `useRecipeStorage()`; change the autosave call to `useRecipeAutosave(process, recipeName, lines, settings, additives, scentColor, () => …)`.

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run packages/web/src/lib/recipeStorage.test.ts packages/web/src/lib/recipeFile.test.ts packages/web/src/hooks/useRecipeStorage.test.tsx packages/web/src/hooks/useRecipeAutosave.test.tsx && cd packages/web && npx tsc --noEmit && cd ../..`
Expected: PASS; typecheck clean (fix any remaining `saveDraft`/`serializeRecipeFile` call sites the compiler names — `commitDrafts.ts` reads drafts, check it compiles).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/recipeStorage.ts packages/web/src/lib/recipeFile.ts packages/web/src/hooks/useRecipeStorage.ts packages/web/src/hooks/useRecipeAutosave.ts packages/web/src/App.tsx packages/web/src/lib/recipeStorage.test.ts packages/web/src/lib/recipeFile.test.ts packages/web/src/hooks/useRecipeStorage.test.tsx
git commit -m "feat(web): persist the Fragrance & colorants section (drafts, recipe file v3) and migrate legacy fragrance lines on load"
```

---

### Task 5: Retire the fragrance catalog entry

**Files:**
- Modify: `packages/core/src/additives.ts` (delete the `id: 'fragrance'` entry)
- Modify: `packages/core/src/additives.test.ts` (rows and tests naming `'fragrance'`)
- Modify: `packages/web/src/components/AdditivesPanel.tsx:301` (empty-state hint)
- Modify: `packages/web/src/components/AdditivesPanel.test.tsx` (lines ~588, 778, 834, 922, 934: swap the canonical example)
- Modify: `packages/web/src/lib/recipeSummary.test.ts`, `packages/web/src/components/ResultsPanel.test.tsx`, `packages/web/src/lib/batchWeightLinearity.test.ts`, `packages/web/src/lib/recipeFile.test.ts:84` — these construct lines with `catalogId: 'fragrance'` as data; where the line is built through `normalizeAdditiveLine` (recipeFile.test) switch the id to `'silk'`; where it is a hand-built `ComputedAdditive`/`AdditiveLine` passed straight to a function, leave it (the id is inert there).

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/additives.test.ts`:

```ts
describe('fragrance has left the additive catalog (it has its own section)', () => {
  it('is not an entry and is offered nowhere', () => {
    expect(catalogEntryById('fragrance')).toBeUndefined();
    for (const p of ['cp', 'hp', 'ls'] as const) {
      expect(catalogEntriesForProcess(p).some((e) => e.id === 'fragrance')).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/core/src/additives.test.ts -t "left the additive catalog"`
Expected: FAIL — entry still exists.

- [ ] **Step 3: Delete the entry and re-point the tests**

Delete the whole `{ … id: 'fragrance', … }` object from `ADDITIVE_CATALOG` in `packages/core/src/additives.ts` (the block starting at the `// LS sanctions after the cook, into diluted soap (LS:2950, LS:3363)` comment through its closing `},`).

In `packages/core/src/additives.test.ts`: remove any `['fragrance', …]` rows from the LS stage table, the CP and HP audit tables, and the `'gives each process its own answer where the sources differ — fragrance is the sharp case'` test — replace that test's body with silk: CP `['lye']`, HP `['lye']`, LS `['lye', 'after_cook']`. Remove `'fragrance'` from any solution-dosing assertions and use `'pearlizer'` (LS-only, `doseBasis: 'solution'`).

In `packages/web/src/components/AdditivesPanel.test.tsx`: line ~588 (`makeLine({ catalogId: 'fragrance', … })` in the solution-dosing test) → `catalogId: 'pearlizer', name: 'Pearlizer'`; the `it.each` row `['fragrance', 'after_cook', 'After dilution']` → `['pearlizer', 'after_cook', 'After dilution']`; `renderLine('fragrance', 'trace', 'cp')` in the "fixed at trace in CP" test → `renderLine('cetyl-alcohol', 'trace', 'cp')` (trace-only in CP); the two stray-stage tests at ~922/934 → `catalogId: 'silk'` with `addAt: 'oils'` (stray) and `addAt: 'lye'` (sanctioned).

`packages/web/src/components/AdditivesPanel.tsx:301` empty-state hint → `Optional extras (sugar, clay, salt, etc.) dosed per additive — not included in lye math (citric acid's compensation lye is added automatically). Fragrance and colour have their own section below.`

- [ ] **Step 4: Run every touched suite**

Run: `npx vitest run packages/core packages/web/src/components/AdditivesPanel.test.tsx packages/web/src/lib packages/web/src/components/ResultsPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages/core/src/additives.ts packages/core/src/additives.test.ts packages/web/src
git commit -m "refactor(additives): retire the fragrance catalog entry — fragrance has its own section"
```

---

### Task 6: Compute the section once (web) and thread it through the view model

**Files:**
- Create: `packages/web/src/lib/computeScentColor.ts`
- Create: `packages/web/src/lib/computeScentColor.test.ts`
- Modify: `packages/web/src/lib/calculateAdditives.ts:112-121` (`computeExtrasGrams` gains a 4th param `scentExtrasGrams = 0`)
- Modify: `packages/web/src/hooks/useRecipeViewModel.ts` (args, memos, extras, labelWeight consumers, insights option, batch sheet data, return)
- Modify: `packages/web/src/lib/batchSheet.ts` (`BatchSheetData.scentColor: ComputedScentColor`)
- Modify: `packages/web/src/App.tsx:216` (pass `scentColor` to the vm)
- Test: `packages/web/src/hooks/useRecipeViewModel.test.tsx` (add cases)

**Interfaces:**
- Consumes: Task 1/2 core functions; Task 3 `ScentColor`.
- Produces:
  ```ts
  export type ComputedFragrance = {
    key: string; name: string; kind: FragranceKind; percent: number | null; grams: number;
    stage: AdditiveStage; caution: boolean; browning: VanillinBrowning; vanillinPercent: number | null;
    stabilizerGrams: number; polysorbateGrams: number; supplierMaxPercent: number | null;
    allergens: Array<{ name: string; percentOfFragrance: number | null }>;
    // filled by the compliance pass:
    shareOfProduct: number; overSupplierMax: boolean;
  };
  export type ComputedColorant = {
    key: string; name: string; kind: ColorantKind; percent: number | null; grams: number | null;
    portionKey: string; portionName: string; portionPercent: number | null;
    stage: AdditiveStage; dispersal: ColorantDispersal;
  };
  export type ComputedScentColor = {
    fragrances: ComputedFragrance[]; colorants: ComputedColorant[];
    portions: Array<{ key: string; name: string; percent: number | null }>; portionsOver100: boolean;
    fragranceGrams: number; stabilizerGrams: number; polysorbateGrams: number; colorantGrams: number; carrierOilGrams: number;
    /** everything above summed — joins extrasGrams */ extrasGrams: number;
    carrierSuperfatShiftPercent: number;
    labelAllergens: LabelAllergen[];
    productGrams: number | null; productBasis: 'label' | 'solution' | 'batch' | null;
  };
  export function computeScentColorGrams(scent: ScentColor, ctx: { process: ProcessId; totalOilGrams: number; solutionGrams: number; deliveredSuperfatPercent: number | null }): ComputedScentColor; // shareOfProduct/overSupplierMax/labelAllergens empty, productGrams null
  export function applyScentColorCompliance(computed: ComputedScentColor, productGrams: number | null, productBasis: 'label' | 'solution' | 'batch'): ComputedScentColor;
  ```
  The vm exposes `scentColor: ComputedScentColor` (fully applied).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/web/src/lib/computeScentColor.test.ts
import { describe, expect, it } from 'vitest';
import { normalizeScentColor } from './scentColor';
import { applyScentColorCompliance, computeScentColorGrams } from './computeScentColor';

const scent = normalizeScentColor({
  fragrances: [
    { name: 'Vanilla dream', kind: 'fragrance-oil', percent: '3', supplierMaxPercent: '2', vanillinPercent: '12',
      allergens: [{ name: 'Linalool', percentOfFragrance: '12' }, { name: 'Coumarin', percentOfFragrance: '0.4' }] },
    { name: 'Clove bud', kind: 'essential-oil', percent: '0.5', supplierMaxPercent: '', vanillinPercent: '', allergens: [] },
  ],
  colorants: [
    { name: 'Yellow oxide', kind: 'oxide', percent: '1', portionKey: '' },
    { name: 'Blue mica', kind: 'mica', percent: '1', portionKey: 'p0' },
    { name: 'Glitter', kind: 'other', percent: '', portionKey: '' },
  ],
  portions: [{ key: 'p0', name: 'Swirl', percent: '40' }],
});

describe('computeScentColorGrams (CP, 1000 g oils)', () => {
  const c = computeScentColorGrams(scent, { process: 'cp', totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 5 });
  it('doses fragrance on the oils, stabilizer at 1:1 above 10% vanillin, and flags the clove EO', () => {
    expect(c.fragrances[0].grams).toBe(30);
    expect(c.fragrances[0].stabilizerGrams).toBe(30);
    expect(c.fragrances[0].browning).toBe('deep');
    expect(c.fragrances[0].stage).toBe('trace');
    expect(c.fragrances[1].caution).toBe(true);
    expect(c.fragrances[1].grams).toBe(5);
    expect(c.polysorbateGrams).toBe(0); // CP: no polysorbate
  });
  it('doses a whole-batter colour on all the oils and a portion colour on its share; "to shade" has no grams', () => {
    expect(c.colorants[0]).toMatchObject({ grams: 10, stage: 'oils', dispersal: { method: 'carrier-oil', carrierGrams: 10 } });
    expect(c.colorants[1]).toMatchObject({ grams: 4, stage: 'trace', portionName: 'Swirl', portionPercent: 40 });
    expect(c.colorants[2]).toMatchObject({ grams: null, stage: 'oils' });
  });
  it('sums the extras and the carrier superfat shift', () => {
    expect(c.carrierOilGrams).toBe(14);
    expect(c.carrierSuperfatShiftPercent).toBeCloseTo(1.4, 6);
    expect(c.extrasGrams).toBe(30 + 5 + 30 + 10 + 4 + 14);
    expect(c.portionsOver100).toBe(false);
  });
});

describe('applyScentColorCompliance', () => {
  it('compares the share of the FINISHED product to the supplier max and lists allergens above 0.01%', () => {
    const grams = computeScentColorGrams(scent, { process: 'cp', totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 5 });
    const c = applyScentColorCompliance(grams, 1300, 'label');
    expect(c.fragrances[0].shareOfProduct).toBeCloseTo(2.31, 2);
    expect(c.fragrances[0].overSupplierMax).toBe(true);   // 2.31% of product > 2% max
    expect(c.fragrances[1].overSupplierMax).toBe(false);  // no max entered
    expect(c.labelAllergens.map((a) => a.name)).toEqual(['Linalool']);
    expect(c.productBasis).toBe('label');
  });
  it('an unknown product weight yields no shares and no allergen list', () => {
    const grams = computeScentColorGrams(scent, { process: 'cp', totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 5 });
    const c = applyScentColorCompliance(grams, null, 'batch');
    expect(c.fragrances[0].shareOfProduct).toBe(0);
    expect(c.labelAllergens).toEqual([]);
  });
});

describe('LS', () => {
  it('doses fragrance on the solution, adds polysorbate 20 under a superfat, sends every colorant after dilution', () => {
    const c = computeScentColorGrams(scent, { process: 'ls', totalOilGrams: 1000, solutionGrams: 3000, deliveredSuperfatPercent: 2 });
    expect(c.fragrances[0].grams).toBe(90);
    expect(c.fragrances[0].stage).toBe('after_cook');
    expect(c.polysorbateGrams).toBe(95);
    expect(c.colorants.every((x) => x.stage === 'after_cook')).toBe(true);
    expect(c.colorants[0].dispersal).toEqual({ method: 'warm-water' });
    expect(c.carrierOilGrams).toBe(0);
  });
  it('is 0 g without a dilution', () => {
    const c = computeScentColorGrams(scent, { process: 'ls', totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 2 });
    expect(c.fragranceGrams).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/web/src/lib/computeScentColor.test.ts`
Expected: FAIL — cannot resolve `./computeScentColor`.

- [ ] **Step 3: Implement**

```ts
// packages/web/src/lib/computeScentColor.ts
import {
  allergensToLabel,
  carrierOilSuperfatShift,
  colorantDispersal,
  colorantGrams,
  colorantStage,
  essentialOilCaution,
  fragranceGrams,
  fragranceOverSupplierMax,
  fragranceShareOfProduct,
  parsePercentOfOil,
  polysorbate20Grams,
  portionOilGrams,
  portionsTotalPercent,
  vanillaStabilizerGrams,
  vanillinBrowning,
  type AdditiveStage,
  type ColorantDispersal,
  type ColorantKind,
  type FragranceKind,
  type LabelAllergen,
  type VanillinBrowning,
} from '@soap-calc/core';
import type { ProcessId } from './process';
import type { ScentColor } from './scentColor';

export type ComputedFragrance = {
  key: string; name: string; kind: FragranceKind; percent: number | null; grams: number;
  stage: AdditiveStage; caution: boolean; browning: VanillinBrowning; vanillinPercent: number | null;
  stabilizerGrams: number; polysorbateGrams: number; supplierMaxPercent: number | null;
  /** The declarations as typed, parsed; the compliance pass turns them into labelAllergens. */
  allergens: Array<{ name: string; percentOfFragrance: number | null }>;
  shareOfProduct: number; overSupplierMax: boolean;
};
export type ComputedColorant = {
  key: string; name: string; kind: ColorantKind; percent: number | null; grams: number | null;
  portionKey: string; portionName: string; portionPercent: number | null;
  stage: AdditiveStage; dispersal: ColorantDispersal;
};
export type ComputedScentColor = {
  fragrances: ComputedFragrance[];
  colorants: ComputedColorant[];
  portions: Array<{ key: string; name: string; percent: number | null }>;
  portionsOver100: boolean;
  fragranceGrams: number; stabilizerGrams: number; polysorbateGrams: number; colorantGrams: number; carrierOilGrams: number;
  extrasGrams: number;
  carrierSuperfatShiftPercent: number;
  labelAllergens: LabelAllergen[];
  productGrams: number | null;
  productBasis: 'label' | 'solution' | 'batch' | null;
};

/** The fragrance stage per process: at trace in a bar (CP:16777 "after trace"), after the
 * cook in HP (HP:10653), after dilution in LS (LS:2950, 3363). */
export function fragranceStageFor(process: ProcessId): AdditiveStage {
  return process === 'cp' ? 'trace' : 'after_cook';
}

/** Pass 1 — everything that depends only on the oils/solution. The finished-product
 * figures need the batch weight this pass feeds, so they come in pass 2. */
export function computeScentColorGrams(
  scent: ScentColor,
  ctx: { process: ProcessId; totalOilGrams: number; solutionGrams: number; deliveredSuperfatPercent: number | null },
): ComputedScentColor {
  const { process, totalOilGrams, solutionGrams, deliveredSuperfatPercent } = ctx;
  const basisGrams = process === 'ls' ? solutionGrams : totalOilGrams;
  const stage = fragranceStageFor(process);
  const fragrances: ComputedFragrance[] = scent.fragrances.map((f) => {
    const percent = parsePercentOfOil(f.percent);
    const grams = fragranceGrams(percent, basisGrams);
    const vanillin = parsePercentOfOil(f.vanillinPercent);
    return {
      key: f.key, name: f.name, kind: f.kind, percent, grams, stage,
      caution: essentialOilCaution(f.kind, f.name),
      browning: vanillinBrowning(vanillin),
      vanillinPercent: vanillin,
      stabilizerGrams: vanillaStabilizerGrams(grams, vanillin),
      allergens: f.allergens.map((a) => ({ name: a.name, percentOfFragrance: parsePercentOfOil(a.percentOfFragrance) })),
      polysorbateGrams: process === 'ls' ? polysorbate20Grams(grams, deliveredSuperfatPercent) : 0,
      supplierMaxPercent: parsePercentOfOil(f.supplierMaxPercent),
      shareOfProduct: 0,
      overSupplierMax: false,
    };
  });
  const portions = scent.portions.map((p) => ({ key: p.key, name: p.name, percent: parsePercentOfOil(p.percent) }));
  const byKey = new Map(portions.map((p) => [p.key, p]));
  const colorants: ComputedColorant[] = scent.colorants.map((c) => {
    const portion = process === 'ls' ? undefined : byKey.get(c.portionKey);
    const percent = parsePercentOfOil(c.percent);
    const grams = colorantGrams(percent, portionOilGrams(totalOilGrams, portion?.percent ?? null));
    return {
      key: c.key, name: c.name, kind: c.kind, percent, grams,
      portionKey: portion?.key ?? '', portionName: portion?.name ?? '', portionPercent: portion?.percent ?? null,
      stage: colorantStage(process, portion !== undefined),
      dispersal: colorantDispersal(process, grams),
    };
  });
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const fragranceTotal = sum(fragrances.map((f) => f.grams));
  const stabilizerGrams = sum(fragrances.map((f) => f.stabilizerGrams));
  const polysorbateGrams = sum(fragrances.map((f) => f.polysorbateGrams));
  const colorantTotal = sum(colorants.map((c) => c.grams ?? 0));
  const carrierOilGrams = sum(colorants.map((c) => (c.dispersal.method === 'carrier-oil' ? c.dispersal.carrierGrams ?? 0 : 0)));
  return {
    fragrances, colorants, portions,
    portionsOver100: portionsTotalPercent(portions).over100,
    fragranceGrams: fragranceTotal, stabilizerGrams, polysorbateGrams, colorantGrams: colorantTotal, carrierOilGrams,
    extrasGrams: fragranceTotal + stabilizerGrams + polysorbateGrams + colorantTotal + carrierOilGrams,
    carrierSuperfatShiftPercent: carrierOilSuperfatShift(carrierOilGrams, totalOilGrams),
    labelAllergens: [],
    productGrams: null,
    productBasis: null,
  };
}

/** Pass 2 — the finished-product comparisons (IFRA basis) and the allergen list. */
export function applyScentColorCompliance(
  computed: ComputedScentColor,
  productGrams: number | null,
  productBasis: 'label' | 'solution' | 'batch',
): ComputedScentColor {
  const product = productGrams !== null && Number.isFinite(productGrams) && productGrams > 0 ? productGrams : null;
  const fragrances = computed.fragrances.map((f) => {
    const shareOfProduct = product === null ? 0 : fragranceShareOfProduct(f.grams, product);
    return { ...f, shareOfProduct, overSupplierMax: fragranceOverSupplierMax(shareOfProduct, f.supplierMaxPercent) };
  });
  const labelAllergens = product === null ? [] : allergensToLabel(
    fragrances.flatMap((f) => f.allergens.flatMap((a) =>
      a.percentOfFragrance === null ? [] : [{ name: a.name, percentOfFragrance: a.percentOfFragrance, fragranceGrams: f.grams }],
    )),
    product,
  );
  return { ...computed, fragrances, productGrams: product, productBasis, labelAllergens };
}
```

`packages/web/src/lib/calculateAdditives.ts` — `computeExtrasGrams`:

```ts
export function computeExtrasGrams(
  additives: Array<{ grams: number }>,
  splitLiquidGrams: number | null,
  postCookSuperfat: AppliedPostCookSuperfat | null,
  /** The Fragrance & colorants section's mass: fragrance, stabilizer, polysorbate, colorant,
   * carrier oil (ComputedScentColor.extrasGrams). Real mass in the bar or bottle. */
  scentExtrasGrams = 0,
): number {
  const additiveGrams = additives.reduce((sum, item) => sum + item.grams, 0);
  const pcsfGrams = postCookSuperfat?.isExtra ? postCookSuperfat.grams : 0;
  return additiveGrams + (splitLiquidGrams ?? 0) + pcsfGrams + scentExtrasGrams;
}
```

`packages/web/src/hooks/useRecipeViewModel.ts`:
- `UseRecipeViewModelArgs` gains `scentColor: ScentColor`; destructure it.
- After the `computedAdditives` memo (~line 545):
  ```ts
  const scentGrams = useMemo(
    () => computeScentColorGrams(scentColor, {
      process, totalOilGrams, solutionGrams,
      deliveredSuperfatPercent: postCookSuperfat?.deliveredSuperfatPercent ?? (Number(previewSettings.superfatPercent) || 0),
    }),
    [scentColor, process, totalOilGrams, solutionGrams, postCookSuperfat, previewSettings.superfatPercent],
  );
  ```
  (Place it after `postCookSuperfat` is defined — move it below that memo if needed; the delivered superfat without a PCSF is the main superfat.)
- `extrasGrams`: `computeExtrasGrams(computedAdditives, splitLiquidGrams, postCookSuperfat, scentGrams.extrasGrams)`.
- After `labelWeight` and `bottledSolutionGrams` exist:
  ```ts
  const scentColorComputed = useMemo(() => {
    if (process === 'ls') return applyScentColorCompliance(scentGrams, bottledSolutionGrams > 0 ? bottledSolutionGrams : null, 'solution');
    if (labelWeight !== null) return applyScentColorCompliance(scentGrams, labelWeight, 'label');
    return applyScentColorCompliance(scentGrams, batchWeightWithExtras > 0 ? batchWeightWithExtras : null, 'batch');
  }, [scentGrams, process, bottledSolutionGrams, labelWeight, batchWeightWithExtras]);
  ```
- Pass `scentColor: scentColorComputed` into `buildBatchSheetData({...})` and add `scentColor: ComputedScentColor` to `BatchSheetData` in `packages/web/src/lib/batchSheet.ts`.
- Add `scentColor: ComputedScentColor` to the `RecipeViewModel` type and return it as `scentColor: scentColorComputed`.
- `App.tsx:216`: pass `scentColor` into `useRecipeViewModel({ … })`.

Add to `packages/web/src/hooks/useRecipeViewModel.test.tsx` (use its existing `probe` helper — it takes a settings partial and a process; extend the harness to accept a `scentColor` argument, defaulting to `createEmptyScentColor()`):

```ts
test('the Fragrance & colorants section joins the extras, the batch weight and the label weight', () => {
  const scent = normalizeScentColor({ fragrances: [{ name: 'F', kind: 'fragrance-oil', percent: '3', supplierMaxPercent: '', vanillinPercent: '', allergens: [] }], colorants: [], portions: [] });
  let plain: any; let scented: any;
  probe((vm) => { plain = vm; }, {}, 'cp');
  probe((vm) => { scented = vm; }, {}, 'cp', scent);
  expect(scented.scentColor.fragranceGrams).toBeCloseTo(plain.totalOilGrams * 0.03, 6);
  expect(scented.extrasGrams).toBeCloseTo(plain.extrasGrams + scented.scentColor.fragranceGrams, 6);
  expect(scented.batchWeightWithExtras).toBeCloseTo(plain.batchWeightWithExtras + scented.scentColor.fragranceGrams, 6);
  expect(scented.labelWeight).toBeCloseTo(plain.labelWeight + scented.scentColor.fragranceGrams, 6);
  // the share is of the LABEL weight, which includes the fragrance itself
  expect(scented.scentColor.productBasis).toBe('label');
  expect(scented.scentColor.fragrances[0].shareOfProduct).toBeCloseTo((100 * scented.scentColor.fragranceGrams) / scented.labelWeight, 6);
});
```

- [ ] **Step 4: Run and typecheck**

Run: `npx vitest run packages/web/src/lib/computeScentColor.test.ts packages/web/src/hooks/useRecipeViewModel.test.tsx packages/web/src/lib/batchWeightLinearity.test.ts && cd packages/web && npx tsc --noEmit && cd ../..`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/computeScentColor.ts packages/web/src/lib/computeScentColor.test.ts packages/web/src/lib/calculateAdditives.ts packages/web/src/hooks/useRecipeViewModel.ts packages/web/src/hooks/useRecipeViewModel.test.tsx packages/web/src/lib/batchSheet.ts packages/web/src/App.tsx
git commit -m "feat(web): compute the Fragrance & colorants section once in the view model; it joins extras, batch and label weight"
```

---

### Task 7: The panel

**Files:**
- Create: `packages/web/src/components/FragranceColorantsPanel.tsx`
- Create: `packages/web/src/components/FragranceColorantsPanel.test.tsx`
- Create: `packages/web/src/lib/colorantGuidance.ts` (+ `colorantGuidance.test.ts`) — unit-aware guidance text
- Modify: `packages/web/src/App.tsx` (mount after `AdditivesPanel`)
- Modify: panel numbers — `PropertiesPanel.tsx:92` `06`→`07`; `FattyAcidPanel.tsx:72,127` `07`→`08`; `ResultsPanel.tsx:148,163,254` `08`→`09`; `DilutionPanel.tsx:1307` `09`→`10`
- Modify: `packages/web/src/index.css` (reuse `.additive-list__*`; add `.scent-list__allergens` for the disclosure)

**Interfaces:**
- Consumes: `ScentColor` + factories (Task 3), `ComputedScentColor` (Task 6), `SegRadioGroup` (`label`, `name`, `options: {value, cell, name}[]`, `value`, `onChange`), `additiveStageLabel(stage, process)`, `formatWeight(grams, unit)`, `formatGrams(n, digits)`.
- Produces:
  ```ts
  // lib/colorantGuidance.ts
  export function colorantGuidanceText(kind: ColorantKind, unit: WeightUnit): string | null;
  // e.g. mica, 'g' → "About 1–2 tsp per kg of oils — roughly 0.2–0.9% by weight; density varies by product, start low."
  //      mica, 'lb' → "About ½–1 tsp per lb of oils — roughly 0.2–0.9% by weight; density varies by product, start low."
  export function hpWaterText(unit: WeightUnit): string; // "7–14 g hot water and a pinch of sugar" | "¼–½ oz hot water and a pinch of sugar"
  // components/FragranceColorantsPanel.tsx
  type Props = { scent: ScentColor; computed: ComputedScentColor; process: ProcessId; weightUnit: WeightUnit; onChange: (next: ScentColor) => void };
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// packages/web/src/lib/colorantGuidance.test.ts
import { describe, expect, it } from 'vitest';
import { colorantGuidanceText, hpWaterText } from './colorantGuidance';

describe('guidance renders in the active weight unit', () => {
  it('imperial: tsp per lb; metric: tsp per kg (1 lb = 0.4536 kg → ×2.2, rounded to halves)', () => {
    expect(colorantGuidanceText('mica', 'lb')).toBe('About ½–1 tsp per lb of oils — roughly 0.2–0.9% by weight; density varies by product, start low.');
    expect(colorantGuidanceText('mica', 'kg')).toBe('About 1–2 tsp per kg of oils — roughly 0.2–0.9% by weight; density varies by product, start low.');
    expect(colorantGuidanceText('oxide', 'g')).toBe('About ½–1 tsp per kg of oils — roughly 0.1–0.45% by weight; half or less for brown and red; density varies by product, start low.');
  });
  it('dyes and "other" have no range', () => {
    expect(colorantGuidanceText('dye', 'g')).toBeNull();
    expect(colorantGuidanceText('other', 'lb')).toBeNull();
  });
  it('the HP water figure follows the unit', () => {
    expect(hpWaterText('g')).toBe('7–14 g hot water and a pinch of sugar');
    expect(hpWaterText('oz')).toBe('¼–½ oz hot water and a pinch of sugar');
  });
});
```

```tsx
// packages/web/src/components/FragranceColorantsPanel.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FragranceColorantsPanel } from './FragranceColorantsPanel';
import { createEmptyScentColor, normalizeScentColor, type ScentColor } from '../lib/scentColor';
import { applyScentColorCompliance, computeScentColorGrams } from '../lib/computeScentColor';
import type { ProcessId } from '../lib/process';

afterEach(cleanup);

function renderPanel(scent: ScentColor, process: ProcessId, unit: 'g' | 'lb' = 'g', productGrams: number | null = 1300) {
  const grams = computeScentColorGrams(scent, { process, totalOilGrams: 1000, solutionGrams: 3000, deliveredSuperfatPercent: 5 });
  const computed = applyScentColorCompliance(grams, productGrams, process === 'ls' ? 'solution' : 'label');
  const onChange = vi.fn();
  render(<FragranceColorantsPanel scent={scent} computed={computed} process={process} weightUnit={unit} onChange={onChange} />);
  return onChange;
}

const vanilla = normalizeScentColor({
  fragrances: [{ name: 'Vanilla dream', kind: 'fragrance-oil', percent: '3', supplierMaxPercent: '2', vanillinPercent: '12',
    allergens: [{ name: 'Linalool', percentOfFragrance: '12' }] }],
  colorants: [{ name: 'Blue mica', kind: 'mica', percent: '', portionKey: '' }],
  portions: [],
});

describe('FragranceColorantsPanel', () => {
  it('labels the dose per process: % of oils for bars, % of solution for liquid soap', () => {
    renderPanel(vanilla, 'cp');
    expect(screen.getByLabelText(/Vanilla dream.*% of oils/i)).toBeTruthy();
    cleanup();
    renderPanel(vanilla, 'ls');
    expect(screen.getByLabelText(/Vanilla dream.*% of solution/i)).toBeTruthy();
  });

  it('shows the fixed stage, the over-max warning with both readings, browning, stabilizer grams and the label allergens', () => {
    renderPanel(vanilla, 'cp');
    expect(screen.getByText('At trace')).toBeTruthy();
    expect(screen.getByText(/2\.3% of the finished bar/)).toBeTruthy();
    expect(screen.getByText(/supplier max 2%/)).toBeTruthy();
    expect(screen.getByText(/browning: deep/i)).toBeTruthy();
    expect(screen.getByText(/30 g vanilla stabilizer/i)).toBeTruthy();
    expect(screen.getByText(/name on the label/i).textContent).toMatch(/Linalool/);
  });

  it('adds rows through the buttons: a fragrance, a colorant (Dye in LS, empty dose), a portion (not in LS)', () => {
    const onChange = renderPanel(createEmptyScentColor(), 'ls');
    fireEvent.click(screen.getByRole('button', { name: /add colorant/i }));
    const next = onChange.mock.calls[0][0] as ScentColor;
    expect(next.colorants[0]).toMatchObject({ kind: 'dye', percent: '' });
    expect(screen.queryByRole('button', { name: /split the batter/i })).toBeNull();
    cleanup();
    const onChangeCp = renderPanel(createEmptyScentColor(), 'cp');
    fireEvent.click(screen.getByRole('button', { name: /split the batter/i }));
    expect((onChangeCp.mock.calls[0][0] as ScentColor).portions).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /add fragrance/i }));
    expect((onChangeCp.mock.calls[1][0] as ScentColor).fragrances[0].kind).toBe('fragrance-oil');
  });

  it('a colorant row shows the guidance in the active unit, the dispersal line, and "to shade" without a dose', () => {
    renderPanel(vanilla, 'cp', 'lb');
    expect(screen.getByText(/½–1 tsp per lb of oils/)).toBeTruthy();
    expect(screen.getByText(/to shade/i)).toBeTruthy();
    expect(screen.getByText(/1:1 with a light carrier oil/i)).toBeTruthy();
    cleanup();
    renderPanel(vanilla, 'cp', 'g');
    expect(screen.getByText(/1–2 tsp per kg of oils/)).toBeTruthy();
  });

  it('deleting a portion returns its colorants to the whole batter', () => {
    const scent = normalizeScentColor({
      fragrances: [], colorants: [{ name: 'Mica', kind: 'mica', percent: '1', portionKey: 'p0' }],
      portions: [{ key: 'p0', name: 'Swirl', percent: '40' }],
    });
    const onChange = renderPanel(scent, 'cp');
    fireEvent.click(screen.getByRole('button', { name: /remove portion swirl/i }));
    const next = onChange.mock.calls[0][0] as ScentColor;
    expect(next.portions).toEqual([]);
    expect(next.colorants[0].portionKey).toBe('');
  });

  it('the allergen disclosure adds and removes declaration rows', () => {
    const onChange = renderPanel(vanilla, 'cp');
    fireEvent.click(screen.getByRole('button', { name: /add allergen/i }));
    const next = onChange.mock.calls[0][0] as ScentColor;
    expect(next.fragrances[0].allergens).toHaveLength(2);
  });

  it('carries the regulatory line with its checked date and the process copy', () => {
    renderPanel(vanilla, 'hp');
    expect(screen.getByText(/0\.01%/)).toBeTruthy();
    expect(screen.getByText(/31 July 2026/)).toBeTruthy();
    expect(screen.getByText(/room temperature/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run packages/web/src/lib/colorantGuidance.test.ts packages/web/src/components/FragranceColorantsPanel.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement the guidance formatter**

```ts
// packages/web/src/lib/colorantGuidance.ts
import { COLORANT_GUIDANCE, HP_COLORANT_WATER_GRAMS, type ColorantKind } from '@soap-calc/core';
import type { WeightUnit } from './weightUnits';

const LB_PER_KG = 2.20462;
const isMetric = (unit: WeightUnit) => unit === 'g' || unit === 'kg';

/** ½, 1, 1½, 2 … — the way a spoon is read. */
function tsp(n: number): string {
  const half = Math.round(n * 2) / 2;
  const whole = Math.floor(half);
  const frac = half - whole;
  if (whole === 0) return frac ? '½' : '0';
  return frac ? `${whole}½` : String(whole);
}

export function colorantGuidanceText(kind: ColorantKind, unit: WeightUnit): string | null {
  const g = COLORANT_GUIDANCE[kind];
  if (!g) return null;
  const metric = isMetric(unit);
  const low = tsp(metric ? g.tspPerLbLow * LB_PER_KG : g.tspPerLbLow);
  const high = tsp(metric ? g.tspPerLbHigh * LB_PER_KG : g.tspPerLbHigh);
  const per = metric ? 'kg' : 'lb';
  const half = kind === 'oxide' ? ' half or less for brown and red;' : '';
  return `About ${low}–${high} tsp per ${per} of oils — roughly ${g.percentLow}–${g.percentHigh}% by weight;${half} density varies by product, start low.`;
}

export function hpWaterText(unit: WeightUnit): string {
  return isMetric(unit)
    ? `${Math.round(HP_COLORANT_WATER_GRAMS.low)}–${Math.round(HP_COLORANT_WATER_GRAMS.high)} g hot water and a pinch of sugar`
    : '¼–½ oz hot water and a pinch of sugar';
}
```

Check the oxide expectation: `tsp(0.25 * 2.20462) = tsp(0.55) → '½'`, `tsp(0.5 * 2.20462) = tsp(1.10) → '1'` → "About ½–1 tsp per kg". Mica: `tsp(1.10)='1'`, `tsp(2.20)='2'` → "1–2". Imperial mica `tsp(0.5)='½'`, `tsp(1)='1'`.

- [ ] **Step 4: Implement the panel**

```tsx
// packages/web/src/components/FragranceColorantsPanel.tsx
import { memo } from 'react';
import { type ColorantKind, type FragranceKind } from '@soap-calc/core';
import { additiveStageLabel } from '../lib/additiveStageLabel';
import { colorantGuidanceText, hpWaterText } from '../lib/colorantGuidance';
import type { ComputedColorant, ComputedFragrance, ComputedScentColor } from '../lib/computeScentColor';
import { formatGrams } from '../lib/format';
import type { ProcessId } from '../lib/process';
import {
  newAllergenLine, newColorantLine, newFragranceLine, newPortion,
  type ColorantLine, type FragranceLine, type Portion, type ScentColor,
} from '../lib/scentColor';
import { formatWeight, type WeightUnit } from '../lib/weightUnits';
import { SegRadioGroup } from './SegRadioGroup';

type Props = {
  scent: ScentColor;
  computed: ComputedScentColor;
  process: ProcessId;
  weightUnit: WeightUnit;
  onChange: (next: ScentColor) => void;
};

const FRAGRANCE_KINDS: Array<{ value: FragranceKind; cell: string; name: string }> = [
  { value: 'fragrance-oil', cell: 'Fragrance oil', name: 'Fragrance oil' },
  { value: 'essential-oil', cell: 'Essential oil', name: 'Essential oil' },
];
const COLORANT_KINDS: Array<{ value: ColorantKind; cell: string; name: string }> = [
  { value: 'mica', cell: 'Mica', name: 'Mica' },
  { value: 'oxide', cell: 'Oxide', name: 'Oxide or ultramarine' },
  { value: 'natural', cell: 'Natural', name: 'Natural powder' },
  { value: 'dye', cell: 'Dye', name: 'Water-soluble dye' },
  { value: 'other', cell: 'Other', name: 'Other' },
];

/* Process copy. CP:9565-9614 (dose on total oil weight, supplier's tested rate), CP:9844-9860
   (the flashpoint is not a soaping limit); HP:11024-11029 (room temperature; stabilizer may
   thicken); LS:16991-16998 (prove a new fragrance in a small solution). */
const PROCESS_COPY: Record<ProcessId, string> = {
  cp: 'Dose against total oil weight; your supplier\'s tested rate is the ceiling. The flashpoint is a shipping figure, not a soaping limit.',
  hp: 'Add fragrance after the cook, at room temperature. A vanilla stabilizer goes into the measured fragrance first and can thicken the paste.',
  ls: 'Dose against the finished solution and prove a new fragrance in a small test solution first — most cloud a little.',
};

/* EU labelling, checked 2026-09-08: Annex III of (EC) 1223/2009 names listed allergens above
   0.01% of a rinse-off product; Regulation (EU) 2023/1545 widens the list for products
   placed on the market from 31 July 2026 (sell-through to 31 July 2028). */
const REGULATORY_COPY =
  'EU labelling: a listed allergen above 0.01% of the finished soap must be named on the label — the wider list applies to products placed on the market from 31 July 2026. Your safety assessment (CPSR) needs the supplier\'s allergen declaration.';

const productNoun = (process: ProcessId, basis: ComputedScentColor['productBasis']) =>
  basis === 'batch' ? 'raw batch' : process === 'ls' ? 'finished solution' : 'finished bar';

export const FragranceColorantsPanel = memo(function FragranceColorantsPanel({ scent, computed, process, weightUnit, onChange }: Props) {
  const update = (patch: Partial<ScentColor>) => onChange({ ...scent, ...patch });
  const setFragrance = (key: string, patch: Partial<FragranceLine>) =>
    update({ fragrances: scent.fragrances.map((f) => (f.key === key ? { ...f, ...patch } : f)) });
  const setColorant = (key: string, patch: Partial<ColorantLine>) =>
    update({ colorants: scent.colorants.map((c) => (c.key === key ? { ...c, ...patch } : c)) });
  const setPortion = (key: string, patch: Partial<Portion>) =>
    update({ portions: scent.portions.map((p) => (p.key === key ? { ...p, ...patch } : p)) });
  const removePortion = (key: string) =>
    update({
      portions: scent.portions.filter((p) => p.key !== key),
      // Its colours go back to the whole batter rather than dangling.
      colorants: scent.colorants.map((c) => (c.portionKey === key ? { ...c, portionKey: '' } : c)),
    });
  const doseLabel = process === 'ls' ? '% of solution' : '% of oils';
  const noun = productNoun(process, computed.productBasis);
  const byKey = <T extends { key: string }>(xs: T[]) => new Map(xs.map((x) => [x.key, x]));
  const cf = byKey(computed.fragrances);
  const cc = byKey(computed.colorants);

  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">
            <span className="panel__num" aria-hidden="true">06</span>Fragrance &amp; colorants
          </h2>
          <p className="panel__subtitle">Scent, colour and what the label must say</p>
        </div>
        <div className="panel__actions">
          <button type="button" className="btn btn--ghost" onClick={() => update({ fragrances: [...scent.fragrances, newFragranceLine()] })}>+ Add fragrance</button>
          <button type="button" className="btn btn--ghost" onClick={() => update({ colorants: [...scent.colorants, newColorantLine(process)] })}>+ Add colorant</button>
          {process !== 'ls' && (
            <button type="button" className="btn btn--ghost" onClick={() => update({ portions: [...scent.portions, newPortion()] })}>Split the batter</button>
          )}
        </div>
      </div>

      <p className="results-hint">{PROCESS_COPY[process]}</p>

      {scent.fragrances.length > 0 && (
        <ul className="additive-list" aria-label="Fragrances">
          {scent.fragrances.map((f) => {
            const c = cf.get(f.key)!;
            const rowName = f.name.trim() || 'Fragrance';
            return (
              <li key={f.key} className="additive-list__row">
                <label className="field additive-list__custom-name">
                  <span className="sr-only">Name</span>
                  <input className="input" aria-label={`Fragrance name`} placeholder="Fragrance name" value={f.name} onChange={(e) => setFragrance(f.key, { name: e.target.value })} />
                </label>
                <button type="button" className="btn btn--icon" aria-label={`Remove ${rowName}`} onClick={() => update({ fragrances: scent.fragrances.filter((x) => x.key !== f.key) })}>×</button>
                <SegRadioGroup label={`Kind of ${rowName}`} name={`fragrance-kind-${f.key}`} options={FRAGRANCE_KINDS} value={f.kind} onChange={(kind) => setFragrance(f.key, { kind })} preserveCase />
                <label className="field"><span>{doseLabel}</span>
                  <input className="input" inputMode="decimal" aria-label={`${rowName} ${doseLabel}`} value={f.percent} onChange={(e) => setFragrance(f.key, { percent: e.target.value })} />
                </label>
                <label className="field"><span>Supplier max (% of finished product)</span>
                  <input className="input" inputMode="decimal" aria-label={`${rowName} supplier max`} value={f.supplierMaxPercent} onChange={(e) => setFragrance(f.key, { supplierMaxPercent: e.target.value })} />
                </label>
                <label className="field"><span>Vanillin %</span>
                  <input className="input" inputMode="decimal" aria-label={`${rowName} vanillin`} value={f.vanillinPercent} onChange={(e) => setFragrance(f.key, { vanillinPercent: e.target.value })} />
                </label>
                <div className="additive-list__grams">{c.grams > 0 ? formatWeight(c.grams, weightUnit) : '—'}</div>
                <div className="additive-list__stage-fixed">{additiveStageLabel(c.stage, process)}</div>
                <FragranceNotes c={c} noun={noun} unit={weightUnit} />
                <details className="scent-list__allergens">
                  <summary>Allergens ({f.allergens.length})</summary>
                  {f.allergens.map((a) => (
                    <div key={a.key} className="scent-list__allergen">
                      <input className="input" aria-label="Allergen name" placeholder="INCI name, as declared" value={a.name}
                        onChange={(e) => setFragrance(f.key, { allergens: f.allergens.map((x) => (x.key === a.key ? { ...x, name: e.target.value } : x)) })} />
                      <input className="input" inputMode="decimal" aria-label="Allergen % of fragrance" placeholder="% of fragrance" value={a.percentOfFragrance}
                        onChange={(e) => setFragrance(f.key, { allergens: f.allergens.map((x) => (x.key === a.key ? { ...x, percentOfFragrance: e.target.value } : x)) })} />
                      <button type="button" className="btn btn--icon" aria-label={`Remove allergen ${a.name || ''}`.trim()}
                        onClick={() => setFragrance(f.key, { allergens: f.allergens.filter((x) => x.key !== a.key) })}>×</button>
                    </div>
                  ))}
                  <button type="button" className="btn btn--ghost" onClick={() => setFragrance(f.key, { allergens: [...f.allergens, newAllergenLine()] })}>+ Add allergen</button>
                </details>
              </li>
            );
          })}
          <li className="additive-list__foot">
            Blend: {formatGrams(computed.fragrances.reduce((s, f) => s + (f.percent ?? 0), 0), 2)}{doseLabel.replace(' of', ' of')} · {formatWeight(computed.fragranceGrams, weightUnit)}
            {computed.stabilizerGrams > 0 && <> · vanilla stabilizer {formatWeight(computed.stabilizerGrams, weightUnit)}</>}
            {computed.polysorbateGrams > 0 && <> · polysorbate 20 {formatWeight(computed.polysorbateGrams, weightUnit)}</>}
          </li>
          {computed.labelAllergens.length > 0 && (
            <li className="inline-note">
              <strong>Name on the label:</strong>{' '}
              {computed.labelAllergens.map((a) => `${a.name} (${formatGrams(a.percentOfProduct, 3)}% of the ${noun})`).join(', ')}
            </li>
          )}
        </ul>
      )}

      {scent.portions.length > 0 && process !== 'ls' && (
        <ul className="additive-list" aria-label="Batter portions">
          {scent.portions.map((p) => (
            <li key={p.key} className="additive-list__row">
              <input className="input" aria-label="Portion name" placeholder="Portion name" value={p.name} onChange={(e) => setPortion(p.key, { name: e.target.value })} />
              <label className="field"><span>% of batter</span>
                <input className="input" inputMode="decimal" aria-label={`Portion ${p.name || ''} % of batter`.replace(/\s+/g, ' ')} value={p.percent} onChange={(e) => setPortion(p.key, { percent: e.target.value })} />
              </label>
              <button type="button" className="btn btn--icon" aria-label={`Remove portion ${p.name || ''}`.trim()} onClick={() => removePortion(p.key)}>×</button>
            </li>
          ))}
          <li className="additive-list__foot">
            Portions total {formatGrams(computed.portions.reduce((s, p) => s + (p.percent ?? 0), 0), 1)}%
            {computed.portionsOver100 && <strong> — over 100%: the portions cannot add up to more than the batter.</strong>}
          </li>
        </ul>
      )}

      {scent.colorants.length > 0 && (
        <ul className="additive-list" aria-label="Colorants">
          {scent.colorants.map((col) => {
            const c = cc.get(col.key)!;
            const rowName = col.name.trim() || 'Colorant';
            const guidance = process === 'ls' ? null : colorantGuidanceText(col.kind, weightUnit);
            return (
              <li key={col.key} className="additive-list__row">
                <input className="input" aria-label="Colorant name" placeholder="Colorant name" value={col.name} onChange={(e) => setColorant(col.key, { name: e.target.value })} />
                <button type="button" className="btn btn--icon" aria-label={`Remove ${rowName}`} onClick={() => update({ colorants: scent.colorants.filter((x) => x.key !== col.key) })}>×</button>
                <SegRadioGroup label={`Kind of ${rowName}`} name={`colorant-kind-${col.key}`} options={COLORANT_KINDS} value={col.kind} onChange={(kind) => setColorant(col.key, { kind })} preserveCase />
                <label className="field"><span>% of oils</span>
                  <input className="input" inputMode="decimal" aria-label={`${rowName} % of oils`} placeholder="to shade" value={col.percent} onChange={(e) => setColorant(col.key, { percent: e.target.value })} />
                </label>
                {process !== 'ls' && (
                  <label className="field"><span>Portion</span>
                    <select className="input" aria-label={`${rowName} portion`} value={col.portionKey} onChange={(e) => setColorant(col.key, { portionKey: e.target.value })}>
                      <option value="">Whole batter</option>
                      {scent.portions.map((p) => <option key={p.key} value={p.key}>{p.name.trim() || 'Portion'}</option>)}
                    </select>
                  </label>
                )}
                <div className="additive-list__grams">{c.grams !== null ? formatWeight(c.grams, weightUnit) : 'to shade'}</div>
                <div className="additive-list__stage-fixed">{additiveStageLabel(c.stage, process)}</div>
                <p className="inline-note additive-list__hint">
                  {guidance && <>{guidance} </>}
                  <DispersalLine c={c} unit={weightUnit} />
                  {c.kind !== 'dye' && process === 'ls' && ' Micas and oxides settle in a liquid — shake before use.'}
                </p>
              </li>
            );
          })}
          {computed.carrierOilGrams > 0 && (
            <li className="inline-note">
              The carrier oil is unsaponified oil riding on the recipe: {formatWeight(computed.carrierOilGrams, weightUnit)} adds about {formatGrams(computed.carrierSuperfatShiftPercent, 1)} superfat points.
            </li>
          )}
        </ul>
      )}

      {scent.fragrances.length === 0 && scent.colorants.length === 0 && (
        <p className="results-hint">No fragrance or colour yet. Clays, charcoal, cocoa, botanicals and titanium dioxide are dosed under Additives.</p>
      )}
      <p className="results-hint">{REGULATORY_COPY}</p>
    </section>
  );
});

function FragranceNotes({ c, noun, unit }: { c: ComputedFragrance; noun: string; unit: WeightUnit }) {
  const notes: Array<{ text: string; hazard?: boolean }> = [];
  if (c.overSupplierMax) {
    notes.push({ hazard: true, text: `Over the supplier's rate: ${formatGrams(c.percent ?? 0, 2)}% → ${formatGrams(c.shareOfProduct, 1)}% of the ${noun}; supplier max ${formatGrams(c.supplierMaxPercent ?? 0, 2)}%.` });
  } else if (c.shareOfProduct > 0) {
    notes.push({ text: `${formatGrams(c.percent ?? 0, 2)}% → ${formatGrams(c.shareOfProduct, 1)}% of the ${noun}${c.supplierMaxPercent !== null ? `; supplier max ${formatGrams(c.supplierMaxPercent, 2)}%` : ''}.` });
  }
  if (c.browning !== 'none') {
    notes.push({ text: `Browning: ${c.browning}. Mix ${formatWeight(c.stabilizerGrams, unit)} vanilla stabilizer into the fragrance first.` });
  }
  if (c.caution) notes.push({ hazard: true, text: 'Clove and cinnamon essential oils accelerate trace and can irritate — check the supplier\'s rate closely.' });
  if (c.polysorbateGrams > 0) notes.push({ text: `Mix ${formatWeight(c.polysorbateGrams, unit)} polysorbate 20 into the fragrance so it stays emulsified over the superfat.` });
  if (notes.length === 0) return null;
  return (
    <ul className="additive-list__hazards">
      {notes.map((n, i) => <li key={i} className={n.hazard ? 'additive-list__hazard' : 'inline-note'}>{n.text}</li>)}
    </ul>
  );
}

function DispersalLine({ c, unit }: { c: ComputedColorant; unit: WeightUnit }) {
  const d = c.dispersal;
  if (d.method === 'carrier-oil') {
    return <>{d.carrierGrams !== null ? `Mix 1:1 with a light carrier oil (${formatWeight(d.carrierGrams, unit)}).` : 'Mix 1:1 with a light carrier oil.'}</>;
  }
  if (d.method === 'hot-sugar-water') return <>Disperse in {hpWaterText(unit)}.</>;
  return <>Dissolve in a little warm water.</>;
}
```

Mount in `App.tsx` right after `<AdditivesPanel … />`:

```tsx
            <FragranceColorantsPanel
              scent={scentColor}
              computed={vm.scentColor}
              process={process}
              weightUnit={weightUnit}
              onChange={setScentColor}
            />
```

Renumber: `PropertiesPanel.tsx:92` → `07`; `FattyAcidPanel.tsx:72` and `:127` → `08`; `ResultsPanel.tsx:148, 163, 254` → `09`; `DilutionPanel.tsx:1307` → `10`.

CSS (`packages/web/src/index.css`, next to `.additive-list__*`):

```css
.scent-list__allergens { grid-column: 1 / -1; }
.scent-list__allergens summary { cursor: pointer; font-size: 0.8rem; color: var(--label); }
.scent-list__allergen { display: grid; grid-template-columns: 1fr 8rem auto; gap: 0.4rem; margin-top: 0.4rem; }
```

- [ ] **Step 5: Run, typecheck, and fix the copy until the tests pass**

Run: `npx vitest run packages/web/src/lib/colorantGuidance.test.ts packages/web/src/components/FragranceColorantsPanel.test.tsx && cd packages/web && npx tsc --noEmit && cd ../..`
Expected: PASS. (The over-max note renders "3% → 2.3% of the finished bar; supplier max 2%.")

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/FragranceColorantsPanel.tsx packages/web/src/components/FragranceColorantsPanel.test.tsx packages/web/src/lib/colorantGuidance.ts packages/web/src/lib/colorantGuidance.test.ts packages/web/src/App.tsx packages/web/src/index.css packages/web/src/components/PropertiesPanel.tsx packages/web/src/components/FattyAcidPanel.tsx packages/web/src/components/ResultsPanel.tsx packages/web/src/components/DilutionPanel.tsx
git commit -m "feat(web): the Fragrance & colorants panel, numbered 06 — rows per fragrance and colour, portions, allergens"
```

---

### Task 8: Outputs — Full recipe, Add-in-order steps, batch sheet

**Files:**
- Modify: `packages/web/src/lib/recipeSummary.ts` (FullRecipeInput + buildFullRecipe; AddOrderInput + buildAddOrderSteps; two exported line formatters)
- Modify: `packages/web/src/components/ResultsPanel.tsx:219-250` (pass `scentColor`)
- Modify: `packages/web/src/components/BatchSheet.tsx` (a *Fragrance & colorants* section after *Additives & liquids*)
- Test: `packages/web/src/lib/recipeSummary.test.ts`, `packages/web/src/components/ResultsPanel.test.tsx`, `packages/web/src/components/BatchSheet.test.tsx`

**Interfaces:**
- Consumes: `ComputedScentColor` (Task 6).
- Produces:
  ```ts
  export function fragranceLineDetail(f: ComputedFragrance, unit: WeightUnit, doseLabel: string): string; // "30 g · 3% of oils"
  export function colorantLineDetail(c: ComputedColorant, unit: WeightUnit): string;                       // "4 g · 1% · in 4 g carrier oil" | "to shade · in 7–14 g hot sugar water"
  // FullRecipeInput gains `scentColor?: ComputedScentColor`; AddOrderInput gains `scentColor?: ComputedScentColor`.
  ```

- [ ] **Step 1: Write the failing tests**

Append to `packages/web/src/lib/recipeSummary.test.ts`:

```ts
import { normalizeScentColor } from './scentColor';
import { applyScentColorCompliance, computeScentColorGrams } from './computeScentColor';

const SCENT_CP = applyScentColorCompliance(
  computeScentColorGrams(
    normalizeScentColor({
      fragrances: [{ name: 'Vanilla dream', kind: 'fragrance-oil', percent: '3', supplierMaxPercent: '', vanillinPercent: '12', allergens: [{ name: 'Linalool', percentOfFragrance: '12' }] }],
      colorants: [
        { name: 'Yellow oxide', kind: 'oxide', percent: '1', portionKey: '' },
        { name: 'Blue mica', kind: 'mica', percent: '1', portionKey: 'p0' },
      ],
      portions: [{ key: 'p0', name: 'Swirl', percent: '40' }],
    }),
    { process: 'cp', totalOilGrams: 400, solutionGrams: 0, deliveredSuperfatPercent: 5 },
  ),
  600, 'label',
);

test('Full recipe (CP): base colour inside Oils, portion colours in a Colorants section after trace, Fragrance after that with stabilizer and label allergens', () => {
  const sections = buildFullRecipe({ ...FULL_RECIPE_BASE, scentColor: SCENT_CP });
  const headings = sections.map((s) => s.heading);
  expect(headings.indexOf('Colorants')).toBeGreaterThan(headings.indexOf('Oils'));
  expect(headings.indexOf('Fragrance')).toBe(headings.indexOf('Colorants') + 1);
  const oils = sections.find((s) => s.heading === 'Oils')!;
  expect(oils.items.some((i) => i.name === 'Yellow oxide' && /4 g · 1% · in 4 g carrier oil/.test(i.detail))).toBe(true);
  const colorants = sections.find((s) => s.heading === 'Colorants')!;
  expect(colorants.items[0]).toEqual({ name: 'Swirl — 40%', detail: '' });
  expect(colorants.items[1].name).toBe('Blue mica');
  const fragrance = sections.find((s) => s.heading === 'Fragrance')!;
  expect(fragrance.items.map((i) => i.name)).toEqual(['Vanilla dream', 'Vanilla stabilizer', 'Name on the label']);
  expect(fragrance.items[0].detail).toBe('12 g · 3% of oils');
  expect(fragrance.items[1].detail).toBe('12 g');
  expect(fragrance.items[2].detail).toMatch(/Linalool/);
});

test('Full recipe (HP/LS): the Fragrance section is last; LS colorants sit in the after-dilution slot', () => {
  const ls = applyScentColorCompliance(
    computeScentColorGrams(normalizeScentColor({ fragrances: [{ name: 'Lemon', kind: 'essential-oil', percent: '1', supplierMaxPercent: '', vanillinPercent: '', allergens: [] }], colorants: [{ name: 'Blue dye', kind: 'dye', percent: '', portionKey: '' }], portions: [] }), { process: 'ls', totalOilGrams: 400, solutionGrams: 1200, deliveredSuperfatPercent: 2 }),
    1200, 'solution',
  );
  const sections = buildFullRecipe({ ...FULL_RECIPE_BASE, process: 'ls', lyeType: 'koh', scentColor: ls });
  const headings = sections.map((s) => s.heading);
  expect(headings[headings.length - 1]).toBe('Fragrance');
  expect(sections.find((s) => s.heading === 'Colorants')!.items[0]).toEqual({ name: 'Blue dye', detail: 'to shade · dissolved in a little warm water' });
  expect(sections.find((s) => s.heading === 'Fragrance')!.items.map((i) => i.name)).toEqual(['Lemon', 'Polysorbate 20']);
});

test('Add-in-order steps name the base colour with the oils, the portion split and the fragrance at trace (CP)', () => {
  const steps = buildAddOrderSteps({ ...CP_BASE, scentColor: SCENT_CP });
  expect(steps.find((s) => s.includes('warm to'))).toMatch(/Yellow oxide/);
  const trace = steps.find((s) => s.includes('at trace'))!;
  expect(trace).toMatch(/split the batter — Swirl 40%/i);
  expect(trace).toMatch(/Blue mica/);
  expect(trace).toMatch(/Vanilla dream/);
  expect(trace).toMatch(/stabilizer/);
});

test('HP steps put the fragrance and portion colours after the cook; LS the dyes and fragrance in the dilute step', () => {
  const hp = applyScentColorCompliance(computeScentColorGrams(normalizeScentColor({ fragrances: [{ name: 'Oak', kind: 'fragrance-oil', percent: '3', supplierMaxPercent: '', vanillinPercent: '', allergens: [] }], colorants: [{ name: 'Red oxide', kind: 'oxide', percent: '1', portionKey: 'p' }], portions: [{ key: 'p', name: 'Top', percent: '30' }] }), { process: 'hp', totalOilGrams: 400, solutionGrams: 0, deliveredSuperfatPercent: 3 }), 600, 'label');
  const hpSteps = buildAddOrderSteps({ process: 'hp', lyeType: 'naoh', totalOilGrams: 400, lyeGrams: 56, waterGrams: 130, weightUnit: 'g', scentColor: hp });
  expect(hpSteps.find((s) => s.includes('After the cook'))).toMatch(/Oak.*Red oxide|Red oxide.*Oak/);
  const lsSteps = buildAddOrderSteps({ process: 'ls', lyeType: 'koh', totalOilGrams: 400, lyeGrams: 90, waterGrams: 270, weightUnit: 'g', scentColor: SCENT_CP });
  expect(lsSteps.find((s) => s.includes('Dilute the paste'))).toMatch(/Vanilla dream/);
});
```

Append to `packages/web/src/components/ResultsPanel.test.tsx` — render with a `scentColor` prop and assert `screen.getByText('Fragrance')` and `screen.getByText(/Name on the label/)`; to `packages/web/src/components/BatchSheet.test.tsx` — build data with `scentColor: SCENT_CP`-style computed value and assert `screen.getByText('Fragrance & colorants', { selector: 'h2' })` plus a `Swirl` portion row.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run packages/web/src/lib/recipeSummary.test.ts`
Expected: FAIL — no Colorants/Fragrance sections.

- [ ] **Step 3: Implement**

In `packages/web/src/lib/recipeSummary.ts`:

```ts
import type { ComputedColorant, ComputedFragrance, ComputedScentColor } from './computeScentColor';

export function fragranceLineDetail(f: ComputedFragrance, unit: WeightUnit, doseLabel: string): string {
  return `${formatWeight(f.grams, unit)} · ${formatGrams(f.percent ?? 0, 2)}${doseLabel}`;
}

export function colorantLineDetail(c: ComputedColorant, unit: WeightUnit): string {
  const dose = c.grams !== null ? `${formatWeight(c.grams, unit)} · ${formatGrams(c.percent ?? 0, 2)}%` : 'to shade';
  const d = c.dispersal;
  const how =
    d.method === 'carrier-oil'
      ? d.carrierGrams !== null ? `in ${formatWeight(d.carrierGrams, unit)} carrier oil` : 'in a little carrier oil'
      : d.method === 'hot-sugar-water'
        ? `in ${formatWeight(d.waterGramsLow, unit)}–${formatWeight(d.waterGramsHigh, unit)} hot sugar water`
        : 'dissolved in a little warm water';
  return `${dose} · ${how}`;
}
```

(Note: `formatWeight(7.09,'g')` renders "7 g" and `formatWeight(14.17,'g')` "14 g" → "in 7 g–14 g hot sugar water"; the LS test expects `to shade · dissolved in a little warm water`.)

`FullRecipeInput` gains `scentColor?: ComputedScentColor;`. In `buildFullRecipe`:
- destructure `scentColor`; define `const doseLabel = process === 'ls' ? '% of solution' : '% of oils';`
- whole-batter colorants (`c.stage === 'oils'`) are appended to the Oils section's items (`push('Oils', [...oilItems, ...staged.oils, ...wholeBatterColorants])`) as `{ name: c.name.trim() || 'Colorant', detail: colorantLineDetail(c, weightUnit) }`;
- build `colorantSection`: items grouped by portion — for each portion (in `scentColor.portions` order) with at least one colorant, a header item `{ name: `${portion.name.trim() || 'Portion'} — ${formatGrams(portion.percent ?? 0, 1)}%`, detail: '' }` followed by its colorant items; LS (no portions) lists all colorants plainly;
- build `fragranceSection`: one item per fragrance (`fragranceLineDetail`), then `{ name: 'Vanilla stabilizer', detail: formatWeight(stabilizerGrams) }` when > 0, `{ name: 'Polysorbate 20', detail: … }` when > 0, `{ name: 'Name on the label', detail: labelAllergens.map(a => `${a.name} ${formatGrams(a.percentOfProduct, 3)}%`).join(', ') }` when any;
- slot: CP → push Colorants then Fragrance **immediately after** the `At trace` section (i.e. between `push(additiveStageLabel('trace'…))` and `push(additiveStageLabel('top'…))`); HP and LS → push both **after** the PCSF section (the end). Empty sections are dropped by `push`.

`AddOrderInput` gains `scentColor?: ComputedScentColor;`. In `buildAddOrderSteps`, when building `byStage` names, add the scent rows to their stages so `named()` picks them up:

```ts
  for (const f of scentColor?.fragrances ?? []) {
    if (f.grams > 0) byStage[f.stage].push(f.stabilizerGrams > 0 ? `${f.name.trim() || 'the fragrance'} (stabilizer mixed in)` : f.name.trim() || 'the fragrance');
  }
  for (const c of scentColor?.colorants ?? []) byStage[c.stage].push(c.name.trim() || 'the colorant');
```

and, when `scentColor?.portions.length` and the process is not LS, prefix the trace (CP) / after-cook (HP) step's named list with the split: in `StepContext` add `portionSplit: string | null` = `split the batter — ${portions.map(p => `${p.name || 'portion'} ${formatGrams(p.percent ?? 0, 0)}%`).join(', ')} — colour each, then` and have the CP `trace` step and the HP `after` step read `Stir in ${atTrace}` → `${portionSplit ? portionSplit + ' ' : ''}stir in ${…}` (capitalise the first letter of the result).

`ResultsPanel.tsx`: add prop `scentColor?: ComputedScentColor`, pass it to both `buildFullRecipe` and `buildAddOrderSteps`; `App.tsx` passes `scentColor={vm.scentColor}`.

`BatchSheet.tsx`: after the *Additives & liquids* section:

```tsx
      {(scentColor.fragrances.length > 0 || scentColor.colorants.length > 0) && (
        <section className="batch-sheet__section">
          <h2>Fragrance &amp; colorants</h2>
          <ul className="batch-sheet__list">
            {scentColor.fragrances.map((f) => (
              <li key={f.key}>{f.name.trim() || 'Fragrance'} — {fragranceLineDetail(f, weightUnit, process === 'ls' ? '% of solution' : '% of oils')} ({additiveStageLabel(f.stage, process)})</li>
            ))}
            {scentColor.stabilizerGrams > 0 && <li>Vanilla stabilizer — {formatWeight(scentColor.stabilizerGrams, weightUnit)}, mixed into the fragrance first</li>}
            {scentColor.polysorbateGrams > 0 && <li>Polysorbate 20 — {formatWeight(scentColor.polysorbateGrams, weightUnit)}, mixed into the fragrance</li>}
            {scentColor.colorants.map((c) => (
              <li key={c.key}>{c.name.trim() || 'Colorant'}{c.portionName ? ` (${c.portionName} ${formatGrams(c.portionPercent ?? 0, 0)}%)` : ''} — {colorantLineDetail(c, weightUnit)} ({additiveStageLabel(c.stage, process)})</li>
            ))}
          </ul>
          {scentColor.labelAllergens.length > 0 && (
            <p className="batch-sheet__note">Name on the label: {scentColor.labelAllergens.map((a) => `${a.name} ${formatGrams(a.percentOfProduct, 3)}%`).join(', ')}</p>
          )}
        </section>
      )}
```

(`scentColor` comes from `data` — Task 6 put it on `BatchSheetData`.)

- [ ] **Step 4: Run and typecheck**

Run: `npx vitest run packages/web/src/lib/recipeSummary.test.ts packages/web/src/components/ResultsPanel.test.tsx packages/web/src/components/BatchSheet.test.tsx && cd packages/web && npx tsc --noEmit && cd ../..`
Expected: PASS (the step-plan exhaustiveness test still passes: the new rows map onto existing stages).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/recipeSummary.ts packages/web/src/lib/recipeSummary.test.ts packages/web/src/components/ResultsPanel.tsx packages/web/src/components/ResultsPanel.test.tsx packages/web/src/components/BatchSheet.tsx packages/web/src/components/BatchSheet.test.tsx packages/web/src/App.tsx
git commit -m "feat(web): fragrance and colorants in the Full recipe, the add-in-order steps, and the batch sheet"
```

---

### Task 9: Pricing

**Files:**
- Modify: `packages/web/src/lib/recipePricing.ts` (source + context)
- Modify: `packages/web/src/components/PricingPanel.tsx:103-110` (group)
- Modify: `packages/web/src/App.tsx:245-270` (pass `scentColor: vm.scentColor`)
- Test: `packages/web/src/lib/recipePricing.test.ts`

**Interfaces:**
- Produces: `RecipePricingContext.additives[i].group: 'additive' | 'scent'`; `RecipePricingSource.scentColor?: ComputedScentColor`.

- [ ] **Step 1: Write the failing test**

```ts
// append to packages/web/src/lib/recipePricing.test.ts
it('prices fragrance, colorant, stabilizer, polysorbate and carrier oil under the scent group with stable keys', () => {
  const scent = applyScentColorCompliance(computeScentColorGrams(normalizeScentColor({
    fragrances: [{ name: 'Rose Absolute', kind: 'fragrance-oil', percent: '3', supplierMaxPercent: '', vanillinPercent: '12', allergens: [] }],
    colorants: [{ name: 'Pink Mica', kind: 'mica', percent: '1', portionKey: '' }],
    portions: [],
  }), { process: 'cp', totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 5 }), 1300, 'label');
  const ctx = buildRecipePricingContext({ lines: [], computedAdditives: [], lyeGrams: 0, batchWeightWithExtras: 1000, splitLiquids: [], postCookSuperfat: null, scentColor: scent });
  const scentRows = ctx.additives.filter((a) => a.group === 'scent');
  expect(scentRows.map((a) => [a.catalogId, a.grams])).toEqual([
    ['fragrance:name:rose absolute', 30],
    ['vanilla-stabilizer', 30],
    ['colorant:name:pink mica', 10],
    ['carrier-oil', 10],
  ]);
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run packages/web/src/lib/recipePricing.test.ts`.

- [ ] **Step 3: Implement**

In `recipePricing.ts`: add `group: 'additive' | 'scent'` to the context's additive rows (existing rows get `'additive'`), `scentColor?: ComputedScentColor` to the source, and after the split liquids:

```ts
  const scent = src.scentColor;
  if (scent) {
    const nameKey = (prefix: string, name: string) => `${prefix}:name:${name.trim().toLowerCase() || 'unnamed'}`;
    for (const f of scent.fragrances) if (f.grams > 0) additives.push({ key: `fragrance-${f.key}`, catalogId: nameKey('fragrance', f.name), name: f.name.trim() || 'Fragrance', grams: f.grams, group: 'scent' });
    if (scent.stabilizerGrams > 0) additives.push({ key: 'vanilla-stabilizer', catalogId: 'vanilla-stabilizer', name: 'Vanilla stabilizer', grams: scent.stabilizerGrams, group: 'scent' });
    if (scent.polysorbateGrams > 0) additives.push({ key: 'polysorbate-20', catalogId: 'polysorbate-20', name: 'Polysorbate 20', grams: scent.polysorbateGrams, group: 'scent' });
    for (const c of scent.colorants) if (c.grams !== null && c.grams > 0) additives.push({ key: `colorant-${c.key}`, catalogId: nameKey('colorant', c.name), name: c.name.trim() || 'Colorant', grams: c.grams, group: 'scent' });
    if (scent.carrierOilGrams > 0) additives.push({ key: 'carrier-oil', catalogId: 'carrier-oil', name: 'Carrier oil (colorants)', grams: scent.carrierOilGrams, group: 'scent' });
  }
```

In `PricingPanel.tsx`, render `context.additives.filter(a => a.group !== 'scent')` where the additives map is, then a `<div className="pricing-details__group">Fragrance &amp; colorants</div>` heading followed by the same `priceRow` map over the `'scent'` rows (only when any exist). `App.tsx`: add `scentColor: vm.scentColor` to the pricing source and `vm.scentColor` to the memo deps.

- [ ] **Step 4: Run** — `npx vitest run packages/web/src/lib/recipePricing.test.ts packages/web/src/components/PricingPanel.test.tsx && cd packages/web && npx tsc --noEmit && cd ../..` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(pricing): fragrance and colorant rows priced under their own group"`.

---

### Task 10: Insights

**Files:**
- Modify: `packages/core/src/insights.ts` (input fields + 8 rules)
- Modify: `packages/core/src/insights.test.ts` (cases)
- Modify: `packages/web/src/hooks/useFormulationInsights.ts` (`options.scentColor` → input fields)
- Modify: `packages/web/src/hooks/useRecipeViewModel.ts` (pass `scentColor: scentColorComputed` into the insights options — note the memo order: insights currently run before the compliance memo; move the `useFormulationInsights` call below `scentColorComputed`, or pass the compliance-applied value through a second pass. Simplest: compute `scentColorComputed` before the insights call by moving the labelWeight/bottle memos above it if they have no dependency on insights — verify with `grep -n "useFormulationInsights\|const labelWeight\|const bottledSolutionGrams\|const scentColorComputed"`.)

**Interfaces:**
- `FormulationAnalysisInput` gains:
  ```ts
  fragranceRows?: Array<{ name: string; kind: 'fragrance-oil' | 'essential-oil'; percent: number | null; shareOfProduct: number; supplierMaxPercent: number | null; vanillinPercent: number | null; caution: boolean }>;
  labelAllergens?: Array<{ name: string; percentOfProduct: number }>;
  colorantPortionsOver100?: boolean;
  colorantCarrierShiftPercent?: number;
  ```

- [ ] **Step 1: Write the failing tests** (append to `packages/core/src/insights.test.ts`; the file's `waterInput(waterGrams, totalOilGrams?, extra?)` helper builds a full `FormulationAnalysisInput` with `process: 'cp'` that `extra` overrides — define `codes` on top of it):

```ts
const codes = (extra: Partial<FormulationAnalysisInput>, process: 'cp' | 'hp' | 'ls') =>
  analyzeFormulation(waterInput(330, 1000, { ...extra, process })).map((i) => i.code);
```


```ts
describe('fragrance & colorant insights', () => {
  const row = (over: Partial<NonNullable<FormulationAnalysisInput['fragranceRows']>[number]> = {}) => ({
    name: 'F', kind: 'fragrance-oil' as const, percent: 3, shareOfProduct: 2.3, supplierMaxPercent: 5, vanillinPercent: null, caution: false, ...over,
  });
  it('warns above the supplier rate, informs when no rate is entered', () => {
    expect(codes({ fragranceRows: [row({ shareOfProduct: 5.5 })] }, 'cp')).toContain('fragrance_over_supplier_max');
    expect(codes({ fragranceRows: [row({ supplierMaxPercent: null })] }, 'cp')).toContain('fragrance_no_supplier_rate');
    expect(codes({ fragranceRows: [row()] }, 'cp')).not.toContain('fragrance_over_supplier_max');
  });
  it('browning info above 0% vanillin; EO caution in CP only; allergens; portions over 100', () => {
    expect(codes({ fragranceRows: [row({ vanillinPercent: 12 })] }, 'hp')).toContain('fragrance_vanillin_browning');
    expect(codes({ fragranceRows: [row({ kind: 'essential-oil', caution: true })] }, 'cp')).toContain('fragrance_accelerant_eo');
    expect(codes({ fragranceRows: [row({ kind: 'essential-oil', caution: true })] }, 'hp')).not.toContain('fragrance_accelerant_eo');
    expect(codes({ labelAllergens: [{ name: 'Linalool', percentOfProduct: 0.28 }] }, 'cp')).toContain('fragrance_allergens_to_label');
    expect(codes({ colorantPortionsOver100: true }, 'cp')).toContain('colorant_portions_over_100');
    expect(codes({ colorantCarrierShiftPercent: 1 }, 'cp')).toContain('colorant_carrier_superfat');
    expect(codes({ fragranceRows: [row()] }, 'ls')).toContain('ls_fragrance_clouding');
    expect(codes({ fragranceRows: [row()] }, 'cp')).not.toContain('ls_fragrance_clouding');
  });
});
```


- [ ] **Step 2: Run to verify they fail** — `npx vitest run packages/core/src/insights.test.ts -t "fragrance & colorant"`.

- [ ] **Step 3: Implement the rules** (append to `INSIGHT_RULES`; `check` has the signature `(input, params)` — these rules ignore `params`; messages are behaviour, no sources):

```ts
  {
    code: 'fragrance_over_supplier_max',
    check: (input) => {
      const over = (input.fragranceRows ?? []).filter((f) => f.supplierMaxPercent !== null && f.shareOfProduct > f.supplierMaxPercent);
      if (over.length === 0) return null;
      return { level: 'warning', code: 'fragrance_over_supplier_max', message: `${over.map((f) => f.name || 'A fragrance').join(', ')} exceeds the supplier's tested rate in the finished soap — lower the dose.` };
    },
  },
  {
    code: 'fragrance_no_supplier_rate',
    check: (input) => {
      const missing = (input.fragranceRows ?? []).filter((f) => f.percent !== null && f.percent > 0 && f.supplierMaxPercent === null);
      if (missing.length === 0) return null;
      return { level: 'info', code: 'fragrance_no_supplier_rate', message: 'Enter each fragrance\'s supplier rate for soap (Category 9) so the dose can be checked against it.' };
    },
  },
  {
    code: 'fragrance_vanillin_browning',
    check: (input) => {
      const rows = (input.fragranceRows ?? []).filter((f) => f.vanillinPercent !== null && f.vanillinPercent > 0);
      if (rows.length === 0) return null;
      const deep = rows.some((f) => (f.vanillinPercent ?? 0) > 1);
      return { level: 'info', code: 'fragrance_vanillin_browning', message: deep ? 'Vanillin above 1% browns the soap deeply over time — plan the colour around it or use a vanilla stabilizer.' : 'A little vanillin tans the soap over weeks — expected, not a defect.' };
    },
  },
  {
    code: 'fragrance_accelerant_eo',
    processes: ['cp'],
    check: (input) => ((input.fragranceRows ?? []).some((f) => f.caution)
      ? { level: 'info', code: 'fragrance_accelerant_eo', message: 'Clove and cinnamon essential oils speed trace and can irritate skin — soap cool, add them last, and keep to the supplier\'s rate.' }
      : null),
  },
  {
    code: 'fragrance_allergens_to_label',
    check: (input) => {
      const list = input.labelAllergens ?? [];
      if (list.length === 0) return null;
      return { level: 'info', code: 'fragrance_allergens_to_label', message: `Name on the label: ${list.map((a) => a.name).join(', ')} — each is above 0.01% of the finished soap.` };
    },
  },
  {
    code: 'colorant_portions_over_100',
    check: (input) => (input.colorantPortionsOver100
      ? { level: 'warning', code: 'colorant_portions_over_100', message: 'The batter portions add up to more than 100% — trim them so each colour gets the share you mean.' }
      : null),
  },
  {
    code: 'colorant_carrier_superfat',
    processes: ['cp'],
    check: (input) => ((input.colorantCarrierShiftPercent ?? 0) >= 0.5
      ? { level: 'info', code: 'colorant_carrier_superfat', message: `The colorants' carrier oil adds about ${input.colorantCarrierShiftPercent!.toFixed(1)} superfat points — unsaponified oil riding on the recipe.` }
      : null),
  },
  {
    code: 'ls_fragrance_clouding',
    processes: ['ls'],
    check: (input) => ((input.fragranceRows ?? []).some((f) => f.percent !== null && f.percent > 0)
      ? { level: 'info', code: 'ls_fragrance_clouding', message: 'Most fragrances cloud liquid soap a little — prove a new one in a small test solution; polysorbate 20 keeps it emulsified over a superfat.' }
      : null),
  },
```

In `useFormulationInsights.ts`, add `scentColor?: ComputedScentColor` to `FormulationInsightOptions` and map it into the analysis input:

```ts
      fragranceRows: options.scentColor?.fragrances.map((f) => ({ name: f.name, kind: f.kind, percent: f.percent, shareOfProduct: f.shareOfProduct, supplierMaxPercent: f.supplierMaxPercent, vanillinPercent: f.vanillinPercent, caution: f.caution })),
      labelAllergens: options.scentColor?.labelAllergens,
      colorantPortionsOver100: options.scentColor?.portionsOver100,
      colorantCarrierShiftPercent: options.scentColor?.carrierSuperfatShiftPercent,
```


- [ ] **Step 4: Run** — `npx vitest run packages/core/src/insights.test.ts packages/web/src/hooks/useFormulationInsights.test.ts && cd packages/core && npx tsc --noEmit && cd ../web && npx tsc --noEmit && cd ../..` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(insights): fragrance dose/allergen/browning and colorant portion/carrier insights"`.

---

### Task 11: End-to-end, full verification

**Files:**
- Modify: `packages/web/e2e/exploratory.spec.ts` (three tests)

- [ ] **Step 1: Write the tests** (add a `test.describe('fragrance & colorants', …)` block; `processTab` and `expect` are already in the file):

```ts
test.describe('fragrance & colorants', () => {
  test('CP: a vanillin fragrance with an allergen and a two-portion colour split land in the Full recipe', async ({ page }) => {
    await page.getByRole('button', { name: /add fragrance/i }).click();
    await page.getByLabel('Fragrance name').fill('Vanilla dream');
    await page.getByLabel(/Vanilla dream % of oils/).fill('3');
    await page.getByLabel(/Vanilla dream supplier max/).fill('5');
    await page.getByLabel(/Vanilla dream vanillin/).fill('12');
    await page.getByText(/Allergens \(0\)/).click();
    await page.getByRole('button', { name: /add allergen/i }).click();
    await page.getByLabel('Allergen name').fill('Linalool');
    await page.getByLabel('Allergen % of fragrance').fill('12');
    await page.getByRole('button', { name: /split the batter/i }).click();
    await page.getByLabel('Portion name').fill('Swirl');
    await page.getByLabel(/Portion Swirl % of batter/).fill('40');
    await page.getByRole('button', { name: /add colorant/i }).click();
    await page.getByLabel('Colorant name').fill('Blue mica');
    await page.getByLabel(/Blue mica % of oils/).fill('1');
    await page.getByLabel(/Blue mica portion/).selectOption({ label: 'Swirl' });
    const section = (h: string) => page.locator('.results-recipe__section').filter({ has: page.locator('.results-recipe__heading', { hasText: h }) });
    await expect(section('Colorants')).toContainText(/Swirl — 40%/);
    await expect(section('Colorants')).toContainText(/Blue mica/);
    await expect(section('Fragrance')).toContainText(/Vanilla dream/);
    await expect(section('Fragrance')).toContainText(/Vanilla stabilizer/);
    await expect(section('Fragrance')).toContainText(/Linalool/);
  });

  test('HP: the fragrance is filed after the cook', async ({ page }) => {
    await processTab(page, /Hot process/).click();
    await page.getByRole('button', { name: /add fragrance/i }).click();
    await page.getByLabel(/Fragrance % of oils/).fill('3');
    await expect(page.locator('.results-recipe__section').filter({ has: page.locator('.results-recipe__heading', { hasText: 'Fragrance' } ) })).toBeVisible();
    await expect(page.locator('.panel', { hasText: 'Fragrance & colorants' })).toContainText('After cook');
  });

  test('LS: the dose is a % of solution and a dye goes in after dilution', async ({ page }) => {
    await processTab(page, /Liquid soap/).click();
    await page.getByRole('button', { name: /add colorant/i }).click();
    await expect(page.locator('.panel', { hasText: 'Fragrance & colorants' })).toContainText('After dilution');
    await page.getByRole('button', { name: /add fragrance/i }).click();
    await expect(page.getByLabel(/Fragrance % of solution/)).toBeVisible();
    await expect(page.getByRole('button', { name: /split the batter/i })).toHaveCount(0);
  });
});
```

(Adjust the exact accessible names to what Task 7 rendered — `aria-label={`${rowName} ${doseLabel}`}` with an empty name gives "Fragrance % of oils"; the mica row with a name gives "Blue mica % of oils".)

- [ ] **Step 2: Run the three tests** — `cd packages/web && npx playwright test -g "fragrance & colorants" && cd ../..` → PASS (fix selectors against the rendered DOM if a locator misses; do not weaken assertions).

- [ ] **Step 3: Full verification**

Run from the repo root:
```bash
npm test
npm run -ws typecheck --if-present
cd packages/web && npx playwright test && cd ../..
```
Expected: all green.

- [ ] **Step 4: Commit and report**

```bash
git add packages/web/e2e/exploratory.spec.ts
git commit -m "test(e2e): fragrance & colorants per process"
```

Then run `/code-review` on the branch (the user reviews every feature this way) before pushing.
