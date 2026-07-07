# Oil data sources (committed snapshot)

## FNWL saponification chart

- **URL:** https://www.fromnaturewithlove.com/downloads/sapon.txt
- **Refresh:** `npm run fetch:fnwl -w @soap-calc/oils-data`
- **License posture:** Public reference table published by supplier; used for SAP cross-check and INCI names with attribution in `canonical-oils.json` methodology block.

## FNWL INCI chart

- **URL:** https://www.fromnaturewithlove.com/downloads/inci.txt
- **Refresh:** `npm run fetch:fnwl-inci -w @soap-calc/oils-data`
- Maps `PRODUCT_ID` from the SAP chart to INCI names. Build joins this to canonical oils and generates `cosing-glossary-index.json`.

## LDG International

- **URL:** https://www.ldg.international/saponification-chart/
- **Role:** Secondary SAP cross-check using identical **mg KOH/g** lab methodology (ISO 3657).
- LDG does not publish a machine-readable export (2026). When an FNWL match exists, build adds an `ldg` source record with the FNWL SAP range in mg KOH/g and a methodology note — not a separate LDG scrape.

## ISO 3657:2023

- Defines lab measurement in **mg KOH per gram**. Conversion constants live in `@soap-calc/core`.
- Supplier Certificates of Analysis use this format — future `supplier_coa` source type.

## EU CosIng

- **URL:** https://ec.europa.eu/growth/tools-databases/cosing/
- EU CosIng bulk export is not available via a stable public API. Build validates INCI names against `cosing-glossary-index.json` (unique INCI strings from the FNWL INCI chart, which follows CosIng/INCI nomenclature).
- Oils with resolved INCI get a `cosing` provenance source when the name appears in the local glossary index.

Run `npm run build:oils` after fetching sources to regenerate `data/canonical-oils.json`.

## Supplemental oils (`supplemental-oils.json`)

Manual entries for ingredients **not** in SoapCalc/`oils.json` (e.g. birch tar). Merged at build time after the legacy catalog. Use `primarySource: manual`, document proxy SAP in `sources`, and set `sapRole: acid_neutralization` for wood tars.

Build also emits `data/canonical-oils-lite.json` for the web client (SAP fields, INCI when available, plus fatty-acid profiles when available).
