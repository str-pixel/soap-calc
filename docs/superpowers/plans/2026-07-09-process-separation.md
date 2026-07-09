# Process Separation (CP / HP / LS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-level process switch (Cold Process / Hot Process / Liquid Soap) that gives each process its own workspace and process-seeded defaults, on the existing shared lye engine.

**Architecture:** A `PROCESS_DEFINITIONS` config (web) is the single source of truth for per-process defaults, allowed lye types, and panel structure. Storage keeps one autosave draft per process (`soap-calc:draft:<process>`) plus a persisted active process; the current single draft migrates to CP. `useRecipeStorage` owns the active process and swaps drafts; `App` renders a `ProcessTabs` header control and passes `process` to `SettingsPanel` (which gates the lye/water selectors) and to autosave.

**Tech Stack:** TypeScript, React, Vite, Vitest 3 (both packages), @testing-library/react + jsdom (web).

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-09-process-separation-design.md`. Follow it; deviations noted below.
- **`PROCESS_DEFINITIONS` lives in web** (`packages/web/src/lib/process.ts`), not `@soap-calc/core` — it references the web-owned `RecipeSettings`, and nothing in core consumes `process`. (Spec §Unit 1, already corrected.)
- **Scope:** infrastructure only. CP is fully wired — behavior unchanged **except** the lye-type selector now offers only `naoh`/`dual` (KOH moves to the LS tab, where liquid soap belongs). Do not claim "CP is byte-for-byte identical" — the lye option set is deliberately narrowed. HP/LS tabs get their default settings + the shared panels; HP/LS-only feature panels (post-cook, dilution, preserve) are **out of scope** here.
- **Structure hard, chemistry soft:** process fixes the allowed lye-type set (CP/HP: `naoh`,`dual`; LS: `koh`,`dual`); superfat/water/blend/purity stay editable, process-seeded defaults.
- **No data loss, no silent chemistry change:** the existing single draft migrates *by its lye type* — a `koh` (liquid soap) draft lands on the **LS** tab, everything else on **CP** — so migration never flips a recipe's alkali (NaOH↔KOH change the SAP math). Migration also seeds the active process to match. (See Task 3.)
- Storage key prefix is `soap-calc:` (hyphen).
- Run web tests from repo root with `npm run test -w @soap-calc/web -- <filter>` (Vitest positional filter = filename substring). Web tests run under jsdom (each new storage/hook/component test file starts with `/** @vitest-environment jsdom */` to be explicit; `localStorage` is available under jsdom).
- Commit after each task's tests pass. Do not push.

---

## File Structure

- **Create** `packages/web/src/lib/process.ts` — process ids, definitions, defaults, coercion helper.
- **Create** `packages/web/src/lib/process.test.ts`.
- **Modify** `packages/web/src/lib/settingsFields.ts` — lye/water label maps + per-process choice accessors.
- **Modify** `packages/web/src/lib/settingsFields.test.ts`.
- **Modify** `packages/web/src/lib/recipeStorage.ts` — per-process draft keys, active-process persistence, legacy migration.
- **Modify** `packages/web/src/lib/recipeStorage.test.ts`.
- **Modify** `packages/web/src/lib/recipeFile.ts` — `process` field in export/import.
- **Modify** `packages/web/src/lib/recipeFile.test.ts`.
- **Modify** `packages/web/src/hooks/useRecipeAutosave.ts` — write to the active process's draft.
- **Create** `packages/web/src/hooks/useRecipeAutosave.test.tsx`.
- **Modify** `packages/web/src/hooks/useRecipeStorage.ts` — active process, `setProcess`, process-seeded `handleNew`, process in import/export.
- **Create** `packages/web/src/hooks/useRecipeStorage.test.tsx`.
- **Create** `packages/web/src/components/ProcessTabs.tsx` + `.test.tsx`.
- **Modify** `packages/web/src/components/SettingsPanel.tsx` — gate lye/water selectors by process (new **optional** `process` prop, defaults to `'cp'`).
- **Modify** `packages/web/src/components/SettingsPanel.test.tsx` — this file **already exists** (superfat/dual/attr-lock guards); append the gating tests, do not overwrite it.
- **Modify** `packages/web/src/App.tsx` — render `ProcessTabs`; pass `process` to `SettingsPanel` + autosave.

---

### Task 1: Process definitions & helpers

**Files:**
- Create: `packages/web/src/lib/process.ts`
- Test: `packages/web/src/lib/process.test.ts`

**Interfaces:**
- Consumes: `RecipeSettings`, `DEFAULT_SETTINGS` from `./recipe`; `LyeType`, `WaterMode` from `@soap-calc/core`.
- Produces: `type ProcessId = 'cp'|'hp'|'ls'`; `type PanelKey`; `type ProcessDefinition`; `PROCESS_IDS: readonly ProcessId[]`; `PROCESS_DEFINITIONS: Record<ProcessId, ProcessDefinition>`; `isProcessId(v: unknown): v is ProcessId`; `defaultsForProcess(p: ProcessId): Partial<RecipeSettings>`; `coerceSettingsForProcess(s: RecipeSettings, p: ProcessId): RecipeSettings`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/lib/process.test.ts
import { describe, it, expect } from 'vitest';
import {
  PROCESS_IDS,
  PROCESS_DEFINITIONS,
  isProcessId,
  defaultsForProcess,
  coerceSettingsForProcess,
} from './process';
import { DEFAULT_SETTINGS } from './recipe';

describe('process definitions', () => {
  it('defines exactly cp, hp, ls', () => {
    expect(PROCESS_IDS).toEqual(['cp', 'hp', 'ls']);
    expect(Object.keys(PROCESS_DEFINITIONS)).toEqual(['cp', 'hp', 'ls']);
  });

  it('cp/hp default to NaOH, ls to KOH', () => {
    expect(PROCESS_DEFINITIONS.cp.defaultSettings.lyeType).toBe('naoh');
    expect(PROCESS_DEFINITIONS.hp.defaultSettings.lyeType).toBe('naoh');
    expect(PROCESS_DEFINITIONS.ls.defaultSettings.lyeType).toBe('koh');
  });

  it('restricts lye choices (ls excludes plain naoh)', () => {
    expect(PROCESS_DEFINITIONS.ls.lyeChoices).toEqual(['koh', 'dual']);
    expect(PROCESS_DEFINITIONS.cp.lyeChoices).toEqual(['naoh', 'dual']);
  });

  it('isProcessId guards unknown values', () => {
    expect(isProcessId('cp')).toBe(true);
    expect(isProcessId('xx')).toBe(false);
    expect(isProcessId(undefined)).toBe(false);
  });

  it('defaultsForProcess returns that process defaults', () => {
    expect(defaultsForProcess('ls').lyeType).toBe('koh');
  });

  it('coerceSettingsForProcess fixes an invalid lye type', () => {
    const naohInLs = { ...DEFAULT_SETTINGS, lyeType: 'naoh' as const };
    expect(coerceSettingsForProcess(naohInLs, 'ls').lyeType).toBe('koh');
    const kohInCp = { ...DEFAULT_SETTINGS, lyeType: 'koh' as const };
    expect(coerceSettingsForProcess(kohInCp, 'cp').lyeType).toBe('naoh');
  });

  it('coerceSettingsForProcess leaves a valid lye type untouched (same ref)', () => {
    const dualInLs = { ...DEFAULT_SETTINGS, lyeType: 'dual' as const };
    expect(coerceSettingsForProcess(dualInLs, 'ls')).toBe(dualInLs);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @soap-calc/web -- process`
