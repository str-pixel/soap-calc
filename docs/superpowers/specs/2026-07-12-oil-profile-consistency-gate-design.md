# Oil profile-consistency gate — design

**Date:** 2026-07-12
**Status:** Draft for review
**Package(s):** `@soap-calc/core` (new pure derivation), `@soap-calc/oils-data` (new gate)

## Problem

Bad values in the canonical oil data are found reactively, one oil at a time, by
hand (this session: carrot-seed SAP `0.144`, its iodine `56`, its INS `0`; papaya
SAP `0.158`; cohune flagged as a suspect). The only automated SAP cross-check today
is against FNWL, which matches ~60 of 134 oils; the other 74 are `legacy_only` with
**no cross-check at all** — exactly where the bad values hid.

Yet 105 of 134 oils already carry a fatty-acid profile, which — as this session
demonstrated — is an independent oracle for SAP, iodine, and (loosely) INS. The
profile is never used to validate anything.

**Goal:** make the build compute profile-derived chemistry and compare it to the
stored values, so contradictions announce themselves. Curated values are never
silently changed; the maintainer is told which oils to look at.

## Decisions (from brainstorming)

- **Behavior:** detect & flag. Never auto-overwrite curated values.
- **Enforcement:** tiered by the existing `confidence` trust levels.
- **Scope:** Phase 1 = the profile-consistency gate (this spec, built now). Phase 2 =
  external Codex range cross-check + derivation coverage extensions (documented here,
  built later). See [Phase 2](#phase-2--external-anchor-documented-not-yet-built).

## Phase 1 — profile-consistency gate

### Component 1: derivation (pure, in `@soap-calc/core`)

New file `packages/core/src/fatty-acid-chemistry.ts`, sibling to `sap.ts`. One
physical-constants table drives all outputs:

```ts
// molecularWeight = free fatty ACID g/mol; doubleBonds = C=C count;
// conjugated marks acids the Wijs iodine method under-titrates (Phase 2 uses it).
export const FATTY_ACID_PROPERTIES: Record<
  string,
  { molecularWeight: number; doubleBonds: number; conjugated?: boolean }
> = {
  caprylic:      { molecularWeight: 144.21, doubleBonds: 0 },
  capric:        { molecularWeight: 172.26, doubleBonds: 0 },
  lauric:        { molecularWeight: 200.32, doubleBonds: 0 },
  myristic:      { molecularWeight: 228.37, doubleBonds: 0 },
  palmitic:      { molecularWeight: 256.42, doubleBonds: 0 },
  stearic:       { molecularWeight: 284.48, doubleBonds: 0 },
  oleic:         { molecularWeight: 282.46, doubleBonds: 1 },
  ricinoleic:    { molecularWeight: 298.46, doubleBonds: 1 },
  linoleic:      { molecularWeight: 280.45, doubleBonds: 2 },
  linolenic:     { molecularWeight: 278.43, doubleBonds: 3 },
  eicosenoic:    { molecularWeight: 310.51, doubleBonds: 1 },
  docosenoic:    { molecularWeight: 338.57, doubleBonds: 1 },
  erucic:        { molecularWeight: 338.57, doubleBonds: 1 },
  docosadienoic: { molecularWeight: 336.55, doubleBonds: 2 },
};

export function deriveChemistryFromProfile(profile: Record<string, number>):
  | { sapKoh: number; iodineValue: number; ins: number; mappedPercent: number }
  | null;
```

Math (constants live next to the existing `sap.ts` KOH/glyceryl values):

- `meanMW = Σ(pctᵢ·mwᵢ) / Σ(pctᵢ)` over acids present in the table
- `sapKoh = 3·56.1056 / (3·meanMW + 38.049)` (glyceryl = glycerol 92.094 − 3·H₂O 18.015)
- `iodineValue = Σ pctᵢ · doubleBondsᵢ · 253.809 / mwᵢ`
- `ins = round(sapKoh·1000 − iodineValue)`
- `mappedPercent = Σ(mapped pctᵢ)` — the share of the whole oil (out of 100) the table
  accounts for. **Not** mapped-over-present: a wax that lists acids summing to 38% of the
  oil must read 38, not 100.

Returns `null` when `mappedPercent < 90` — excluding incomplete profiles and exotic-acid
oils (e.g. pomegranate/punicic) instead of deriving garbage. This completeness check does
**not** by itself exclude waxes/free acids that carry a full acid list (jojoba, japan-wax,
the free-acid ingredients). Those are excluded **structurally by the category gate** in the
check (Component 2): the triglyceride SAP formula is physically wrong for them — wax esters
have no glycerol backbone, and free acids take one KOH per acid, not one per triglyceride.

This function is the single source of truth for the three formulas and is unit-
tested directly (olive → ~0.190, coconut → ~0.257).

### Component 2: the check (pure, in `@soap-calc/oils-data`)

New file `packages/oils-data/src/profile-consistency.ts`:

```ts
export type ProfileDiagnostic = {
  oilId: string;
  metric: 'sap' | 'iodine';
  stored: number;
  derived: number;
  deltaPercent: number;
  severity: 'error' | 'warn';
};

// Pure over a single oil record + the acknowledgements/exemptions. Testable with
// synthetic oils — does NOT read the built file. Diagnostics are a list so Phase 2
// can append Codex-range diagnostics with no change to consumers.
export function checkProfileConsistency(
  oil: CanonicalOil,
  opts: { acknowledged: Set<string>; safetyExempt: (oil) => boolean },
): ProfileDiagnostic[];
```

**Category gate (first, mandatory).** The check runs only for oils whose `category` is
`triglyceride` or `blend` (equivalently `propertiesAvailable === true`). Waxes, wax
esters, free acids, and tars are skipped outright — the derivation does not model them,
so a "disagreement" would be a formula artifact, not a data error. (Known miscategorization
to flag separately: `soybean-fully-hydrogenated` is a saturated triglyceride labelled
`wax`; the gate skips it until its category is fixed — a data fix, not a gate concern.)

For covered oils, tiering:

- **SAP (primary).** `|Δ| > SAP_THRESHOLD_PCT` (8):
  - `confidence === 'legacy_only'` → **warn** (the review queue).
  - `confidence` is `verified` or `estimated` → **error**, *unless* acknowledged or
    safety-exempt (below).
- **Iodine (advisory).** Flag only when `|Δ| > IV_THRESHOLD_PCT` (15) **and**
  `|stored − derived| > IV_ABS_FLOOR` (12) — the absolute floor kills the
  small-denominator noise on saturated/lauric oils. Always **warn**, never blocks
  (iodine is a shelf-life indicator, not a lye-safety number, and the derived value
  is noisier). It is still the *only* automated iodine check — it is what would have
  caught carrot's `56`.
- **INS.** No gate. `INS ≈ SAP·1000 − IV` is only an approximation; ~12 catalog oils
  carry independently-tabulated INS that legitimately deviates (canola 56, coconut-
  fractionated, cupuaçu, tucumã, hemp, flax, both tars…). A gate would flag correct
  data. INS is already made self-consistent at *correction* time in `build-canonical`.

### Component 3: suppression — two mechanisms, not one

An error-tier discrepancy is silenced only by:

1. **Safety exemption (automatic, from provenance).** The existing conservative-blend
   / fnwl-preferred policy in `sap-policy.ts` *intentionally* sets SAP up to ~10% high
   for lye safety. Those deviations are read from the oil's `sources` (the `manual`
   note the policy already writes) and auto-downgraded to **warn** — they are policy,
   not exceptions, and must not require hand-maintenance. Removes murumuru & tamanu
   from the error tier automatically.
