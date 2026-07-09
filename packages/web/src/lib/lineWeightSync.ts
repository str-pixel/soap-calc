import type { RecipeLine } from './recipe';

function parseNum(value: string): number | null {
  if (value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function formatGrams(n: number): string {
  return String(Math.round(n));
}

function formatPercent(n: number): string {
  return String(Math.round(n * 10) / 10);
}

function clampPercent(n: number): number {
  return Math.min(100, Math.max(0, n));
}

function totalGrams(lines: RecipeLine[]): number {
  return lines.reduce((sum, line) => sum + (parseNum(line.weightGrams) ?? 0), 0);
}

function syncPercentsFromWeights(lines: RecipeLine[], total: number): RecipeLine[] {
  return lines.map((line) => {
    const grams = parseNum(line.weightGrams) ?? 0;
    if (grams <= 0) {
      return { ...line, weightPercent: '' };
    }
    const pct = total > 0 ? (grams / total) * 100 : 0;
    return { ...line, weightPercent: formatPercent(pct) };
  });
}

function normalizePercentsTo100(lines: RecipeLine[]): RecipeLine[] {
  const parsed = lines.map((line) => ({
    line,
    pct: parseNum(line.weightPercent ?? '') ?? 0,
  }));
  const sum = parsed.reduce((total, row) => total + row.pct, 0);
  if (sum <= 0 || Math.abs(sum - 100) <= 0.05) {
    return lines;
  }

  return parsed.map(({ line, pct }) => ({
    ...line,
    weightPercent: formatPercent((pct / sum) * 100),
  }));
}

function fixGramRounding(lines: RecipeLine[], batch: number, skipKey?: string): RecipeLine[] {
  const sum = lines.reduce((total, line) => total + (parseNum(line.weightGrams) ?? 0), 0);
  const diff = batch - sum;
  if (diff === 0) return lines;

  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].key === skipKey) continue;
    const grams = (parseNum(lines[i].weightGrams) ?? 0) + diff;
    const next = [...lines];
    next[i] = {
      ...lines[i],
      weightGrams: grams > 0 ? formatGrams(grams) : '',
      weightPercent: formatPercent(batch > 0 ? (Math.max(0, grams) / batch) * 100 : 0),
    };
    return next;
  }

  return lines;
}

function distributeWeightsToBatch(
  lines: RecipeLine[],
  key: string,
  editedGrams: number,
  batch: number,
): RecipeLine[] {
  const editedClamped = Math.max(0, Math.min(editedGrams, batch));
  const remaining = batch - editedClamped;
  const otherLines = lines.filter((line) => line.key !== key);

  if (otherLines.length === 0) {
    const target = lines.find((line) => line.key === key);
    if (!target) return lines;
    return [
      {
        ...target,
        weightGrams: editedClamped > 0 ? formatGrams(editedClamped) : '',
        weightPercent: formatPercent(batch > 0 ? (editedClamped / batch) * 100 : 0),
      },
    ];
  }

  const otherWeightSum = otherLines.reduce(
    (sum, line) => sum + (parseNum(line.weightGrams) ?? 0),
    0,
  );

  const otherGrams = otherLines.map((line) => {
    const oldGrams = parseNum(line.weightGrams) ?? 0;
    if (remaining <= 0) return 0;
    if (otherWeightSum > 0) return Math.round((oldGrams / otherWeightSum) * remaining);
    return Math.round(remaining / otherLines.length);
  });

  const allocated = editedClamped + otherGrams.reduce((sum, grams) => sum + grams, 0);
  const diff = batch - allocated;
  if (diff !== 0 && otherGrams.length > 0) {
    otherGrams[otherGrams.length - 1] += diff;
  }

  let otherIndex = 0;
  const synced = lines.map((line) => {
    if (line.key === key) {
      return {
        ...line,
        weightGrams: editedClamped > 0 ? formatGrams(editedClamped) : '',
        weightPercent: formatPercent(batch > 0 ? (editedClamped / batch) * 100 : 0),
      };
    }

    const grams = otherGrams[otherIndex++];
    return {
      ...line,
      weightGrams: grams > 0 ? formatGrams(grams) : '',
      weightPercent: formatPercent(batch > 0 ? (grams / batch) * 100 : 0),
    };
  });

  return fixGramRounding(synced, batch, key);
}

export type SyncedRecipe = {
  lines: RecipeLine[];
  batchOilGrams: string;
};

export function resyncFromWeights(lines: RecipeLine[]): SyncedRecipe {
  const total = totalGrams(lines);
  const batchOilGrams = total > 0 ? formatGrams(total) : '';
  return {
    batchOilGrams,
    lines: syncPercentsFromWeights(lines, total),
  };
}

