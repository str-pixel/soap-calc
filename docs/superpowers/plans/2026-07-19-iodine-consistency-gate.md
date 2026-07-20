# Iodine-consistency Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an iodine analogue of the profile-SAP gate to the oils build — flag stored iodine that contradicts the profile-derived value, block the build only on gross contradictions, add an iodine-correction path that reaches FNWL-matched oils, and fix the three clear-corruption oils.

**Architecture:** A pure `classifyProfileIodineDeviations` (mirrors `profile-sap-deviations.ts`) tiers each oil's stored-vs-derived iodine gap; `build-canonical` applies a new `IODINE_CORRECTIONS` table (keyed by `baseSlug`, applied after SAP resolution so it also reaches FNWL-matched oils) and records deviations in the build report; `validate-canonical` errors on the `error` tier and warns otherwise; a consistency test guards the stable band (error-tier empty + no stale acknowledgments).

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), vitest, npm workspaces, tsx. Spec: `docs/superpowers/specs/2026-07-19-iodine-consistency-gate-design.md`.

## Global Constraints

- Deviation flag threshold: `|absΔ| ≥ 10` iodine-value units **AND** `|relΔ%| ≥ 8`. Gross-contradiction (error) bar: `|relΔ%| ≥ 25`. Copy these constants verbatim.
- The profile-derived iodine is a **noisier** oracle than SAP (rounds PUFA high, mis-models conjugated acids) — the gate flags for review, it never auto-overwrites stored iodine. Only gross contradictions on `verified`/`estimated` oils block the build.
- `IODINE_CORRECTIONS` is keyed by `baseSlug` (== oil `id` for all oils in this plan; no `OIL_ID_OVERRIDES` rename applies).
- Correction iodine values must be confirmed against ≥2 independent sources before commit (verify-before-commit); targets given here are estimates.
- Import `deriveChemistryFromProfile` from `@soap-calc/core` (exported via `fatty-acid-chemistry.js`).
- Git: work on branch `feat/iodine-consistency-gate` (branch off the current spec branch or `main`). Stage explicit paths only — never `git add -A`. Do not push/PR unless asked; the user merges explicitly.
- Data files (`canonical-oils.json`, `canonical-oils-lite.json`, `build-report.json`) are build outputs — regenerate with `npm run build -w @soap-calc/oils-data` and commit the real diff (not just `generatedAt`).

---

### Task 1: `classifyProfileIodineDeviations` module + unit tests

**Files:**
- Create: `packages/oils-data/src/profile-iodine-deviations.ts`
- Test: `packages/oils-data/src/profile-iodine-deviations.test.ts`

**Interfaces:**
- Consumes: `deriveChemistryFromProfile(profile) → { iodineValue, … } | null` from `@soap-calc/core`.
- Produces: `classifyProfileIodineDeviations(oils: OilLike[]) → ProfileIodineDeviation[]`, constants `IODINE_ABS_THRESHOLD = 10`, `IODINE_REL_THRESHOLD_PCT = 8`, `IODINE_GROSS_PCT = 25`, `KNOWN_PROFILE_IODINE_DEVIATIONS: Record<string,string>`, types `ProfileIodineDeviation` / `ProfileIodineDeviationTier`. `OilLike = { id; category; confidence?; iodine?; fattyAcids? }`. Each deviation: `{ id, absDelta, relDeltaPct, tier, reason? }`.

- [ ] **Step 1: Write the failing test**

