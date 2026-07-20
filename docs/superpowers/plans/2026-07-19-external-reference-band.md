# External-reference sanity band Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a warn-only external-reference gate to the oils build that flags stored iodine/SAP values falling outside the range of independent published sources (Giakoumis 2018, Toscano 2012, Warra 2010, plus AOCS-style ranges).

**Architecture:** A pure `poolExternalReferences` merges the vendored source files into a per-oil `[min,max]` band table (honoring a `bandExclude` flag for triangulated outliers, counting distinct source datasets). A pure `classifyExternalReferenceDeviations` compares each oil's stored `iodine` and `sapMgKohPerGram` against its band ±per-side tolerance (widened for single-source bands), emitting `warn`/`acknowledged` deviations keyed by `id:property`. `build-canonical` records them in the report; `validate-canonical` prints warn-only lines; a consistency test guards acknowledgments against drift. Never blocks the build.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), vitest, npm workspaces, tsx. Spec: `docs/superpowers/specs/2026-07-19-external-reference-band-design.md`.

## Global Constraints

- **Warn-only. Never `errors.push`.** Only the internal profile gates block the build; this gate emits warnings and a report section exclusively.
- Compare SAP against the built **`sapMgKohPerGram`** field (mg KOH/g), never `sapKoh` (g KOH/g) — no unit conversion.
- Tolerance is **per-side**: `T_low = max(ABS, REL·min)`, `T_high = max(ABS, REL·max)`; when a band's `sourceCount === 1`, multiply both by `SINGLE_SOURCE_TOL_FACTOR`. Constants: `IODINE_ABS_TOL=5`, `IODINE_REL_TOL=0.05`, `SAP_ABS_TOL=4`, `SAP_REL_TOL=0.03`, `SINGLE_SOURCE_TOL_FACTOR=2`. Copy verbatim; these are provisional and calibrated in Task 3.
- `sourceCount` counts **distinct source datasets**, not data points — a min/max range is one source contributing two points.
- The acknowledgment map is keyed by **`${id}:${property}`** (an oil can deviate on iodine and SAP independently).
- **Isolation:** execute in a dedicated git worktree branched off `feat/iodine-consistency-gate` (a concurrent agent moved HEAD once this session). Create it with the `superpowers:using-git-worktrees` skill at execution start. Stage explicit paths only — never `git add -A`. Do not push/PR unless asked.
- Data files (`canonical-oils.json`, `build-report.json`) are build outputs — regenerate with `npm run build -w @soap-calc/oils-data` and commit the real diff.

---

### Task 1: Vendor sources + pooling module + generated reference JSON

**Files:**
- Create: `packages/oils-data/reference/external-sources/oil-property-ranges.deidentified.json` (copied from archive)
- Create: `packages/oils-data/reference/external-sources/research-papers-crosscheck.json` (copied from archive, with `bandExclude` added)
- Create: `packages/oils-data/src/external-references.ts`
- Test: `packages/oils-data/src/external-references.test.ts`
- Create: `packages/oils-data/scripts/build-external-references.ts`
- Generate: `packages/oils-data/data/external-property-references.json`

**Interfaces:**
- Produces: `poolExternalReferences(input) → ExternalReferenceTable`; types `Band = { min: number; max: number; sourceCount: number; sources: string[] }`, `OilRef = { iodine?: Band; sapKoh?: Band }`, `ExternalReferenceTable = Record<string, OilRef>`.

- [ ] **Step 1: Vendor the two source files into the repo**

```bash
mkdir -p packages/oils-data/reference/external-sources
cp "/Users/str/soap-calc-archive/books for research/analysis_soap-calc-crosscheck/oil-property-ranges.deidentified.json" \
   packages/oils-data/reference/external-sources/oil-property-ranges.deidentified.json
cp "/Users/str/soap-calc-archive/books for research/analysis_soap-calc-crosscheck/research-papers-crosscheck.json" \
   packages/oils-data/reference/external-sources/research-papers-crosscheck.json
```

- [ ] **Step 2: Add the `bandExclude` flag to palm's Giakoumis entry (in-repo copy only)**