2. **`ACKNOWLEDGED_DEVIATIONS: Record<id, reason>`** (in `oils-data/src`, beside
   `GOLDEN_SAP_KOH`/`ESTIMATED_SAP_KOH`). One line per genuinely-anomalous oil the
   provenance can't explain. **Day one: exactly one entry** —
   `buriti-oil` ("carotenoid unsaponifiables; FNWL-confirmed, profile can't see them";
   verified, +10% SAP).

`legacy_only` oils never need an entry — they warn, and that queue is the point.

### Component 4: wiring & output (`validate-canonical.ts`)

- Run `checkProfileConsistency` for every oil; collect diagnostics.
- **error** diagnostics join the existing `errors[]` → non-zero exit (fails
  `npm test`), naming the oil and its Δ.
- **warn** diagnostics print as a **dedicated, ranked, un-truncated section**
  ("Profile review queue", worst Δ first) — separate from the existing warnings, which
  truncate at 15. Burying the queue would defeat its purpose.
- Emit the full stored-vs-derived delta table into `build-report.json` (byproduct
  artifact; no schema/data churn).

### Framing of "error"

An error means *"a `verified`/`estimated` value contradicts its own profile beyond
threshold and nothing explains it — a human must sign off"*, not *"definitely
broken."* A verified FNWL value is a measured number and the profile is approximate;
they can legitimately diverge (cultivar, unsaponifiables). The acknowledgement is the
sign-off.

### Relationship to existing layers

- `LEGACY_SAP_CORRECTIONS` (carrot, papaya) — unchanged; the *fix* layer. The new gate
  now **guards** it: a mis-entered correction makes the corrected (`estimated`) oil
  contradict its profile → **error**. This is precisely the carrot-iodine class of bug
  the gate exists to stop.
