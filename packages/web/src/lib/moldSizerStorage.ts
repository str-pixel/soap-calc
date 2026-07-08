import {
  DEFAULT_MOLD_SIZER_INPUT,
  type MoldSizerInput,
} from './moldSizer';

const MOLD_SIZER_KEY = 'soap-calc:mold-sizer';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function loadMoldSizerInput(): MoldSizerInput {
  try {
    const raw = localStorage.getItem(MOLD_SIZER_KEY);
    if (!raw) return { ...DEFAULT_MOLD_SIZER_INPUT };
    const data = JSON.parse(raw) as unknown;
    if (!isRecord(data)) return { ...DEFAULT_MOLD_SIZER_INPUT };
    return {
      mode: data.mode === 'bars' ? 'bars' : 'mold',
      length: typeof data.length === 'string' ? data.length : '',
      width: typeof data.width === 'string' ? data.width : '',
      height: typeof data.height === 'string' ? data.height : '',
      barCount: typeof data.barCount === 'string' ? data.barCount : '',
      barWeight: typeof data.barWeight === 'string' ? data.barWeight : '',
      useInches: data.useInches === true,
      wasteFactorPercent:
        typeof data.wasteFactorPercent === 'string' ? data.wasteFactorPercent : '0',
    };
  } catch {
    return { ...DEFAULT_MOLD_SIZER_INPUT };
  }
}

export function saveMoldSizerInput(input: MoldSizerInput): void {
  try {
    localStorage.setItem(MOLD_SIZER_KEY, JSON.stringify(input));
  } catch {
    // ignore quota errors
  }
}