Create `packages/oils-data/src/profile-iodine-deviations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deriveChemistryFromProfile } from '@soap-calc/core';
import {
  classifyProfileIodineDeviations,
  KNOWN_PROFILE_IODINE_DEVIATIONS,
} from './profile-iodine-deviations.js';

// Mid-IV profile so derive returns a value; stored iodine is set relative to derived
// so deltas are controlled, not hard-coded.
const PROFILE = { oleic: 80, palmitic: 10, stearic: 5, linoleic: 5 };
const iv = deriveChemistryFromProfile(PROFILE)!.iodineValue; // ~80.9
const grossHi = iv * 1.3; // rel +30%, abs ~+24  -> gross
const moderate = iv * 1.14; // rel +14%, abs ~+11 -> flagged but not gross
const relOnly = iv * 1.09; // rel +9%,  abs ~+7  -> abs below floor, NOT flagged

type Oil = Parameters<typeof classifyProfileIodineDeviations>[0][number];
const oil = (over: Partial<Oil>): Oil => ({
  id: 'x',
  category: 'triglyceride',
  confidence: 'verified',
  iodine: iv,
  fattyAcids: PROFILE,
  ...over,
});

describe('classifyProfileIodineDeviations', () => {
  it('flags a gross verified contradiction as error', () => {
    const [d] = classifyProfileIodineDeviations([oil({ id: 'gv', iodine: grossHi })]);
    expect(d.tier).toBe('error');
  });

  it('flags a gross estimated contradiction as error', () => {
    const [d] = classifyProfileIodineDeviations([
      oil({ id: 'ge', confidence: 'estimated', iodine: grossHi }),
    ]);
    expect(d.tier).toBe('error');
  });

  it('flags a gross legacy_only contradiction as warn, not error', () => {
    const [d] = classifyProfileIodineDeviations([
      oil({ id: 'gl', confidence: 'legacy_only', iodine: grossHi }),
    ]);
    expect(d.tier).toBe('warn');
  });

  it('treats a moderate verified deviation as warn, not error (trust-asymmetry vs SAP)', () => {
    const [d] = classifyProfileIodineDeviations([oil({ id: 'mv', iodine: moderate })]);
    expect(d.tier).toBe('warn');
  });

  it('does not flag when the absolute gap is below the floor (low-IV noise)', () => {
    expect(classifyProfileIodineDeviations([oil({ id: 'rel', iodine: relOnly })])).toEqual([]);
  });

  it('does not flag when stored agrees with the profile', () => {
    expect(classifyProfileIodineDeviations([oil({ id: 'ok' })])).toEqual([]);
  });

  it('treats a documented deviation as acknowledged and carries its reason', () => {
    const id = Object.keys(KNOWN_PROFILE_IODINE_DEVIATIONS)[0];
    const [d] = classifyProfileIodineDeviations([oil({ id, iodine: grossHi })]);
    expect(d.tier).toBe('acknowledged');
    expect(d.reason).toBe(KNOWN_PROFILE_IODINE_DEVIATIONS[id]);
  });

  it('excludes non-glyceride categories', () => {
    expect(
      classifyProfileIodineDeviations([oil({ id: 'wax', category: 'wax', iodine: grossHi })]),
    ).toEqual([]);
  });

  it('skips oils with an incomplete profile', () => {
    expect(
      classifyProfileIodineDeviations([oil({ id: 'p', fattyAcids: { oleic: 40 }, iodine: grossHi })]),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @soap-calc/oils-data -- profile-iodine-deviations`
Expected: FAIL — cannot resolve `./profile-iodine-deviations.js`.

- [ ] **Step 3: Write the module**

Create `packages/oils-data/src/profile-iodine-deviations.ts`:

