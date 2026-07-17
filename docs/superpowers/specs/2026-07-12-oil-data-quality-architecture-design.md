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

### Multi-source consensus — *sampled* disputed oils (NaOH SAP)

This is a hand-sampled cross-check, **not** the authoritative disputed set. The authoritative
profile-vs-SAP list is machine-generated and test-enforced (see
`packages/oils-data/src/profile-sap-consistency.test.ts` — 6 complete-profile oils). This table
covers the *incomplete-profile* oils the profile-gate can't judge (avocado, cupuaçu, grapeseed
all <93% mapped) plus spot-checks. The two mechanisms are complementary: profile-gate for
complete profiles, chart-consensus for incomplete ones.

| Oil | Ours | SoapCalc | InMySoapPot | Alfa | Consensus | Action |
|---|---|---|---|---|---|---|
| avocado (92% profile) | 0.144 | 0.133 | 0.133 | 0.133 | **0.133** | ↓ chart-consensus (profile can't judge) |
| cupuaçu (87%) | 0.159 | 0.137 | — | — | **0.137** | ↓ chart-consensus |
| grapeseed | 0.138 | 0.129 | 0.134 | — | **~0.131** | ↓ chart-consensus |
| sesame | 0.138 | 0.134 | 0.133 | 0.133 | **~0.133** | ↓ (mild) |
| rice bran | 0.136 | 0.133 | 0.128 | 0.128 | **~0.130** | ↓ (mild) |
| fractionated coconut | 0.248 | 0.232 | 0.232 | — | **~0.232** | ↓ mild — profile derives 0.328 KOH ≈ charts 0.325; **ours 0.348 is ~6% high** (under the 8% gate, so not auto-flagged, but profile *and* charts agree) |
| baobab | 0.136 | 0.143 | 0.143 | — | 0.143 | **investigate only** — `verified`/FNWL; do **not** override FNWL (tier 2) on hobbyist consensus (tier 3); resolve via profile or Codex |
| palm-kernel | 0.176 | ~0.176 | 0.178 | 0.156 | **0.176** | keep (Alfa is the outlier) |

## Architecture principle

**The fatty-acid profile is the independent oracle; external charts are a consensus cross-check; neither is imported blindly.** One completeness metric (`mappedPercent = Σ mapped acid %`) serves three uses: completeness-aware coverage, SAP tiebreaking, and the consistency gate. This supersedes the earlier "add a gate" framing — the gate is one facet; completeness is the load-bearing fix.

## Workstreams (phased, in dependency order)

### Phase 1 — Completeness-aware coverage + flag (highest impact, no data dependency)

Fixes defect #1 and the sat/unsat-panel nonsense at the source.

- **`@soap-calc/core/fatty-acids.ts`:** only the **coverage %** becomes completeness-weighted; **scores are unchanged** (still renormalized over covered-oil weight). An oil contributes `weight × (min(profileSum,100)/100)` to a new `characterizedWeight`; `coveragePercent = characterizedWeight / totalWeight`. Effect: 100% mustard → 45% coverage → the existing recipe-level estimate flag fires (scores stay at their raw values, now honestly flagged); pure coconut (89% profile) → 89% coverage, **no** score change. **Decision (grounded):** renormalizing scores to full scale was rejected — it would silently inflate scores for 90 of 119 oils in the 80–99% band with no flag (coconut +12%, borage +22%…), reintroducing the silent-wrong-score defect. Coverage-only changes no scores and flags only the 8 sub-80% oils.
- **Three distinct thresholds (do not conflate):** (a) **recipe-level** estimate flag — the existing `LOW_COVERAGE_PERCENT` (80), unchanged; a recipe below 80% characterized shows "~estimated". (b) **per-oil validator warn** — `validate-canonical.ts` warns (ranked, non-blocking) on any property-ready oil whose `mappedPercent` < 93% (the "incomplete profile" review queue). (c) **`propertiesAvailable = false`** — optional data change for the 8 oils below 80% mapped, so a 45%-complete oil doesn't offer properties at all. The validator **warns**, never **errors** here — erroring would block the build on those 8.
- **Add `palmitoleic` + `behenic` keys** to the data model, classified correctly: `palmitoleic` (C16:1, a monounsaturate) → `condition` + `UNSATURATED_ACIDS`; `behenic` (C22:0, a long-chain **saturated** acid) → `SATURATED_ACIDS` and, like stearic, `hardness`/`longevity`. No oil carries them yet, so this is a no-op on scores until backfill — but it unblocks avocado/macadamia/sea-buckthorn (palmitoleic) and pracaxi (behenic) completeness later.

**Residual (honest):** renormalizing a *heavily* incomplete solo profile can be wrong in either direction (assumes missing acids distribute like known ones). The coverage **flag**, not the renormalized score, is the safety net. Error is bounded in aggregate by the missing weight fraction.

### Phase 2 — FA-panel display groups (small, parallel, no data dependency)

Fixes defect #3. In the web FA panel's `DISPLAY_GROUPS`, add coverage for the long-chain MUFAs (eicosenoic/docosenoic/erucic) — either a labelled "long-chain / other unsaturated" bar or fold them into an existing group. Also relabel `lauricMyristic` (it sums C8–C10 too but the band is the lauric+myristic band) and reconsider the linolenic "Typical 0–1%" band (ordinary canola/soy/hemp cross it). Scope: 2 oils render wrong today (meadowfoam, broccoli); labels are cosmetic.

### Phase 3 — SAP resolution rewrite (fixes the overshoot; validated by consensus)

Fixes defect #2.

- **`parse-fnwl.ts`:** among duplicate rows, select the **median** `sapKoh`, not the max. Grounded: this changes only avocado materially — FNWL 0.202 → 0.188, which then brings the legacy/FNWL delta to ~1% (≤5%), so `resolvePrimarySap` takes FNWL 0.188 via the *agreement* path (avocado lands 0.134 NaOH ≈ consensus 0.133; it does **not** "revert to legacy"). The other 26 duplicate groups shift ≤1.6% (within noise).
- **`resolvePrimarySap`:** replace `max(legacy, fnwl)` with **"source closest to the profile-derived SAP"** when the profile is complete enough (≥93% mapped); fall back to **midpoint** (not max) otherwise, with the rationale relabelled honestly (*consistency*, not "lye safety"). Grounded against the core module: MAX overshoots vs the profile on FCO (+6%), murumuru (+18%), tamanu (+8%); agrees on the other 7.
- **Per-oil:** validate rebuilt values against the consensus table. `baobab` (low, `verified` = FNWL-matched) has no overshoot to unwind — **investigate only**; do **not** bump it on hobbyist consensus (that would put tier-3 charts above tier-2 FNWL, violating the source hierarchy). Resolve baobab via its own profile (if ≥93%) or Codex, not the charts.
- **Safety note:** these move SAP values *down* toward consensus (less lye), which is the safe direction; re-verify each shifted oil's `sapNaoh`/`mgKOH` consistency and rebuild.

### Phase 4 — Profile-consistency gate (the guard against regressions)

The earlier spec's content, now scoped as the guard. **The pure `deriveChemistryFromProfile(profile)` (core) and the test-enforced deviation guard already exist** (`packages/core/src/fatty-acid-chemistry.ts`, `packages/oils-data/src/profile-sap-consistency.test.ts`) — Phase 4 promotes them into the `validate-canonical.ts` build gate. SAP from mean-FA MW, IV from double-bond count, INS dropped (tabulated values legitimately deviate). Tiered check: SAP contradiction → **error** for `verified`/`estimated`, **warn** for `legacy_only`; IV advisory (abs+rel guard, skip conjugated); category gate excludes waxes/tars/free acids (triglyceride formula doesn't model them).

