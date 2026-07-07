import { useEffect, useMemo } from 'react';
import { createDebouncer } from '../lib/debouncedCommit';

export function useDebouncedCommit(delayMs = 400) {
  const debouncer = useMemo(() => createDebouncer(delayMs), [delayMs]);

  useEffect(() => () => debouncer.cancelAll(), [debouncer]);

  return debouncer;
}
