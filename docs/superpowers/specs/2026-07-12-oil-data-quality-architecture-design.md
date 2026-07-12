# Oil data-quality architecture — design

**Date:** 2026-07-12
**Status:** Draft for review
**Supersedes:** `2026-07-12-oil-profile-consistency-gate-design.md` (that spec's gate is now one workstream of five)
**Packages:** `@soap-calc/core` (derivation + properties), `@soap-calc/oils-data` (build, resolution, gate), `@soap-calc/web` (FA panel)

## Problem

The canonical oil data has three classes of defect, all of which currently ship **silently** (no flag, full-confidence presentation):

1. **Incomplete fatty-acid profiles → wrong property scores.** 27 property-ready oils have profiles summing <93% (mustard 45%, canola-rapeseed 44%, coconut 89%), because major acids are absent from the data — and `palmitoleic`/`behenic` have no key anywhere in the system. Coverage is computed by *weight of oils that have a profile*, not profile *completeness*, so a 45%-complete oil reports 100% coverage. Mustard's conditioning shows ~41 when reality is ~85; the Fatty-Acid panel renders "Saturated 4% · Unsaturated 41%" — chemically impossible (must total ~100%).

2. **SAP overshoot from max-selection.** Two rules bias SAP high: `parse-fnwl` keeps the **highest** of duplicate FNWL rows "for lye safety", and `resolvePrimarySap` takes `max(legacy, fnwl)` in the 5–10% band. Higher SAP = more lye = erodes the superfat buffer (the safety inversion). Grounded against four independent charts, this pushes a handful of oils above consensus (avocado, fractionated coconut, cupuaçu, grapeseed).

3. **Display groups don't span the dataset's acids.** The FA panel's six bars omit eicosenoic/docosenoic/docosadienoic/erucic, so meadowfoam (95%-complete) renders all bars at 0% and broccoli hides its 50% erucic. This is a *display* bug independent of the data — the profiles are complete.

## Grounded evidence

- **Derivation accuracy (tested on complete-profile oils):** profile-derived SAP matches stored SAP to **1.0% median** on `verified` oils (excellent gate) but 10–29% on exotics/unsaponifiables (so it *checks*, never *replaces*). Iodine: median ~3.5% but a bad tail (conjugated acids, saturated small-denominator) → advisory only.
- **Completeness bug:** 27/119 property-ready oils <93%; worst cases off ~2×; shipped at 100% coverage.
- **SAP consensus (4 external sources):** SoapCalc (149 oils, our legacy origin), InMySoapPot (40), Alfa Chemistry (46), FNWL ranges. Catalog agreement is **~85–92% within 3%** per source. Disputed oils resolved by consensus (table below).
- **No source is authoritative:** SoapCalc carries carrot/papaya's exact bug; Alfa has palm-kernel wrong (0.156 vs 0.176 consensus). Only the fatty-acid profile caught carrot. This is the core justification for the architecture.

### Multi-source consensus — disputed oils (NaOH SAP)

| Oil | Ours | SoapCalc | InMySoapPot | Alfa | Consensus | Action |
|---|---|---|---|---|---|---|
| avocado | 0.144 | 0.133 | 0.133 | 0.133 | **0.133** | ↓ (reverts to legacy 0.186 KOH) |
| fractionated coconut | 0.248 | 0.232 | 0.232 | — | **0.232** | ↓ |
| cupuaçu | 0.159 | 0.137 | — | — | **0.137** | ↓ |
| grapeseed | 0.138 | 0.129 | 0.134 | — | **~0.131** | ↓ |
| sesame | 0.138 | 0.134 | 0.133 | 0.133 | **~0.133** | ↓ (mild) |
| rice bran | 0.136 | 0.133 | 0.128 | 0.128 | **~0.130** | ↓ (mild) |
| baobab | 0.136 | 0.143 | 0.143 | — | **0.143** | ↑ (investigate: verified but low) |
| palm-kernel | 0.176 | ~0.176 | 0.178 | 0.156 | **0.176** | keep (Alfa is the outlier) |

## Architecture principle

**The fatty-acid profile is the independent oracle; external charts are a consensus cross-check; neither is imported blindly.** One completeness metric (`mappedPercent = Σ mapped acid %`) serves three uses: completeness-aware coverage, SAP tiebreaking, and the consistency gate. This supersedes the earlier "add a gate" framing — the gate is one facet; completeness is the load-bearing fix.

## Workstreams (phased, in dependency order)

### Phase 1 — Completeness-aware coverage + flag (highest impact, no data dependency)

Fixes defect #1 and the sat/unsat-panel nonsense at the source.

- **`@soap-calc/core/fatty-acids.ts`:** coverage becomes completeness-weighted. An oil contributes `weight × (profileSum/100)` to characterized weight; scores renormalize over characterized **fatty-acid** weight, not covered **oil** weight (a one-level-finer generalization of the existing renormalization). Effect: 100% mustard → 45% coverage → the existing `LOW_COVERAGE_PERCENT` (80) estimate flag fires; a 90%-olive/10%-mustard recipe → ~94% coverage, error bounded by the incomplete oil's weight share.
- **`validate-canonical.ts`:** **warn** (ranked, not build-blocking) on property-ready oils below a completeness floor. Do **not** error — 8 oils sum <80% and would block the build. Optionally set `propertiesAvailable = false` on the sub-80% eight as a small data change so properties aren't offered for a 45%-complete oil.
- **Add `palmitoleic` + `behenic` keys** to the data model, classified correctly: `palmitoleic` (C16:1, a monounsaturate) → `condition` + `UNSATURATED_ACIDS`; `behenic` (C22:0, a long-chain **saturated** acid) → `SATURATED_ACIDS` and, like stearic, `hardness`/`longevity`. No oil carries them yet, so this is a no-op on scores until backfill — but it unblocks avocado/macadamia/sea-buckthorn (palmitoleic) and pracaxi (behenic) completeness later.

**Residual (honest):** renormalizing a *heavily* incomplete solo profile can be wrong in either direction (assumes missing acids distribute like known ones). The coverage **flag**, not the renormalized score, is the safety net. Error is bounded in aggregate by the missing weight fraction.

### Phase 2 — FA-panel display groups (small, parallel, no data dependency)

Fixes defect #3. In the web FA panel's `DISPLAY_GROUPS`, add coverage for the long-chain MUFAs (eicosenoic/docosenoic/erucic) — either a labelled "long-chain / other unsaturated" bar or fold them into an existing group. Also relabel `lauricMyristic` (it sums C8–C10 too but the band is the lauric+myristic band) and reconsider the linolenic "Typical 0–1%" band (ordinary canola/soy/hemp cross it). Scope: 2 oils render wrong today (meadowfoam, broccoli); labels are cosmetic.

### Phase 3 — SAP resolution rewrite (fixes the overshoot; validated by consensus)

Fixes defect #2.

- **`parse-fnwl.ts`:** among duplicate rows, select the **median** `sapKoh`, not the max. Grounded: this changes only avocado materially (0.202 → 0.188); the other 26 duplicate groups shift ≤1.6% (within noise).
- **`resolvePrimarySap`:** replace `max(legacy, fnwl)` with **"source closest to the profile-derived SAP"** when the profile is complete enough (≥93% mapped); fall back to **midpoint** (not max) otherwise, with the rationale relabelled honestly (*consistency*, not "lye safety"). Grounded: fixes the 3 overshoot oils where MAX disagrees with chemistry (FCO, murumuru, tamanu); agrees with the other 7.
- **Per-oil:** the two changes above should reproduce the consensus column. Validate against the consensus table. `baobab` (low, `verified`) has no overshoot to unwind — flag for individual review, likely a `LEGACY_SAP_CORRECTIONS`-style bump to 0.200 KOH.
- **Safety note:** these move SAP values *down* toward consensus (less lye), which is the safe direction; re-verify each shifted oil's `sapNaoh`/`mgKOH` consistency and rebuild.

### Phase 4 — Profile-consistency gate (the guard against regressions)

The earlier spec's content, now scoped as the guard. Pure `deriveChemistryFromProfile(profile)` in core (SAP from mean-FA MW, IV from double-bond count, INS dropped — tabulated values legitimately deviate). Tiered check in `validate-canonical.ts`: SAP contradiction → **error** for `verified`/`estimated`, **warn** for `legacy_only`; IV advisory (abs+rel guard, skip conjugated); category gate excludes waxes/tars/free acids (triglyceride formula doesn't model them). `ACKNOWLEDGED_DEVIATIONS` map (day-one: `buriti-oil`, carotenoids). Test-enforced so the acknowledgement set can't drift. This is what would have caught carrot before it shipped.

