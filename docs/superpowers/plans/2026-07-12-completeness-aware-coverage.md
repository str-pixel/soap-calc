# Completeness-Aware Coverage (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop shipping wrong bar-property scores at a false 100% coverage by making the recipe coverage % reflect each oil's fatty-acid-profile *completeness*, so incomplete-profile oils get flagged as estimates instead of presented with full confidence.

**Architecture:** One change in `@soap-calc/core`'s `calculateRecipeFattyAcids`: alongside the existing covered-oil weight, accumulate a `characterizedWeight` (each covered oil contributes `weight × min(profileSum,100)/100`) and report `coveragePercent = characterizedWeight / totalWeight`. **Scores are unchanged** — the profile is still renormalized over covered-oil weight. Then wire the two missing fatty acids (`palmitoleic`, `behenic`) into the property lists, and add a build-time warning that lists property-ready oils whose profile is materially incomplete.

**Tech Stack:** TypeScript, npm workspaces, Vitest. Run all commands from repo root `/Users/str/soap-calc`.

## Global Constraints

- Node >= 20; npm workspaces monorepo; run commands from repo root.
- Minimal changes — smallest patch that solves the problem; no drive-by refactors.
- `@soap-calc/core` is pure math (no I/O); `@soap-calc/oils-data` owns the build/validate scripts.
- Do not modify `packages/web/*` — a concurrent session owns uncommitted changes there.
- This is **Phase 1** of `docs/superpowers/specs/2026-07-12-oil-data-quality-architecture-design.md`. Do not implement Phases 2–5 here.
- **Coverage-only, grounded decision:** do NOT renormalize scores to full scale. Renormalizing would silently inflate scores for 90 of 119 oils (80–99% band) with no flag. Change only the coverage %; leave every score exactly as today.

## File Structure

- `packages/core/src/fatty-acids.ts` — modify `calculateRecipeFattyAcids` (coverage math); extend `SATURATED_ACIDS`/`UNSATURATED_ACIDS`.
- `packages/core/src/properties.ts` — extend `SOAP_PROPERTY_FATTY_ACIDS` (palmitoleic → condition; behenic → hardness, longevity).
- `packages/core/src/formulation.test.ts` — update 1 coverage assertion; add completeness test.
- `packages/core/src/properties.test.ts` — update 3 coverage assertions; add property-list tests.
- `packages/oils-data/src/profile-completeness.ts` — NEW pure helper listing incomplete-profile oils.
- `packages/oils-data/src/profile-completeness.test.ts` — NEW test.
- `packages/oils-data/scripts/validate-canonical.ts` — call the helper, warn.

---

### Task 1: Completeness-aware coverage in `calculateRecipeFattyAcids`

