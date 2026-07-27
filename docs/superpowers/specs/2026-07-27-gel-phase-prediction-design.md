# Gel-Phase Prediction — Design Spec

**Date:** 2026-07-27
**Status:** Approved (user decisions: temperature-panel readout; neutral both-ways framing)
**Packages:** `@soap-calc/core` (new `gel-phase.ts`), `@soap-calc/web` (SoapingTemperaturePanel, App wiring)

## Problem

The soaping-temperature arc (#134) shipped the two inputs gel depends on — starting
temperature and water concentration — with only qualitative gel notes in the band copy.
The source gives enough hard relationships for a proper likelihood readout.

## Source claims (verified during the #134 research)

- Gel needs BOTH enough heat and enough water.
- A **1:1 water:lye** solution needs **>212 °F** to gel — unreachable from any slider
  temperature (the source cites a 160 °F-start experiment that still didn't gel).
- At 120–130 °F, **"2:1 or less"** avoids gel; higher water makes gel/partial gel likely.
- **High-water** recipes (2.5–3:1) should start **below 100 °F** to eliminate the risk.
- Below 100 °F gel is "not likely"; below 80 °F (the bottom band) the risk is eliminated.
- At 140–160 °F gel is likely "unless a low water (1:1) concentration is used".
- Both directions are legitimate goals: to gel — raise temperature and/or water; to avoid —
  lower them.

## Design

### Core — `gel-phase.ts` (new, pure)

```ts
export type GelLikelihood = 'likely' | 'possible' | 'unlikely' | 'ruled_out';

/** CP gel-phase likelihood from the two source axes: starting temperature (the EFFECTIVE
 * clamped °F) and the lye-solution water:lye ratio. */
export function estimateGelPhase(args: {
  soapingTempF: number;
  waterLyeRatio: number;
}): { likelihood: GelLikelihood; note: string };
```

Decision table, first match wins (r = water:lye ratio, t = °F):

| Rule | Result | Source anchor |
|---|---|---|
| r ≤ 1.1 | `ruled_out` | 1:1 needs >212 °F; slider tops at 170 |
| t < 80 | `ruled_out` | bottom band "eliminates the risk" |
| t < 100 | `unlikely` | "not likely below 100 °F" |
| t < 120 | r > 2 → `possible`, else `unlikely` | interpolation zone between the two claims; conservative |
| t < 140 | r > 2 → `likely`, else `unlikely` | "2:1 or less" avoids; higher water likely |
| t ≥ 140 | `likely` | "likely unless 1:1" (1:1 already caught above) |

Threshold choices (documented in code): 1.1 rather than exactly 1 tolerates display
rounding around a true 1:1 solution; 2.0 is the source's own "2:1 or less".

Each likelihood carries an original one-line note (e.g. `likely` → full gel expected —
deeper color, slightly faster-feeling cure; `possible` → the partial-gel zone: a visible
ring is the usual outcome — move a step warmer or cooler; `unlikely` / `ruled_out` →
ungelled: lighter, matte finish).

### Web — panel readout (CP only)

`SoapingTemperaturePanel` gains `waterLyeRatio: number | null` (App passes
`vm.result?.waterLyeRatio ?? null` — the displayed, acid-adjusted result). Inside the
existing CP band branch, under the band note:

- `Gel phase: likely — <note>` (label + note from core).
- One static steer line, neutral both ways (user decision): cooler or less water avoids
  gel; warmer or more water encourages it.
- Hidden when `waterLyeRatio` is null (no result) — and never rendered for non-CP variants
  (the readout lives inside the CP branch; HP cooks through gel deliberately, LS has no
  gel concern).

No insight, no batch-sheet line (user picked panel-only placement).

### Documented model limits (in-code comments, not UI copy)

- The water axis is the LYE-SOLUTION ratio — the source's own axis. In-lye alternative
  liquids (split rows) add liquid the ratio doesn't see; sugar-family additives add heat
  the temperature doesn't see (`sugar_total_high` covers that separately). Both are
  understatements of gel drive, acknowledged rather than modelled — the source quantifies
  neither interaction.
- Default CP recipe (33% of oils ≈ 2.4:1 at ~125 °F) reads `likely` — matches the band
  copy that shipped in #134 ("gel/partial gel likely at higher water") and common CP
  experience; not a bug.

## Test plan

Core: every row of the decision table incl. boundaries (r=1.1 at t=150 → ruled_out;
t=79/r=3 → ruled_out; t=95/r=3 → unlikely; t=110/r=2.5 → possible; t=110/r=1.8 →
unlikely; t=125/r=2.4 → likely; t=125/r=2.0 → unlikely; t=150/r=1.5 → likely); notes
non-empty.
Web: CP panel shows `Gel phase:` with the right label at slider extremes; line absent when
waterLyeRatio null; absent under HP/CPLS; steer line present under CP.
Full suite + tsc + build + full e2e (panel DOM grows); extend the existing
soaping-temperature e2e with a gel-label assertion.
