---
name: soap-oils-data
description: Use when changing Soap Calc canonical oils, FNWL source snapshots, soap_oils.json, supplemental oils, SAP values, saponification data, INCI validation, CosIng glossary data, or birch tar lye behavior.
---

# Soap Oils Data

## Overview

Oil data is built by `@soap-calc/oils-data` from legacy catalog records plus public-source cross-checks. Read `AGENTS.md` for full policy before changing generated data or source snapshots.

## Source Policy

- FNWL is primary for SAP values and INCI names.
- LDG is a secondary methodology cross-check only.
- ISO 3657:2023 defines lab unit conversion.
- EU CosIng validation uses the local FNWL-derived glossary index.
- `soap_oils.json` provides legacy fatty-acid profiles and fallback SAP values.
- `supplemental-oils.json` holds manual entries such as birch tar.

## SAP Resolution

- FNWL within 5% of legacy SAP: use FNWL.
- FNWL/legacy delta from 5% to 10%: use the higher SAP as a conservative estimate.
- Delta above 10%: retain legacy unless FNWL is higher.
- Legacy-only entries are expected gaps and should remain marked `legacy_only`.
- Birch tar is supplemental (`birch-tar`), estimated from a pine-tar proxy SAP, and uses `sapRole: acid_neutralization`.

## Required Commands

When changing oil data, rebuild and validate:

```bash
npm run fetch:sources -w @soap-calc/oils-data
npm run build:oils
npm run validate:oils
npm test
```

Commit reproducible source snapshots when refreshed:

- `packages/oils-data/sources/fnwl-sapon.txt`
- `packages/oils-data/sources/fnwl-inci.txt`
- `packages/oils-data/sources/cosing-glossary-index.json`
