import type { LyeType, WaterMode } from '@soap-calc/core';
import type { RecipeSettings } from './recipe';
import { defaultVariantFor, isProcessVariantId, processProfileById } from './processProfile';

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
      soapingTempF: '125', // soapingTempRangeFor('cp').defaultF
      processVariant: defaultVariantFor('cp'),
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
      soapingTempF: '140', // soapingTempRangeFor('hp-lthp').defaultF — HP's default variant
      postCookSuperfatTotalPercent: '5',
      postCookSuperfatOils: [{ oilId: 'olive-oil', percent: '5' }],
      processVariant: defaultVariantFor('hp'),
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
      soapingTempF: '95', // soapingTempRangeFor('ls-cpls').defaultF — LS's default variant
      postCookSuperfatTotalPercent: '2',
      postCookSuperfatOils: [{ oilId: 'olive-oil', percent: '2' }],
      processVariant: defaultVariantFor('ls'),
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
  const lyeOk = def.lyeChoices.includes(settings.lyeType);
  // A variant belongs to exactly one process (e.g. 'hp-hthp' → 'hp'); once that no longer
  // matches the target process — switching HP→CP while processVariant is still 'hp-hthp',
  // or the string is garbage/missing — reset to that process's own default variant.
  const variantOk =
    isProcessVariantId(settings.processVariant) &&
    processProfileById(settings.processVariant).process === process;
  if (lyeOk && variantOk) return settings;
  return {
    ...settings,
    // `?? def.lyeChoices[0]` is unreachable today (every process sets an explicit
    // defaultSettings.lyeType) but defaultSettings is a Partial, so a future process that
    // omits it would otherwise fall through to `undefined`. Kept as a defensive default.
    lyeType: lyeOk ? settings.lyeType : (def.defaultSettings.lyeType ?? def.lyeChoices[0]),
    processVariant: variantOk ? settings.processVariant : defaultVariantFor(process),
  };
}

/** Suffix for the import flash. Inference is the one silent-guess path left, so it is
 * always announced — it is wrong for legacy NaOH hot-process files, and the announcement
 * is what makes that survivable (spec 2026-07-30). */
export function importRoutingSuffix(
  source: 'declared' | 'inferred',
  process: ProcessId,
): string {
  return source === 'inferred'
    ? ` as ${PROCESS_DEFINITIONS[process].label.toLowerCase()} — this file predates process tags`
    : '';
}