**Acknowledgement list is computed *after* Phase 3, not before.** Phase 3 changes stored SAPs, so the error-tier set shifts; the day-one list is whatever the guard test then holds — currently **6 complete-profile oils** (nutmeg, buriti, cohune, ucuuba, murumuru, tamanu), not "buriti only." **murumuru is the worked example**: all charts say ~0.275 but the profile derives ~0.233 (higher-than-coconut SAP is implausible for a 15%-oleic butter), so it may be a *carrot-class error the charts share* — a genuine human-decision oil, not a rubber-stamp. The `{deviating oils} === {documented list}` assertion is the drift guard. This is what would have caught carrot before it shipped.

### Phase 5 — Profile backfill (incremental accuracy)

**Origin traced (grounded):** the incomplete profiles are inherited **SoapCalc 8-acid schema truncation** — the legacy source has no `palmitoleic`/`behenic`/`arachidic` column, and adds caprylic/capric/eicosenoic/erucic only when an acid *dominates* an oil. So the "missing %" is literally the untracked-acid content (26 of 27 incomplete oils use only SoapCalc-tracked acids). Guarded by `profile-completeness.test.ts`.

**Backfill source — USDA FoodData Central** (SR-Legacy bulk JSON, 13.5 MB, public domain, **no key**; API DEMO_KEY is rate-limited/truncated — use the bulk file). FDC carries the missing acids in C:D notation (16:1 palmitoleic, 22:1 erucic, C8/C10). Prototype validated: FDC avocado → profile completes 92→100%, recovers palmitoleic 2.8%, and profile-derived SAP (0.193) moves *toward* the consensus, confirming our 0.202 is high.

