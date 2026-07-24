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

/** A single oil can be at most 100% of the total (and never negative). This caps only the
 * edited line's own value — it does NOT rescale the other oils. */
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
    // Cap the edited line at 100% (an oil can't exceed the whole) and store it display-
    // rounded, so the stored percent matches the input's max and the weight-derived
    // percents' precision. Only this line is affected — siblings are never rescaled.
    const p = clampPercent(editedPct);
    if (p <= 0) {
      return { ...line, weightPercent: '', weightGrams: '' };
    }
    const grams = batch !== null && batch > 0 ? (batch * p) / 100 : null;
    return {
      ...line,
      weightPercent: formatPercent(p),
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

  // Joint rounding (largest remainder), not per-line Math.round: rounding each line
  // independently drifts the realized sum by up to ±(lines/2) g from pctSum×batch, which
  // makes some whole-gram oil totals unreachable and widens the achievable-batch
  // staircase (the "typed 2000, got 1998" report). Floor every line, then hand the
  // missing grams to the largest fractional parts, so the realized sum always equals
  // round(pctSum×batch/100) — honoring an off-100% pctSum rather than normalizing it.
  const exact = baseLines.map((line) => {
    const pct = parseNum(line.weightPercent ?? '') ?? 0;
    return pct > 0 ? (batch * pct) / 100 : null;
  });
  const targetSum = Math.round(exact.reduce((sum: number, g) => sum + (g ?? 0), 0));
  const floors = exact.map((g) => (g === null ? 0 : Math.floor(g)));
  let remainder = targetSum - floors.reduce((a, b) => a + b, 0);
  const byFraction = exact
    .map((g, i) => ({ i, frac: g === null ? -1 : g - Math.floor(g) }))
    .filter((e) => e.frac >= 0)
    .sort((a, b) => b.frac - a.frac);
  const bumped = new Set<number>();
  for (const { i } of byFraction) {
    if (remainder <= 0) break;
    bumped.add(i);
    remainder -= 1;
  }
  return baseLines.map((line, i) => {
    if (exact[i] === null) return { ...line, weightGrams: '' };
    return { ...line, weightGrams: String(floors[i] + (bumped.has(i) ? 1 : 0)) };
  });
}

/**
 * Best whole-gram oil total for a target BATCH weight. The pure ratio back-solve
 * (oil0 × target ÷ batch0) is exact only before quantization: syncBatchTotalEdit stores
 * whole grams from 0.1%-rounded percents, so neighboring oil totals realize slightly
 * different batches. Simulate the actual scaling for a few candidates around the linear
 * solve and pick the one whose realized batch (linear in realized oil — see
 * batchWeightLinearity.test.ts) lands closest to the target.
 */
export function solveOilTotalForBatchTarget(
  lines: RecipeLine[],
  targetBatchGrams: number,
  currentOilTotalGrams: number,
  currentBatchGrams: number,
): number {
  const linear = Math.round(currentOilTotalGrams * (targetBatchGrams / currentBatchGrams));
  const resynced = resyncFromWeights(lines).lines;
  let best = Math.max(1, linear);
  let bestErr = Infinity;
  for (let candidate = linear - 2; candidate <= linear + 2; candidate++) {
    if (candidate <= 0) continue;
    const scaled = syncBatchTotalEdit(resynced, String(candidate));
    const realizedOil = totalGrams(scaled);
    const predictedBatch = currentBatchGrams * (realizedOil / currentOilTotalGrams);
    const err = Math.abs(predictedBatch - targetBatchGrams);
    if (err < bestErr) {
      bestErr = err;
      best = candidate;
    }
  }
  return best;
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
