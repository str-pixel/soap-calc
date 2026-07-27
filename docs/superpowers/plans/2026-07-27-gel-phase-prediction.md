# Gel-Phase Prediction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A CP gel-phase likelihood readout under the temperature panel's band note, from the spec's six-row temperature × water decision table.

**Architecture:** Pure core `gel-phase.ts` (`estimateGelPhase({soapingTempF, waterLyeRatio})` → `{likelihood, note}`); `SoapingTemperaturePanel` gains a `waterLyeRatio: number | null` prop and renders the readout + a neutral steer line inside its CP branch; App passes `vm.result?.waterLyeRatio ?? null`.

**Spec:** `docs/superpowers/specs/2026-07-27-gel-phase-prediction-design.md`

## Global Constraints

- Anonymity rule: numeric constants only; original copy.
- CP-only rendering (inside the existing CP band branch); no insight, no batch-sheet line.
- Water axis is the lye-solution ratio; split-liquid/sugar interactions are documented limits, not modelled.
- Commits end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

### Task 1: Core — `gel-phase.ts`

Create `packages/core/src/gel-phase.ts` + test; export from index. Decision table (first match wins): r ≤ 1.1 → ruled_out; t < 80 → ruled_out; t < 100 → unlikely; t < 120 → (r > 2 ? possible : unlikely); t < 140 → (r > 2 ? likely : unlikely); else likely. Thresholds 1.1 (rounding tolerance around true 1:1) and 2.0 (the source's "2:1 or less") documented in code. Notes per likelihood (original copy; `possible` names the partial-gel ring and the move-a-step-warmer-or-cooler advice).

- [ ] RED: table boundaries (150/1.1 ruled_out; 79/3 ruled_out; 95/3 unlikely; 110/2.5 possible; 110/1.8 unlikely; 125/2.4 likely; 125/2.0 unlikely; 150/1.5 likely); notes non-empty; run (module-missing failure).
- [ ] GREEN: implement + `export * from './gel-phase.js';`; run core suite; commit `feat(core): CP gel-phase likelihood (temperature × water decision table)`.

### Task 2: Web — panel readout + App wiring

Modify `SoapingTemperaturePanel.tsx` (+test), `App.tsx`.

- [ ] RED (panel tests): CP at 125 with ratio 2.4 shows `Gel phase: likely`; ratio 2.0 shows `unlikely`; at 110/2.5 shows `possible` + ring note; `waterLyeRatio={null}` renders no gel line; HP variant renders none; steer line ("avoids gel", "encourages") present under CP only.
- [ ] GREEN: prop `waterLyeRatio: number | null`; inside the `band ? (...)` branch render band note, then when `waterLyeRatio !== null` the gel line (`Gel phase: <label> — <note>`) and the static steer line: `Cooler or less water avoids gel; warmer or more water encourages it.` App: `waterLyeRatio={vm.result?.waterLyeRatio ?? null}`. All web tests + tsc; commit `feat(web): gel-phase readout under the CP temperature band`.

### Task 3: Verification + PR

- [ ] Extend the soaping-temperature e2e: default CP recipe asserts `Gel phase: likely` visible (default 33%-of-oils water ≈ 2.4:1 at 125 °F — the spec's documented expectation).
- [ ] Root `npm test`, `npm run build:web`, full e2e. Push `gel-phase-build`; PR `feat: CP gel-phase prediction under the temperature slider`.

## Self-Review (completed)

Spec coverage: core table → T1; panel/App → T2; e2e + docs of default-recipe expectation → T3. Types consistent (`GelLikelihood`, prop `waterLyeRatio: number | null`). No placeholders.
