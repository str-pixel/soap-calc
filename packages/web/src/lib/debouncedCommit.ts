export function createDebouncer(delayMs = 400) {
  const timers: Record<string, ReturnType<typeof setTimeout>> = {};

  return {
    schedule(id: string, fn: () => void) {
      clearTimeout(timers[id]);
      timers[id] = setTimeout(() => {
        delete timers[id];
        fn();
      }, delayMs);
    },
    flush(id: string, fn: () => void) {
      clearTimeout(timers[id]);
      delete timers[id];
      fn();
    },
    cancel(id: string) {
      clearTimeout(timers[id]);
      delete timers[id];
    },
    cancelAll() {
      for (const id of Object.keys(timers)) {
        clearTimeout(timers[id]);
        delete timers[id];
      }
    },
  };
}
