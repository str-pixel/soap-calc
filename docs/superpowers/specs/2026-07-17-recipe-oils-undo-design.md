# Recipe Oils Undo / Redo — Design

Date: 2026-07-17
Status: Approved (design), pending implementation
Builds on: PR #5 (user-set vs derived batch-total provenance in `lineWeightSync` / `commitDrafts` / `useRecipeEditor`)

## Problem

The recipe editor has no undo. A single weight or percent edit can redistribute
grams across oil rows (the behaviour PR #5 corrected and made provenance-aware),
so a user who mis-edits a weight cannot cheaply get back the previous state —
they must reconstruct the exact prior grams by hand. This is the edit surface
most in need of undo, precisely because one edit can move numbers the user did
not directly touch.

## Goal

Add Undo and Redo to the **Recipe oils** editing surface: the oil rows and the
batch total. Restore is exact (snapshot-based, no lossy replay). History is
per-session and cannot desynchronise from the recipe it describes.

## Non-goals

- Undo for Settings (superfat, water, lye, NaOH purity), Additives, recipe name,
  process switch, or weight unit. Those are out of scope; see "Scope boundary".
- Persisting history across page reloads. Reload restores the recipe (existing
  autosave) but starts with empty history.
- Undo across recipes: New, Import, and switching process (CP/HP/LS) each load a
  different recipe and reset history.

## Decisions (locked during brainstorming)

1. **Scope**: the oils *state* — `lines`, `batchOilGrams`, `batchSetByUser` —
   not the oils panel's DOM. Any control that edits that state is captured, even
   one rendered elsewhere (see the Batch sizer note in "Scope boundary").
2. **Granularity**: one *committed* edit = one undo step. Typing `300` into a
   weight field and blurring is one step, not three keystrokes. This reuses the
   existing draft → blur → commit boundary; uncommitted drafts are never history.
3. **Redo**: yes. A `future` stack mirrors `past`.
4. **Trigger**: Undo/Redo buttons in the oils panel header, plus Cmd/Ctrl+Z and
   Cmd/Ctrl+Shift+Z. The keyboard shortcut **yields to focused inputs** so the
   browser's native text undo keeps working while typing in a field.
5. **Lifetime**: in-memory for the session; reset on New / Import / process
   switch, enforced structurally (see "The generation gate").

## Chosen approach: snapshot stack at the `applySynced` funnel

Store whole snapshots of the oils state as `SyncedRecipe`
(`{ lines, batchOilGrams, batchSetByUser }`). `useRecipeEditor` gains a `past` /
`future` history; every committed edit pushes the *current* state onto `past`
before applying the new one. Undo pops `past` (pushing current onto `future`)
and restores via the existing `applySynced`.

Why this fits "on top of #5": PR #5 established that grams and their provenance
(`batchSetByUser`) are a single atomic, self-consistent unit that must travel
together — a stale flag "reintroduces the steal-from-lines bug". That unit is
exactly the right undo snapshot, and restoring one is literally
`applySynced(snapshot)` — the same function a normal edit uses. There is no
second restore path to keep correct, and undo can never resurrect grams with a
mismatched provenance flag.

### Approaches rejected

- **Command log with inverse operations.** The redistribution math
  (`distributeWeightsToBatch`, `fixGramRounding`) rounds to whole grams and dumps
  the remainder on the last line — it is lossy. Inverses would not round-trip, so
  undo would drift grams between rows: the exact bug class PR #5 eliminated.
- **Generic `useHistory<T>` over the whole workspace.** Over-captures for this
  scope: Settings and notes write per keystroke (no commit boundary), so it would
  need filtering to avoid one undo step per character. It is the natural refactor
  *if* scope later grows to Settings, but not now (YAGNI).

## Architecture

Follows the existing `lineWeightSync` layering: pure logic in `lib/`, React glue
in `hooks/`, a dumb panel.

- **`lib/recipeHistory.ts`** (new, pure, no React):
  - `type HistoryState = { gen: number; past: SyncedRecipe[]; future: SyncedRecipe[] }`
  - `HISTORY_DEPTH = 50`
  - `sameSyncedRecipe(a, b): boolean` — structural equality of `lines`
    (key/oilId/weightGrams/weightPercent/tarLyeTreatment), `batchOilGrams`,
    `batchSetByUser`.
  - `pushHistory(state, current): HistoryState` — push `current` onto `past`,
    clear `future`, evict oldest beyond `HISTORY_DEPTH`.
  - `undoHistory(state, current): { next: HistoryState; restored: SyncedRecipe } | null`
  - `redoHistory(state, current): { next: HistoryState; restored: SyncedRecipe } | null`
  - `emptyHistory(gen): HistoryState`
- **`hooks/useRecipeEditor.ts`** (extend): owns the `HistoryState`, exposes
  `undo`, `redo`, `canUndo`, `canRedo`. Capture happens in the commit path;
  restore reuses `applySynced`. Takes a new `workspaceGeneration: number` param.
- **`hooks/useRecipeStorage.ts`** (extend): owns `workspaceGeneration`, a counter
  bumped inside `setProcess`, `handleNew`, and `handleImportFile` — the same
  functions that swap the workspace.
- **`hooks/useUndoShortcut.ts`** (new): a `useEffect` that binds
  `keydown` for Cmd/Ctrl+Z (undo) and Cmd/Ctrl+Shift+Z (redo), and **ignores the
  event when its target is an `input`, `textarea`, `select`, or `contenteditable`
  element**, so native text undo is untouched while editing.
- **`components/RecipeOilsPanel.tsx`** (extend): Undo / Redo buttons in the
  panel header next to "+ Add oil", disabled when `!canUndo` / `!canRedo`.

## The generation gate (the desync fix)

`useRecipeEditor` is called unconditionally in `App.tsx` with no `key`, so the
hook is never remounted; `setProcess` / `handleNew` / `handleImportFile` swap
`lines` and `settings` underneath it. Without a guard, `past` / `future` would
survive a process switch and Undo would splice a cold recipe's oil rows into a
different recipe.

Fix: history lifetime is tied to **workspace identity** via a generation
counter, and history is *gated on read*, not reset by a separate call.

```ts
// useRecipeStorage: bump inside each swap (same statement block as the swap)
function setProcess(next) { /* …swap… */ setWorkspaceGeneration((g) => g + 1); }
function handleNew()      { /* …swap… */ setWorkspaceGeneration((g) => g + 1); }
function handleImportFile(){ /* …swap… */ setWorkspaceGeneration((g) => g + 1); }

// useRecipeEditor: gate reads on the current generation
const [history, setHistory] = useState(() => emptyHistory(workspaceGeneration));
const live = history.gen === workspaceGeneration ? history : emptyHistory(workspaceGeneration);
const canUndo = live.past.length > 0;
const canRedo = live.future.length > 0;
```

Because `live` is derived during render from the current generation, stale
history is unreachable by construction: if the generation moved this render,
`canUndo`/`canRedo` are already false and there is nothing to restore. No effect
timing hole, no forgotten reset call, no render-phase `setState`. The first
commit after a swap writes a fresh `HistoryState` stamped with the new
generation (via `pushHistory` starting from `live`).

Note: `workspaceGeneration` is **not** new coupling. `useRecipeEditor` already
receives `lines`, `batchOilGrams`, `batchSetByUser`, `setLines`, `setSettings`
from `useRecipeStorage` threaded through App; the generation is a sixth value on
the identical existing path.

## Data flow

**Edit** (weight / percent / batch-total commit, add line, remove line, oil swap,
tar treatment, apply-suggested-grams):
1. `applySyncedUpdate(updater)` computes `next = updater(currentLines, currentBatch, currentBatchSetByUser)`.
2. If `sameSyncedRecipe(current, next)` → apply without pushing (no dead step).
3. Else `setHistory(pushHistory(live, current))`, then `applySynced(next)`.

**Undo**:
1. `discardDrafts()` (clears *all* in-flight drafts — see "Draft handling").
2. `undoHistory(live, current)` → `{ next, restored }`; if `null`, no-op.
3. `setHistory(next)`, `applySynced(restored)`.

**Redo**: symmetric with `redoHistory`.

Restore goes through the normal `applySynced`, so grams and provenance can never
separate, and autosave persists the restored state (the draft should match what
is on screen).

### Routing `updateLine` through the funnel

Oil swap and tar-lye treatment currently call `setLines` directly, bypassing
`applySynced`. They must be re-routed through `applySyncedUpdate`, carrying
`batchOilGrams` / `batchSetByUser` through unchanged, so those edits are captured
and undoable. This is a required part of the change, not optional.

## Scope boundary

Captured (edits the oils state through the funnel): weight commit, percent
commit, batch-total commit, add line, remove line, oil swap, tar treatment, and
**apply-suggested-grams from the Batch sizer**. The Batch sizer lives in
`SettingsPanel`, but `handleApplySuggestedOilGrams` mutates oil grams via
`applySynced`, so it is correctly in scope — the boundary is the oils *state*,
not the panel's DOM.

Not captured: weight unit (a display preference, not recipe data — it lives in
the oils panel but is not an edit), plus everything in Non-goals.

## Interaction details

### Buttons vs. keyboard (a deliberate behavioural fork)

The Undo/Redo buttons sit next to number inputs, so clicking one from a focused
field would normally blur it first, firing `onBlur` → `commitWeightInput`, which
would commit the pending draft as a *new* undo step and then have Undo revert the
edit just made — backwards.

- **Buttons**: `onMouseDown={(e) => e.preventDefault()}` keeps focus in the
  field, so no blur, no premature commit. `undo()` then calls `discardDrafts()`
  first. Semantics: **Undo discards what you are mid-typing and reverts your last
  committed edit.** A draft was never committed, so it is not history. Clearing
  the draft also lets the still-focused input fall back to
  `getDraft(id, canonicalDisplay)` → the restored value, so it cannot show a
  stale number.
- **Keyboard**: the shortcut yields to focused inputs, so Cmd+Z inside a field is
  native text undo, and recipe undo via keyboard only fires when focus is
  outside the inputs — in which case there is no draft to commit.

This means Tab-to-button-then-Enter (keyboard-activating a button) blurs first
and *does* commit the draft, then undoes that commit — a different outcome from
clicking. This is intentional and acceptable: each path matches what the user
saw happen. Tabbing out visibly commits (the recipe recalculates), so undoing
that commit is expected; clicking never showed a commit, so discarding the draft
is expected. Documented here so it is a design decision, not a surprise.

### Draft handling

`undo()` / `redo()` call `discardDrafts()`, which clears **all** in-flight drafts,
including in a field unrelated to the edit being undone. This is predictable and
acceptable: an undo is a deliberate "throw away current in-progress state and
step back" action.

## Known limitations (accepted)

- **Dedupe is not airtight.** The pure focus/blur path (no typing) is already
  safe via the existing `hadDraft` early-return in `commit*Input`. But retyping
  the *same* value sets a draft, so the sync runs and may re-normalise a percent
  string; `sameSyncedRecipe` could then see a difference and push a step whose
  undo is a cosmetic percent shift. Rare and harmless; named rather than
  engineered around.
- **50-step cap.** Oldest snapshots are evicted beyond `HISTORY_DEPTH = 50`.
  Bounded memory, far beyond realistic reach.

## Testing

**Pure — `lib/recipeHistory.test.ts`:**
- push then undo returns the prior snapshot; redo returns forward.
- a new commit after an undo clears `future`.
- depth eviction at `HISTORY_DEPTH`.
- `sameSyncedRecipe` dedupe: identical snapshot pushes nothing.
- generation gating: a `HistoryState` with a stale `gen` yields `canUndo` false
  and `undoHistory` treats it as empty.

**Component — `RecipeOilsPanel.test.tsx`:**
- Undo/Redo buttons disabled when `canUndo` / `canRedo` are false.
- an oil swap is undoable (proves `updateLine` was routed through the funnel).
- (fixture) the `RecipeInputs` mock gains `undo` / `redo` / `canUndo` / `canRedo`;
  this fixture churn is expected, like the required-prop change in #39.

**e2e — `e2e/recipe-ui.spec.ts`:**
1. **The #5 scenario**: olive 300 + coconut 200 (empty-line entry) → Undo →
   the prior state returns exactly.
2. Redo re-applies it.
3. Clicking Undo while mid-typing in a weight field reverts the last *committed*
   edit and does not commit-then-undo the in-progress draft.
4. **Cmd+Z inside a weight field does not fire recipe undo** — assert the
   *committed recipe is unchanged* after typing + Cmd+Z. (We assert our handler
   yields; we do NOT assert native text-undo behaviour, which is
   browser-dependent and flaky on number inputs.)
5. Switching CP→HP leaves Undo disabled (the generation gate holds).

## Files touched

- `packages/web/src/lib/recipeHistory.ts` (new)
- `packages/web/src/lib/recipeHistory.test.ts` (new)
- `packages/web/src/hooks/useUndoShortcut.ts` (new)
- `packages/web/src/hooks/useRecipeEditor.ts` (history state, undo/redo, gate)
- `packages/web/src/hooks/useRecipeStorage.ts` (`workspaceGeneration`)
- `packages/web/src/hooks/useRecipeInputs.ts` (route `updateLine` through funnel;
  dedupe guard in the commit path; expose nothing new itself)
- `packages/web/src/components/RecipeOilsPanel.tsx` (buttons)
- `packages/web/src/components/RecipeOilsPanel.test.tsx` (fixture + tests)
- `packages/web/src/App.tsx` (thread `workspaceGeneration`; mount `useUndoShortcut`)
- `packages/web/e2e/recipe-ui.spec.ts` (e2e cases)
