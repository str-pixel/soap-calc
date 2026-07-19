import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MOLD_SIZER_INPUT } from './moldSizer';
import { loadMoldSizerInput, saveMoldSizerInput } from './moldSizerStorage';

function createStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe('moldSizerStorage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips mold sizer input', () => {
    const input = {
      ...DEFAULT_MOLD_SIZER_INPUT,
      mode: 'bars' as const,
      barCount: '10',
      barWeight: '100',
    };
    saveMoldSizerInput(input);
    expect(loadMoldSizerInput()).toEqual(input);
  });

  it('returns defaults for invalid stored data', () => {
    localStorage.setItem('soap-calc:mold-sizer', '{bad');
    expect(loadMoldSizerInput()).toEqual({ ...DEFAULT_MOLD_SIZER_INPUT });
  });

  it('reports a successful write', () => {
    expect(saveMoldSizerInput(DEFAULT_MOLD_SIZER_INPUT)).toBe(true);
  });

  it('reports a failed write so callers can warn instead of silently losing work', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      get length() {
        return 0;
      },
    });
    expect(saveMoldSizerInput(DEFAULT_MOLD_SIZER_INPUT)).toBe(false);
  });
});