```ts
import { deriveChemistryFromProfile } from '@soap-calc/core';

/** Stored iodine is flagged only when it disagrees with the profile-derived value by
 * BOTH at least this many iodine-value units AND at least IODINE_REL_THRESHOLD_PCT. The
 * absolute floor kills low-IV noise (a 1-unit gap on a near-saturated oil is not a defect). */
export const IODINE_ABS_THRESHOLD = 10;
export const IODINE_REL_THRESHOLD_PCT = 8;
/** A flagged deviation this large (relative) on a trusted value is a gross contradiction —
 * the corruption band that blocks the build. 25% is a heuristic beyond measurement noise
 * and PUFA-rounding, not a physical law. */
export const IODINE_GROSS_PCT = 25;

/**
 * Oils whose stored iodine disagrees with their own complete fatty-acid profile beyond
 * threshold for a REVIEWED reason (unsaponifiables, conjugated acids, no compositional
 * standard). Unlike SAP, profile-derived iodine is a noisy oracle, so most flagged oils are
 * a review backlog (warn tier), NOT acknowledged here — this map is real explanations only.
 */
export const KNOWN_PROFILE_IODINE_DEVIATIONS: Record<string, string> = {
  'nutmeg-butter':
    'trimyristin + volatile unsaponifiables: measured iodine far exceeds the near-saturated triglyceride profile',
  'tallow-deer': 'community-only animal fat, no compositional standard to reconcile against',
};

export type ProfileIodineDeviationTier = 'error' | 'warn' | 'acknowledged';

export type ProfileIodineDeviation = {
  id: string;
  /** Signed stored − derived, iodine-value units, rounded to 0.1. */
  absDelta: number;
  /** Signed (stored − derived)/derived, %, rounded to 0.1. */
  relDeltaPct: number;
  tier: ProfileIodineDeviationTier;
  /** Present only for acknowledged (documented) deviations. */
  reason?: string;
};

type OilLike = {
  id: string;
  category: string;
  confidence?: string;
  iodine?: number;
  fattyAcids?: Record<string, number>;
};

/**
 * Classify every oil whose stored iodine contradicts its own fatty-acid profile. Only
 * triglycerides/blends with a ≥93%-mapped profile are judgeable (derive returns null below
 * that). Tiering respects the trust-asymmetry vs SAP: a mere deviation does NOT block the
 * build; only a gross (≥IODINE_GROSS_PCT) contradiction on a trusted value does.
 *  - documented in KNOWN_PROFILE_IODINE_DEVIATIONS → `acknowledged` (non-blocking)
 *  - else gross AND verified/estimated → `error` (block until corrected or acknowledged)
 *  - else → `warn` (review backlog; profile is the noisier side, human decides)
 */
export function classifyProfileIodineDeviations(oils: OilLike[]): ProfileIodineDeviation[] {
  const out: ProfileIodineDeviation[] = [];
  for (const oil of oils) {
    if (oil.category !== 'triglyceride' && oil.category !== 'blend') continue;
    if (!oil.fattyAcids || oil.iodine == null) continue;
    const derived = deriveChemistryFromProfile(oil.fattyAcids);
    if (!derived) continue; // incomplete profile — not judgeable
    const absDelta = oil.iodine - derived.iodineValue;
    const relDeltaPct = (absDelta / derived.iodineValue) * 100;
    if (Math.abs(absDelta) < IODINE_ABS_THRESHOLD) continue;
    if (Math.abs(relDeltaPct) < IODINE_REL_THRESHOLD_PCT) continue;
    const reason = KNOWN_PROFILE_IODINE_DEVIATIONS[oil.id];
    const tier: ProfileIodineDeviationTier = reason
      ? 'acknowledged'
      : Math.abs(relDeltaPct) >= IODINE_GROSS_PCT &&
          (oil.confidence === 'verified' || oil.confidence === 'estimated')
        ? 'error'
        : 'warn';
    out.push({
      id: oil.id,
      absDelta: Math.round(absDelta * 10) / 10,
      relDeltaPct: Math.round(relDeltaPct * 10) / 10,
      tier,
      reason,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w @soap-calc/oils-data -- profile-iodine-deviations`
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck -w @soap-calc/oils-data`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/oils-data/src/profile-iodine-deviations.ts packages/oils-data/src/profile-iodine-deviations.test.ts
git commit -m "feat(oils): iodine-vs-profile deviation classifier"
```

---

### Task 2: `IODINE_CORRECTIONS` table + build application + data fixes

**Files:**
- Create: `packages/oils-data/src/iodine-corrections.ts`
- Modify: `packages/oils-data/scripts/build-canonical.ts` (report init ~line 131; apply block before `const id =` ~line 389)
- Modify: `packages/oils-data/src/profile-iodine-deviations.ts` (add pomegranate acknowledgment)
- Regenerate: `packages/oils-data/data/canonical-oils.json`, `canonical-oils-lite.json`, `build-report.json`

**Interfaces:**
- Produces: `IODINE_CORRECTIONS: Record<string, { iodine: number; note: string }>` keyed by `baseSlug`; `report.iodineCorrected: string[]`.

- [ ] **Step 1: Confirm the three correction values (verify-before-commit)**

