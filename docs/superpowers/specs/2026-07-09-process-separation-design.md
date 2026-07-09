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

**In scope:** the `process` concept and state; per-process storage (three drafts + process-tagged
saved recipes); a `PROCESS_DEFINITIONS` config; the header tab switcher; process-aware settings/panel
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

2. **Workspace storage — `useRecipeStorage` (extended) + `recipeStorage.ts`.**
   Owns the active process + three drafts + process-tagged named recipes.
   - Persisted workspace shape gains a top-level `process: ProcessId` (sibling of `settings`), so it
     serializes in save/export.
   - localStorage keys: `soapcalc:activeProcess`, `soapcalc:draft:<process>`; saved recipes carry `process`.
   - New surface: `process`, `setProcess(id)`. `setProcess` persists the active id and loads that
     process's draft (creating it from defaults if absent).
   - Deps: `PROCESS_DEFINITIONS`, existing storage helpers.

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

- Persisted workspace = `{ process, recipeName, lines, settings, additives }`.
- A new draft's `settings` = `{ ...DEFAULT_SETTINGS, ...PROCESS_DEFINITIONS[process].defaultSettings }`.
- "New" seeds a fresh draft for the **active** process from its defaults.
- Import/export JSON includes `process`; import selects that tab.

### The "C middle" mechanics

- `lyeChoices` limits the lye-type selector to the process's allowed set (CP/HP: naoh, dual; LS: koh,
  dual). On switching processes, if the current `lyeType` isn't in the new process's `lyeChoices`,
  re-seed it to that process's `defaultLye`.
- Panels and finishing are fixed by process (hard).
- `superfatPercent`, water values, `kohBlendPercent`, purities stay free-edit (soft), seeded from defaults.

## Error handling / edge cases

- Loaded recipe / import with missing or unknown `process` → default to `cp`.
- Switching tabs never discards other drafts; each persists independently.
- **Migration** of the current single-draft user: on first load after this ships, map the existing
  autosave draft to the `cp` draft; untagged saved recipes are treated as `cp`. No data loss.
- Loading a saved recipe whose `process` differs from the active tab switches the tab to match.
- Corrupt/absent draft for a process → fall back to a defaults-seeded fresh draft for that process.

## Testing

- **Core:** `PROCESS_DEFINITIONS` shape and defaults; `lyeChoicesFor` / `waterModeChoicesFor` per
  process; the re-seed-lye-on-invalid rule.
- **Storage:** three drafts stay isolated; active-process persistence across reload; legacy single-draft
  → `cp` migration; saved-recipe `process` tagging + load-time tab switch.
- **Web component:** switching tabs reconfigures panels + settings fields; the CP tab renders
  identically to today (regression guard).

## Non-goals / YAGNI

No cross-process conversion (explicitly rejected in favor of separate workspaces). No per-process
feature logic beyond CP. No new guardrail/insight content. HP/LS panel sets stay minimal (shared
panels + placeholders) until their own feature specs.