export function syncWeightEdit(
  lines: RecipeLine[],
  key: string,
  weightGrams: string,
  batchOilGrams: string,
): SyncedRecipe {
  const editedGrams = parseNum(weightGrams);
  const batch = parseNum(batchOilGrams);

  if (editedGrams === null) {
    return {
      batchOilGrams,
      lines: lines.map((line) =>
        line.key === key ? { ...line, weightGrams, weightPercent: '' } : line,
      ),
    };
  }

  if (batch !== null && batch > 0) {
    return {
      batchOilGrams,
      lines: distributeWeightsToBatch(lines, key, editedGrams, batch),
    };
  }

  const updated = lines.map((line) =>
    line.key === key ? { ...line, weightGrams } : line,
  );
  return resyncFromWeights(updated);
}

export function syncPercentEdit(
  lines: RecipeLine[],
  key: string,
  weightPercent: string,
  batchOilGrams: string,
): SyncedRecipe {
  const batch = parseNum(batchOilGrams);
  const editedPct = parseNum(weightPercent);

  if (editedPct === null) {
    return {
      batchOilGrams,
      lines: lines.map((line) =>
        line.key === key ? { ...line, weightPercent, weightGrams: '' } : line,
      ),
    };
  }

  if (batch === null || batch <= 0) {
    return {
      batchOilGrams,
      lines: lines.map((line) =>
        line.key === key ? { ...line, weightPercent } : line,
      ),
    };
  }

  const otherLines = lines.filter((line) => line.key !== key);

  if (otherLines.length === 0) {
    const pct = clampPercent(editedPct);
    const grams = (batch * pct) / 100;
    return {
      batchOilGrams,
      lines: [
        {
          ...lines[0],
          weightPercent: formatPercent(pct),
          weightGrams: pct > 0 ? formatGrams(grams) : '',
        },
      ],
    };
  }

  const editedPctClamped = clampPercent(editedPct);
  const remaining = 100 - editedPctClamped;
  const otherPercentSum = otherLines.reduce(
    (sum, line) => sum + (parseNum(line.weightPercent ?? '') ?? 0),
    0,
  );

  const syncedLines = lines.map((line) => {
    if (line.key === key) {
      const grams = (batch * editedPctClamped) / 100;
      return {
        ...line,
        weightPercent: formatPercent(editedPctClamped),
        weightGrams: editedPctClamped > 0 ? formatGrams(grams) : '',
      };
    }

    const oldPct = parseNum(line.weightPercent ?? '') ?? 0;
    let newPct = 0;
    if (remaining <= 0) {
      newPct = 0;
    } else if (otherPercentSum > 0) {
      newPct = (oldPct / otherPercentSum) * remaining;
    } else {
      newPct = remaining / otherLines.length;
    }

    const grams = (batch * newPct) / 100;
    return {
      ...line,
      weightPercent: formatPercent(newPct),
      weightGrams: newPct > 0 ? formatGrams(grams) : '',
    };
  });

  return {
    batchOilGrams,
    lines: fixGramRounding(syncedLines, batch, key),
  };
}

export function syncBatchTotalEdit(lines: RecipeLine[], batchOilGrams: string): RecipeLine[] {
  if (batchOilGrams === '') {
    return lines;
  }

  const batch = parseNum(batchOilGrams);
  if (batch === null || batch <= 0) {
    return lines;
  }

  const percentSum = lines.reduce(
    (sum, line) => sum + (parseNum(line.weightPercent ?? '') ?? 0),
    0,
  );
  const currentTotal = totalGrams(lines);
  let baseLines = lines;
  if (percentSum <= 0 && currentTotal > 0) {
    baseLines = syncPercentsFromWeights(lines, currentTotal);
  } else if (percentSum <= 0) {
    return lines;
  }

  const normalized = normalizePercentsTo100(baseLines);
  const scaled = normalized.map((line) => {
    const pct = parseNum(line.weightPercent ?? '') ?? 0;
    if (pct <= 0) {
      return { ...line, weightGrams: '' };
    }
    return { ...line, weightGrams: formatGrams((batch * pct) / 100) };
  });

  return fixGramRounding(scaled, batch);
}

export function addRecipeLine(
  lines: RecipeLine[],
  batchOilGrams: string,
  newLine: RecipeLine,
): SyncedRecipe {
  const batch = parseNum(batchOilGrams);
  if (batch !== null && batch > 0) {
    return {
      batchOilGrams,
      lines: [...lines, newLine],
    };
  }

  return resyncFromWeights([...lines, newLine]);
}