For each oil, confirm the target iodine against ≥2 independent sources (e.g. peer-reviewed lipid papers, Codex, reputable oleochemical monographs) and record the values actually found. Targets to confirm:
- `pomegranate-seed-oil`: ~200 (punicic-rich; stored 22 is impossible for a ~78% triene oil).
- `sacha-inchi-plukenetia-volubilis`: ~193 (very high α-linolenic).
- `murumuru-butter`: ~13 (lauric butter; profile derives ~14).

Use the confirmed numbers in Step 2 (adjust if sources differ from the targets).

- [ ] **Step 2: Write the corrections table**

Create `packages/oils-data/src/iodine-corrections.ts`:

```ts
/**
 * Iodine corrections for oils whose stored iodine contradicts their own fatty-acid profile
 * (and published values). Applied in build-canonical AFTER sap resolution, regardless of
 * FNWL match — this is the only iodine path that reaches FNWL-matched (`verified`) oils, which
 * `sap-corrections.ts` (no-FNWL branch only) cannot. INS is recomputed from the corrected
 * iodine. Keyed by baseSlug (== id for all current entries). Values are profile-consistent
 * and confirmed against published sources; validate-canonical asserts the built value matches.
 */
export const IODINE_CORRECTIONS: Record<string, { iodine: number; note: string }> = {
  'pomegranate-seed-oil': {
    iodine: 200,
    note: 'Corrected: legacy iodine (22) is impossible for a ~78%-triene (punicic) oil; published pomegranate seed oil IV is ~195–220. Set to ~200. The profile-derived ~232 over-estimates because punicic acid is conjugated (each C=C adds less iodine in Wijs), so a residual deviation remains and is acknowledged.',
  },
  'sacha-inchi-plukenetia-volubilis': {
    iodine: 193,
    note: 'Corrected: legacy iodine (141) understates a ~48% α-linolenic oil; published sacha inchi IV is ~190–198, matching the profile-derived ~204. Set to ~193.',
  },
  'murumuru-butter': {
    iodine: 13,
    note: 'Corrected: legacy iodine (25) is high for a lauric butter; published murumuru IV is ~10–15, matching the profile-derived ~14. Set to ~13.',
  },
};
```

- [ ] **Step 3: Add pomegranate acknowledgment**

In `packages/oils-data/src/profile-iodine-deviations.ts`, add to `KNOWN_PROFILE_IODINE_DEVIATIONS`:

```ts
  'pomegranate-seed-oil':
    'conjugated punicic acid: measured IV (~200) is below the ~232 the linolenic-mapped profile implies (Wijs under-reacts on conjugated double bonds)',
```

- [ ] **Step 4: Wire the correction into build-canonical**

In `packages/oils-data/scripts/build-canonical.ts`, add the import near the other `src/` imports:

```ts
import { IODINE_CORRECTIONS } from '../src/iodine-corrections.js';
```

Add `iodineCorrected` to the `report` object literal (alongside `sapCorrected: [] as string[],`):

```ts
    iodineCorrected: [] as string[],
```

Insert this block immediately **before** `const id = OIL_ID_OVERRIDES[baseSlug] ?? baseSlug;`:

```ts
    const iodineCorrection = IODINE_CORRECTIONS[baseSlug];
    if (iodineCorrection) {
      iodine = iodineCorrection.iodine;
      ins = iodine !== undefined ? Math.round(sapKoh * 1000 - iodine) : undefined;
      sources.push({ source: 'manual', notes: iodineCorrection.note });
      report.iodineCorrected.push(leg.name);
    }
```

- [ ] **Step 5: Rebuild the catalog**

Run: `npm run build -w @soap-calc/oils-data`
Expected: build succeeds; `build-report.json` lists the three names under `iodineCorrected`.

- [ ] **Step 6: Verify the data diff is exactly the three oils (+ generatedAt)**

