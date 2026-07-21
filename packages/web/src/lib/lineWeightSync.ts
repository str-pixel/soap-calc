import type { RecipeLine } from './recipe';

function parseNum(value: string): number | null {
  if (value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function formatGrams(n: number): string {
  return String(Math.round(n));
}

/** Percents are display-rounded to 0.1, so each stored percent can be off by up to
 * half a step. Shared by resync normalization and the percent-total warning. */
export const PERCENT_ROUNDING_EPSILON = 0.05;

function formatPercent(n: number): string {
  return String(Math.round(n * 10) / 10);
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

export type SyncedRecipe = {
  lines: RecipeLine[];
  batchOilGrams: string;
  /** Provenance of batchOilGrams: true when the user typed the total (locks it), false
   * when it was derived from line weights (follows them). Travels with lines/batch so
   * every sync path keeps the flag consistent with the value it describes. */
  batchSetByUser: boolean;
};

/** Re-derive the batch total (and each percent) from the current line weights. Used only
 * when there is no anchor total to convert against — clearing the "Total oil" field, or
 * adding a line to a recipe that has no total yet. */
export function resyncFromWeights(lines: RecipeLine[]): SyncedRecipe {
  const total = totalGrams(lines);
  const batchOilGrams = total > 0 ? formatGrams(total) : '';
  return {
    batchOilGrams,
    lines: syncPercentsFromWeights(lines, total),
    // Derived from the weights themselves — never a user-locked total.
    batchSetByUser: false,
  };
}

/**
 * Independent entry: editing one oil's WEIGHT sets only that line. Its percent is derived
 * from the batch anchor (grams ÷ total × 100); no other line is touched, so the total and
 * the sibling oils stay exactly where the user put them. When the percentages no longer
 * sum to 100 the footer flags it — the app never silently rebalances to "fix" it.
 *
 * The lye/water/property math reads each line's grams directly (see resolveLineWeights),
 * so an off-100% recipe still computes correctly against the weights actually entered.
 */
export function syncWeightEdit(
  lines: RecipeLine[],
  key: string,
  weightGrams: string,
  batchOilGrams: string,
  batchSetByUser: boolean,
): SyncedRecipe {
  const editedGrams = parseNum(weightGrams);
  const batch = parseNum(batchOilGrams);

  const nextLines = lines.map((line) => {
    if (line.key !== key) return line;
    if (editedGrams === null) {
      return { ...line, weightGrams, weightPercent: '' };
    }
    if (editedGrams === 0) {
      return { ...line, weightGrams: '', weightPercent: '' };
    }
    // Store integer grams (a 16 oz entry becomes 454 g), the app's canonical gram basis.
    const percent = batch !== null && batch > 0 ? formatPercent((editedGrams / batch) * 100) : '';
    return { ...line, weightGrams: formatGrams(editedGrams), weightPercent: percent };
  });

  return { lines: nextLines, batchOilGrams, batchSetByUser };
}

/**
 * Independent entry: editing one oil's PERCENT sets only that line. Its grams come from the
 * batch anchor (percent × total ÷ 100); the other lines' percentages are left exactly as
 * typed, so 30 / 60 / 10 stays 30 / 60 / 10. See syncWeightEdit for the off-100% behavior.
 */
export function syncPercentEdit(
  lines: RecipeLine[],
  key: string,
  weightPercent: string,
  batchOilGrams: string,
  batchSetByUser: boolean,
): SyncedRecipe {
  const editedPct = parseNum(weightPercent);
  const batch = parseNum(batchOilGrams);

  const nextLines = lines.map((line) => {
    if (line.key !== key) return line;
    if (editedPct === null) {
      return { ...line, weightPercent, weightGrams: '' };
    }
    if (editedPct === 0) {
      return { ...line, weightPercent: '', weightGrams: '' };
    }
    const grams = batch !== null && batch > 0 ? (batch * editedPct) / 100 : null;
    return {
      ...line,
      weightPercent,
      weightGrams: grams !== null && grams > 0 ? formatGrams(grams) : '',
    };
  });

  return { lines: nextLines, batchOilGrams, batchSetByUser };
}

/**
 * Editing the "Total oil" field resizes the whole batch: every line's grams is rescaled
 * from its OWN percentage against the new total, so the recipe's proportions (the
 * percentages) are preserved — the one action that intentionally moves all weights at once.
 * Percentages are NOT normalized to 100 first: if the user is mid-entry at 90%, the scaled
 * weights honor 90% rather than being silently "corrected".
 */
export function syncBatchTotalEdit(lines: RecipeLine[], batchOilGrams: string): RecipeLine[] {
  const batch = parseNum(batchOilGrams);
  if (batch === null || batch <= 0) {
    return lines;
  }

  const percentSum = lines.reduce(
    (sum, line) => sum + (parseNum(line.weightPercent ?? '') ?? 0),
    0,
  );
  // No percentages yet: seed them from the current weights so there are proportions to
  // scale. With neither weights nor percents there is nothing to resize.
  let baseLines = lines;
  if (percentSum <= 0) {
    const currentTotal = totalGrams(lines);
    if (currentTotal <= 0) return lines;
    baseLines = syncPercentsFromWeights(lines, currentTotal);
  }

  return baseLines.map((line) => {
    const pct = parseNum(line.weightPercent ?? '') ?? 0;
    if (pct <= 0) {
      return { ...line, weightGrams: '' };
    }
    return { ...line, weightGrams: formatGrams((batch * pct) / 100) };
  });
}

export function addRecipeLine(
  lines: RecipeLine[],
  batchOilGrams: string,
  newLine: RecipeLine,
  batchSetByUser: boolean,
): SyncedRecipe {
  const batch = parseNum(batchOilGrams);
  // A new line is empty, so it changes nothing yet; preserve the batch and its provenance
  // when a total exists, otherwise re-derive (which reports the batch as unlocked).
  if (batch !== null && batch > 0) {
    return {
      batchOilGrams,
      lines: [...lines, newLine],
      batchSetByUser,
    };
  }

  return resyncFromWeights([...lines, newLine]);
}
