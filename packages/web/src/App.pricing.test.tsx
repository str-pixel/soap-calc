// @vitest-environment jsdom
// packages/web/src/App.pricing.test.tsx
// NOTE: the jsdom pragma above MUST be line 1 — web vitest defaults to environment:'node'.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';

// Node 22+ defines its own (experimental, file-backed) global `localStorage` getter
// that shadows jsdom's implementation unless `--localstorage-file` is configured.
// Stub it with an in-memory fake instead, same as App.test.tsx / pricingStorage.test.ts.
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

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage());
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('App pricing integration', () => {
  it('renders the pricing panel with the recipe default oils', () => {
    render(<App />);
    // Pricing lives on its own top-level tab now; switch to it first.
    fireEvent.click(screen.getByRole('tab', { name: 'Pricing & profit' }));
    // The default recipe has oils; the pricing panel heading and at least one oil row appear.
    expect(screen.getByRole('heading', { name: /pricing/i })).toBeTruthy();
    // Every default oil exposes a price input labelled "Price for <name>".
    expect(screen.getAllByLabelText(/^Price for /).length).toBeGreaterThan(0);
  });
});