Run: `git diff --stat packages/oils-data/data/` then
`git diff packages/oils-data/data/canonical-oils.json | grep -E '"iodine"|"ins"|"id"' | head -40`
Expected: only `pomegranate-seed-oil`, `sacha-inchi-plukenetia-volubilis`, `murumuru-butter` change `iodine`/`ins` (plus each gains the manual source note and `generatedAt` changes). If any other oil's numbers moved, stop and investigate.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck -w @soap-calc/oils-data`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/oils-data/src/iodine-corrections.ts \
  packages/oils-data/src/profile-iodine-deviations.ts \
  packages/oils-data/scripts/build-canonical.ts \
  packages/oils-data/data/canonical-oils.json \
  packages/oils-data/data/canonical-oils-lite.json \
  packages/oils-data/data/build-report.json
git commit -m "fix(oils): correct pomegranate/sacha-inchi/murumuru iodine; add IODINE_CORRECTIONS path"
```

---

### Task 3: Wire the gate into validate + build report + consistency drift-guard

**Files:**
- Modify: `packages/oils-data/scripts/validate-canonical.ts` (imports; iodine-correction assertion; deviation loop after the SAP loop ~line 277)
- Modify: `packages/oils-data/scripts/build-canonical.ts` (record `report.iodineDeviations` at the end, before the report is written)
- Create: `packages/oils-data/src/profile-iodine-consistency.test.ts`

**Interfaces:**
- Consumes: `classifyProfileIodineDeviations`, `KNOWN_PROFILE_IODINE_DEVIATIONS` (Task 1), `IODINE_CORRECTIONS` (Task 2).

- [ ] **Step 1: Write the failing consistency test**

Create `packages/oils-data/src/profile-iodine-consistency.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CanonicalOilDatabase } from './schema.js';
import {
  classifyProfileIodineDeviations,
  KNOWN_PROFILE_IODINE_DEVIATIONS,
} from './profile-iodine-deviations.js';

const dataPath = join(dirname(fileURLToPath(import.meta.url)), '../data/canonical-oils.json');
const db = JSON.parse(readFileSync(dataPath, 'utf8')) as CanonicalOilDatabase;

