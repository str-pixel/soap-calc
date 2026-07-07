# Soap Calc

A modern soapmaking calculator — lye, water, superfat, and bar properties from a verified oil database.

## Data sourcing

Oil SAP values are built from **public reference tables**, not scraped calculator sites:

| Source | Role |
|--------|------|
| [From Nature With Love](https://www.fromnaturewithlove.com/resources/sapon.asp) | Primary SAP (mg KOH/g) + INCI names |
| [LDG International](https://www.ldg.international/saponification-chart/) | Secondary SAP cross-check (mg KOH/g methodology; FNWL range when LDG export unavailable) |
| [ISO 3657:2023](https://www.iso.org/standard/85171.html) | Lab unit conversion (mg KOH/g → coefficients) |
| [EU CosIng](https://ec.europa.eu/growth/tools-databases/cosing/) | INCI validation via FNWL INCI chart → local glossary index |
| Supplier COA | Batch-specific overrides (planned) |

Legacy fatty-acid profiles come from `soap_oils.json` (calculator reference data).

## Packages

```
packages/
  core/        — SAP & lye math
  oils-data/   — Canonical oil database + build pipeline
  web/         — React calculator UI (Vite)
```

## Commands

```bash
npm install

# Refresh FNWL public SAP + INCI charts and rebuild canonical database
npm run fetch:sources -w @soap-calc/oils-data
# or individually:
npm run fetch:fnwl -w @soap-calc/oils-data
npm run fetch:fnwl-inci -w @soap-calc/oils-data
npm run build:oils
npm run validate:oils

# Web app
npm run dev:web      # http://localhost:5173
npm run build:web    # packages/web/dist

npm test
```

Output: `packages/oils-data/data/canonical-oils.json` — oils with per-field source provenance (see `sources/excluded-oils.json` for omitted legacy entries).  
Client bundle uses `canonical-oils-lite.json` (slim fields only).

## Deploy (Railway)

Static build via `railway.json`:

```bash
railway up
```

Build: `npm run build:oils && npm run build -w @soap-calc/web` · Start: `serve dist` on `$PORT`.

The oils build fetches FNWL `sapon.txt` automatically when the cached source file is missing (`ensure:fnwl`). Commit `packages/oils-data/sources/fnwl-sapon.txt` for reproducible offline builds.

## Local archives

Third-party reference code and research books are kept outside this repository:

`/Users/str/soap-calc-archive/`

They are not used in production builds or tests.
