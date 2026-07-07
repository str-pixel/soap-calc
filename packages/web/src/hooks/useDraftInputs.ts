import { useCallback, useState } from 'react';

export function useDraftInputs() {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const getDraft = useCallback(
    (id: string, canonicalDisplay: string) =>
      id in drafts ? drafts[id] : canonicalDisplay,
    [drafts],
  );

  const setDraft = useCallback((id: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [id]: value }));
  }, []);

  const clearDraft = useCallback((id: string) => {
    setDrafts((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const clearAllDrafts = useCallback(() => {
    setDrafts({});
  }, []);

  return { getDraft, setDraft, clearDraft, clearAllDrafts, drafts };
}