In `packages/oils-data/reference/external-sources/research-papers-crosscheck.json`, find the object in `giakoumis2018_faProfileAndIodine` with `"name": "palm"` and add `"bandExclude": true` to it (its `reportedIodineValue` of 43.2 is the triangulated low outlier per the spec's `_anomalies`). Leave the prose `_anomalies` array untouched.

- [ ] **Step 3: Write the failing test**

Create `packages/oils-data/src/external-references.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { poolExternalReferences } from './external-references.js';

describe('poolExternalReferences', () => {
  const table = poolExternalReferences({
    ranges: [
      { appId: 'a', iv: [40, 50], kohSapPpt: [190, 200] },
      { appId: null, iv: [1, 2] }, // no app match — skipped
    ],
    giakoumis: [
      { appId: 'a', reportedIodineValue: 45 },
      { appId: 'p', reportedIodineValue: 43, bandExclude: true }, // dropped
    ],
    toscano: [{ appId: 'a', iodineValue: 48, sapValueKOH: 199 }],
    warra: [],
  });

  it('pools iodine points across sources into one band with distinct source count', () => {
    expect(table.a.iodine).toEqual({
      min: 40,
      max: 50,
      sourceCount: 3,
      sources: ['giakoumis2018', 'oil-property-ranges', 'toscano2012'],
    });
  });

  it('counts a min/max range as ONE source contributing two points', () => {
    // sap from ranges (1 source) + toscano (1 source) = 2 sources, not 3 points = 3
    expect(table.a.sapKoh).toEqual({
      min: 190,
      max: 200,
      sourceCount: 2,
      sources: ['oil-property-ranges', 'toscano2012'],
    });
  });

  it('drops bandExclude points, so an oil with no surviving points is absent', () => {
    expect(table.p).toBeUndefined();
  });

  it('skips null-appId source rows', () => {
    expect(Object.keys(table)).toEqual(['a']);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run test -w @soap-calc/oils-data -- external-references`
Expected: FAIL — cannot resolve `./external-references.js`.

- [ ] **Step 5: Write the pooling module**

Create `packages/oils-data/src/external-references.ts`:

```ts
/** A pooled published range for one property of one oil. */
export type Band = { min: number; max: number; sourceCount: number; sources: string[] };
export type OilRef = { iodine?: Band; sapKoh?: Band };
/** Keyed by app oil id. */
export type ExternalReferenceTable = Record<string, OilRef>;

type RangeRow = { appId: string | null; iv?: [number, number]; kohSapPpt?: [number, number] };
type GiakRow = { appId: string | null; reportedIodineValue: number | null; bandExclude?: boolean };
type PairRow = { appId: string | null; iodineValue: number; sapValueKOH: number };

export type PoolInput = {
  ranges: RangeRow[];
  giakoumis: GiakRow[];
  toscano: PairRow[];
  warra: PairRow[];
};

type Point = { value: number; source: string };

function toBand(points: Point[]): Band | undefined {
  if (points.length === 0) return undefined;
  const values = points.map((p) => p.value);
  const sources = [...new Set(points.map((p) => p.source))].sort();
  return { min: Math.min(...values), max: Math.max(...values), sourceCount: sources.length, sources };
}

/**
 * Merge every external source into a per-oil band table. A published min/max range contributes
 * two points but counts as ONE source. Giakoumis points flagged `bandExclude` (triangulated
 * outliers) are dropped so a known-bad value can't define an edge. Rows with null appId are skipped.
 */
export function poolExternalReferences(input: PoolInput): ExternalReferenceTable {
  const iodine = new Map<string, Point[]>();
  const sap = new Map<string, Point[]>();
  const push = (m: Map<string, Point[]>, id: string, value: number, source: string) => {
    (m.get(id) ?? m.set(id, []).get(id)!).push({ value, source });
  };

  for (const r of input.ranges) {
    if (!r.appId) continue;
    if (r.iv) {
      push(iodine, r.appId, r.iv[0], 'oil-property-ranges');
      push(iodine, r.appId, r.iv[1], 'oil-property-ranges');
    }
    if (r.kohSapPpt) {
      push(sap, r.appId, r.kohSapPpt[0], 'oil-property-ranges');
      push(sap, r.appId, r.kohSapPpt[1], 'oil-property-ranges');
    }
  }
  for (const g of input.giakoumis) {
    if (!g.appId || g.bandExclude || g.reportedIodineValue == null) continue;
    push(iodine, g.appId, g.reportedIodineValue, 'giakoumis2018');
  }
  for (const [rows, source] of [[input.toscano, 'toscano2012'], [input.warra, 'warra2010']] as const) {
    for (const p of rows) {
      if (!p.appId) continue;
      if (p.iodineValue != null) push(iodine, p.appId, p.iodineValue, source);
      if (p.sapValueKOH != null) push(sap, p.appId, p.sapValueKOH, source);
    }
  }

  const table: ExternalReferenceTable = {};
  for (const id of new Set([...iodine.keys(), ...sap.keys()])) {
    const ref: OilRef = {};
    const iv = toBand(iodine.get(id) ?? []);
    const sv = toBand(sap.get(id) ?? []);
    if (iv) ref.iodine = iv;
    if (sv) ref.sapKoh = sv;
    if (ref.iodine || ref.sapKoh) table[id] = ref;
  }
  return table;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -w @soap-calc/oils-data -- external-references`
Expected: PASS (4 tests).

- [ ] **Step 7: Write the generator script**

Create `packages/oils-data/scripts/build-external-references.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { poolExternalReferences } from '../src/external-references.js';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '../reference/external-sources');
const outPath = join(here, '../data/external-property-references.json');

const ranges = JSON.parse(readFileSync(join(srcDir, 'oil-property-ranges.deidentified.json'), 'utf8')).oils;
const cc = JSON.parse(readFileSync(join(srcDir, 'research-papers-crosscheck.json'), 'utf8'));

const table = poolExternalReferences({
  ranges,
  giakoumis: cc.giakoumis2018_faProfileAndIodine,
  toscano: cc.toscano2012_iodineSaponificationPairs,
  warra: cc.warra2010_measuredSapIodine,
});

const doc = {
  _about:
    'Pooled external published iodine/SAP references per app oil id. GENERATED from reference/external-sources/ by scripts/build-external-references.ts — do not hand-edit. sap in mg KOH/g.',
  oils: Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b))),
};
writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n');
console.log(`Wrote ${Object.keys(table).length} oils to ${outPath}`);
```

- [ ] **Step 8: Run the generator**

Run: `npx tsx packages/oils-data/scripts/build-external-references.ts`
Expected: prints `Wrote 52 oils …`; `packages/oils-data/data/external-property-references.json` exists. Spot-check palm: `node -e "const t=require('./packages/oils-data/data/external-property-references.json').oils; console.log(JSON.stringify(t['palm-oil']))"` → iodine `min` is `47.8` (NOT 43.2 — Giakoumis excluded), sap band `[190,209]`.

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck -w @soap-calc/oils-data`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add packages/oils-data/reference/external-sources/oil-property-ranges.deidentified.json \
  packages/oils-data/reference/external-sources/research-papers-crosscheck.json \
  packages/oils-data/src/external-references.ts \
  packages/oils-data/src/external-references.test.ts \
  packages/oils-data/scripts/build-external-references.ts \
  packages/oils-data/data/external-property-references.json
git commit -m "feat(oils): vendor external references + pool into band table"
```

---

### Task 2: `classifyExternalReferenceDeviations` module + unit tests

**Files:**
- Create: `packages/oils-data/src/external-reference-deviations.ts`
- Test: `packages/oils-data/src/external-reference-deviations.test.ts`

**Interfaces:**
- Consumes: `ExternalReferenceTable` from `./external-references.js` (Task 1).
- Produces: `classifyExternalReferenceDeviations(oils: OilLike[], refs: ExternalReferenceTable) → ExternalReferenceDeviation[]`; constants `IODINE_ABS_TOL`, `IODINE_REL_TOL`, `SAP_ABS_TOL`, `SAP_REL_TOL`, `SINGLE_SOURCE_TOL_FACTOR`, `KNOWN_EXTERNAL_REFERENCE_DEVIATIONS: Record<string,string>`; types `ExternalReferenceDeviation`, `ExternalReferenceProperty = 'iodine' | 'sapKoh'`. `OilLike = { id; iodine?; sapMgKohPerGram? }`.

- [ ] **Step 1: Write the failing test**

Create `packages/oils-data/src/external-reference-deviations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ExternalReferenceTable } from './external-references.js';
import {
  classifyExternalReferenceDeviations,
  KNOWN_EXTERNAL_REFERENCE_DEVIATIONS,
} from './external-reference-deviations.js';

const REFS: ExternalReferenceTable = {
  multi: { // 2-source iodine band [40,50], 2-source sap band [190,200]
    iodine: { min: 40, max: 50, sourceCount: 2, sources: ['a', 'b'] },
    sapKoh: { min: 190, max: 200, sourceCount: 2, sources: ['a', 'b'] },
  },
  lone: { iodine: { min: 100, max: 100, sourceCount: 1, sources: ['a'] } },
};
const oil = (over: Partial<{ id: string; iodine: number; sapMgKohPerGram: number }>) => ({
  id: 'multi',
  ...over,
});

describe('classifyExternalReferenceDeviations', () => {
  it('does not flag a value inside the band', () => {
    expect(classifyExternalReferenceDeviations([oil({ iodine: 45 })], REFS)).toEqual([]);
  });

  it('does not flag a value within per-side tolerance of the edge', () => {
    // high edge 50 + T_high(max(5, 0.05*50)=5) = 55; 54 is inside
    expect(classifyExternalReferenceDeviations([oil({ iodine: 54 })], REFS)).toEqual([]);
  });

  it('flags a value above band+tolerance as warn', () => {
    const [d] = classifyExternalReferenceDeviations([oil({ iodine: 60 })], REFS);
    expect(d).toMatchObject({ id: 'multi', property: 'iodine', stored: 60, tier: 'warn' });
    expect(d.deltaOutside).toBeCloseTo(5, 5); // 60 - 55
  });

  it('flags a value below band−tolerance as warn', () => {
    const [d] = classifyExternalReferenceDeviations([oil({ iodine: 30 })], REFS);
    expect(d).toMatchObject({ property: 'iodine', tier: 'warn' });
    expect(d.deltaOutside).toBeCloseTo(-5, 5); // 30 - 35
  });

  it('reports iodine and sap independently for one oil', () => {
    const out = classifyExternalReferenceDeviations([oil({ iodine: 60, sapMgKohPerGram: 250 })], REFS);
    expect(out.map((d) => d.property)).toEqual(['iodine', 'sapKoh']);
  });

  it('widens tolerance for a single-source band but still flags a large gap', () => {
    // lone band [100,100], T=5, single-source ×2 => low edge 90; 85 still flags, 92 does not
    const flagged = classifyExternalReferenceDeviations([{ id: 'lone', iodine: 85 }], REFS);
    expect(flagged).toHaveLength(1);
    expect(classifyExternalReferenceDeviations([{ id: 'lone', iodine: 92 }], REFS)).toEqual([]);
  });

  it('compares SAP in mg KOH/g against sapMgKohPerGram', () => {
    expect(classifyExternalReferenceDeviations([oil({ sapMgKohPerGram: 195 })], REFS)).toEqual([]); // in band
    const [d] = classifyExternalReferenceDeviations([oil({ sapMgKohPerGram: 250 })], REFS);
    expect(d.property).toBe('sapKoh');
  });

  it('acknowledges a deviation registered by id:property, leaving the other property a warn', () => {
    KNOWN_EXTERNAL_REFERENCE_DEVIATIONS['multi:iodine'] = 'reviewed: reference suspect';
    const out = classifyExternalReferenceDeviations([oil({ iodine: 60, sapMgKohPerGram: 250 })], REFS);
    expect(out.find((d) => d.property === 'iodine')).toMatchObject({
      tier: 'acknowledged',
      reason: 'reviewed: reference suspect',
    });
    expect(out.find((d) => d.property === 'sapKoh')).toMatchObject({ tier: 'warn' });
    delete KNOWN_EXTERNAL_REFERENCE_DEVIATIONS['multi:iodine'];
  });

  it('skips oils absent from the reference table', () => {
    expect(classifyExternalReferenceDeviations([{ id: 'unknown', iodine: 999 }], REFS)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @soap-calc/oils-data -- external-reference-deviations`
Expected: FAIL — cannot resolve `./external-reference-deviations.js`.

- [ ] **Step 3: Write the module**

Create `packages/oils-data/src/external-reference-deviations.ts`:

```ts
import type { Band, ExternalReferenceTable } from './external-references.js';

/** Iodine-value units / % beyond the band edge before a stored value is flagged. */
export const IODINE_ABS_TOL = 5;
export const IODINE_REL_TOL = 0.05;
/** mg KOH/g / % beyond the SAP band edge. */
export const SAP_ABS_TOL = 4;
export const SAP_REL_TOL = 0.03;
/** A single-source band is weak evidence — widen its tolerance so it doesn't trip on small gaps.
 * It is NOT a suppressor: a large single-source gap still flags and is adjudicated in review. */
export const SINGLE_SOURCE_TOL_FACTOR = 2;

/**
 * Stored iodine/SAP that disagrees with the external published band for a REVIEWED reason.
 * Keyed by `${id}:${property}` — one oil can deviate on iodine and SAP independently. Kept exact
 * by the drift guard (`external-reference-consistency.test.ts`). Reviewed, source-attributed only.
 */
export const KNOWN_EXTERNAL_REFERENCE_DEVIATIONS: Record<string, string> = {};

export type ExternalReferenceProperty = 'iodine' | 'sapKoh';

export type ExternalReferenceDeviation = {
  id: string;
  property: ExternalReferenceProperty;
  /** Stored value compared (iodine value, or SAP in mg KOH/g). */
  stored: number;
  band: [number, number];
  sourceCount: number;
  /** Signed distance past the nearest tolerance edge (negative = below, positive = above), 0.1-rounded. */
  deltaOutside: number;
  tier: 'warn' | 'acknowledged';
  reason?: string;
};

type OilLike = { id: string; iodine?: number; sapMgKohPerGram?: number };

const round1 = (n: number) => Math.round(n * 10) / 10;

function evaluate(
  id: string,
  property: ExternalReferenceProperty,
  stored: number,
  band: Band,
  absTol: number,
  relTol: number,
): ExternalReferenceDeviation | null {
  const factor = band.sourceCount === 1 ? SINGLE_SOURCE_TOL_FACTOR : 1;
  const lo = band.min - Math.max(absTol, relTol * band.min) * factor;
  const hi = band.max + Math.max(absTol, relTol * band.max) * factor;
  let deltaOutside: number;
  if (stored < lo) deltaOutside = stored - lo;
  else if (stored > hi) deltaOutside = stored - hi;
  else return null;
  const reason = KNOWN_EXTERNAL_REFERENCE_DEVIATIONS[`${id}:${property}`];
  return {
    id,
    property,
    stored,
    band: [band.min, band.max],
    sourceCount: band.sourceCount,
    deltaOutside: round1(deltaOutside),
    tier: reason ? 'acknowledged' : 'warn',
    reason,
  };
}

/**
 * Flag every oil whose stored iodine / SAP falls outside its pooled external band ± per-side
 * tolerance. Coverage is defined solely by `refs` (no category filter — this compares numbers,
 * it derives nothing). Warn-only: tiers are `acknowledged` (documented in
 * KNOWN_EXTERNAL_REFERENCE_DEVIATIONS) or `warn`. Sorted by id, then property (iodine before sap).
 */
export function classifyExternalReferenceDeviations(
  oils: OilLike[],
  refs: ExternalReferenceTable,
): ExternalReferenceDeviation[] {
  const out: ExternalReferenceDeviation[] = [];
  for (const oil of oils) {
    const ref = refs[oil.id];
    if (!ref) continue;
    if (ref.iodine && oil.iodine != null) {
      const d = evaluate(oil.id, 'iodine', oil.iodine, ref.iodine, IODINE_ABS_TOL, IODINE_REL_TOL);
      if (d) out.push(d);
    }
    if (ref.sapKoh && oil.sapMgKohPerGram != null) {
      const d = evaluate(oil.id, 'sapKoh', oil.sapMgKohPerGram, ref.sapKoh, SAP_ABS_TOL, SAP_REL_TOL);
      if (d) out.push(d);
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id) || a.property.localeCompare(b.property));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w @soap-calc/oils-data -- external-reference-deviations`
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck -w @soap-calc/oils-data`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/oils-data/src/external-reference-deviations.ts \
  packages/oils-data/src/external-reference-deviations.test.ts
git commit -m "feat(oils): external-reference deviation classifier"
```

---

### Task 3: Wire into build report + validate + drift guard + calibrate

**Files:**
- Modify: `packages/oils-data/scripts/build-canonical.ts` (import; record `report.externalReferenceDeviations` before `writeFileSync(reportPath …)` ~line 566)
- Modify: `packages/oils-data/scripts/validate-canonical.ts` (imports; loop after the iodine-deviation loop ~line 306)
- Modify: `packages/oils-data/src/external-reference-deviations.ts` (add calibrated acknowledgments)
- Create: `packages/oils-data/src/external-reference-consistency.test.ts`
- Regenerate: `packages/oils-data/data/build-report.json`

**Interfaces:**
- Consumes: `classifyExternalReferenceDeviations`, `KNOWN_EXTERNAL_REFERENCE_DEVIATIONS` (Task 2); the generated `data/external-property-references.json` (Task 1).

- [ ] **Step 1: Write the failing consistency test**

Create `packages/oils-data/src/external-reference-consistency.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CanonicalOilDatabase } from './schema.js';
import type { ExternalReferenceTable } from './external-references.js';
import {
  classifyExternalReferenceDeviations,
  KNOWN_EXTERNAL_REFERENCE_DEVIATIONS,
} from './external-reference-deviations.js';

const dir = dirname(fileURLToPath(import.meta.url));
const db = JSON.parse(readFileSync(join(dir, '../data/canonical-oils.json'), 'utf8')) as CanonicalOilDatabase;
const refs = JSON.parse(
  readFileSync(join(dir, '../data/external-property-references.json'), 'utf8'),
).oils as ExternalReferenceTable;

describe('external-reference consistency', () => {
  it('every acknowledged id:property still actually deviates (no stale acknowledgment)', () => {
    const keys = new Set(
      classifyExternalReferenceDeviations(db.oils, refs).map((d) => `${d.id}:${d.property}`),
    );
    for (const key of Object.keys(KNOWN_EXTERNAL_REFERENCE_DEVIATIONS)) {
      expect(keys.has(key)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it — expect PASS**

Run: `npm run test -w @soap-calc/oils-data -- external-reference-consistency`
Expected: PASS — `KNOWN_EXTERNAL_REFERENCE_DEVIATIONS` is still empty, so the loop is vacuous.

- [ ] **Step 3: Record deviations in the build report**

`packages/oils-data/scripts/build-canonical.ts` already imports `readFileSync` (line 1) and defines `__dirname` (used for `reportPath`, line 47). Add only this near the other `../src/` imports:

```ts
import { classifyExternalReferenceDeviations } from '../src/external-reference-deviations.js';
```

Immediately **before** the `writeFileSync(reportPath, …)` call (right after the existing `(report as Record<string, unknown>).iodineDeviations = …` line ~564), add:

```ts
  const externalRefs = JSON.parse(
    readFileSync(join(__dirname, '../data/external-property-references.json'), 'utf8'),
  ).oils;
  (report as Record<string, unknown>).externalReferenceDeviations = classifyExternalReferenceDeviations(
    oils,
    externalRefs,
  );
```

- [ ] **Step 4: Add the validate loop**

In `packages/oils-data/scripts/validate-canonical.ts`, add imports:

```ts
import { classifyExternalReferenceDeviations } from '../src/external-reference-deviations.js';
```

Immediately **after** the closing `}` of the `for (const dev of classifyProfileIodineDeviations(db.oils)) { … }` loop (~line 306) and before `console.log(\`Validated …\`)`, add:

```ts
  // External-reference sanity band (app-vs-world). Warn-only — external published values can
  // reflect a different cultivar/sample, so a disagreement is a review prompt, never a block.
  const externalRefs = JSON.parse(
    readFileSync(join(__dirname, '../data/external-property-references.json'), 'utf8'),
  ).oils;
  for (const dev of classifyExternalReferenceDeviations(db.oils, externalRefs)) {
    const label = dev.property === 'iodine' ? 'iodine' : 'SAP';
    const base = `${dev.id}: stored ${label} ${dev.stored} outside published band [${dev.band[0]},${dev.band[1]}] (${dev.sourceCount} source${dev.sourceCount === 1 ? '' : 's'})`;
    if (dev.tier === 'acknowledged') {
      warnings.push(`${base} — acknowledged: ${dev.reason}`);
    } else {
      warnings.push(`${base} — external cross-check; review which side is right`);
    }
  }
```

- [ ] **Step 5: Rebuild + validate; inspect the flag set**

Run: `npm run build -w @soap-calc/oils-data && npm run validate -w @soap-calc/oils-data`
Expected: build + validate succeed, **Errors: 0**; `build-report.json` gains an `externalReferenceDeviations` array. Inspect it:

Run: `node -e "const r=require('./packages/oils-data/data/build-report.json'); console.log(r.externalReferenceDeviations.map(d=>d.id+':'+d.property+' stored '+d.stored+' band ['+d.band+'] n'+d.sourceCount))"`
Expected (from the dry run; may shift slightly after single-source widening): `cherry-kernel-oil-avium:iodine`, `hazelnut-oil:iodine`, `mango-seed-oil:iodine`, `pecan-oil:iodine`, `tamanu-oil-kamani:iodine`, and possibly `coffee-bean-oil-green:iodine`. All `warn`. Zero SAP.

- [ ] **Step 6: Calibrate — acknowledge only what review confirms**

For each flagged oil, decide: leave as an open warn (backlog), or acknowledge with a reviewed, source-attributed reason (do NOT loosen thresholds to hide a real disagreement; corrections to stored values are out of scope for this plan). At minimum, acknowledge the single-source coffee case, whose lone reference reads high. In `packages/oils-data/src/external-reference-deviations.ts`, populate the map (adjust the exact set to whatever Step 5 actually flags):

```ts
export const KNOWN_EXTERNAL_REFERENCE_DEVIATIONS: Record<string, string> = {
  'coffee-bean-oil-green:iodine':
    'single AOCS-style reference point (IV 100) reads high vs the typical ~80–90 for green coffee oil; stored 85 retained pending an independent second source',
};
```

Leave the app-vs-world catches (`mango-seed-oil`, `pecan-oil`, `tamanu-oil-kamani`) and the internally-corroborated ones (`hazelnut-oil`, `cherry-kernel-oil-avium`) as open **warn** backlog — they are real disagreements for row-by-row follow-up, not to be silenced here.

- [ ] **Step 7: Re-run the consistency test + full suite**

Run: `npm run test -w @soap-calc/oils-data && npm run typecheck -w @soap-calc/oils-data`
Expected: all pass. The consistency test now asserts `coffee-bean-oil-green:iodine` still deviates (it does). If it FAILS with a stale key, either that oil no longer flags (remove the ack) or a threshold changed — do not weaken thresholds to satisfy it.

- [ ] **Step 8: Commit**

```bash
git add packages/oils-data/scripts/build-canonical.ts \
  packages/oils-data/scripts/validate-canonical.ts \
  packages/oils-data/src/external-reference-deviations.ts \
  packages/oils-data/src/external-reference-consistency.test.ts \
  packages/oils-data/data/build-report.json
git commit -m "feat(oils): wire external-reference band into build report + validate + drift guard"
```

---

### Task 4: Repo-wide verification

**Files:** none (verification only).

- [ ] **Step 1: Run the repo test gate**

Run: `npm test`
Expected: `typecheck`, `validate:oils` (**Errors: 0**), and all workspace tests pass — the same gate CI runs.

- [ ] **Step 2: Confirm the external backlog is visible and warn-only**

Run: `node -e "const r=require('./packages/oils-data/data/build-report.json'); const d=r.externalReferenceDeviations; console.log('count:',d.length,'| tiers:',[...new Set(d.map(x=>x.tier))], '| any error tier?', d.some(x=>x.tier==='error'))"`
Expected: a small count (~5–6), tiers ⊆ `['warn','acknowledged']`, `any error tier? false`. The band never introduces an error tier.

- [ ] **Step 3: Final commit if anything changed**

If Steps 1–2 produced no file changes, nothing to commit. Otherwise stage explicit paths and commit `chore(oils): external-reference band verification`.

## Self-Review notes (author)

- **Spec coverage:** vendored in-repo sources + generator + generated JSON (Task 1) ✓; `bandExclude` for palm/Giakoumis (Task 1 Step 2) ✓; pooled band, distinct-source count (Task 1) ✓; classifier with per-side tolerance + single-source widening + `sapMgKohPerGram` comparison (Task 2) ✓; two-tier warn/acknowledged keyed by `id:property` (Task 2) ✓; validate warn-only integration + build-report section (Task 3) ✓; drift-guard consistency test (Task 3) ✓; calibration as an explicit step with coffee acknowledgment (Task 3 Step 6) ✓; warn-only / never-block invariant (Global Constraints, Task 4 Step 2) ✓; isolation in worktree (Global Constraints) ✓.
- **Ordering keeps the build green:** the reference JSON and classifier land before wiring; the validate loop only pushes `warnings`, so Errors stays 0 throughout.
- **Type consistency:** `Band`, `ExternalReferenceTable`, `poolExternalReferences`, `classifyExternalReferenceDeviations`, `KNOWN_EXTERNAL_REFERENCE_DEVIATIONS`, `report.externalReferenceDeviations` used identically across tasks.
- **Known follow-up (out of scope):** the `warn` backlog (mango/pecan/tamanu + the two corroborated) is left for row-by-row correction PRs, mirroring how the iodine gate deferred its moderate backlog.
