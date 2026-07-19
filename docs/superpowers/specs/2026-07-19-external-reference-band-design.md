# External-reference sanity band — design

**Date:** 2026-07-19
**Status:** Proposed (spec review)
**Related:** `2026-07-19-iodine-consistency-gate-design.md` (the internal iodine gate this complements; it names "the published-range (external) gate" as a separate spec — this is it), `profile-sap-deviations.ts` / `profile-iodine-deviations.ts` (the pure-classifier pattern mirrored here), `books for research/analysis_soap-calc-crosscheck/` (the source reference data).

## Context

The oils build now has two **internal** consistency gates: stored SAP vs profile-derived SAP (`classifyProfileSapDeviations`) and stored iodine vs profile-derived iodine (`classifyProfileIodineDeviations`). Both ask the same question — *does a stored value agree with this oil's own fatty-acid profile?* — and both blind-spot the same failure: an oil whose stored value **and** profile agree with each other but are both wrong versus measured reality. The internal gate cannot see that; nothing derived from the profile can.

Independent measured data exists but is wired into nothing. Two files sit in `soap-calc-archive/books for research/analysis_soap-calc-crosscheck/` (outside the repo, so the build cannot read them):

- `oil-property-ranges.deidentified.json` — published min/max iodine + KOH/NaOH saponification ranges for ~50 oils (de-branded; AOCS-style).
- `research-papers-crosscheck.json` — point iodine/SAP values from three named, citable papers (Giakoumis 2018, Toscano 2012, Warra 2010), verified this session by two independent blind reads + first-principles arithmetic.

A dry run of a candidate band against the live 133-oil catalog (below) shows this data would flag six oils today — two already on the internal iodine backlog (corroboration) and **four that no internal gate can catch** (`mango-seed-oil`, `pecan-oil`, `tamanu-oil-kamani`, `coffee-bean-oil-green`).

## Goal

Add an **external-reference sanity band** to the oils build: a second gate that flags stored iodine and SAP values falling outside the range independent published sources report. Warn-only (never blocks), reported in the build report and validator warnings, guarded by a drift test. It is the app-vs-world complement to the app-vs-profile internal gates.

## Non-goals

- **Not blocking.** External references can reflect a different cultivar/sample/refinement, so a disagreement means "a human should look," never "corruption." Only the internal profile gates block the build.
- **Not auto-correcting** stored iodine/SAP. Corrections remain a separate, human-reviewed step (the existing `IODINE_CORRECTIONS` / `sap-corrections` path).
- **No UI surface.** Build/validate reporting only.
- **Not a new data-collection effort.** Uses exactly the two cross-check files already produced (vendored into the repo from the archive).

## Key facts (verified against the live catalog, not assumed)

- The catalog stores `sapKoh` in **g KOH/g** (olive `0.19`) but also carries **`sapMgKohPerGram`** (olive `190`), populated on **133/133** oils. The band is defined in **mg KOH/g** and compared against `sapMgKohPerGram` directly — no `×1000` conversion, so that unit-bug surface does not exist.
- `iodine` is a plain iodine-value number (olive `85`, palm `53`) — same unit as every reference, no conversion.
- Reference files map to app ids via an `appId` field already present in each.

## Design

### 1. Reference data — vendored, generated, reproducible

**Source files are vendored into the repo** so regeneration is reproducible by any dev/CI, not dependent on the out-of-repo archive. Copy the two cross-check files into `packages/oils-data/reference/external-sources/` (both are anonymity-safe: `oil-property-ranges` is de-branded, `research-papers-crosscheck` is citable). The archive folder is only where they were authored; the in-repo copies are the source of truth for the generator. The `bandExclude` edit (below) lives in the **in-repo** copy.

A generator script (`packages/oils-data/scripts/build-external-references.ts`) reads those in-repo sources and emits one committed file:

`packages/oils-data/data/external-property-references.json`

Shape (keyed by app `id`; `sources`/`sourceCount` live *inside* each property, since a source may supply one property but not the other):

```jsonc
{
  "_about": "Pooled external published iodine/SAP references per app oil id. GENERATED from reference/external-sources/ by scripts/build-external-references.ts — do not hand-edit. sap in mg KOH/g.",
  "oils": {
    "palm-oil": {
      "iodine": { "min": 47.8, "max": 55, "sourceCount": 2, "sources": ["toscano2012", "oil-property-ranges"] },
      "sapKoh": { "min": 190, "max": 209, "sourceCount": 2, "sources": ["oil-property-ranges", "toscano2012"] }
    }
  }
}
```

