# LS Superfat Guardrail + Lye-Excess Neutralization — Design

**Status:** Approved for planning
**Date:** 2026-07-11
**Phase:** 1 (Liquid Soap)
**Depends on:** shipped LS dilution calculator, PCSF module

## Goal

Give liquid-soap (LS) formulators two linked safeguards:

1. **Superfat guardrail** — warn when LS superfat leaves the workable band (1–3%; above ~3% a
   liquid soap clouds and can separate).
2. **Lye-excess neutralization** — let an LS recipe run a deliberate *lye excess* (negative
   superfat = extra KOH, a legitimate technique for guaranteeing a clear soap), then estimate the
   citric acid needed to neutralize that excess down to a finished pH of 9–10.5.

Both are advisory readouts layered on the existing engine. Neither changes the caustic
saponification math; the citric estimate is a finishing-step readout, exactly like the dilution
calculator's "water to add."

A small related fix rides along (§4, review finding #3): the CP-calibrated lye-concentration
warnings are made LS-aware, so a normal KOH paste no longer receives bar-soap advice ("cold-process
range", "warp in the mold"). Threading the LS flag into insights is already required for the
guardrail above, so this is on-path.

## Background / current state

- **Superfat is `≥ 0` only** at both layers. Core `calculateLye` throws when
  `superfatPercent < 0` ([lye.ts:167-174](../../../packages/core/src/lye.ts#L167-L174)); web
  `parseRecipeSettings` rejects it via `parseNonNegative`
  ([parseRecipeSettings.ts:22-28, 92](../../../packages/web/src/lib/parseRecipeSettings.ts#L92));
  and the UI input is `min={0}`
  ([SettingsPanel.tsx:95](../../../packages/web/src/components/SettingsPanel.tsx#L95)). So a lye
  excess is not expressible today.
- Lye is **linear in superfat**: `superfatFactor = 1 − superfatPercent/100`
  ([lye.ts:131](../../../packages/core/src/lye.ts#L131)). A negative superfat is valid math — it
  just means *more* lye than exact saponification.
- **No** citric / neutralize / pH code exists anywhere.
- Insights (`analyzeFormulation`) have **no process awareness**
  ([insights.ts](../../../packages/core/src/insights.ts)).
- The LS `preserve` panel key exists but **renders nothing** — App hardcodes only `DilutionPanel`
  for `process === 'ls'` ([App.tsx:178](../../../packages/web/src/App.tsx#L178)); the `panels[]`
  array is infra-only, not render-driving
  ([process.ts:22-28, 74](../../../packages/web/src/lib/process.ts#L74)).
- `calculateDilution` is the exact pattern to mirror: a pure core function taking raw grams,
  returning a result object or `null` ([dilution.ts](../../../packages/core/src/dilution.ts)).

## Verified formulation constants (used as-is, unattributed)

- LS workable superfat band: **1–3%**; above ~3% clouds/separates.
- Finished LS pH target: **9–10.5**.
- Neutralizer prep: citric acid dissolved **1:4** in hot water (1 part citric : 4 parts water).
- **Never acidify an on-target (neutral) soap** — neutralization applies only to a genuine
  alkali excess.

The citric↔alkali stoichiometry below is public chemistry, not reference-derived.

---

## Design

### 1 · Signed superfat (LS-only negative)

Superfat becomes a signed quantity: negative = lye excess. Negative is permitted **only for LS**;
CP/HP keep the `≥ 0` rule (a lye-heavy bar is unsafe, not a neutralizable technique).

- **Core** [lye.ts:167-174](../../../packages/core/src/lye.ts#L167-L174): relax the lower bound
  from `< 0` to `< NEG_SUPERFAT_FLOOR` where `NEG_SUPERFAT_FLOOR = -5`. Update the error text to
  `between ${NEG_SUPERFAT_FLOOR} and ${MAX_SUPERFAT_PERCENT}`. Negative superfat is valid math;
  core stays process-agnostic (pure engine).
- **Web** `parseRecipeSettings` gains a second argument
  `{ allowNegativeSuperfat }` (default `false`). When `false`, superfat < 0 → `"Invalid superfat %"`
  (unchanged CP/HP behavior). When `true`, superfat in `[-5, 50]` is accepted; below `-5` →
  `"Superfat must be between -5 and 50"`.
- **Threading** (`allowNegativeSuperfat = process === 'ls'`): the only real `calculateRecipe()`
  caller is `useRecipeCalculation → useRecipeViewModel`; ResultsPanel/batchSheet import the *type*
  only. So three signatures change and one call chain carries the flag:
  - `parseRecipeSettings(settings, opts?: { allowNegativeSuperfat?: boolean })` — omitted ⇒ `false`,
    so existing call sites/tests keep current behavior (negative rejected)
  - `calculateRecipe(lines, settings, process?: ProcessId)` — **optional, fail-safe**: omitted ⇒
    `allowNegativeSuperfat = false`. Derives `process === 'ls'` and passes it to
    `parseRecipeSettings`. Optional so existing `calculateRecipe` tests don't all need touching and a
    forgotten arg disables negatives rather than mis-enabling them.
  - `useRecipeCalculation(lines, settings, process: ProcessId)` — **required** here (VM always holds
    `process`), guaranteeing the real call chain always passes it
- **UI** [SettingsPanel.tsx:95](../../../packages/web/src/components/SettingsPanel.tsx#L95):
  `min={process === 'ls' ? NEG_SUPERFAT_FLOOR : 0}` (SettingsPanel already receives `process`).
  Without this the feature is unreachable.

`NEG_SUPERFAT_FLOOR = -5` is a **safety cap, not a recommendation** — real LS lye excess is small.
It is duplicated in core and web (matching the existing `MAX_SUPERFAT`/`MAX_SUPERFAT_PERCENT = 50`
duplication convention).

### 2 · Core `calculateNeutralization` (new pure helper — mirrors `calculateDilution`)

New file `packages/core/src/neutralization.ts`, exported from the core index.

```ts
export type NeutralizationInput = {
  kohGrams: number;        // as-weighed KOH from the lye result (at the negative superfat)
  naohGrams: number;       // as-weighed NaOH from the lye result (dual lye)
  superfatPercent: number; // the (negative) main superfat, e.g. -2
  kohPurityPercent: number;
  naohPurityPercent: number;
};

export type NeutralizationResult = {
  lyeExcessPercent: number;   // magnitude, e.g. 2 for superfat -2
  excessKohGrams: number;     // as-weighed excess KOH (display; consistent with the lye line)
  excessNaohGrams: number;    // as-weighed excess NaOH
  citricAcidGrams: number;    // anhydrous citric estimate (from ACTIVE excess)
  dilutionWaterGrams: number; // 4 × citricAcidGrams (the 1:4 prep)
  targetPhLow: number;        // 9
  targetPhHigh: number;       // 10.5
};

export function calculateNeutralization(input: NeutralizationInput): NeutralizationResult | null;
```

**Returns `null`** when `superfatPercent >= 0`, when `!Number.isFinite`, or when there is no
alkali (`kohGrams <= 0 && naohGrams <= 0`) — the "no excess → nothing to neutralize" case.

**Excess (per alkali).** With `s = superfatPercent < 0`, the lye result is
`grams = grams₀ × (1 − s/100)` where `grams₀` is the exact-saponification (0% superfat) amount.
Back out the as-weighed excess without recomputing the recipe:

```
excess_as_weighed = grams × (−s) / (100 − s)
```

(Check: `grams₀ = 100`, `s = −5` → `grams = 105`; excess = `105 × 5 / 105 = 5` ✓. `100 − s` is
always ≥ 100 for `s < 0`, never zero.)

**Active excess and citric.** Commercial alkali is impure; the pH-driving quantity is the *active*
excess, so multiply by purity (this also keeps the estimate on the safe side — skipping purity
would over-state citric and risk over-acidifying):

```
activeKoh  = excessKoh_as_weighed  × kohPurityPercent  / 100
activeNaoh = excessNaoh_as_weighed × naohPurityPercent / 100
molOH      = activeKoh / 56.1056 + activeNaoh / 39.997          // KOH, NaOH molar masses
citricAcidGrams   = (molOH / 3) × 192.124                        // anhydrous citric, triprotic
dilutionWaterGrams = 4 × citricAcidGrams
```

Constants: citric acid **anhydrous** MW `192.124` (the common soapmaking powder; monohydrate would
be ~9% higher), KOH `56.1056`, NaOH `39.997`. Triprotic citric neutralizes 3 OH⁻. `targetPhLow/High`
are `9 / 10.5`.

### 3 · Mutual exclusivity: lye excess vs. PCSF-subtract  🔴

The VM's `result` is lye-*scaled* by `cookFactor` when the post-cook-superfat method is `subtract`
([useRecipeViewModel.ts:99-111](../../../packages/web/src/hooks/useRecipeViewModel.ts#L99-L111)).
Feeding that scaled lye to neutralization would mis-state the excess in the **dangerous** direction:
a batch that is *net-superfatted* after the post-cook reserve could still be told to add citric —
the exact "never acidify an on-target soap" violation. (Worked example: superfat −4% with
PCSF-subtract 5% nets to a ~1% *superfat*, yet a naïve reading reports ~4 g excess.)

**Rule:** a lye-heavy batch has nothing to reserve against, so **PCSF-subtract does not apply while
the main superfat is negative.** Force `cookFactor = 1` when `Number(previewSettings.superfatPercent)
< 0`, by adding `&& mainSuperfatPercent >= 0` to the existing `cookFactor` condition. Then
`result === fullResult` and neutralization reads a clean, unscaled lye-excess result. A test locks
this in.

### 4 · Insights: LS-aware (new guardrails + fixing a CP-blind warning)

Core `analyzeFormulation` must stay web-agnostic, so thread a plain **`isLiquidSoap?: boolean`**
(**not** the web `ProcessId` — core does not import from web) into `FormulationAnalysisInput`
([insights.ts:23-51](../../../packages/core/src/insights.ts#L23)). The web hook passes it through
`useFormulationInsights`'s `options` object, set from `process === 'ls'`
([useFormulationInsights.ts:45-50, 79](../../../packages/web/src/hooks/useFormulationInsights.ts#L45)).
Omitted ⇒ `false`, so legacy callers keep current behavior.

New guardrail insights:
- **`ls_superfat_high`** — level `warning`. Fires when `isLiquidSoap && superfatPercent > 3`.
  Message: liquid soap above ~3% superfat can turn cloudy and separate; keep LS superfat around 1–3%.
- **`ls_lye_excess`** — level `info`. Fires when `isLiquidSoap && superfatPercent < 0`.
  Message: running a lye excess — neutralize the finished soap to pH 9–10.5 with citric acid
  (dissolved 1:4 in hot water), added gradually and confirmed with a pH test; never acidify a soap
  that is already on target.

Fix a CP-blind warning (review finding #3): the `lye_conc_low` (<20%) / `lye_conc_high` (>38%)
insights ([insights.ts:78-94](../../../packages/core/src/insights.ts#L78)) currently fire for LS
too, with bar-soap wording ("cold-process range", "warp in the mold") — wrong for a KOH paste.
**Gate both on `!isLiquidSoap`** (CP/HP keep them; LS is exempt), and soften "typical cold-process
range" → "typical bar-soap range" so the retained warning reads correctly for HP as well. No
LS-specific concentration insight is added (no verified LS thresholds; YAGNI).

Negative superfat now also reaches the existing superfat-sensitive insights
(`high_cleansing_low_superfat` at `< 6`, `high_poly_high_superfat` at `>= 8`); their behavior stays
sensible (a lye excess reads as very-low superfat). The plan includes an audit step to confirm no
consumer of `superfatPercent` assumes `≥ 0`.

### 5 · UI — `NeutralizePanel` + wiring

- **`packages/web/src/components/NeutralizePanel.tsx`** (new; mirrors `DilutionPanel`), rendered
  after `DilutionPanel` and **gated on an actual excess**:
  `{process === 'ls' && vm.neutralization && <NeutralizePanel neutralization={vm.neutralization} weightUnit={weightUnit} />}`
  ([App.tsx:178-187](../../../packages/web/src/App.tsx#L178)). Prop `neutralization:
  NeutralizationResult` (non-null — App gates on truthiness, so a normal LS recipe at 1–3% superfat
  shows no panel and no clutter). Shows lye-excess %, excess alkali (KOH, plus NaOH when dual), the
  citric-acid estimate, "dissolve in ~`dilutionWaterGrams` g hot water (1:4)", "add gradually to
  pH 9–10.5, verify with a pH test", and the never-over-acidify caution.
- **VM** ([useRecipeViewModel.ts](../../../packages/web/src/hooks/useRecipeViewModel.ts)): compute
  `neutralization` (memoized, like `dilution`) for `process === 'ls'` from `result`
  (which, per §3, equals the unscaled lye when superfat < 0), `Number(previewSettings.superfatPercent)`,
  and the KOH/NaOH purities. Expose on the view model. Citric is a **finishing readout** — it does
  **not** enter `batchWeightWithExtras`, lye, or water (identical to how dilution water-to-add is
  excluded).
- **Batch sheet**: thread `neutralization` into `buildBatchSheetData` → `BatchSheet.tsx`
  (both already receive `process`), appending a neutralization step for lye-excess LS, mirroring how
  `dilution` is threaded ([useRecipeViewModel.ts:228](../../../packages/web/src/hooks/useRecipeViewModel.ts#L228)).

## Data flow

```
superfat < 0 (LS)  ──parse(allowNegativeSuperfat)──▶ calculateLye ──▶ result (cookFactor forced 1)
                                                                          │
                         Number(superfatPercent), KOH/NaOH purity ───────┤
                                                                          ▼
                                              calculateNeutralization ──▶ NeutralizationResult | null
                                                                          │
                                        ┌─────────────────────────────────┼───────────────────────┐
                                        ▼                                  ▼                       ▼
                                 NeutralizePanel                    BatchSheet step         (guardrail insights,
                                                                                             computed separately)
```

Batch weight / lye / water are unaffected (citric is a finishing readout).

## Testing

- **Core `calculateNeutralization`** (`neutralization.test.ts`): KOH-only excess (known citric via
  stoichiometry), dual KOH+NaOH excess (OH⁻ summed), purity applied (90% KOH lowers citric),
  `dilutionWaterGrams === 4 × citricAcidGrams`, `null` when superfat ≥ 0 / zero alkali /
  non-finite.
- **Core `calculateLye`**: accepts superfat `-5`; rejects `-6` (below floor) and still rejects
  `> 50`.
- **Web `parseRecipeSettings`**: with `allowNegativeSuperfat: true`, `-3` parses to `-3` and `-6`
  errors; default (CP/HP) still rejects `-1`.
- **VM**: superfat `-2` (LS) with PCSF method `subtract` → `cookFactor === 1`, and
  `neutralization` reads the unscaled excess (locks §3).
- **Insights**: `ls_superfat_high` fires at LS superfat `4`, not at `2`, not for CP; `ls_lye_excess`
  fires at LS superfat `-2`; `lye_conc_high` fires for CP at 40% but **not** for LS, and
  `lye_conc_low` is likewise exempt for LS (finding #3).
- **`NeutralizePanel`**: renders the lye-excess %, citric estimate, and 1:4 water for a lye-excess
  result (dual lye shows the NaOH excess line too).

## Out of scope / decisions defaulted (adjust in review)

- **Negative floor −5%**, **anhydrous citric**, **separate panel** (not folded into DilutionPanel).
- Neutralization solution water is **not** netted into the dilution target (second-order; kept
  independent for clarity — the two calculators stay decoupled).
- No pH-meter/titration input; the citric figure is a starting **estimate**, always paired with
  "add gradually, verify by test."
- No new preservative/`preserve` panel work — only neutralization.

## File-by-file summary

**Create**
- `packages/core/src/neutralization.ts` — `calculateNeutralization` + types
- `packages/core/src/neutralization.test.ts`
- `packages/web/src/components/NeutralizePanel.tsx` + `NeutralizePanel.test.tsx`

**Modify**
- `packages/core/src/lye.ts` — `NEG_SUPERFAT_FLOOR`, relaxed lower bound + error text
- `packages/core/src/index.ts` — export neutralization
- `packages/core/src/insights.ts` — `isLiquidSoap` field; add `ls_superfat_high`, `ls_lye_excess`;
  gate `lye_conc_low`/`lye_conc_high` on `!isLiquidSoap` + soften wording (finding #3)
- `packages/web/src/lib/parseRecipeSettings.ts` — signed superfat via `allowNegativeSuperfat`
- `packages/web/src/lib/calculateRecipe.ts` — accept optional `process`, derive/pass the flag
- `packages/web/src/hooks/useRecipeCalculation.ts` — accept + pass `process`
- `packages/web/src/hooks/useRecipeViewModel.ts` — cookFactor guard (§3), compute `neutralization`,
  pass `isLiquidSoap` to insights
- `packages/web/src/hooks/useFormulationInsights.ts` — add `isLiquidSoap` to options, forward to
  `analyzeFormulation`
- `packages/web/src/components/SettingsPanel.tsx` — process-aware `min`
- `packages/web/src/App.tsx` — render `NeutralizePanel` for LS
- `packages/web/src/lib/batchSheet.ts` + `components/BatchSheet.tsx` — neutralization step
- Companion test updates for the above
