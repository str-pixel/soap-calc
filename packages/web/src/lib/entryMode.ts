import type { EntryMode, RecipeLine, RecipeSettings } from './recipe';

function parseNum(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function convertEntryMode(
  lines: RecipeLine[],
  settings: RecipeSettings,
  entryMode: EntryMode,
): { lines: RecipeLine[]; settings: RecipeSettings } {
  if (settings.entryMode === entryMode) {
    return { lines, settings };
  }

  if (entryMode === 'percent') {
    const total =
      lines.reduce((sum, line) => sum + (parseNum(line.weightGrams) ?? 0), 0) ||
      Number(settings.batchOilGrams) ||
      1000;

    return {
      settings: { ...settings, entryMode, batchOilGrams: String(total) },
      lines: lines.map((line) => {
        const grams = parseNum(line.weightGrams) ?? 0;
        const pct = total > 0 ? (grams / total) * 100 : 0;
        return {
          ...line,
          weightPercent: grams > 0 ? String(Math.round(pct * 10) / 10) : '',
        };
      }),
    };
  }

  const batch = parseNum(settings.batchOilGrams) ?? 1000;
  return {
    settings: { ...settings, entryMode },
    lines: lines.map((line) => {
      const pct = parseNum(line.weightPercent ?? '') ?? 0;
      const grams = (batch * pct) / 100;
      return {
        ...line,
        weightGrams: pct > 0 ? String(Math.round(grams)) : line.weightGrams,
      };
    }),
  };
}
