# After-Cook / After-Dilution Additive Stage (Phase 0.2) — Design

**Date:** 2026-07-10
**Status:** Approved (brainstorm). Lightweight TDD execution to follow.
**Origin:** Multi-process roadmap Phase 0.2 — "a 5th additive stage beyond lye/oils/trace/top" for HP (after the cook) and LS (after dilution). Builds on the merged process selector (Phase 0.1).

## Goal

Give additives a 5th **timing** stage so a user on **Hot Process** or **Liquid Soap** can schedule an additive (e.g. heat-sensitive fragrance, colorant, milk, preservative, turkey-red) to be added **after the cook / after dilution** — the point where those additives chemically belong. Infrastructure only: the stage becomes selectable and shows in the batch sheet; the process-specific additives that *default* to it come with later-phase features.

## Model (decided)

One new `AdditiveStage` value **`'after_cook'`**, with a **process-aware label**: "After cook" under HP, "After dilution" under LS. Because HP and LS have independent workspaces, an additive line always lives under exactly one process, so one contextual value is unambiguous. Offered in the per-line stage dropdown **only for HP/LS**; **CP is unchanged** (it has no cook/dilution step).

## Scope boundary

- **Timing-only.** No dosing/calc change — `computeRecipeAdditives` already doses % of oil and passes `addAt` straight through; stage never affects the math. `after_cook` behaves like the existing four.
- **Infrastructure only.** No catalog additive's `defaultStage` changes; no per-process additive content (heat-sensitive fragrance, preservative, turkey-red defaults) — those are later phases.
- **No batch-sheet ordering change.** The batch sheet renders additives in input order and labels each; it does not group/sort by stage. `after_cook` renders with its label in input order like the others. (Stage-ordering is a separate future polish.)
- **CP untouched**; split-liquid's separate narrower `addAt` untouched.

## Changes (complete set)

1. **`packages/core/src/additives.ts`**
   - Add `'after_cook'` to the `AdditiveStage` union.
   - Add `after_cook: 'After cook'` to `ADDITIVE_STAGE_LABELS` (a **total** `Record<AdditiveStage, string>`, so tsc *requires* this key — the exhaustive site).

2. **Contextual label helper.** Lift the existing `additiveStageLabel(addAt)` out of `batchSheet.ts` into a small shared web helper (e.g. `packages/web/src/lib/additiveStageLabel.ts`) and extend its signature:
   ```ts
   export function additiveStageLabel(stage: AdditiveStage, process?: ProcessId): string {
     if (stage === 'after_cook' && process === 'ls') return 'After dilution';
     return ADDITIVE_STAGE_LABELS[stage];
   }
   ```
   `batchSheet.ts` imports it (passing the batch sheet's process); `AdditivesPanel` imports it too. (Avoids `AdditivesPanel` importing from the print-specific `batchSheet.ts`.)

3. **`packages/web/src/lib/recipe.ts` — `normalizeAdditiveLine`.** Add `'after_cook'` to the accepted `addAt` string check (currently `'lye'|'oils'|'trace'|'top'`), so persisted/imported lines with the new stage survive normalization.

4. **`packages/web/src/components/AdditivesPanel.tsx`**
   - Add a `process: ProcessId` prop.
   - Make the per-line stage options process-aware: base = `['lye','oils','trace','top']`; for HP/LS append `'after_cook'`. Render each option's label via `additiveStageLabel(stage, process)`.
   - **Edge (mismatched-select guard):** the options list for a given line must ALWAYS include that line's current `addAt`, even when it's outside the process's offered set (e.g. a stray `after_cook` line viewed under CP). Compute per-line options as `offeredStages` ∪ `[line.addAt]` (dedup, current appended if missing) so the controlled `<select value={line.addAt}>` always has a matching `<option>` — no broken select, no silent value change. (The `waterMode`-bug lesson.)

5. **`packages/web/src/App.tsx`** — pass `process={process}` to `<AdditivesPanel>` (App already holds `process` from `useRecipeStorage`).

6. **`packages/web/src/lib/batchSheet.ts`** — replace its local `additiveStageLabel` with the shared helper; thread the batch sheet's active `process` so an after-cook additive prints "After dilution" for an LS recipe. No ordering change.

## Error handling / edge cases

- A line whose `addAt` is `'after_cook'` shown under CP → still selectable (its own value is always an option), still labeled "After cook"; non-destructive. It only arises from stray/legacy/hand-edited data, since independent workspaces mean a CP workspace normally never contains an `after_cook` line.
- `normalizeAdditiveLine` continues to fall back to `'trace'` for genuinely unknown `addAt` strings (unchanged); `'after_cook'` now passes through instead of being coerced.

## Testing

- **Core** (`additives.test.ts`): `AdditiveStage` includes `after_cook`; `ADDITIVE_STAGE_LABELS.after_cook === 'After cook'`.
- **Label helper** (`additiveStageLabel.test.ts`): `after_cook` → "After cook" by default / with `process='hp'`; → "After dilution" with `process='ls'`; other stages unaffected by `process`.
- **`recipe.test.ts`**: `normalizeAdditiveLine({ addAt: 'after_cook', ... })` keeps `after_cook` (not coerced to `trace`); an unknown stage still → `trace`.
- **`AdditivesPanel.test.tsx`**: CP renders 4 stage options (no after-cook); HP/LS render 5 with the contextual label; a line already set to `after_cook` under CP still shows `after_cook` as a selected option (edge); selecting a stage calls `onChange` with the right value.
- **`batchSheet.test.ts`**: an `after_cook` additive prints "After cook" for HP and "After dilution" for LS.
- **Regression:** existing additive/batchSheet/recipe tests stay green; CP behavior identical (still 4 stages).

## Self-review

- Placeholders: none.
- Consistency: the model (one contextual value), the scope boundary (timing-only, infra-only, no ordering), and the change set align; the tsc-forced `Record<AdditiveStage>` site is called out.
- Scope: one focused feature (a stage + its label + process-aware panel wiring) — single implementation pass, no decomposition.
- Ambiguity: the mismatched-select edge and the LS-vs-HP label rule are pinned; the label helper's home is fixed (lifted to a shared helper) to avoid awkward coupling.
