---
name: soap-oils-data
description: Use when changing Soap Calc canonical oils, FNWL source snapshots, soap_oils.json, supplemental oils, SAP values, saponification data, INCI validation, CosIng glossary data, or birch tar lye behavior.
---

# Soap Oils Data

## Overview

Oil data is built by `@soap-calc/oils-data` from legacy catalog records plus public-source cross-checks. Read `AGENTS.md` for full policy before changing generated data or source snapshots.

## Source Policy

- FNWL is primary for SAP values and INCI names, except where `supplemental-inci.json` `inciCorrections` overrides a malformed FNWL chart value.
- `inciCorrections` entries are verified against the EU CosIng Ingredients Inventory and are authoritative: the local proxy glossary is consulted only for validation status and must never rewrite them (validate-canonical errors on drift, and errors when a `source: "cosing"` correction is absent from the committed inventory snapshot).
- LDG is a secondary methodology cross-check only.
- ISO 3657:2023 defines lab unit conversion.
- EU CosIng validation uses two layers: the committed names-only inventory snapshot (`cosing-inventory-inci-names.json`, extracted from the full EU export — independent of FNWL, so it can falsify claims) and the FNWL-derived proxy glossary (cannot catch FNWL's own errors). Matching ignores parenthetical common names.
- `soap_oils.json` provides legacy fatty-acid profiles and fallback SAP values.
- `supplemental-oils.json` holds manual entries such as birch tar.

## SAP Resolution

- FNWL within 5% of legacy SAP: use FNWL.
- FNWL/legacy delta from 5% to 10%: use the higher SAP as a conservative estimate.
- Delta above 10%: retain legacy unless FNWL is higher.
- Legacy-only entries are expected gaps and should remain marked `legacy_only`, except oils whose legacy SAP contradicts their own fatty-acid profile — those get a profile-derived estimate via `LEGACY_SAP_CORRECTIONS` (build-canonical.ts), marked `estimated` with `primarySource: manual` and a recomputed INS.
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
- `packages/oils-data/sources/cosing-inventory-inci-names.json`
