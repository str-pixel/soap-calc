# Iodine-consistency gate — design

**Date:** 2026-07-19
**Status:** Proposed (spec review)
**Related:** `2026-07-12-oil-profile-consistency-gate-design.md` (the SAP-vs-profile gate this parallels), `profile-sap-deviations.ts`, `profile-sap-consistency.test.ts`

## Context

The oils build derives SAP from the fatty-acid profile and gates stored SAP against it
(`classifyProfileSapDeviations` → `validate-canonical` errors on the carrot class). The
same derivation (`deriveChemistryFromProfile`) also computes an **iodine value**, but the
build **discards it**: iodine is carried straight from legacy data (`let iodine =
leg.iodine`) and is only ever overridden by `LEGACY_SAP_CORRECTIONS.iodine` — which fires
**only for non-FNWL oils**. So stored iodine has never been reconciled with the profile,
and FNWL-matched (`verified`) oils have **no iodine-correction path at all**.

A consistency scan (stored iodine vs profile-derived iodine) surfaces a glaring,
previously-invisible corruption:

> **`pomegranate-seed-oil` (verified): stored iodine 22, profile-derived ~232.** A
> 78%-triene oil cannot have IV 22; real pomegranate seed oil is ~200. Off by ~10×.

and a tail of lesser contradictions. No current check catches any of them.

## Goal

Add an **iodine-consistency gate** to the oils build — the iodine analogue of the SAP
gate — that (1) blocks the build on gross stored-vs-profile contradictions (corruption),
(2) surfaces moderate disagreements as a documented review backlog, and (3) provides a
reusable iodine-correction path that works for FNWL-matched oils. Fix the three
clear-corruption cases in-scope; defer the moderate backlog to follow-up PRs.

## Non-goals

- Not making profile-derived iodine the **source** of stored iodine. Measured/published
  iodine stays authoritative; the profile-derived value is a **cross-check**, and it is a
  *noisier* oracle than the SAP one (see Key asymmetry). This gate flags disagreement; it
  does not auto-overwrite.
- Not resolving the full moderate backlog (~13 oils) — those are follow-up PRs, row-by-row.
- Not the published-range (external) gate or the pH feature (separate specs).

## Key asymmetry vs the SAP gate (drives the whole design)

For **SAP**, the profile is the *more* trustworthy oracle, so a deviation means the stored
SAP is suspect → error. For **iodine the trust is inverted**: profile-derived iodine
- rounds polyunsaturates high (iodine is hypersensitive to the 2–3-double-bond acids), and
- mishandles **conjugated** acids — punicic (pomegranate), where each C=C adds less iodine
  than the double-bond count implies, so derived **over**-estimates true IV.

Consequence: among moderate deviations the **stored** value is often the correct one and
the **profile** overshoots (e.g. `walnut` stored 145 / derived 158 — real ~145;
`raspberry` 163 / 182 — real ~155). Therefore the gate must **not** error on mere
deviation the way the SAP gate does — only on gross contradiction, and it must treat the
moderate band as human-reviewed backlog, not auto-fixable.

## Design

### 1. Deviation metric & threshold — hybrid (grounded)

For each `triglyceride`/`blend` oil with a ≥93%-mapped profile (same gate as
`deriveChemistryFromProfile`, which returns `null` below that):

```
derived = deriveChemistryFromProfile(fattyAcids).iodineValue
absΔ    = storedIodine − derived
relΔ%   = 100 · absΔ / derived
flagged = |absΔ| ≥ 10  AND  |relΔ%| ≥ 8
```

**Why hybrid, not pure relative or pure absolute** (all grounded against current data):
- Pure **relative ≥8%** flags 1-unit noise on low-IV oils (`aloe-butter`/`monoi`: stored 9
  vs derived 10 → −10%) and explodes (`nutmeg` +924%). Rejected.
- Pure **absolute ≥12** is clean but **misses `murumuru`** (gap 11 IV units) — a real
  corruption case (stored 25, real ~13). Rejected.
- **`|absΔ|≥10 AND |relΔ%|≥8`** catches murumuru, excludes the 1-unit noise, and yields a
  focused 18-oil flag set. Chosen.

Threshold constants live in the new module (`IODINE_ABS_THRESHOLD = 10`,
`IODINE_REL_THRESHOLD_PCT = 8`), mirroring `SAP_DEVIATION_THRESHOLD_PCT`.

### 2. Tiering (two bands + acknowledgments)

```
tier(oil) =
  acknowledged   if oil.id ∈ KNOWN_PROFILE_IODINE_DEVIATIONS      // real reason, non-blocking
  error          else if flagged AND |relΔ%| ≥ 25 AND confidence ∈ {verified, estimated}
  warn           else if flagged                                   // moderate / legacy_only
  (none)         otherwise
```

- **error** = *gross* contradiction (|relΔ%| ≥ 25) on a trusted value — the corruption band
  (pomegranate-class). `validate-canonical` errors, blocking the build until the value is
  corrected or acknowledged. The 25% bar (vs the 8% flag bar) is the deliberate expression
  of the trust-asymmetry: only *gross* gaps block; moderate ones don't. (25% is a
  corruption heuristic — beyond measurement noise and PUFA-rounding — not a physical law.)
- **warn** = the review backlog — reported, non-blocking. Includes legacy_only gross gaps
  (low-confidence data shouldn't block, matching the SAP gate's legacy→warn rule).
- **acknowledged** = `KNOWN_PROFILE_IODINE_DEVIATIONS: Record<id, reason>` — **real reasons
  only** (unsaponifiables, conjugation, no-standard). Not a dumping ground for
  unreviewed backlog; that is what `warn` is for.

