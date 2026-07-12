# Bar Properties Radar + Unitless Scores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six per-property meter bars in the Bar properties panel with an SVG radar chart, switch property values from `%` to unitless whole-number scores, and rename the misspelled fatty-acid key `docosenoid` → `docosenoic`.

**Architecture:** Pure display/formatting helpers live in `@soap-calc/core`; radar geometry is a pure function in `@soap-calc/web/lib` with an `aria-hidden` SVG component consuming it; the PropertiesPanel keeps its existing class hooks and coverage/estimate semantics so the e2e regression test passes unmodified. The `docosenoid` rename touches core's acid lists plus a build-time normalization map in oils-data, then regenerates the canonical data.

**Tech Stack:** TypeScript, React 18, Vite, Vitest, Testing Library, Playwright. Monorepo via npm workspaces; run all commands from repo root `/Users/str/soap-calc`.

## Global Constraints

- Run all commands from the repo root `/Users/str/soap-calc`.
- `@soap-calc/core` is pure math/formatting — no React, no DOM, no I/O.
- No new runtime dependencies — the radar is hand-rolled SVG (no chart library).
- Property scores are unitless 0–100 (no `%`). Fatty-acid percentages keep `%`.
- Preserve existing CSS class names `.property-bars__value` and `.property-bars__value--outside` and the `.properties-coverage` caption wording — the Playwright test `packages/web/e2e/recipe-ui.spec.ts` asserts on them and must pass unmodified.
- The `~` low-coverage prefix and the "outside suppressed under low coverage" rule are unchanged.
- Do not auto-commit beyond the per-task commits in this plan; do not push.
- `SOAP_PROPERTY_GUIDE` (suggested) and `FORMULATION_PREFERENCE_GUIDE` (balanced target) are the range sources; `PROPERTY_ORDER` in PropertiesPanel is `['hardness','cleansing','condition','creamy','bubbly','longevity']`.

---

### Task 1: Unitless score formatters in core

**Files:**
- Modify: `packages/core/src/property-display.ts`
- Create: `packages/core/src/property-display.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `formatPropertyScore(value: number): string` — rounds to a whole number, no suffix (`40.9 → "41"`).
  - `formatPropertyScoreRange(low: number, high: number): string` — `"29–54"` (en dash, no `%`).
  - Existing `formatSoapPropertyPercent` and `formatPropertyRangePercent` remain unchanged and exported.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/property-display.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  formatPropertyScore,
  formatPropertyScoreRange,
  formatSoapPropertyPercent,
} from './property-display.js';

describe('formatPropertyScore', () => {
  it('rounds to a whole number with no unit', () => {
    expect(formatPropertyScore(40.9)).toBe('41');
    expect(formatPropertyScore(16.8)).toBe('17');
    expect(formatPropertyScore(0)).toBe('0');
  });
});

describe('formatPropertyScoreRange', () => {
  it('formats a range with an en dash and no unit', () => {
    expect(formatPropertyScoreRange(29, 54)).toBe('29–54');
  });
});

describe('formatSoapPropertyPercent (unchanged)', () => {
  it('still appends %', () => {
    expect(formatSoapPropertyPercent(16.8)).toBe('16.8%');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @soap-calc/core -- property-display`
Expected: FAIL — `formatPropertyScore` / `formatPropertyScoreRange` not exported.

- [ ] **Step 3: Add the formatters**

Append to `packages/core/src/property-display.ts`:

