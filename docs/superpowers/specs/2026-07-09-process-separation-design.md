# Process Separation — CP / HP / LS · Design

**Date:** 2026-07-09
**Status:** Approved design (brainstorm). Implementation plan to follow.
**Related:** `docs/multi-process-roadmap.md` (this is roadmap Phase 0, item "process selector").

## Goal

Let one Soap Calc instance operate as three tools — **Cold Process (CP)**, **Hot Process (HP)**,
**Liquid Soap (LS)** — selected by a top-level switch, each with its own workspace, all on the shared
lye engine (`@soap-calc/core` already does NaOH/KOH/dual + 90% KOH purity). This spec is the
**separation infrastructure only**; the per-process *features* are separate later specs.

## Decisions (settled during brainstorm)

1. **Top-level mode switch** — a segmented control in the header, not a per-recipe field and not
   separate routes. Feels like three tools in one.
2. **Independent per-process workspaces** — each tab has its own draft/recipe; switching tabs swaps
   workspaces. No cross-process conversion.
3. **Constrain structure hard, chemistry soft (the "C middle")** — process fixes which panels and
   finishing step exist and restricts the lye-type option set; superfat / water / lye blend / purity
   stay editable, process-seeded defaults.

## Scope

**In scope:** the `process` concept and state; per-process storage (three per-process autosave drafts +
`process` stamped in export/import files); a `PROCESS_DEFINITIONS` config; the header tab switcher; process-aware settings/panel
rendering; **CP fully wired** (identical to today's behavior, now under the "Cold Process" tab); HP and
LS tabs **scaffolded** with their default settings + the shared panels.

**Out of scope (later roadmap specs):** HP post-cook superfat, LS dilution / soap-concentration,
preservatives, thickeners, fluid-HP additives, process-specific guardrail/insight content, cook-stage
and temperature panels, cured-weight. Until those land, the HP and LS tabs render as "bar / liquid
with process defaults + shared panels."

## Architecture

Plugs into the just-merged decomposition: `App.tsx` (shell) → `useRecipeStorage` (state) →
`useRecipeInputs` (handlers) → `useRecipeViewModel` (derived) → panels; settings are config-driven via
`settingsFields.ts`.

### Units (each: what it does · interface · deps)

1. **`PROCESS_DEFINITIONS` — `@soap-calc/core`** (new, pure config).
   Describes each process. Single source of truth for defaults and structural composition.
   - Shape per id: `{ id: ProcessId; label: string; defaultSettings: Partial<RecipeSettings>;
     lyeChoices: LyeType[]; waterModeChoices: WaterMode[]; panels: PanelKey[];
     finishing: 'cure' | 'sequester'; terms: { finishingLabel: string } }`.
   - `ProcessId = 'cp' | 'hp' | 'ls'`. `PanelKey` is a stable enum of panel slots.
   - Interface: `PROCESS_DEFINITIONS[process]`, `PROCESS_IDS`. Deps: `RecipeSettings`/`LyeType`/`WaterMode` types only.
   - CP/HP: `defaultLye 'naoh'`, `lyeChoices ['naoh','dual']`, bar panels, `finishing 'cure'`.
     LS: `defaultLye 'koh'`, `lyeChoices ['koh','dual']`, liquid panels, `finishing 'sequester'`.

2. **Workspace storage — `useRecipeStorage` + `recipeStorage.ts` + `useRecipeAutosave` (all extended).**
   Today there is a **single** autosave draft (`recipeStorage.ts`, key `soap-calc:draft`, via
   `loadDraft`/`saveDraft`) plus file export/import — there is **no in-app saved-recipe library**. This
   spec makes that draft per-process.
   - `loadDraft`/`saveDraft` gain a `process` arg → one draft per process, keyed `soap-calc:draft:<process>`
     (process is implicit in the key; no in-payload field). Active process persisted at `soap-calc:active-process`.
   - `useRecipeStorage` loads the active process's draft on mount and adds `process`, `setProcess(id)`;
     `setProcess` persists the id and swaps to that process's draft (seeding from defaults if absent).
   - `useRecipeAutosave` takes the active `process` and writes to that process's draft key.
   - `handleNew` seeds from `PROCESS_DEFINITIONS[process].defaultSettings` (not global `DEFAULT_SETTINGS`).
   - The **export/import file** (`serializeRecipeFile`/`parseRecipeFile`) gains a top-level `process`
     field so an imported file selects its tab.
   - Deps: `PROCESS_DEFINITIONS`, existing storage helpers.
   - Terminology: "draft" here = the autosaved workspace (one per process); distinct from `useDraftInputs`
     "drafts" (per-field edit buffers), which are unaffected.

3. **Process-aware settings fields — `settingsFields.ts` (extended).**
   `lyeChoicesFor(process)` and `waterModeChoicesFor(process)` narrow the selector option sets;
   `SettingsPanel` consumes them. Numeric field specs (`PURITY_FIELDS`, `WATER_FIELDS`) unchanged.

4. **`ProcessTabs` — `packages/web/src/components/` (new).**
   Segmented control in the header. Props: `{ process, onChange }`. Renders the three labels from
   `PROCESS_DEFINITIONS`; calls `onChange` (→ `setProcess`).

5. **Panel gating — `App.tsx` shell.**
   Shared panels always render (RecipeOils, Additives, Results, Properties, FattyAcid, Insights).
   Which *structural* panels show (bar mold/cure vs liquid dilution/preserve, HP post-cook) is driven
   by `PROCESS_DEFINITIONS[process].panels`. In this spec the CP set maps to today's layout; HP/LS-only
   slots render a small placeholder until their feature specs. (SettingsPanel currently embeds the mold
   sizer; extracting it into its own gated slot so LS can omit it is an implementation-plan detail.)

### Data flow

`useRecipeStorage` owns `process` and loads the matching draft → `App` reads `process` → passes it to
`ProcessTabs`, `SettingsPanel` (field gating), and panel gating → switching calls `setProcess`, which
persists the id and swaps the live workspace → `useRecipeInputs` / `useRecipeViewModel` / calculation
run exactly as today against the active workspace.

### State & storage detail

- Per-process draft payload = `{ recipeName, lines, settings, additives }`, keyed by process (process
  is not stored in the payload). Only the export/import **file** carries a top-level `process`.
- A new draft's `settings` = `{ ...DEFAULT_SETTINGS, ...PROCESS_DEFINITIONS[process].defaultSettings }`.
- "New" seeds a fresh draft for the **active** process from its defaults.

### The "C middle" mechanics

- `lyeChoices` limits the lye-type selector to the process's allowed set (CP/HP: naoh, dual; LS: koh,
  dual). On switching processes, if the current `lyeType` isn't in the new process's `lyeChoices`,
  re-seed it to that process's `defaultLye`.
