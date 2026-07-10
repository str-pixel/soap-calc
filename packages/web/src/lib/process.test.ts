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
