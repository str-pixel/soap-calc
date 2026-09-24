# Soap Calc — Project Instructions for Codex

## What this is

A soapmaking calculator: lye, water, superfat, and estimated bar properties from a canonical oil database.

Monorepo (npm workspaces, Node >= 20):

```
packages/
  core/        — SAP & lye math (pure TypeScript)
  oils-data/   — Canonical oil database + build pipeline
  web/         — React calculator UI (Vite)
```

Deploy: Railway static build (`railway.json`).

## Standing rules

- **Minimal changes.** Smallest patch that solves the problem. No drive-by refactors.
- **Run the gate before finishing.** `npm run gate` must pass — it is the one command
  that runs what CI runs. `npm test` is NOT the gate: it excludes the Playwright e2e
  suite, which CI runs as a separate job, so a change can pass `npm test` locally and
  still fail CI. Say which one you ran when you report a result.
- **A check must be shown to fail.** When you add anything that verifies something — a
  test, a gate, a guard script — break the thing it watches and confirm it goes red before
  you trust it. Prefer a sensitivity control in the same file over a one-off manual
  perturbation (see `gate-integrity.test.ts`, `published-example-crosscheck.test.ts`). A
  check that cannot fail is indistinguishable from one that is working, and reads the same
  in a diff. Two traps this repo has actually hit: an assertion of ABSENCE
  (`not.toContain`, `queryBy…` → null) proves nothing unless the same test also proves the
  subject was produced; and a measurement taken INSIDE a command cannot observe work that
  happens outside it (a pre-tool hook, a separate CI job).
- **No secrets in code or commits.** `.env` is gitignored.
- **Do not auto-commit or auto-push** unless explicitly asked.
- **Local archives stay outside the repo.** Third-party reference code and research books live at `/Users/str/soap-calc-archive/` (not committed). Production code must not depend on them.
- **Run commands from repo root.** The npm workspace root is `/Users/str/soap-calc`.

## Data sourcing

The canonical oil database currently combines legacy calculator catalog records (`soap_oils.json`) with public-source cross-checks:

| Source | Role |
|--------|------|
| From Nature With Love (FNWL) | Primary SAP (mg KOH/g) + INCI names |
| LDG International | Secondary methodology cross-check; no machine-readable export |
| ISO 3657:2023 | Lab unit conversion |
| EU CosIng | INCI validation: committed names-only inventory snapshot (`cosing-inventory-inci-names.json`, FNWL-independent) plus the FNWL-derived proxy glossary |
| `soap_oils.json` | Legacy fatty-acid profiles and SAP fallback when no FNWL match exists |
| `supplemental-oils.json` | Manual entries such as birch tar |
| `supplemental-inci.json` `inciCorrections` | Highest-priority INCI overrides for malformed FNWL chart values, verified against the EU CosIng Ingredients Inventory; authoritative — the local proxy glossary must never rewrite them |

SAP resolution policy:

- FNWL within 5% of legacy (|legacy − FNWL| ÷ legacy ≤ 5%): use FNWL, confidence `verified`.
- Otherwise, when the oil's fatty-acid profile derives a SAP (≥93% mapped, triglyceride/blend): use whichever of legacy or FNWL lies closer to the profile-derived SAP, confidence `estimated`. A higher SAP is not "safer" — it means more lye and less superfat.
- Otherwise: the midpoint of legacy and FNWL, confidence `estimated`.
- Legacy-only SAP entries are expected data gaps and should stay marked `legacy_only` — except oils whose legacy SAP contradicts their own fatty-acid profile; those get a profile-derived estimate via `LEGACY_SAP_CORRECTIONS` (build-canonical.ts), marked `estimated` with `primarySource: manual` and a recomputed INS.

Birch tar is supplemental (`birch-tar`), estimated from pine-tar proxy SAP, and uses `sapRole: acid_neutralization`. The UI supports `include` vs `additive` tar lye treatment.

When changing oil data, rebuild and validate:

```bash
npm run fetch:sources -w @soap-calc/oils-data # refresh FNWL SAP + INCI charts
npm run build:oils
npm run validate:oils
```

Commit `packages/oils-data/sources/fnwl-sapon.txt`, `fnwl-inci.txt`, `cosing-glossary-index.json`, and `cosing-inventory-inci-names.json` for reproducible offline builds.