(Real values. Palm iodine `[47.8, 55]`: Toscano 47.8/52.5 + AOCS range `[49,55]`, with Giakoumis's 43.2 excluded per the anomaly rule. Palm SAP `[190, 209]`: AOCS `kohSapPpt [190,209]` with Toscano 199.1/200.1 sitting inside. Warra has no palm, so it is not a palm source.)

Generator rules:

- **Pool** every available iodine point (Giakoumis reported IV, Toscano IV, Warra IV, and both ends of each `oil-property-ranges.iv`) into one `[min,max]`; likewise SAP from Toscano `sapValueKOH`, Warra `sapValueKOH`, and `oil-property-ranges.kohSapPpt` (KOH only — never mix the NaOH column).
- **Honor triangulated anomalies.** A source point flagged as a triangulated outlier is excluded from band construction so a known-bad value cannot define an edge (palm/Giakoumis 43.2 is the motivating case). The current `_anomalies` field is prose a generator cannot parse, so **add `"bandExclude": true`** to the relevant per-oil entry in the in-repo `research-papers-crosscheck.json` (palm's Giakoumis entry), keeping the prose `_anomalies` for humans. The generator drops any point with `bandExclude`. (Giakoumis entries carry iodine only, so the flag is unambiguous today; if a future multi-property source needs partial exclusion, scope the flag to the property, e.g. `bandExclude: ["iodine"]`.)
- **`sourceCount` counts distinct source *datasets*, not points.** A published min/max range (`oil-property-ranges`) is **one** source that contributes two band points; Toscano's crude+refined rows are **one** source (`toscano2012`) contributing two points. So an oil covered only by the AOCS range has `sourceCount: 1` even though its band already has width. Record `sourceCount` and `sources` per property, after exclusions — the band's confidence signal, and the input to single-source widening.
- Oils with no external data are simply absent (no entry → not judged).

The vendored output JSON is what ships and what the gate imports. Regeneration is a documented dev step (like the FNWL snapshots), not part of the runtime build.

### 2. Classifier — pure module

`packages/oils-data/src/external-reference-deviations.ts`, mirroring `profile-sap-deviations.ts`:

```ts
classifyExternalReferenceDeviations(
  oils: OilLike[],
  refs: ExternalReferenceTable,
): ExternalReferenceDeviation[]
```

- `OilLike = { id; iodine?; sapMgKohPerGram? }` — **no category filter.** Unlike the internal gates (which need a glyceride backbone to derive), this one only compares numbers, so coverage is defined solely by the reference table. Any oil with an entry is judged.
- For each oil with a reference, for each property present (`iodine`, `sapKoh`), flag when the stored value is **below `min − T_low` or above `max + T_high`**. Tolerance is computed **per side** against that side's edge: `T_low = max(ABS, REL * min)`, `T_high = max(ABS, REL * max)` (the `[min−T, max+T]` shorthand elsewhere hides this).
- **Tolerance constants** (named exports; base iodine/SAP margins provisional — see Calibration, single-source factor decided):
  - iodine: `IODINE_ABS_TOL = 5`, `IODINE_REL_TOL = 0.05`.
  - sap: `SAP_ABS_TOL = 4` (mg KOH/g), `SAP_REL_TOL = 0.03`.
  - **Single-source tolerance:** `SINGLE_SOURCE_TOL_FACTOR = 1` (no widening) — the calibration decision. `T_low`/`T_high` would be multiplied by this factor when `sourceCount === 1`, but a factor of `1` leaves them unchanged. A lone reference is weak evidence, but widening it would also hide real app-vs-world outliers the gate exists to catch (`pecan-oil` is the motivating case — a widened band would have suppressed it). Every single-source disagreement is surfaced as a `warn` at base tolerance; confirmed false positives from a lone weak reference are silenced individually via `KNOWN_EXTERNAL_REFERENCE_DEVIATIONS` (e.g. coffee 85 vs a lone `100`, base low edge 95 — flags, then is acknowledged), never by loosening the lever for every oil.
- **Two tiers only** (warn-only design): `acknowledged` if the `id:property` key is in `KNOWN_EXTERNAL_REFERENCE_DEVIATIONS` (reviewed reason), else `warn`.
- Each deviation: `{ id, property: 'iodine' | 'sapKoh', stored, band: [min,max], sourceCount, deltaOutside, tier, reason? }`. `deltaOutside` = signed distance past the nearest tolerance edge (0 inside, used for ranking). Sorted by `id`, then `property`.

```ts
// Keyed by `${id}:${property}` — one oil can deviate on iodine and SAP independently,
// so an oil id alone cannot identify which deviation is acknowledged.
export const KNOWN_EXTERNAL_REFERENCE_DEVIATIONS: Record<string, string> = {
  // reviewed, source-attributed reasons only; empty until calibration adds real entries.
  // e.g. 'coffee-bean-oil-green:iodine': 'lone AOCS-style point (100) reads high vs the
  //      typical ~80–90 for green coffee oil; app value 85 retained pending a 2nd source',
};
```

### 3. Integration

- `validate-canonical.ts`: after the iodine-deviation loop, import the reference table and push a `warnings` line per deviation — including `sourceCount` and band, e.g. `pecan-oil: stored iodine 113 outside published band [100,106] (2 sources) — review which side is right`. Acknowledged entries print their reason. **No `errors.push` — this gate never fails validation.**
- `build-canonical.ts`: `report.externalReferenceDeviations = classifyExternalReferenceDeviations(oils, refs)` before the report is written — the ranked external backlog, parallel to `report.iodineDeviations`.

### 4. Tests

- `external-reference-deviations.test.ts` (unit, synthetic refs): stored inside band → none; outside on the high side → warn; outside on the low side → warn; just inside tolerance → none; single-source widening turns a borderline gap that would warn at n≥2 into no-warn, **but a large single-source gap still warns**; an oil that deviates on both iodine and SAP yields two deviations, and acknowledging only `id:iodine` leaves the SAP one as `warn`; acknowledged `id:property` → acknowledged tier + reason; oil absent from refs → skipped; SAP compared in mg KOH/g against `sapMgKohPerGram` (a value like `190` in-band, `19` or `1900` out).
- `external-reference-consistency.test.ts` (drift guard against shipped `canonical-oils.json`): every `id:property` key in `KNOWN_EXTERNAL_REFERENCE_DEVIATIONS` still actually appears as a deviation on that property (no stale acknowledgment). **No "zero warn" assertion** — warns are an expected, evolving backlog, not a failure.
- Generator gets a small unit test: pooling picks correct min/max, `bandExclude` points are dropped, `sourceCount` counts post-exclusion.

### 5. Calibration (explicit first implementation step, not a claim)

Base iodine/SAP margins (`T = max(5, 5%)`) are **provisional**, tuned by running the gate against the live catalog and inspecting the flag set — exactly how the internal gates' thresholds were set. The single-source lever was calibrated separately, in the same way: an initial widened factor (`2`) was found to silently suppress `pecan-oil` — a spec-advertised app-vs-world catch — so the factor was set to `1` (no widening) and every single-source disagreement now surfaces as a `warn`, with confirmed false positives acknowledged individually. This is the resulting live flag set (6 oils, base tolerance, single-source factor `1`):

| oil | property | stored | band | note |
|---|---|---|---|---|
| cherry-kernel-oil-avium | iodine | 128 | [110,118] | also on internal iodine backlog (corroborated) |
| coffee-bean-oil-green | iodine | 85 | [100,100] | **single source**, lone point reads high vs typical ~80–90; flags at base tolerance (low edge 95) → acknowledged, app value kept pending a second source |
| hazelnut-oil | iodine | 97 | [83,90] | also on internal iodine backlog (corroborated) |
| mango-seed-oil | iodine | 60 | [39,48] | internal-invisible — real app-vs-world catch — open warn |
| pecan-oil | iodine | 113 | [100,106] | internal-invisible — real app-vs-world catch — open warn |
| tamanu-oil-kamani | iodine | 111 | [82,98] | internal-invisible — real app-vs-world catch — open warn |

Coverage: 52/133 oils have an iodine reference, 52/133 a SAP reference; **zero SAP flags** today (all stored SAP already sits within published ranges — the SAP half is a forward regression guard). The gate fires on all 6 of these oils today; five stay open `warn` (backlog) and one (`coffee-bean-oil-green:iodine`) is `acknowledged` with a reviewed, source-attributed reason in `KNOWN_EXTERNAL_REFERENCE_DEVIATIONS`. No threshold is loosened to hide a real disagreement.

### 6. Isolation

Implemented in a dedicated git worktree branched off `feat/iodine-consistency-gate`, because a concurrent agent already moved HEAD once this session (shared-checkout hazard). Stage explicit paths only; no push/PR unless asked.

## Risks / limitations

- **Partial self-reference.** Some stored iodine/SAP values may themselves originate from the `oil-property-ranges` data, making that half of the band non-independent. The three research-paper sources are the genuinely independent signal. The gate is only as trustworthy as its sources; it flags for review, never asserts truth.
- **Sparse/single-source bands** are weak; mitigated by `sourceCount` surfacing and single-source tolerance widening, not by hiding them.
- **Low current hit rate is expected and fine** — the enduring value is a forward guard against bad future edits plus the four app-vs-world catches the internal gates structurally cannot make.

## Definition of done

Generator + vendored reference JSON committed; `classifyExternalReferenceDeviations` + tests green; validator emits warn-only lines with source counts; `report.externalReferenceDeviations` populated; drift test guards acknowledgments; `npm test` (typecheck + validate:oils Errors:0 + workspace tests) passes; calibrated thresholds and any acknowledgments recorded with source-attributed reasons.