Expected: FAIL — cannot resolve `./process`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/web/src/lib/process.ts
import type { LyeType, WaterMode } from '@soap-calc/core';
import type { RecipeSettings } from './recipe';

export type ProcessId = 'cp' | 'hp' | 'ls';

export const PROCESS_IDS: readonly ProcessId[] = ['cp', 'hp', 'ls'];

export type PanelKey = 'moldCure' | 'postCook' | 'dilution' | 'preserve';

export type ProcessDefinition = {
  id: ProcessId;
  label: string;
  defaultSettings: Partial<RecipeSettings>;
  lyeChoices: LyeType[];
  waterModeChoices: WaterMode[];
  panels: PanelKey[];
  finishing: 'cure' | 'sequester';
  terms: { finishingLabel: string };
};

const ALL_WATER_MODES: WaterMode[] = [
  'percent_of_oils',
  'lye_concentration',
  'lye_water_ratio',
];

export const PROCESS_DEFINITIONS: Record<ProcessId, ProcessDefinition> = {
  cp: {
    id: 'cp',
    label: 'Cold process',
    defaultSettings: {
      lyeType: 'naoh',
      superfatPercent: '5',
      waterMode: 'percent_of_oils',
      waterPercentOfOils: '33',
    },
    lyeChoices: ['naoh', 'dual'],
    waterModeChoices: ALL_WATER_MODES,
    panels: ['moldCure'],
    finishing: 'cure',
    terms: { finishingLabel: 'Cure' },
  },
  hp: {
    id: 'hp',
    label: 'Hot process',
    defaultSettings: {
      lyeType: 'naoh',
      superfatPercent: '3',
      waterMode: 'percent_of_oils',
      waterPercentOfOils: '38',
    },
    lyeChoices: ['naoh', 'dual'],
    waterModeChoices: ALL_WATER_MODES,
    panels: ['moldCure', 'postCook'],
    finishing: 'cure',
    terms: { finishingLabel: 'Cure' },
  },
  ls: {
    id: 'ls',
    label: 'Liquid soap',
    defaultSettings: {
      lyeType: 'koh',
      superfatPercent: '2',
      waterMode: 'lye_water_ratio',
      lyeWaterRatio: '2',
    },
    lyeChoices: ['koh', 'dual'],
    waterModeChoices: ALL_WATER_MODES,
    panels: ['dilution', 'preserve'],
    finishing: 'sequester',
    terms: { finishingLabel: 'Sequester' },
  },
};

export function isProcessId(value: unknown): value is ProcessId {
  return value === 'cp' || value === 'hp' || value === 'ls';
}

export function defaultsForProcess(process: ProcessId): Partial<RecipeSettings> {
  return PROCESS_DEFINITIONS[process].defaultSettings;
}

