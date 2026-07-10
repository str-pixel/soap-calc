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

// Every process currently allows all three water modes — unlike lyeChoices, this list is
// not yet gating anything (waterModeChoicesFor/SettingsPanel just echo it back). It's
// infra-only for now: per-process water-mode restriction is deferred to a later spec.
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

/** The process a legacy / process-less recipe belongs to, inferred from its alkali. */
export function processForLyeType(lyeType: unknown): ProcessId {
  return lyeType === 'koh' ? 'ls' : 'cp';
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
  // `?? def.lyeChoices[0]` is unreachable today (every process sets an explicit
  // defaultSettings.lyeType) but defaultSettings is a Partial, so a future process that
  // omits it would otherwise fall through to `undefined`. Kept as a defensive default.
  return { ...settings, lyeType: def.defaultSettings.lyeType ?? def.lyeChoices[0] };
}