```typescript
/** Bar-property scores are unitless fatty-acid sums on a 0–100 scale. */
export function formatPropertyScore(value: number): string {
  return String(Math.round(value));
}

export function formatPropertyScoreRange(low: number, high: number): string {
  return `${Math.round(low)}–${Math.round(high)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @soap-calc/core -- property-display`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/property-display.ts packages/core/src/property-display.test.ts
git commit -m "feat(core): add unitless bar-property score formatters"
```

---

### Task 2: Rename docosenoid → docosenoic (core lists + build normalization + regenerate)

**Files:**
- Modify: `packages/core/src/fatty-acids.ts:70-79` (`UNSATURATED_ACIDS`)
- Modify: `packages/core/src/properties.ts:16-27` (`SOAP_PROPERTY_FATTY_ACIDS.condition`)
- Modify: `packages/oils-data/scripts/build-canonical.ts:49-57` (`parseBreakdown`)
- Test: `packages/core/src/properties.test.ts` (add a case)
- Regenerate: `packages/oils-data/data/canonical-oils.json`, `canonical-oils-lite.json`, `build-report.json`

**Interfaces:**
- Consumes: nothing new.
- Produces: canonical data whose fatty-acid profiles use the key `docosenoic` (never `docosenoid`); core acid lists reference `docosenoic`.

**Context:** the legacy source `soap_oils.json` has one entry with `"docosenoid": 16` (meadowfoam). The build copies breakdowns verbatim via `parseBreakdown`. Renaming the core lists alone would silently drop meadowfoam's 16% from conditioning, so the build must normalize the legacy key.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/properties.test.ts` (inside the existing `describe('oilPropertiesFromFattyAcids', …)` block or a new one):

```typescript
import { oilPropertiesFromFattyAcids } from './properties.js';

describe('conditioning includes docosenoic (corrected spelling)', () => {
  it('counts docosenoic toward conditioning', () => {
    const props = oilPropertiesFromFattyAcids({ oleic: 10, docosenoic: 16 });
    expect(props.condition).toBe(26);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @soap-calc/core -- properties`
Expected: FAIL — `condition` is 10 (the `docosenoic` key isn't in the list yet, only `docosenoid`).

- [ ] **Step 3: Rename in core acid lists**

In `packages/core/src/fatty-acids.ts`, change the `UNSATURATED_ACIDS` entry `'docosenoid',` to `'docosenoic',`.

In `packages/core/src/properties.ts`, in `SOAP_PROPERTY_FATTY_ACIDS.condition`, change `'docosenoid',` to `'docosenoic',`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @soap-calc/core -- properties`
Expected: PASS.

- [ ] **Step 5: Normalize the legacy key in the build**

In `packages/oils-data/scripts/build-canonical.ts`, replace `parseBreakdown` (lines 49-57) with a version that renames the misspelled key:

```typescript
/** Legacy source used the misspelling "docosenoid"; canonical data uses "docosenoic". */
const FATTY_ACID_KEY_ALIASES: Record<string, string> = {
  docosenoid: 'docosenoic',
};

function normalizeFattyAcidKeys(
  profile: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(profile)) {
    out[FATTY_ACID_KEY_ALIASES[key] ?? key] = value;
  }
  return out;
}

function parseBreakdown(raw: LegacyOil['breakdown']): Record<string, number> | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'object') return normalizeFattyAcidKeys(raw);
  try {
    return normalizeFattyAcidKeys(JSON.parse(raw) as Record<string, number>);
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 6: Regenerate and validate the oils data**

Run:
```bash
npm run build:oils && npm run validate:oils
```
Expected: build completes, validate passes. Then confirm the key flipped:
```bash
grep -c docosenoid packages/oils-data/data/canonical-oils-lite.json
grep -c docosenoic packages/oils-data/data/canonical-oils-lite.json
```
Expected: `docosenoid` count `0`, `docosenoic` count `1` (or more).

If the regenerated JSON differs only by the `generatedAt` timestamp beyond the key rename, that is expected (the build stamps time); keep the regenerated files.

- [ ] **Step 7: Run the full core + oils-data suites**

Run: `npm run test -w @soap-calc/core && npm run test -w @soap-calc/oils-data`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/fatty-acids.ts packages/core/src/properties.ts \
  packages/core/src/properties.test.ts \
  packages/oils-data/scripts/build-canonical.ts packages/oils-data/data
git commit -m "fix(data): rename fatty-acid key docosenoid -> docosenoic"
```

---

### Task 3: Radar geometry helper (pure)

**Files:**
- Create: `packages/web/src/lib/radarGeometry.ts`
- Create: `packages/web/src/lib/radarGeometry.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Point = { x: number; y: number }`
  - `radarPoint(index: number, count: number, value: number, radius: number, center: number): Point` — value clamped to `[0, 100]`, angle starts at 12 o'clock (`-90°`) and goes clockwise, `value` scaled so 100 maps to `radius`.
  - `polygonPoints(values: number[], radius: number, center: number): string` — an SVG `points` string for a `<polygon>` (one vertex per value).
  - `ringPath(lows: number[], highs: number[], radius: number, center: number): string` — an SVG path `d` for the suggested-range band: the highs polygon followed by the lows polygon reversed, so `fill-rule="evenodd"` cuts the hole.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/lib/radarGeometry.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { radarPoint, polygonPoints, ringPath } from './radarGeometry';

describe('radarPoint', () => {
  it('places the first axis at 12 o\'clock (straight up)', () => {
    const p = radarPoint(0, 6, 100, 50, 60);
    expect(p.x).toBeCloseTo(60, 5); // centered horizontally
    expect(p.y).toBeCloseTo(10, 5); // center(60) - radius(50)
  });

  it('scales value 0..100 to 0..radius', () => {
    const zero = radarPoint(0, 6, 0, 50, 60);
    expect(zero.x).toBeCloseTo(60, 5);
    expect(zero.y).toBeCloseTo(60, 5); // at center
  });

  it('clamps out-of-range values', () => {
    const over = radarPoint(0, 6, 250, 50, 60);
    const at100 = radarPoint(0, 6, 100, 50, 60);
    expect(over).toEqual(at100);
    const under = radarPoint(0, 6, -50, 50, 60);
    const at0 = radarPoint(0, 6, 0, 50, 60);
    expect(under).toEqual(at0);
  });
});

describe('polygonPoints', () => {
  it('emits one "x,y" pair per value', () => {
    const pts = polygonPoints([100, 100, 100, 100, 100, 100], 50, 60);
    expect(pts.split(' ')).toHaveLength(6);
  });
});

describe('ringPath', () => {
  it('produces a two-subpath (M…Z M…Z) path for evenodd fill', () => {
    const d = ringPath([10, 10, 10, 10, 10, 10], [90, 90, 90, 90, 90, 90], 50, 60);
    expect((d.match(/M/g) ?? []).length).toBe(2);
    expect((d.match(/Z/g) ?? []).length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @soap-calc/web -- radarGeometry`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `packages/web/src/lib/radarGeometry.ts`:

```typescript
export type Point = { x: number; y: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Axis `index` of `count`, `value` on a 0–100 scale, placed on a circle of `radius`
 * around `center`. Axis 0 points straight up; axes proceed clockwise. */
export function radarPoint(
  index: number,
  count: number,
  value: number,
  radius: number,
  center: number,
): Point {
  const scaled = (clamp(value, 0, 100) / 100) * radius;
  const angle = -Math.PI / 2 + (index / count) * 2 * Math.PI;
  return {
    x: center + scaled * Math.cos(angle),
    y: center + scaled * Math.sin(angle),
  };
}

export function polygonPoints(values: number[], radius: number, center: number): string {
  return values
    .map((v, i) => {
      const p = radarPoint(i, values.length, v, radius, center);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    })
    .join(' ');
}

/** Suggested-range band: highs polygon plus lows polygon reversed, so an
 * evenodd fill leaves a hole in the middle. */
export function ringPath(
  lows: number[],
  highs: number[],
  radius: number,
  center: number,
): string {
  const toSubpath = (values: number[]): string => {
    const pts = values.map((v, i) => radarPoint(i, values.length, v, radius, center));
    const [head, ...rest] = pts;
    return `M ${head.x.toFixed(2)} ${head.y.toFixed(2)} ${rest
      .map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ')} Z`;
  };
  return `${toSubpath(highs)} ${toSubpath([...lows].reverse())}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @soap-calc/web -- radarGeometry`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/radarGeometry.ts packages/web/src/lib/radarGeometry.test.ts
git commit -m "feat(web): add radar geometry helper"
```

---

### Task 4: PropertyRadar SVG component

**Files:**
- Create: `packages/web/src/components/PropertyRadar.tsx`
- Create: `packages/web/src/components/PropertyRadar.test.tsx`
- Modify: `packages/web/src/index.css` (append radar styles)

**Interfaces:**
- Consumes: `radarPoint`, `polygonPoints`, `ringPath` (Task 3); `SOAP_PROPERTY_GUIDE`, `SOAP_PROPERTY_LABELS`, `SoapProperties`, `SoapPropertyName` from `@soap-calc/core`.
- Produces: `PropertyRadar({ properties, order, lowCoverage }: PropertyRadarProps)` where
  - `properties: SoapProperties` (non-null; parent guards),
  - `order: SoapPropertyName[]`,
  - `lowCoverage: boolean`.
  Renders an `aria-hidden` `<svg>`. Recipe polygon carries `data-testid="radar-recipe"` and, when `lowCoverage`, the CSS class `property-radar__recipe--estimated`.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/components/PropertyRadar.test.tsx`:

```typescript
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { PropertyRadar } from './PropertyRadar';
import type { SoapPropertyName } from '@soap-calc/core';

afterEach(cleanup);

const ORDER: SoapPropertyName[] = [
  'hardness', 'cleansing', 'condition', 'creamy', 'bubbly', 'longevity',
];
const PROPS = {
  hardness: 41, cleansing: 17, condition: 56, creamy: 24, bubbly: 17, longevity: 24,
};

test('renders an aria-hidden svg with a recipe polygon', () => {
  const { container } = render(
    <PropertyRadar properties={PROPS} order={ORDER} lowCoverage={false} />,
  );
  const svg = container.querySelector('svg');
  expect(svg?.getAttribute('aria-hidden')).toBe('true');
  expect(container.querySelector('[data-testid="radar-recipe"]')).toBeTruthy();
});

test('marks the recipe polygon estimated under low coverage', () => {
  const { container } = render(
    <PropertyRadar properties={PROPS} order={ORDER} lowCoverage />,
  );
  const recipe = container.querySelector('[data-testid="radar-recipe"]');
  expect(recipe?.getAttribute('class')).toContain('property-radar__recipe--estimated');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @soap-calc/web -- PropertyRadar`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `packages/web/src/components/PropertyRadar.tsx`:

```typescript
import { SOAP_PROPERTY_GUIDE, SOAP_PROPERTY_LABELS } from '@soap-calc/core';
import type { SoapProperties, SoapPropertyName } from '@soap-calc/core';
import { polygonPoints, radarPoint, ringPath } from '../lib/radarGeometry';

type PropertyRadarProps = {
  properties: SoapProperties;
  order: SoapPropertyName[];
  lowCoverage: boolean;
};

const SIZE = 220;
const CENTER = SIZE / 2;
const RADIUS = 78; // leaves room for axis labels inside the viewBox
const RINGS = [100, 66, 33];

/** Short axis labels for the narrow sidebar. */
const SHORT_LABEL: Partial<Record<SoapPropertyName, string>> = {
  condition: 'Conditioning',
  bubbly: 'Bubbly',
  creamy: 'Creamy',
};

export function PropertyRadar({ properties, order, lowCoverage }: PropertyRadarProps) {
  const values = order.map((key) => properties[key]);
  const lows = order.map((key) => SOAP_PROPERTY_GUIDE[key].low);
  const highs = order.map((key) => SOAP_PROPERTY_GUIDE[key].high);

  return (
    <svg
      className="property-radar"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="presentation"
      aria-hidden="true"
    >
      {/* grid rings */}
      {RINGS.map((r) => (
        <polygon
          key={r}
          className="property-radar__grid"
          points={polygonPoints(order.map(() => r), RADIUS, CENTER)}
        />
      ))}
      {/* axis spokes + labels */}
      {order.map((key, i) => {
        const tip = radarPoint(i, order.length, 100, RADIUS, CENTER);
        const label = radarPoint(i, order.length, 122, RADIUS, CENTER);
        return (
          <g key={key}>
            <line
              className="property-radar__spoke"
              x1={CENTER}
              y1={CENTER}
              x2={tip.x}
              y2={tip.y}
            />
            <text
              className="property-radar__axis-label"
              x={label.x}
              y={label.y}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {SHORT_LABEL[key] ?? SOAP_PROPERTY_LABELS[key]}
            </text>
          </g>
        );
      })}
      {/* suggested-range band */}
      <path
        className="property-radar__band"
        d={ringPath(lows, highs, RADIUS, CENTER)}
        fillRule="evenodd"
      />
      {/* recipe polygon */}
      <polygon
        data-testid="radar-recipe"
        className={`property-radar__recipe${lowCoverage ? ' property-radar__recipe--estimated' : ''}`}
        points={polygonPoints(values, RADIUS, CENTER)}
      />
      {/* recipe vertices */}
      {values.map((v, i) => {
        const p = radarPoint(i, order.length, v, RADIUS, CENTER);
        return <circle key={order[i]} className="property-radar__vertex" cx={p.x} cy={p.y} r={2.5} />;
      })}
    </svg>
  );
}
```

- [ ] **Step 4: Append the radar styles**

Append to `packages/web/src/index.css`:

```css
.property-radar {
  display: block;
  width: 100%;
  max-width: 260px;
  margin: 0 auto 0.5rem;
  overflow: visible;
}

.property-radar__grid {
  fill: none;
  stroke: var(--border);
  stroke-width: 1;
}

.property-radar__spoke {
  stroke: var(--border);
  stroke-width: 1;
}

.property-radar__axis-label {
  font-size: 9px;
  fill: var(--text-muted);
}

.property-radar__band {
  fill: rgb(13 107 92 / 14%);
  stroke: none;
}

.property-radar__recipe {
  fill: rgb(13 107 92 / 20%);
  stroke: var(--accent);
  stroke-width: 2;
}

.property-radar__recipe--estimated {
  stroke-dasharray: 4 3;
}

.property-radar__vertex {
  fill: var(--accent);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -w @soap-calc/web -- PropertyRadar`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/PropertyRadar.tsx \
  packages/web/src/components/PropertyRadar.test.tsx packages/web/src/index.css
git commit -m "feat(web): add PropertyRadar SVG chart component"
```

---

### Task 5: Rebuild the Properties panel (radar + unitless compact rows)

**Files:**
- Modify: `packages/web/src/components/PropertiesPanel.tsx`
- Modify: `packages/web/src/index.css` (adjust `.property-bars*`, drop the meter track/fill/legend usage that no longer renders — leave the class definitions in place if any test needs them; none does)
- Create: `packages/web/src/components/PropertiesPanel.test.tsx`

**Interfaces:**
- Consumes: `PropertyRadar` (Task 4); `formatPropertyScore`, `formatPropertyScoreRange` (Task 1); existing `SOAP_PROPERTY_GUIDE`, `FORMULATION_PREFERENCE_GUIDE`, `SOAP_PROPERTY_LABELS`, `IODINE_GUIDE`, `INS_GUIDE`, `LOW_COVERAGE_PERCENT`.
- Produces: unchanged public prop shape `PropertiesPanel({ result, indexes })`.

**Behavior to preserve exactly:**
- Iodine/INS block above the radar, unitless (already is), with the same `~` low-coverage prefix and coverage caption wording.
- Empty state (`!result.properties`) renders the existing "Add triglyceride oils…" hint and no radar.
- Coverage caption uses the exact strings "Based on" / "Estimated from" and "N% of recipe oils" plus the "(no data: …)" list.
- Each property row keeps `.property-bars__value` and applies `.property-bars__value--outside` when the value is outside `SOAP_PROPERTY_GUIDE[key]` AND `!lowCoverage`.
- Each row exposes `role="meter"` with `aria-valuemin=0`, `aria-valuemax=100` (`SCALE_MAX`), `aria-valuenow` = rounded value, and an aria-label `"<label>: [estimated ]<score>"`.
- Panel subtitle text becomes "Fatty-acid based scores, 0–100 scale".

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/components/PropertiesPanel.test.tsx`:

```typescript
// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { PropertiesPanel } from './PropertiesPanel';
import type { RecipeIndexResult } from '../lib/calculateRecipeIndexes';

afterEach(cleanup);

const FULL = {
  properties: {
    properties: { hardness: 41, cleansing: 17, condition: 56, creamy: 24, bubbly: 17, longevity: 24 },
    coveragePercent: 100,
    missingOilIds: [],
  },
  indexes: { iodine: 58, ins: 147, coveragePercent: 100, missingOilIds: [] } as RecipeIndexResult,
};

test('renders scores as unitless numbers (no % on property rows)', () => {
  render(<PropertiesPanel result={FULL.properties} indexes={FULL.indexes} />);
  const hardness = screen.getByRole('meter', { name: /Hardness/i });
  expect(within(hardness).queryByText(/%/)).toBeNull();
  expect(screen.getByText('41')).toBeTruthy();
});

test('flags an out-of-range score and suppresses it under low coverage', () => {
  const outOfRange = {
    properties: {
      // cleansing 30 is above the 12–22 suggested band
      properties: { hardness: 41, cleansing: 30, condition: 56, creamy: 24, bubbly: 17, longevity: 24 },
      coveragePercent: 100,
      missingOilIds: [],
    },
    indexes: FULL.indexes,
  };
  const { rerender, container } = render(
    <PropertiesPanel result={outOfRange.properties} indexes={outOfRange.indexes} />,
  );
  expect(container.querySelectorAll('.property-bars__value--outside').length).toBeGreaterThan(0);

  rerender(
    <PropertiesPanel
      result={{ ...outOfRange.properties, coveragePercent: 60 }}
      indexes={{ ...outOfRange.indexes, coveragePercent: 60 }}
    />,
  );
  expect(container.querySelectorAll('.property-bars__value--outside').length).toBe(0);
});

test('renders no radar and a hint when there is no property data', () => {
  const empty = {
    properties: { properties: null, coveragePercent: 0, missingOilIds: [] },
    indexes: { iodine: null, ins: null, coveragePercent: 0, missingOilIds: [] } as RecipeIndexResult,
  };
  const { container } = render(<PropertiesPanel result={empty.properties} indexes={empty.indexes} />);
  expect(container.querySelector('.property-radar')).toBeNull();
  expect(screen.getByText(/Add triglyceride oils/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @soap-calc/web -- PropertiesPanel`
Expected: FAIL — panel still renders `%` and has no radar / behavior differs.

- [ ] **Step 3: Rewrite the panel body**

In `packages/web/src/components/PropertiesPanel.tsx`:

1. Update imports:

```typescript
import { memo } from 'react';
import type { RecipePropertiesResult, SoapPropertyName } from '@soap-calc/core';
import {
  FORMULATION_PREFERENCE_GUIDE,
  formatPropertyScore,
  formatPropertyScoreRange,
  IODINE_GUIDE,
  INS_GUIDE,
  LOW_COVERAGE_PERCENT,
  SOAP_PROPERTY_GUIDE,
  SOAP_PROPERTY_LABELS,
} from '@soap-calc/core';
import type { RecipeIndexResult } from '../lib/calculateRecipeIndexes';
import { oilById } from '../lib/oils';
import { InfoTip } from './InfoTip';
import { PropertyRadar } from './PropertyRadar';
```

2. Keep `PROPERTY_ORDER`, `SCALE_MAX`, and the `memo(function PropertiesPanel(...))` wrapper. Keep the Iodine/INS block and the coverage caption exactly as they are.

3. Update the subtitle line to:

```tsx
<p className="panel__subtitle">Fatty-acid based scores, 0–100 scale</p>
```

4. Replace the `<ul className="property-bars">…</ul>` block (the meter-bar list) with the radar plus compact rows:

```tsx
<PropertyRadar
  properties={result.properties}
  order={PROPERTY_ORDER}
  lowCoverage={lowCoverage}
/>

<ul className="property-bars" aria-label="Soap bar properties">
  {PROPERTY_ORDER.map((key) => {
    const value = result.properties![key];
    const guide = SOAP_PROPERTY_GUIDE[key];
    const preference = FORMULATION_PREFERENCE_GUIDE[key];
    const inSuggested = value >= guide.low && value <= guide.high;
    return (
      <li key={key} className="property-bars__row">
        <div className="property-bars__label">
          <span>{SOAP_PROPERTY_LABELS[key]}</span>
          <span
            className={`property-bars__value${inSuggested || lowCoverage ? '' : ' property-bars__value--outside'}`}
            role="meter"
            aria-valuemin={0}
            aria-valuemax={SCALE_MAX}
            aria-valuenow={Math.round(value)}
            aria-label={`${SOAP_PROPERTY_LABELS[key]}: ${lowCoverage ? 'estimated ' : ''}${formatPropertyScore(value)}`}
          >
            {lowCoverage ? '~' : ''}
            {formatPropertyScore(value)}
          </span>
        </div>
        <p className="property-bars__range">
          Suggested {formatPropertyScoreRange(guide.low, guide.high)}
          {preference && (
            <>
              {' · '}
              Target {formatPropertyScoreRange(preference.low, preference.high)}
            </>
          )}
        </p>
      </li>
    );
  })}
</ul>

<p className="property-legend">
  <span className="property-legend__swatch property-legend__swatch--suggested" />
  Shaded band on the chart = suggested range
</p>
```

Note: `role="meter"` moves onto the score `<span>` (the old meter track div is gone). The out-of-range class and the `role="meter"` live on the same element — that is fine.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @soap-calc/web -- PropertiesPanel`
Expected: PASS.

- [ ] **Step 5: Run the e2e regression test**

Run: `npm run test:e2e -w @soap-calc/web`
Expected: all 7 pass — in particular "property panel marks low-coverage recipes as estimated, no false out-of-range flag" (it asserts `.property-bars__value` contains `~` and `.property-bars__value--outside` count is 0 under low coverage).

If the e2e for coverage wording fails, confirm the `.properties-coverage` caption strings were left untouched.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/PropertiesPanel.tsx \
  packages/web/src/components/PropertiesPanel.test.tsx packages/web/src/index.css
git commit -m "feat(web): radar + unitless compact rows in Properties panel"
```

---

### Task 6: Unitless property scores on the batch sheet

**Files:**
- Modify: `packages/web/src/components/BatchSheet.tsx` (the "Estimated bar properties" `<dl>`, ~lines 282-300)
- Modify: `packages/web/src/components/BatchSheet.test.tsx` (add an assertion; existing tests use `properties: null` so are unaffected)

**Interfaces:**
- Consumes: `formatPropertyScore` (Task 1).
- Produces: no new exports.

**Scope:** switch ONLY the six property `<dd>`s (hardness, cleansing, condition, bubbly, creamy) to `formatPropertyScore`. Leave the Saturated/Unsaturated fatty-acid line using `formatSoapPropertyPercent` (those are true percentages). Iodine/INS use `formatBatchSheetProperty` already — leave them.

- [ ] **Step 1: Write the failing test**

Add to `packages/web/src/components/BatchSheet.test.tsx`:

```typescript
test('prints bar-property scores without a percent sign', () => {
  const lines = createStarterLines();
  const { result, displayTotals, linePercents } = calculateRecipe(lines, DEFAULT_SETTINGS);
  if (!result || !displayTotals) throw new Error('expected a valid calculation');

  const data = buildBatchSheetData({
    recipeName: 'Scores batch',
    batchNotes: '',
    weightUnit: 'g',
    lyeLabel: 'NaOH',
    settings: DEFAULT_SETTINGS,
    lines,
    linePercents,
    result,
    displayTotals,
    additives: [],
    splitLiquid: undefined,
    splitLiquidGrams: null,
    postCookSuperfat: null,
    postCookSuperfatMethod: 'append',
    dilution: null,
    properties: {
      properties: { hardness: 41, cleansing: 17, condition: 56, creamy: 24, bubbly: 17, longevity: 24 },
      coveragePercent: 100,
      missingOilIds: [],
    },
    indexes: { iodine: 58, ins: 147, coveragePercent: 100, missingOilIds: [] },
    batchWeightWithExtras: displayTotals.batchWeightGrams,
    waterModeLabel: '33% of oils',
    fattyAcids: { profile: null, coveragePercent: 0, missingOilIds: [] },
    insights: [],
    process: 'cp',
  });

  render(<BatchSheet data={data} />);
  // The hardness score renders as a bare number.
  const hardnessTerm = screen.getByText('Hardness');
  const hardnessValue = hardnessTerm.parentElement?.querySelector('dd');
  expect(hardnessValue?.textContent).toBe('41');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @soap-calc/web -- BatchSheet`
Expected: FAIL — value renders as "40.9%" (or "41%") via `formatSoapPropertyPercent`.

- [ ] **Step 3: Switch the six property values**

In `packages/web/src/components/BatchSheet.tsx`:

1. Add `formatPropertyScore` to the `@soap-calc/core` import (alongside the existing `formatSoapPropertyPercent`, `LOW_COVERAGE_PERCENT`, `saturatedUnsaturatedRatio`).
2. In the "Estimated bar properties" section, change each of the five property `<dd>`s from `formatSoapPropertyPercent(properties.properties.<key>)` to `formatPropertyScore(properties.properties.<key>)` for `hardness`, `cleansing`, `condition`, `bubbly`, `creamy`. Keep the `{propsLow ? '~' : ''}` prefix on each.
3. Do NOT touch the Saturated/Unsaturated `<p>` — it keeps `formatSoapPropertyPercent`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @soap-calc/web -- BatchSheet`
Expected: PASS (new test passes; the three existing PCSF tests still pass — they use `properties: null`).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/BatchSheet.tsx packages/web/src/components/BatchSheet.test.tsx
git commit -m "feat(web): unitless bar-property scores on the batch sheet"
```

---

### Task 7: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck, unit tests, oils validation**

Run: `npm test`
Expected: typecheck clean, `validate:oils` passes, all unit suites pass.

- [ ] **Step 2: Web build**

Run: `npm run build:web`
Expected: builds; note the gzip JS size stays near ~96 kB (no chart library added).

- [ ] **Step 3: e2e**

Run: `npm run test:e2e -w @soap-calc/web`
Expected: 7 passed.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run: `npm run dev:web`, open http://localhost:5173, confirm: radar renders with the shaded suggested band and the recipe polygon; property rows show bare numbers (no `%`); swap an oil for beeswax to drop coverage < 80% and confirm the polygon goes dashed, scores get `~`, and no red out-of-range styling appears; print preview shows bare property scores and a `%` on the Saturated/Unsaturated line.

---

## Self-Review

**Spec coverage:**
- §1 unitless numbers → Tasks 1 (formatters), 5 (panel), 6 (batch sheet). Subtitle change → Task 5 Step 3. ✓
- §2 radar → Tasks 3 (geometry), 4 (component), 5 (mounted in panel). Low-coverage dashed, clamp, aria-hidden, viewBox, CSS-variable colors, absent when null → Tasks 4 & 5. ✓
- §3 layout (radar top, compact rows, meter role moved, legend one line, iodine/INS unchanged, longevity no target) → Task 5. ✓
- §4 docosenoid rename + build normalization + regenerate → Task 2. ✓
- §5 testing (geometry, formatters, e2e unmodified, RTL no-`%`, data rebuild) → Tasks 1,2,3,4,5,6,7. ✓

**Placeholder scan:** none — all steps carry concrete code/commands.

**Type consistency:** `radarPoint`/`polygonPoints`/`ringPath` signatures match between Task 3 (definition) and Task 4 (use); `formatPropertyScore`/`formatPropertyScoreRange` match between Task 1 and Tasks 5/6; `PropertyRadar` prop shape matches between Task 4 and Task 5; `role="meter"` attributes match the preserved behavior list.

**Note on the meter role move:** the e2e test selects `.property-bars__value` by text/class and does not assert `role="meter"` position, so moving the role onto the score span is safe. Existing PropertiesPanel had no unit test before Task 5; the e2e is the coverage guard.