- `GOLDEN_SAP_KOH`, `ESTIMATED_SAP_KOH` — unchanged.

### Testing

- **core:** `deriveChemistryFromProfile` against known oils (olive ~0.190,
  coconut ~0.257, a lauric oil); `null` below 90% mapped.
- **oils-data:** `checkProfileConsistency` with synthetic oils — off-profile
  `verified` → error; same oil acknowledged → none; off-profile `legacy_only` → warn;
  safety-exempt oil → warn not error; saturated oil under IV_ABS_FLOOR → no iodine
  warn.
- **drift guard:** a test asserts `{error-tier oils in the built data} ===
  {ACKNOWLEDGED_DEVIATIONS keys}`. New off-profile oil → the *test* fails at PR time,
  not just the build. The acknowledgements list can never silently drift.

### Constants (one place, tunable)

`SAP_THRESHOLD_PCT = 8`, `IV_THRESHOLD_PCT = 15`, `IV_ABS_FLOOR = 12`,
`MIN_MAPPED_PERCENT = 90`.

## Phase 2 — external anchor (documented, not yet built)

Addresses the residual limitations Phase 1 cannot. Built as a separate spec/plan
after Phase 1 ships and the warn queue shows what actually needs it.

- **Codex CXS 210 range table.** A committed, reproducible snapshot (like
  `fnwl-sapon.txt`) of saponification-, iodine-, and fatty-acid-composition *ranges*
  for the ~34 named oils Codex covers, mapped to our ids. Adds a third check: stored
  SAP ∈ range, stored IV ∈ range, profile FA ∈ ranges. Because Codex is independent of
  both our profile and our SAP, it catches a **wrong-but-internally-consistent**
  profile+SAP pair (Limitation 2) for common oils, and a **range** IV check is robust
  where the derived point-estimate is noisy (Limitation 3). Codex is a public FAO/WHO
  standard — same source class as FNWL/ISO/CosIng already cited; policy-compatible.
  Slots in as additional `ProfileDiagnostic`s — no consumer rework.
- **Extend `FATTY_ACID_PROPERTIES`.** Add petroselinic (C18:1, MW 282.46 —
  carrot/parsley family), punicic & α-eleostearic (`conjugated: true`), and long-chain
  acids (gadoleic C20:1, arachidic, behenic, lignoceric, palmitoleic). Raises
  `mappedPercent` so more exotic triglycerides clear the 90% bar (Limitation 1).
- **`conjugated` handling in the IV check.** The Wijs method under-titrates conjugated
  double bonds (confirmed: tung/α-eleostearic measures far below the calculated value,
  while olive/soy/linseed match). Oils containing conjugated acids skip or widen the
  derived-IV comparison; the Codex range check replaces it where available.
- **Free-fatty-acid SAP.** For free-acid ingredients, `sapKoh = 56.1056 / MW`
  (neutralization value 56100/MW in mg KOH/g, expressed as the g/g coefficient; one KOH
  per acid, no glyceryl term). Waxes (jojoba) need
  fatty-*alcohol* composition we don't store → they rely on the Codex/known range check,
  not derivation.

## Limitations (Phase 1, honest)

- **Waxes, wax esters, free acids, and tars are not covered by derivation** — excluded by
  the category gate because the triglyceride formula does not model them, not merely
  "uncovered." They fall back to today's FNWL/legacy checks only. Phase 2 closes this: a
  free-acid SAP formula (`56.1056 / MW`) covers the acid ingredients, and the Codex/known
  range check anchors waxes (e.g. jojoba's known SAP ~92–97). Incomplete triglyceride
  profiles (`<90%` mapped) are likewise uncovered until their profiles are filled.
- A profile that is itself wrong **but internally consistent with** a wrong SAP cannot
  be caught by Phase 1 (no external truth). Phase 2's Codex anchor catches this for the
  ~34 common named oils; exotic butters with unsaponifiables (buriti, murumuru) remain
  profile + FNWL + acknowledgement — an irreducible gap without supplier COAs.
- The derived-IV check is noisier than SAP; it is deliberately warn-only and guarded,
  kept because it is the only automated iodine detector.

## Sources

- Codex Alimentarius CXS 210-1999, *Standard for Named Vegetable Oils* (FAO/WHO) —
  per-oil SAP / iodine / fatty-acid composition ranges.
- Wijs method under-titrates conjugated double bonds — tung-oil biodiesel study,
  *Journal of Wood Science* 67:55 (2021).
- Saponification value = acid value + ester value; free-acid neutralization value —
  ScienceDirect, *Saponification Value* overview.