- Panels and finishing are fixed by process (hard).
- `superfatPercent`, water values, `kohBlendPercent`, purities stay free-edit (soft), seeded from defaults.

## Error handling / edge cases

- Loaded recipe / import with missing or unknown `process` → default to `cp`.
- Switching tabs never discards other drafts; each persists independently.
- **Migration** of the current single-draft user: on first load after this ships, copy the existing
  `soap-calc:draft` into the `cp` draft key and default the active process to `cp`. No data loss.
- Importing a file whose `process` differs from the active tab switches the tab to match; a file with
  no `process` is treated as `cp`.
- Corrupt/absent draft for a process → fall back to a defaults-seeded fresh draft for that process.

## Testing

- **Core:** `PROCESS_DEFINITIONS` shape and defaults; `lyeChoicesFor` / `waterModeChoicesFor` per
  process; the re-seed-lye-on-invalid rule.
- **Storage:** three drafts stay isolated; active-process persistence across reload; legacy single-draft
  → `cp` migration; imported-file `process` drives the load-time tab switch.
- **Web component:** switching tabs reconfigures panels + settings fields; the CP tab renders
  identically to today (regression guard).

## Non-goals / YAGNI

No cross-process conversion (explicitly rejected in favor of separate workspaces). No per-process
feature logic beyond CP. No new guardrail/insight content. HP/LS panel sets stay minimal (shared
panels + placeholders) until their own feature specs.
