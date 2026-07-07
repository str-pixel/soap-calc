import { describe, expect, it, vi } from 'vitest';
import { createDebouncer } from './debouncedCommit';

describe('createDebouncer', () => {
  it('cancelAll clears pending scheduled commits', () => {
    vi.useFakeTimers();
    const debouncer = createDebouncer(100);
    const fn = vi.fn();

    debouncer.schedule('a', fn);
    debouncer.cancelAll();
    vi.advanceTimersByTime(150);

    expect(fn).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