### Phase 5 — Profile backfill (incremental accuracy)

- **USDA FoodData Central** (CSV/JSON bulk, public domain) for the ~40 common oils USDA covers — snapshot + map to our ids, fill missing acids (incl. palmitoleic). Needs a real API key (1000/hr) or bulk download; DEMO_KEY (30/hr) is insufficient.
- **Codex CXS 210** SAP/IV/FA-composition *ranges* (~34 named oils) as an authoritative range cross-check (PDF extraction, one-time).
- Exotic butters (murumuru, buriti, andiroba…) stay **flagged estimates** — no source covers them; irreducible without supplier COAs.

## Data-model changes

- `FattyAcidProfile` gains `palmitoleic`, `behenic` (schema already `z.record(string, number)`, so no schema change; only the property-list constants and any backfilled values).
- No change to `CanonicalOil` shape. SAP corrections continue through `LEGACY_SAP_CORRECTIONS` / resolution; both alkalis (`sapKoh`, `sapNaoh`, `sapMgKohPerGram`) stay derived and consistent.

## Source hierarchy (trust tiers)

1. **Fatty-acid profile** (internal oracle — caught carrot/papaya) + **Codex CXS 210** (lab-authoritative ranges)
2. **FNWL** (supplier ranges) · **USDA FDC** (public-domain profiles, no SAP)
3. **Consensus of SoapCalc + InMySoapPot + Alfa** (hobbyist/supplier charts — cross-check only; each has individual errors)
4. Never: blind import of any single chart.

## Testing

- **core:** `deriveChemistryFromProfile` vs known oils (olive ~0.190, coconut ~0.257); completeness-aware coverage (100% mustard → ~45% coverage → estimate flag; mixed recipe error bounded).
- **oils-data:** `parse-fnwl` picks median of synthetic duplicates; `resolvePrimarySap` picks profile-closest; profile-consistency gate errors on synthetic off-profile `verified` oil and passes when acknowledged; drift guard `{error-tier} === {acknowledged}`; rebuilt disputed oils land within tolerance of the consensus table.
- **web:** FA panel renders a nonzero bar for meadowfoam; sat+unsat guard.

## Honest residuals

- Incomplete profiles renormalize as *flagged estimates*, not exact, until backfilled.
- A profile wrong-but-internally-consistent with a wrong SAP is uncatchable without an external source; Codex/consensus covers common oils, exotics stay flagged.
- IV check is noisy (advisory only) but is the sole iodine detector — kept, guarded.
- SAP consensus rests on hobbyist charts for exotics; treated as cross-check, never authority.
