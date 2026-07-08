import { beforeEach, describe, expect, it, vi } from 'vitest';
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
});
