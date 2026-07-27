# Soaping Temperature — Design Spec

**Date:** 2026-07-27
**Status:** Approved (user decisions recorded below)
**Packages:** `@soap-calc/core` (new soaping-temperature module, trace-speed, insights), `@soap-calc/web` (settings, new panel, view model, batch sheet)

## Problem

The app has no soaping-temperature input. `processProfile` carries cook temps for HP/LS
(`temp: TempTarget | null`) but CP is `temp: null`, and ProcessGuidePanel tells CP users only
*"soap at a comfortable working temperature; no cook."* The CP reference actually gives a
four-band table with distinct effects, plus three hard relationships — none of it modelled.

## Source data (verified against the three references)

**CP starting temperature (oils + lye), four bands:**

| °F | °C | Effect | Typical use |
|---|---|---|---|
| 140–160 | 60–71.1 | Accelerated trace | High-melting fats (stearic/palmitic/beeswax); slow-tracing castile |
| 120–130 | 49.9–54.4 | Average trace | **Most commonly recommended.** Standard recipe |
| 80–100 | 27–37.7 | Slowed | Higher water, sugars/purées, high castor |
| 64.4–86 | 18–30 | Slowed (most) | High water, low palmitic/stearic, high sugar/sorbitol, milks |

Bands overlap by design (86–100 sits in two) and the bottom band is open-ended ("or
lower"). Resolution is therefore **threshold-based and total**: ≥140 accelerated, ≥120
average, ≥80 slowed, below that slowed-most — no temperature resolves to nothing. The
printed ranges are display copy only.

**Hard relationships:**
- Starting temperature **over 160 °F** significantly increases mold-overflow risk. (The
  source prints "160°C / 71°C" — a typo: 71 °C **is** 160 °F, and the surrounding four-band
  table caps at 160 °F. Read as 160 °F. Recorded here so it isn't "corrected" back.)
- Temperature and reaction rate are directly correlated — the explicit basis for feeding
  trace speed.
- Gel needs both heat and water; below 100 °F gel is unlikely, a 1:1 solution needs >212 °F.
  **Not modelled this arc** (user descoped gel prediction) — but the bands' text carries the
  qualitative note.

**HP:** LTHP 120–160 °F, HTHP "heat oils to 215 °F/102 °C" (ceiling 240 °F) — both already in
`processProfile`, now independently corroborated. HP source also corroborates CP: oils and
lye "often kept below 100 °F".

**LS:** CPLS no external heat; LTLS low heat throughout; **HTLS heats oils to 215 °F/102 °C**.
The last figure upgrades `ls-hightemp`'s `// unverified` 180–215 upper bound to sourced.

## User decisions

1. **Scope:** slider + warnings + trace-speed driver. **Not** gel prediction.
2. **Range:** process-aware min/max/default.
3. **Units:** °C primary with °F alongside (`52 °C (125 °F)`), no new unit setting.

## Design

### 1 · Core — `soaping-temperature.ts` (new, pure)

```ts
export type SoapingTempEffect = 'accelerated' | 'average' | 'slowed';
export type SoapingTempBand = {
  lowF: number; highF: number;
  effect: SoapingTempEffect;
  /** Behavior-only note shown under the slider. Original copy, no source wording. */
  note: string;
};

/** CP starting-temperature bands, highest-first (threshold resolution, total). */
export const CP_SOAPING_TEMP_BANDS: readonly SoapingTempBand[];

/** The band tempF falls in — total: every finite temperature resolves to a band
 * (thresholds ≥140 / ≥120 / ≥80 / below). */
export function soapingTempBand(tempF: number): SoapingTempBand;

/** Above this CP starting temperature, mold-overflow risk rises sharply. */
export const CP_OVERFLOW_RISK_F = 160;

export function fToC(tempF: number): number;
```

### 2 · Core — trace speed gains temperature

`estimateTraceSpeed` takes `soapingTempF?: number`. **The web passes it only for CP** —
the deltas are calibrated against CP's "average" 120–130 band; feeding HP's 215 °F cook
temperature through a CP calibration would double-count what HP's process already implies. Relative to the "average" 120–130 band:
`>=140 → +15`, `120–139 → 0`, `100–119 → −7`, `80–99 → −15`, `<80 → −20`; driver strings
`'warm soaping temperature'` / `'cool soaping temperature'`. Omitting the arg keeps today's
behavior exactly (pinned by a regression test). These weights are heuristic and tunable in
the same spirit as the existing `sugarBoost: 15` — the function's doc already says trace
speed has no verified constant; the doc gains the temperature term's rationale.

### 3 · Core — overflow insight

`soaping_temp_high` (warning) when `process === 'cp'` and `soapingTempF > CP_OVERFLOW_RISK_F`.
**CP-gated deliberately:** HP and LS run at 215 °F by design; an ungated threshold would
warn on correct HP practice. New input field `soapingTempF?: number`.

### 4 · Web — the setting

`RecipeSettings.soapingTempF: string` (string like every other numeric setting).
`normalizeSettings` coerces via the existing `settingString` pattern; `DEFAULT_SETTINGS`
carries the CP default `'125'` (mid of the most-recommended band).

**Staleness guard: clamp at read, never rewrite (review amendment).** The app keeps
independent per-process drafts, so cross-process staleness is rare — the real path is a
VARIANT switch inside a process (LTHP 140 °F → HTHP, floor 205). Rather than extending
`coerceSettingsForProcess` (which never sees variant switches), a single
`effectiveSoapingTempF(settings, variant)` clamps the stored value into the variant's
slider range at READ time; the panel, insights, trace speed and batch sheet all consume
the effective value. The stored setting changes only when the user moves the slider — a
tab/variant detour loses nothing. Per-process seeding: each process's `defaultSettings`
partial carries its own default (CP '125', HP/LS their variant defaults), so new drafts
start right rather than relying on the clamp. Serialization: `recipeFile` + draft storage
inherit the field through the existing settings paths; an absent value in an old saved
recipe falls back to the default and, failing that, the clamp.

### 5 · Web — slider range per process

New `processProfile` helper `soapingTempRangeFor(variant): { minF, maxF, defaultF }`:
- CP / CPLS (`temp: null`): 60–170 °F, default 125. (Range brackets the source's four bands
  with a little headroom; the 170 top lets a user exceed 160 and see the warning fire.)
- Otherwise from `profile.temp`: min `lowF − 10`, max `ceilingF ?? highF`, default
  `lowF === highF ? lowF : round((lowF + highF) / 2)`.

### 6 · Web — `SoapingTemperaturePanel`

Rendered between `RecipeOilsPanel` and `AdditivesPanel` (App.tsx ~397–406), matching the
user's "after the oils section".

- Range input, step 1 °F, `aria-label="Soaping temperature"`, value read/written as °F.
- Readout: `52 °C (125 °F)`.
- Under it: the resolved band's effect + note — **CP only** (the bands are bar-soap copy:
  gel phase, molds). Every other variant, including CPLS, shows its profile-based target
  (or, for CPLS, a neutral no-external-heat note) with the existing verified/estimate
  hedging — unverified variants keep their "≈" treatment.
- The overflow warning surfaces through the existing insights list, not as panel-local copy
  (one source of truth for warnings).

### 7 · Web — batch sheet

`buildBatchSheetData` gains `soapingTempF`; the sheet prints it as `52 °C (125 °F)`.
Temperature is a bench instruction and the sheet is what you work from — omitting it would
be the notable gap.

### Non-goals

- Gel-phase prediction (descoped by the user; source supports it — a clean follow-up).
- No °F/°C unit setting (decision 3).
- No change to `processProfile`'s existing `temp` values or their verified/unverified
  markers; the LS 215 °F corroboration is recorded as a comment only, since the shipped
  180–215 range already contains it.
- Lye and oil temperature are not split into two inputs: the sources give a single starting
  temperature for both (CP explicitly pairs them).

## Test plan

Core: band resolution incl. the overlap rule (100 °F → slowed band; 130 °F → average),
totality at the edges (165 °F → accelerated; 55 °F → slowed-most); `CP_OVERFLOW_RISK_F` pinned at 160; `fToC` spot values; trace speed
unchanged without the arg (regression), faster at 150 vs 125, slower at 70 vs 125, driver
strings; `soaping_temp_high` fires >160 under CP only, silent at exactly 160, silent for
HP/LS at 215.
Web: default 125 for CP; slider writes the setting; readout shows both units; band text
switches with temperature; HP shows the variant target instead of CP bands; effectiveSoapingTempF clamps an
out-of-range stored value into the variant range without rewriting the setting (LTHP 140
viewed under HTHP reads 205; back under LTHP reads 140 again); a saved recipe without the
field loads at the default; batch sheet carries the effective figure.
Full suite + `tsc --noEmit` + build + e2e.
