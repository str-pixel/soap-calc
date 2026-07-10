---
name: soap-formulation-content
description: Use when adding or changing Soap Calc formulation guidance, recommended ranges, recipe presets, additive dosing, split-liquid workflows, alternative liquids, bar property metrics, CP terminology, or user-facing soapmaking copy.
---

# Soap Formulation Content

## Overview

Formulation guidance should use common cold process soapmaking vocabulary and original, short UI copy. Research notes can inform behavior and numeric defaults, but must not become product prose.

## Copyright-Safe Rule

Implement ideas and numbers only: property ranges, oil-weight percentages for additives, split-liquid workflows, and formulation heuristics. Do not ship book titles, publisher or author branding, distinctive recipe names, exercise names, third-party calculator names, copied passages, or close paraphrases.

## Terminology

Prefer these UI and code terms:

- `cold process` or `CP`
- `superfat` and `lye discount`
- `NaOH`, `KOH`, and `lye`
- `SAP value` and `saponification value`
- `water as % of oils`, `lye concentration`, and `water:lye ratio`
- `water discount`
- `split liquid` and `alternative liquid`
- additive dosing as `% of oil weight`
- `hardness`, `cleansing`, `conditioning`, `bubbly`, `creamy`, `longevity`, `INS`, and `iodine`
- `formulation insights` and `recommended ranges`
- `recipe preset` or `built-in recipe`

## Implementation Notes

- Put property guide constants in `@soap-calc/core` with neutral names such as `FORMULATION_PROPERTY_GUIDE`.
- Cite behavior in UI guidance, such as "lye concentration outside typical CP range", not sources.
- Use descriptive preset names such as "balanced four-oil bar".
- Recognize legacy PPO imports if needed, but prefer `% of oil weight` in new UI.
- Keep user-facing copy concise and original.