## Commands

```bash
npm install

# Oils database
npm run fetch:sources -w @soap-calc/oils-data
npm run build:oils
npm run validate:oils

# Web app
npm run dev:web      # http://localhost:5173
npm run build:web

# The gate: everything CI runs (unit + builds + e2e). Use this before pushing.
npm run gate

# Unit only (typecheck -> validate:oils -> unit tests). NOT the gate: no e2e.
npm test

# Type-check only (tsc --noEmit across all packages)
npm run typecheck
```

Single-package tests:

```bash
npm run test -w @soap-calc/core
npm run test -w @soap-calc/oils-data
npm run test -w @soap-calc/web
```

Browser e2e (Playwright, recipe-UI regressions; auto-starts vite on :5199):

```bash
npx playwright install chromium          # once per machine/CI
npm run test:e2e -w @soap-calc/web
```

## Architecture notes

- `@soap-calc/core` — pure math, no I/O. Export from `src/index.ts`.
- `@soap-calc/oils-data` — builds `data/canonical-oils.json` (full) and `canonical-oils-lite.json` (client bundle).
- `@soap-calc/web` — imports core + oils-data; prebuilds oils data on `dev`.
- Web recipe oils use editable weight and percent together. Weight unit is user-selectable (g, kg, oz, lb); values are stored in grams internally.
- Web supports three water modes: percent of oils, lye concentration, and water:lye ratio.
- Recipe state is local-only: autosaved draft plus named recipes in `localStorage`.

## Formulation features & content

Research notes and third-party coursebooks may inform **features and numeric defaults**, but must not appear in the product as copied prose, branding, recipe names, or exercise titles.

**Copyright-safe rule:** implement ideas and numbers only — property ranges, % of oil weight for additives, split-liquid workflows, formulation heuristics. Do **not** ship book titles, publisher/author branding, distinctive recipe names, exercise names, or paraphrased passages from any single copyrighted source. Do **not** name third-party calculators or archived reference products in user-facing UI or docs. UI copy must be original and short.

**Terminology:** use industry-standard **cold process** (CP) soap language and common supplier/calculator vocabulary:

| Concept | Preferred term in UI/code | Notes |
|--------|---------------------------|--------|
| Process | cold process, CP | Not branded course names |
| Unsaponified oil | superfat, lye discount | Often used interchangeably for CP lye calc |
| Alkali | NaOH, KOH, lye | |
| SAP | SAP value, saponification value | mg KOH/g or g NaOH/g per oil |
| Water in recipe | water as % of oils, lye concentration, water:lye ratio | Same three modes as core `WaterMode` |
| Less water | water discount | Higher lye concentration; faster trace |
| Milk/juice/puree at trace | split liquid, alternative liquid | Lye dissolved in minimum water; rest added later |
| Additive dosing | % of oil weight | Same basis as fragrance “% of oils”; not PPO/teaspoons in new UI |
| Colorant guidance | tsp per lb / per kg of oils | The one sanctioned volume figure (user ruling 2026-09-08): colorants have no sourced weight dose, because grams per teaspoon varies by product. The guidance TEXT quotes the trade's volume rate — a catalog colour ships its own sourced rate with no percent, a custom row gets the broader per-kind band and its derived percent. The dose FIELD stays % of oil weight |
| Legacy additive shorthand | PPO (per pound of oils) | Recognize in imports; prefer % of oil weight in UI |
| Bar metrics | hardness, cleansing, conditioning, bubbly, creamy, longevity, INS, iodine | Fatty-acid weighted sums (common CP calculator convention) |
| Optional guidance | formulation insights, recommended ranges | Heuristic hints, not errors |
| Presets | recipe preset, built-in recipe | Descriptive names (e.g. “balanced four-oil bar”), not third-party recipe titles |

When adding formulation guidance, cite **behavior** (e.g. “lye concentration outside typical CP range”) not **sources**. Property guide constants belong in `@soap-calc/core` with neutral names (e.g. `FORMULATION_PROPERTY_GUIDE`), not branded identifiers.

## Workflow

- Branch: `main` (solo dev).
- After `npm run build:web`, output is in `packages/web/dist/`.
- Railway build: `npm run build:oils && npm run build -w @soap-calc/web`.
