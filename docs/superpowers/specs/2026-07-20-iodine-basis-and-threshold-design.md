# Iodine derivation basis fix + gate-threshold recalibration — design

**Date:** 2026-07-20
**Status:** Proposed (spec review)
**Related:** `2026-07-19-iodine-consistency-gate-design.md` (the gate this corrects), `packages/core/src/fatty-acid-chemistry.ts` (`deriveChemistryFromProfile`), `packages/oils-data/src/profile-iodine-deviations.ts` (the gate's thresholds), `research-papers-crosscheck-corpus` memory (the ±scatter and oil-basis evidence).

## Context

`deriveChemistryFromProfile` computes two derived properties in the same function, on **two different bases**:

- **SAP** — `(3·KOH) / (3·meanMolarMass + GLYCERYL_ADJUSTMENT)` — triglyceride (**oil**) basis; the `GLYCERYL_ADJUSTMENT = 38.049` term accounts for the glycerol backbone.
- **Iodine** — `Σ(percent · doubleBonds · 253.809 / MW_fattyAcid)` — **fatty-acid** basis; no glyceryl term.

The iodine field is documented as *"g I₂ / 100 g **oil**"* (`fatty-acid-chemistry.ts:62`), and an iodine value is by definition a Wijs measurement on the **oil**. So the derived iodine contradicts both its own contract and its sibling SAP calc, and runs **~4.38% high** (verified range 0–5.58%; 0% only for fully-saturated profiles). This was confirmed empirically: oil-basis-corrected derivation matches published Wijs values for the cleanest cases (coconut 9.4 = 9.4, soybean 128.1 ≈ 128.2), where the current FA-basis value overshoots.

The internal iodine gate (`classifyProfileIodineDeviations`) compares **stored** iodine (oil-basis, measured Wijs) against this **FA-basis** derived value, so it carries a systematic ~4.4% bias toward "stored looks low." **This is the sole consumer of the FA-basis iodine** — verified: `build-canonical` reads only `deriveChemistryFromProfile(...).sapKoh`; shipped `iodine`/`ins` come from stored iodine (`build-canonical.ts:217,310,394`); `profile-iodine-deviations.ts:65` is the only reader of `derived.iodineValue` in the repo. So correcting the derivation has **no blast radius beyond the gate** (and the unused `derived.ins`).

Separately, per-oil iodine values scatter **±10–16% across independent published sources** (research-papers cross-check). The gate's moderate warn threshold (`IODINE_REL_THRESHOLD_PCT = 8`) sits *below* that natural scatter, so it flags cross-source disagreement as if it were data error. Correcting the basis removes the 4.4% bias but **does not** fix this — the scatter dominates.

## Goal

Two small, independent corrections to the iodine gate's accuracy:

1. **Fix the derivation basis:** make `deriveChemistryFromProfile`'s iodine oil-basis, consistent with its SAP calc and its documented contract, so the gate compares like-with-like.
2. **Recalibrate the warn threshold** above the measured cross-source scatter, so the moderate warn tier flags genuine outliers rather than literature spread.

## Non-goals

- **Not changing shipped `iodine` or `ins`.** Those derive from *stored* iodine, not from `deriveChemistryFromProfile`; they are untouched. Only the gate's oracle and the (unused) `derived.ins` change.
- **Not touching the error/gross tier.** `IODINE_GROSS_PCT = 25` (and the saturated-profile rule) is robust in either basis and stays as the build-blocking bar.
- **Not re-deriving stored iodine from profiles.** Measured/published iodine stays authoritative; the derived value remains a cross-check oracle.
- **Not the external-reference band.** That gate (`feat/external-reference-band`) compares stored vs published oil-basis values and never calls this derivation — unaffected.

## Design

### Part 1 — oil-basis iodine in `deriveChemistryFromProfile`

`meanMolarMass` is already computed for the SAP formula. Apply the same glyceryl factor to the iodine sum:

```ts
// FA-basis sum (per mapped %), then convert to oil (triglyceride) basis with the same
// glyceryl factor the SAP calc uses — the derived IV is defined per 100 g of OIL.
const glycerideFactor = (3 * meanMolarMass) / (3 * meanMolarMass + GLYCERYL_ADJUSTMENT);
const iodineValue = iodineValueFaBasis * glycerideFactor;
```

- The factor equals `3·meanMW / (3·meanMW + 38.049)` — the fatty-acyl mass fraction of the triglyceride, mirroring the SAP denominator. For a C18-dominant oil it is ~0.956 (the ~4.4% correction); for a fully-saturated profile the iodine is 0 and the factor is moot.
- `ins = round(sapKoh·1000 − iodineValue)` is recomputed with the corrected value. `derived.ins` has **no consumer** (shipped INS uses stored iodine), so this is internal-only.
- Update the `DerivedChemistry.iodineValue` doc to note it is now genuinely oil-basis (matching the existing contract text).

**Test additions** (`fatty-acid-chemistry.test.ts`): a known oil whose profile yields a published oil-basis IV (e.g. coconut → ~9.4, soybean → ~128) now derives within ~1–2 units of the published Wijs value, not ~4–5% above it. Assert the derived iodine equals the FA-basis sum × `glycerideFactor` for a hand-checked profile.

### Part 2 — recalibrate the warn threshold to the measured scatter

In `profile-iodine-deviations.ts`, raise the **relative** warn threshold from 8% to sit above the ±10–16% cross-source scatter (target `IODINE_REL_THRESHOLD_PCT = 15`, provisional — calibrated against the rebuilt catalog). Keep `IODINE_ABS_THRESHOLD = 10` (absolute floor) and `IODINE_GROSS_PCT = 25` (error bar) unchanged.

- Rationale for 15%: the research-papers cross-check measured per-oil IV scatter of ±10–16% across independent published sources; a warn threshold below that flags spread, not error. 15% sits at the top of the observed scatter so the warn tier surfaces genuine outliers.
- **Calibration step (first in implementation):** rebuild with the oil-basis fix, then inspect the warn set at 15% and confirm it is a short list of real disagreements (not the ~13-oil scatter backlog). Adjust the constant to the data; do not drop below the measured scatter to keep more warns.
- The existing `KNOWN_PROFILE_IODINE_DEVIATIONS` acknowledgments and the consistency drift-guard test are re-verified after the change; any acknowledgment that no longer deviates (because the basis fix or threshold change cleared it) is removed (the drift guard enforces this).

### Ordering (keeps the build green)

1. Apply the basis fix (Part 1) + core tests.
2. Rebuild the oils catalog; the gross/error tier stays empty (pomegranate etc. already corrected, robust in either basis), so validate stays `Errors: 0`.
3. Apply the threshold change (Part 2), recalibrate acknowledgments, re-run the consistency guard.

## Verification

- `deriveChemistryFromProfile` iodine for coconut/soybean lands within ~1–2 units of published Wijs (was ~4–5% high).
- `npm test`: typecheck 0 errors, `validate:oils` **Errors: 0**, all workspace tests pass.
- The moderate warn backlog shrinks to genuine outliers; the gross/error tier and shipped `iodine`/`ins`/`sapKoh` are unchanged (diff the built `canonical-oils.json` — only the gate's report/warnings move, not oil records).
- No consumer of `derived.iodineValue` other than the gate exists (re-confirm by grep before merge).

## Definition of done

Oil-basis iodine in core with tests; warn threshold recalibrated above the measured scatter with acknowledgments re-verified by the drift guard; `npm test` green with `Errors: 0`; shipped oil records unchanged (only the gate's derived-comparison and the unused `derived.ins` move); error/gross tier untouched.