**CRITICAL — backfill must be curated, never automated.** Name-matching is unsafe: FDC has blends and prepared foods that fuzzy-match ("Oil, corn **and** olive" → olive; "SMART BALANCE margarine" → flax; "mayonnaise" → soybean; "Oil, palm" → palm-**kernel**; "Oil, coconut" → **fractionated** coconut). Of 25 clean `"Oil, X"` candidates, ~14 are safe, ~9 are wrong-food, ~2 need variant disambiguation. Approach: a **human-reviewed** oil-id→fdcId table, applied one row at a time, with the profile-consistency guard (Phase 4) as the automatic check that a match's SAP still agrees. **(A) Replace** the whole profile per approved row (single provenance), not augment.

**Coverage reality:** of 119 triglyceride/blend oils, ~14 backfill cleanly from FDC; ~72 exotic oils are **not in FDC** — but most of those are *already ≥93% complete*, so they need nothing (see addendum for the real backfill set). **Waxes / tars / free acids** (15 oils) are not in FDC and have no triglyceride profile to backfill — their "necessary data" is SAP + INCI, which they already have; correctly excluded by category.

- **Codex CXS 210** SAP/IV/FA-composition *ranges* (~34 named oils) as an authoritative range cross-check for the exotics FDC misses (PDF extraction, one-time).

#### Phase 5 addendum — exotic-oil sourcing (grounded)

**The exotic backfill set is ~15 oils, not 72.** The "72 not in FDC" figure is the FDC-coverage gap; most of those are already complete. The oils that are *both* incomplete (<93%) *and* not FDC-coverable are **15**: aloe-butter, borage, broccoli-seed, coffee-bean-roasted, cupuaçu, evening-primrose, karanja, monoi, moringa, pracaxi, sal-butter, saw-palmetto (×2), sea-buckthorn, tucumã. Several (borage, evening-primrose, broccoli-seed) are common seed oils, so the genuinely-hard residual is **smaller than 15**.

**Mostly gap-fill, not repair (~14 : 1).** Spot-checked 11 of the 15 against their real compositions: all are *truncated-but-plausible* — present acids match reality, only the untracked acids are missing (C8/C10, palmitoleic, behenic, arachidic, GLA). **`pracaxi` is the lone genuinely-wrong entry** (our linoleic 2% vs literature ~16%, oleic 44% vs ~61%) → it needs a full literature *replace*, the others need *gap-fill*.

**Source check — which database has the fine detail** (corrected 2026-07-13 after downloading Foundation Foods and re-checking PlantFAdb access; both earlier verdicts were wrong on specifics):
- **USDA Foundation Foods — best detail, tiny coverage.** Not "no help" as first written. Downloaded (363 foods): only **~9 common oils** (coconut, canola, corn, soybean, olive, peanut, sunflower, safflower — **no exotics**), but each carries **~33 individual fatty acids including 16:1 palmitoleic, 22:1 erucic, AND 24:0 lignoceric** — the **finest granularity of any source checked**, finer than SR-Legacy and far finer than CIQUAL. Use it for the common oils it covers (it also confirms `lignoceric` as real USDA data); SR-Legacy for broader common coverage.
- **CIQUAL (France/ANSES) — NO (verified on real data).** Free, open-licensed, downloadable — but its individual FAs stop at C18 unsaturates: **no 16:1 (palmitoleic), no 20:1, no 22:1 (erucic)**. Confirmed: CIQUAL avocado has no palmitoleic; its rapeseed has no erucic. Insufficient for our gaps. (Same name-match hazard, too: "olive oil" matched *Tapenade*.)
- **PlantFAdb + primary literature — YES (the exotic source).** The lipid literature carries the long-chain acids no food DB reports. **Confirmed on pracaxi**: literature gives behenic 8.4%, lignoceric 4.1%, summing to ~100%. The original SOFA site (`sofa.mri.bund.de`) is **dead** (DNS fails) — the earlier "free after registration" note was doubly wrong. Its living successor **PlantFAdb (plantfadb.org / fatplants.net)** is reachable, server-rendered, browsable per species (`plantfadb.org/plants/[id]`), aggregates FA compositions from the literature, and needs **no login** to view. Primary literature remains the citation of record; PlantFAdb is the aggregator/index.

**Method — curated, multi-source-reconciled, per oil** (like `LEGACY_SAP_CORRECTIONS`): each of the ~15 gets a literature-sourced profile with a citation, **reconciling inter-study variation** (e.g., pracaxi behenic reported 8.4% *and* 16.1% across studies — pick a representative study or average, don't transcribe the first hit). Apply as a **replace** (single provenance); the profile-consistency guard (Phase 4) then SAP-checks each once it clears 93%.

**One new acid key required:** `lignoceric` (C24:0, MW 368.64) — pracaxi and similar carry it; our derivation table has arachidic and behenic but not lignoceric. Classify as `SATURATED_ACIDS` + `hardness`/`longevity` (like behenic). One row.

**Net:** two pipelines — USDA FDC bulk for the ~14 common oils, curated literature for the ~15 (really fewer) exotics — plus the `lignoceric` key. Bounded and mostly gap-fill.

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
