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
      moldShape: data.moldShape === 'cylinder' ? 'cylinder' : 'rectangular',
      length: typeof data.length === 'string' ? data.length : '',
      width: typeof data.width === 'string' ? data.width : '',
      height: typeof data.height === 'string' ? data.height : '',
      radius: typeof data.radius === 'string' ? data.radius : '',
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

/** Returns false when the write failed (e.g. quota exceeded or storage blocked in
 * private mode), mirroring recipeStorage's saveDraft/safeSetItem so callers can be
 * consistent about reporting a lost write. The mold sizer's caller is a fire-and-forget
 * effect, so wiring a UI warning is left to the caller's discretion. */
export function saveMoldSizerInput(input: MoldSizerInput): boolean {
  try {
    localStorage.setItem(MOLD_SIZER_KEY, JSON.stringify(input));
    return true;
  } catch {
    return false;
  }
}
