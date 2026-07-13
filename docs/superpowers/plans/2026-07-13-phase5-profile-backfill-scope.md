# Phase 5 — Profile backfill: scope

**Date:** 2026-07-13
**Status:** Scope for review (not yet an execution plan)
**Parent spec:** `docs/superpowers/specs/2026-07-12-oil-data-quality-architecture-design.md` (Phase 5 + addendum)
**Package:** `@soap-calc/oils-data` (build/validate/data), `@soap-calc/core` (new acid key)

## Objective & boundary

Complete the fatty-acid profiles that are truncated by the inherited SoapCalc 8-acid schema, so property scores and the profile-SAP oracle rest on full compositions. **In scope:** the ~27 property-ready oils summing <93% (the Phase-1 `incompleteProfileOils` set) that have a citable source, plus the one genuinely-wrong profile (`pracaxi`). **Out of scope:** oils already ≥93% (need nothing); waxes/tars/free acids (no triglyceride profile to complete); any automated name-matching (unsafe — see spec's wrong-food list).

## Mechanism — mirror `LEGACY_SAP_CORRECTIONS`

The curated per-oil override pattern already exists for SAP (`src/sap-corrections.ts`, applied by build, asserted by validate, value in one place). Phase 5 adds the profile analogue:

- **New `src/profile-backfill.ts`** — `PROFILE_BACKFILL: Record<oilId, { profile: Record<string, number>; source: string; note: string }>`. `source` is a public citation (USDA FDC `fdcId`, or a literature DOI/PlantFAdb species id) — **numbers + citation only**, no copyrighted prose, no dependency on the uncommitted `/Users/str/soap-calc-archive/`.
- **build-canonical.ts:169** — `const fattyAcids = PROFILE_BACKFILL[baseSlug] ? backfill.profile : parseBreakdown(leg.breakdown)`. Apply as **replace** (single provenance), per spec. Preserve the original legacy breakdown in `sources` for provenance (as SAP corrections keep the legacy SAP). Confidence for a backfilled profile follows the same rule as SAP corrections → `estimated` unless a stronger source.
- **validate-canonical.ts** — assert each built oil's `fattyAcids` equals `PROFILE_BACKFILL[id].profile` (drift guard, like `ESTIMATED_SAP_KOH`), and warn if a backfilled profile still sums <93%.
- Acid keys use the canonical vocabulary (`FATTY_ACID_KEY_ALIASES` + the derivation table); source-specific names normalize through the alias map.

## The `lignoceric` key (C24:0) — code-only, no data

Touch-points (one row each), classified as a long-chain saturate like behenic:
1. `core/fatty-acid-chemistry.ts` `FATTY_ACID_PROPERTIES`: `lignoceric: { molecularWeight: 368.64, doubleBonds: 0 }`.
2. `core/fatty-acids.ts` `RATIO_SATURATED_ACIDS`: add `'lignoceric'`.
3. `core/formulation-guide.ts` `FATTY_ACID_DISPLAY_GROUPS.otherSaturated`: add `'lignoceric'` (the display-group partition test then forces both, as it did for arachidic).
4. `core/properties.ts` `hardness` + `longevity`: add `'lignoceric'` (consistent with behenic; **also fix the arachidic omission flagged in the PR #10 review while here**).

## Critical interaction — the Phase 4 gate

Backfilling a profile to ≥93% makes the oil **judgeable** by `classifyProfileSapDeviations`. Any backfilled oil whose profile-derived SAP disagrees with its stored SAP by >8% newly appears in the deviation classifier — and if it's `verified`/`estimated`, that **fails the build**. This is the point (it surfaces a real SAP-vs-chemistry contradiction), but it means **every backfill row must be reconciled**: either correct the stored SAP (via `LEGACY_SAP_CORRECTIONS`), or add a documented `KNOWN_PROFILE_SAP_DEVIATIONS` entry after human review. No backfill row is "done" until the build is green.

## Backfill set (from the spec addendum)

- **Common (~14), source USDA FDC** — SR-Legacy bulk (public domain, no key) carries 16:1/22:1/C8–C10; Foundation Foods has finest detail for the ~9 it covers. Curated `oil-id → fdcId` table, one row at a time.
- **Exotic (~15), source PlantFAdb + primary literature** — aloe-butter, borage, broccoli-seed, coffee-bean, cupuaçu, evening-primrose, karanja, monoi, moringa, pracaxi, sal-butter, saw-palmetto ×2, sea-buckthorn, tucumã. Most are gap-fill (present acids correct, only untracked acids missing); **`pracaxi` is a full replace** (linoleic 2%→~16%, oleic 44%→~61%). Reconcile inter-study variation (representative study or average, cited).

## Ordered slices (each independently testable, own commit)

- **Slice A — `lignoceric` key** (core, no data): the 4 touch-points above + fix arachidic in properties.ts. Test: derivation table + partition test + properties test. Green with zero data change. *First, smallest, fully mechanical.*
- **Slice B — backfill mechanism + 1 pilot** (`profile-backfill.ts` + build/validate wiring + `avocado` from FDC, which the spec prototyped: 92→100%, recovers palmitoleic ~2.8%). Proves the seam end-to-end incl. the gate interaction on a known-good oil.
- **Slice C — common-oil backfill** (~14 FDC rows): each row = fetch/cite → add to table → build green (reconcile SAP if the gate trips) → commit.
- **Slice D — exotic backfill** (~15 PlantFAdb/literature rows), incl. the `pracaxi` replace.
- **Slice E — sweep**: confirm `incompleteProfileOils` count dropped to only the genuinely-unsourceable oils; `log()` what remains truncated (no silent caps).

## Open decisions (need your call)

1. **Execution shape** — pilot-first (Slices A+B now, then expand row by row with your review) vs. batch the whole thing.
2. **Sourcing labor** — I fetch FDC/PlantFAdb and propose each profile with its citation for your row-by-row approval, vs. you supply the values.
3. **SAP-reconciliation default** when a backfill trips the gate — case-by-case human review each (safest, spec-aligned) vs. a standing rule.