describe('iodine-vs-profile consistency', () => {
  it('ships no error-tier oil (every gross contradiction is corrected or acknowledged)', () => {
    const errors = classifyProfileIodineDeviations(db.oils).filter((d) => d.tier === 'error');
    expect(errors).toEqual([]);
  });

  it('every acknowledged oil still actually deviates (no stale acknowledgment)', () => {
    const deviating = new Set(classifyProfileIodineDeviations(db.oils).map((d) => d.id));
    for (const id of Object.keys(KNOWN_PROFILE_IODINE_DEVIATIONS)) {
      expect(deviating.has(id)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it — expect PASS already**

Run: `npm run test -w @soap-calc/oils-data -- profile-iodine-consistency`
Expected: PASS — Task 2 already corrected pomegranate + murumuru (the only two error-tier oils), and the three acknowledged oils (nutmeg, tallow-deer, pomegranate) still deviate. If `ships no error-tier oil` FAILS, an error-tier oil remains: read the failure, then either extend `IODINE_CORRECTIONS` or add a reviewed acknowledgment — do not weaken the threshold.

- [ ] **Step 3: Add the iodine-correction assertion + deviation loop to validate-canonical**

In `packages/oils-data/scripts/validate-canonical.ts`, add imports:

```ts
import { classifyProfileIodineDeviations } from '../src/profile-iodine-deviations.js';
import { IODINE_CORRECTIONS } from '../src/iodine-corrections.js';
```

Immediately **after** the existing `for (const dev of classifyProfileSapDeviations(db.oils)) { … }` loop, add:

```ts
  // Iodine corrections are the single source of truth (build applies, validate asserts).
  for (const oil of db.oils) {
    const corr = IODINE_CORRECTIONS[oil.id];
    if (corr && oil.iodine !== corr.iodine) {
      errors.push(`${oil.id}: built iodine ${oil.iodine} != IODINE_CORRECTIONS ${corr.iodine}`);
    }
  }

  // Iodine-vs-profile gate. Unlike SAP, profile-derived iodine is a noisy oracle, so only a
  // gross contradiction on a trusted value blocks; moderate gaps are a reported review backlog.
  for (const dev of classifyProfileIodineDeviations(db.oils)) {
    const base = `${dev.id}: stored iodine deviates ${dev.relDeltaPct}% (${dev.absDelta}) from its fatty-acid profile`;
    if (dev.tier === 'error') {
      errors.push(
        `${base} — a gross contradiction on a trusted value; correct via IODINE_CORRECTIONS or add an acknowledged-deviation entry after review`,
      );
    } else if (dev.tier === 'warn') {
      warnings.push(`${base} (review backlog — profile-derived iodine is a noisy oracle; confirm which side is right)`);
    } else {
      warnings.push(`${base} — acknowledged: ${dev.reason}`);
    }
  }
```

- [ ] **Step 4: Record deviations in the build report**

In `packages/oils-data/scripts/build-canonical.ts`, add the import near the other `src/` imports:

```ts
import { classifyProfileIodineDeviations } from '../src/profile-iodine-deviations.js';
```

Immediately before the line that writes the report to disk (`writeFileSync(reportPath, …)`), add:

```ts
  (report as Record<string, unknown>).iodineDeviations = classifyProfileIodineDeviations(oils);
```

- [ ] **Step 5: Rebuild + full validate**

Run: `npm run build -w @soap-calc/oils-data && npm run validate -w @soap-calc/oils-data`
Expected: build succeeds; validate prints `Errors: 0`. The iodine warnings appear in the grouped warning summary; `build-report.json` has an `iodineDeviations` array (the ranked backlog). Re-`git diff` the data to confirm only `generatedAt` + the new `iodineDeviations` report field changed since Task 2.

- [ ] **Step 6: Run the whole oils-data suite + typecheck**

Run: `npm run test -w @soap-calc/oils-data && npm run typecheck -w @soap-calc/oils-data`
Expected: all tests pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/oils-data/scripts/validate-canonical.ts \
  packages/oils-data/scripts/build-canonical.ts \
  packages/oils-data/src/profile-iodine-consistency.test.ts \
  packages/oils-data/data/build-report.json \
  packages/oils-data/data/canonical-oils.json \
  packages/oils-data/data/canonical-oils-lite.json
git commit -m "feat(oils): iodine-consistency gate in validate + build report + drift guard"
```

---

### Task 4: Repo-wide verification

**Files:** none (verification only).

- [ ] **Step 1: Run the repo test gate**

Run: `npm test`
Expected: `typecheck`, `validate:oils` (Errors: 0), and all workspace tests pass. This is the same gate CI runs.

- [ ] **Step 2: Confirm the deferred backlog is visible, not hidden**

Run: `node -e "const r=require('./packages/oils-data/data/build-report.json'); console.log('corrected:', r.iodineCorrected); console.log('deviations:', r.iodineDeviations.map(d=>d.id+':'+d.tier))"`
Expected: `iodineCorrected` = the three fixed names; `iodineDeviations` lists the moderate `warn` backlog (camelina, cranberry, milk-thistle, raspberry, sea-buckthorn, baobab, walnut, hazelnut, palm-stearin, almond-butter, argan, cherry-avium, tallow-goat) plus the three `acknowledged` entries, and **zero `error`**.

- [ ] **Step 3: Final commit if anything changed**

If Step 1/2 produced no file changes, nothing to commit. Otherwise stage the explicit paths and commit `chore(oils): iodine gate verification`.

## Self-Review notes (author)

- **Spec coverage:** deviation metric+threshold (Task 1) ✓; two-band tiering (Task 1) ✓; module (Task 1) ✓; iodine-correction path reaching FNWL oils (Task 2) ✓; validate integration + build-report section (Task 3) ✓; three in-scope fixes + acknowledgments incl. nutmeg/tallow-deer/pomegranate (Tasks 1–2) ✓; tests incl. drift guard scoped to error-tier + no-stale-ack (Tasks 1, 3) ✓; deferred backlog surfaced (Task 4) ✓.
- **Ordering keeps the build green:** corrections (Task 2) empty the error tier before the erroring gate is wired (Task 3), so validate never fails mid-plan.
- **Type consistency:** `classifyProfileIodineDeviations`, `KNOWN_PROFILE_IODINE_DEVIATIONS`, `IODINE_CORRECTIONS`, `report.iodineCorrected`, `report.iodineDeviations` used identically across tasks.
