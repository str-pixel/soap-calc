import { describe, it, expect } from 'vitest';
import {
  PROCESS_IDS,
  PROCESS_DEFINITIONS,
  isProcessId,
  defaultsForProcess,
  normalizeSettingsWithinProcess,
  importRoutingSuffix,
} from './process';
import { DEFAULT_SETTINGS } from './recipe';
import type { ProcessVariantId } from './processProfile';

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
  it('importRoutingSuffix announces inference and stays silent for declared files', () => {
    expect(importRoutingSuffix('inferred', 'cp')).toBe(
      ' as cold process — this file predates process tags',
    );
    expect(importRoutingSuffix('declared', 'hp')).toBe('');
  });
});