**Files:**
- Modify: `packages/core/src/fatty-acids.ts:11-55`
- Test: `packages/core/src/formulation.test.ts`, `packages/core/src/properties.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `calculateRecipeFattyAcids(lines, oilLookup)` — unchanged signature and `RecipeFattyAcidResult` shape (`{ profile, coveragePercent, missingOilIds }`); only the numeric value of `coveragePercent` changes (now completeness-weighted). `profile` values are unchanged.

- [ ] **Step 1: Write the failing test** (add to `packages/core/src/formulation.test.ts` inside the `describe('calculateRecipeFattyAcids', ...)` block, after the existing `'returns weighted fatty acid profile'` test)

```typescript
  it('coverage reflects profile completeness, not just whether a profile exists', () => {
    // A single oil whose profile sums to only 50% is 50% characterized, even though
    // it "has a profile". Scores are unaffected; only coverage drops so the UI flags it.
    const lookup = {
      'half-oil': {
        id: 'half-oil',
        propertiesAvailable: true,
        fattyAcids: { oleic: 30, palmitic: 20 }, // sums to 50
      },
    };
    const result = calculateRecipeFattyAcids(
      [{ oilId: 'half-oil', weightGrams: 1000 }],
      lookup,
    );
    expect(result.coveragePercent).toBeCloseTo(50, 5);
    // Scores unchanged: profile renormalized over covered-oil weight (sums to 50).
    expect(result.profile!.oleic).toBeCloseTo(30, 5);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/formulation.test.ts -t "coverage reflects profile completeness"`
Expected: FAIL — `coveragePercent` is `100` (current code counts any profiled oil as fully covered), expected `50`.

- [ ] **Step 3: Write minimal implementation** (edit `packages/core/src/fatty-acids.ts`, the body of `calculateRecipeFattyAcids`)

Replace the loop and return (lines 22-54) with:

```typescript
  const profile: FattyAcidProfile = {};
  let coveredWeight = 0;
  let characterizedWeight = 0;
  const missingOilIds = new Set<string>();

  for (const line of weighted) {
    const oil = oilLookup[line.oilId];
    if (!oil?.propertiesAvailable || !oil.fattyAcids) {
      missingOilIds.add(line.oilId);
      continue;
    }

    coveredWeight += line.weightGrams;
    const profileSum = Object.values(oil.fattyAcids).reduce((sum, pct) => sum + pct, 0);
    // Cap at 100 so a profile that sums slightly over 100 (rounding) can't push coverage past 100%.
    characterizedWeight += line.weightGrams * (Math.min(profileSum, 100) / 100);

    for (const [acid, pct] of Object.entries(oil.fattyAcids)) {
      profile[acid] = (profile[acid] ?? 0) + pct * line.weightGrams;
    }
  }

  if (coveredWeight <= 0) {
    return { profile: null, coveragePercent: 0, missingOilIds: [...missingOilIds] };
  }

  // Scores: renormalize the profile over covered-OIL weight (unchanged from before) so an
  // oil's scores are identical to today. Only coverage below reflects profile completeness.
  for (const acid of Object.keys(profile)) {
    profile[acid] /= coveredWeight;
  }

  return {
    profile,
    coveragePercent: (characterizedWeight / totalWeight) * 100,
    missingOilIds: [...missingOilIds],
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/src/formulation.test.ts -t "coverage reflects profile completeness"`
Expected: PASS

- [ ] **Step 5: Update the 4 existing coverage assertions to their completeness-weighted values**

The score/profile assertions are unchanged; only these `coveragePercent` numbers move. Apply each edit:

`packages/core/src/formulation.test.ts` — the `'returns weighted fatty acid profile'` test (coconut sum 86 @250g + olive sum 98 @750g → (250·0.86 + 750·0.98)/1000 = 95%):
```typescript
    expect(result.coveragePercent).toBeCloseTo(95, 1);
```

`packages/core/src/properties.test.ts` — `'returns weighted recipe properties'` (coconut sum 101→capped 100 @250g + olive sum 98 @750g → (250·1.0 + 750·0.98)/1000 = 98.5%):
```typescript
    expect(result.coveragePercent).toBeCloseTo(98.5, 1);
```

`packages/core/src/properties.test.ts` — `'reports partial coverage when specialty oils lack data'` (olive sum 98 @900g + birch-tar no profile @100g → 900·0.98/1000 = 88.2%):
```typescript
    expect(result.coveragePercent).toBeCloseTo(88.2, 1);
```

`packages/core/src/properties.test.ts` — `'reports an unknown oil id (absent from lookup) as missing'` (olive sum 98 @500g + ghost @500g → 500·0.98/1000 = 49%):
```typescript
    expect(result.coveragePercent).toBeCloseTo(49, 1);
```

- [ ] **Step 6: Run the full core test suite to verify all green**

Run: `npm run test -w @soap-calc/core`
Expected: PASS (all files). The `'renormalizes properties over covered weight'` test (hardness 16) still passes — proof scores are unchanged.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/fatty-acids.ts packages/core/src/formulation.test.ts packages/core/src/properties.test.ts
git commit -m "feat(core): completeness-aware fatty-acid coverage (flag incomplete profiles, scores unchanged)"
```

---

### Task 2: Wire `palmitoleic` + `behenic` into the property lists

**Files:**
- Modify: `packages/core/src/properties.ts:15-31` (`SOAP_PROPERTY_FATTY_ACIDS`)
- Modify: `packages/core/src/fatty-acids.ts:61-79` (`SATURATED_ACIDS`, `UNSATURATED_ACIDS`)
- Test: `packages/core/src/properties.test.ts`, `packages/core/src/formulation.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `oilPropertiesFromFattyAcids` now counts `palmitoleic` toward `condition` and `behenic` toward `hardness`/`longevity`; `saturatedUnsaturatedRatio` counts `behenic` as saturated and `palmitoleic` as unsaturated. No shipped oil carries these keys yet, so existing oils' scores are unchanged.

- [ ] **Step 1: Write the failing test** (add to `packages/core/src/properties.test.ts`, after the existing `oilPropertiesFromFattyAcids` describe block)

```typescript
describe('palmitoleic and behenic are classified', () => {
  it('counts palmitoleic toward conditioning and behenic toward hardness/longevity', () => {
    const props = oilPropertiesFromFattyAcids({ palmitoleic: 12, behenic: 20, oleic: 5 });
    expect(props.condition).toBe(12 + 5); // palmitoleic + oleic
    expect(props.hardness).toBe(20); // behenic
    expect(props.longevity).toBe(20); // behenic
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/properties.test.ts -t "palmitoleic and behenic are classified"`
Expected: FAIL — `condition` is `5` (palmitoleic uncounted) and `hardness`/`longevity` are `0` (behenic uncounted).

- [ ] **Step 3: Write minimal implementation**

Edit `packages/core/src/properties.ts` `SOAP_PROPERTY_FATTY_ACIDS` — add `palmitoleic` to `condition`, and `behenic` to `hardness` and `longevity`:

```typescript
  condition: [
    'ricinoleic',
    'oleic',
    'palmitoleic',
    'linoleic',
    'linolenic',
    'eicosenoic',
    'docosenoic',
    'docosadienoic',
    'erucic',
  ],
  // C8/C10 stay out of hardness: their soaps are too soluble to harden a bar,
  // even though they count toward cleansing/bubbly.
  hardness: ['lauric', 'myristic', 'palmitic', 'stearic', 'behenic'],
  longevity: ['palmitic', 'stearic', 'behenic'],
```

Edit `packages/core/src/fatty-acids.ts` — add `behenic` to `SATURATED_ACIDS` and `palmitoleic` to `UNSATURATED_ACIDS`:

```typescript
const SATURATED_ACIDS = [
  'lauric',
  'myristic',
  'palmitic',
  'stearic',
  'caprylic',
  'capric',
  'behenic',
] as const;

const UNSATURATED_ACIDS = [
  'oleic',
  'palmitoleic',
  'linoleic',
  'linolenic',
  'ricinoleic',
  'eicosenoic',
  'docosenoic',
  'docosadienoic',
  'erucic',
] as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/src/properties.test.ts -t "palmitoleic and behenic are classified"`
Expected: PASS

- [ ] **Step 5: Run the full core suite (confirm no shipped-oil score changed)**

Run: `npm run test -w @soap-calc/core`
Expected: PASS (no existing test moves — no shipped oil carries palmitoleic/behenic yet).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/properties.ts packages/core/src/fatty-acids.ts packages/core/src/properties.test.ts
git commit -m "feat(core): classify palmitoleic (conditioning) and behenic (hardness/longevity)"
```

---

### Task 3: Build-time warning for incomplete property-ready profiles

**Files:**
- Create: `packages/oils-data/src/profile-completeness.ts`
- Create: `packages/oils-data/src/profile-completeness.test.ts`
- Modify: `packages/oils-data/scripts/validate-canonical.ts`

**Interfaces:**
- Consumes: `CanonicalOil` shape from `./schema.js` (has `id`, `propertiesAvailable`, optional `fattyAcids`).
- Produces: `incompleteProfileOils(oils, minPercent?) => { id: string; sum: number }[]` — property-ready oils whose fatty-acid profile sums below `minPercent` (default 93), sorted ascending by `sum`.

- [ ] **Step 1: Write the failing test** (create `packages/oils-data/src/profile-completeness.test.ts`)

```typescript
import { describe, expect, it } from 'vitest';
import { incompleteProfileOils } from './profile-completeness.js';

const oils = [
  { id: 'complete', propertiesAvailable: true, fattyAcids: { oleic: 70, palmitic: 30 } }, // 100
  { id: 'incomplete', propertiesAvailable: true, fattyAcids: { oleic: 45 } }, // 45
  { id: 'borderline', propertiesAvailable: true, fattyAcids: { oleic: 90, palmitic: 4 } }, // 94
  { id: 'no-profile', propertiesAvailable: false },
];

describe('incompleteProfileOils', () => {
  it('lists property-ready oils below the completeness threshold, sorted ascending', () => {
    const result = incompleteProfileOils(oils, 93);
    expect(result.map((o) => o.id)).toEqual(['incomplete']);
    expect(result[0].sum).toBe(45);
  });

  it('ignores oils without a profile and those at/above the threshold', () => {
    const result = incompleteProfileOils(oils, 93);
    expect(result.map((o) => o.id)).not.toContain('complete');
    expect(result.map((o) => o.id)).not.toContain('borderline');
    expect(result.map((o) => o.id)).not.toContain('no-profile');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/oils-data/src/profile-completeness.test.ts`
Expected: FAIL — cannot resolve `./profile-completeness.js` (module missing).

- [ ] **Step 3: Write minimal implementation** (create `packages/oils-data/src/profile-completeness.ts`)

```typescript
type OilLike = {
  id: string;
  propertiesAvailable?: boolean;
  fattyAcids?: Record<string, number>;
};

/**
 * Property-ready oils whose fatty-acid profile sums below `minPercent` — their bar-property
 * scores rest on an incomplete profile, so the build surfaces them for review/backfill.
 * Sorted ascending by sum (worst first).
 */
export function incompleteProfileOils(
  oils: OilLike[],
  minPercent = 93,
): { id: string; sum: number }[] {
  const out: { id: string; sum: number }[] = [];
  for (const oil of oils) {
    if (!oil.propertiesAvailable || !oil.fattyAcids) continue;
    const sum = Object.values(oil.fattyAcids).reduce((acc, pct) => acc + pct, 0);
    if (sum < minPercent) out.push({ id: oil.id, sum });
  }
  return out.sort((a, b) => a.sum - b.sum);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/oils-data/src/profile-completeness.test.ts`
Expected: PASS

- [ ] **Step 5: Wire the warning into `validate-canonical.ts`**

In `packages/oils-data/scripts/validate-canonical.ts`, add the import near the other `../src/*` imports:

```typescript
import { incompleteProfileOils } from '../src/profile-completeness.js';
```

After the per-oil loop finishes (just before the `console.log('Validated ...')` summary), add:

```typescript
  for (const { id, sum } of incompleteProfileOils(db.oils)) {
    warnings.push(`${id}: fatty-acid profile only ${sum.toFixed(0)}% complete — properties are estimates`);
  }
```

- [ ] **Step 6: Run the validator and the full suite**

Run: `npm run build:oils && npm run validate:oils`
Expected: `Errors: 0`, and new warnings listing the sub-93% oils (mustard, rapeseed-canola, etc.).

Run: `npm run test -w @soap-calc/oils-data`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/oils-data/src/profile-completeness.ts packages/oils-data/src/profile-completeness.test.ts packages/oils-data/scripts/validate-canonical.ts
git commit -m "feat(oils-data): warn on property-ready oils with incomplete fatty-acid profiles"
```

---

## Final verification

- [ ] Run `npm run test -w @soap-calc/core -w @soap-calc/oils-data` — all green.
- [ ] Run `npm run typecheck -w @soap-calc/core -w @soap-calc/oils-data` — 0 errors.
- [ ] Confirm no `packages/web/*` files were modified (`git status --short | grep packages/web` shows only the concurrent session's pre-existing changes, none from this plan).
