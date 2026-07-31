import { describe, it, expect } from 'vitest';
import {
  PROCESS_IDS,
  PROCESS_DEFINITIONS,
  isProcessId,
  defaultsForProcess,
  normalizeSettingsWithinProcess,
  importRoutingSuffix,
  processProfilesFor,
  allProcessVariantIds,
  type ProcessVariantId,
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

  it('normalizeSettingsWithinProcess fixes an invalid lye type', () => {
    const naohInLs = { ...DEFAULT_SETTINGS, lyeType: 'naoh' as const };
    expect(normalizeSettingsWithinProcess(naohInLs, 'ls').lyeType).toBe('koh');
    const kohInCp = { ...DEFAULT_SETTINGS, lyeType: 'koh' as const };
    expect(normalizeSettingsWithinProcess(kohInCp, 'cp').lyeType).toBe('naoh');
  });

  it('normalizeSettingsWithinProcess leaves a valid lye type and variant untouched (same ref)', () => {
    const dualInLs = {
      ...DEFAULT_SETTINGS,
      lyeType: 'dual' as const,
      processVariant: 'ls-cpls' as const,
    };
    expect(normalizeSettingsWithinProcess(dualInLs, 'ls')).toBe(dualInLs);
  });

  it('seeds HP 5% / LS 2% post-cook superfat defaults (single olive-oil row)', () => {
    expect(PROCESS_DEFINITIONS.hp.defaultSettings.postCookSuperfatOils).toEqual([
      { oilId: 'olive-oil', percent: '5' },
    ]);
    expect(PROCESS_DEFINITIONS.ls.defaultSettings.postCookSuperfatOils).toEqual([
      { oilId: 'olive-oil', percent: '2' },
    ]);
  });
});

describe('process sub-variant defaults', () => {
  it('seeds each process defaultSettings.processVariant to that process default variant', () => {
    expect(PROCESS_DEFINITIONS.cp.defaultSettings.processVariant).toBe('cp');
    expect(PROCESS_DEFINITIONS.hp.defaultSettings.processVariant).toBe('hp-lthp');
    expect(PROCESS_DEFINITIONS.ls.defaultSettings.processVariant).toBe('ls-cpls');
  });

  it('normalizeSettingsWithinProcess resets processVariant when its process no longer matches (HP→CP)', () => {
    const hthpSettings = { ...DEFAULT_SETTINGS, processVariant: 'hp-hthp' as const };
    expect(normalizeSettingsWithinProcess(hthpSettings, 'cp').processVariant).toBe('cp');
  });

  it('normalizeSettingsWithinProcess resets processVariant when switching CP→LS', () => {
    const cpSettings = { ...DEFAULT_SETTINGS, processVariant: 'cp' as const };
    expect(normalizeSettingsWithinProcess(cpSettings, 'ls').processVariant).toBe('ls-cpls');
  });

  it('normalizeSettingsWithinProcess leaves a same-process variant untouched (LTHP stays LTHP within HP)', () => {
    const lthpSettings = { ...DEFAULT_SETTINGS, lyeType: 'naoh' as const, processVariant: 'hp-lthp' as const };
    expect(normalizeSettingsWithinProcess(lthpSettings, 'hp').processVariant).toBe('hp-lthp');
  });

  it('normalizeSettingsWithinProcess falls back safely on a garbage processVariant string', () => {
    const garbage = { ...DEFAULT_SETTINGS, processVariant: 'nonsense' as ProcessVariantId };
    expect(normalizeSettingsWithinProcess(garbage, 'cp').processVariant).toBe('cp');
  });
});

describe('importRoutingSuffix', () => {
  // Deliberate contract change (user ruling 2026-07-31): declared files are no longer
// silent — every import names its kind. The inference clause is unchanged.
it('importRoutingSuffix keeps the inference explanation', () => {
  expect(importRoutingSuffix('inferred', 'cp')).toBe(
    ' as cold process — this file predates process tags',
  );
});

it('every import announces which kind of recipe it is', () => {
  // "write that it is cp, hp or ls recipe" — a declared file states its kind plainly;
  // an inferred one additionally explains why the app had to guess.
  expect(importRoutingSuffix('declared', 'hp')).toBe(' as hot process');
  expect(importRoutingSuffix('declared', 'cp')).toBe(' as cold process');
  expect(importRoutingSuffix('inferred', 'ls')).toBe(
    ' as liquid soap — this file predates process tags',
  );
});
});

describe('panel capability declarations (slice 4)', () => {
  it('declares exactly what each process mounts', () => {
    expect(PROCESS_DEFINITIONS.cp.panels).toEqual(['cpExtras']);
    expect(PROCESS_DEFINITIONS.hp.panels).toEqual(['postCook', 'hpVessel']);
    // 'postCook' also belongs to ls: SuperfatWaterPanel's post-cook-superfat slider is an
    // "HP/LS-only knob" (its own comment) gated by processOffersPanel(process, 'postCook'),
    // and useRecipeViewModel's cookFactor/postCookSuperfat memos compute for hp AND ls, null
    // only for cp — declaring ls without 'postCook' would make processOffersPanel diverge
    // from that real behaviour.
    expect(PROCESS_DEFINITIONS.ls.panels).toEqual(['postCook', 'dilution', 'neutralize', 'preserve']);
  });
});

describe('definitions own their variants (slice 2)', () => {
  it('every variant belongs to the definition that lists it', () => {
    for (const p of ['cp', 'hp', 'ls'] as const) {
      for (const v of PROCESS_DEFINITIONS[p].variants) {
        expect(v.process).toBe(p);
      }
    }
  });

  it('the pinned default variant literal matches variants[0]', () => {
    // defaultSettings.processVariant is written literally (it participates in the record
    // that defines variants[0]); this is the drift guard for that pin.
    for (const p of ['cp', 'hp', 'ls'] as const) {
      expect(PROCESS_DEFINITIONS[p].defaultSettings.processVariant).toBe(
        PROCESS_DEFINITIONS[p].variants[0].variant,
      );
    }
  });

  it('the lookup layer reads the definitions, not a second record', () => {
    for (const p of ['cp', 'hp', 'ls'] as const) {
      expect(processProfilesFor(p)).toEqual([...PROCESS_DEFINITIONS[p].variants]);
    }
    expect(allProcessVariantIds().length).toBe(8);
  });
});
