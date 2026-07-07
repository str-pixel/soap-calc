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
- **Run tests before finishing.** `npm test` must pass.
- **No secrets in code or commits.** `.env` is gitignored.
- **Do not auto-commit or auto-push** unless explicitly asked.
- **Reference folders are read-only.** `soapee.open-main/`, `soapee-ui-master/`, and `soapee-api-master/` are archived reference code — not used in production.
- **Run commands from repo root.** The npm workspace root is `/Users/str/soap-calc`.

## Data sourcing

The canonical oil database currently combines legacy SoapCalc/Soapee oil records with public-source cross-checks:

| Source | Role |
|--------|------|
| From Nature With Love (FNWL) | Primary SAP (mg KOH/g) + INCI names |
| LDG International | Secondary methodology cross-check; no machine-readable export |
| ISO 3657:2023 | Lab unit conversion |
| EU CosIng | INCI validation through the local FNWL-derived glossary index |
| `oils.json` | Legacy fatty-acid profiles and SAP fallback when no FNWL match exists |
| `supplemental-oils.json` | Manual entries such as birch tar |

SAP resolution policy:

- FNWL match within 5% of legacy SAP: use FNWL.
- FNWL/legacy delta from 5% to 10%: use the higher SAP as a conservative estimate.
- Delta above 10%: retain legacy unless FNWL is higher.
- Legacy-only SAP entries are expected data gaps and should stay marked `legacy_only`.

Birch tar is supplemental (`birch-tar`), estimated from pine-tar proxy SAP, and uses `sapRole: acid_neutralization`. The UI supports `include` vs `additive` tar lye treatment.

When changing oil data, rebuild and validate:

```bash
npm run fetch:sources -w @soap-calc/oils-data # refresh FNWL SAP + INCI charts
npm run build:oils
npm run validate:oils
```

Commit `packages/oils-data/sources/fnwl-sapon.txt`, `fnwl-inci.txt`, and `cosing-glossary-index.json` for reproducible offline builds.

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

# All tests
npm test
```

Single-package tests:

```bash
npm run test -w @soap-calc/core
npm run test -w @soap-calc/oils-data
npm run test -w @soap-calc/web
```

## Architecture notes

- `@soap-calc/core` — pure math, no I/O. Export from `src/index.ts`.
- `@soap-calc/oils-data` — builds `data/canonical-oils.json` (full) and `canonical-oils-lite.json` (client bundle).
- `@soap-calc/web` — imports core + oils-data; prebuilds oils data on `dev`.
- Web supports grams and percent entry modes. Percent mode must total 100% before calculating.
- Web supports three water modes: percent of oils, lye concentration, and water:lye ratio.
- Recipe state is local-only: autosaved draft plus named recipes in `localStorage`.

## Workflow

- Branch: `main` (solo dev).
- After `npm run build:web`, output is in `packages/web/dist/`.
- Railway build: `npm run build:oils && npm run build -w @soap-calc/web`.