export function coerceSettingsForProcess(
  settings: RecipeSettings,
  process: ProcessId,
): RecipeSettings {
  const def = PROCESS_DEFINITIONS[process];
  if (def.lyeChoices.includes(settings.lyeType)) return settings;
  return { ...settings, lyeType: def.defaultSettings.lyeType ?? def.lyeChoices[0] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @soap-calc/web -- process`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/process.ts packages/web/src/lib/process.test.ts
git commit -m "feat(web): add PROCESS_DEFINITIONS config + process helpers"
```

---

### Task 2: Process-aware lye/water field choices

**Files:**
- Modify: `packages/web/src/lib/settingsFields.ts`
- Test: `packages/web/src/lib/settingsFields.test.ts`

**Interfaces:**
- Consumes: `PROCESS_DEFINITIONS`, `ProcessId` from `./process`; `LyeType`, `WaterMode` from `@soap-calc/core`.
- Produces: `LYE_TYPE_LABELS: Record<LyeType,string>`; `WATER_MODE_LABELS: Record<WaterMode,string>`; `lyeChoicesFor(p: ProcessId): LyeType[]`; `waterModeChoicesFor(p: ProcessId): WaterMode[]`.

- [ ] **Step 1: Write the failing test** (append to existing test file)

```ts
// packages/web/src/lib/settingsFields.test.ts — add these
import { describe, it, expect } from 'vitest';
import {
  LYE_TYPE_LABELS,
  WATER_MODE_LABELS,
  lyeChoicesFor,
  waterModeChoicesFor,
} from './settingsFields';

describe('process-aware field choices', () => {
  it('labels every lye type and water mode', () => {
    expect(LYE_TYPE_LABELS.koh).toContain('KOH');
    expect(WATER_MODE_LABELS.lye_water_ratio).toContain('ratio');
  });

  it('lyeChoicesFor restricts by process', () => {
    expect(lyeChoicesFor('ls')).toEqual(['koh', 'dual']);
    expect(lyeChoicesFor('cp')).toEqual(['naoh', 'dual']);
  });

  it('waterModeChoicesFor returns the process water modes', () => {
    expect(waterModeChoicesFor('cp')).toContain('percent_of_oils');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @soap-calc/web -- settingsFields`
Expected: FAIL — exports not found.

- [ ] **Step 3: Write minimal implementation** (append to `settingsFields.ts`)

```ts
// packages/web/src/lib/settingsFields.ts — add imports at top:
import type { LyeType, WaterMode } from '@soap-calc/core';
import { PROCESS_DEFINITIONS, type ProcessId } from './process';

// ...existing PURITY_FIELDS / WATER_FIELDS / purityFieldsFor stay unchanged...

// append:
export const LYE_TYPE_LABELS: Record<LyeType, string> = {
  naoh: 'NaOH (bar soap)',
  koh: 'KOH (liquid soap)',
  dual: 'NaOH + KOH blend',
};

export const WATER_MODE_LABELS: Record<WaterMode, string> = {
  percent_of_oils: '% of oils',
  lye_concentration: 'Lye concentration %',
  lye_water_ratio: 'Water : lye ratio',
};

export function lyeChoicesFor(process: ProcessId): LyeType[] {
  return PROCESS_DEFINITIONS[process].lyeChoices;
}

export function waterModeChoicesFor(process: ProcessId): WaterMode[] {
  return PROCESS_DEFINITIONS[process].waterModeChoices;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @soap-calc/web -- settingsFields`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/settingsFields.ts packages/web/src/lib/settingsFields.test.ts
git commit -m "feat(web): add process-aware lye/water field choices + labels"
```

---

### Task 3: Per-process draft storage + legacy migration

**Files:**
- Modify: `packages/web/src/lib/recipeStorage.ts`
- Test: `packages/web/src/lib/recipeStorage.test.ts`

**Interfaces:**
- Consumes: `ProcessId` from `./process`.
- Produces (changed signatures): `loadDraft(process: ProcessId)`, `saveDraft(process: ProcessId, name, lines, settings, additives?)`; new: `loadActiveProcess(): ProcessId`, `saveActiveProcess(p: ProcessId): void`, `migrateLegacyDraft(): void`.

- [ ] **Step 1: Write the failing test** (append)

```ts
// packages/web/src/lib/recipeStorage.test.ts — add
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadDraft,
  saveDraft,
  loadActiveProcess,
  saveActiveProcess,
  migrateLegacyDraft,
} from './recipeStorage';
import { DEFAULT_SETTINGS, createStarterLines, createEmptyAdditives } from './recipe';

beforeEach(() => localStorage.clear());

describe('per-process drafts', () => {
  it('keeps drafts isolated per process', () => {
    saveDraft('cp', 'CP one', createStarterLines(), DEFAULT_SETTINGS, createEmptyAdditives());
    expect(loadDraft('cp')?.name).toBe('CP one');
    expect(loadDraft('ls')).toBeNull();
  });

  it('persists the active process', () => {
    expect(loadActiveProcess()).toBe('cp'); // default
    saveActiveProcess('ls');
    expect(loadActiveProcess()).toBe('ls');
  });

  it('migrates a legacy NaOH draft into cp + sets active process, once', () => {
    const payload = JSON.stringify({ version: 2, name: 'Legacy', lines: [], settings: { ...DEFAULT_SETTINGS, lyeType: 'naoh' } });
    localStorage.setItem('soap-calc:draft', payload);
    migrateLegacyDraft();
    expect(loadDraft('cp')?.name).toBe('Legacy');
    expect(loadActiveProcess()).toBe('cp');
    expect(localStorage.getItem('soap-calc:draft')).toBeNull();
    migrateLegacyDraft(); // idempotent, no throw
    expect(loadDraft('cp')?.name).toBe('Legacy');
  });

  it('routes a legacy KOH (liquid soap) draft to LS, not CP — no silent alkali flip', () => {
    const payload = JSON.stringify({ version: 2, name: 'Body wash', lines: [], settings: { ...DEFAULT_SETTINGS, lyeType: 'koh' } });
    localStorage.setItem('soap-calc:draft', payload);
    migrateLegacyDraft();
    expect(loadDraft('ls')?.name).toBe('Body wash');
    expect(loadDraft('cp')).toBeNull();
    expect(loadActiveProcess()).toBe('ls');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @soap-calc/web -- recipeStorage`
Expected: FAIL — new exports missing / `loadDraft` arity.

- [ ] **Step 3: Write minimal implementation** (edit `recipeStorage.ts`)

Add near the top imports: `import { isProcessId, type ProcessId } from './process';`

Replace the `DRAFT_KEY` constant and the `loadDraft` / `saveDraft` signatures:

```ts
// replace: const DRAFT_KEY = 'soap-calc:draft';
const LEGACY_DRAFT_KEY = 'soap-calc:draft';
const ACTIVE_PROCESS_KEY = 'soap-calc:active-process';
function draftKey(process: ProcessId): string {
  return `soap-calc:draft:${process}`;
}

export function loadActiveProcess(): ProcessId {
  try {
    const raw = localStorage.getItem(ACTIVE_PROCESS_KEY);
    return isProcessId(raw) ? raw : 'cp';
  } catch {
    return 'cp';
  }
}

export function saveActiveProcess(process: ProcessId): void {
  safeSetItem(ACTIVE_PROCESS_KEY, process);
}

export function migrateLegacyDraft(): void {
  try {
    const legacy = localStorage.getItem(LEGACY_DRAFT_KEY);
    if (legacy === null) return;
    // Route by the legacy recipe's alkali: a KOH (liquid soap) recipe lands on LS,
    // everything else on CP. Otherwise coerceSettingsForProcess would silently flip a
    // KOH recipe to NaOH when it loads under CP (different SAP → wrong lye weight).
    let target: ProcessId = 'cp';
    try {
      const parsed = JSON.parse(legacy) as { settings?: { lyeType?: unknown } };
      if (parsed?.settings?.lyeType === 'koh') target = 'ls';
    } catch {
      // unparseable legacy payload → default to cp
    }
    if (localStorage.getItem(draftKey(target)) === null) {
      safeSetItem(draftKey(target), legacy);
    }
    // Seed the active process to match, so the user lands on the right tab — but only
    // if not already set (don't clobber a returning user's choice on a repeat call).
    if (localStorage.getItem(ACTIVE_PROCESS_KEY) === null) {
      safeSetItem(ACTIVE_PROCESS_KEY, target);
    }
    localStorage.removeItem(LEGACY_DRAFT_KEY);
  } catch {
    // ignore
  }
}
```

Change `loadDraft` to take a process and read `draftKey(process)`:

```ts
export function loadDraft(process: ProcessId): { /* unchanged return type */ } | null {
  try {
    const raw = localStorage.getItem(draftKey(process));
    // ...rest of the existing body unchanged...
  } catch {
    return null;
  }
}
```

Change `saveDraft` to take a process first and write `draftKey(process)`:

```ts
export function saveDraft(
  process: ProcessId,
  name: string,
  lines: RecipeLine[],
  settings: RecipeSettings,
  additives: AdditiveLine[] = createEmptyAdditives(),
): void {
  const payload: DraftPayload = {
    version: STORAGE_VERSION,
    name,
    lines: cloneLines(lines),
    additives: cloneAdditives(additives),
    settings,
    updatedAt: new Date().toISOString(),
  };
  safeSetItem(draftKey(process), JSON.stringify(payload));
}
```

- [ ] **Step 3b: Update the EXISTING recipeStorage tests to the new arity**

`recipeStorage.test.ts` already has three tests using the old signatures — they will fail until updated. Change every call:
- `loadDraft()` → `loadDraft('cp')`
- `saveDraft('My batch', lines, DEFAULT_SETTINGS, additives)` → `saveDraft('cp', 'My batch', lines, DEFAULT_SETTINGS, additives)`
- `saveDraft('Legacy', {…} as never)` → `saveDraft('cp', 'Legacy', lines, {…} as never)`
- `saveDraft('Draft', lines, DEFAULT_SETTINGS)` → `saveDraft('cp', 'Draft', lines, DEFAULT_SETTINGS)` (the localStorage-fails test)

Keep their assertions otherwise unchanged — they still verify round-trip, normalize-on-load, and no-throw behavior, now scoped to the `cp` draft key.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @soap-calc/web -- recipeStorage`
Expected: PASS. (Note: this changes `loadDraft`/`saveDraft` arity — Tasks 5 & 6 update the callers; TypeScript errors in `useRecipeStorage.ts`/`useRecipeAutosave.ts` are expected until then and do not block this task's unit test.)

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/recipeStorage.ts packages/web/src/lib/recipeStorage.test.ts
git commit -m "feat(web): per-process drafts + active-process + legacy migration"
```

---

### Task 4: `process` in the export/import file

**Files:**
- Modify: `packages/web/src/lib/recipeFile.ts`
- Test: `packages/web/src/lib/recipeFile.test.ts`

**Interfaces:**
- Consumes: `ProcessId`, `isProcessId` from `./process`.
- Produces (changed): `RecipeFilePayload` gains `process: ProcessId`; `serializeRecipeFile(name, lines, settings, additives, process)`; `parseRecipeFile` result `data.process` (defaults to `'cp'` when missing/invalid).

- [ ] **Step 1: Write the failing test** (append)

```ts
// packages/web/src/lib/recipeFile.test.ts — add
import { describe, it, expect } from 'vitest';
import { serializeRecipeFile, parseRecipeFile } from './recipeFile';
import { DEFAULT_SETTINGS, createStarterLines } from './recipe';

describe('recipe file process', () => {
  it('serializes the process and round-trips it', () => {
    const payload = serializeRecipeFile('R', createStarterLines(), DEFAULT_SETTINGS, [], 'ls');
    expect(payload.process).toBe('ls');
    const parsed = parseRecipeFile(JSON.stringify(payload));
    expect(parsed.ok && parsed.data.process).toBe('ls');
  });

  it('defaults a file with no/invalid process to cp', () => {
    const raw = JSON.stringify({ version: 2, name: 'R', lines: [], settings: DEFAULT_SETTINGS });
    const parsed = parseRecipeFile(raw);
    expect(parsed.ok && parsed.data.process).toBe('cp');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @soap-calc/web -- recipeFile`
Expected: FAIL — `process` missing on payload / serialize arity.

- [ ] **Step 3: Write minimal implementation** (edit `recipeFile.ts`)

Add import: `import { isProcessId, type ProcessId } from './process';`

Add to `RecipeFilePayload` type: `process: ProcessId;`

Change `serializeRecipeFile` signature + body to include process:

```ts
export function serializeRecipeFile(
  name: string,
  lines: RecipeLine[],
  settings: RecipeSettings,
  additives: AdditiveLine[] = [],
  process: ProcessId = 'cp',
): RecipeFilePayload {
  return {
    version: RECIPE_FILE_VERSION,
    process,
    // ...rest of existing returned object unchanged...
  };
}
```

In `parseRecipeFile`, add `process` to the returned `data` object:

```ts
    data: {
      version: RECIPE_FILE_VERSION,
      process: isProcessId(parsed.process) ? parsed.process : 'cp',
      name: parsed.name,
      // ...rest unchanged...
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @soap-calc/web -- recipeFile`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/recipeFile.ts packages/web/src/lib/recipeFile.test.ts
git commit -m "feat(web): carry process in recipe export/import files"
```

---

### Task 5: Autosave to the active process's draft

**Files:**
- Modify: `packages/web/src/hooks/useRecipeAutosave.ts`
- Test: `packages/web/src/hooks/useRecipeAutosave.test.tsx`

**Interfaces:**
- Consumes: `saveDraft(process, ...)` (Task 3); `ProcessId` from `../lib/process`.
- Produces (changed): `useRecipeAutosave(process, recipeName, lines, settings, additives)`.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/src/hooks/useRecipeAutosave.test.tsx
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRecipeAutosave } from './useRecipeAutosave';
import { loadDraft } from '../lib/recipeStorage';
import { DEFAULT_SETTINGS, createStarterLines, createEmptyAdditives } from '../lib/recipe';

beforeEach(() => localStorage.clear());

describe('useRecipeAutosave', () => {
  it('writes the draft under the active process key', () => {
    vi.useFakeTimers();
    renderHook(() =>
      useRecipeAutosave('ls', 'Body wash', createStarterLines(), DEFAULT_SETTINGS, createEmptyAdditives()),
    );
    vi.advanceTimersByTime(600);
    vi.useRealTimers();
    expect(loadDraft('ls')?.name).toBe('Body wash');
    expect(loadDraft('cp')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @soap-calc/web -- useRecipeAutosave`
Expected: FAIL — `useRecipeAutosave` arity / draft not saved to `ls`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/web/src/hooks/useRecipeAutosave.ts
import { useEffect } from 'react';
import type { AdditiveLine, RecipeLine, RecipeSettings } from '../lib/recipe';
import type { ProcessId } from '../lib/process';
import { saveDraft } from '../lib/recipeStorage';

const AUTOSAVE_MS = 500;

export function useRecipeAutosave(
  process: ProcessId,
  recipeName: string,
  lines: RecipeLine[],
  settings: RecipeSettings,
  additives: AdditiveLine[],
) {
  useEffect(() => {
    const timer = setTimeout(() => {
      saveDraft(process, recipeName, lines, settings, additives);
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [process, recipeName, lines, settings, additives]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @soap-calc/web -- useRecipeAutosave`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/useRecipeAutosave.ts packages/web/src/hooks/useRecipeAutosave.test.tsx
git commit -m "feat(web): autosave to the active process draft"
```

---

### Task 6: `useRecipeStorage` — active process, `setProcess`, process-seeded defaults

**Files:**
- Modify: `packages/web/src/hooks/useRecipeStorage.ts`
- Test: `packages/web/src/hooks/useRecipeStorage.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`defaultsForProcess`, `coerceSettingsForProcess`, `ProcessId`), Task 3 (`loadDraft(process)`, `saveDraft(process,...)`, `loadActiveProcess`, `saveActiveProcess`, `migrateLegacyDraft`), Task 4 (`serializeRecipeFile(...,process)`, `parseRecipeFile().data.process`).
- Produces (added to return): `process: ProcessId`, `setProcess(next: ProcessId): void`. Existing return keys unchanged. `handleExport`/`handleImportFile` become process-aware internally.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/src/hooks/useRecipeStorage.test.tsx
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRecipeStorage } from './useRecipeStorage';
import { saveDraft, saveActiveProcess } from '../lib/recipeStorage';
import { DEFAULT_SETTINGS, createStarterLines, createEmptyAdditives } from '../lib/recipe';

beforeEach(() => localStorage.clear());

describe('useRecipeStorage process', () => {
  it('starts on the persisted active process and loads that draft', () => {
    saveActiveProcess('ls');
    saveDraft('ls', 'LS draft', createStarterLines(), { ...DEFAULT_SETTINGS, lyeType: 'koh' }, createEmptyAdditives());
    const { result } = renderHook(() => useRecipeStorage());
    expect(result.current.process).toBe('ls');
    expect(result.current.recipeName).toBe('LS draft');
  });

  it('setProcess swaps to that process draft (seeding defaults when empty)', () => {
    const { result } = renderHook(() => useRecipeStorage());
    expect(result.current.process).toBe('cp');
    act(() => result.current.setProcess('ls'));
    expect(result.current.process).toBe('ls');
    expect(result.current.settings.lyeType).toBe('koh'); // seeded from LS defaults
  });

  it('handleNew seeds settings from the active process defaults', () => {
    const { result } = renderHook(() => useRecipeStorage());
    act(() => result.current.setProcess('ls'));
    act(() => result.current.handleNew());
    expect(result.current.settings.lyeType).toBe('koh');
    expect(result.current.settings.superfatPercent).toBe('2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @soap-calc/web -- useRecipeStorage`
Expected: FAIL — `process`/`setProcess` undefined.

- [ ] **Step 3: Write minimal implementation** (replace the file body)

```ts
// packages/web/src/hooks/useRecipeStorage.ts
import { useRef, useState } from 'react';
import {
  createEmptyAdditives,
  createStarterLines,
  DEFAULT_SETTINGS,
  migrateRecipeLines,
  normalizeSettings,
  type AdditiveLine,
  type RecipeLine,
  type RecipeSettings,
} from '../lib/recipe';
import {
  loadActiveProcess,
  loadDraft,
  migrateLegacyDraft,
  saveActiveProcess,
  saveDraft,
} from '../lib/recipeStorage';
import {
  coerceSettingsForProcess,
  defaultsForProcess,
  type ProcessId,
} from '../lib/process';
import {
  downloadRecipeFile,
  parseRecipeFile,
  recipeAdditivesFromFile,
  recipeLinesFromFile,
  serializeRecipeFile,
} from '../lib/recipeFile';

type ExportOverride = {
  lines: RecipeLine[];
  settings: RecipeSettings;
  additives?: AdditiveLine[];
};

function seededSettings(process: ProcessId): RecipeSettings {
  return normalizeSettings({ ...DEFAULT_SETTINGS, ...defaultsForProcess(process) });
}

function loadWorkspace(process: ProcessId) {
  const draft = loadDraft(process);
  const settings = draft ? coerceSettingsForProcess(normalizeSettings(draft.settings), process) : seededSettings(process);
  return {
    name: draft?.name ?? 'Starter recipe',
    lines: migrateRecipeLines(draft?.lines ?? createStarterLines(), settings),
    additives: draft?.additives ?? createEmptyAdditives(),
    settings,
  };
}

export function useRecipeStorage() {
  const initial = useRef<{ process: ProcessId; ws: ReturnType<typeof loadWorkspace> } | null>(null);
  if (initial.current === null) {
    migrateLegacyDraft();
    const process = loadActiveProcess();
    initial.current = { process, ws: loadWorkspace(process) };
  }

  const [process, setProcessState] = useState<ProcessId>(initial.current.process);
  const [recipeName, setRecipeName] = useState(initial.current.ws.name);
  const [lines, setLines] = useState<RecipeLine[]>(initial.current.ws.lines);
  const [additives, setAdditives] = useState<AdditiveLine[]>(initial.current.ws.additives);
  const [settings, setSettings] = useState<RecipeSettings>(initial.current.ws.settings);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flashSaveMessage(message: string) {
    if (messageTimer.current) clearTimeout(messageTimer.current);
    setSaveMessage(message);
    messageTimer.current = setTimeout(() => setSaveMessage(null), 2000);
  }

  function setProcess(next: ProcessId) {
    if (next === process) return;
    saveActiveProcess(next);
    const ws = loadWorkspace(next);
    setProcessState(next);
    setRecipeName(ws.name);
    setLines(ws.lines);
    setAdditives(ws.additives);
    setSettings(ws.settings);
  }

  function handleNew() {
    setRecipeName('New recipe');
    setLines(createStarterLines());
    setAdditives(createEmptyAdditives());
    setSettings(seededSettings(process));
  }

  function handleExport(override?: ExportOverride) {
    const linesToExport = override?.lines ?? lines;
    const settingsToExport = override?.settings ?? settings;
    const additivesToExport = override?.additives ?? additives;
    downloadRecipeFile(
      serializeRecipeFile(recipeName, linesToExport, settingsToExport, additivesToExport, process),
    );
    flashSaveMessage('Recipe exported');
  }

  function handleImportFile(file: File) {
    file
      .text()
      .then((raw) => {
        const parsed = parseRecipeFile(raw);
        if (!parsed.ok) {
          flashSaveMessage(parsed.error);
          return;
        }
        const nextProcess = parsed.data.process;
        const importedSettings = coerceSettingsForProcess(
          normalizeSettings(parsed.data.settings),
          nextProcess,
        );
        const importedLines = migrateRecipeLines(
          recipeLinesFromFile(parsed.data.lines),
          importedSettings,
        );
        const importedAdditives = recipeAdditivesFromFile(parsed.data.additives);
        saveActiveProcess(nextProcess);
        setProcessState(nextProcess);
        setRecipeName(parsed.data.name);
        setLines(importedLines);
        setAdditives(importedAdditives);
        setSettings(importedSettings);
        saveDraft(nextProcess, parsed.data.name, importedLines, importedSettings, importedAdditives);
        flashSaveMessage(`Imported “${parsed.data.name}”`);
      })
      .catch(() => flashSaveMessage('Could not read recipe file'));
  }

  return {
    process,
    setProcess,
    recipeName,
    setRecipeName,
    lines,
    setLines,
    additives,
    setAdditives,
    settings,
    setSettings,
    saveMessage,
    handleNew,
    handleExport,
    handleImportFile,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @soap-calc/web -- useRecipeStorage`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/useRecipeStorage.ts packages/web/src/hooks/useRecipeStorage.test.tsx
git commit -m "feat(web): active process + setProcess + process-seeded new in useRecipeStorage"
```

---

### Task 7: `ProcessTabs` header control

**Files:**
- Create: `packages/web/src/components/ProcessTabs.tsx`
- Test: `packages/web/src/components/ProcessTabs.test.tsx`

**Interfaces:**
- Consumes: `PROCESS_IDS`, `PROCESS_DEFINITIONS`, `ProcessId` from `../lib/process`.
- Produces: `ProcessTabs({ process, onChange }: { process: ProcessId; onChange: (p: ProcessId) => void })`.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/src/components/ProcessTabs.test.tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProcessTabs } from './ProcessTabs';

describe('ProcessTabs', () => {
  it('renders all three processes and marks the active one', () => {
    render(<ProcessTabs process="cp" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: /cold process/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /liquid soap/i })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onChange when a different process is clicked', async () => {
    const onChange = vi.fn();
    render(<ProcessTabs process="cp" onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    expect(onChange).toHaveBeenCalledWith('ls');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @soap-calc/web -- ProcessTabs`
Expected: FAIL — cannot resolve `./ProcessTabs`. (If `@testing-library/user-event` is missing, add it as a dev dep: `npm i -D @testing-library/user-event -w @soap-calc/web`, then re-run.)

- [ ] **Step 3: Write minimal implementation**

```tsx
// packages/web/src/components/ProcessTabs.tsx
import { PROCESS_DEFINITIONS, PROCESS_IDS, type ProcessId } from '../lib/process';

export function ProcessTabs({
  process,
  onChange,
}: {
  process: ProcessId;
  onChange: (next: ProcessId) => void;
}) {
  return (
    <div className="process-tabs" role="tablist" aria-label="Soap process">
      {PROCESS_IDS.map((id) => {
        const active = id === process;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`process-tabs__tab${active ? ' process-tabs__tab--active' : ''}`}
            onClick={() => onChange(id)}
          >
            {PROCESS_DEFINITIONS[id].label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @soap-calc/web -- ProcessTabs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ProcessTabs.tsx packages/web/src/components/ProcessTabs.test.tsx
git commit -m "feat(web): ProcessTabs segmented control"
```

---

### Task 8: Gate SettingsPanel lye/water selectors by process

**Files:**
- Modify: `packages/web/src/components/SettingsPanel.tsx`
- Test: `packages/web/src/components/SettingsPanel.test.tsx`

**Interfaces:**
- Consumes: `lyeChoicesFor`, `waterModeChoicesFor`, `LYE_TYPE_LABELS`, `WATER_MODE_LABELS` (Task 2); `ProcessId` from `../lib/process`.
- Produces (changed): `SettingsPanel` gains an **optional** `process?: ProcessId` prop (defaults to `'cp'`, so the existing tests that don't pass it keep working); the lye-type and water-method `<select>`s render only the process's allowed options.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/src/components/SettingsPanel.test.tsx
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SettingsPanel } from './SettingsPanel';
import { DEFAULT_SETTINGS } from '../lib/recipe';

const noop = () => {};
const baseProps = {
  setSettings: noop,
  weightUnit: 'g' as const,
  totalOilGrams: 0,
  lyeGrams: 0,
  waterSuggestion: null,
  moldSizerInput: { lengthCm: '', widthCm: '', heightCm: '', wasteFactorPercent: '' },
  onMoldSizerChange: noop,
  liveOilBatchFraction: null,
  onApplySuggestedOilGrams: noop,
};

describe('SettingsPanel lye gating', () => {
  it('LS process offers only KOH and dual (no plain NaOH bar option)', () => {
    render(<SettingsPanel {...baseProps} process="ls" settings={{ ...DEFAULT_SETTINGS, lyeType: 'koh' }} />);
    const select = screen.getByLabelText(/lye type/i);
    const options = within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(['koh', 'dual']);
  });

  it('CP process offers NaOH and dual', () => {
    render(<SettingsPanel {...baseProps} process="cp" settings={DEFAULT_SETTINGS} />);
    const select = screen.getByLabelText(/lye type/i);
    const options = within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(['naoh', 'dual']);
  });
});
```

Note: `SettingsPanel.test.tsx` **already exists** — append this `describe('SettingsPanel lye gating')` block to it (add `within` to the existing `@testing-library/react` import; don't re-declare imports it already has, and don't remove the superfat/dual/attr-lock tests). The test relies on the `Lye type` label being associated with the select: keep the `<label>` wrapping the `<select>` (it does today) and add an `aria-label="Lye type"` to the `<select>` so `getByLabelText` resolves it. The existing `dual lye type reveals the KOH blend field` test still passes because `dual` remains in CP's option set.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @soap-calc/web -- SettingsPanel`
Expected: FAIL — `process` prop unknown / options not gated.

- [ ] **Step 3: Write minimal implementation** (edit `SettingsPanel.tsx`)

Add to imports:
```ts
import {
  purityFieldsFor,
  WATER_FIELDS,
  lyeChoicesFor,
  waterModeChoicesFor,
  LYE_TYPE_LABELS,
  WATER_MODE_LABELS,
} from '../lib/settingsFields';
import type { ProcessId } from '../lib/process';
```

Add `process?: ProcessId;` to `SettingsPanelProps` and destructure it with a default in the component params: `process = 'cp'`. Making it optional keeps the existing SettingsPanel tests (superfat / dual-reveals-KOH-blend / NaOH-purity attr-lock) rendering without a `process` prop — they exercise CP's option set by default and must stay green.

Replace the hardcoded lye-type `<select>` options:
```tsx
        <label className="field">
          <span>Lye type</span>
          <select
            className="input"
            aria-label="Lye type"
            value={settings.lyeType}
            onChange={(e) =>
              setSettings((s) => ({ ...s, lyeType: e.target.value as typeof settings.lyeType }))
            }
          >
            {lyeChoicesFor(process).map((lye) => (
              <option key={lye} value={lye}>{LYE_TYPE_LABELS[lye]}</option>
            ))}
          </select>
        </label>
```

Replace the hardcoded water-method `<select>` options:
```tsx
        <label className="field">
          <span>Water method</span>
          <select
            className="input"
            aria-label="Water method"
            value={settings.waterMode}
            onChange={(e) =>
              setSettings((s) => ({ ...s, waterMode: e.target.value as typeof settings.waterMode }))
            }
          >
            {waterModeChoicesFor(process).map((mode) => (
              <option key={mode} value={mode}>{WATER_MODE_LABELS[mode]}</option>
            ))}
          </select>
        </label>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @soap-calc/web -- SettingsPanel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/SettingsPanel.tsx packages/web/src/components/SettingsPanel.test.tsx
git commit -m "feat(web): gate SettingsPanel lye/water selectors by process"
```

---

### Task 9: Wire the process switch into the App shell

**Files:**
- Modify: `packages/web/src/App.tsx`
- Test: `packages/web/src/App.test.tsx` (create)

**Interfaces:**
- Consumes: `useRecipeStorage().process`/`.setProcess` (Task 6); `useRecipeAutosave(process, ...)` (Task 5); `ProcessTabs` (Task 7); `SettingsPanel` `process` prop (Task 8).
- Produces: no new exports; renders `<ProcessTabs>` in the header and threads `process`.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/src/App.test.tsx
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

beforeEach(() => localStorage.clear());

describe('App process switch', () => {
  it('switches the lye options when the Liquid Soap tab is chosen', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    const select = screen.getByLabelText(/lye type/i);
    const options = within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(['koh', 'dual']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @soap-calc/web -- App`
Expected: FAIL — no `tab` role (ProcessTabs not rendered yet).

- [ ] **Step 3: Write minimal implementation** (edit `App.tsx`)

Add imports:
```ts
import { ProcessTabs } from './components/ProcessTabs';
```

Destructure `process` and `setProcess` from `useRecipeStorage()`:
```ts
  const {
    process,
    setProcess,
    recipeName,
    setRecipeName,
    // ...rest unchanged...
  } = useRecipeStorage();
```

Pass the active process to autosave:
```ts
  useRecipeAutosave(process, recipeName, lines, settings, additives);
```

Render `<ProcessTabs>` in the header (immediately below `<div className="header__brand">…</div>`, before `.recipe-toolbar`):
```tsx
        <ProcessTabs process={process} onChange={setProcess} />
```

Pass `process` to `SettingsPanel`:
```tsx
          <SettingsPanel
            process={process}
            settings={settings}
            setSettings={setSettings}
            // ...rest unchanged...
          />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @soap-calc/web -- App`
Expected: PASS.

- [ ] **Step 5: Run the full web + core suites (regression gate)**

Run: `npm test`
Expected: all suites PASS (CP behavior unchanged; new process tests green).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/App.test.tsx
git commit -m "feat(web): wire ProcessTabs + process into the app shell"
```

---

## Optional polish (add minimal CSS)

The `.process-tabs` classes need styles in `packages/web/src/index.css` (segmented control). This is presentational only and can be a follow-up commit; the tab switch is fully functional without it. If styling now: add a `.process-tabs` flex row with `.process-tabs__tab--active` highlighted using existing accent tokens.

---

## Self-Review

**Spec coverage:** process concept + state (Tasks 1,6) ✓ · per-process storage + migration (Task 3) ✓ · `PROCESS_DEFINITIONS` (Task 1) ✓ · header tab switcher (Tasks 7,9) ✓ · process-aware settings (Tasks 2,8) ✓ · CP fully wired / HP-LS scaffolded (defaults seed; shared panels render; feature panels deferred) ✓ · "C-middle" lye gating + coerce (Tasks 1,8) ✓ · import/export process (Tasks 4,6) ✓ · testing across core/storage/component (every task) ✓.

**Deferred (spec-noted, not in these tasks):** HP/LS-only feature panels (post-cook, dilution, preserve) and extracting the mold sizer out of `SettingsPanel` so LS omits it — the `panels` field exists in the config but the shell does not yet gate on it. This is intentional scope per the spec; the mold sizer currently shows in all tabs. Flagged for the next spec.

**Placeholder scan:** none — every code step contains complete code.

**Type consistency:** `loadDraft(process)`/`saveDraft(process,…)` new arity is consumed consistently in Tasks 5 (autosave) and 6 (storage hook); `serializeRecipeFile(…, process)` and `parsed.data.process` line up between Tasks 4 and 6; `ProcessId` is defined once (Task 1) and imported everywhere; `SettingsPanel` `process` prop is produced in Task 8 and passed in Task 9.

**Review revisions (post-`/code-review`, applied 2026-07-10):**
1. **Base reconciled** — this plan now sits on `origin/main`, which includes the `waterMode`/`lyeType` sanitization fix (`0f02852`). `normalizeSettings` already coerces invalid enums to global defaults; `coerceSettingsForProcess` then re-maps `lyeType` to the process default. The two compose correctly (global default → process default); no change needed, just be aware both touch `lyeType`.
2. **Migration no longer flips alkali** (Task 3) — the legacy single draft is routed by its `lyeType` (`koh` → LS, else CP) and the active process is seeded to match, instead of forcing CP + coercing (which silently turned a KOH liquid-soap recipe into NaOH). Two migration tests cover this.
3. **CP is not "identical to today"** — its lye selector drops KOH (→ `naoh`/`dual`); KOH lives on the LS tab. Wording corrected in Global Constraints.
4. **Existing tests updated, not overwritten** — Task 3 fixes the 3 old-arity `recipeStorage` tests; Task 8 makes `process` **optional (default `'cp'`)** and appends to the existing `SettingsPanel.test.tsx` (preserving the superfat/dual/attr-lock guards) rather than recreating it.
5. **Execution caution:** `npm test` runs `tsc --noEmit` across all packages, so the *full* build is red between Tasks 3–6 (arity change lands before its callers). Use the per-task filtered `vitest` runs as written; only run full `npm test` at Task 9.