### 3. New module `packages/oils-data/src/profile-iodine-deviations.ts`

Mirrors `profile-sap-deviations.ts`: exports the thresholds, `KNOWN_PROFILE_IODINE_DEVIATIONS`,
types `ProfileIodineDeviationTier`/`ProfileIodineDeviation`, and
`classifyProfileIodineDeviations(oils): ProfileIodineDeviation[]` (sorted by id, signed
`absDelta`/`relDeltaPct` rounded). Reuses `deriveChemistryFromProfile`; skips non-glyceride
categories and incomplete profiles.

### 4. Iodine-correction path (new, works for FNWL-matched oils)

The existing `LEGACY_SAP_CORRECTIONS.iodine` only applies in the no-FNWL branch, so it
cannot fix `pomegranate` (verified). Add an **`IODINE_CORRECTIONS: Record<baseSlug, {
iodine: number; note: string }>`** applied in `build-canonical` **after** SAP resolution,
regardless of FNWL match, overriding `iodine` and recomputing `ins = round(sapKoh·1000 −
iodine)`. `validate-canonical` asserts the built iodine equals the correction (single
source of truth), mirroring how SAP corrections are validated.

### 5. `validate-canonical` integration

Mirror the SAP loop (~line 269): iterate `classifyProfileIodineDeviations(db.oils)`, push
`errors` on `error` tier (message: gross iodine-vs-profile contradiction; correct via
`IODINE_CORRECTIONS` or acknowledge after review), `warnings` on `warn`. Add a dedicated
**iodine-deviation section to the build report** (ranked by |relΔ%|) so the backlog is
visible rather than buried among generic warnings.

## Data dispositions (the 18 flagged oils)

**Fixed in-scope** (each verified against a 2nd independent source during execution;
targets below are the current estimates to confirm):

| oil | conf | stored→target | after fix | disposition |
|---|---|---|---|---|
| pomegranate-seed-oil | verified | 22 → ~200 | still flagged (derived 232, punicic conjugation) | `IODINE_CORRECTIONS` **+ acknowledge** residual |
| sacha-inchi | legacy_only | 141 → ~193 | clears (rel −5%) | `IODINE_CORRECTIONS` |
| murumuru-butter | estimated | 25 → ~13 | clears | `IODINE_CORRECTIONS` |

**Acknowledged in-scope** (real reason, no authoritative fix):

| oil | reason |
|---|---|
| nutmeg-butter | trimyristin + volatile unsaponifiables → measured IV ≫ triglyceride-profile IV (already SAP-acknowledged) |
| tallow-deer | community-only animal fat, no compositional standard to correct against |
| pomegranate-seed-oil | conjugated punicic acid: measured IV ~200 below the ~232 the linolenic-mapped profile implies |

**Deferred to follow-up PRs** (moderate `warn` backlog, row-by-row per the arc's method):
`camelina`, `cranberry`, `milk-thistle`, `raspberry`, `sea-buckthorn`, `baobab`, `walnut`,
`hazelnut`, `palm-stearin`, `almond-butter`, `argan`, `cherry-avium`, `tallow-goat`.
Ranked list emitted in the build report.

After the in-scope fixes + acknowledgments, **the error tier is empty at launch** (no
build break); the gate's forward value is: a *new* oil with a gross iodine/profile
contradiction errors the build, and any moderate drift lands in the reported backlog.

## Tests (TDD)

1. `profile-iodine-deviations.test.ts` — unit tests for `classifyProfileIodineDeviations`:
   hybrid threshold boundaries (abs-only / rel-only / both), low-IV noise excluded
   (aloe/monoi fixture), tier assignment (gross verified→error, moderate→warn,
   acknowledged→acknowledged, legacy gross→warn), incomplete/non-glyceride skipped.
2. `profile-iodine-consistency.test.ts` — the **drift guard**, but scoped to the stable
   band to avoid churn: assert the **error tier is empty** over the built catalog (no
   un-acknowledged gross contradiction ships), and that every `KNOWN_PROFILE_IODINE_DEVIATIONS`
   id still actually deviates (no stale acknowledgments). Warn-tier membership is
   informational (not exact-matched), since many moderate oils sit near the boundary.
3. `iodine-corrections` validation test — built iodine and `ins` equal the correction table
   for the three fixed oils (mirrors the SAP-correction validation).

## Risks & mitigations

- **Profile oracle is noisy (conjugated/rounded PUFA).** Mitigated by the 25% error bar +
  acknowledgment path; moderate band is review-only, never auto-fixed.
- **Drift-guard churn** near the flag boundary. Mitigated by asserting only the stable
  error-tier + no-stale-acknowledgments, not exact warn-set membership.
- **Correction targets wrong.** Each in-scope fix is 2nd-sourced during execution before
  commit (verify-before-commit); targets in this spec are estimates.
- **Shared checkout** (concurrent agent moves HEAD): land on an isolated branch/worktree,
  stage explicit paths (never `git add -A`).
- **Incomplete-profile oils are not checked** (mapped <93% → `deriveChemistryFromProfile`
  returns null, so they're skipped — same accepted scope as the SAP gate). A bad iodine on
  a <93% oil won't be caught here; it remains covered only by the existing completeness gate.

## Rollout

Single focused PR: new module + `IODINE_CORRECTIONS` + validate/report wiring + the three
fixes + acknowledgments + tests. Follow-up PRs drain the moderate backlog row-by-row. User
merges explicitly ("merge PR #N").
